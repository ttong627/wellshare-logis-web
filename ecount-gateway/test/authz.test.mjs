// 관리자 판정 규칙 테스트 — node --test (빌드 산출물 dist/authz.js 를 시험한다)
// 2026-09-13 코코 H2: 이메일 문자열만 보고 관리자로 통과시키던 구멍. 인증된 이메일만 관리자다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAdminClaims, checkAccountRecord } from '../dist/authz.js';

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
