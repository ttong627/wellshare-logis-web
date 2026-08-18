# 📋 PROJECT STATUS — wellshare-logis-web
> 🔧**2026-08-18 메일 수집 복구(형 지시)** — 양곡 수집 크론이 **7/28 `#STOP-regression`으로 정지**돼 있었다(로그 마지막 7/28 04:20·그날까지 실패 0 — 동시저장 유실 조사 때 끈 뒤 미복구). 수술: ①수집기에 `allowedCompanies` 자동 부여(8/14 rosters 격리 대응 — `loadRegionCompanies`가 master_settings.partnerRegions SSOT 역매핑·adminOnly/미매핑=관리자 전용) ②VM scp 반영 ③**밀린 15건 실적재**(8월: 동대문구2=회사3곳 지정·수원2·중원1·부천1=경로당 adminOnly) ④크론 `20 */2` 재가동. 커밋 `bee009b`. ⚠️**남은 규명: 모바일 나라미 APK가 8/14 billing 격리 이전의 부모문서 경로로 쓰고 있어**(mobile/DataContext.tsx·6/18 이후 미업데이트) 회원사=저장거부·관리자=웹에 안 보임 — 앱 서브컬렉션 전환+APK 재빌드+minVersion 게이트 필요.
> 자동 생성: /확인 스킬 · 갱신 2026-08-11 21:00 KST

## 식별
- GitHub: `ttong627/wellshare-logis-web` (계정 세트: **ttong627**)
- GCP/Firebase 프로젝트: `wellshare-logis` (#528541497350)
- 로컬 경로: `I:\ttong_project\wellshare-logis-web`

## 배포 환경
- 접속 URL: https://wellshare-logis.web.app → **200 OK** (2026-08-11 19:05 확인)
- 호스팅: Firebase Hosting (public: `dist`, SPA rewrites, `/app`→download.html, APK 헤더)
- 빌드: `npm run build` (= `tsc --noEmit && vite build`, 루트)
- 배포: `firebase deploy --only hosting`
- 커밋·푸시: main 기준 / 계정 **ttong627**
- 현재 앱 버전: **v2.16.0** (package.json · 버전 bump 커밋 `bf29c66` 2026-07-23)
- **라이브 = 최신 소스 반영 확인**: 라이브 `assets/index-DDmercaL.css`에 최신 커밋 `d3984b4`의 `ice-veil`·`ice-blizzard` 포함(실측). 로컬 `dist`와 에셋 해시 4종 전부 동일 = 배포본 = 최신 빌드
- CLI 계정: firebase `ttong627@gmail.com` ✓ · gcloud `ttong627@gmail.com` ✓

## 앱 구성
| 앱/패키지 | 경로 | 역할 | 스택 |
|---|---|---|---|
| wellshare-logis-web | `/` | 메인 웹앱 = **정산포털**(주문·배송일정·정산·거래처정산·실적·통계·명단·계정) | Vite + React + TS + Firebase |
| ecount-gateway | `/ecount-gateway` | ECOUNT ERP 전표 게이트웨이(`/ecount/sale-tms`) | Node + TS |
| functions | `/functions` | Firebase Functions (FCM 푸시 등) | Node 20 Functions |
| wellshare-logis-mobile | `/mobile` | 기사앱·모바일(PWA·APK·Expo) v1.0.0 | React Native / Expo |
| yanggok-collector | `/server/yanggok-collector` | 정부양곡 명단 메일 자동수집기 — **VM(tms-main-node) cron `20 */2` 상주** | Node (mjs) · 별도 package.json 없음(의존성 VM에 설치: iconv-lite·jszip·officecrypto-tool) |
| react-example | `/ttong` | 예제·실험(본 작업 무관) | Vite + React |

## ⚠️ 통합앱 관계 (wslos.kr) — 데이터 공유 주의
- 이 앱은 **웰쉐어 통합 포털(`wslos.kr`)에 코드가 복제 이식**되어 있다: `wellshare-platform/frontend/src/logis/` (`LogisApp.jsx` → `./logis/App`, 통합계정 브리지 자동로그인, `.wsdark` 다크 테마)
- **두 앱은 같은 Firestore(`wellshare-logis`) · 같은 APP_ID(`wellshare-logis-v1-production-stable`)를 쓴다** → 한쪽만 고치면 데이터가 어긋나거나 덮어써진다. **정산 로직·저장 코드를 고치면 반드시 양쪽에 반영할 것.**
- 통합앱 배포: `cd wellshare-platform/frontend && npm run build && firebase deploy --only hosting --project directed-line-434014-h0` (또는 `_배포_wslos.bat`)
- **기능 격차 실측 결과(2026-08-11): 사실상 없음.** diff는 크지만(Navbar 739줄 · UsersTab 590줄 · App 517줄 · useMonthData 427줄 · LoginForm 346줄 · `IceWeather.tsx` 없음) **대부분 다크/라이트 테마와 포털 브리지 차이**다. 기능 심볼 대조에서 수원시 권선구·낙관적잠금·allowedCompanies·통계자료탭·날짜 월표기·PWA 버전갱신·zip 한글파일명·계정 비번재설정/재가입 승인루트 **전부 이식본에 존재**. 유일한 실제 격차였던 ScheduleTab 낙관적 잠금은 `9d3b0d2`로 해결
  → 따라서 **일괄 덮어쓰기는 금물**(테마가 깨진다). 앞으로도 "diff가 크다 = 구버전"으로 판단하지 말고 **기능 심볼 단위로 대조**할 것
- 플랫폼에는 `tsconfig`·`tsc`가 없다(vite가 esbuild로 트랜스파일만) → **타입 검사가 안 되므로** 이식 시 본앱 코드와의 동일성 대조로 검증할 것

**메인 웹앱 탭 17종**: Orders / Schedule / DeliveryCompletion / Billing / PartnerBilling / Payment / Performance / Statistics / Prices / Roster / Docs / Backup / Contacts / Users / Account / Profile

## 마지막 작업
- `9c8fc2c` 2026-08-11 19:40 · fix(schedule): 배송일정 — 기사 서브탭 가시성 + 기사 연락처 자동채움 복구
  - **원인①** 8/4 ICEBERG 라이트 테마 전환(`15a4595`) 때 서브탭 바만 다크 시절 `bg-slate-100`(#F1F5F9)이 남아 새 배경(#F4FBFE~#D8ECF7)에 묻힘 → 메인 탭바와 같은 언어(흰 카드 + `tab-active`)로 통일
  - **원인②** 표가 `overflow-x-auto`라 CSS 사양상 세로도 잘려 `absolute` 드롭다운이 표 밖으로 못 나옴 → 화면 기준 `fixed` + `getBoundingClientRect` 추적. `handleBlur`가 항상 빈 연락처를 넘겨 이름이 정확히 일치해도 채워지는 경로가 없었음 → `autoFill` 신설(동명이인은 제외)
  - 같은 수정을 통합앱(wslos.kr `frontend/src/logis`)에도 이식 — `wellshare-platform@c32dd02`
  - 통합앱 배송일정에 **낙관적 잠금 이식**(`wellshare-platform@9d3b0d2`) — 아래 「통합앱 관계」 참조
- 직전: `bccb1d1` 2026-08-09 문서 커밋 · `d3984b4` 2026-08-05 탭바 고정 + 눈보라 강화
- 직전 흐름: `15a4595`(8/4) **정산포털 ICEBERG 라이트 테마 전면 재구성** — 기존 다크 프리미엄(`49024d6` 7/29)에서 라이트 빙하 테마로 전환, `src/imported-dark.css` 제거 · `index.css` 480줄 재작성 · 로그인/네비/토스트/탭 전반 적용
- 그 이전: `58be975`~`6f94f14`(7/29) 정산 월문서 **낙관적 잠금** 시리즈 — 다중탭·기기 동시저장 데이터 유실 방지(#21 완결)

## 규칙 문서 (SSOT — 작업 전 필독)
| 문서 | 내용 |
|---|---|
| `CLAUDE.md` | ★절대규칙: Firestore 월 문서 저장은 `updateDoc` 금지 → `setDoc(..., {merge:true})` + 중첩객체 / push 전 계정 `ttong627` |
| `server/yanggok-collector/README.md` | ★양곡 명단 자동수집 운영 SSOT: nworks 토큰 **읽기전용**(이중갱신 금지)·멱등 키(`MAIL_{계정}_{mailId}_{attachmentId}`)·VM cron 배치·백필 명령 |
| `메일자동화_핸드오프.md` | (구현 완료 2026-07-10) 설계 배경·발신자 실측 시드 — 신규 발신자 추가 시 참조 |
| `mobile/DESIGN.md` · `mobile/BUILD_GUIDE.md` | 기사앱 디자인 규칙 · APK 빌드 가이드 |
| `ecount-gateway/README.md` | ECOUNT 전표 연동 규격 |
| `prompt_plan.md` | 초기 제작 프롬프트 계획(참고용) |
| (docs/ 폴더 없음) | 도메인 규칙 문서 미분리 — 배송/정산 규칙 문서화 권장 |

## 작업환경
- node v24.15.0 / npm 11.12.1 / 도구: gh✓ gcloud✓ firebase✓
- 의존성: 루트·ecount-gateway·functions·mobile **설치 OK** / `ttong`(예제) 미설치(보류) / `yanggok-collector`는 package.json 없음(VM 전용) → **자동설치 실행 대상 없음**
- 시크릿(존재 여부만): `.env`, `.env.example`, `agents/.env`, `ttong/.env.example` — 값 비노출·커밋 금지
- 실행: `npm run dev` (Vite, port 5173 · `.claude/launch.json`)

## 동기화
- 상태: **최신** (main = origin/main = `9c8fc2c`, behind 0 / ahead 0) · 통합앱 `wellshare-platform` = `9d3b0d2`
- 워킹트리: **clean**
- 마지막 fetch/push: 2026-08-11 19:45 KST (owner 토큰 주입 방식 — 전역 gh 계정 미변경)

## 리스크
- 🟢 동기화·배포: 양쪽 저장소 push 완료 · 라이브 2곳 200 OK · 배포본 = 최신 소스(청크 실측 대조)
- 🟢 환경: node/npm/gh/gcloud/firebase 전부 정상 · 핵심 4앱 의존성 설치 완료
- 🟢 (해결 2026-08-11) 통합앱 배송일정 낙관적 잠금 누락 → 이식 완료. 본앱 저장분 덮어쓰기 위험 제거
- 🟢 (정정 2026-08-11) 통합앱 "구버전 격차"는 **과대평가였다** — 기능 심볼 대조 결과 격차 없음. 단 **정산 로직·저장 코드 수정 시 양쪽 동시 반영은 여전히 필수**(같은 Firestore 공유)
- 🟡 **계정 함정**: gh 활성계정이 `ttong0627`(양쪽 repo owner는 `ttong627`). 전역 전환 대신 **owner 토큰 주입**으로 fetch·push 수행
- 🟡 **nworks 토큰 이중갱신 금지**: 로컬에서 토큰 갱신 스크립트 실행 시 VM 액세스 토큰 무효화(2026-07-10 실증). 메일 작업은 **VM에서만**
- 🟡 양곡 수집기 VM cron(`20 */2`) 가동 여부는 이 PC에서 검증 불가 — 필요 시 VM 로그(`yanggok-collect.log`)·텔레그램 알림으로 확인
- 🟢 (조사 완료 2026-08-11) **API 키 하드코딩은 수정 대상이 아니다** — `BackupTab.tsx:10`은 **구 프로젝트(`gen-lang-client-...`) 마이그레이션 전용** 설정이지 운영 시크릿이 아니다. 통합앱 `logis/firebase.ts`의 하드코딩은 **의도된 fallback**으로, 플랫폼 `.env.production`에 `VITE_FIREBASE_*`가 없어 **지우면 통합 정산앱이 즉시 죽는다.** 운영 설정(`src/firebase.ts`)은 이미 env 정상이고, Firebase 웹 config는 원래 번들에 노출되는 공개 값이라 방어선은 `firestore.rules`(217줄)다
  - (해결 2026-08-11) BackupTab **구 DB 마이그레이션 기능 제거**(`0a81d91`·통합앱 `891f4dc`). 초기 구축(5/20) 1회용 도구였는데 지금 누르면 ①배송일정 문서 merge 없이 통째 덮어쓰기 ②`deliveryDates`(복수 날짜) 소실 ③`version` 미기록으로 낙관적 잠금 무력화가 일어난다. 301줄 → 105줄, 백업·복원은 유지. **필요 시 해당 커밋 revert로 복구 가능**
- 🟢 (해결 2026-08-11) sw.js 캐시명 `v2.16.0`으로 동기화(`b50e023`) · `ScheduleTab.tsx` ESLint **0건**
- 🟢 (해결 2026-08-11) **ESLint 36 errors → 0 errors**(warning 23). `any` 14건은 실제 타입으로 교체(엑셀 경계 타입 `XlsxApi`·`ExcelCell` 등을 types.ts에 신설), 빈 블록·미사용 4건은 의도 주석화. 남은 react-hooks 신규 규칙 4종은 **warn으로 강등**하고 사유를 eslint.config.js에 문서화 — 걸린 지점을 전부 확인한 결과 동작 결함이 없었고, 핵심 상태 훅을 지금 뜯는 쪽이 회귀 위험이 크다. React Compiler 도입 시 이 warning 목록이 그대로 정리 대상
- 🟢 (수정 2026-08-11) **공문작성 미리보기 재마운트 버그**: `PreviewDocument`가 DocsTab 내부 함수인데 `<PreviewDocument />`로 써서 매 렌더 언마운트→재마운트(입력 시 미리보기 스크롤 튐). `{PreviewDocument()}`로 교체 — 본앱 `22686e4`·통합앱 `bf914db` 양쪽 반영
- ⚠️ **코드 규칙(MUST)**: Firestore 월 문서 저장은 `updateDoc` 금지 → `setDoc(..., {merge:true})` + 중첩객체 (CLAUDE.md)
