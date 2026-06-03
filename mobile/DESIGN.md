# 웰쉐어 나라미 정산포털 — 모바일 앱 설계서 (v2)

> Expo React Native. 웹앱(wellshare-logis.web.app)의 **모든 기능을 권한별로** 모바일에 담는다.
> 디자인 원칙: `/ui-ux-pro-max` (no-emoji-icons, bottom-nav ≤5, touch 44pt, 색맹대비 배지, safe-area).
> 작성: 드림팀(안토니/홀리/미아/타미/브루마/빌/코코/미연/스피드)

---

## 0. 기존 모바일 앱 점검 결과 (체크 완료)

| 항목 | 현재 상태 | 판정 |
|---|---|---|
| 스택 | Expo ~55, RN 0.85, React 19, react-navigation v7, firebase 12, AsyncStorage | ✅ 최신·적합 |
| 로그인 유지 | `initializeAuth(app,{persistence:getReactNativePersistence(AsyncStorage)})` | ✅ **이미 정상** |
| 역할 조회 경로 | `artifacts/{APP_ID}/public/data/partnerAccounts` (5세그먼트=잘못된 doc 참조→예외) | 🚨 **버그·반드시 수정** |
| 네비게이션 | BottomTab 4개(홈/실적/배송/계산서), 역할 분기 없음 | ⚠️ 권한 미반영 |
| 아이콘 | 이모지(🏠📊🚚🧾🌾) | 🚨 벡터 아이콘 교체 |
| 브랜드 색 | dark/slate #1e293b + emerald | ⚠️ 웹 sky-blue와 불일치 |
| 기능 커버리지 | 9개 중 4개(홈/실적/배송/계산서)만 | ⚠️ 전체 확장 필요 |

### 🚨 즉시 수정 (역할 버그) — 가장 중요
`src/context/AuthContext.tsx`의 역할 조회를 **웹 `useAuth.ts`와 동일 경로**로 교정:
```ts
// 잘못됨(현재): doc(db,'artifacts',APP_ID,'public','data','partnerAccounts')  // 5세그먼트 → 예외
// 올바름(웹과 일치):
const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings');
const snap = await getDoc(ref);
const accounts = snap.exists() ? (snap.data().partnerAccounts || {}) : {};
const role = accounts[u.email || ''];           // 'ADMIN' | '회사명' | undefined
setIsAdmin(role === 'ADMIN');
setPartnerCompany(role && role !== 'ADMIN' ? role : null);
```
> 이 한 줄 경로 차이로 **모든 모바일 사용자의 권한이 영영 해결되지 않는다.** 최우선.

---

## 1. 정보구조(IA) — 권한별 하단탭 ≤5 + 더보기

웹 `Navbar` 가시성 규칙을 모바일 하단탭으로 매핑한다. 사용 빈도 높은 4개를 탭에, 나머지는 **더보기(More) 그리드**로.

### 파트너(협동조합) — 하단탭 5개
| 탭 | 화면 | 웹 대응 |
|---|---|---|
| 홈 | 대시보드(이번달 내 지역·할일·알림) | — |
| 실적입력 | 지역별 포수/단가 입력 | performance |
| 배송완료 | 배송 완료 체크 | delivery |
| 내역확인 | 내 정산 내역(계산서 상태) | partner_billing |
| 더보기 | 배송일정·내 계정·알림·로그아웃 | schedule, profile |

### 관리자 — 하단탭 5개 (+더보기 그리드에 롱테일)
| 탭 | 화면 | 웹 대응 |
|---|---|---|
| 홈 | 운영 대시보드(전 지역 진행률·발행현황·승인대기) | — |
| 배송 | 포수입력 + 배송완료(세그먼트 전환) | orders + delivery |
| 계산서 | 계산서발급 + **ECOUNT 전송** | billing |
| 정산 | 결제내역 + 파트너 내역 | payment + partner_billing |
| 더보기 | 공문작성·주소록·사용자관리·단가·배송일정·백업·알림·계정 | docs, contacts, users, prices, schedule, backup |

> 근거: `bottom-nav-limit`(≤5), `bottom-nav-top-level`(상위만), `overflow-menu`(초과분은 더보기). 관리자는 기능이 12개라 5탭+더보기 그리드가 정석.

### 네비게이션 트리
```
RootStack (headerShown:false, persistence로 자동 세션복원)
├─ AuthLoading        // onAuthStateChanged 대기 → 스플래시
├─ Login              // 미인증
├─ NoRole             // 인증O·역할X → "승인 대기" 안내 + 로그아웃
└─ Main (role 분기)
   ├─ PartnerTabs  → 홈 / 실적입력 / 배송완료 / 내역확인 / 더보기
   └─ AdminTabs    → 홈 / 배송 / 계산서 / 정산 / 더보기
       └─ More(Stack) → 각 기능 화면(push, 뒤로가기 일관)
```

---

## 2. 디자인 시스템 — 웹과 100% 브랜드 일치

### 색 토큰 (semantic, `src/theme.ts`로 단일화)
```ts
export const theme = {
  brand:      '#0ea5e9',  // sky-500 (웹 primary)
  brandLight: '#38bdf8',  // sky-400
  brandDark:  '#0369a1',  // sky-700 (텍스트 대비 4.5:1+)
  bg:         '#f0f9ff',  // sky-50 배경
  surface:    '#ffffff',
  surfaceAlt: '#f8fafc',
  border:     '#e0f2fe',
  text:       '#0c4a6e',  // sky-900
  textMuted:  '#64748b',  // slate-500 (대비 충족)
  // 지역 색 시스템 (웹 getRegionTheme와 동일)
  seoul:      '#8b5cf6',  // violet (서울)
  seoulBg:    '#f5f3ff',
  gyeonggi:   '#10b981',  // emerald (경기)
  gyeonggiBg: '#ecfdf5',
  // 상태(색+아이콘+텍스트 = 색맹대비)
  success: '#16a34a', warning: '#d97706', danger: '#dc2626', info: '#0284c7',
};
```
> `color-semantic`(raw hex 금지·토큰화), `color-not-decorative-only`(상태는 색+아이콘+라벨), `color-accessible-pairs`(4.5:1). dark/slate는 폐기하고 웹 sky-blue로 통일.

### 아이콘 — `@expo/vector-icons`(Lucide/Feather) 24pt 통일, 이모지 전면 제거
| 탭 | 아이콘(Feather) |
|---|---|
| 홈 home · 실적 edit-3 · 배송 truck · 계산서 file-text · 정산 credit-card · 내역 list · 더보기 grid · 알림 bell |
> `no-emoji-icons`, `icon-style-consistent`, `consistent-icon-sizing`.

### 타이포 · 간격 · 터치
- 본문 16pt(`readable-font-size`), 숫자 컬럼은 `fontVariant:['tabular-nums']`(`number-tabular`).
- 4/8 간격 리듬, 카드 radius 16, 그림자 일관(elevation 2/4/8).
- 모든 터치 타깃 ≥44pt, 간격 ≥8pt, 누름 피드백 `Pressable` opacity/scale 0.97(`press-feedback`).
- `SafeAreaView` + 하단탭 safe-area 패딩(`safe-area-awareness`).

### 상태 배지 (색맹대비) — 웹 StatusBadge 모바일판
```
대기   ○ 회색  (clock)     입력완료 ● 파랑 (check)
발행대기 ◐ 주황 (alert)    발행완료 ● 초록 (check-circle)
```
색만으로 구분 금지 — 점/아이콘/텍스트 3중 표기.

---

## 3. 화면별 설계 (전체 기능)

### 공통
- **헤더**: 좌측 로고+월 선택(YYYY-MM), 우측 알림 벨(미읽음 배지)·계정. 월 선택은 `savedMonths` 바텀시트.
- **로딩**: 스켈레톤(>300ms), 빈상태 일러스트+안내(`empty-states`).
- **알림**: 웹 readBy 모델 재사용 — `myNotifications`(target 필터), 탭 시 `arrayUnion(uid)` 읽음. 벨 배지 = 미읽음 수.

### 홈(대시보드)
- 파트너: 이번달 내 담당지역 카드(지역색), 할일(실적 미입력/배송 미완 N건), 최근 알림 3건.
- 관리자: KPI(전체 진행률·발행 n/총 m·승인대기 사용자), 지역 진행 히트맵, 빠른 이동.
- 차트는 `responsive-chart`(가로바)·`empty-data-state`·`number-formatting`.

### 실적입력(파트너·performance)
- 내 담당 지역만 노출(지역색 헤더). 지역×급지 포수 수량 입력(numeric 키보드), 자동 합계.
- `form-autosave`(이탈 시 초안), 저장은 `billing_records.partnerInputs` merge(룰 허용 필드).

### 배송완료(delivery)
- 지역별 배송완료 토글/날짜. 파트너=자기지역, 관리자=전체. `deliveryDates` merge.

### 계산서발급 + ECOUNT(관리자·billing)
- 발행 회사 선택(웰쉐어 로지스 631989 / 사협 156855) → 지자체별 카드.
- 각 카드: 공급가/세액/합계 + **[ECOUNT 전송]** 버튼(비가역 confirm) → 게이트웨이 호출.
- 발행 상태 영구표시(`ecountSales[comCode][region]` 전표번호·재발행). `destructive-emphasis`·진행률.

### 정산/결제(관리자·payment) · 내역확인(파트너·partner_billing)
- 결제내역: 지급 현황 테이블(정렬 가능). 내역확인: 파트너가 자기 정산·계산서 상태 열람(읽기 위주).

### 더보기 그리드(관리자 롱테일)
- 공문작성(docs): 목록·뷰어(붙여넣기 HTML은 **DOMPurify sanitize 후** RN `WebView`/렌더). 작성은 웹 권장(모바일=열람·공유).
- 주소록(contacts), 사용자관리(users·승인/권한), 단가(prices), 배송일정(schedule·달력), 백업(backup·열람).

### 로그인 / 세션
- `getReactNativePersistence`로 **자동 로그인 유지**(이미 정상). 별도 체크박스 불필요.
- 비밀번호 show/hide 토글, `textContentType` 자동완성, `keyboardType=email`.
- 생체인증(선택·후속): `expo-local-authentication`으로 앱 재진입 시 Face/지문 잠금.

---

## 4. 단계별 구현 계획 (Phase)

| Phase | 내용 | 파일(신규/수정) | 산출 |
|---|---|---|---|
| **P0 🚨** | 역할버그 수정 + theme.ts(웹 색) + 벡터아이콘 | AuthContext.tsx, theme.ts(신규), navigation | 권한·브랜드 정상화 |
| **P1** | 역할별 탭 분기(Partner/Admin) + 더보기 그리드 + 헤더(월·알림·계정) | navigation, More 화면, 헤더 컴포넌트 | IA 완성 |
| **P2** | 홈 대시보드 2종 + 알림(readBy) + 공통 StatusBadge/스켈레톤 | HomeScreen, components/* | 핵심 UX |
| **P3** | 관리자 전용: 계산서+ECOUNT, 결제, 공문/주소록/사용자/단가/백업 | screens/* | 관리자 전체 |
| **P4** | 다듬기: 생체인증·다크모드·접근성·landscape·E2E | — | 출시 품질 |

> 데이터계층은 웹과 동일 Firestore(`billing_records`/`notifications`/`settings`) + 게이트웨이 URL 재사용 → 백엔드 추가 0.

---

## 5. 드림팀 의견 요약
- **[안토니]** 웹 `useAuth`/`AppContext` 로직을 RN 컨텍스트로 1:1 포팅 → 단일 진실원(Firestore) 유지. 백엔드 신규 없음.
- **[홀리]** 웹 sky-blue+violet/emerald를 그대로. 이모지 전면 제거, 글래스는 모바일에선 가벼운 카드+그림자로 변환.
- **[미아]** 역할 경로 버그가 치명 — P0 1순위. constants.ts의 MEMBERS/REGIONS 중복은 추후 공유모듈로.
- **[타미]** persistence 이미 정상 → 무지연 자동로그인. FlatList 가상화·이미지 lazy로 60fps.
- **[브루마]** 화면당 단일 CTA, Pressable 누름 피드백, tabular-nums로 금액 흔들림 제거.
- **[빌]** `getDoc` 1회 로드(웹과 동일) — 편집 안전. merge는 룰 허용 필드만(partnerInputs/deliveryDates/publishDates).
- **[코코]** 토큰은 `auth.currentUser.getIdToken()` 공식 경로만. 공문 HTML은 sanitize 후 렌더. firebaseConfig는 공개키라 무방.
- **[미연]** 파트너 첫 진입 시 "승인 대기" 안내 명확화, 네트워크 끊김 시 오프라인 배너.
- **[스피드]** Expo 55/RN 0.85 최신. `@expo/vector-icons` 도입으로 이모지 의존 제거.
