# -*- coding: utf-8 -*-
"""billing_records 부모의 회사별 중복 필드 제거 (격리 7단계 · 이중쓰기 종료).

    python scripts/clean-billing-parent.py            # dry-run(계획+백업만)
    python scripts/clean-billing-parent.py --apply    # 실제 제거(백업 먼저 저장)

★왜 필수: 부모 문서 read 는 인증자 전체에 열려 있다(공통 필드=비민감). 그런데 부모에 회사별
  필드(partnerInputs 등)가 남아 있으면 **회원사가 부모를 read 해 남의 정산을 통째로 본다** —
  서브컬렉션 격리가 무의미해진다. 회사별 필드는 이미 서브컬렉션으로 이관됐으므로(마이그레이션 1단계),
  부모에서 제거해야 격리가 완성된다. 앱은 이미 서브독을 읽으므로 부모 제거는 화면에 무영향.

  제거 대상(부모): partnerInputs · deliveryDates · publishDates · publishRequests · ecountSales
  유지(부모 공통): zonePrices · regions · orders · isClosed · version · updatedAt · updatedBy

★안전: 제거 전 부모 전체를 백업 파일로 저장한다. 서브컬렉션에 원본이 있어(이중쓰기) 복원 가능.
"""
import io, json, os, subprocess, sys, urllib.request, urllib.error

PROJECT = 'wellshare-logis'
APP = 'wellshare-logis-v1-production-stable'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
PARENT = f'{BASE}/artifacts/{APP}/public/data/billing_records'
MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']
REMOVE = ['partnerInputs', 'deliveryDates', 'publishDates', 'publishRequests', 'ecountSales']
BACKUP = os.path.join(os.path.dirname(__file__), 'billing_parent_backup.json')

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
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise SystemExit(f'HTTP {e.code} {url}\n{e.read().decode()[:300]}')


backup = {}
plans = []
for m in MONTHS:
    doc = call(f'{PARENT}/{m}')
    if not doc or 'fields' not in doc:
        continue
    backup[m] = doc['fields']
    present = [f for f in REMOVE if f in doc['fields']]
    if present:
        plans.append((m, present))

# 백업 저장(항상)
io.open(BACKUP, 'w', encoding='utf-8').write(json.dumps(backup, ensure_ascii=False, indent=1))
print(f'{"[APPLY]" if APPLY else "[DRY-RUN]"} 백업 저장: {BACKUP}\n')
print(f'제거 대상 {len(plans)}개 월:')
for m, fields in plans:
    print(f'  {m}: {fields}')

if not APPLY:
    print('\ndry-run 이다. 부모 회사별 필드는 그대로다. --apply 로 제거(백업은 이미 저장됨).')
    raise SystemExit(0)

print('\n부모 회사별 필드 제거 중...')
ok = 0
for m, fields in plans:
    mask = '&'.join(f'updateMask.fieldPaths={f}' for f in fields)
    call(f'{PARENT}/{m}?{mask}', 'PATCH', {'fields': {}})
    ok += 1
print(f'완료: {ok}개 월 정리. 부모는 이제 공통 필드만.')
