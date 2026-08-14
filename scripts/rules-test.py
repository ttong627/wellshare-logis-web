# -*- coding: utf-8 -*-
"""웰쉐어 플랫폼 Firestore 보안규칙을 시뮬레이터로 검증한다.

    python scripts/rules-test.py                 # 리포의 firestore.rules 를 검증
    RULESET=<id> python scripts/rules-test.py    # 이미 만든 ruleset 검증

★운영 데이터를 건드리지 않는다 — 규칙 엔진에 가상 요청만 넣는다.
★"막힐 것"과 "열려 있어야 할 것"을 **둘 다** 시험한다.
  조이기만 하고 회원사 화면이 비면 그게 더 큰 사고다(2026-08-13 방침).
"""
import io, json, os, subprocess, sys, urllib.request, urllib.error

PROJECT = 'wellshare-logis'
APP = 'wellshare-logis-v1-production-stable'
DB = '/databases/(default)/documents'
DATA = f'{DB}/artifacts/{APP}/public/data'
SETTINGS = f'{DATA}/settings/master_settings'

ADMIN_EMAIL = 'ttong627@gmail.com'          # 규칙에 하드코딩된 관리자
CO_A = '사회적협동조합 행복나눔'
CO_B = '미소 협동조합'
EMAIL_A, EMAIL_B = 'partner_a@example.com', 'partner_b@example.com'

PARTNER_ACCOUNTS = {ADMIN_EMAIL: 'ADMIN', EMAIL_A: CO_A, EMAIL_B: CO_B}

TOKEN = os.environ.get('GCP_TOKEN', '').strip() or subprocess.run(
    'gcloud auth print-access-token --account ttong627@gmail.com',
    shell=True, capture_output=True, text=True).stdout.strip()
if not TOKEN:
    raise SystemExit('액세스 토큰을 못 얻었다.')


def api(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'),
                                 headers={'Authorization': f'Bearer {TOKEN}',
                                          'Content-Type': 'application/json',
                                          'x-goog-user-project': PROJECT}, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit(f'HTTP {e.code}: {e.read().decode()[:600]}')


# master_settings 를 읽는 get()/exists() 흉내 — 규칙의 myCompany·isDynamicAdmin 이 쓴다.
MOCKS = [
    {'function': 'exists', 'args': [{'exactValue': SETTINGS}], 'result': {'value': True}},
    {'function': 'get', 'args': [{'exactValue': SETTINGS}],
     'result': {'value': {'data': {'partnerAccounts': PARTNER_ACCOUNTS}}}},
]


def case(name, email, doc_path, method, expect, resource=None):
    req = {'path': doc_path, 'method': method}
    if email:
        req['auth'] = {'uid': f'uid_{email}', 'token': {'email': email}}
    tc = {'expectation': expect, 'request': req, 'functionMocks': MOCKS}
    if resource is not None:
        tc['resource'] = {'data': resource}
    return (name, tc)


ROSTER_A = {'region': '동대문구', 'month': '2026-08', 'adminOnly': False,
            'allowedCompanies': [CO_A, '(주)한울']}
ROSTER_B = {'region': '여주시', 'month': '2026-08', 'adminOnly': False,
            'allowedCompanies': [CO_B]}
ROSTER_ADMIN = {'region': '수원시', 'month': '2026-08', 'adminOnly': True,
                'allowedCompanies': []}

R = f'{DATA}/rosters/doc1'
LOG = f'{DATA}/access_logs/log1'


def log_case(name, email, method, expect, incoming=None, existing=None):
    """열람기록(append-only) 시험. create 는 request.resource, update/delete 는 resource 를 본다."""
    req = {'path': LOG, 'method': method}
    if email:
        req['auth'] = {'uid': f'uid_{email}', 'token': {'email': email}}
    if incoming is not None:
        req['resource'] = {'data': incoming}
    tc = {'expectation': expect, 'request': req, 'functionMocks': MOCKS}
    if existing is not None:
        tc['resource'] = {'data': existing}
    return (name, tc)


def log_doc(email):
    return {'at': '2026-08-14T00:00:00.000Z', 'kind': 'roster', 'action': 'download',
            'uid': f'uid_{email}', 'email': email, 'company': CO_A,
            'rosterId': 'doc1', 'region': '동대문구', 'month': '2026-08',
            'fileName': 'x.xlsx', 'adminOnly': False}


CASES = [
    # ── 열려 있어야 하는 것 ──
    case('관리자가 명단 읽기',              ADMIN_EMAIL, R, 'get', 'ALLOW', ROSTER_A),
    case('관리자가 관리자전용 명단 읽기',     ADMIN_EMAIL, R, 'get', 'ALLOW', ROSTER_ADMIN),
    case('회원사A가 자기 명단 읽기',         EMAIL_A,     R, 'get', 'ALLOW', ROSTER_A),
    case('회원사B가 자기 명단 읽기',         EMAIL_B,     R, 'get', 'ALLOW', ROSTER_B),
    case('관리자가 명단 업로드',             ADMIN_EMAIL, R, 'create', 'ALLOW', ROSTER_A),
    case('회원사가 정산 읽기(현행 유지)',     EMAIL_A, f'{DATA}/billing_records/2026-08', 'get', 'ALLOW', {}),
    case('회원사가 설정 읽기(현행 유지)',     EMAIL_A, SETTINGS, 'get', 'ALLOW', {}),
    case('비인증 앱버전 읽기(로그인 전 체크)', None, f'{DATA}/settings/app_version', 'get', 'ALLOW', {}),
    # ── 막혀야 하는 것 ──
    case('★회원사A가 남의 명단 읽기',        EMAIL_A,     R, 'get', 'DENY',  ROSTER_B),
    case('★회원사B가 남의 명단 읽기',        EMAIL_B,     R, 'get', 'DENY',  ROSTER_A),
    case('★회원사가 관리자전용 명단 읽기',    EMAIL_A,     R, 'get', 'DENY',  ROSTER_ADMIN),
    case('★비인증 명단 읽기',               None,        R, 'get', 'DENY',  ROSTER_A),
    case('★회원사가 명단 수정',              EMAIL_A,     R, 'update', 'DENY', ROSTER_A),
    case('★회원사가 명단 삭제',              EMAIL_A,     R, 'delete', 'DENY', ROSTER_A),
    # ── 열람기록(access_logs) — 추가만 되고 고치거나 지울 수 없어야 한다 ──
    log_case('열람기록: 본인 이름으로 남기기',      EMAIL_A, 'create', 'ALLOW', log_doc(EMAIL_A)),
    log_case('★열람기록: 남의 이름으로 심기',      EMAIL_A, 'create', 'DENY',  log_doc(EMAIL_B)),
    log_case('★열람기록: 비인증 생성',            None,    'create', 'DENY',  log_doc(EMAIL_A)),
    log_case('★열람기록: 수정(관리자도 불가)',      ADMIN_EMAIL, 'update', 'DENY', log_doc(EMAIL_A), log_doc(EMAIL_A)),
    log_case('★열람기록: 삭제(관리자도 불가)',      ADMIN_EMAIL, 'delete', 'DENY', None, log_doc(EMAIL_A)),
    log_case('★열람기록: 회원사가 읽기',           EMAIL_A, 'get', 'DENY',  None, log_doc(EMAIL_B)),
    log_case('열람기록: 관리자가 읽기',            ADMIN_EMAIL, 'get', 'ALLOW', None, log_doc(EMAIL_A)),
]

ruleset = os.environ.get('RULESET', '').strip()
if ruleset:
    url = f'https://firebaserules.googleapis.com/v1/projects/{PROJECT}/rulesets/{ruleset}:test'
    body = {'testSuite': {'testCases': [c for _, c in CASES]}}
else:
    src = io.open(os.path.join(os.path.dirname(__file__), '..', 'firestore.rules'),
                  encoding='utf-8').read()
    url = f'https://firebaserules.googleapis.com/v1/projects/{PROJECT}:test'
    body = {'source': {'files': [{'name': 'firestore.rules', 'content': src}]},
            'testSuite': {'testCases': [c for _, c in CASES]}}

out = api(url, body)
if 'error' in out:
    raise SystemExit('오류: ' + json.dumps(out['error'], ensure_ascii=False)[:600])

results = out.get('testResults', [])
ok = 0
for (name, spec), res in zip(CASES, results):
    good = res.get('state') == 'SUCCESS'
    ok += good
    print(f'  [{"PASS" if good else "FAIL"}] {name}  (기대 {spec["expectation"]})')
    if not good and res.get('debugMessages'):
        print('        ', str(res['debugMessages'])[:250])
print(f'\n결과: {ok}/{len(CASES)} 통과')
sys.exit(0 if ok == len(CASES) else 1)
