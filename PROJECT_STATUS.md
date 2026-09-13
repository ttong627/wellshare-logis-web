# 📋 PROJECT STATUS — wellshare-logis-web
> 자동 생성: /확인 스킬 · 갱신 2026-09-10 10:19 KST (동기화 최신 0/0 · 라이브 v2.19.0 실측)

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
- 접속 URL: https://wellshare-logis.web.app → **200 OK** · 라이브 sw `v2.19.0` 실측(2026-09-10 10:19) = HEAD 와 일치
- 호스팅: Firebase Hosting (public: `dist`, SPA rewrites, `/app`→download.html, APK 헤더)
- 빌드: `npm run build` (= `tsc --noEmit && vite build`, 루트) / 배포: `firebase deploy --only hosting`
- 커밋·푸시: main 기준 / 계정 **ttong627**
  - ⚠️**push 하면 곧바로 라이브로 나간다** — `.github/workflows/deploy.yml` 이 `on: push: branches:[main]`. "커밋만 하고 배포는 나중에" 가 성립하지 않는다(hosting 만 배포 · functions·규칙은 건드리지 않음)
  - ⚠️**push 권한 함정(2026-09-10 실측)**: gh 활성 계정이 `ttong0627` 이면 이 repo 는 `permissions.push = false` 다. repo 가 **public** 이라 fetch·clone 은 아무 계정으로나 되므로 **fetch 성공은 push 권한의 증거가 아니다**. push 직전에 둘 중 하나:
    ① `gh auth switch --user ttong627` (프로젝트 `CLAUDE.md` 의 지침 — 가장 확실)
    ② owner 토큰 주입 `GH_TOKEN=$(gh auth token --user ttong627) git -c credential.helper='!gh auth git-credential' push` (전역 활성 계정을 안 건드려 다른 세션·자동 pull 과 안 부딪힌다)
- 현재 앱 버전: **v2.19.0** (package.json ↔ `public/sw.js` CACHE 일치 실측 · CI 는 배포 전 **두 값이 같은지만** 검사한다(`deploy.yml` 71~86행) — 즉 **bump 를 안 해도 CI 는 통과**한다. bump 가 필요한 진짜 이유는 CI 가 아니라 **SW 캐시명 갱신**(폰·태블릿 구세션 고착 방지)이다 — `1f66487`) (sw 캐시명 동기 — `public/sw.js` CACHE 는 수동 동기다. 배포 시 반드시 함께 올릴 것) · **테마: 한가위 HARVEST MOON 확정**(가을·추석 — 2026-08-19 전면 교체+8차 다듬기, ICEBERG 대체)
  - 최종 장면: **달 뜨는 저녁의 단풍 공원** — 밝은 어스름 황혼 바탕 + 반투명(50%) 수채 공원 씬(능선·단풍/은행나무·달빛 산책로·가로등·기러기) + 또렷한 상아빛 보름달 + 은은한 반딧불. 카드=등불 대비
  - 낙엽: 당단풍(왕·진홍 그라디언트)/은행(순노랑 부채)/넓은단풍(주황금)/갈잎 4종 SVG, 크기 3계층 원근(10~48px), 몸통 하강+::after 진자(leafSway) 이중 타이밍, 잎별 색조 변주. 12~26초 간격 소량(잔잔)
  - 형 피드백 이력(재발 방지 주석 박제): 태양 오해→은상아 원판+무맥동 / 베일 기둥 금지 / 단풍 골 깊으면 폭죽 / 은행 윗변 오목하면 초승달 / 고만고만하면 티끌 / 흙색은 한국 가을이 아니다
  - 상단바 = 한가위 밤 파노라마(잔별·크레이터 보름달·밤구름·능선·억새·기러기·잔낙엽). 테마 SSOT=index.css(그라디언트 --grad-1/2/3), 기상=AutumnWeather.tsx. **wslos(다크 테마)는 이식 금지 유지**
- CLI 계정: firebase `ttong627@gmail.com` ✓ · gcloud `ttong627@gmail.com` ✓ (⚠️gcloud 활성 **프로젝트**는 `wssc-nutrition` — 다른 프로젝트다. 이 repo 배포는 `.firebaserc` 기본값 `wellshare-logis` 를 쓰므로 무해하나, `gcloud` 로 직접 리소스를 건드릴 땐 `--project wellshare-logis` 를 붙일 것)

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

**메인 웹앱 탭 17종** (`src/components/tabs/*.tsx` 17개 실측 — 이전 문서의 "18종" 은 오기였다): Orders / Schedule / DeliveryCompletion / Billing / PartnerBilling / Payment / **Settlement(입금대사)** / Performance / Statistics / Prices / Roster / Docs / Backup / Contacts / Users / Account / Profile

## 마지막 작업 (최신 = 2026-09-02)
- 본앱 `2fc093a`(2026-09-02 20:35): **[문서] 탭 CI 공문 서식 3종 추가 (v2.19.0)** — 사회적협동조합·로지스·희망나르미 경기본부. 로고·직인 이미지 6장(`public/docs/`)과 `CiDocument.tsx`(261줄 신규)를 붙이고 `DocsTab`·`types.ts` 확장. package.json·sw.js 동시 bump → 라이브 v2.19.0 배포 완료 실측
- 본앱 `1f66487`(2026-08-26): CI 에 **버전 일치 검사** 추가 — `package.json` ↔ `public/sw.js` 가 어긋나면 배포 전에 멈춘다(구세션 고착 재발 방지)

### 이전 이력 (2026-08-18~19)
- 본앱 `19e6db8`~(2026-08-25): **[입금대사] 탭 신설 + Hosting 자동배포 CI (v2.17.8→v2.18.0)** — 홈택스·이카운트·은행 엑셀 3종을 브라우저에서 대사해 입금/미입금·미수금 Aging·엑셀 리포트 산출. 대사 규칙 6종(완전일치·오차허용·합산·분할·순차충당·금액만일치), 신뢰도 낮으면 [확인 필요]로 사람 판단에 넘김. 홈택스↔이카운트 교차검증(장부 미입력/세금계산서 미발행 의심)까지. **엔진은 외부 라이브러리 0개** — xlsx(ZIP+XML)를 DecompressionStream 으로 직접 읽고 리포트는 CRC32·ZIP 헤더를 직접 만든다(package.json 의존성 무변동). **Firestore·Storage 미사용** — 파일도 결과도 서버로 안 간다(규칙 변경 불필요). 본사 전용(`visible: isAdmin`). lazy 청크 71kB(gzip 22kB). CI(`.github/workflows/deploy.yml`)는 시크릿(ENV_FILE + FIREBASE_TOKEN|SERVICE_ACCOUNT) 등록 전까지 배포 전에 멈춘다 — 절차 = `docs/배포_설정.md`. ⚠️wslos 미이식(저장 로직이 없어 데이터 동기화 이슈는 없음 — 필요하면 탭 파일만 이식)
- 본앱 `cecf53c`~`870016b`(본 세션): **한가위 가을 테마 전면 교체+8차 다듬기(v2.17.0→v2.17.8)** — 위 배포환경 테마 항목 참조. 전 기기 SW 자동 갱신
- 본앱 `cecf53c`(본 세션): **한가위 가을 테마 전면 교체(v2.17.0)** — 군밤·감·단풍 그라디언트, 보름달+반딧불, 낙엽 기상(AutumnWeather), sky/blue 유틸 계절 재매핑(25컴포넌트 무수정), 배포·라이브 실측 완료. ⚠️wslos는 다크 테마 독립 — 테마 이식 금지 원칙 유지
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
- node v24.15.0 / npm 11.12.1 / gh✓ gcloud✓ firebase✓ · 핵심 4앱 의존성 설치 OK (이 PC: ecount-gateway·mobile 2026-08-20 자동 설치)
- 시크릿(존재 여부만): `.env`, `.env.example` — 값 비노출·커밋 금지
- 실행: `npm run dev` (Vite, port 5173)

## 동기화
- 본앱: main = origin/main = `2fc093a` · **behind 0 / ahead 0 = 이미 최신**(2026-09-10 10:19 fetch, owner 토큰 주입 — 전역 gh 계정 전환 안 함)
- 워킹트리: **미커밋 2건** — `src/index.css` (+12/-2) · `PROJECT_STATUS.md`(이 문서 자체). index.css 는 — 형 지적 "글자 뭉개짐" 수술. `-webkit-font-smoothing: antialiased` 를 **2dppx 이상 고해상도에서만** 켜도록 미디어쿼리로 가둠(Windows 1x 모니터에서 ClearType 이 꺼져 한글이 흐려지던 문제). **아직 커밋·배포 안 됨 → 라이브에는 반영 없음**
- 이 PC(I:) 2026-08-20: behind 47 → FF-only 최신화 완료 · 유실 0
- 마지막 fetch: 2026-09-10 10:19 KST · 마지막 커밋: 2026-09-02 20:35
- ⚠️**병행 세션 주의(8/18 실증)**: 다른 PC/세션이 같은 파일을 고쳐 push 하는 일이 실제로 있었다. **push 전 fetch 로 diverge 확인** 습관화

## 리스크
- 🟢 **(2026-09-13 형 「모두 고」) 코코 보안 지적 H2·H3·M2 처리**
  - **H3 AWS(609890503948)**: IAM 사용자 `wssc-admin`(AdministratorAccess) 키 생성·검증 후 **루트 액세스키 삭제**(RootKeys 0 · 루트 MFA 켜짐). 이 PC `~/.aws` 프로필 `wssc` = wssc-admin. **CloudTrail `wssc-trail`** 전 리전·로그파일 검증, 버킷 `wssc-cloudtrail-609890503948`(퍼블릭 차단·AES256·버전관리·365일 만료), 첫 전달 14:52 오류 없음
  - **M2 게이트웨이 실행 계정**: 기본 compute SA(프로젝트 Editor) → `ecount-gateway-sa`(`datastore.user`·`firebaseauth.viewer` + 시크릿 3개 읽기만). 1회용 Job 으로 Firestore 읽기·쓰기·삭제 200, 다른 시크릿 403 확인 후 교체. 기본 SA 의 시크릿 3개 권한 제거
  - **H2 인증된 이메일만 관리자**:
    - 익명 로그인 끔(가입 시도 `ADMIN_ONLY_OPERATION`). 익명 계정 24개는 2026-04 이후 활동 0이라 남김
    - 관리자 5명(ttong@wssc.kr·ttong627@gmail.com·goodp1@hanmail.net·hb@hbnanum.com·thsduddn@wssc.kr, 동적 관리자 3명 포함) **전원 미인증이었다** → 형 결정(휴면 2명도 유지)으로 **15:01 KST 인증 처리**
    - 게이트웨이 `src/authz.ts`: 토큰 미인증이면 `getUser` 로 현재 계정(삭제·정지·이메일 변경·미인증) 재판정 — 인증 처리 직후 옛 토큰으로 잠기지 않게. `verifyIdToken(tok, true)` 로 정지·폐기 토큰도 차단. 테스트 11건, 리비전 **00006-crb**(커밋 `ce76e90`·`f71e63f`). 배포 명령은 `ecount-gateway/README.md` 형태만(`--service-account` 명시, `--set-*` 금지)
    - 규칙 `firestore.rules` isAdminEmail·isDynamicAdmin / `storage.rules` isAdminEmail 에 `email_verified == true`(회원사 판정은 현행 유지). **16:08 KST 배포**(인증 처리 15:01 + 66분 대기). ruleset firestore `88cef7e3-7f85-4c96-b47e-459d2e07af85` · storage `867893b4-8d7a-4e32-835f-a0562348b0ad`. 배포본 시뮬레이터 41/41
    - ↩️**되돌리기**: 이전 ruleset firestore `fdec162f-1978-41cf-9dc8-220ffac872f6` · storage `1f3d5598-1f65-45e3-ad75-61a1f7b12b6a` (콘솔 규칙 이력에서 복원, 또는 `git show <이전 커밋>:firestore.rules` 로 재배포)
    - ✏️정정: 동적 관리자(hb·goodp1·thsduddn)는 **Firestore 규칙에서만** 관리자다 — `storage.rules` 에는 동적 관리자 판정이 원래 없어 hb·thsduddn 은 `rosters_admin` 명단 읽기·명단 업로드 불가(이번 변경 전후 동일)
    - ⏸️**실발행 증거 대기**: 새 게이트웨이를 끝까지 통과한 발행(POST 200)이 아직 0건 — 형 발행 1건 후 로그로 확인
    - 🔁**코난 재점검(규칙 배포 뒤)으로 H2 재개 — 우회로 1곳 + 오류 표시 1곳**
      - ①Cloud Function `adminSetPassword` 가 호출자 **이메일 문자열만** 보고(인증 여부 무시) **누구 비밀번호든** 바꿨다 → 규칙·게이트웨이를 막아도 이 함수로 최고 관리자 비밀번호를 바꿔 발행 권한을 가져갈 수 있었다. 고침: `functions/adminGuard.js`(인증된 이메일만 호출자 인정 · **관리자 계정(하드코딩·동적)은 대상 거부** · 동적 관리자 목록 조회 실패 시 `unavailable` 로 막음 — 빈 목록으로 넘기면 대상 제한이 풀린다). 테스트 `functions/test/adminGuard.test.js` 6건. ⚠️관리자 계정 비밀번호는 이제 회원사 관리 화면으로 못 바꾼다 — 본인이 「계정」 탭 비밀번호 변경(`AccountTab.tsx` updatePassword) 또는 로그인 화면 「비밀번호 찾기」(`LoginForm.tsx` 재설정 메일)
      - ②게이트웨이 `verifyIdToken` 실패를 전부 401 「토큰 검증 실패」로 보내 권한·네트워크·할당량 오류가 재로그인 반복으로 보였다. 고침: `classifyVerifyError` — 정지·폐기 401 `token_revoked` · 조회 실패 502 `auth_lookup_failed`(실행계정 토큰 발급 실패 `app/invalid-credential` 포함) · 나머지 401. 테스트 14건. 에러 코드 문자열은 firebase-admin 13.10.0 원문과 대조(제시)
      - ③(제시 보충) 게이트웨이 발행 관리자 5명 중 hb·thsduddn 은 이 함수에선 **동적 관리자일 뿐**이라, 다른 동적 관리자가 partnerAccounts 에서 ADMIN 을 빼면 회원사로 보여 비밀번호를 바꿀 수 있었다 → `functions/index.js` `GATEWAY_ADMIN_EMAILS` 를 대상 보호 목록에 넣음. ⚠️**게이트웨이 env `ADMIN_EMAILS` 를 바꾸면 이 목록도 같이 바꾼다**
      - ④(코난 재검증 · Codex 17,049토큰 · Codex 「배포 불가」/코난 「조건부」) **대소문자만 다른 중복 키로 대상 보호가 풀렸다** — `{admin@x:ADMIN, Admin@x:회원사}` 를 한 객체로 합치면 마지막 값이 이겨 키 순서에 따라 보호가 사라짐(코난 `node -e` 실측). 호출자도 소문자로 맞춰 봐서 **규칙이 인정하지 않는 사람까지** 관리자로 받았다. 고침: 호출자는 규칙과 **똑같이 정확한 문자열**, 대상은 대소문자만 다른 키 중 **하나라도 ADMIN 이면 거부**, 빈 대상 거부, 조회된 계정의 실제 이메일(`userRecord.email`)로 한 번 더 검사. 테스트 9건
      - ⑤(코난) 게이트웨이 오류 분류를 **반전** — 502 목록을 늘려 가면 빠진 코드(`auth/invalid-credential` 등)가 또 401 로 샌다 → 401 은 토큰 문제로 확인된 코드(`id-token-expired`·`argument-error`·`invalid-id-token`)와 정지·폐기·삭제(`user-disabled`·`id-token-revoked`·`user-not-found`)만, 나머지는 전부 502
      - ⑥(제시 재검증 보충) 구글 공개키 조회 실패도 firebase-admin 이 `argument-error` 로 바꿔 던져 401 「인증 만료」로 보였다(수정 전부터) → 메시지(`Error fetching public keys`·`Error while making request`)로 가려 502. 테스트 15건, 네트워크 문구를 빼면 실패하는 것 확인(Red-Green)
      - 제시 실측: 관리자 5명의 Auth 저장 이메일·partnerAccounts ADMIN 키 3개 모두 소문자 정확 일치, 대소문자만 다른 중복 키 0 → 호출자 정확 비교로 잠기는 관리자 없음
      - 🚀**배포(2026-09-13 17시 KST)**: `adminSetPassword` 리비전 **00002-cor**(이전 00001-win, 2026-07-23) — 로그인 없이 401 「로그인이 필요합니다」, 가짜 토큰 401 · 게이트웨이 리비전 **00007-95w**(이전 00006-crb, `--service-account ecount-gateway-sa` 명시, env·시크릿 플래그 없음)
      - ⚠️**functions 런타임 Node.js 20 은 2026-10-30 폐지** — 그 뒤엔 `adminSetPassword`·`sendPushOnNotification`·`rosterAlert` 를 **고쳐도 배포할 수 없다**(배포 경고 2026-09-13). `firebase-functions` 도 구버전 경고. 10월 중 Node 22 로 올리고 배포 확인 필요
      - 확인: `users` 컬렉션 문서 0개 → 규칙의 `ROLE_ADMIN`·`ROLE_EDITOR` 판정은 쓰이지 않는 옛 흔적(계정 없음)
      - 남김(보충): 회원사 관리 화면에서 관리자 행에도 「비번설정」 버튼이 보인다(`UsersTab.tsx:205`, wslos 사본 같은 줄) — 누르면 서버 거부 메시지가 모달에 뜬다. 버튼 숨김은 두 앱 배포가 필요해 다음 화면 작업 때
  - ⚠️**남는 위험**: 회원사 6곳 전부 미인증 + 자가가입 화면 → 앞으로 추가될 회원사 이메일은 먼저 가입해 선점 가능(회원사 인증 메일 흐름 필요) · wslos.kr SSO 는 통합계정 이메일 일치로 정산 토큰 발급(신뢰가 wslos 이메일 관리에 걸림) · `wssc-admin` MFA 없음·키 평문 · 코코 M1(서버키 권한 범위·PHP 로그인만 하면 발행)·M3(S3 업로더 GetObject)·LOW 는 이번 범위 밖 · 운영 `ALLOWED_ORIGINS` 에 `http://localhost:5173` 남음 · ECOUNT 키 시크릿이 `:latest`(버전 미고정) · `/ecount/sale-tms` 는 TMS 폐기로 항상 500(죽은 경로, 코드 정리 필요) · (코난 2026-09-13) **기본 compute SA 가 아직 프로젝트 Editor**(Cloud Functions 가 이 계정으로 돈다 — 게이트웨이만 전용 SA 로 뺐다) · 인증 메일 보내는 흐름(`sendEmailVerification`) 없음 → 새 동적 관리자는 콘솔에서 인증 처리해야 관리자 권한이 생긴다 · `firestore.rules` 의 안 쓰는 `users`/`ROLE_ADMIN` 규칙과 로그인만 하면 쓸 수 있는 `settings`·`drivers`·`officialDocs`(코난 판단 Low)
  - 🧪**규칙 검증 근거**: 배포본 원문 = 작업본(firestore 88cef7e3 조건 2곳 · storage 867893b4 조건 1곳) · Firestore 배포본 시뮬레이터 41/41 · Storage 시뮬레이터 새 규칙 9/9 vs 이전 규칙 6/9(미인증 관리자 3건이 뚫리던 것을 막음)
- 🟢 **(2026-09-13) ECOUNT 게이트웨이를 이 앱 프로젝트(`wellshare-logis`)로 이전** — 형 원칙「프로젝트는 독립 운영」
  - 새 주소 `https://ecount-gateway-528541497350.asia-northeast3.run.app` · NAT 고정 IP **`34.64.142.198`**(`ecount-gw-ip`/`ecount-gw-router`/`ecount-gw-nat`) · **형이 ECOUNT 두 법인(631989·156855)에 IP 추가 등록 완료(2026-09-13)**
  - 인증키 시크릿 10개 이관(쓰는 건 `ecount-key-ttong`→`ECOUNT_KEY_631989`, `ecount-key-156855-ttong`→`ECOUNT_KEY_156855`) · 환경변수는 `ALLOWED_ORIGINS` 에서 TMS 두 주소 제거, `TMS_FIREBASE_PROJECT_ID` 제거(선택값이라 부팅 영향 없음)
  - `ecount_sales` 34건 이관 · 전환 직전 옛/새 재대조 **34=34, 차이 0**(9/10 이후 옛 게이트웨이 발행 없음)
  - 앱 v2.19.2 에서 기본 주소 전환 — **라이브 실측**: CI run 34729959901 success · sw `v2.19.2` · `BillingTab-1yePmXJ5.js` 새 주소 1건/옛 주소 0건(CI `ENV_FILE` 이 기본값을 덮지 않음 확인)
  - **바깥 IP 실측**: wellshare-logis 에 같은 VPC egress 설정의 1회용 Cloud Run Job(curl ipify)을 띄워 `34.64.142.198` 확인 후 삭제
  - ⚠️**옛 게이트웨이 입구 닫기 미완(권한 차단)** — 옛·새가 멱등성 저장소(`ecount_sales`)를 **각자 프로젝트 DB 에** 따로 쓴다(`idempotency.ts` 의 `new Firestore()`). 새로고침 안 한 탭(`useMonthData.ts:123` 이 월 문서를 `getDoc` 한 번만 읽음)이나 **APK(`mobile/src/lib/ecountGateway.ts:6` 옛 URL 고정, ecountSales 미사용)** 가 옛 쪽으로 `force=false` 발행하면 새 쪽은 몰라서 **전표 두 장**. ⇒ `gcloud run services update ecount-gateway --project gen-lang-client-0075547354 --region asia-northeast3 --ingress internal` 로 닫고(되돌리기 `--ingress all`) 닫은 뒤 `ecount_sales` 재대조
  - 첫 실발행 전: 정산 화면 띄워 둔 탭 전부 새로고침 · APK 에서 발행 금지(OTA 전) · 「이미 발행됨」 없는 지역 하나로 확인. 502 면 재클릭 전에 로그 `ecount saveSale failed` 부터
- 🟢 **(2026-09-13 14:01 KST 삭제 완료) logis-TMS(`gen-lang-client-0075547354`) — 옮길 것 옮기고 보관한 뒤 철거. 복구 기한 2026-10-13**
  - 삭제 직전 가드: ecount_sales 34=34 차이 0 · 옛 게이트웨이 발행 성공 0건(10:05 이후) · 형이 ECOUNT 두 법인에서 옛 IP 34.64.190.54 제거 확인
  - **삭제 후 실측**: 새 게이트웨이 200 · 프리플라이트 `wellshare-logis.web.app`·`wslos.kr` 204 · 구 PHP→새 게이트웨이 400(인증 통과) · 옛 게이트웨이 500 · **ECOUNT 실로그인 두 법인 모두 세션 발급**(1회용 Cloud Run Job, egress 34.64.142.198, 전표 없음, Job 삭제) · 사이트 wellshare-logis·wslos.kr·admin.wslogis.co.kr 200
  - 참고: 옛 호스팅 `gen-lang-client-0075547354.web.app`·`wellshare-tms-app.web.app` 는 삭제 직후에도 200(구글이 삭제 프로젝트 자원을 순차 정리) — DB·게이트웨이는 이미 끊겨 기능 없음
  - 아래는 삭제 전 경위 기록
  - Cloud Monitoring 주별 Firestore 쓰기: 8/16 29만 · 8/23 29.6만 · 8/30 30.3만 · 9/6 30.5만 · 9/13 26.4만(진행 중). 읽기도 주 10~35만
  - `orders`·`entry_exit`·`entry_exit_detail` 최신 수정이 **정각+2초**(예 2026-09-11T05:00:02Z) → 외부 크론 동기화. `_sync_metadata`·`syncdeltatofirestore` 는 7/14 이후 멈춤이라 **그것과 다른 쓰기 주체**
  - 창고 TMS(`tms-local-frontend`, `wellshare-tms-app.web.app` 200)의 `.firebaserc` 가 여전히 이 프로젝트. 형 설명: TMS 는 AWS 로 통합, 동기화는 몰라도 불필요
  - 창고 TMS 의 이카운트 발행(`tms-local-frontend/src/services/ecountApi.js:12`)은 옛 프로젝트의 `tms---` 태그 주소를 부르고, 서버키 경로(`/ecount/sale-server`, 리비전 00014-cip)도 **옛 프로젝트에만** 있다. 새 게이트웨이는 `TMS_*` 설정이 없어 sale-tms 500 · sale-server 503
  - ⇒ 지우려면 ①쓰기 주체(외부 크론) 중지 ②TMS 웹앱 실사용자 없음 확인 ③새 게이트웨이 실발행 확인 ④TMS 발행·서버키 경로를 안 쓰는지 확인(쓴다면 AWS 쪽으로 이관) 뒤
  - **(2026-09-13 진행)** 쓰기 주체 확정·중지: AWS `3.37.252.125` 의 **pm2 프로세스 `ws-sync`**(`/home/ubuntu/sync/sync_to_firestore.cjs`, 7/14~, 2시간마다 3,740건). 9/9 세션은 crontab 만 봐서 놓쳤다. `pm2 stop/delete ws-sync && pm2 save --force` 로 끔(되돌리기: `cd /home/ubuntu/sync && pm2 start sync_to_firestore.cjs --name ws-sync && pm2 save`)
  - 백업 로컬 보관: `T:\TTong_total\_cloud_archive\logis-TMS_gen-lang-client-0075547354_20260913\` — db-backups 61·images 4·migbackup-20260726 38·mirror-daily-20260908 37(원격과 개수 일치, 최신 DB gzip OK) + ai-studio DB + Auth 사용자
  - **제시 FAIL(삭제 보류) — 남은 의존**: ①wslos.kr 라이브 번들 `LogisApp→BillingTab` 가 옛 게이트웨이, `SettlementTabs→ClientBilling` 가 `tms---` 태그 주소, `GenlangApp`(`?view=genlang`) 이 이 프로젝트 Firebase ②`mobile/src/lib/ecountGateway.ts:6` 옛 주소 ③AWS PHP `/var/www/html/admin/ecount_config.php:3` 옛 주소(서버키 경로, 새 게이트웨이엔 `TMS_SERVER_KEY` 없음) ④9/11 16:04 genlang 사용자 토큰 갱신 + 그 오후 읽기 약 10만 ⑤이 프로젝트 Gemini 키 = `D:\Gemma4\.env` `GEMINI_API_KEY_6`(tongtong_studio 순환키) ⑥감시 오경보: `wellshare-platform/backend/app/services/monitor.py:41,45`·`_wellshare-hub/_tools/healthcheck.sh:19` ⑦삭제 후 `backup_db.sh` 로그가 계속 「local + GCS」로 거짓 기록
  - **(2026-09-13 형 결정·실행) 남은 의존 처리** — 계획서 `~/.claude/plans/logis-tms-teardown-20260913.md`
    - ①wslos.kr: 정산 발행 → 새 게이트웨이, genlang 모듈 82파일 삭제, CSP 새 주소, 기본 감시 3곳 제외, 버전 1.22.1 (wellshare-platform `5b1e538` + 뒷정리 커밋)
    - ②모바일 `ecountGateway.ts` 새 주소 커밋 `a8ba1e1`(다음 APK 빌드 반영)
    - ③구 PHP 관리자: `ecount_config.php` → 새 게이트웨이 + **새 서버키**(Secret `ecount-server-key`, 해시 앞 be8d91541e8a). 옛 PHP 키는 게이트웨이 키와 원래 불일치(6414… ≠ 69e6…)였다. 서버발 빈 요청 400(인증 통과·전표 없음). 옛 키 백업 `.bak` shred 삭제
    - ④새 게이트웨이: `ALLOWED_ORIGINS` 에 `https://wslos.kr`·`https://directed-line-434014-h0.web.app` 추가, `TMS_SERVER_KEY` 연결(리비전 00002-gws). wslos 프리플라이트 204
    - ⑤구 원장 DB 바깥 백업 → **AWS S3** `wslogis-db-backup-609890503948`(ap-northeast-2, 퍼블릭 차단·버전관리·AES256). IAM `wslogis-backup-uploader`(List/Put/Get 이 버킷만 + **발신 IP 3.37.252.125/32 조건**), 키는 서버 `/root/.aws`(600)만. 서버에 aws CLI v2 설치. `backup_db.sh`·`archive_images.sh` S3 로 교체(원본 `.bak_20260913115454`) — 실행 확인 「local + S3」, 기존 GCS 백업 61개 S3 업로드. ⚠️`aws s3 ls` 는 `--only-show-errors` 를 받지 않는다(첫 교체 때 확인 단계가 거짓 실패) → `AWSLS` 분리
    - ⑥헬스체크 `wellshare-hub/_tools/healthcheck.sh` gen-lang 줄 삭제 `2bce938`
    - ⑦12:00 KST 이후 Firestore 쓰기 0 확인(마지막 10:08 구간 3,740)
    - ⑧로컬 예약작업 `WellshareMirrorAudit`(비활성) 등록 해제, `mirror_audit.py` 삭제
    - ⑨ Gemini 키: 형이 권한 모드 전환 후 제거 — `gemini_api_keys.txt` 10→9개, `.env` `GEMINI_API_KEY_6` 줄 삭제(둘 다 `.bak_20260913_logisTMS` 백업). 번호순으로 읽는 코드 없음 확인
    - ⑩ 삭제 전 추가 보관(코난 조건): `(default)` DB 관리형 내보내기(서울 버킷) · ai-studio DB 관리형 내보내기(**대만 버킷 필요** — 서울 버킷은 `INVALID_ARGUMENT`) · Auth 해시 설정(SCRYPT, signerKey 등)·`firebase auth:export` 12명 · AI Studio 앱 `ttong`(v91)·`wellshare`(v2) 빌드본. 보관본 **195파일** 로컬 + S3 `s3://wslogis-db-backup-609890503948/archive-logis-TMS-20260913/` 사본 195 일치
    - ⑪ 이 PC `I:\ttong_project\wellshare-platform` 체크아웃을 `cbce27d` 로 ff-merge(옛 판에서 배포하면 genlang·옛 게이트웨이가 되살아남). 다른 세션 미커밋 8개 보존. 작업용 워크트리·브랜치 정리
    - ⑫ 형 확인(2026-09-13): 창고 TMS 안드로이드 앱(`com.wellshare.tms`, `server.url` = 이 프로젝트 `/mobile`) 안 씀 · AI Studio 앱 필요 없음
  - ✏️**정정**: ①「9월 사용자는 형 본인뿐」 → 형 두 계정(9/11·9/9) 외에 **8/19·8/18 두 계정**이 마지막 사용 ②「백업 원격과 개수 일치」는 **받은 폴더끼리만** — `gen-lang-0075547354-db-backup` 원격 1,127개(일일 미러 약 40회분) 중 migbackup·최신 mirror 두 폴더만 보관(최신본 있음) ③wslos 청크 전수는 73개(제시 재집계 75)
  - ⚖️**삭제 전 판정**: 제시 보충필요(삭제 막을 사유 없음) · 코난 조건부(Codex 10,751토큰 — Codex 원판정은 「막힘」, 코난 이견: Expo 앱·MySQL 복원은 삭제 차단 사유 아님). 조건 = **ECOUNT 두 법인에서 옛 IP `34.64.190.54` 를 삭제 전에 제거**(반납 IP 재할당 위험 + 옛 게이트웨이 발행 경로 차단)
  - 🔁**삭제 후 제시 보충 처리(2026-09-13)**: ①서버키가 검증 도구 출력에 한 번 찍힘 → `ecount-server-key` **v2 발급·게이트웨이 리비전 00003-46s 에 `:2` 고정·PHP 설정 교체**(해시 앞 8b48794d 일치), 옛 v1 요청 401 확인 후 **v1 비활성** ②AWS `3.37.252.125` 옛 프로젝트 자격증명 정리: `/home/ubuntu/sync/.env`(ECOUNT 키 평문)·`serviceAccountKey.json` shred, gcloud 옛 SA 인증 ubuntu·root 모두 revoke, `~/.gsutil` 삭제(크론 참조 0) ③이 PC `D:\Gemma4\_secrets\gen-lang-client-0075547354-firebase-adminsdk-…json` 삭제, `secrets_manifest.json` 항목 제거(백업 `.bak_20260913`), GCS 공유 버킷 사본 없음
  - ⏸️**남은 것**: ①wslos 운영 DB 감시 행 3개(`gen_lang`·`wellshare_tms`·`wellshare_erp`) — `ensure_targets` 가 빠진 기본 대상을 다시 채우므로 **DEFAULT_TARGETS 를 뺀 백엔드(플랫폼 main `cbce27d` 이후 커밋)가 Cloud Run `wellshare-platform-api` 에 배포된 뒤** 지운다(백엔드 버전 번호는 0.1.0 고정이라 번호로 판단 불가 — 배포 리비전의 이미지·커밋으로 확인) ②모바일 앱 새 주소 빌드(`a8ba1e1` 반영) ③~~`ecount-gateway/README.md` 옛 프로젝트 배포 명령~~ → 2026-09-13 새 프로젝트·전용 SA 기준으로 다시 씀 ④옛 호스팅 두 곳이 삭제 직후 아직 200 — 며칠 뒤 404 확인 ⑤S3 로 바꾼 백업의 **첫 정기 실행 = 2026-09-14 02:00 KST** → 다음 날 `backup.log` 「local + S3」 확인 · `archive_images.sh` 실제 S3 이관은 395일 넘는 사진이 생기는 2026-12 이후 첫 실행(같은 cp+ls 확인 절차는 임시 파일로 성공 확인) ⑥**(2026-09-13 발견) 철거 누락 — wslos.kr 서버 쪽 genlang 잔재**: 화면 genlang 82파일만 지우고 서버를 놓쳤다. `wellshare-platform/backend/app/core/firebase_minters.py:18`(`firebase_genlang`→`FIREBASE_SA_GENLANG`)·`providers.py:6`·`models/identity.py:64`·테스트 2곳, 운영 Cloud Run `wellshare-platform-api` env `FIREBASE_SA_GENLANG` → Secret Manager **`wp-sa-genlang`**(`:latest`, Cloud Run Job 참조 없음 — 제시 보충으로 실제 이름 확인), `directed-line-434014-h0` Firestore 복제 DB `genlang`. 프로젝트가 없어 기능은 죽어 있음 — 서버 코드 수정·시크릿 해제·복제 DB 삭제·백엔드 재배포를 ①과 함께 한 번에(형 「genlang 정리해」 대기)
  - ✅**코코 보안 지적 H3·M2 → 2026-09-13 처리 완료 · H2 는 코난 재점검으로 `adminSetPassword` 우회를 추가로 막음**(리스크 맨 위 「형 모두 고」 항목). 셀프가입은 회원사 가입 화면 때문에 유지, `members.ts` 관리자 이메일 노출은 인증 확인이 생겨 권한 탈취로 이어지지 않음
- ⚪ (2026-09-13) 9/9 비용 절감 세션이 이름만 보고 지운 3곳 처리: **logis-TMS** 복구(위) · **miso-tms** 400일 지표상 사용 0 → 재삭제 · **wellshare-erp**(9개 단체 회의실 예약·회의록 `mdpj`, 영플 아님) 실사용 흔적 있었으나 **형 결정으로 삭제**(코드는 GitHub `ttong627/-wellshare-erp` 보존, DB 1.87MB 는 결제 끊김으로 백업 못 함, **복구 기한 2026-10-13**)
- 🟢 **(2026-09-10 발생·같은 날 12:11 KST 복구완료) ECOUNT 세금계산서 발행 전면 불가 — 게이트웨이 GCP 프로젝트가 삭제 대기 + 결제 끊김**: `gen-lang-client-0075547354`(logis-TMS, 번호 673351301105) 의 `lifecycleState = DELETE_REQUESTED`. 그 위의 Cloud Run `ecount-gateway` 가 즉시 503(Google Frontend) → 503 엔 CORS 헤더가 없어 브라우저는 프리플라이트부터 막히고 화면엔 "Failed to fetch" 만 떴다. **프론트 버그 아님**
  - **복구 절차(실제로 통한 순서 — 다음에 또 나면 이대로)**: ①`gcloud projects undelete gen-lang-client-0075547354` → ACTIVE ②그런데도 503 유지. 로그가 답을 줬다 — `gcloud logging read ... service_name="ecount-gateway"` 에 **"The request failed because billing is disabled for this project."** 가 계속 찍힌다 ③`gcloud billing projects describe` → `billingEnabled: false` ④`gcloud billing projects link` 로 재연결 ⑤**약 1분 뒤 자동으로 200 복귀**(재배포 불필요 · 서비스 Ready 는 내내 True 였다)
  - ⚠️**결제 계정 함정**: 처음 시도한 `01435E-9A507E-7538B2`(Wellshare 법인 결제)는 **`QuotaFailure: Cloud billing quota exceeded`** 로 거절됐다(계정당 연결 가능 프로젝트 수 상한). → **`01F3D2-641A27-215B57`(로지스법인결제)** 로 붙여 성공. 이 계정은 `wellshare-logis` 본 프로젝트가 쓰는 것과 동일하다(형 승인 2026-09-10)
  - 검증 실측: `GET /` → `{"ok":true,"service":"ecount-gateway"}` · Origin 붙인 OPTIONS 프리플라이트 → **204 + `access-control-allow-origin: https://wellshare-logis.web.app`**
  - ⚠️**삭제 대기는 30일 시한**이다. 다음에 또 지워지면 콘솔 「IAM 및 관리자 → 리소스 관리 → 삭제 대기 중」에서 예정 삭제일부터 확인할 것
  - **다른 프로젝트로 옮기면 안 되는 이유**: NAT 고정 IP `34.64.190.54` 가 ECOUNT ERP IP 화이트리스트에 등록돼 있다. 새 프로젝트 = 새 IP = ECOUNT 거부 → 형이 ERP 에서 IP 재등록을 해야 한다
  - ⚠️**재배포 시 함정**: `ecount-gateway/README.md` 의 배포 명령이 낡았다 — 폐기된 `ECOUNT_COM_CODE` 방식인데 코드(`config.ts`)는 `ECOUNT_COMPANIES` JSON 을 요구한다. README 그대로 배포하면 기동 실패로 또 503
  - ⚠️`.env` 에 `VITE_ECOUNT_GATEWAY_URL` 이 **없다** → `ecountGateway.ts` 하드코딩 기본값이 번들에 박힌다. 게이트웨이를 다른 URL 로 살리면 `.env` 와 CI `ENV_FILE` 시크릿을 함께 고치고 재빌드해야 한다
- 🟠 (2026-09-10 코난·제시 발견 · **이번 수정과 무관한 기존 문제 — 미해결**) 게이트웨이 중복 전표 위험 3건: ①`ecount.ts` 12초 타임아웃에 걸리면 ECOUNT 는 전표를 만들었는데 서버가 `markFailed` → 다음 요청이 force 없이 통과 ②`SalePayload` 에 `ioDate` 가 없어 `validate.ts` 가 **오늘 날짜로 대체** → 작년 12월분을 올해 정산하면 전표 일자·멱등성 키가 올해로 찍힘 ③`ecount.ts` 가 `SuccessCnt>=1` 이면 `FailCnt>0` 이어도 `done` 으로 잠금
- 🟡 (재확인 2026-09-10) **이 저장소는 public 이다**: 정산·회원사 데이터를 다루는 앱이라 코드 공개 자체를 형이 알고 계셔야 한다. 시크릿 유출은 없음 실측(`.env` 는 `.gitignore` 등재·미추적, 추적되는 건 `.env.example` 뿐, 키 패턴 0건). 다만 **fetch 가 누구나 되므로 fetch 성공을 권한 증거로 삼지 말 것**
- 🟡 (2026-09-10) **미커밋 2건 — 글꼴 렌더링 수술이 배포 안 됨**: `src/index.css` 의 font-smoothing 수정이 로컬에만 있다. 형이 "글자 뭉개짐" 으로 지적하신 건이라, 커밋·배포하지 않으면 형 화면은 그대로다. 커밋 시 버전 bump(package.json + public/sw.js 동시)를 함께 할 것 — CI 통과 때문이 아니라 **폰·태블릿 구세션의 SW 캐시를 갈아끼우기 위해서**다. CSS 문법은 검증됨(postcss 파싱 OK · 중괄호 244/244). 보충 여지: Safari 15 이하는 `min-resolution: 2dppx` 를 모른다 — `-webkit-min-device-pixel-ratio: 2` 병기하면 그 기기도 덮는다(안 해도 깨지지 않고 미적용될 뿐)
- 🟢 (해결 2026-08-20 09:5x) **회원사 명단 다운로드 전멸 — Storage 크로스서비스 IAM 누락**: storage.rules의 `regionAllowed()`가 쓰는 `firestore.get()`에 필요한 롤 `roles/firebaserules.firestoreServiceAgent`가 `service-528541497350@gcp-sa-firebasestorage`에 한 번도 부여된 적 없어(IAM 이력 40일 0건) 8/14 규칙 강화부터 회원사 다운로드 전 거부(관리자는 isAdminEmail 단락이라 무증상). 8/20 미소 33회 실패로 표면화. **형 승인 후 롤 부여 → 임시계정 실검증: 매핑 없음 403(규칙 정상)·미소 매핑 200(복구 증명)·테스트 흔적 완전 원상복구**. 교훈: 크로스서비스 규칙 배포 시 CLI가 이 롤 자동부여를 묻는데 REST/CI 배포면 누락된다 — storage.rules에 firestore.get 추가하는 배포는 IAM 바인딩 확인 필수
- 🟡 (발견 2026-08-20 · **2026-09-10 재확인 안 함 — 해결 여부 미상**) **서초구 명단 1건 모순**: adminOnly=False·allowed=[행복나눔]인데 행복나눔 담당지역에 서초구 없음 → 목록엔 보이나 다운로드는 지역매핑에서 거부될 문서. 의도면 partnerRegions에 서초구 추가, 실수면 adminOnly 전환 필요
- 🟢 (해결 2026-08-19) **나라미 APK 격리 이식 완료** — v1.0.14 배포·게이트 상향으로 전 기기 강제 자가 업데이트. 3원인 전부 종결
- 🟡 (완화 2026-08-19) **폰 구탭 고착**: 원인="첫 화면 / 요청이 1시간 캐시 + 가드 이전 좀비 탭". 조치: 전역 no-cache 헤더(양쪽 실측 확인)·본앱 v2.16.2 SW 갱신·플랫폼 1.4.2 배포로 UpdateGate(8/11 이후 탭)·SW(v2.15.2 이후 탭) 보유 탭 전부 자동 새로고침 발동. **잔여: 가드 이전 좀비 탭만 "탭 닫고 새로 열기" 1회 안내 필요**
- 🟡 **발행요청 취소 merge 잔존 의심(양쪽 공통)**: PaymentTab `handleClearPublishRequest`가 whole-map saveField(merge) — merge는 삭제된 키를 못 지워 취소가 서브독에 안 남을 수 있음(화면은 지워져 보이나 재로드 시 부활 가능). 실측 후 서브독 deleteField로 교정 검토
- 🟡 계정 함정: gh 활성 `ttong0627` ↔ owner `ttong627` — 토큰 주입 방식 유지
- 🟡 nworks 토큰 이중갱신 금지(메일 작업은 VM에서만) · 양곡 cron 가동은 VM 로그로 확인
- 🟢 2026-07 마감됨(isClosed=true, 8/18 20:50 형 처리) — 회원사 7월 저장 차단은 규칙상 정상 동작
- 🟢 회원사 저장 실증: (주)한울 deliveryDates 서브독 저장 성공(8/18 14:52, 본앱 신코드)
- ⚠️ **코드 규칙(MUST)**: 월 문서 `updateDoc` 금지 → `setDoc(merge)` / billing 회사별 필드 write는 서브독에만 / ecountSales는 billing_admin에만
