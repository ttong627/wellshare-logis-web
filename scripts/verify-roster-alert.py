# -*- coding: utf-8 -*-
"""rosterAlert 실동작 검증 — 배포 성공 메시지가 아니라 "실제로 흘려보내" 확인한다.

    python scripts/verify-roster-alert.py            # 검증 기록 주입
    python scripts/verify-roster-alert.py --clean    # 주입한 검증 기록만 삭제

★가짜 열람 기록이 감사 자료에 남으면 나중 분석을 오염시킨다.
  그래서 kind='deploy_check' 표식을 달고, 확인 후 반드시 --clean 으로 지운다.
  ⚠️ 규칙상 access_logs 는 append-only(update·delete 불가)다. 이 스크립트는 IAM(관리 API)
     으로 지운다 — 그 경로는 Cloud Audit Log 에 남으므로 "몰래 지우기"가 아니다.
"""
import io, json, os, subprocess, sys, urllib.request, urllib.error

PROJECT = 'wellshare-logis'
APP = 'wellshare-logis-v1-production-stable'
BASE = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}'
        f'/databases/(default)/documents/artifacts/{APP}/public/data/access_logs')
MARK = 'deploy_check'
CLEAN = '--clean' in sys.argv

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
        raise SystemExit(f'HTTP {e.code}: {e.read().decode()[:400]}')


def marked_docs():
    out = call(f'{BASE}?pageSize=300')
    return [d for d in out.get('documents', [])
            if d.get('fields', {}).get('source', {}).get('stringValue') == MARK]


def remove_marked():
    docs = marked_docs()
    for d in docs:
        call(f"https://firestore.googleapis.com/v1/{d['name']}", 'DELETE')
    return len(docs)


if CLEAN:
    print(f'검증 기록 삭제: {remove_marked()}건')
    raise SystemExit(0)

stale = remove_marked()
if stale:
    print(f'(이전 검증 잔재 {stale}건 정리)')

from datetime import datetime, timezone
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

# 임계(8건)를 넘겨 대량 규칙이 걸리게, 지역도 4곳 이상으로 지역 규칙까지 걸리게 한다.
REGIONS = ['동대문구', '여주시', '시흥시', '부천시 원미구', '중구',
           '종로구', '부천시 오정구', '수원시', '서초구']
made = 0
for i, region in enumerate(REGIONS):
    body = {'fields': {
        'at': {'stringValue': now},
        'kind': {'stringValue': 'roster'},
        'action': {'stringValue': 'download'},
        'uid': {'stringValue': 'uid_deploy_check'},
        'email': {'stringValue': 'deploy_check@example.invalid'},
        'company': {'stringValue': '검증용'},
        'rosterId': {'stringValue': f'verify_{i}'},
        'region': {'stringValue': region},
        'month': {'stringValue': '2026-08'},
        'fileName': {'stringValue': f'verify_{i}.xlsx'},
        'adminOnly': {'booleanValue': False},
        'source': {'stringValue': MARK},
    }}
    call(BASE, 'POST', body)
    made += 1

print(f'주입 완료: {made}건 (지역 {len(set(REGIONS))}곳)')
print('→ 텔레그램 도착 여부와 rosterAlert 로그를 확인한 뒤 --clean 으로 지울 것')
