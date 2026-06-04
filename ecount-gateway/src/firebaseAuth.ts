// Firebase ID 토큰 검증 미들웨어.
//  - requireAdmin    : wellshare-logis 토큰 + 관리자 이메일 allowlist (기존)
//  - requireAdminTms : tms-local-frontend 토큰 + app_users/{uid}.role 이 admin(레벨2) 이상
//    (TMS는 아이디 로그인 → 합성 이메일이라 이메일 allowlist 불가. 역할 기반 인가)
import admin from 'firebase-admin';
import { Firestore } from '@google-cloud/firestore';
import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from './config';

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
  // 게이트웨이 프로젝트(gen-lang-client) 기본 DB = TMS app_users 위치(동일 프로젝트)
  const db = new Firestore();

  function bearer(req: Request): string | null {
    const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
  }

  // wellshare: 이메일 allowlist
  async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
    const tok = bearer(req);
    if (!tok) { res.status(401).json({ ok: false, error: 'unauthorized', message: '인증 토큰이 없습니다' }); return; }
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(tok, false);
    } catch {
      res.status(401).json({ ok: false, error: 'invalid_token', message: '토큰 검증 실패' });
      return;
    }
    const email = (decoded.email || '').toLowerCase();
    if (!email || !config.adminEmails.has(email)) {
      res.status(403).json({ ok: false, error: 'forbidden', message: '관리자 권한이 없습니다' });
      return;
    }
    req.user = { uid: decoded.uid, email };
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

  return { requireAdmin, requireAdminTms };
}
