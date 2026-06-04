// 신뢰경계 입력 검증 — /ecount/sale 본문.
// 품목코드는 회사마다 체계가 다름(wsl_z*, j_000* 등) → 안전 패턴으로만 제한(인젝션 방지).
import type { SaleLineInput } from './amounts';

const PROD_CD_RE = /^[A-Za-z0-9_]{1,20}$/;

const MAX_LINES = 100;
const MAX_QTY = 100_000;
const MAX_PRICE = 10_000_000;
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

// 제어문자 제거 + trim — ECOUNT 전달값·로그 인젝션 방지
function clean(s: string): string {
  return s.replace(CONTROL_CHARS, '').trim();
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Cloud Run은 UTC로 동작 → 한국 날짜(KST)로 IO_DATE 생성
export function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function isValidYmd(s: string): boolean {
  if (!/^\d{8}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export interface ValidatedSale {
  month: number;
  region: string;
  ioDate: string;
  lines: SaleLineInput[];
  makeFlag: string;
}

export function validateSaleBody(body: any, defaultMakeFlag: string): ValidatedSale {
  if (!body || typeof body !== 'object') throw new ValidationError('요청 본문이 없습니다');

  const month = Number(body.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError('month 는 1~12 정수여야 합니다');
  }

  const region = typeof body.region === 'string' ? clean(body.region) : '';
  if (!region || region.length > 100) throw new ValidationError('region 이 유효하지 않습니다');

  let ioDate: string = typeof body.ioDate === 'string' && body.ioDate ? body.ioDate.trim() : todayKST();
  if (!isValidYmd(ioDate)) throw new ValidationError('ioDate 는 YYYYMMDD 유효일자여야 합니다');

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new ValidationError('lines 는 1개 이상이어야 합니다');
  }
  if (body.lines.length > MAX_LINES) throw new ValidationError(`lines 는 ${MAX_LINES}개 이하여야 합니다`);

  const lines: SaleLineInput[] = body.lines.map((l: any, i: number) => {
    if (!l || typeof l !== 'object') throw new ValidationError(`lines[${i}] 형식 오류`);
    if (typeof l.prodCd !== 'string' || !PROD_CD_RE.test(l.prodCd)) throw new ValidationError(`lines[${i}].prodCd 형식 오류`);
    const prodDes = typeof l.prodDes === 'string' ? clean(l.prodDes) : '';
    if (!prodDes || prodDes.length > 200) throw new ValidationError(`lines[${i}].prodDes 유효하지 않음`);
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new ValidationError(`lines[${i}].qty 는 1~${MAX_QTY} 정수여야 합니다`);
    }
    const price = Number(l.price);
    if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE) {
      throw new ValidationError(`lines[${i}].price 는 1~${MAX_PRICE} 정수여야 합니다`);
    }
    // 앱(billingReport)이 정답 supply/vat를 보내면 검증 후 사용 (없으면 게이트웨이가 계산)
    let supply: number | undefined;
    let vat: number | undefined;
    if (l.supply != null || l.vat != null) {
      supply = Number(l.supply);
      vat = Number(l.vat);
      if (!Number.isInteger(supply) || supply < 0 || !Number.isInteger(vat) || vat < 0) {
        throw new ValidationError(`lines[${i}].supply/vat 는 0 이상 정수여야 합니다`);
      }
      if (supply + vat !== Math.round(qty * price)) {
        throw new ValidationError(`lines[${i}] supply+vat(${supply + vat}) != 수량*단가(${Math.round(qty * price)})`);
      }
    }
    return { prodCd: l.prodCd, prodDes, qty, price, supply, vat };
  });

  const makeFlag = body.makeFlag === 'Y' || body.makeFlag === 'N' ? body.makeFlag : defaultMakeFlag;

  return { month, region, ioDate, lines, makeFlag };
}

// ── TMS(tms-local-frontend) 전용 — 회원사별 거래처(CUST) + 상세라인(price 0 허용) ──
const CUST_RE = /^[A-Za-z0-9_-]{1,30}$/;

export interface ValidatedTmsSale {
  cust: string;
  whCd?: string;
  month: number;
  ioDate: string;
  lines: SaleLineInput[];
  makeFlag: string;
}

export function validateTmsSaleBody(body: any, defaultMakeFlag: string): ValidatedTmsSale {
  if (!body || typeof body !== 'object') throw new ValidationError('요청 본문이 없습니다');

  const cust = typeof body.cust === 'string' ? clean(body.cust) : '';
  if (!cust || !CUST_RE.test(cust)) throw new ValidationError('cust(거래처코드) 형식 오류');

  const whCd = typeof body.whCd === 'string' && body.whCd.trim() ? clean(body.whCd) : undefined;

  const month = Number(body.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError('month 는 1~12 정수여야 합니다');
  }

  let ioDate: string = typeof body.ioDate === 'string' && body.ioDate ? body.ioDate.trim() : todayKST();
  if (!isValidYmd(ioDate)) throw new ValidationError('ioDate 는 YYYYMMDD 유효일자여야 합니다');

  if (!Array.isArray(body.lines) || body.lines.length === 0) throw new ValidationError('lines 는 1개 이상이어야 합니다');
  if (body.lines.length > MAX_LINES) throw new ValidationError(`lines 는 ${MAX_LINES}개 이하여야 합니다`);

  const lines: SaleLineInput[] = body.lines.map((l: any, i: number) => {
    if (!l || typeof l !== 'object') throw new ValidationError(`lines[${i}] 형식 오류`);
    if (typeof l.prodCd !== 'string' || !PROD_CD_RE.test(l.prodCd)) throw new ValidationError(`lines[${i}].prodCd 형식 오류`);
    const prodDes = typeof l.prodDes === 'string' ? clean(l.prodDes) : '';
    if (!prodDes || prodDes.length > 200) throw new ValidationError(`lines[${i}].prodDes 유효하지 않음`);
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new ValidationError(`lines[${i}].qty 는 1~${MAX_QTY} 정수여야 합니다`);
    }
    const price = Number(l.price);
    // TMS는 상세라인(금액 0)을 허용 → price 0 이상
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      throw new ValidationError(`lines[${i}].price 는 0~${MAX_PRICE} 정수여야 합니다`);
    }
    let supply: number | undefined;
    let vat: number | undefined;
    if (l.supply != null || l.vat != null) {
      supply = Number(l.supply);
      vat = Number(l.vat);
      if (!Number.isInteger(supply) || supply < 0 || !Number.isInteger(vat) || vat < 0) {
        throw new ValidationError(`lines[${i}].supply/vat 는 0 이상 정수여야 합니다`);
      }
      if (supply + vat !== Math.round(qty * price)) {
        throw new ValidationError(`lines[${i}] supply+vat(${supply + vat}) != 수량*단가(${Math.round(qty * price)})`);
      }
    }
    return { prodCd: l.prodCd, prodDes, qty, price, supply, vat };
  });

  const makeFlag = body.makeFlag === 'Y' || body.makeFlag === 'N' ? body.makeFlag : defaultMakeFlag;
  return { cust, whCd, month, ioDate, lines, makeFlag };
}
