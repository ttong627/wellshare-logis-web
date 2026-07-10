# 정부양곡 명단 자동수집기 (yanggok-collector)

시청·구청이 메일로 보내는 **정부양곡 인수지시서·배송명단 첨부를 자동 수집**해
wellshare-logis 앱 「명단 탭(RosterTab)」에 적재한다.

> 설계 배경: `메일자동화_핸드오프.md` · yyplus mail-collector 패턴 복제·적응 (2026-07-10 구현)

## 구조

| 파일 | 역할 |
|---|---|
| `auto-collect-yanggok.mjs` | 오케스트레이터 — cron이 2시간 주기 실행 |
| `classify-yanggok.mjs` | 양곡 판정·지역/월/구분 추출 (순수함수) |
| `classify-yanggok.test.mjs` | 분류기 테스트 (`node --test`) |
| `persist-rosters.mjs` | SA 인증·Storage 업로드·Firestore 멱등 적재 |
| `worksmail.mjs` | 네이버웍스 메일 API (yyplus 공용 사본) |
| `notify-telegram.mjs` | 텔레그램 ops 알림 (yyplus 공용 사본) |

## 핵심 규칙

- **토큰 읽기전용**: nworks 토큰(`~/.config/nworks/`)은 **yyplus auto-collect가 갱신**한다.
  이 수집기는 절대 갱신하지 않는다(이중 갱신 → refresh token 회전 충돌 → 계정 사망).
  cron을 yyplus(정각 짝수시각) **20분 뒤**에 걸어 항상 신선한 토큰을 읽는다.
- **멱등 적재**: 문서 ID = `MAIL_{계정}_{mailId}_{attachmentId}`. 재실행해도 중복 0.
  과거 수동적재분은 `region|month|fileName` + `region|fileName` 키로 2차 차단.
- **노출 안전**: 회원사 담당 지역(원미·오정·소사·시흥·동대문·여주·중구·종로·용산)만 공개 적재.
  그 외 지역·미분류는 **관리자 전용**(`adminOnly` + Storage `rosters_admin/` 경로) — 본사 확인 후 배포.
- **알림**: 신규 적재 → 텔레그램 요약 / 토큰 만료·수집 실패 → 장애 알림(12h 중복방지).
  dry-run은 쓰기·알림 모두 없음.

## 실행

```bash
# 드라이런(쓰기·알림 없음)
YANGGOK_SA_KEY=<wellshare-logis SA키 경로> node auto-collect-yanggok.mjs --days 45

# 실제 적재
YANGGOK_SA_KEY=<...> node auto-collect-yanggok.mjs --commit          # 기본 최근 14일
YANGGOK_SA_KEY=<...> node auto-collect-yanggok.mjs --commit --days 45 # 백필
```

## VM 배치 (tms-main-node · ttong0627)

- 경로: `/home/ttong0627/yanggok-collector/`
- 환경: `/home/ttong0627/.yanggok-env` — `YANGGOK_SA_KEY`(wellshare-logis SA키), `WSSC_TELEGRAM_CONFIG`
- cron (yyplus 수집 20분 뒤):
  ```
  20 */2 * * * cd /home/ttong0627/yanggok-collector && . /home/ttong0627/.yanggok-env && /usr/bin/node auto-collect-yanggok.mjs --commit >> /home/ttong0627/yanggok-collect.log 2>&1
  ```
- 코드 갱신: 이 폴더를 수정·푸시 후 VM에 재복사(scp) — 앱(Firebase Hosting) 배포와 무관.

## 시크릿 (커밋 금지)

- nworks 토큰: `~/.config/nworks/user-token(.bucheon).json` — yyplus와 공유
- wellshare-logis SA키: 로컬 `D:/Gemma4/_secrets/`, VM `/home/ttong0627/.secrets/`
- 로그·alert-state.json은 런타임 산출물 (gitignore)
