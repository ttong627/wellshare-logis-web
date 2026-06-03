# ECOUNT 통합 게이트웨이 (Cloud Run)

웰셰어 정산 데이터를 ECOUNT ERP `SaveSale`(매출등록)로 대행 전송하는 단일 게이트웨이.
프론트(`wellshare-logis`)가 Firebase ID토큰으로 호출 → 게이트웨이가 고정 IP(`34.64.190.54`)로 ECOUNT 호출.

- 실행 프로젝트: `gen-lang-client-0075547354` (logis-TMS) / 리전 `asia-northeast3`
- 인증: Firebase ID토큰 검증(`wellshare-logis` 프로젝트) + 관리자 이메일 allowlist
- 멱등성: Firestore `ecount_sales/{year-month-region}` 상태머신(중복 매출전표 차단)

## 엔드포인트
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/` | 없음 | 헬스체크 |
| GET | `/debug/ip` | 관리자 | egress IP 확인(NAT 고정 IP 검증) |
| POST | `/ecount/sale` | 관리자 | 매출등록 대행 |

### POST /ecount/sale 요청
```json
{
  "month": 5,
  "region": "경기 부천시 소사구",
  "ioDate": "20260603",
  "lines": [
    { "prodCd": "wsl_z1", "prodDes": "경기 부천시 소사구 5월 정부양곡배송비", "qty": 50, "price": 2780 }
  ],
  "makeFlag": "N"
}
```
- `prodCd` 는 `wsl_z1`~`wsl_z7` 만 허용. `price` 는 VAT 포함 단가.
- 응답: `{ ok, slipNos[], supply, vat, total, cached }`

## 로컬 빌드
```bash
npm install
npm run build   # tsc → dist/
```

## 배포 (logis-TMS)
```bash
# 1) API 활성화
gcloud services enable secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project gen-lang-client-0075547354

# 2) default 서브넷 Private Google Access (all-traffic egress 안전장치)
gcloud compute networks subnets update default --region asia-northeast3 \
  --enable-private-ip-google-access --project gen-lang-client-0075547354

# 3) 시크릿 생성 후 운영 인증키 입력 (값은 직접 입력 — 채팅/로그 노출 금지)
gcloud secrets create ecount-api-key --project gen-lang-client-0075547354
echo -n "<ECOUNT 운영 인증키>" | gcloud secrets versions add ecount-api-key --data-file=- \
  --project gen-lang-client-0075547354

# 4) 런타임 SA 권한
RUNTIME_SA=$(gcloud iam service-accounts list --project gen-lang-client-0075547354 \
  --filter="displayName:Default compute" --format="value(email)")
gcloud secrets add-iam-policy-binding ecount-api-key --member "serviceAccount:$RUNTIME_SA" \
  --role roles/secretmanager.secretAccessor --project gen-lang-client-0075547354

# 5) 배포 (Direct VPC egress → NAT → 34.64.190.54)
gcloud run deploy ecount-gateway --source . \
  --project gen-lang-client-0075547354 --region asia-northeast3 \
  --allow-unauthenticated --max-instances 3 --concurrency 20 \
  --network default --subnet default --vpc-egress all-traffic \
  --set-secrets ECOUNT_API_KEY=ecount-api-key:latest \
  --set-env-vars "ECOUNT_BASE=https://oapiAC.ecount.com/OAPI/V2,ECOUNT_COM_CODE=631989,ECOUNT_USER_ID=ttong,ECOUNT_ZONE=AC,ECOUNT_LAN_TYPE=ko-KR,ECOUNT_CUST=490-82-00102,ECOUNT_WH_CD=100,ECOUNT_MAKE_FLAG=N,FIREBASE_PROJECT_ID=wellshare-logis,ADMIN_EMAILS=ttong@wssc.kr|ttong627@gmail.com|goodp1@hanmail.net,ALLOWED_ORIGINS=https://wellshare-logis.web.app|https://wellshare-logis.firebaseapp.com|http://localhost:5173"
```

## 운영 전 필수 (형 작업)
1. 노출된 ECOUNT 운영 인증키 재발급 → 위 3단계로 시크릿에 입력
2. `34.64.190.54` 를 ECOUNT 운영 API IP 화이트리스트 등록 (ERP > API인증키발급 > IP등록)

## 멱등성 운영 런북 (중요)
매출전표는 비가역이라 중복 차단을 "막는 쪽"으로 설계했다. Firestore `ecount_sales/{key}`:
- `done` + 동일 입력 → 재호출은 기존 결과 반환(cached, ECOUNT 재호출 안 함)
- `done` + 다른 입력 → **409 conflict**. 같은 (연·월·행정구)를 다른 내용으로 재발행하려면, ECOUNT 화면에서 기존 전표 처리를 확인한 뒤 해당 Firestore 문서를 **수동 삭제**해야 한다(자동 덮어쓰기 금지).
- `pending` → **409 in_progress**. 처리 중이거나, 인스턴스 강제종료로 남은 고아 pending. ECOUNT 화면에서 전표 생성 여부를 확인하고:
  - 전표가 이미 있으면 문서를 `done`으로 두거나 그대로(재발행 방지), 없으면 문서 **수동 삭제** 후 재시도.
- `failed` → 다음 요청에서 자동 재시도 허용.

## 보안 메모
- `verifyIdToken`은 `checkRevoked=false`다. 게이트웨이(logis-TMS)는 토큰 발급 프로젝트(wellshare-logis)의 Auth 백엔드 접근 권한이 없어 즉시 폐기 확인이 불가하므로 구조적 제약이다. 관리자 토큰 탈취 시 **최대 토큰 만료(1h)까지** 유효 → 관리자 계정 보안(2FA)·allowlist 관리로 보완.
- rate-limit은 인스턴스 로컬 메모리라 best-effort. 강한 DoS 방어는 Cloud Armor로 별도 보강.
- `/debug/ip`는 배포 검증용. 검증 후 제거 또는 비활성 권장.

## 환경변수
| 변수 | 필수 | 설명 |
|---|---|---|
| `ECOUNT_API_KEY` | ✅ | ECOUNT 운영 인증키 (Secret Manager 주입) |
| `ECOUNT_COM_CODE` | ✅ | 631989 |
| `ECOUNT_USER_ID` | ✅ | ttong |
| `ECOUNT_ZONE` | ✅ | AC |
| `FIREBASE_PROJECT_ID` | ✅ | wellshare-logis (토큰 발급 프로젝트) |
| `ADMIN_EMAILS` | ✅ | 관리자 이메일(`\|` 구분) |
| `ALLOWED_ORIGINS` | ✅ | CORS 허용 origin(`\|` 구분) |
| `ECOUNT_BASE` | | 기본 `https://oapiAC.ecount.com/OAPI/V2` |
| `ECOUNT_LAN_TYPE` | | 기본 `ko-KR` |
| `ECOUNT_CUST` | | 기본 `490-82-00102` (희망나르미) |
| `ECOUNT_WH_CD` | | 기본 `100` |
| `ECOUNT_MAKE_FLAG` | | 기본 `N` |
