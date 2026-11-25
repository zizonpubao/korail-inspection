# Claude Code 단계별 프롬프트 (마감 16:00)

> 이 폴더에서 `claude`를 실행하고, `/agents`로 에이전트 5개가 보이는지 먼저 확인한다.
> 메인 세션 모델은 `/model opus`를 권장한다 (계획·조율). 응답이 느리면 `/model sonnet`으로 바꾼다.
> 이 파일은 연수 제출 페이지의 "프롬프트 파일" 칸에 그대로 올려도 된다.

## 내가 직접 해야 하는 것 (Claude가 못 하는 일)
| 언제 | 할 일 |
|---|---|
| 지금 바로 | Supabase 프로젝트 생성. Vercel 가입. Gemini API 키 발급 (키는 채팅에 붙여넣지 않음) |
| 2단계 동안 | Teachable Machine 학습: Image Project, 클래스 `정상` / `찌그러짐 의심` / `판정불가`, 클래스당 30~50장 → Export → Upload my model → 링크 복사 |
| 4단계 전 | Supabase SQL Editor에서 `supabase/schema.sql` 실행. Authentication > Providers > Email에서 "Confirm email" 끄기. Settings > API에서 Project URL과 anon key 복사 |
| 5단계 | Vercel 환경변수 `GEMINI_API_KEY`(내 키), `GEMINI_MODEL`(선택) 등록 |

**물병 촬영 팁**
- 정상: 멀쩡한 물병을 여러 각도와 거리에서 찍는다.
- 찌그러짐 의심: 같은 물병을 찌그러뜨려서 찍는다.
- 판정불가: 빈 책상, 손, 다른 물건을 찍는다.
- 배경과 조명은 시연할 때와 비슷하게 맞춘다.

---

## 1단계: 계획 (13:10, Plan 모드: Shift+Tab)
```
SPEC.md와 CLAUDE.md를 읽고, 8장 우선순위대로 구현 계획을 세워줘.
단계별로 어떤 서브에이전트에게 무엇을 맡길지, 파일별 역할, items.js 데이터 구조, results(jsonb) 형식을 정리해줘. 아직 코드는 쓰지 마.
```

## 2단계: 핵심 기능, 로컬 (13:15 ~ 14:00)
```
계획대로 진행해. ui-builder에게 index.html, css/style.css, js/items.js, js/app.js를 맡기고,
backend-engineer에게 localStorage 모드의 js/db.js와 빈 값의 js/config.js를 맡겨줘.
범위: 기본정보, 차종·점검 종류별 항목, 양호/불량/해당없음, 월상점검 측정값 자동 판정, 모두 양호, 진행률 막대,
불량 시 메모·긴급도·사진, 예시 데이터 채우기, 초기화, 점검 완료 시 엑셀·PDF 자동 다운로드, 조치 요청 문구 복사, 이력 화면(localStorage).
끝나면 qa-reviewer로 점검하고, 내가 브라우저에서 확인할 방법을 알려줘.
```

## 3단계: Teachable Machine (14:00 ~ 14:25)
```
ai-integrator에게 SPEC 4.4(A)를 맡겨줘. 내 모델 링크는 config.js의 TM_MODEL_URL에 넣을게: <여기에 링크>
불량 항목에 사진을 올리면 확률 막대와 "AI 참고" 표시, "불량으로 표시" 제안 버튼이 나오게 해줘.
```

## 4단계: Supabase 로그인·저장·이력 (14:25 ~ 15:05)
```
backend-engineer에게 Supabase 모드를 맡겨줘. schema.sql은 이미 실행했고, 이메일 확인은 껐어.
Project URL과 anon key는 내가 config.js에 직접 넣을게.
범위: 로그인·회원가입(이름 입력, profiles 저장), 점검 완료 시 inspections 저장, 사진 Storage 업로드, 이력 목록·상세·삭제(본인만), 서버 저장 실패 시 재시도 버튼.
끝나면 qa-reviewer로 RLS와 키 노출을 점검해줘.
```

## 5단계: Vercel 배포 + Gemini (15:05 ~ 15:30)
```
backend-engineer에게 api/report.js 뼈대(토큰 검증)와 vercel.json, .gitignore를 맡기고,
ai-integrator에게 Gemini 호출부(report/trend 모드)와 프론트 연결을 맡겨줘. 키는 Vercel 환경변수에 내가 넣을게.
npx vercel dev로 로컬 확인 후 npx vercel --prod로 배포하는 방법을 순서대로 알려줘.
```

## 6단계: 최종 점검 + 문서 (15:30 ~ 15:40)
```
qa-reviewer로 SPEC 7장 완료 기준과 보안을 최종 점검하고, 심각한 문제만 고쳐줘.
그다음 doc-writer로 README.md와 docs/발표요약.md를 작성해줘.
```

## 7단계: 녹화와 제출 (15:40 ~ 16:00)
- 시연 순서 (3분)
  1. 로그인
  2. KTX-산천 월상점검 선택
  3. 예시 데이터 채우기
  4. 측정값 기준치 초과 → 자동 불량
  5. 물병 사진 → AI 판정
  6. 점검 완료 → 엑셀·PDF 다운로드
  7. AI 보고서
  8. 다른 브라우저에서 이력 확인
- 제출
  - 코드: 프로젝트 zip (`.env*` 제외)
  - 프롬프트: 이 파일
  - 실행 결과: Vercel URL

## 시간이 밀릴 때
- 15:10에 4단계가 안 끝났으면 Supabase는 건너뛰고 localStorage 모드로 시연한다.
- 15:30에 Gemini가 안 되면 규칙 기반 문구로 시연한다.
- 핵심 기능(2단계)은 이미 완성돼 있으니, 어느 시점에서 멈춰도 시연할 수 있다.

---

## 발표용 Before / After (가정치)
- Before: 점검 1건 후처리 20분 (엑셀 재입력 10분 + 사진 정리 5분 + 보고 작성 5분) × 주 10건 ≈ **3.3시간/주**
- After: 확인·제출만 남아 건당 5분 × 주 10건 ≈ **0.8시간/주** → 약 **75% 절감**
- "주 10건"과 "건당 20분"은 가정치다. 선배에게 실제 수치를 확인하면 바꾼다.
