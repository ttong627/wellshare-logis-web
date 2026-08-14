# -*- coding: utf-8 -*-
"""billing_records 회사별 서브컬렉션 마이그레이션 (1단계 · 이중쓰기).

    python scripts/migrate-billing-subcollections.py            # dry-run(계획만)
    python scripts/migrate-billing-subcollections.py --apply    # 실제 복사
    python scripts/migrate-billing-subcollections.py --rollback # 서브독 삭제(되돌리기)

★설계: project_wellshare_billing_isolation. 회사별 격리를 위해 통합문서의 회사별 필드를
  서브컬렉션(문서ID=회사)으로 승격한다. **부모 원본은 그대로 둔다(이중쓰기 이행기간)** —
  앱·규칙 전환이 끝난 뒤 별도 단계에서 부모 중복필드를 제거한다.

  billing_records/{월}/partnerInputs/{회사}   ← partnerInputs[회사]
  billing_records/{월}/deliveryDates/{회사}   ← deliveryDates[회사]
  billing_records/{월}/publishDates/{회사}    ← publishDates[회사]
  billing_records/{월}/publishRequests/{회사} ← publishRequests[회사]
  billing_admin/{월}  {ecountSales}           ← ecountSales (관리자 전용 이전)

★값 그대로 복사(가공 없음). 각 서브독에 _company·_month 메타만 덧붙인다.
"""
import io, json, os, subprocess, sys, urllib.request, urllib.parse, urllib.error

PROJECT = 'wellshare-logis'
APP = 'wellshare-logis-v1-production-stable'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
PARENT = f'{BASE}/artifacts/{APP}/public/data/billing_records'
ADMIN = f'{BASE}/artifacts/{APP}/public/data/billing_admin'
MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']
COMPANY_FIELDS = ['partnerInputs', 'deliveryDates', 'publishDates', 'publishRequests']

APPLY = '--apply' in sys.argv
ROLLBACK = '--rollback' in sys.argv

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
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise SystemExit(f'HTTP {e.code} {url}\n{e.read().decode()[:300]}')


def enc(seg):
    return urllib.parse.quote(seg, safe='')


plans = []      # (설명, 서브독URL, fields)
for m in MONTHS:
    doc = call(f'{PARENT}/{m}')
    if not doc or 'fields' not in doc:
        continue
    f = doc['fields']
    for field in COMPANY_FIELDS:
        companies = f.get(field, {}).get('mapValue', {}).get('fields', {})
        for company, val in companies.items():
            # val = 그 회사의 값(mapValue 등). 서브독 fields 로 그대로.
            inner = val.get('mapValue', {}).get('fields', {})
            new_fields = dict(inner)
            new_fields['_company'] = {'stringValue': company}
            new_fields['_month'] = {'stringValue': m}
            url = f'{PARENT}/{m}/{field}/{enc(company)}'
            plans.append((f'{m}/{field}/{company}', url, {'fields': new_fields}))
    # ecountSales → billing_admin/{월}
    ec = f.get('ecountSales')
    if ec is not None:
        url = f'{ADMIN}/{m}?updateMask.fieldPaths=ecountSales'
        plans.append((f'{m}/billing_admin(ecountSales)', url, {'fields': {'ecountSales': ec}}))

print(f'{"[ROLLBACK]" if ROLLBACK else "[APPLY]" if APPLY else "[DRY-RUN]"} 대상 {len(plans)}건\n')
for desc, _, _ in plans:
    print(f'  {desc}')

if ROLLBACK:
    print('\n서브독 삭제 중...')
    n = 0
    for desc, url, _ in plans:
        base_url = url.split('?')[0]
        if 'billing_admin' in url:
            # ecountSales 필드만 제거
            call(f'{ADMIN}/{desc.split("/")[0]}?updateMask.fieldPaths=ecountSales', 'PATCH', {'fields': {}})
        else:
            call(base_url, 'DELETE')
        n += 1
    print(f'삭제 {n}건 완료')
    raise SystemExit(0)

if not APPLY:
    print('\ndry-run 이다. 부모 원본은 유지되고 서브독만 생긴다(이중쓰기). --apply 로 실행.')
    raise SystemExit(0)

print('\n서브독 생성 중(부모 원본 유지)...')
ok = 0
for desc, url, body in plans:
    call(url, 'PATCH', body)
    ok += 1
print(f'완료: {ok}/{len(plans)}건')
