# ECOUNT 통합 게이트웨이 (Cloud Run)

웰셰어 정산 데이터를 ECOUNT ERP `SaveSale`(매출등록)로 대행 전송하는 단일 게이트웨이.
프론트(정산포털 `wellshare-logis.web.app`, wslos.kr 정산 탭)가 Firebase ID토큰으로 호출 → 게이트웨이가 고정 IP(`34.64.142.198`)로 ECOUNT 호출.

- 실행 프로젝트: `wellshare-logis` (#528541497350) / 리전 `asia-northeast3` / 서비스 `ecount-gateway`
  - 2026-09-13 logis-TMS(`gen-lang-client-0075547354`) 철거로 이전. 옛 IP `34.64.190.54` 는 ECOUNT 두 법인에서 삭제됨
- 실행 계정: `ecount-gateway-sa@wellshare-logis.iam.gserviceaccount.com` — `roles/datastore.user` · `roles/firebaseauth.viewer` · 시크릿 3개 읽기만(2026-09-13 코코 M2)
- 인증: Firebase ID토큰 검증(`wellshare-logis`) + 관리자 이메일 allowlist + **인증된 이메일만**(2026-09-13 코코 H2, `src/authz.ts`)
- 멱등성: Firestore `ecount_sales/{key}` 상태머신(중복 매출전표 차단)

## 엔드포인트
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/` | 없음 | 헬스체크 |
| GET | `/debug/ip` | 관리자 | egress IP 확인(NAT 고정 IP 검증) |
| POST | `/ecount/sale` | 관리자 | 매출등록 대행(정산포털·wslos) |
| POST | `/ecount/sale-server` | `x-server-key` | 구 PHP 관리자(admin.wslogis.co.kr) 서버발행 |
| POST | `/ecount/sale-tms` | TMS 관리자 | ⛔폐기 — TMS 철거로 `TMS_FIREBASE_PROJECT_ID` 없음(500) |

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

## 배포 (wellshare-logis) — ⚠️반드시 이 형태
```bash
gcloud config set account ttong627@gmail.com
npm test                       # 관리자 판정 테스트(tsc 포함)
gcloud run deploy ecount-gateway --source . \
  --project wellshare-logis --region asia-northeast3 \
  --service-account ecount-gateway-sa@wellshare-logis.iam.gserviceaccount.com
# 배포 뒤 실행 계정·리비전 확인
gcloud run services describe ecount-gateway --project wellshare-logis --region asia-northeast3 \
  --format="value(spec.template.spec.serviceAccountName,status.latestReadyRevisionName)"
```
- ⛔**`--set-env-vars`·`--set-secrets` 금지** — 기존 값을 **통째로 지운다**. `ECOUNT_COMPANIES`·`ECOUNT_KEY_*`·`TMS_SERVER_KEY` 가 사라져 기동 즉시 죽는다. 값 하나만 바꿀 땐 `gcloud run services update --update-env-vars` / `--update-secrets`.
- ⛔**`--service-account` 를 빼지 말 것.** 기본 compute SA(프로젝트 Editor)로 돌아가면 M2 가 되돌아간다. 기본 SA 에 시크릿 권한을 주지 말 것(2026-09-13 제거).
- 현재 설정(2026-09-13): env `ECOUNT_COMPANIES`(JSON, 631989·156855) · `FIREBASE_PROJECT_ID=wellshare-logis` · `ADMIN_EMAILS` · `ALLOWED_ORIGINS`(wellshare-logis.web.app · firebaseapp.com · localhost:5173 · wslos.kr · directed-line-434014-h0.web.app) / secrets `ECOUNT_KEY_631989=ecount-key-ttong:latest` · `ECOUNT_KEY_156855=ecount-key-156855-ttong:latest` · `TMS_SERVER_KEY=ecount-server-key:<버전>` / VPC egress all-traffic(default/default) → Cloud NAT `ecount-gw-nat`(주소 `ecount-gw-ip` = 34.64.142.198)
- **서버키 교체**: `gcloud secrets versions add ecount-server-key` → `gcloud run services update ecount-gateway --update-secrets TMS_SERVER_KEY=ecount-server-key:<새 버전>` → AWS `/var/www/html/admin/ecount_config.php` 에 같은 값(www-data 600) → 옛 버전 `disable`

## 운영 메모
- ECOUNT IP 허용: 두 법인(631989·156855)에 `34.64.142.198` 등록(2026-09-13, 옛 34.64.190.54 삭제)
- 바깥 IP·ECOUNT 로그인 확인은 **실발행 없이**: 같은 VPC egress 설정의 1회용 Cloud Run Job(curl ipify / OAPILogin) 을 띄우고 지운다
- 관리자 계정은 **이메일 인증 상태**여야 발행된다. 새 관리자를 `ADMIN_EMAILS` 에 넣으면 그 계정도 인증 처리할 것

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
