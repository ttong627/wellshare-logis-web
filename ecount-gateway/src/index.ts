// ECOUNT 통합 게이트웨이 — Express 앱.
// 미들웨어 순서(중요): CORS → OPTIONS(204, 무인증) → rate-limit → requireAdmin → 라우트
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { loadConfig } from './config';
import { initAuth, type AuthedRequest } from './firebaseAuth';
import { validateSaleBody, ValidationError } from './validate';
import { computeAmounts } from './amounts';
import { saveSale, EcountError } from './ecount';
import { buildIdempotencyKey, hashInput, claim, markDone, markFailed } from './idempotency';

const config = loadConfig(); // 필수 env 미설정 시 여기서 throw → 부팅 실패(의도)
const { requireAdmin } = initAuth(config);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Cloud Run 프록시 1홉만 신뢰 (rate-limit IP 우회 방지)

// 구조화 로깅 (stdout JSON). API키·SESSION_ID는 절대 로깅하지 않는다.
function log(severity: 'INFO' | 'WARNING' | 'ERROR', message: string, extra: Record<string, unknown> = {}): void {
  process.stdout.write(JSON.stringify({ severity, message, ...extra }) + '\n');
}

// 1) CORS — 인증보다 먼저. preflight(OPTIONS)는 Authorization 헤더가 없으므로 무인증 204.
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '256kb' }));

// 2) 헬스 — 무인증, ECOUNT 의존 없음
app.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'ecount-gateway' });
});

// 3) rate-limit — 공개 URL 1차 방어. 인스턴스 로컬 메모리 카운터라 best-effort
// (max-instances 3 → 실효 ~30/분). 강한 방어는 Cloud Armor로 별도 보강 예정.
const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

// 4) egress IP 확인 (관리자) — NAT 고정 IP 검증용
app.get('/debug/ip', limiter, requireAdmin, async (_req: Request, res: Response) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    const j = (await r.json()) as { ip?: string };
    res.json({ ok: true, egressIp: j.ip ?? null });
  } catch (e) {
    log('WARNING', 'ip lookup failed', { message: (e as Error).message });
    res.status(502).json({ ok: false, error: 'ip_lookup_failed' });
  } finally {
    clearTimeout(timer);
  }
});

// 5) ECOUNT 매출등록 (관리자)
app.post('/ecount/sale', limiter, requireAdmin, async (req: AuthedRequest, res: Response) => {
  const reqId = randomUUID();
  let v;
  try {
    v = validateSaleBody(req.body, config.ecount.makeFlag);
  } catch (e) {
    if (e instanceof ValidationError) {
      res.status(400).json({ ok: false, error: 'invalid_input', message: e.message });
      return;
    }
    throw e;
  }

  const amounts = computeAmounts(v.lines);
  const year = Number(v.ioDate.slice(0, 4));
  const key = buildIdempotencyKey(year, v.month, v.region);
  const inputHash = hashInput({ lines: v.lines, ioDate: v.ioDate, makeFlag: v.makeFlag });
  const uid = req.user?.uid ?? 'unknown';

  const claimed = await claim(key, inputHash, uid);
  if (claimed.action === 'cached') {
    log('INFO', 'sale cached', { reqId, key });
    const r = claimed.record;
    res.json({ ok: true, slipNos: r.slipNos ?? [], supply: r.supply, vat: r.vat, total: r.total, cached: true });
    return;
  }
  if (claimed.action === 'conflict') {
    res.status(409).json({ ok: false, error: 'conflict', message: '동일 키로 다른 내용이 이미 발행됨', key });
    return;
  }
  if (claimed.action === 'in_progress') {
    res.status(409).json({ ok: false, error: 'in_progress', message: '동일 요청이 처리 중입니다', key });
    return;
  }

  try {
    const result = await saveSale(config, amounts.lines, v.ioDate, v.makeFlag);
    await markDone(key, { slipNos: result.slipNos, total: amounts.total, supply: amounts.supply, vat: amounts.vat });
    log('INFO', 'sale done', { reqId, key, slipNos: result.slipNos, total: amounts.total });
    res.json({
      ok: true,
      slipNos: result.slipNos,
      supply: amounts.supply,
      vat: amounts.vat,
      total: amounts.total,
      cached: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(key, msg);
    // 원본 detail/message는 로그에만 — 응답엔 reqId만(ECOUNT 내부구조·인프라 단서 노출 차단)
    if (e instanceof EcountError) {
      log('ERROR', 'ecount saveSale failed', { reqId, key, message: msg, detail: e.detail });
      res.status(502).json({ ok: false, error: 'ecount_error', message: '매출등록 중 ECOUNT 오류', reqId });
      return;
    }
    log('ERROR', 'sale unexpected error', { reqId, key, message: msg });
    res.status(500).json({ ok: false, error: 'internal', reqId });
  }
});

// 최종 에러 핸들러 — 원본 메시지/스택은 로그에만, 응답은 일반화
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log('ERROR', 'unhandled error', { message: err.message, stack: err.stack });
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: 'internal' });
});

app.listen(config.port, () => {
  log('INFO', `ecount-gateway listening on ${config.port}`, {
    firebaseProjectId: config.firebaseProjectId,
    ecountBase: config.ecount.base,
    admins: config.adminEmails.size,
  });
});
