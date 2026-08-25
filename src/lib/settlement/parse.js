// -*- coding: utf-8 -*-
/**
 * 시트 → 표준 레코드 변환.
 *
 * 실무 파일은 컬럼 이름도, 헤더 위치도 제각각이다(홈택스는 위에 제목 행이 몇 줄 붙어 나온다).
 * 그래서 ①헤더 행을 점수로 찾고 ②별칭 사전으로 컬럼을 매핑한 뒤 ③파일 종류를 자동 판별한다.
 */
import {
  normHeader, normCompany, normDepositor, normBizNo,
  parseAmount, parseDate,
} from './normalize.js';

// ── 컬럼 별칭 사전 ─────────────────────────────────────────
const HOMETAX_COLS = {
  date:         ['작성일자', '작성일', '발행일자', '거래일자'],
  issueDate:    ['발급일자', '전송일자'],
  docNo:        ['승인번호', '국세청승인번호'],
  supplierBiz:  ['공급자사업자등록번호', '공급자등록번호', '공급자사업자번호', '공급자사업자'],
  supplierName: ['공급자상호', '공급자명', '공급자'],
  buyerBiz:     ['공급받는자사업자등록번호', '공급받는자등록번호', '공급받는자사업자번호', '공급받는자사업자'],
  buyerName:    ['공급받는자상호', '공급받는자명', '공급받는자'],
  total:        ['합계금액', '총금액', '합계', '총액'],
  supply:       ['공급가액'],
  tax:          ['세액', '부가세', '부가가치세'],
  kind:         ['종류', '전자세금계산서분류', '유형'],
  note:         ['비고', '품목', '품명'],
};

const ECOUNT_COLS = {
  date:        ['일자', '판매일자', '전표일자', '거래일자', '작성일자', '매출일자'],
  partnerName: ['거래처명', '거래처이름', '거래처', '업체명', '고객명'],
  partnerBiz:  ['사업자번호', '사업자등록번호', '거래처사업자번호', '등록번호'],
  total:       ['합계', '합계금액', '총액', '판매금액', '매출액', '금액'],
  supply:      ['공급가액'],
  tax:         ['부가세', '세액', '부가가치세'],
  docNo:       ['전표번호', '관리번호', '문서번호'],
  note:        ['품목', '품목명', '적요', '내역', '비고'],
  receivable:  ['미수금', '미수잔액', '외상매출금', '잔액'],
};

const BANK_COLS = {
  date:    ['거래일시', '거래일자', '거래일', '거래날짜', '연월일', '일자', '날짜'],
  time:    ['거래시간', '시간'],
  inAmt:   ['맡기신금액', '입금액', '입금금액', '받으신금액', '입금'],
  outAmt:  ['찾으신금액', '출금액', '출금금액', '보내신금액', '지급금액', '출금'],
  amount:  ['거래금액', '금액'],
  kind:    ['입출금구분', '입출구분', '거래구분', '구분'],
  balance: ['거래후잔액', '잔액'],
  branch:  ['거래점', '취급점', '거래점명'],
  memo:    ['통장메모', '메모', '비고', '기타'],
};

// 입금자명이 들어 있을 만한 컬럼 — 앞쪽일수록 신뢰도가 높다.
// 은행마다 이름이 달라 여러 개를 모아 두고 매칭 때 전부 시도한다.
const BANK_DESC_COLS = [
  '입금자', '보내는분', '보내신분', '송금인', '의뢰인', '의뢰인수취인',
  '상대계좌예금주', '예금주', '상대방', '받는분',
  '기재내용', '내용', '거래내용', '거래기록사항', '적요', '거래처', '摘要',
];

// ══════════════════════════════════════════════════════════
//  헤더 탐지 + 컬럼 매핑
// ══════════════════════════════════════════════════════════

/**
 * 앞쪽 행들을 훑어 "헤더로 보이는 행"을 찾는다.
 * 별칭 사전에 걸리는 셀이 가장 많은 행을 헤더로 본다(동점이면 위쪽 우선).
 */
function findHeaderRow(rows, vocab) {
  const limit = Math.min(rows.length, 30);
  let best = { idx: -1, score: 0 };

  for (let i = 0; i < limit; i++) {
    const row = rows[i] || [];
    const filled = row.filter((c) => c !== null && c !== '').length;
    if (filled < 2) continue;

    let score = 0;
    for (const cell of row) {
      const h = normHeader(cell);
      if (h && vocab.has(h)) score++;
    }
    if (score > best.score) best = { idx: i, score };
  }
  return best;
}

/** 별칭 사전을 헤더 정규화 형태의 Set 으로. */
function buildVocab(...colMaps) {
  const set = new Set();
  for (const map of colMaps) {
    for (const aliases of Object.values(map)) {
      for (const a of aliases) set.add(normHeader(a));
    }
  }
  return set;
}

/**
 * 헤더 행 → { 필드명: 열인덱스 } 매핑.
 * 별칭은 긴 것부터 확인한다 ('공급자사업자등록번호'가 '공급자'보다 먼저 잡혀야 한다).
 */
function mapColumns(headerRow, colMap) {
  const headers = headerRow.map(normHeader);
  const used = new Set();
  const out = {};

  const fields = Object.entries(colMap).sort(
    (a, b) => Math.max(...b[1].map((s) => s.length)) - Math.max(...a[1].map((s) => s.length))
  );

  for (const [field, aliases] of fields) {
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    // 1순위: 완전 일치
    let idx = headers.findIndex((h, i) => !used.has(i) && h && sorted.includes(normHeader(h)));
    // 2순위: 부분 포함 ('입금액(원)' 처럼 꼬리표가 붙은 경우)
    if (idx < 0) {
      idx = headers.findIndex(
        (h, i) => !used.has(i) && h && sorted.some((a) => h.includes(normHeader(a)))
      );
    }
    if (idx >= 0) { out[field] = idx; used.add(idx); }
  }
  return out;
}

const cellAt = (row, idx) => (idx === undefined || idx < 0 ? null : (row[idx] ?? null));

// ══════════════════════════════════════════════════════════
//  파일 종류 자동 판별
// ══════════════════════════════════════════════════════════

/**
 * 시트 하나를 보고 hometax / ecount / bank 중 무엇인지 판정.
 * @returns {{kind: string, headerIdx: number, cols: object, confidence: number}|null}
 */
export function detectSheet(rows) {
  const vocab = buildVocab(HOMETAX_COLS, ECOUNT_COLS, BANK_COLS);
  for (const name of BANK_DESC_COLS) vocab.add(normHeader(name));

  const header = findHeaderRow(rows, vocab);
  if (header.idx < 0) return null;

  const headerRow = rows[header.idx];
  const headers = new Set(headerRow.map(normHeader).filter(Boolean));
  const has = (...names) => names.some((n) => {
    const t = normHeader(n);
    return [...headers].some((h) => h === t || h.includes(t));
  });

  // 은행: 입/출금 금액 컬럼이나 '거래후잔액'이 결정적 단서
  if (has('맡기신금액', '찾으신금액', '입금액', '출금액', '거래후잔액')) {
    return { kind: 'bank', headerIdx: header.idx, cols: mapBankColumns(headerRow), confidence: 0.95 };
  }
  // 홈택스: 공급자/공급받는자 쌍 또는 승인번호
  if (has('공급받는자', '공급자') || has('승인번호')) {
    return { kind: 'hometax', headerIdx: header.idx, cols: mapColumns(headerRow, HOMETAX_COLS), confidence: 0.9 };
  }
  // 이카운트: 거래처명 + 금액
  if (has('거래처') && has('합계', '공급가액', '금액', '판매금액')) {
    return { kind: 'ecount', headerIdx: header.idx, cols: mapColumns(headerRow, ECOUNT_COLS), confidence: 0.8 };
  }
  return null;
}

function mapBankColumns(headerRow) {
  const cols = mapColumns(headerRow, BANK_COLS);
  const headers = headerRow.map(normHeader);
  const taken = new Set(Object.values(cols));

  // 입금자명 후보 컬럼을 우선순위대로 모은다 (은행마다 이름이 달라 전부 보관)
  cols.descCols = [];
  for (const name of BANK_DESC_COLS) {
    const t = normHeader(name);
    headers.forEach((h, i) => {
      if (h && !taken.has(i) && !cols.descCols.includes(i) && (h === t || h.includes(t))) {
        cols.descCols.push(i);
      }
    });
  }
  return cols;
}

// ══════════════════════════════════════════════════════════
//  레코드 추출
// ══════════════════════════════════════════════════════════

/**
 * 세금계산서 시트(홈택스/이카운트) → Invoice[]
 * @param ownBizNo 우리 회사 사업자번호(숫자10). 없으면 데이터에서 추론한다.
 */
export function parseInvoices(rows, detected, source, ownBizNo = '') {
  const { headerIdx, cols, kind } = detected;
  const body = rows.slice(headerIdx + 1);
  const out = [];

  const own = kind === 'hometax'
    ? (normBizNo(ownBizNo) || inferOwnBizNo(body, cols))
    : normBizNo(ownBizNo);

  for (let i = 0; i < body.length; i++) {
    const row = body[i];
    if (!row || row.every((c) => c === null || c === '')) continue;

    const amount = parseAmount(
      cellAt(row, cols.total) ??
      (parseAmount(cellAt(row, cols.supply)) + parseAmount(cellAt(row, cols.tax)) || null)
    ) || (parseAmount(cellAt(row, cols.supply)) + parseAmount(cellAt(row, cols.tax)));

    const date = parseDate(cellAt(row, cols.date)) || parseDate(cellAt(row, cols.issueDate));
    if (!date && !amount) continue;                    // 합계행·빈행 skip

    let partnerName, partnerBizNo, direction;
    if (kind === 'hometax') {
      const supBiz = normBizNo(cellAt(row, cols.supplierBiz));
      const buyBiz = normBizNo(cellAt(row, cols.buyerBiz));
      // 우리가 공급자면 매출(받을 돈), 공급받는자면 매입(줄 돈)
      const isSale = own ? supBiz === own : true;
      direction = isSale ? 'sale' : 'purchase';
      partnerName = String(cellAt(row, isSale ? cols.buyerName : cols.supplierName) ?? '').trim();
      partnerBizNo = isSale ? buyBiz : supBiz;
    } else {
      direction = 'sale';
      partnerName = String(cellAt(row, cols.partnerName) ?? '').trim();
      partnerBizNo = normBizNo(cellAt(row, cols.partnerBiz));
    }

    if (!partnerName && !partnerBizNo) continue;
    if (!Number.isFinite(amount) || amount === 0) continue;

    // '합계' / '소계' 같은 요약행 방어
    if (/^(합계|소계|총계|계|total)$/i.test(partnerName.replace(/\s/g, ''))) continue;

    out.push({
      id: `${source}#${headerIdx + 1 + i}`,
      src: source,
      kind,
      direction,
      rowNo: headerIdx + 2 + i,
      date,
      partnerName,
      partnerKey: normCompany(partnerName),
      partnerBizNo,
      amount: Math.abs(amount),
      supply: parseAmount(cellAt(row, cols.supply)),
      tax: parseAmount(cellAt(row, cols.tax)),
      docNo: String(cellAt(row, cols.docNo) ?? '').trim(),
      note: String(cellAt(row, cols.note) ?? '').trim(),
      paid: 0,
      matchIds: [],
    });
  }
  return { invoices: out, ownBizNo: own };
}

/**
 * 공급자/공급받는자 컬럼에서 "가장 자주 등장하는 사업자번호" = 우리 회사로 추정.
 * 매출 목록이면 공급자 쪽이, 매입 목록이면 공급받는자 쪽이 한 값으로 쏠린다.
 */
function inferOwnBizNo(body, cols) {
  const tally = (idx) => {
    const counts = new Map();
    for (const row of body) {
      const b = normBizNo(cellAt(row, idx));
      if (b) counts.set(b, (counts.get(b) || 0) + 1);
    }
    let top = { biz: '', n: 0 };
    let total = 0;
    for (const [biz, n] of counts) { total += n; if (n > top.n) top = { biz, n }; }
    return { ...top, share: total ? top.n / total : 0 };
  };

  const sup = tally(cols.supplierBiz);
  const buy = tally(cols.buyerBiz);
  const winner = sup.share >= buy.share ? sup : buy;
  return winner.share >= 0.5 ? winner.biz : '';
}

/** 은행 거래내역 시트 → Payment[] (입금·출금 모두 담고, 방향은 매칭 단계에서 고른다) */
export function parsePayments(rows, detected, source) {
  const { headerIdx, cols } = detected;
  const body = rows.slice(headerIdx + 1);
  const out = [];

  for (let i = 0; i < body.length; i++) {
    const row = body[i];
    if (!row || row.every((c) => c === null || c === '')) continue;

    let inAmt = parseAmount(cellAt(row, cols.inAmt));
    let outAmt = parseAmount(cellAt(row, cols.outAmt));

    // 입/출금 컬럼이 나뉘어 있지 않고 '거래금액 + 구분' 형태인 은행 대응
    if (!inAmt && !outAmt && cols.amount !== undefined) {
      const amt = Math.abs(parseAmount(cellAt(row, cols.amount)));
      const kindText = String(cellAt(row, cols.kind) ?? '');
      if (/입금|입/.test(kindText) && !/출금/.test(kindText)) inAmt = amt;
      else if (/출금|출|지급|이체/.test(kindText)) outAmt = amt;
      else if (amt) inAmt = amt;                       // 구분을 못 읽으면 입금으로 본다
    }
    if (!inAmt && !outAmt) continue;

    const descCells = (cols.descCols || []).map((idx) => String(cellAt(row, idx) ?? '').trim());
    const desc = descCells.find((s) => s && !/^\d+$/.test(s)) || descCells.find(Boolean) || '';
    const memo = String(cellAt(row, cols.memo) ?? '').trim();

    // 적요·메모 전부를 후보 이름으로 둔다 (은행마다 이름이 들어가는 칸이 다르다)
    const nameKeys = [...new Set(
      [...descCells, memo].filter(Boolean).flatMap((s) => [normDepositor(s), normCompany(s)])
    )].filter((s) => s.length >= 2);

    out.push({
      id: `${source}#${headerIdx + 1 + i}`,
      src: source,
      rowNo: headerIdx + 2 + i,
      date: parseDate(cellAt(row, cols.date)),
      time: String(cellAt(row, cols.time) ?? '').trim(),
      depositor: desc,
      depositorKey: normDepositor(desc),
      nameKeys,
      inAmt: Math.abs(inAmt),
      outAmt: Math.abs(outAmt),
      direction: inAmt ? 'in' : 'out',
      amount: Math.abs(inAmt || outAmt),
      balance: parseAmount(cellAt(row, cols.balance)),
      branch: String(cellAt(row, cols.branch) ?? '').trim(),
      memo,
      matched: 0,
      matchIds: [],
    });
  }
  return out;
}

/**
 * 업로드된 파일 하나를 통째로 해석 — 시트 여러 개 중 가장 그럴듯한 것을 고른다.
 * @returns {{kind, invoices?, payments?, ownBizNo?, sheetName, warnings}}
 */
export function parseFile(parsed, filename, ownBizNo = '') {
  const warnings = [];
  let best = null;

  for (const sheet of parsed.sheets) {
    const detected = detectSheet(sheet.rows);
    if (!detected) continue;
    const rowCount = sheet.rows.length - detected.headerIdx;
    if (!best || detected.confidence * rowCount > best.detected.confidence * best.rowCount) {
      best = { sheet, detected, rowCount };
    }
  }

  if (!best) {
    throw new Error(
      `'${filename}' 에서 알아볼 수 있는 표를 찾지 못했습니다. ` +
      '홈택스 발급목록·이카운트 판매내역·은행 거래내역 엑셀이 맞는지 확인해 주세요.'
    );
  }

  const { sheet, detected } = best;
  if (detected.kind === 'bank') {
    const payments = parsePayments(sheet.rows, detected, filename);
    if (!payments.length) warnings.push(`'${filename}' 에서 입출금 행을 찾지 못했습니다.`);
    if (!(detected.cols.descCols || []).length) {
      warnings.push(`'${filename}' 에 입금자명 컬럼(적요·기재내용)이 없어 금액으로만 대사합니다.`);
    }
    return { kind: 'bank', payments, sheetName: sheet.name, warnings };
  }

  const { invoices, ownBizNo: own } = parseInvoices(sheet.rows, detected, filename, ownBizNo);
  if (!invoices.length) warnings.push(`'${filename}' 에서 계산서 행을 찾지 못했습니다.`);
  return { kind: detected.kind, invoices, ownBizNo: own, sheetName: sheet.name, warnings };
}
