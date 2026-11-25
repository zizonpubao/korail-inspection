# 구현 계획 (1단계 산출물)

기준 문서: `SPEC.md`, `CLAUDE.md`. 우선순위는 SPEC 8장을 그대로 따른다.
이 문서는 서브에이전트들이 서로 기다리지 않고 동시에 작업할 수 있도록 **파일 경계와 인터페이스(약속)** 를 먼저 정해 둔다.

---

## 1. 단계별 일정과 담당

| 단계 | 시간 | 담당 (동시 진행) | 산출물 | 끝났다는 기준 |
|---|---|---|---|---|
| 2. 핵심(로컬) | 13:15–14:00 | `ui-builder` ∥ `backend-engineer` → `qa-reviewer` | `index.html`, `css/style.css`, `js/items.js`, `js/app.js` / `js/db.js`(local), `js/config.js`(빈 값) | `npx serve .` → 예시 데이터 → 완료 → xlsx·PDF 한글 정상, 이력에 1건 |
| 3. TM 사진 판정 | 14:00–14:25 | `ai-integrator` | `js/ai.js`(TM 부분), app.js 연결점 | 물병 사진 → 확률 막대 + "불량으로 표시" 버튼, URL 비우면 영역 숨김 |
| 4. Supabase | 14:25–15:05 | `backend-engineer` → `qa-reviewer` | `js/db.js`(supabase 모드), 로그인 화면 연결 | 두 브라우저에서 같은 이력 조회, 남의 기록 삭제 불가 |
| 5. Vercel + Gemini | 15:05–15:30 | `backend-engineer`(뼈대·인증·vercel.json) ∥ `ai-integrator`(Gemini 호출·프롬프트·프론트) | `api/report.js`, `vercel.json`, `js/ai.js`(report/trend) | `npx vercel dev`에서 보고서 생성, 키 없을 때 규칙 문구 유지 |
| 6. 최종 점검·문서 | 15:30–15:40 | `qa-reviewer` → `doc-writer` | `README.md`, `docs/발표요약.md` | SPEC 7장 체크리스트 전부 통과 또는 사유 기재 |

- 메인 세션은 조율만 한다. 각 단계 끝에 사용자에게 브라우저 확인 방법을 한 줄로 알려준다.
- 15:10에 4단계가 안 끝나면 localStorage 모드로 시연한다. 15:30에 Gemini가 안 되면 규칙 기반 문구로 시연한다.

---

## 2. 파일별 역할과 소유자

| 파일 | 소유 | 역할 | 다른 파일과의 경계 |
|---|---|---|---|
| `index.html` | ui-builder | 화면 골격(로그인/점검/결과/이력/상세 섹션), CDN 스크립트, 모달·토스트 컨테이너 | 스크립트 로드 순서: CDN → `config.js` → `items.js` → `db.js` → `ai.js` → `app.js` |
| `css/style.css` | ui-builder | 공문서 톤, 1280px 2단 / 390px 1단, `@media print` | — |
| `js/config.js` | backend-engineer | `window.APP_CONFIG = { SUPABASE_URL:'', SUPABASE_ANON_KEY:'', TM_MODEL_URL:'' }` | 공개 가능한 값만. 비밀값 금지 |
| `js/items.js` | ui-builder | 항목·기준치 **데이터만** (`window.ITEMS`) | 함수 없음 |
| `js/app.js` | ui-builder | 화면 전환, 체크리스트 렌더, 자동 판정, 진행률, 임시저장, 엑셀·PDF·조치 문구, 이력 UI | 저장은 `DB.*`만, AI는 `AI.*`만 호출 |
| `js/db.js` | backend-engineer | 저장소 추상화 (`window.DB`) | 아래 3장 인터페이스 |
| `js/ai.js` | ai-integrator | TM 판정, `/api/report` 호출 (`window.AI`) | 2단계에서는 ui-builder가 `AI.available()=false`인 스텁을 둔다 |
| `api/report.js` | backend-engineer(인증 뼈대) + ai-integrator(Gemini 부분) | Vercel 함수 | 함수 안에서 `// --- GEMINI ---` 구역으로 나눠 충돌 방지 |
| `vercel.json` | backend-engineer | 함수 설정(최대 실행 시간 등) | — |
| `supabase/schema.sql` | backend-engineer | 이미 있음. 필요하면 사진 update 정책만 추가 | — |

모듈은 빌드 도구가 없으므로 ES module이 아닌 **전역 객체**(`window.ITEMS`, `DB`, `AI`)로 연결한다. `file://`로 열어도 동작하게 하기 위해서다.

---

## 3. 인터페이스 약속

### 3.1 `window.DB` (db.js)
모든 함수는 Promise를 돌려준다. 실패하면 `Error`를 던지고, 화면 처리는 app.js가 한다.

| 함수 | 설명 | local 모드 |
|---|---|---|
| `DB.mode` | `'local'` 또는 `'supabase'` | config 값이 비면 local |
| `DB.init()` | 클라이언트 준비, 세션 복원 | — |
| `DB.signIn(email, pw)` | 로그인 | 사용하지 않음 |
| `DB.signUp(email, pw, name)` | 가입 + `profiles` 저장 | 사용하지 않음 |
| `DB.signOut()` | 로그아웃 | 저장된 이름 지우기 |
| `DB.currentUser()` | `{ id, name, email }` 또는 `null` | `{ id:'local', name }` (이름 없으면 null) |
| `DB.setLocalName(name)` | local 모드 점검자 이름 저장 | local 전용 |
| `DB.newId()` | 점검 id 발급 (`crypto.randomUUID()`) | 동일 |
| `DB.saveInspection(record)` | 4장 레코드 저장, `{ id }` 반환 | localStorage 배열 |
| `DB.updateInspection(id, patch)` | `ai_report` 등 갱신 | 동일 |
| `DB.listInspections({ vehicle, type, q })` | 목록(요약 열만), 최신순 | 동일 |
| `DB.getInspection(id)` | 전체 레코드 | 동일 |
| `DB.deleteInspection(id)` | 본인 기록 삭제 (사진 포함) | 동일 |
| `DB.uploadPhoto(inspectionId, itemKey, blob)` | 경로 반환 `{uid}/{id}/{key}.jpg` | dataURL을 별도 키로 저장, 용량 초과 시 Error |
| `DB.photoUrl(path)` | 표시용 URL (서명 URL 1시간) | dataURL 반환 |
| `DB.accessToken()` | `/api/report` 호출용 토큰 | `null` |
| `DB.saveDraft(obj)` / `DB.loadDraft()` / `DB.clearDraft()` | 입력 중 점검 임시 저장 | 항상 localStorage |

> 에이전트 정의(backend-engineer)의 함수 목록에 `setLocalName`, `newId`, `updateInspection`, `accessToken`, `*Draft`를 **추가**한다. ui-builder 규칙("저장은 db.js로만")을 지키려면 필요하다. SPEC 변경은 아니다.

### 3.2 `window.AI` (ai.js)
| 함수 | 설명 |
|---|---|
| `AI.tmAvailable()` | 모델을 불러올 수 있으면 true. URL이 비었거나 실패하면 false (영역 숨김) |
| `AI.classify(imgOrCanvas)` | `{ top: '찌그러짐 의심', prob: 0.87, probs: { '정상':0.1, ... } }` |
| `AI.report(payload)` | `/api/report`, 20초 타임아웃, 보고서 텍스트 반환. 실패하면 Error |
| `AI.trend(stats)` | `/api/report?mode=trend` |

### 3.3 `/api/report` (Vercel 함수)
- `POST`, 헤더 `Authorization: Bearer <supabase access token>`
- 요청 본문
  - `{ mode:'report', info:{ date, inspector, vehicle, trainNo, type }, defects:[{ section, label, value, unit, criteria, urgency, memo, ai }] }`
  - `{ mode:'trend', stats:[{ label, section, count }], period:{ from, to, inspections } }`
- 응답: `200 { text }` / `401` / `502 { error }` / `504 { error:'timeout' }`
- 토큰 검증: `GET {SUPABASE_URL}/auth/v1/user` (헤더 `apikey`, `Authorization`)
- 필요한 Vercel 환경변수: `GEMINI_API_KEY`(비밀), `GEMINI_MODEL`(선택), `SUPABASE_URL`, `SUPABASE_ANON_KEY`(공개값이지만 함수가 읽어야 하므로 등록)
  - SPEC에는 Gemini 두 개만 적혀 있다. Supabase 두 값은 토큰 검증용으로 추가한다.

---

## 4. `items.js` 데이터 구조

```js
window.ITEMS = {
  version: 'demo-2026-11',
  notice: '본 점검 항목과 기준치는 공개 자료를 바탕으로 만든 시연용 예시이며 실제 정비 지침이 아닙니다.',
  vehicles: ['KTX-산천', 'KTX-청룡', 'SRT'],
  types: ['일상점검', '월상점검'],
  urgency: [
    { key: 'immediate', label: '즉시 조치', rank: 1 },
    { key: 'today',     label: '금일 내',   rank: 2 },
    { key: 'next',      label: '다음 정비 시', rank: 3 }
  ],
  // 분야 목록. 표시 순서 = 배열 순서
  sections: [
    {
      id: 'running', name: '주행장치',
      items: [
        // kind: 'check' (양호/불량/해당없음) | 'measure' (숫자 입력, 자동 판정)
        // types: 이 항목이 나오는 점검 종류. vehicles: 생략하면 전 차종
        { key: 'running_tread',   label: '차륜 답면 찰상·박리', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'running_frame',   label: '대차 프레임 균열·이물', kind: 'check', types: ['일상점검', '월상점검'] },
        // 차종별 추가 항목 예
        { key: 'running_tm_ext',  label: '동력대차 견인전동기 외관', kind: 'check', types: ['일상점검', '월상점검'], vehicles: ['KTX-청룡'] }
      ]
    },
    // ... 제동장치, 연결장치, 출입문, 집전·전기, 공조·급수, 차체·안전설비, 운전실, 동력·추진(차종별)
    {
      id: 'measure', name: '측정 항목',
      items: [
        { key: 'm_brake_lining', label: '제동 라이닝 두께', kind: 'measure', types: ['월상점검'], unit: 'mm', min: 5.0, max: null, step: 0.1, sample: 4.2 },
        { key: 'm_flange',       label: '차륜 플랜지 두께', kind: 'measure', types: ['월상점검'], unit: 'mm', min: 26.0, max: 33.0, step: 0.1, sample: 30.1 }
        // 차륜 직경 850~, 습판 8.0~, 토출압력 8.0~10.0 bar, 축전지 72~82 V
      ]
    },
    { id: 'monthly', name: '월상 세부 점검', items: [ /* 초음파 탐상, 공조 필터, 비상 개방장치, 소화기 압력, 접지장치 (types:['월상점검']) */ ] }
  ],
  // "예시 데이터 채우기"용: 불량으로 넣을 항목과 내용
  sampleDefects: [
    { key: 'body_damage',    urgency: 'today',     memo: '2호차 측면 하단 찌그러짐 약 5cm (예시)' },
    { key: 'brake_air_leak', urgency: 'immediate', memo: '3호차 대차 부근 공기 누설음 (예시)' }
  ]
};
```

규칙
- `key`는 영문 소문자·숫자·`_`만. 사진 경로(`{item_key}.jpg`)와 엑셀 행 식별에 쓰므로 **한 번 정하면 바꾸지 않는다.**
- 기준 표시는 `min`/`max`로 app.js가 만든다: `5.0 이상`, `26.0 ~ 33.0`.
- 판정: 값이 비면 미입력, `min ≤ 값 ≤ max`(null 쪽은 무시)이면 `ok`, 아니면 `defect`.
- 화면에 그릴 항목 = `sections` 중 `types`에 현재 점검 종류가 있고, `vehicles`가 없거나 현재 차종을 포함하는 항목. 항목이 0개인 분야는 숨긴다.
- `sample`은 측정 항목의 예시 입력값이다. 하나(`m_brake_lining`)만 기준치 밖 값으로 둔다.

---

## 5. 점검 레코드와 `results`(jsonb) 형식

### 5.1 레코드 (DB 열과 1:1)
```js
{
  id, user_id, inspector_name,
  inspected_on: '2026-11-25',
  vehicle_type: 'KTX-산천', train_no: '산천 12편성',
  inspection_type: '월상점검',
  results: { ...아래 },
  defect_count: 3, urgent_count: 1,
  ai_report: null,          // Gemini 보고서 텍스트 (있으면)
  created_at
}
```

### 5.2 `results`
```json
{
  "schema": 1,
  "itemsVersion": "demo-2026-11",
  "items": [
    {
      "key": "running_tread",
      "section": "주행장치",
      "label": "차륜 답면 찰상·박리",
      "kind": "check",
      "status": "ok",
      "value": null, "unit": null, "criteria": null,
      "memo": "", "urgency": null, "ai": null, "photo": null
    },
    {
      "key": "m_brake_lining",
      "section": "측정 항목",
      "label": "제동 라이닝 두께",
      "kind": "measure",
      "status": "defect",
      "value": 4.2, "unit": "mm", "criteria": "5.0 이상",
      "memo": "기준치 미달 (예시)", "urgency": "today",
      "ai": null, "photo": null
    },
    {
      "key": "body_damage",
      "section": "차체·안전설비",
      "label": "차체·전두부 손상(찌그러짐 포함)",
      "kind": "check",
      "status": "defect",
      "value": null, "unit": null, "criteria": null,
      "memo": "2호차 측면 하단 찌그러짐 약 5cm (예시)", "urgency": "today",
      "ai": { "top": "찌그러짐 의심", "prob": 0.87, "probs": { "정상": 0.08, "찌그러짐 의심": 0.87, "판정불가": 0.05 } },
      "photo": "6f1c.../9a2b.../body_damage.jpg"
    }
  ],
  "summary": { "total": 31, "done": 31, "defect": 3, "urgent": 1, "unchecked": 0 }
}
```
- `status`: `"ok"` | `"defect"` | `"na"` | `null`(미체크)
- `urgency`: `"immediate"` | `"today"` | `"next"` | `null`
- `section`, `label`, `criteria`를 **저장 시점 값으로 복사**한다. 나중에 items.js가 바뀌어도 이력 화면과 일지 재출력이 그대로 나온다.
- `items`는 배열로 둬서 화면 순서를 유지한다.
- 같은 형식을 임시 저장(draft), 엑셀·PDF, Gemini 요청 본문 생성에 그대로 쓴다.

---

## 6. 점검 완료 흐름 (app.js)

1. 미체크 수가 1 이상이면 모달: "미체크 N건이 있습니다. 그래도 완료할까요?"
2. `id = DB.newId()`로 레코드를 만든다.
3. 엑셀 → PDF 순서로 다운로드한다. 각각 실패하면 CSV(BOM) / `window.print()`로 대신한다.
   - PDF 전에 `document.fonts.ready`를 기다린다. 한글 폰트가 빠지지 않게 하기 위해서다.
   - 사진은 dataURL로 넣는다. 서명 URL은 html2canvas CORS 문제가 생길 수 있다.
4. 규칙 기반 조치 문구를 즉시 표시한다 (긴급도 순, 복사 버튼).
5. 서버 저장: 사진 업로드 → `saveInspection`. 사진 하나가 실패해도 레코드는 저장한다 (`photo:null`).
   실패하면 "서버 저장 실패, 다시 시도" 버튼을 보여준다. 재시도 때 이미 있는 사진 경로는 성공으로 본다.
6. `AI.report()`가 성공하면 문구를 바꾸고 "AI 작성" 표시를 붙인 뒤, `DB.updateInspection(id, { ai_report })`로 저장한다.
7. `DB.clearDraft()`

규칙 기반 문구 형식 (예)
```
[조치 요청] 2026-11-25 KTX-산천 산천 12편성 월상점검 (점검자 홍길동)
1. [즉시 조치] 제동장치 - 공기 누설음: 3호차 대차 부근 공기 누설음
2. [금일 내] 측정 항목 - 제동 라이닝 두께 4.2mm (기준 5.0 이상)
...
※ 시연용 예시 데이터입니다.
```

---

## 7. 외부 라이브러리 (버전 고정)
- TM 내보내기 예제와 같은 조합을 쓴다: `@tensorflow/tfjs@1.3.1` + `@teachablemachine/image@0.8.5`
- SheetJS: `cdn.sheetjs.com`의 고정 버전 (npm 레지스트리 판은 오래됐다)
- supabase-js v2, html2pdf.js, Pretendard: jsDelivr에서 **정확한 버전 번호**로 고정한다. 작업하는 에이전트가 버전이 실제로 있는지 확인한다.
- TF.js와 TM 스크립트는 무겁다. TM URL이 있을 때만 동적으로 불러온다 (`ai.js`).

---

## 8. 미리 정해 둘 결정과 위험

| 항목 | 결정 |
|---|---|
| 사진 재업로드 | `schema.sql`에 storage **update 정책이 없다**. 4단계에서 backend-engineer가 `photos update own` 정책을 추가한다. 사용자가 SQL Editor에서 그 부분만 다시 실행한다 |
| local 모드 사진 용량 | localStorage 약 5MB. 1024px JPEG 1장은 약 100–200KB. 초과하면 토스트를 띄우고 사진 없이 저장한다 |
| 화면 전환 | 해시 라우팅(`#inspect`, `#history`, `#detail/{id}`)으로 새로고침해도 같은 화면 유지 |
| 차종·종류 변경 | 입력이 있으면 모달로 확인. 확인하면 draft를 지운다 |
| 측정 불량 | 자동 불량 시 입력란을 펼치고 긴급도 기본값은 `today`. 점검자가 바꿀 수 있다 |
| AI 제안 | "불량으로 표시" 버튼만 둔다. 자동으로 판정을 바꾸지 않는다 |
| 보안 점검 | 매 단계 qa-reviewer: `grep -rniE "AIza|service_role|sk-"`, innerHTML에 외부 값이 들어가는지 확인 |

---

## 9. 사용자 할 일 (이 계획과 병행)
1. 지금: Supabase 프로젝트 생성, Vercel 가입, Gemini 키 발급 (키는 채팅에 붙여넣지 않음)
2. 2단계 동안: Teachable Machine 물병 모델 학습 → Upload my model → 링크 복사
3. 4단계 전: `supabase/schema.sql` 실행, Email "Confirm email" 끄기, Project URL과 anon key 복사
4. 5단계: Vercel 환경변수 `GEMINI_API_KEY`, `GEMINI_MODEL`(선택), `SUPABASE_URL`, `SUPABASE_ANON_KEY` 등록
