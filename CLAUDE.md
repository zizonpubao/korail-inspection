# CLAUDE.md — 프로젝트 규칙

이 프로젝트는 고속차량 점검 체크리스트에서 점검일지를 자동으로 만드는 웹앱이다.
요구사항은 항상 `SPEC.md`를 기준으로 한다. SPEC과 다르게 구현해야 하면 먼저 사용자에게 묻는다.

## 작업 방식
- 메인 세션은 계획과 조율만 하고, 실제 구현은 서브에이전트에게 맡긴다.
  - 화면: `ui-builder`
  - Supabase, Vercel 함수: `backend-engineer`
  - Teachable Machine, Gemini: `ai-integrator`
  - 점검, 보안 확인: `qa-reviewer`
  - README, 발표 요약: `doc-writer`
- 한 단계가 끝날 때마다 사용자가 브라우저로 직접 확인할 수 있게 실행 방법을 한 줄로 알려준다.
- 마감은 오늘 16:00이다. SPEC.md 8장의 우선순위를 지키고, 막히면 오래 붙잡지 말고 사용자에게 알린다.

## 코드 규칙
- 빌드 도구와 프레임워크는 쓰지 않는다. 정적 HTML/CSS/JS와 CDN 라이브러리(버전 고정)만 쓴다.
- `js/items.js`에는 데이터만 둔다. 항목을 바꿀 때 이 파일만 고치면 되게 한다.
- `js/db.js`는 저장소를 추상화한다.
  - `config.js`에 Supabase 값이 비어 있으면 localStorage 모드로 동작한다. 이 모드에서는 로그인 화면을 건너뛰고 점검자 이름을 직접 입력한다.
  - Supabase 값이 있으면 Supabase 모드로 동작한다.
- 브라우저 `alert`, `confirm`, `prompt`는 쓰지 않는다. 화면 안 모달과 토스트를 쓴다.
- 외부에서 받은 값(입력, DB, AI 응답)은 `textContent`로 넣거나 escape한다. `innerHTML`에 그대로 넣지 않는다.
- UI 문구는 한국어로 쓴다. 코드 주석은 짧게 한국어로 쓴다.

## 보안 규칙 (반드시 지킴)
- API 키, 비밀번호, service_role 키를 코드, 커밋, 출력에 쓰지 않는다.
- `GEMINI_API_KEY`는 Vercel 환경변수와 `.env.local`에만 둔다. `.env*`는 `.gitignore`에 넣는다.
- 사용자가 채팅에 키를 붙여넣으면, 파일에 쓰지 말고 환경변수로 설정하라고 안내한다.
- 실제 사내 데이터나 실제 차량 정보는 쓰지 않는다. 모든 항목과 기준치는 시연용 예시로 표시한다.

## 디자인 규칙
- 공문서와 결재 서식 톤으로 만든다. 1px 선과 표 위주로, 그라데이션·이모지·큰 그림자는 쓰지 않는다.
- 색상: Korail Blue `#005BAC`, Light Blue `#00B2E3`(포인트로만), Gray `#77777A`
- 폰트: Pretendard
- 로고는 사용자가 준 `assets/korail-logo.webp`만 쓴다. 헤더, 로그인 카드, 점검일지 상단에만 작게 넣는다. (사용자 요청으로 변경)

## 실행
- 로컬 (Gemini 제외): `index.html`을 브라우저로 열거나 `npx serve .`
- 로컬 (Gemini 포함): `npx vercel dev`
- 배포: `npx vercel --prod`
