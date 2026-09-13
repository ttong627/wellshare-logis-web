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

// 토큰 검증(verifyIdToken checkRevoked=true) 실패 분류 — 「토큰이 나쁘다」와 「우리가 조회를 못 했다」를 가른다.
// 권한 누락·네트워크·할당량을 401 invalid_token 으로 보내면 화면엔 "인증 만료"만 떠서 재로그인만 반복한다(코난 2026-09-13).
// 코난 재검증: 502 목록을 늘려 가는 방식은 빠진 코드(auth/invalid-credential 등)가 또 401 로 샌다
//   → **401 은 토큰·계정 문제로 확인된 코드만** 두고 나머지는 전부 502. 어느 쪽이든 요청은 거부된다.
// 코드 문자열: firebase-admin 13.10.0 utils/error.js · auth/token-verifier.js(서명·kid 오류도 argument-error 로 온다).
const INVALID_TOKEN_CODES = new Set(['auth/id-token-expired', 'auth/argument-error', 'auth/invalid-id-token']);
const REVOKED_CODES = new Set(['auth/user-disabled', 'auth/id-token-revoked', 'auth/user-not-found']);

export type VerifyErrorClass =
  | { status: 401; error: 'invalid_token' | 'token_revoked' }
  | { status: 502; error: 'auth_lookup_failed' };

// 구글 공개키를 못 받아와도 firebase-admin 은 argument-error 로 바꿔 던진다(token-verifier.js:283) — 코드로는
// 위조 토큰과 구분이 안 되니 메시지로 가른다(제시 2026-09-13). HTTP 오류 응답은 jwt.js:136, 네트워크 단절·시간초과는 api-request.js:266·268 문구.
// ⛔**맨 앞 일치만** 본다(코난 2026-09-13): 서명 검사 전에 도는 내용 검사가 공격자가 넣은 aud·iss·alg 값을 메시지 중간에
//   옮겨 적어서, 「포함」으로 보면 위조 토큰이 502(인증 서버 장애)로 위장된다. 내용 검사 문구는 전부 고정 문구
//   (`Firebase ID token has …`·`verifyIdToken expects …`·`Decoding Firebase ID token failed …`)로 시작한다.
//   실제 firebase-admin 메시지로 확인하는 시험: test/firebase-admin-messages.test.mjs (firebase-admin 을 올리면 문구가 바뀔 수 있다).
const KEY_FETCH_FAILURE_MESSAGES = ['Error fetching public keys', 'Error while making request'];

export function classifyVerifyError(code: string | undefined, message?: string): VerifyErrorClass {
  if (code && REVOKED_CODES.has(code)) return { status: 401, error: 'token_revoked' };
  const keyFetchFailed = !!message && KEY_FETCH_FAILURE_MESSAGES.some((m) => message.startsWith(m));
  if (code && INVALID_TOKEN_CODES.has(code) && !keyFetchFailed) return { status: 401, error: 'invalid_token' };
  return { status: 502, error: 'auth_lookup_failed' };
}

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
