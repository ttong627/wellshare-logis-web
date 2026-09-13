// 관리자 판정 — 토큰 클레임만 보고 결정할 수 있는 부분(순수 함수, 테스트: test/authz.test.mjs).
// 2026-09-13 코코 H2: 이메일 문자열만 맞으면 관리자로 통과시켜, 허용목록 이메일로 누가 먼저 가입하면
// 미인증 계정으로도 발행할 수 있었다. 이제 **인증된 이메일**만 관리자다.
// 토큰의 email_verified 는 발급 시점 값이라 계정을 막 인증 처리했으면 최대 1시간 false 로 남는다 —
// 그때는 거부하지 않고 needsVerifiedLookup 로 넘겨 서버에서 계정 상태를 한 번 더 조회한다.

export interface AdminClaims {
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
}

export type AdminClaimCheck =
  | { ok: true; email: string; needsVerifiedLookup: boolean }
  | { ok: false; reason: 'anonymous' | 'no_email' | 'not_allowlisted' };

export interface AccountRecord {
  email?: string;
  emailVerified?: boolean;
  disabled?: boolean;
}

export type AccountRecordCheck =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'disabled' | 'email_mismatch' | 'email_not_verified' };

// 토큰이 미인증일 때 서버에서 조회한 **현재 계정**으로 최종 판정한다.
// 인증 여부만 보면 정지된 계정·토큰 발급 뒤 이메일이 바뀐 계정도 통과한다(제시 2026-09-13 보충).
export function checkAccountRecord(record: AccountRecord | null, tokenEmail: string): AccountRecordCheck {
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.disabled === true) return { ok: false, reason: 'disabled' };
  if ((record.email || '').toLowerCase() !== tokenEmail.toLowerCase()) return { ok: false, reason: 'email_mismatch' };
  if (record.emailVerified !== true) return { ok: false, reason: 'email_not_verified' };
  return { ok: true };
}

export function checkAdminClaims(claims: AdminClaims, adminEmails: Set<string>): AdminClaimCheck {
  if (claims.firebase?.sign_in_provider === 'anonymous') return { ok: false, reason: 'anonymous' };
  const email = (claims.email || '').toLowerCase();
  if (!email) return { ok: false, reason: 'no_email' };
  if (!adminEmails.has(email)) return { ok: false, reason: 'not_allowlisted' };
  return { ok: true, email, needsVerifiedLookup: claims.email_verified !== true };
}
