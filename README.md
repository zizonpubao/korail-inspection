# AI 고속차량 점검일지 자동 생성

고속차량 점검 결과를 현장 태블릿에서 입력하면 점검일지(엑셀·PDF), 불량 조치 문구, AI 조치 보고서를 만들어 주는 정적 웹앱이다.

> 점검 항목과 기준치는 공개 자료를 바탕으로 만든 **시연용 예시**다. 실제 정비 지침이 아니다.

- 데모: https://korail-inspection.vercel.app
- GitHub: https://github.com/zizonpubao/korail-inspection

## 주요 기능

- 차종(KTX-산천, KTX-청룡, SRT)과 점검 종류(일상점검, 월상점검)별 체크리스트
- 일상점검 23개 항목(육안·작동), 월상점검 28개 항목(상세 22 + 측정 6). 두 점검 종류의 항목은 겹치지 않는다.
- 측정 항목은 값을 입력하면 기준치와 비교해 자동으로 양호·불량을 판정한다.
- 불량 항목에 메모, 긴급도(즉시 조치 / 금일 내 / 다음 정비 시), 사진을 첨부한다.
- 점검 완료 후 엑셀(.xlsx, 시트 2개)과 PDF(A4 점검일지)를 결과 화면 버튼으로 내려받는다. 자동 다운로드는 하지 않는다.
- 조치 요청 문구를 규칙 기반으로 만든다. Gemini 보고서가 성공하면 그 내용으로 바꾼다.
- Supabase 모드에서는 점검 기록과 사진을 서버에 저장하고, 로그인한 팀원이 함께 조회한다.
- 정비 현황 화면: 지표 5개(직전 기간 대비 증감), 일자별·차종별·분야별·긴급도 차트, 반복 불량 상위 10, 편성별 현황, 최근 즉시조치 목록. 시연용 예시 이력을 만들고 지울 수 있다.
- Claude AI 사진 판정 보조, 조치 보고서·반복 불량 요약·정비 현황 브리핑

## 화면 구성

| 화면 | 주소 (해시) | 내용 |
|---|---|---|
| 로그인 | (기본 화면) | 이메일 로그인·회원가입. 로컬 모드에서는 이름만 입력 |
| 점검 | `#inspect` | 기본 정보, 분야별 체크리스트, 진행률 막대, 점검 완료 |
| 결과 | `#result` | 조치 요청 문구, 엑셀·PDF 다운로드, 서버 저장 상태 |
| 이력 | `#history` | 점검 기록 목록, 필터·검색, 상세, 반복 불량 분석 |
| 정비 현황 | `#admin` | 기간·차종 필터, 지표·차트·표 |

## 기술 구성

- 프론트엔드: 정적 HTML, CSS, JavaScript. 빌드 도구와 프레임워크를 쓰지 않는다.
- 외부 라이브러리(CDN, 버전 고정)
  - SheetJS 0.20.3 (엑셀)
  - html2pdf.js 0.10.2 (PDF)
  - supabase-js 2.45.4
  - Chart.js 4.4.1 (정비 현황 차트)
  - Pretendard 1.3.9 (폰트)
- 백엔드
  - Supabase: Auth(이메일/비밀번호), Postgres(RLS), 비공개 Storage 버킷 `inspection-photos`
  - Vercel 함수 `/api/report`: Supabase 토큰 검증 후 Gemini 호출 (기본 모델 `gemini-2.5-flash`)

## 폴더 구조

```
.claude/agents/          에이전트 정의 (ui-builder, backend-engineer, ai-integrator, qa-reviewer, doc-writer)
api/_gemini.js           Gemini REST 호출부 (라우트로 노출되지 않음)
api/report.js            Vercel 함수: 토큰 검증 후 보고서 생성 요청
assets/korail-logo.webp  로고
css/style.css            화면 스타일, 인쇄 스타일
css/admin.css            정비 현황 화면 스타일
docs/PLAN.md             구현 계획
docs/발표요약.md          발표용 요약
index.html               화면 골격과 스크립트 로드
js/admin.js              정비 현황 화면 (지표, 차트, 예시 이력)
js/ai.js                 AI 호출(/api/report: 사진 판정·보고서·브리핑, /api/send-journal)
js/app.js                화면 흐름, 체크리스트, 자동 판정, 엑셀·PDF, 이력
js/config.js             Supabase 공개 값
js/db.js                 저장소 추상화 (localStorage / Supabase)
js/items.js              점검 항목과 기준치 (데이터만)
supabase/schema.sql      테이블, RLS, Storage 정책
CLAUDE.md                프로젝트 규칙
PROMPTS.md               단계별 프롬프트 기록
SPEC.md                  요구사항
README.md                이 문서
vercel.json              함수 설정 (최대 실행 시간 30초)
.gitignore               .env*, node_modules/, .vercel/ 제외
```

## 실행 방법

### 1. 로컬에서 열기 (Gemini 제외)

`index.html`을 브라우저로 연다. 더 안정적으로 보려면 `npx serve .`를 쓴다.

- `js/config.js`의 Supabase 값이 비어 있으면 localStorage 모드로 동작한다. 로그인 없이 점검자 이름을 입력한다.
- Gemini 보고서는 `/api/report`가 있어야 하므로 이 방법에서는 동작하지 않는다. 규칙 기반 문구가 그대로 남는다.
- `file://`로 열면 AI 보고서 기능은 사용할 수 없다.

### 2. 로컬 + Gemini (`npx vercel dev`)

```
npx vercel dev
```

Gemini 키는 프로젝트 루트의 `.env.local`에 환경변수 이름으로 적는다. 키를 코드나 채팅에 적지 않는다. `.env*`는 `.gitignore`에 있어 git에 올라가지 않는다.

### 3. 배포

- GitHub 저장소를 Vercel 프로젝트에 연결하면 push할 때마다 자동 배포된다.
- 또는 직접 배포한다.

```
npx vercel --prod
```

배포 전에 Vercel 프로젝트의 환경변수를 등록한다 (아래 표).

## 환경변수

값은 이 문서와 코드에 적지 않는다. Vercel의 Settings > Environment Variables에서 등록한다.

| 이름 | 필수 | 용도 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 권장 (비밀) | 있으면 Claude(claude-opus-5-5)로 사진 판정·보고서·브리핑 |
| `GEMINI_API_KEY` | 선택 (비밀) | ANTHROPIC_API_KEY가 없을 때 Gemini 사용 |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | 메일 발송 시 (비밀) | 점검일지 PDF를 로그인 계정 이메일로 발송 |
| `GEMINI_MODEL` | 선택 | 모델 이름. 없으면 `gemini-2.5-flash` |
| `SUPABASE_URL` | Supabase 사용 시 | 토큰 검증 대상 주소. `NEXT_PUBLIC_SUPABASE_URL`도 읽는다 |
| `SUPABASE_ANON_KEY` | Supabase 사용 시 | 토큰 검증용 공개 키. `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`도 읽는다 |

`js/config.js`에도 Supabase URL과 공개 키를 넣는다. 이 값들은 공개용이다. service_role 키는 어디에도 쓰지 않는다.

## Supabase 설정 순서

1. Supabase에서 프로젝트를 만든다.
2. SQL Editor에 `supabase/schema.sql` 전체를 붙여넣고 Run 한다. 테이블, RLS, `inspection-photos` 버킷이 만들어진다.
3. Authentication > Providers > Email에서 **Confirm email**을 끈다.
4. Settings > API에서 Project URL과 Publishable(anon) key를 복사한다.
5. 복사한 값을 `js/config.js`의 `SUPABASE_URL`, `SUPABASE_ANON_KEY`에 넣고, Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_ANON_KEY`에도 등록한다.

이미 1~4를 실행한 뒤 사진 덮어쓰기 정책만 추가할 때는 `schema.sql`의 마지막 블록(5번)만 따로 실행한다.

## 보안 설계

- Gemini 키는 Vercel 환경변수에만 둔다. 코드에는 키 문자열이 없다.
- `/api/report`는 요청마다 Supabase 액세스 토큰을 `/auth/v1/user`에서 확인한 뒤에만 Gemini를 호출한다. 로그인하지 않은 요청은 401을 받는다.
- 사진은 Gemini에 보내지 않는다. 불량 항목의 텍스트 정보만 보낸다.
- Supabase RLS: 로그인한 사용자는 모든 점검 기록을 조회한다(팀 공유). 기록의 작성·수정·삭제는 본인 것만 가능하다.
- 사진 Storage 버킷은 비공개다. 화면에는 1시간짜리 서명 URL로 표시한다.
- 화면에 외부 값(입력, DB, AI 응답)을 넣을 때 `innerHTML`을 쓰지 않는다. `textContent`를 쓴다.
- 브라우저 `alert`, `confirm`, `prompt`를 쓰지 않는다. 화면 안 모달과 토스트를 쓴다.

## 주의

- 점검 항목과 기준치는 시연용 예시다. 실제 정비 지침이 아니다.
- AI 판정은 참고용이다. 최종 판정은 점검자가 한다. AI가 "의심"이라고 해도 항목 판정을 자동으로 바꾸지 않는다. "불량으로 표시" 버튼을 누를 때만 바뀐다.
- 시연용 물병 모델은 찌그러진 물병 샘플 3개를 모두 구분하지 못했다. 추가 학습이 필요하다.
- Gemini 보고서의 원인 설명은 추정이다. 보고서에도 추정이라고 적는다.
