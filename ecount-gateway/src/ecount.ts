// ECOUNT OpenAPI 호출 — 회사(COM_CODE)별 로그인/세션/SaveSale.
// - 세션은 회사코드별로 캐싱(싱글플라이트) + TTL + 만료 감지시 1회 재로그인
// - fetch + AbortController 타임아웃
// - SuccessCnt=0 이면 HTTP 200이라도 실패로 판정
import type { CompanyConfig } from './config';
import type { ComputedLine } from './amounts';

const SESSION_TTL_MS = 25 * 60 * 1000;
const TIMEOUT_MS = 12_000;

interface SessionState {
  sid: string | null;
  ts: number;
}
const sessions = new Map<string, SessionState>(); // comCode → 세션
const loginInFlight = new Map<string, Promise<string>>();

export class EcountError extends Error {
  constructor(message: string, public detail?: unknown) {
    super(message);
    this.name = 'EcountError';
  }
}

async function postJson(url: string, payload: unknown): Promise<{ httpStatus: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new EcountError('ECOUNT 응답 파싱 실패(JSON 아님)', text.slice(0, 200));
    }
    return { httpStatus: res.status, body };
  } catch (e) {
    if (e instanceof EcountError) throw e;
    if ((e as Error).name === 'AbortError') {
      throw new EcountError(`ECOUNT 응답 타임아웃(${TIMEOUT_MS}ms)`);
    }
    throw new EcountError('ECOUNT 네트워크 오류', (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

async function doLogin(company: CompanyConfig): Promise<string> {
  const { base, comCode, userId, apiKey, zone } = company;
  const { httpStatus, body } = await postJson(`${base}/OAPILogin`, {
    COM_CODE: comCode,
    USER_ID: userId,
    API_CERT_KEY: apiKey,
    LAN_TYPE: 'ko-KR',
    ZONE: zone,
  });
  const sid: string | undefined = body?.Data?.Datas?.SESSION_ID;
  if (httpStatus !== 200 || !sid) {
    // 키·세션은 로그에 남기지 않는다. IP 미화이트리스트/키 오류 메시지만.
    throw new EcountError(`ECOUNT 로그인 실패 (${comCode})`, {
      httpStatus,
      status: body?.Status,
      message: body?.Data?.Message,
      error: body?.Error ?? body?.Errors ?? null,
    });
  }
  return sid;
}

async function getSession(company: CompanyConfig, force = false): Promise<string> {
  const cur = sessions.get(company.comCode);
  const fresh = cur?.sid && Date.now() - cur.ts < SESSION_TTL_MS;
  if (fresh && !force) return cur!.sid as string;

  const inflight = loginInFlight.get(company.comCode);
  if (inflight) return inflight;

  const p = doLogin(company)
    .then((sid) => {
      sessions.set(company.comCode, { sid, ts: Date.now() });
      return sid;
    })
    .finally(() => {
      loginInFlight.delete(company.comCode);
    });
  loginInFlight.set(company.comCode, p);
  return p;
}

// 세션 만료/인증 신호 감지 (ECOUNT는 본문에 오류를 담는다)
function looksLikeSessionExpired(httpStatus: number, body: any): boolean {
  if (httpStatus === 401) return true;
  const blob = JSON.stringify(body ?? '').toLowerCase();
  return blob.includes('session') && (blob.includes('expire') || blob.includes('invalid') || blob.includes('login'));
}

export interface SaveSaleResult {
  slipNos: string[];
  successCnt: number;
  failCnt: number;
}

export async function saveSale(
  company: CompanyConfig,
  lines: ComputedLine[],
  ioDate: string,
  makeFlag: string,
): Promise<SaveSaleResult> {
  const { base, cust, whCd } = company;
  const saleList = lines.map((l) => ({
    BulkDatas: {
      IO_DATE: ioDate,
      CUST: cust,
      WH_CD: whCd,
      PROD_CD: l.prodCd,
      PROD_DES: l.prodDes,
      QTY: String(l.qty),
      PRICE: String(l.price),
      SUPPLY_AMT: String(l.supply),
      VAT_AMT: String(l.vat),
      MAKE_FLAG: makeFlag,
    },
  }));

  const call = async (sid: string) =>
    postJson(`${base}/Sale/SaveSale?SESSION_ID=${encodeURIComponent(sid)}`, { SaleList: saleList });

  let sid = await getSession(company);
  let { httpStatus, body } = await call(sid);

  // 세션 만료 의심 → 1회 강제 재로그인 후 재시도
  if (looksLikeSessionExpired(httpStatus, body)) {
    sid = await getSession(company, true);
    ({ httpStatus, body } = await call(sid));
  }

  const data = body?.Data ?? {};
  const successCnt = Number(data.SuccessCnt ?? 0);
  const failCnt = Number(data.FailCnt ?? 0);

  if (httpStatus !== 200 || successCnt < 1) {
    const details = (data.ResultDetails ?? [])
      .filter((d: any) => !d?.IsSuccess)
      .map((d: any) => ({
        error: d?.TotalError,
        fields: (d?.Errors ?? []).map((e: any) => ({ col: e?.ColCd, message: e?.Message })),
      }));
    throw new EcountError(`ECOUNT SaveSale 실패 (${company.comCode})`, {
      httpStatus,
      status: body?.Status,
      successCnt,
      failCnt,
      details,
    });
  }

  const slipNos: string[] = Array.isArray(data.SlipNos)
    ? data.SlipNos.map(String)
    : data.SlipNos
      ? [String(data.SlipNos)]
      : [];

  return { slipNos, successCnt, failCnt };
}
