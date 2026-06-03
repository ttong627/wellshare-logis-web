# ECOUNT 통합 게이트웨이 — 구현 계획 (확정)

## 아키텍처 결정
- **단일 ECOUNT 통합 게이트웨이** (Cloud Run, 고정 IP 1개) — 여러 앱 공유
- 위치: **logis-TMS (gen-lang-client-0075547354)** 프로젝트
- 앱들(wellshare-logis, logis-TMS, wellshare-erp)이 Firebase Auth 토큰으로 게이트웨이 호출
- ECOUNT IP 화이트리스트: **게이트웨이 고정 IP 1개만** 등록
- 연동 방안: **B방안(API 자동)=기본 + A방안(엑셀)=보조** 둘 다

## ECOUNT 확정 정보 (PoC 검증 완료)
- ZONE=AC · COM_CODE=631989 · 테스트 sboapiAC.ecount.com · 운영 oapiAC
- 거래처 희망나르미 사회적협동조합 = `490-82-00102` (하이픈 포함) · 창고 WH_CD=100
- 급지품목 `wsl_z1`~`wsl_z7` (10kg/포/재고없음/VAT포함/과세, 단가 2780~4170)
- 담당자별 API키 4개: USER_ID DLGMLTJR/KORHAND/THSDUDDN/TTONG (노출됨 → **재발급 필요**)
- SaveSale 검증완료: 품목명 동적("서울 동대문구 5월 정부양곡배송비"), SUPPLY_AMT/VAT_AMT 명시, 총합계 1원오차0
- **회계반영(매출전표I)·전자세금계산서 발행은 ECOUNT API 불가** → 화면 일괄(판매일괄회계반영 → 진행단계 발행). 부가세유형 '세금계산서'여야 발행 가능
- 판매입력 엑셀 19열: 일자/순번/거래처코드/거래처명/담당자/출하창고/거래유형/통화/환율/품목코드/품목명/규격/수량/단가/외화금액/공급가액/부가세/적요/생산전표생성

## 구현 단계
- ✅ **Phase 0 인프라 (logis-TMS) 완료 (2026-06-03)**: compute/vpcaccess/run API 활성·Blaze 활성 확인. default VPC(asia-northeast3, 10.178.0.0/20) 재사용. 정적 IP `ecount-gw-ip`=**34.64.190.54**(IN_USE) + Cloud Router `ecount-gw-router` + Cloud NAT `ecount-gw-nat`(MANUAL_ONLY, ALL_SUBNETWORKS) 생성. **남은 수동작업: 형님이 ECOUNT 관리자에서 34.64.190.54를 API IP 화이트리스트에 등록**
- ✅ **Phase 1 게이트웨이 (Cloud Run) 배포 완료 (2026-06-03)**: `ecount-gateway/`(Node20+TS+Express). URL `https://ecount-gateway-673351301105.asia-northeast3.run.app`. Direct VPC egress(all-traffic)→NAT→34.64.190.54. POST /ecount/sale(Firebase 토큰검증+관리자 allowlist+멱등성 상태머신 `year-month-region`+세션 싱글플라이트+SaveSale), GET /(헬스), GET /debug/ip. 코코 보안리뷰 통과(에러 detail 비노출·금액상한·제어문자 필터 반영). 무블로커 검증(health 200/무토큰 401/CORS allowlist) 통과. **남은 검증(관리자 토큰 필요): /debug/ip 실측·실호출. 블로커: ① 형님이 34.64.190.54 ECOUNT 운영 IP화이트리스트 등록 ② 운영키 재발급→시크릿 `ecount-api-key` 교체(현재 placeholder)**
- **Phase 2 키/담당자 저장**: Firestore `ecount_credentials/{userId}`(서버전용 rules deny client) / `ecount_operators/{email}`(매핑 메타, 키 제외) + 관리 UI
- **Phase 3 wellshare-logis 앱**: 계산서발급 "ECOUNT 전송" 버튼 → 게이트웨이 호출, 상태배지, 전송후 ECOUNT 화면 작업 가이드(일괄회계반영→발행)
- **Phase 4 A방안 엑셀**: `src/lib/ecountExport.ts`(이미 구현) → BillingTab "ECOUNT 엑셀" 버튼 연결
- **Phase 5**: 다른 앱(logis-TMS 등) 게이트웨이 연동

## 보안
- API키는 게이트웨이 Secret/Firestore(서버 전용)에만. 클라이언트엔 매핑 메타만
- 노출된 키 4개 재발급 후 적용
- 호출자 관리자 권한 서버 재검증, 멱등성으로 중복발행 차단

## 이미 완료
- `tools/ecount_sync.py`: ECOUNT PoC 스크립트 (login/품목등록/SaveSale 검증)
- `src/lib/ecountExport.ts`: A방안 판매입력 엑셀 생성 유틸 (BillingTab 연결만 남음)
- ECOUNT 급지품목 7개·거래처 등록 완료(테스트 계정)

## 다음 세션 시작점 (/sync로 이어가기)
1. (형님 수동·**유일한 블로커**) ECOUNT 운영 관리자 → API IP 화이트리스트에 **34.64.190.54** 등록 (ERP>API인증키발급>IP등록)
2. ✅ 운영 인증키 완료: 4개(USER_ID별) Secret Manager 저장(`ecount-key-{ttong,dlgmltjr,korhand,thsduddn}`), 게이트웨이는 `ecount-key-ttong` 사용(리비전 00002). 재발급 없이 그대로 사용(형님 결정)
3. 1 후 실호출 검증: 관리자 토큰으로 `/debug/ip`(34.64.190.54 확인) → `/ecount/sale` 1건(운영=실데이터, MAKE_FLAG 동작 확인)
4. Phase 3: 프론트 "ECOUNT 전송" 버튼/상태배지 → 게이트웨이 호출 연결 (배포된 URL 사용)
5. Phase 1.x 후속(코코 권고): rate-limit Cloud Armor 보강, /debug/ip 운영 비활성

## 인프라 자원 (logis-TMS / gen-lang-client-0075547354)
- 정적 IP: `ecount-gw-ip` = 34.64.190.54 (asia-northeast3)
- Cloud Router: `ecount-gw-router` (default VPC)
- Cloud NAT: `ecount-gw-nat` (MANUAL_ONLY, natIps=ecount-gw-ip, ALL_SUBNETWORKS_ALL_IP_RANGES)
- 월 비용 추정: NAT ~$32 + 정적 IP ~$3~7 (전부 삭제 시 과금 중단)
