# 📋 PROJECT STATUS — wellshare-logis-web
> 자동 생성: /확인 스킬 · 갱신 2026-07-10 23:00 KST

## 식별
- GitHub: `ttong627/wellshare-logis-web` (계정 세트: **ttong627**)
- GCP/Firebase 프로젝트: `wellshare-logis` (#528541497350)
- 로컬 경로: `I:\ttong_project\wellshare-logis-web`

## 배포 환경
- 접속 URL: https://wellshare-logis.web.app → **200 OK** (2026-07-10 확인)
- 호스팅: Firebase Hosting (public: `dist`, SPA rewrites, APK 다운로드 헤더)
- 빌드: `npm run build` (루트 · Vite)
- 배포: `firebase deploy --only hosting` (firebase.json 기준)
- 커밋·푸시: main 기준 / 계정 **ttong627**
- 현재 앱 버전: **v2.15.2** (package.json)

## 앱 구성
| 앱/패키지 | 경로 | 역할 | 스택 |
|---|---|---|---|
| wellshare-logis-web | `/` | 메인 웹앱(관리자·정산·실적·통계자료·**정부양곡 명단 RosterTab**) | Vite + React + TS + Firebase |
| ecount-gateway | `/ecount-gateway` | ECOUNT ERP 전표 게이트웨이(`/ecount/sale-tms`) | Node + TS |
| functions | `/functions` | Firebase Functions (FCM 푸시 등) | Node Functions |
| wellshare-logis-mobile | `/mobile` | 기사앱·모바일(PWA·APK·Expo) | React Native / Expo |
| react-example | `/ttong` | 예제·실험(본 작업 무관) | Vite + React |
| **yanggok-collector** | `/server/yanggok-collector` | **정부양곡 명단 메일 자동수집기** — VM(tms-main-node, `ttong0627`) cron `20 */2` 상주. 토큰은 yyplus 데몬이 갱신(읽기전용 공유) | Node (mjs) |

## 마지막 작업
- `fb0f251` 2026-07-10 · feat: 정부양곡 명단 자동수집기 (yanggok-collector)
- 요약: "명단 다운로드 안됨" 신고 → 원인=7월분 미적재(6월은 1회성 수동추출). ①7월 3메일 5파일 즉시 적재 ②상시 수집기 구현·VM 배치(cron 2h, 첫 적재 6건·멱등 0건·테스트 9/9) ③본사A 토큰 이중갱신 충돌 발견·VM 재갱신 복구
- 직전 흐름: `4c1bfb5`(7/1) PWA 캐시 자동갱신 v2.15.2 ← 명단탭·allowedCompanies 시리즈

## 규칙 문서 (SSOT — 작업 전 필독)
| 문서 | 내용 |
|---|---|
| `CLAUDE.md` | ★절대규칙: Firestore 월 문서 저장은 `updateDoc` 금지 → `setDoc(..., {merge:true})` + 중첩객체 / push 전 `gh auth switch --user ttong627` |
| `server/yanggok-collector/README.md` | ★양곡 명단 자동수집 운영 SSOT: 토큰 읽기전용 원칙(이중갱신 금지)·멱등 키·노출 안전 규칙·VM 배치/cron·백필 명령 |
| `메일자동화_핸드오프.md` | (구현 완료 2026-07-10) 설계 배경·발신자 실측 시드 — 신규 발신자 추가 시 참조 |
| `prompt_plan.md` | 초기 제작 프롬프트 계획(참고용) |
| (docs/ 폴더 없음) | 도메인 규칙 문서는 아직 없음 — 메일자동화 구현 시 신설 권장 |

## 작업환경
- node v24.15.0 / npm 11.12.1 / 도구: gh✓ gcloud✓ firebase✓
- 의존성: 핵심 4앱(web·ecount-gateway·functions·mobile) **설치 OK** / `ttong`(react-example) 미설치(예제라 보류)
- 시크릿: `.env`·`.env.example`(루트) 존재 — 값 비노출·커밋 금지

## 동기화
- 상태: **최신** (main = origin/main = `4c1bfb5`, behind 0 / ahead 0)
- 워킹트리: untracked 2건(`PROJECT_STATUS.md`, `메일자동화_핸드오프.md`) — 상태·핸드오프 파일, 코드 변경 없음
- 마지막 fetch: 2026-07-10 21:32 KST

## 리스크
- 🟢 동기화: 최신(`fb0f251` push 완료) · 라이브 200 OK · v2.15.2
- 🟢 양곡 명단 자동수집: VM cron 가동(2h 주기, yyplus 20분 오프셋) · rosters 21건 전수 대조 무결 · 텔레그램 알림 연결
- 🟡 계정 함정: gh 활성계정이 세션마다 `ttong0627`로 복귀 — push 전 `gh auth switch --user ttong627` 필수(이번에도 재발)
- 🟡 ⚠️**nworks 토큰 이중갱신 금지**: 로컬에서 토큰 갱신 스크립트 실행 시 VM 액세스 토큰이 무효화됨(2026-07-10 실증·복구). 메일 작업은 VM에서만, 로컬은 읽기도 자제
- 🟡 미분류·신규지역(수원시·중원구·양평군·부천시8월 등)은 관리자 전용으로 쌓임 — 형이 명단탭에서 확인 후 담당 지정 필요
- 🟡 부천 로컬 credentials 무효(VM은 정상) — 로컬에서 부천함 접근 불가(불필요, VM이 담당)
- ⚠️ **코드 규칙(MUST)**: Firestore 월 문서 저장은 `updateDoc` 금지 → `setDoc(..., {merge:true})` + 중첩객체 (CLAUDE.md)
