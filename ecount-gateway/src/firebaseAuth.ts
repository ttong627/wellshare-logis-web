// Firebase ID 토큰 검증 미들웨어.
//  - requireAdmin    : wellshare-logis 토큰 + 관리자 이메일 allowlist (기존)
//  - requireAdminTms : tms-local-frontend 토큰 + app_users/{uid}.role 이 admin(레벨2) 이상
//    (TMS는 아이디 로그인 → 합성 이메일이라 이메일 allowlist 불가. 역할 기반 인가)
import admin from 'firebase-admin';
import { Firestore } from '@google-cloud/firestore';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from './config';
import { checkAdminClaims, checkAccountRecord, classifyVerifyError } from './authz';

export interface AuthedRequest extends Request {
  user?: { uid: string; email: string };
}

// TMS(app_users) 권한 레벨 — 앱 AuthContext.ROLE_LEVEL과 동일. admin(2) 이상 허용.
const TMS_ROLE_LEVEL: Record<string, number> = { super_master: 4, top_admin: 3, admin: 2, staff: 1 };
const TMS_MIN_LEVEL = 2;

export function initAuth(config: AppConfig) {
  // 기본 앱: wellshare-logis 토큰 검증
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: config.firebaseProjectId });
  }
  // TMS 앱(선택): tms-local-frontend 토큰 검증용 2번째 admin 앱
  let tmsAuth: admin.auth.Auth | null = null;
  if (config.tmsFirebaseProjectId) {
    const existing = admin.apps.find((a) => a?.name === 'tms') ?? null;
    const tmsApp = existing ?? admin.initializeApp({ projectId: config.tmsFirebaseProjectId }, 'tms');
    tmsAuth = admin.auth(tmsApp);
  }
  // 게이트웨이가 도는 프로젝트(wellshare-logis)의 기본 DB. requireAdminTms 의 app_users 조회용이지만
  // TMS 는 2026-09-13 logis-TMS 철거로 폐기(TMS_FIREBASE_PROJECT_ID 없음 → /ecount/sale-tms 500).
  const db = new Firestore();

  function bearer(req: Request): string | null {
    const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
  }

  // wellshare: **인증된** 이메일 + 관리자 allowlist (판정 규칙은 authz.ts)
  async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
    const tok = bearer(req);
    if (!tok) { res.status(401).json({ ok: false, error: 'unauthorized', message: '인증 토큰이 없습니다' }); return; }
    let decoded: admin.auth.DecodedIdToken;
    try {
      // checkRevoked=true: 정지·폐기된 계정의 남은 토큰(최대 1시간)도 막는다(제시 2026-09-13).
      //   예전엔 토큰 발급 프로젝트의 Auth 를 조회할 권한이 없어 false 였다 — 이제 전용 SA 에 firebaseauth.viewer 가 있다.
      decoded = await admin.auth().verifyIdToken(tok, true);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const v = classifyVerifyError(code, (e as { message?: string })?.message);
      if (v.status === 502) console.error(JSON.stringify({ severity: 'ERROR', message: 'verifyIdToken lookup failed', code }));
      const message =
        v.error === 'auth_lookup_failed' ? '계정 확인 실패(인증 서버 조회 오류) — 잠시 뒤 다시 시도하세요'
          : v.error === 'token_revoked' ? '정지되었거나 로그인이 취소된 계정입니다. 다시 로그인하세요'
            : '토큰 검증 실패';
      res.status(v.status).json({ ok: false, error: v.error, message });
      return;
    }
    const check = checkAdminClaims(decoded, config.adminEmails);
    if (!check.ok) {
      res.status(403).json({ ok: false, error: 'forbidden', message: '관리자 권한이 없습니다' });
      return;
    }
    if (check.needsVerifiedLookup) {
      // 토큰이 발급된 뒤에 인증 처리된 계정일 수 있다(토큰 클레임은 최대 1시간 옛값) → 현재 계정 상태로 판정
      let record: admin.auth.UserRecord | null = null;
      try {
        record = await admin.auth().getUser(decoded.uid);
      } catch (e) {
        if ((e as { code?: string })?.code !== 'auth/user-not-found') {
          res.status(502).json({ ok: false, error: 'auth_lookup_failed', message: '계정 확인 실패' });
          return;
        }
      }
      const acc = checkAccountRecord(record, check.email);
      if (!acc.ok) {
        const unverified = acc.reason === 'email_not_verified';
        res.status(403).json({
          ok: false,
          error: unverified ? 'email_not_verified' : 'forbidden',
          message: unverified ? '이메일 인증이 필요합니다' : '관리자 권한이 없습니다',
        });
        return;
      }
    }
    req.user = { uid: decoded.uid, email: check.email };
    next();
  }

  // TMS: app_users/{uid}.role 이 admin(레벨2) 이상이면 허용 (관리자 전원)
  async function requireAdminTms(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
    const tok = bearer(req);
    if (!tok) { res.status(401).json({ ok: false, error: 'unauthorized', message: '인증 토큰이 없습니다' }); return; }
    if (!tmsAuth) { res.status(500).json({ ok: false, error: 'internal', message: 'TMS 인증 미설정' }); return; }
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await tmsAuth.verifyIdToken(tok, false);
    } catch {
      res.status(401).json({ ok: false, error: 'invalid_token', message: '토큰 검증 실패' });
      return;
    }
    let role = '';
    try {
      const snap = await db.collection('app_users').doc(decoded.uid).get();
      role = (snap.exists ? ((snap.data() as Record<string, unknown>)?.role as string) : '') || '';
    } catch {
      res.status(502).json({ ok: false, error: 'role_lookup_failed', message: '권한 조회 실패' });
      return;
    }
    if ((TMS_ROLE_LEVEL[role] || 0) < TMS_MIN_LEVEL) {
      res.status(403).json({ ok: false, error: 'forbidden', message: '관리자 권한이 없습니다' });
      return;
    }
    req.user = { uid: decoded.uid, email: (decoded.email || '').toLowerCase() };
    next();
  }

  // 서버-투-서버(구 admin PHP): 공유 시크릿 헤더(x-server-key) 검증. serverKey 미설정 시 항상 거부(503).
  function requireServerKey(req: AuthedRequest, res: Response, next: NextFunction): void {
    const key = config.serverKey;
    if (!key) { res.status(503).json({ ok: false, error: 'server_key_disabled', message: '서버 발행 경로 비활성' }); return; }
    const provided = String(req.headers['x-server-key'] || '');
    const a = Buffer.from(provided);
    const b = Buffer.from(key);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ ok: false, error: 'unauthorized', message: '서버 키가 올바르지 않습니다' });
      return;
    }
    req.user = { uid: 'server-admin', email: '' };
    next();
  }

  return { requireAdmin, requireAdminTms, requireServerKey };
}
