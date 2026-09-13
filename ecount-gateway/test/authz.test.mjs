// 관리자 판정 규칙 테스트 — node --test (빌드 산출물 dist/authz.js 를 시험한다)
// 2026-09-13 코코 H2: 이메일 문자열만 보고 관리자로 통과시키던 구멍. 인증된 이메일만 관리자다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAdminClaims, checkAccountRecord, classifyVerifyError } from '../dist/authz.js';

// 토큰 검증이 실패했을 때 「토큰이 나쁘다」와 「우리 쪽이 조회를 못 했다」를 가른다(코난 2026-09-13).
// 권한 누락·네트워크·할당량을 401 invalid_token 으로 보내면 화면에 "인증 만료"만 떠서 재로그인만 반복한다.
// 코난 재검증: 502 목록을 늘려 가면 빠진 코드가 또 401 로 샌다 → **401 은 토큰 문제로 확인된 코드만**, 나머지는 전부 502.
// 코드 문자열은 firebase-admin 13.10.0 utils/error.js · auth/token-verifier.js 원문 대조.
test('검증 오류 분류: 만료·형식·서명 오류 토큰 → 401 invalid_token', () => {
  for (const code of ['auth/id-token-expired', 'auth/argument-error', 'auth/invalid-id-token']) {
    assert.deepEqual(classifyVerifyError(code), { status: 401, error: 'invalid_token' }, code);
  }
});

// 제시 2026-09-13 보충: 구글 공개키를 못 받아오면 firebase-admin 이 argument-error 로 바꿔 던진다(token-verifier.js:283).
// 코드만으로는 위조 토큰과 구분이 안 되니 메시지로 가른다 — 우리 쪽 조회 실패다.
test('검증 오류 분류: 공개키 조회 실패(argument-error) → 502 auth_lookup_failed', () => {
  assert.deepEqual(
    classifyVerifyError('auth/argument-error', 'Error fetching public keys for Google certs: getaddrinfo ENOTFOUND'),
    { status: 502, error: 'auth_lookup_failed' },
  );
  // 네트워크 단절·시간초과는 HttpClient 메시지가 그대로 온다(api-request.js:266·268 → jwt.js:268)
  assert.deepEqual(
    classifyVerifyError('auth/argument-error', 'Error while making request: getaddrinfo ENOTFOUND www.googleapis.com. Error code: ENOTFOUND'),
    { status: 502, error: 'auth_lookup_failed' },
  );
  assert.deepEqual(classifyVerifyError('auth/argument-error', 'Firebase ID token has invalid signature.'), { status: 401, error: 'invalid_token' });
  assert.deepEqual(classifyVerifyError('auth/argument-error', undefined), { status: 401, error: 'invalid_token' });
});

test('검증 오류 분류: 정지·폐기·삭제된 계정 → 401 token_revoked', () => {
  for (const code of ['auth/user-disabled', 'auth/id-token-revoked', 'auth/user-not-found']) {
    assert.deepEqual(classifyVerifyError(code), { status: 401, error: 'token_revoked' }, code);
  }
});

test('검증 오류 분류: 권한·네트워크·할당량·내부·자격증명·모르는 오류 → 502 auth_lookup_failed', () => {
  for (const code of ['auth/internal-error', 'auth/insufficient-permission', 'auth/quota-exceeded', 'auth/invalid-credential', 'app/network-error', 'app/network-timeout', 'app/invalid-credential', 'app/internal-error', 'auth/some-new-code', undefined]) {
    assert.deepEqual(classifyVerifyError(code), { status: 502, error: 'auth_lookup_failed' }, String(code));
  }
});

const admins = new Set(['admin@wssc.kr']);
const tok = (over) => ({ uid: 'u1', email: 'admin@wssc.kr', email_verified: true, firebase: { sign_in_provider: 'password' }, ...over });

test('허용목록 이메일 + 토큰에 인증 표시 → 통과(추가 조회 불필요)', () => {
  assert.deepEqual(checkAdminClaims(tok({}), admins), { ok: true, email: 'admin@wssc.kr', needsVerifiedLookup: false });
});

test('대소문자가 달라도 같은 이메일로 본다', () => {
  assert.equal(checkAdminClaims(tok({ email: 'Admin@WSSC.kr' }), admins).ok, true);
});

test('토큰에 미인증 → 서버 조회로 확인하라고 넘긴다(토큰 갱신 시차 대비)', () => {
  assert.deepEqual(checkAdminClaims(tok({ email_verified: false }), admins), { ok: true, email: 'admin@wssc.kr', needsVerifiedLookup: true });
});

test('허용목록 밖 이메일 → 거부', () => {
  assert.deepEqual(checkAdminClaims(tok({ email: 'someone@else.kr' }), admins), { ok: false, reason: 'not_allowlisted' });
});

test('이메일 없음 → 거부', () => {
  assert.deepEqual(checkAdminClaims(tok({ email: undefined }), admins), { ok: false, reason: 'no_email' });
});

test('익명 로그인 → 이메일이 맞아도 거부', () => {
  assert.deepEqual(checkAdminClaims(tok({ firebase: { sign_in_provider: 'anonymous' } }), admins), { ok: false, reason: 'anonymous' });
});

// 토큰이 미인증일 때 서버에서 조회한 **현재 계정 상태**로 최종 판정한다(제시 2026-09-13 보충:
// 인증 여부만 보면 정지된 계정·이메일이 바뀐 계정도 통과하고, 삭제된 계정은 502 가 나갔다).
test('계정 확인: 인증·활성·같은 이메일 → 통과', () => {
  assert.deepEqual(checkAccountRecord({ email: 'Admin@wssc.kr', emailVerified: true, disabled: false }, 'admin@wssc.kr'), { ok: true });
});

test('계정 확인: 삭제된 계정(조회 결과 없음) → 거부', () => {
  assert.deepEqual(checkAccountRecord(null, 'admin@wssc.kr'), { ok: false, reason: 'not_found' });
});

test('계정 확인: 정지된 계정 → 인증돼 있어도 거부', () => {
  assert.deepEqual(checkAccountRecord({ email: 'admin@wssc.kr', emailVerified: true, disabled: true }, 'admin@wssc.kr'), { ok: false, reason: 'disabled' });
});

test('계정 확인: 토큰 발급 뒤 이메일이 바뀜 → 거부', () => {
  assert.deepEqual(checkAccountRecord({ email: 'other@wssc.kr', emailVerified: true, disabled: false }, 'admin@wssc.kr'), { ok: false, reason: 'email_mismatch' });
});

test('계정 확인: 아직 미인증 → 거부', () => {
  assert.deepEqual(checkAccountRecord({ email: 'admin@wssc.kr', emailVerified: false, disabled: false }, 'admin@wssc.kr'), { ok: false, reason: 'email_not_verified' });
});
