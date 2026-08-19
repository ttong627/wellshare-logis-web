# 📋 PROJECT STATUS — wellshare-logis-web
> 자동 생성: /확인 스킬 · 갱신 2026-08-19 (규칙 수술 반영)

## 🔧 2026-08-18 모바일 저장 실패 수술 (형 지시: "폰·탭·패드 웹 저장 안 됨 철저 수정")
**근본 원인 = "8/14 격리 규칙·부모필드 제거 이후에도 구 저장경로(부모 문서 직접 쓰기)를 실행하는 클라이언트"** — 3갈래:
1. **본앱 구세션**: 8/14 배포 때 sw.js 캐시명이 v2.16.0 그대로 → SW 갱신 미발동 → 폰·태블릿의 살아있는 구세션이 구코드 실행 → 회원사 저장 거부. → **v2.16.1 bump로 해결·배포 완료**(`7941a31`, 병행 세션). ecountSales 쓰기도 billing_admin으로 라우팅(발행 직후 증발 수술 + 부모 재유입 보안구멍 봉합, 부모 9건→billing_admin 회수·동대문구 복구 완료).
2. **wslos.kr 통합앱 미이식**: 플랫폼 logis가 8/14 격리 시리즈 전체 미이식 — DeliveryCompletion·PartnerBilling·Payment·Performance 4탭이 부모 직접 setDoc(회원사=거부, 관리자=본앱에 안 보이는 곳에 저장), RosterTab 전체질의(규칙에 통째 거부→명단 빈 화면), 열람기록 부재. → **이번 세션에서 이식 완료·배포 완료**(`eaeb7c0`+`9b67e02`): useMonthData·usePeriodStats·AppContext·BackupTab·accessLog 본앱과 바이트 동일화, 4탭 saveField 라우팅(자기 회사 슬라이스)+서브독 deleteField, RosterTab array-contains 질의+logRosterAccess, StatisticsTab 시그니처. 테마(ws-grad→인라인)·ExcelCell(any)은 플랫폼 고유분으로 보존. 라이브 실측: `LogisApp-DIJssJ4o.js`에 billing_admin 포함 ✓
3. **나라미 모바일 APK**: `mobile/DataContext.tsx`가 6/18 이후 미업데이트로 부모문서 경로에 쓰던 문제. → **해결·배포 완료(8/19 00:40, `7d4c488` v1.0.14)**: 읽기=부모(공통)+회사별 4필드 실시간 구독(관리자=서브컬렉션 전체·회원사=자기 서브독만·미마이그레이션 월 부모 폴백), 쓰기=서브독 setDoc(merge)+웹 동일 메타(`_company`·`_month`), 취소=서브독 deleteField(not-found 통과), saveOrder 점표기 키→중첩 객체 교정. 모바일 tsc 0에러 · APK versionCode 15 · **구배포본과 서명 지문 SHA-256 동일 실측**(기존 앱 위 업그레이드 설치 가능) · 호스팅 배포 후 라이브 APK 80,654,810바이트 일치 실측 · **`settings/app_version` minVersion=1.0.14 상향** → 전 기기(전부 1.0.13·게이트 내장) 실시간 차단→인앱 자가 업데이트. APK 파일은 8/14부터 git 미추적(.gitignore)·호스팅 전용 배포.

4. **(8/19 추가 발견) 새 달 규칙 함정**: 7월 마감 직후 8월 부모 문서가 생기기 전, 서브독 쓰기 규칙의 isClosed 조회 `get()`이 **문서 없음 = 평가 에러 = 거부**가 되어 회원사 저장(배송완료·실적·발행완료)이 클라이언트 불문 전멸 — 관리자는 isAdminUser 단락 통과라 관리자 테스트로는 안 보였다. → **`!exists` 가드로 수술·규칙 배포 완료**(`1c4b0c3`). rules-test.py 회귀 14케이스 추가, RED(3건 get 에러 재현)→GREEN **35/35** 시뮬레이터 실측. 규칙은 3클라이언트 공유라 배포 1회로 전부 복구. 매달 초 재발하던 구조 종결.

주의: wslos에는 SW가 없어 **열려 있던 폰 탭은 새로고침 1회** 해야 신코드가 뜬다(본앱은 v2.16.1 SW가 자동 새로고침, APK는 게이트가 강제 업데이트).

## 식별
- GitHub: `ttong627/wellshare-logis-web` (계정 세트: **ttong627**)
- GCP/Firebase 프로젝트: `wellshare-logis` (#528541497350)
- 로컬 경로: `I:\ttong_project\wellshare-logis-web`

## 배포 환경
- 접속 URL: https://wellshare-logis.web.app → **200 OK** · 라이브 sw `v2.16.1` 실측(2026-08-18 20:5x)
- 호스팅: Firebase Hosting (public: `dist`, SPA rewrites, `/app`→download.html, APK 헤더)
- 빌드: `npm run build` (= `tsc --noEmit && vite build`, 루트) / 배포: `firebase deploy --only hosting`
- 커밋·푸시: main 기준 / 계정 **ttong627** (owner 토큰 주입 — 전역 gh 계정 전환 금지)
- 현재 앱 버전: **v2.16.1** (sw 캐시명 동기)
- CLI 계정: firebase `ttong627@gmail.com` ✓ · gcloud `ttong627@gmail.com` ✓

## 앱 구성
| 앱/패키지 | 경로 | 역할 | 스택 |
|---|---|---|---|
| wellshare-logis-web | `/` | 메인 웹앱 = **정산포털**(주문·배송일정·정산·거래처정산·실적·통계·명단·계정) | Vite + React + TS + Firebase |
| ecount-gateway | `/ecount-gateway` | ECOUNT ERP 전표 게이트웨이(`/ecount/sale-tms`) | Node + TS |
| functions | `/functions` | Firebase Functions (FCM 푸시 · rosterWatch 명단 이상감시) | Node 20 Functions |
| wellshare-logis-mobile | `/mobile` | 기사앱·모바일(PWA·APK·Expo) v1.0.14 — 격리 이식 완료(8/19) | React Native / Expo |
| yanggok-collector | `/server/yanggok-collector` | 정부양곡 명단 메일 자동수집기 — VM cron `20 */2` **재가동(8/18)** · allowedCompanies 자동 부여(`bee009b`) | Node (mjs) |
| react-example | `/ttong` | 예제·실험(본 작업 무관) | Vite + React |

## ⚠️ 통합앱 관계 (wslos.kr) — 데이터 공유 주의
- `wellshare-platform/frontend/src/logis/`에 복제 이식(통합계정 브리지·`.wsdark` 다크 테마). **같은 Firestore·같은 APP_ID** → **저장 로직 수정 시 반드시 양쪽 반영**.
- 통합앱 배포: `cd wellshare-platform/frontend && npm run build && firebase deploy --only hosting --project directed-line-434014-h0`
- **저장 핵심 5파일(useMonthData·usePeriodStats·AppContext·BackupTab·accessLog)은 2026-08-18부터 본앱과 바이트 동일** — 이후 본앱 수정 시 통째 복사가 안전. 탭 파일은 테마 차이가 있으므로 기능 심볼 단위 이식.
- ⚠️8/11의 "기능 격차 사실상 없음" 평가는 **틀렸었다** — 4탭이 saveField 리팩터(7/29) 미이식 상태로 부모에 직접 쓰고 있었다. "격차 없음" 결론은 저장 경로까지 대조한 뒤에만 내릴 것.
- 잔여 기존 격차(기능 무관·보류): RosterTab 업로드 표준 파일명(`standardRosterFileName`, 형 규칙 7/26) 플랫폼 미이식 — wslos에서 명단 업로드 시 파일명 표준화 안 됨.

**메인 웹앱 탭 17종**: Orders / Schedule / DeliveryCompletion / Billing / PartnerBilling / Payment / Performance / Statistics / Prices / Roster / Docs / Backup / Contacts / Users / Account / Profile

## 마지막 작업 (2026-08-18~19)
- 본앱 `0bea341`·플랫폼 `a7774a0`(본 세션): **첫 화면 no-cache 헤더 교정 + v2.16.2/1.4.2 — 폰 구탭 강제 갱신 발동**
- 본앱 `1c4b0c3`(본 세션): **새 달 규칙 exists 가드 + rules-test 회귀 14케이스(35/35)** — 규칙 배포 완료
- 본앱 `7d4c488`(본 세션): **나라미 APK billing 격리 이식(v1.0.14) + 게이트 상향 — 3원인 완결**
- 본앱 `7941a31`(병행 세션): ecountSales 저장을 billing_admin으로 + v2.16.1 + 데이터 회수(부모 9건 이식·동대문구 복구·부모 잔재 제거) — **배포 완료**
- 본앱 `bee009b`·`99542b0`(병행 세션): 양곡 수집기 allowedCompanies 자동 부여·크론 재가동·밀린 15건 적재
- 플랫폼 `eaeb7c0`·`9b67e02`(본 세션): **8/14 격리 시리즈 wslos 이식 + 본앱 동일화 — 배포 완료**
- 직전 8/14 시리즈: 명단 PII 회사격리(`d77160e`)·열람기록/이상감시(`6b30978`)·billing 서브컬렉션 격리 완성(`f23d4bd`~`019365c`)
- **격리 구조 SSOT**: 회사별 4필드(`partnerInputs`·`deliveryDates`·`publishDates`·`publishRequests`)=`billing_records/{월}/{필드}/{회사}` 서브독(write는 서브독에만, 없으면 read 폴백), 공통 필드=부모, `ecountSales`=`billing_admin/{월}`(read·write 모두)

## 규칙 문서 (SSOT — 작업 전 필독)
| 문서 | 내용 |
|---|---|
| `CLAUDE.md` | ★절대규칙: 월 문서 저장 `updateDoc` 금지 → `setDoc(merge)`+중첩객체 / push 전 계정 `ttong627` |
| `src/hooks/useMonthData.ts` 헤더 주석 | ★billing 회사별 격리 구조 SSOT — 서브컬렉션 경로·폴백·write 규칙 |
| `server/yanggok-collector/README.md` | ★양곡 수집 운영 SSOT: nworks 토큰 읽기전용·멱등 키·VM cron·백필 |
| `메일자동화_핸드오프.md` | 설계 배경·발신자 시드(구현 완료 2026-07-10) |
| `mobile/DESIGN.md` · `mobile/BUILD_GUIDE.md` | 기사앱 디자인 규칙 · APK 빌드 가이드 |
| `ecount-gateway/README.md` | ECOUNT 전표 연동 규격 |

## 작업환경
- node v24.15.0 / npm 11.12.1 / gh✓ gcloud✓ firebase✓ · 핵심 4앱 의존성 설치 OK
- 시크릿(존재 여부만): `.env`, `.env.example` — 값 비노출·커밋 금지
- 실행: `npm run dev` (Vite, port 5173)

## 동기화
- 본앱: main = origin/main = `7941a31`+docs · 워킹트리 clean
- 플랫폼: main = origin/main = `9b67e02` · clean · **미push 9건도 이번에 push 완료**(89ea86a..9b67e02)
- 마지막 fetch/push/배포: 2026-08-19 00:45 KST (owner 토큰 주입) · 본앱 `7d4c488`(모바일 수술)까지 push·호스팅 배포 완료
- ⚠️**병행 세션 주의(8/18 실증)**: 다른 PC/세션이 같은 파일을 고쳐 push하는 일이 실제로 있었다(ecountSales 중복 수정 → 원격판 채택). **push 전 fetch로 diverge 확인** 습관화.

## 리스크
- 🟢 (해결 2026-08-19) **나라미 APK 격리 이식 완료** — v1.0.14 배포·게이트 상향으로 전 기기 강제 자가 업데이트. 3원인 전부 종결
- 🟡 (완화 2026-08-19) **폰 구탭 고착**: 원인="첫 화면 / 요청이 1시간 캐시 + 가드 이전 좀비 탭". 조치: 전역 no-cache 헤더(양쪽 실측 확인)·본앱 v2.16.2 SW 갱신·플랫폼 1.4.2 배포로 UpdateGate(8/11 이후 탭)·SW(v2.15.2 이후 탭) 보유 탭 전부 자동 새로고침 발동. **잔여: 가드 이전 좀비 탭만 "탭 닫고 새로 열기" 1회 안내 필요**
- 🟡 **발행요청 취소 merge 잔존 의심(양쪽 공통)**: PaymentTab `handleClearPublishRequest`가 whole-map saveField(merge) — merge는 삭제된 키를 못 지워 취소가 서브독에 안 남을 수 있음(화면은 지워져 보이나 재로드 시 부활 가능). 실측 후 서브독 deleteField로 교정 검토
- 🟡 계정 함정: gh 활성 `ttong0627` ↔ owner `ttong627` — 토큰 주입 방식 유지
- 🟡 nworks 토큰 이중갱신 금지(메일 작업은 VM에서만) · 양곡 cron 가동은 VM 로그로 확인
- 🟢 2026-07 마감됨(isClosed=true, 8/18 20:50 형 처리) — 회원사 7월 저장 차단은 규칙상 정상 동작
- 🟢 회원사 저장 실증: (주)한울 deliveryDates 서브독 저장 성공(8/18 14:52, 본앱 신코드)
- ⚠️ **코드 규칙(MUST)**: 월 문서 `updateDoc` 금지 → `setDoc(merge)` / billing 회사별 필드 write는 서브독에만 / ecountSales는 billing_admin에만
