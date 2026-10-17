// 효돌이 AI — GLM API CORS 프록시 (Cloudflare Worker)
// 배포: npm i -g wrangler → wrangler login → wrangler deploy
// z.ai는 브라우저 CORS를 허용하지 않아 PWA에서 직접 호출 불가. 이 Worker가 중계한다.
// 실제 API 키는 Worker 시크릿(ZAI_API_KEY)에만 두고 클라이언트엔 전달하지 않는다.
// 설정: wrangler secret put ZAI_API_KEY

const ALLOWED_ORIGINS = [
  'https://haeseoky.github.io',
  'http://localhost:5173',
];

// Coding Plan 키는 coding 엔드포인트만, 표준 키는 paas 엔드포인트만 허용됨 — 순차 폴백
const UPSTREAMS = [
  'https://api.z.ai/api/coding/paas/v4/chat/completions',
  'https://api.z.ai/api/paas/v4/chat/completions',
];

const DEFAULT_MODEL = 'glm-5.2';

export default {
  async fetch(request: Request, env: { ZAI_API_KEY?: string }): Promise<Response> {
    const origin = request.headers.get('origin') ?? '';
    const cors: Record<string, string> = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

    const key = env.ZAI_API_KEY;
    if (!key) return json({ error: 'ZAI_API_KEY secret not configured' }, 500, cors);

    let body: { model?: string; messages?: unknown[] };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid JSON body' }, 400, cors);
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: 'messages required' }, 400, cors);
    }

    let lastStatus = 0;
    let lastText = '';
    for (const upstream of UPSTREAMS) {
      const res = await fetch(upstream, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ ...body, model: body.model || DEFAULT_MODEL }),
      });
      const text = await res.text();
      if (res.ok) return json(text, 200, cors, true);
      lastStatus = res.status;
      lastText = text;
      // 인증 오류면 다른 엔드포인트 시도, 그 외는 재시도 무의미
      if (res.status !== 401 && res.status !== 403) break;
    }
    return json({ error: `upstream ${lastStatus}`, detail: lastText.slice(0, 300) }, 502, cors);
  },
};

function json(data: unknown, status: number, cors: Record<string, string>, raw = false): Response {
  return new Response(raw ? String(data) : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
