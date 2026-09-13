'use strict';
// adminSetPassword 관리자 판정·대상 제한 — 순수 함수(테스트: test/adminGuard.test.js).
// 2026-09-13 코난: 이메일 문자열만 보고 관리자로 인정하고(인증 여부 무시) 누구의 비밀번호든 바꿔,
// 동적 관리자 한 명만 뚫려도 최고 관리자 비밀번호를 바꿔 발행 권한까지 가져갈 수 있었다.
// 규칙(firestore.rules isAdminEmail·isDynamicAdmin)·게이트웨이(authz.ts)와 같은 기준: **인증된 이메일만 관리자**.
// 2026-09-13 코난 재검증:
//   · 호출자는 규칙과 **똑같이 정확한 문자열**로 본다 — 소문자로 맞춰 보면 규칙이 인정하지 않는 사람까지 관리자가 된다.
//   · 대상은 대소문자만 다른 키 중 **하나라도** ADMIN 이면 보호 — 키를 한 객체로 합치면 마지막 값이 덮어써
//     `{admin@x:ADMIN, Admin@x:회원사}` 처럼 순서에 따라 보호가 풀렸다.

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

// 호출자가 관리자면 이메일, 아니면 null.
function callerAdminEmail(token, adminEmails, partnerAccounts) {
  if (!token || token.email_verified !== true) return null;
  if (token.firebase && token.firebase.sign_in_provider === 'anonymous') return null;
  const email = typeof token.email === 'string' ? token.email : '';
  if (!email) return null;
  if (adminEmails.includes(email)) return email;
  if (hasOwn(partnerAccounts, email) && partnerAccounts[email] === 'ADMIN') return email;
  return null;
}

// 대상이 관리자 계정(또는 빈 값)이면 false — 관리자 비밀번호는 이 기능으로 바꿀 수 없다(본인이 직접 변경).
function assertTargetNotAdmin(targetEmail, adminEmails, partnerAccounts) {
  const target = String(targetEmail || '').trim().toLowerCase();
  if (!target) return false;
  if (adminEmails.some((e) => String(e).toLowerCase() === target)) return false;
  const adminVariant = Object.entries(partnerAccounts || {})
    .some(([k, v]) => v === 'ADMIN' && String(k).trim().toLowerCase() === target);
  return !adminVariant;
}

module.exports = { callerAdminEmail, assertTargetNotAdmin };
