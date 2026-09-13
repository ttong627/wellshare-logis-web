'use strict';
// adminSetPassword 관리자 판정·대상 제한 테스트 — node --test functions/test/adminGuard.test.js (폴더 지정은 Windows 에서 실패)
// 2026-09-13 코난: 이메일 문자열만 보고 관리자로 인정하고(인증 여부 무시) 누구의 비밀번호든 바꿔,
// 동적 관리자 한 명만 뚫려도 최고 관리자 비밀번호를 바꿔 발행 권한까지 가져갈 수 있었다.
// 2026-09-13 코난 재검증: 호출자는 규칙(firestore.rules isAdminEmail·isDynamicAdmin)과 **똑같이 정확한 키**로,
// 대상은 대소문자만 다른 키 중 **하나라도** ADMIN 이면 보호(키 순서에 따라 결과가 바뀌면 안 된다).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { callerAdminEmail, assertTargetNotAdmin } = require('../adminGuard.js');

const ADMINS = ['ttong@wssc.kr', 'ttong627@gmail.com'];
const PARTNERS = { 'dyn@hb.com': 'ADMIN', 'co@partner.kr': '행복나눔' };
const tok = (over) => ({ email: 'ttong@wssc.kr', email_verified: true, firebase: { sign_in_provider: 'password' }, ...over });

test('호출자: 인증된 하드코딩 관리자 → 인정', () => {
  assert.equal(callerAdminEmail(tok({}), ADMINS, PARTNERS), 'ttong@wssc.kr');
});

test('호출자: 인증된 동적 관리자(규칙과 같은 정확한 키) → 인정', () => {
  assert.equal(callerAdminEmail(tok({ email: 'dyn@hb.com' }), ADMINS, PARTNERS), 'dyn@hb.com');
});

test('호출자: 규칙이 인정하지 않는 대소문자 차이 → 거부(함수가 규칙보다 넓으면 안 된다)', () => {
  assert.equal(callerAdminEmail(tok({ email: 'Dyn@HB.com' }), ADMINS, PARTNERS), null);
  assert.equal(callerAdminEmail(tok({ email: 'dyn@x.kr' }), ADMINS, { 'Dyn@x.kr': 'ADMIN' }), null);
  assert.equal(callerAdminEmail(tok({ email: 'TTONG@wssc.kr' }), ADMINS, PARTNERS), null);
});

test('호출자: 미인증 관리자 이메일 → 거부', () => {
  assert.equal(callerAdminEmail(tok({ email_verified: false }), ADMINS, PARTNERS), null);
  assert.equal(callerAdminEmail(tok({ email: 'dyn@hb.com', email_verified: undefined }), ADMINS, PARTNERS), null);
});

test('호출자: 익명·이메일 없음·회원사·모르는 이메일·프로토타입 키 → 거부', () => {
  assert.equal(callerAdminEmail(tok({ firebase: { sign_in_provider: 'anonymous' } }), ADMINS, PARTNERS), null);
  assert.equal(callerAdminEmail(tok({ email: undefined }), ADMINS, PARTNERS), null);
  assert.equal(callerAdminEmail(tok({ email: 'co@partner.kr' }), ADMINS, PARTNERS), null);
  assert.equal(callerAdminEmail(tok({ email: 'nobody@x.kr' }), ADMINS, PARTNERS), null);
  assert.equal(callerAdminEmail(tok({ email: 'constructor' }), ADMINS, PARTNERS), null);
  assert.equal(callerAdminEmail(null, ADMINS, PARTNERS), null);
});

test('대상: 회원사 계정 → 허용', () => {
  assert.equal(assertTargetNotAdmin('co@partner.kr', ADMINS, PARTNERS), true);
});

test('대상: 하드코딩 관리자·동적 관리자 → 거부(대소문자 무시)', () => {
  assert.equal(assertTargetNotAdmin('TTONG@wssc.kr', ADMINS, PARTNERS), false);
  assert.equal(assertTargetNotAdmin('dyn@hb.com', ADMINS, PARTNERS), false);
  assert.equal(assertTargetNotAdmin('DYN@hb.com', ADMINS, PARTNERS), false);
});

test('대상: 대소문자만 다른 중복 키 중 하나라도 ADMIN → 키 순서와 무관하게 거부', () => {
  assert.equal(assertTargetNotAdmin('admin@x.kr', ADMINS, { 'admin@x.kr': 'ADMIN', 'Admin@x.kr': '행복' }), false);
  assert.equal(assertTargetNotAdmin('admin@x.kr', ADMINS, { 'Admin@x.kr': '행복', 'admin@x.kr': 'ADMIN' }), false);
  assert.equal(assertTargetNotAdmin('admin@x.kr', ADMINS, { 'Admin@x.kr': 'ADMIN' }), false);
});

test('대상: 이메일 없음·빈 값 → 거부', () => {
  assert.equal(assertTargetNotAdmin('', ADMINS, PARTNERS), false);
  assert.equal(assertTargetNotAdmin(undefined, ADMINS, PARTNERS), false);
});
