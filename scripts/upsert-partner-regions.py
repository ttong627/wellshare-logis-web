# -*- coding: utf-8 -*-
"""회사↔담당지역 매핑을 `master_settings.partnerRegions` 로 올린다 — 기본 예행.

    python scripts/upsert-partner-regions.py            # 예행
    python scripts/upsert-partner-regions.py --apply    # 적용

★왜 필요한가
  보안규칙(Firestore·Storage)은 클라이언트 상수를 못 읽는다. 지금 이 매핑은
  `src/constants/members.ts` 에만 있어서, **규칙이 "이 회사가 이 지역 담당인가"를 판정할 수 없다.**
  Storage 는 파일 경로가 `rosters/{지역}/…` 라 지역 기준으로만 막을 수 있으므로 이 매핑이 필수다.
  (Storage 규칙은 `firestore.get()` 으로 이 문서를 읽는다.)

★쓰기 범위
  `partnerRegions` 필드 **하나만** 갱신한다(updateMask). partnerAccounts·pendingUsers 는 손대지 않는다.
"""
import io, json, os, subprocess, sys, urllib.request, urllib.error

PROJECT = 'wellshare-logis'
APP_ID = 'wellshare-logis-v1-production-stable'
DOC = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}'
       f'/databases/(default)/documents/artifacts/{APP_ID}/public/data/settings/master_settings')

# src/constants/members.ts PARTNER_REGIONS 와 동일. 이관 후 이 문서가 SSOT.
PARTNER_REGIONS = {
    '사회적협동조합 행복나눔': ['부천시 원미구', '부천시 오정구', '시흥시', '동대문구'],
    '참자연': ['시흥시'],
    '미소 협동조합': ['여주시'],
    '웰쉐어 사회적협동조합': ['동대문구'],
    '부천희망나르미': ['부천시 소사구', '중구', '종로구', '용산구'],
    '(주)한울': ['동대문구'],
}

APPLY = '--apply' in sys.argv
TOKEN = os.environ.get('GCP_TOKEN', '').strip() or subprocess.run(
    'gcloud auth print-access-token --account ttong627@gmail.com',
    shell=True, capture_output=True, text=True).stdout.strip()
if not TOKEN:
    raise SystemExit('액세스 토큰을 못 얻었다.')


def call(url, method='GET', body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'Authorization': f'Bearer {TOKEN}',
                                          'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit(f'HTTP {e.code}: {e.read().decode()[:400]}')


cur = call(DOC).get('fields', {})
have = cur.get('partnerRegions', {}).get('mapValue', {}).get('fields')
print('현재 partnerRegions:', '없음' if have is None else f'{len(have)}개사')
print('올릴 매핑:')
for c, rs in PARTNER_REGIONS.items():
    print(f'  {c} -> {", ".join(rs)}')
print(f'\n다른 필드는 건드리지 않는다(현재 필드: {", ".join(cur.keys())})')

if not APPLY:
    print('\n예행이다. 적용하려면 --apply 를 붙일 것.')
    raise SystemExit(0)

body = {'fields': {'partnerRegions': {'mapValue': {'fields': {
    c: {'arrayValue': {'values': [{'stringValue': r} for r in rs]}}
    for c, rs in PARTNER_REGIONS.items()}}}}}
call(f'{DOC}?updateMask.fieldPaths=partnerRegions', 'PATCH', body)

after = call(DOC).get('fields', {})
got = after.get('partnerRegions', {}).get('mapValue', {}).get('fields', {})
print(f'\n적용 완료 — partnerRegions {len(got)}개사')
print('보존 확인 — 남아있는 필드:', ', '.join(after.keys()))
