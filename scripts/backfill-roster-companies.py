# -*- coding: utf-8 -*-
"""명단(rosters) 문서에 `allowedCompanies` 를 채운다 — 기본 예행(dry-run).

    python scripts/backfill-roster-companies.py            # 예행: 무엇이 바뀌는지만 출력
    python scripts/backfill-roster-companies.py --apply    # 실제 적용

★왜 필요한가
  보안규칙과 목록 쿼리는 **문서 안에 있는 값**만 볼 수 있다. 그런데 지금 "어느 회원사가
  이 명단을 볼 수 있나"는 클라이언트 상수(`src/constants/members.ts` PARTNER_REGIONS)에만
  있고, 22건은 `allowedCompanies` 필드 자체가 없다. 그 상태로 규칙을 조이면
  **회원사 화면이 통째로 빈다.**
  → 지금 화면이 보여주는 것과 **똑같은 결과**를 문서에 새겨서, 규칙·쿼리가 같은 답을 내게 한다.

★지어내지 않는다
  파생 규칙은 앱의 `RosterTab.canSee()` 와 1:1 이다:
    adminOnly==true            -> []            (회원사 비노출. 파일도 rosters_admin/ 에 있다)
    allowedCompanies 이미 있음  -> 그대로 둔다     (담당자가 명시한 값이 우선)
    그 외                      -> region 담당 회사들 (PARTNER_REGIONS 역매핑)
  매핑에 없는 지역(수원시·서초구)은 **[] 로 두어 관리자 전용**이 된다(형 확인 완료).
"""
import io, json, os, subprocess, sys, urllib.request, urllib.error

PROJECT = 'wellshare-logis'
APP_ID = 'wellshare-logis-v1-production-stable'
BASE = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}'
        f'/databases/(default)/documents/artifacts/{APP_ID}/public/data/rosters')

# src/constants/members.ts 와 동일해야 한다. 이관 후 SSOT 는 master_settings.partnerRegions.
PARTNER_REGIONS = {
    '사회적협동조합 행복나눔': ['부천시 원미구', '부천시 오정구', '시흥시', '동대문구'],
    '참자연': ['시흥시'],
    '미소 협동조합': ['여주시'],
    '웰쉐어 사회적협동조합': ['동대문구'],
    '부천희망나르미': ['부천시 소사구', '중구', '종로구', '용산구'],
    '(주)한울': ['동대문구'],
}
REGION_TO_COMPANIES = {}
for _c, _rs in PARTNER_REGIONS.items():
    for _r in _rs:
        REGION_TO_COMPANIES.setdefault(_r, []).append(_c)

APPLY = '--apply' in sys.argv


def token():
    t = os.environ.get('GCP_TOKEN', '').strip()
    if t:
        return t
    return subprocess.run('gcloud auth print-access-token --account ttong627@gmail.com',
                          shell=True, capture_output=True, text=True).stdout.strip()


TOKEN = token()
if not TOKEN:
    raise SystemExit('액세스 토큰을 못 얻었다. gcloud 로그인 확인.')


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


def sval(f, k, d=''):
    return f.get(k, {}).get('stringValue', d)


def arr(f, k):
    v = f.get(k, {}).get('arrayValue')
    if v is None:
        return None                      # 필드 자체가 없음
    return [list(x.values())[0] for x in v.get('values', [])]


docs = call(f'{BASE}?pageSize=300').get('documents', [])
print(f'명단 {len(docs)}건 검사' + ('' if APPLY else '  (예행 — 쓰지 않는다)'))

plans, skipped = [], 0
for d in docs:
    f = d.get('fields', {})
    did = d['name'].split('/')[-1]
    region = sval(f, 'region')
    admin_only = f.get('adminOnly', {}).get('booleanValue', False)
    cur = arr(f, 'allowedCompanies')

    if admin_only:
        want = []
    elif cur:                            # 담당자가 이미 명시한 값은 건드리지 않는다
        skipped += 1
        continue
    else:
        want = REGION_TO_COMPANIES.get(region, [])

    if cur is not None and sorted(cur) == sorted(want):
        skipped += 1
        continue
    plans.append((d['name'], did, region, admin_only, cur, want))

print(f'  변경 없음 {skipped}건 · 변경 대상 {len(plans)}건\n')
for _, did, region, ao, cur, want in plans:
    tag = '관리자전용' if ao else (f'지역 {region}')
    print(f'  {did[:8]}… [{tag}]  {cur if cur is not None else "(필드없음)"} -> {want or "[] (관리자만)"}')

if not APPLY:
    print('\n예행이다. 적용하려면 --apply 를 붙일 것.')
    raise SystemExit(0)

print('\n적용 중…')
ok = 0
for name, did, *_rest, want in plans:
    url = (f'https://firestore.googleapis.com/v1/{name}'
           f'?updateMask.fieldPaths=allowedCompanies')
    body = {'fields': {'allowedCompanies': {
        'arrayValue': {'values': [{'stringValue': c} for c in want]}}}}
    call(url, 'PATCH', body)
    ok += 1
print(f'완료: {ok}/{len(plans)}건 갱신')
