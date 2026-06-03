// Firebase ID 토큰 검증 미들웨어.
// 토큰은 wellshare-logis 프로젝트가 발급 → projectId 명시 초기화로 aud/iss 검증.
// 공개 인증서로 서명 검증하므로 서비스계정 키 불필요.
import admin from 'firebase-admin';
import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from './config';

export interface AuthedRequest extends Request {
  user?: { uid: string; email: string };
}

export function initAuth(config: AppConfig) {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: config.firebaseProjectId });
  }

  async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ ok: false, error: 'unauthorized', message: '인증 토큰이 없습니다' });
      return;
    }

    let decoded: admin.auth.DecodedIdToken;
    try {
      // checkRevoked=false: 매 요청 Auth 백엔드 호출 회피 (관리자 소수 + 멱등성으로 충분)
      decoded = await admin.auth().verifyIdToken(match[1], false);
    } catch {
      res.status(401).json({ ok: false, error: 'invalid_token', message: '토큰 검증 실패' });
      return;
    }

    if (decoded.email_verified !== true) {
      res.status(403).json({ ok: false, error: 'email_not_verified', message: '이메일 미인증' });
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

  return { requireAdmin };
}
