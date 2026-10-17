# 효돌이 AI (Senior Care Agent)

**효돌이 AI**는 어르신 전용 태블릿·모바일 상시 대기형 **시니어 케어 AI PWA(Progressive Web App)** 애플리케이션입니다. 큰 글씨와 고대비 UI, 음성 대화(STT/TTS), 정시 복약 알림, 위급 상황 SOS 연결을 통해 어르신의 일상 건강과 안전을 24시간 돌봅니다.

---

## 주요 기능 (5가지)

1. **음성 아바타 말벗 (`InteractiveAvatar`)**
   - Web Speech API(STT/TTS) 기반 실시간 한국어 음성 대화 및 텍스트 채팅 지원
   - 어르신(`senior`) / 보호자(`family`) 발화자 모드 전환 및 최근 대화 이력 관리(최대 200건 자동 보존)
2. **복약 스케줄러 & 정시 알림 (`CareScheduler` / `AlarmNotifier`)**
   - 아침·점심·저녁 복약 일정 등록/삭제, 복약 완료 체크 및 일일 달성률 표시
   - 정시 음성(TTS) 알림, 미응답 시 5분 간격 재알림(최대 3회), Screen Wake Lock을 통한 상시 화면 유지
3. **일일 건강 & 기분 체크 (`HealthCheck`)**
   - 4가지 직관적인 큰 카드 버튼(`최고예요`, `보통이에요`, `몸이 아파요`, `외로워요`)으로 일일 컨디션 기록 및 음성 격려 피드백 제공
4. **비상 SOS 긴급 구조 (`EmergencySOS`)**
   - 오작동 방지를 위한 **3초 롱프레스(길게 누르기)** 발동 방식
   - 위급 상황 시 `tel:119` 119 구급대 즉시 전화 연결 및 기기에 저장된 보호자 연락처로 원터치 발신 지원
5. **멀티 LLM 연동 & 로컬 폴백 (`llm.ts`)**
   - ZAI **GLM (`glm-4-flash`)**, Google **Gemini (`gemini-2.0-flash`)**, OpenAI **GPT-4o-mini** 중 선택하여 사용자 API 키로 브라우저에서 직접 호출
   - 자연어 발화로부터 의도(`add_med`, `remove_med`, `list_meds`, `confirm_med`, `sos_check`, `health_log`, `chat`)를 구조화 추출하여 복약 등록/삭제/완료 및 SOS 호출 자동 수행
   - API 키 미설정 또는 네트워크 오류 시 정규식 기반 로컬 폴백(`localFallback`)으로 중단 없는 응답 보장

---

## 기술 스택

- **프레임워크**: React 19, TypeScript (~6.0), Vite 8
- **PWA**: `vite-plugin-pwa` (Service Worker 자동 업데이트, Standalone 매니페스트)
- **아이콘 / UI**: `lucide-react`, Glassmorphism 고대비 시니어 친화 UI
- **린트 / 테스트**: `oxlint`, `vitest`, `@testing-library/react`, `jsdom`

---

## 실행 방법

```bash
# 의존성 설치
npm i

# 개발 서버 실행 (HMR)
npm run dev

# 프로덕션 빌드 (TypeScript 타입체크 + Vite 번들링)
npm run build

# 린트 검사
npm run lint
```

---

## 테스트

`vitest`와 `jsdom` 환경에서 스토리지 안전성, 복약 단일 스토어, LLM 로컬 폴백 순수함수에 대한 단위 테스트를 실행합니다.

```bash
npm test
```

---

## 배포

- `main` 브랜치에 Push 시 GitHub Actions([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))를 통해 **GitHub Pages**로 자동 빌드 및 배포됩니다.
- PR 및 Push 시 [`.github/workflows/ci.yml`](.github/workflows/ci.yml) 워크플로우에서 Node 22 환경으로 `npm ci` → `npm run lint` → `npm run build` → `npm test` 파이프라인이 자동 실행됩니다.

---

## 아키텍처 요약

```text
src/
├── components/
│   ├── InteractiveAvatar.tsx  # 음성/텍스트 대화 아바타 및 LLM 의도 실행 허브
│   ├── CareScheduler.tsx      # 복약 일정 조회/추가/삭제/완료 UI
│   ├── AlarmNotifier.tsx      # 정시 복약 알림 모달, 재알림, WakeLock 제어
│   ├── HealthCheck.tsx        # 일일 기분/건강 상태 체크 및 히스토리
│   └── EmergencySOS.tsx       # 3초 홀드 SOS 발동 및 119/보호자 전화 연결
└── lib/
    ├── medsStore.ts           # 복약 데이터 단일 스토어 (구독/알림, 일일 리셋, 시간 정규화)
    ├── llm.ts                 # 온디바이스 LLM 호출 레이어 + localFallback 의도 분석기
    └── storage.ts             # 안전한 localStorage 래퍼 (safeGet / safeSet)
```

- **`medsStore.ts` (복약 단일 스토어)**: 모든 컴포넌트(`CareScheduler`, `AlarmNotifier`, `InteractiveAvatar`)가 단일 스토어를 구독(`subscribe`)하여 복약 상태 불일치를 방지합니다. 한국어 시간 문자열을 24시간제 `HH:mm`으로 정규화(`normalizeTime`)하고, 날짜 변경 시 복약 완료(`taken`) 플래그를 자동으로 초기화합니다.
- **`llm.ts` (온디바이스 LLM & 로컬 폴백)**: 별도 백엔드 없이 클라이언트에서 LLM API를 호출해 사용자 발화를 JSON 의도(`AgentIntent`)로 변환하며, API 키가 없거나 호출 실패 시 `localFallback` 순수함수가 핵심 명령(약 등록, 복약 확인, SOS 감지, 일상 대화)을 처리합니다.
- **`storage.ts` (`safeGet` / `safeSet`)**: `localStorage` 읽기/쓰기 시 발생할 수 있는 JSON 파싱 오류나 용량 초과 예외를 안전하게 처리하고, 손상된 데이터를 감지하면 키를 정리한 뒤 기본값(`fallback`)으로 복원하여 앱 크래시를 방지합니다.

---

## GLM 프록시 (Cloudflare Worker) 배포 — GLM 사용 시 필수

z.ai API는 브라우저 CORS를 허용하지 않아 PWA에서 GLM을 직접 호출할 수 없습니다. 저장소의 `worker/glm-proxy.ts`를 배포해 중계합니다. Gemini/OpenAI는 프록시 없이 직접 호출 가능합니다.

```bash
cd worker
npx wrangler login          # 최초 1회 브라우저 인증
npx wrangler secret put ZAI_API_KEY   # z.ai API 키 붙여넣기 (서버에만 저장)
npx wrangler deploy
# 출력된 https://senior-care-glm-proxy.<계정>.workers.dev 주소를
# 앱 설정(⚙️) → 'GLM 프록시 URL'에 입력
```

- API 키는 Worker 시크릿에만 저장되며 클라이언트로 전송되지 않습니다 (이 경우 앱의 API Key 입력은 비워도 됩니다).
- Worker는 coding/standard 양쪽 z.ai 엔드포인트를 자동 폴백합니다.
- 허용 오리진은 `worker/glm-proxy.ts`의 `ALLOWED_ORIGINS`에서 관리합니다.

## 백로그 및 향후 과제

프로젝트의 상세 개선 이력과 향후 로드맵(P0~P3 우선순위 백로그)은 [BACKLOG.md](BACKLOG.md)를 참조하세요.
