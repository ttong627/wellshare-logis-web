// -*- coding: utf-8 -*-
/**
 * 정규화 유틸 — 거래처명·사업자번호·금액·날짜를 대사(對査) 가능한 형태로 다듬는다.
 *
 * 대사가 깨지는 대부분의 원인은 "같은 거래처인데 표기가 다른 것"이다.
 *   세금계산서: (주)웰쉐어로지스
 *   은행 적요 : 웰쉐어로지스  /  주식회사웰쉐어  /  웰쉐어로지스대금
 * 이 모듈은 위 셋을 같은 키로 만들어 준다.
 */

// ── 법인격 표기 (앞/뒤 어디에 붙어도 제거) ──────────────────
const LEGAL_FORMS = [
  '주식회사', '유한회사', '유한책임회사', '합자회사', '합명회사',
  '사단법인', '재단법인', '학교법인', '의료법인', '사회복지법인',
  '영농조합법인', '농업회사법인', '사회적협동조합', '협동조합',
  '㈜', '㈜', '(주)', '(유)', '(사)', '(재)', '(합)', '(자)',
  '주)', '유)', '사)', '재)',
  'co.,ltd', 'co.ltd', 'coltd', 'ltd', 'inc', 'corp', 'corporation', 'company',
].sort((a, b) => b.length - a.length);

// ── 은행 적요에 흔히 붙는 꼬리표 (제거해야 이름이 드러남) ──
const BANK_NOISE_SUFFIX = [
  '자동이체', '수수료', '대금', '결제', '입금', '출금', '송금', '이체',
  '급여', '지급', '납부', '정산', '환급', '반환', '예금', '계좌', '분할',
].sort((a, b) => b.length - a.length);

// ── 은행 적요 앞에 붙는 채널/기관 표기 ──────────────────────
const BANK_NOISE_PREFIX = [
  '전자금융', '펌뱅킹', '가상계좌', '법인카드', '체크카드', '인터넷',
  '타행', '당행', '지로', '국고', '공금', 'cms',
].sort((a, b) => b.length - a.length);

const NON_WORD_RE = /[^0-9a-z가-힣]+/g;

/** 사업자등록번호를 숫자 10자리로. 형식이 아니면 빈 문자열. */
export function normBizNo(value) {
  if (value === null || value === undefined) return '';
  const digits = String(value).replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
}

/**
 * 거래처명을 비교용 키로 정규화.
 *   '(주) 웰쉐어 로지스'   → '웰쉐어로지스'
 *   '주식회사웰쉐어로지스'  → '웰쉐어로지스'
 *   'WELLSHARE Logis'   → 'wellsharelogis'
 */
export function normCompany(name) {
  if (name === null || name === undefined) return '';
  let s = String(name).normalize('NFKC').trim().toLowerCase();
  if (!s) return '';

  // 법인격 제거 (긴 표기부터 — '주식회사'가 '주)'보다 먼저 지워져야 함)
  for (const form of LEGAL_FORMS) s = s.split(form.toLowerCase()).join('');

  return s.replace(NON_WORD_RE, '');
}

/**
 * 은행 적요/기재내용에서 입금자명을 추출해 정규화.
 *   '웰쉐어로지스대금'       → '웰쉐어로지스'
 *   '타행 (주)한국물류 결제'  → '한국물류'
 *   '천안시청 국고'          → '천안시청'
 */
export function normDepositor(desc) {
  if (desc === null || desc === undefined) return '';
  let s = String(desc).normalize('NFKC').trim().toLowerCase();
  if (!s) return '';

  for (const pre of BANK_NOISE_PREFIX) {
    if (s.startsWith(pre)) { s = s.slice(pre.length).trim(); break; }
  }

  s = normCompany(s);

  // 꼬리표 제거 — 제거 후에도 이름이 남을 때만 (적요가 '입금'뿐이면 그대로 둔다)
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of BANK_NOISE_SUFFIX) {
      if (s.endsWith(suf) && s.length > suf.length + 1) {
        s = s.slice(0, -suf.length);
        changed = true;
      }
    }
  }

  // 가상계좌 번호 등 숫자 꼬리 제거 — 단, 숫자를 빼면 아무것도 안 남으면 유지
  const withoutDigits = s.replace(/\d+/g, '');
  return withoutDigits || s;
}

/**
 * 정규화된 두 이름의 유사도 0.0~1.0.
 * 한쪽이 다른 쪽에 온전히 포함되면(축약 표기) 높은 점수를 준다.
 *   '웰쉐어' vs '웰쉐어로지스' → 0.9 내외
 */
export function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 2 && long.includes(short)) {
    // 축약 표기: 짧은 쪽이 길수록(정보량이 많을수록) 신뢰도 상승
    return Math.min(0.95, 0.75 + 0.2 * (short.length / long.length));
  }
  return diceCoefficient(a, b);
}

/** 2-gram Dice 계수 — 한글 오탈자·어순 변화에 SequenceMatcher보다 안정적이다. */
function diceCoefficient(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = bigrams.get(g) || 0;
    if (n > 0) { bigrams.set(g, n - 1); hits++; }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}

/**
 * '1,234,567' / '₩1,234,567' / '(1,234)' / 1234.0 → 정수 원.
 * 괄호는 음수(회계 표기)로 해석. 파싱 불가면 0.
 */
export function parseAmount(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;

  let s = String(value).trim();
  if (!s) return 0;

  const negative = (s.startsWith('(') && s.endsWith(')')) || s.startsWith('-');
  s = s.replace(/[^\d.]/g, '');
  if (!s || s === '.') return 0;

  const amount = Math.round(Number(s));
  if (!Number.isFinite(amount)) return 0;
  return negative ? -amount : amount;
}

/** 엑셀 날짜셀·문자열 날짜를 'YYYY-MM-DD' 로. 실패하면 null. */
export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toISO(value);
  }
  // 엑셀 날짜 일련번호 (1900 체계). 1은 1900-01-01, 1900 윤년 버그 포함.
  if (typeof value === 'number') {
    if (value < 20000 || value > 60000) return null;   // 1954~2064 밖은 날짜가 아니라고 본다
    return toISO(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000));
  }

  const s = String(value).trim();
  if (!s) return null;

  // 2026-03-14 / 2026.3.14 / 2026/03/14 / 20260314 (뒤에 시각이 붙어도 앞부분만)
  let m = s.match(/^(\d{4})[-/.]?\s?(\d{1,2})[-/.]?\s?(\d{1,2})/);
  if (!m) {
    // 26-03-14 (두 자리 연도)
    m = s.match(/^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) m = [m[0], String(2000 + Number(m[1])), m[2], m[3]];
  }
  if (!m) return null;

  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;  // 2026-02-31 방어
  return toISO(dt);
}

function toISO(dt) {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' 두 날짜의 일수 차이 (b - a). */
export function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** 'YYYY-MM-DD' 에 일수를 더한다. */
export function addDays(iso, days) {
  return toISO(new Date(Date.parse(iso) + days * 86400000));
}

/** 컬럼 헤더를 비교용으로 정규화 — 공백·괄호·기호 제거. */
export function normHeader(value) {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFKC').trim().toLowerCase()
    .replace(/\(.*?\)/g, '')      // '입금액(원)' → '입금액'
    .replace(NON_WORD_RE, '');
}

/** 금액을 '1,234,567' 형태로. */
export function won(n) {
  return (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR');
}
