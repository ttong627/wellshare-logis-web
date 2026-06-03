// 신뢰경계 입력 검증 — /ecount/sale 본문.
// 임의 prodCd가 ECOUNT로 새어가지 않도록 급지품목 화이트리스트로 제한.
import type { SaleLineInput } from './amounts';

export const VALID_PROD_CODES = new Set(['wsl_z1', 'wsl_z2', 'wsl_z3', 'wsl_z4', 'wsl_z5', 'wsl_z6', 'wsl_z7']);

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
    if (!VALID_PROD_CODES.has(l.prodCd)) throw new ValidationError(`lines[${i}].prodCd 허용되지 않음: ${l.prodCd}`);
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
    return { prodCd: l.prodCd, prodDes, qty, price };
  });

  const makeFlag = body.makeFlag === 'Y' || body.makeFlag === 'N' ? body.makeFlag : defaultMakeFlag;

  return { month, region, ioDate, lines, makeFlag };
}
