// 온디바이스 LLM 호출 레이어 - 서버 없이 사용자가 입력한 API 키로 직접 호출
// 지원: ZAI GLM, Google Gemini, OpenAI
import { medsStore } from './medsStore';
import { safeGet, safeSet } from './storage';

export type LLMProvider = 'glm' | 'gemini-flash' | 'openai-gpt4o';

export interface LLMSettings {
  provider: LLMProvider;
  apiKey: string;
  /** GLM 전용 프록시 URL (Cloudflare Worker 등). z.ai는 브라우저 CORS 차단으로 직접 호출 불가 */
  glmProxyUrl?: string;
}

const SETTINGS_KEY = 'senior_care_llm_settings_v2';

/** GLM 엔드포인트 후보 — Coding Plan 키는 coding 엔드포인트만, 표준 API 키는 paas 엔드포인트만 허용되므로 401/403 시 순차 폴백 */
const GLM_ENDPOINTS = [
  'https://api.z.ai/api/coding/paas/v4/chat/completions',
  'https://api.z.ai/api/paas/v4/chat/completions',
] as const;

/** GLM 기본 모델 — glm-4-flash는 은퇴. glm-5.2는 단편 응답에 적합 */
export const GLM_DEFAULT_MODEL = 'glm-5.2';

export function loadLLMSettings(): LLMSettings {
  const s = safeGet<Partial<LLMSettings>>(SETTINGS_KEY, {});
  // 구버전 키 마이그레이션
  if (!s.provider) {
    const old = localStorage.getItem('senior_care_model');
    const oldKey = localStorage.getItem('senior_care_apikey');
    s.provider = old === 'gemini-flash' || old === 'openai-gpt4o' ? old : 'glm';
    s.apiKey = oldKey ? safeGet<string>('__noop__', '') : s.apiKey;
    if (oldKey) {
      try { s.apiKey = JSON.parse(oldKey); } catch { s.apiKey = oldKey; }
    }
  }
  return { provider: (s.provider as LLMProvider) || 'glm', apiKey: s.apiKey || '' };
}

export function saveLLMSettings(s: LLMSettings) {
  safeSet(SETTINGS_KEY, s);
}

async function callChat(settings: LLMSettings, system: string, user: string): Promise<string> {
  const { provider, apiKey } = settings;
  if (!apiKey) throw new Error('NO_API_KEY');

  if (provider === 'glm') {
    // z.ai는 브라우저 CORS 차단 → 프록시 URL이 있으면 프록시 경유, 없으면 직접 시도(개발 환경용)
    const urls: string[] = settings.glmProxyUrl
      ? [settings.glmProxyUrl]
      : [...GLM_ENDPOINTS];
    let lastErr: unknown = null;
    for (const url of urls) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: GLM_DEFAULT_MODEL,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            temperature: 0.6,
          }),
        });
      } catch (e) {
        lastErr = e; // 네트워크 오류 → 다음 엔드포인트 시도
        continue;
      }
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? '';
      }
      lastErr = new Error(`GLM API ${res.status} (${url.includes('/coding/') ? 'coding' : 'standard'} 엔드포인트)`);
      // 인증/권한 오류(401/403)는 다음 엔드포인트로 폴백, 그 외(모델 오류 등)는 재시도 무의미
      if (res.status !== 401 && res.status !== 403) break;
    }
    throw lastErr instanceof Error ? lastErr : new Error('GLM API 모든 엔드포인트 실패');
  }

  if (provider === 'openai-gpt4o') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.6,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  // gemini-flash
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: { temperature: 0.6 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── 의도 추출 (LLM 함수 호출 역할) ──────────────────────────────

export interface AgentIntent {
  action: 'chat' | 'add_med' | 'remove_med' | 'list_meds' | 'confirm_med' | 'sos_check' | 'health_log';
  speaker: 'senior' | 'family';
  medication?: { name: string; time: string; dosage?: string };
  searchKeyword?: string;
  mood?: 'good' | 'normal' | 'sick' | 'lonely';
}

const INTENT_SYSTEM = `너는 어르신 돌봄 앱 '효돌이 AI'의 의도 분석 엔진이다. 사용자 발화를 분석해 반드시 아래 JSON 형식으로만 답하라. 다른 설명 금지.

{"action":"chat|add_med|remove_med|list_meds|confirm_med|sos_check|health_log","speaker":"senior|family","medication":{"name":"약이름","time":"HH:mm","dosage":"선택"},"searchKeyword":"삭제 검색어","mood":"good|normal|sick|lonely","reply":"어르신/보호자에게 할 2문장 이내 존댓말 답변"}

규칙:
- speaker: 발화자가 어르신 본인이면 "senior", 보호자/자녀의 말투(어르신을 3인칭으로 언급, 등록해주세요 등)면 "family". 애매하면 "senior".
- add_med: 복약 등록 요청. 약 이름을 발화에서 추출(당뇨약, 혈압약, 영양제 등). 시간은 "아침"→08:00, "점심"→12:30, "저녁"→19:00 기본, 발화에 시각 언급 시 그 시간(HH:mm 24시간제). 정보가 부족하면 action을 "chat"로 하고 reply에서 시간을 되묻는다.
- remove_med: 약 삭제/중단 요청. searchKeyword에 약 이름.
- list_meds: 복약 목록/스케줄 확인 요청.
- confirm_med: 약을 먹었다는 보고.
- sos_check: 몸이 아프다, 어지럽다, 긴급 등 건강 이상 호소.
- health_log: 기분/컨디션 표현(좋다/보통/아프다/외롭다).
- reply는 항상 존댓말, 따뜻하고 간결하게(2문장 이내).`;

export interface IntentResult {
  intent: AgentIntent;
  reply: string;
}

export async function processUtterance(
  settings: LLMSettings,
  text: string,
  seniorName: string,
): Promise<IntentResult> {
  const medsList = medsStore.get().map(m => `- ${m.name} (${m.time})`);
  const user = `어르신 성함: ${seniorName}\n현재 등록된 복약 목록:\n${medsList.join('\n') || '없음'}\n\n사용자 발화: "${text}"`;

  const raw = await callChat(settings, INTENT_SYSTEM, user);
  // JSON 부분만 추출 (마크다운 코드펜스 등 대응)
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM_RESPONSE_PARSE');

  const parsed = JSON.parse(match[0]);
  const intent: AgentIntent = {
    action: parsed.action ?? 'chat',
    speaker: parsed.speaker === 'family' ? 'family' : 'senior',
    medication: parsed.medication,
    searchKeyword: parsed.searchKeyword,
    mood: parsed.mood,
  };
  return { intent, reply: parsed.reply ?? '' };
}

// ── 로컬 폴백 (API 키 없음/실패 시) ──────────────────────────

export function localFallback(text: string, seniorName: string): IntentResult {
  const lower = text.trim();
  const medMatch = lower.match(/(아침|점심|저녁|오전|오후)?\s*(\d{1,2})\s*시/);

  if (/등록|추가|챙겨줘|설정/.test(lower) && /약|복약/.test(lower)) {
    let time = '19:00';
    if (/아침|오전/.test(lower)) time = '08:00';
    else if (/점심|낮/.test(lower)) time = '12:30';
    if (medMatch) {
      let h = parseInt(medMatch[2], 10);
      if (/오후|저녁|밤/.test(lower) && h < 12) h += 12;
      time = `${String(h).padStart(2, '0')}:00`;
    }
    let name = '새 약';
    if (/당뇨/.test(lower)) name = '당뇨약';
    if (/혈압/.test(lower)) name = '혈압약';
    if (/관절/.test(lower)) name = '관절약';
    if (/영양/.test(lower)) name = '영양제';
    return {
      intent: { action: 'add_med', speaker: 'senior', medication: { name, time } },
      reply: '',
    };
  }
  if (/아파|어지러|쓰러|구급|비상/.test(lower)) {
    return { intent: { action: 'sos_check', speaker: 'senior' }, reply: '' };
  }
  if (/약.*먹었|복약.*했|다 먹었/.test(lower)) {
    return { intent: { action: 'confirm_med', speaker: 'senior' }, reply: '' };
  }
  if (/안녕|반가/.test(lower)) {
    return { intent: { action: 'chat', speaker: 'senior' }, reply: `${seniorName} 어르신, 안녕하십니까! 오늘 하루도 평안하시길 바랍니다.` };
  }
  if (/몇 시|시간/.test(lower)) {
    const now = new Date();
    return { intent: { action: 'chat', speaker: 'senior' }, reply: `현재 시각은 ${now.getHours()}시 ${now.getMinutes()}분입니다.` };
  }
  return {
    intent: { action: 'chat', speaker: 'senior' },
    reply: `${seniorName} 어르신, 말씀을 잘 들었습니다. 늘 곁에서 들어드리겠습니다.`,
  };
}
