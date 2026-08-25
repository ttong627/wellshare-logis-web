// -*- coding: utf-8 -*-
/**
 * 대사 결과 → 엑셀 리포트(시트 6장).
 *   ①요약  ②거래처별 미수금  ③미수금 명세  ④매칭 내역  ⑤미확인 입금  ⑥전체 계산서
 */
import { writeXlsx, S } from './xlsx_write.js';

const BUCKETS = ['기한전', '30일', '60일', '90일', '90일초과'];
const BUCKET_LABEL = {
  기한전: '기한 전(미도래)',
  '30일': '연체 1~30일',
  '60일': '연체 31~60일',
  '90일': '연체 61~90일',
  '90일초과': '연체 90일 초과 ⚠',
};

/** ISO 날짜 → 엑셀 일련번호 셀. 값이 없으면 빈 셀. */
function dateCell(iso) {
  if (!iso) return { v: '', s: S.PLAIN };
  const serial = Math.round((Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86400000);
  return Number.isFinite(serial) ? { v: serial, s: S.DATE } : { v: iso, s: S.PLAIN };
}

const money = (n) => ({ v: Math.round(n || 0), s: S.MONEY });
const moneyBold = (n) => ({ v: Math.round(n || 0), s: S.MONEY_BOLD });
const moneyRed = (n) => ({ v: Math.round(n || 0), s: (n || 0) > 0 ? S.MONEY_RED : S.MONEY });
const center = (v) => ({ v, s: S.CENTER });

/**
 * @param {object} result reconcile() 결과 (recompute 이후 상태)
 * @param {object} meta   { title, files, generatedAt }
 */
export async function buildReport(result, meta = {}) {
  const { summary, invoices, payments, matches, partners, options } = result;
  const dirLabel = options.direction === 'purchase' ? '매입·출금' : '매출·입금';

  return writeXlsx([
    summarySheet(summary, meta, dirLabel, options),
    partnerSheet(partners),
    outstandingSheet(invoices),
    matchSheet(matches, result),
    unmatchedPaymentSheet(payments),
    allInvoiceSheet(invoices),
  ]);
}

// ── ①요약 ─────────────────────────────────────────────────
function summarySheet(s, meta, dirLabel, options) {
  const rows = [
    [{ v: meta.title || '정산 대사 리포트', s: S.TITLE }],
    [],
    [{ v: '대사 기준', s: S.BOLD }, dirLabel],
    [{ v: '기준일', s: S.BOLD }, s.asOf || ''],
    [{ v: '결제 조건', s: S.BOLD }, `발행일 + ${options.creditDays}일`],
    [{ v: '생성 시각', s: S.BOLD }, meta.generatedAt || ''],
    [{ v: '입력 파일', s: S.BOLD }, (meta.files || []).join(' / ')],
    [],
    [{ v: '■ 금액 요약', s: S.BOLD }],
    ['세금계산서 합계', moneyBold(s.invoiceTotal), `${s.invoiceCount}건`],
    ['입금(대사 반영) 합계', money(s.paidTotal), `${s.settledCount}건 완납 · ${s.partialCount}건 부분`],
    ['수수료·상계 차액', money(s.writeOffTotal), '허용오차 안이라 완납 처리 — 미수금 아님'],
    ['미수금 잔액', moneyRed(s.balanceTotal), `${s.unpaidCount}건 미입금`],
    [],
    ['은행 내역 합계', money(s.paymentTotal), `${s.paymentCount}건`],
    ['미확인 입금', moneyRed(s.unmatchedPaymentTotal), `${s.unmatchedPaymentCount}건 — 어느 계산서인지 못 찾음`],
    [],
    [{ v: '■ 매칭 현황', s: S.BOLD }],
    ['자동 확정', center(s.confirmedCount)],
    ['확인 필요', center(s.reviewCount)],
    [],
    [{ v: '■ 연체 구간별 미수금 (Aging)', s: S.BOLD }],
    [{ v: '구간', s: S.HEADER }, { v: '건수', s: S.HEADER }, { v: '금액', s: S.HEADER }],
  ];

  for (const b of BUCKETS) {
    const cell = s.buckets[b] || { count: 0, amount: 0 };
    rows.push([BUCKET_LABEL[b], center(cell.count), b === '90일초과' ? moneyRed(cell.amount) : money(cell.amount)]);
  }
  rows.push([{ v: '합계', s: S.BOLD }, center(s.unpaidCount + s.partialCount), moneyBold(s.balanceTotal)]);

  // 헤더 행이 없는 시트라 열 너비를 직접 지정한다
  return { name: '요약', columns: [], widths: [26, 18, 42], rows };
}

// ── ②거래처별 미수금 ───────────────────────────────────────
function partnerSheet(partners) {
  const rows = partners
    .filter((p) => p.balance > 0 || p.invoiced > 0)
    .map((p) => [
      p.name,
      p.bizNo ? formatBizNo(p.bizNo) : '',
      center(p.count),
      money(p.invoiced),
      money(p.paid),
      moneyRed(p.balance),
      center(p.balance > 0 ? p.overdueMax : 0),
      dateCell(p.balance > 0 ? p.oldest : null),
    ]);

  const total = partners.reduce(
    (a, p) => ({ inv: a.inv + p.invoiced, paid: a.paid + p.paid, bal: a.bal + p.balance }),
    { inv: 0, paid: 0, bal: 0 }
  );
  rows.push([{ v: '합계', s: S.BOLD }, '', '', moneyBold(total.inv), moneyBold(total.paid), moneyBold(total.bal), '', '']);

  return {
    name: '거래처별 미수금',
    columns: [
      { header: '거래처', width: 28 }, { header: '사업자번호', width: 15 },
      { header: '건수', width: 7 }, { header: '청구액', width: 15 },
      { header: '입금액', width: 15 }, { header: '미수금', width: 15 },
      { header: '최장 연체일', width: 11 }, { header: '최초 미수 발행일', width: 15 },
    ],
    rows,
  };
}

// ── ③미수금 명세 ───────────────────────────────────────────
function outstandingSheet(invoices) {
  const rows = invoices
    .filter((v) => v.status !== '완납')
    .sort((a, b) => b.overdueDays - a.overdueDays || b.balance - a.balance)
    .map((v) => [
      dateCell(v.date), v.partnerName, v.partnerBizNo ? formatBizNo(v.partnerBizNo) : '',
      money(v.amount), money(v.paid), moneyRed(v.balance),
      center(v.status), dateCell(v.dueDate), center(v.overdueDays || 0),
      center(BUCKET_LABEL[v.agingBucket] || v.agingBucket), v.docNo, v.note,
    ]);

  return {
    name: '미수금 명세',
    columns: [
      { header: '작성일자', width: 12 }, { header: '거래처', width: 26 }, { header: '사업자번호', width: 15 },
      { header: '청구액', width: 14 }, { header: '입금액', width: 14 }, { header: '미수금', width: 14 },
      { header: '상태', width: 10 }, { header: '만기일', width: 12 }, { header: '연체일', width: 8 },
      { header: '연체구간', width: 16 }, { header: '승인번호', width: 24 }, { header: '비고', width: 20 },
    ],
    rows,
  };
}

// ── ④매칭 내역 ─────────────────────────────────────────────
function matchSheet(matches, result) {
  const invById = new Map(result.invoices.map((v) => [v.id, v]));
  const payById = new Map(result.payments.map((p) => [p.id, p]));

  const rows = matches
    .filter((m) => !m.rejected)
    .sort((a, b) => b.confidence - a.confidence)
    .map((m) => {
      const invs = m.invoiceIds.map((id) => invById.get(id)).filter(Boolean);
      const pays = m.paymentIds.map((id) => payById.get(id)).filter(Boolean);
      return [
        center(m.status === 'confirmed' ? '확정' : '확인필요'),
        center(m.ruleLabel),
        center(`${Math.round(m.confidence * 100)}%`),
        m.partnerName || '',
        dateCell(invs[0]?.date), dateCell(pays[0]?.date),
        center(m.days === null || m.days === undefined ? '' : m.days),
        money(m.amount), money(m.diff),
        invs.map((v) => v.docNo || v.date).join(', '),
        pays.map((p) => p.depositor || p.date).join(', '),
        m.note || '',
      ];
    });

  return {
    name: '매칭 내역',
    columns: [
      { header: '판정', width: 10 }, { header: '근거', width: 11 }, { header: '신뢰도', width: 8 },
      { header: '거래처', width: 24 }, { header: '계산서일', width: 12 }, { header: '입금일', width: 12 },
      { header: '소요일', width: 8 }, { header: '대사금액', width: 14 }, { header: '차액', width: 11 },
      { header: '계산서', width: 26 }, { header: '입금 적요', width: 26 }, { header: '메모', width: 18 },
    ],
    rows,
  };
}

// ── ⑤미확인 입금 ───────────────────────────────────────────
function unmatchedPaymentSheet(payments) {
  const rows = payments
    .filter((p) => p.unmatched > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map((p) => [
      dateCell(p.date), p.time || '', p.depositor || '',
      money(p.amount), money(p.matched), moneyRed(p.unmatched),
      center(p.status), p.branch || '', p.memo || '',
    ]);

  return {
    name: '미확인 입금',
    columns: [
      { header: '거래일', width: 12 }, { header: '시각', width: 9 }, { header: '적요·입금자', width: 30 },
      { header: '입금액', width: 14 }, { header: '대사된 금액', width: 14 }, { header: '미대사 잔액', width: 14 },
      { header: '상태', width: 10 }, { header: '거래점', width: 12 }, { header: '메모', width: 20 },
    ],
    rows,
  };
}

// ── ⑥전체 계산서 ───────────────────────────────────────────
function allInvoiceSheet(invoices) {
  const rows = invoices.map((v) => [
    dateCell(v.date), v.partnerName, v.partnerBizNo ? formatBizNo(v.partnerBizNo) : '',
    money(v.supply), money(v.tax), money(v.amount),
    money(v.paid), moneyRed(v.balance), center(v.status),
    center(v.src), v.docNo, v.note,
  ]);

  return {
    name: '전체 계산서',
    columns: [
      { header: '작성일자', width: 12 }, { header: '거래처', width: 26 }, { header: '사업자번호', width: 15 },
      { header: '공급가액', width: 14 }, { header: '세액', width: 12 }, { header: '합계금액', width: 14 },
      { header: '입금액', width: 14 }, { header: '잔액', width: 14 }, { header: '상태', width: 10 },
      { header: '출처', width: 20 }, { header: '승인번호', width: 24 }, { header: '비고', width: 20 },
    ],
    rows,
  };
}

function formatBizNo(b) {
  return b && b.length === 10 ? `${b.slice(0, 3)}-${b.slice(3, 5)}-${b.slice(5)}` : b || '';
}
