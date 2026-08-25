// -*- coding: utf-8 -*-
/**
 * 대사(對査) 엔진 — 세금계산서와 입금을 맞춘다.
 *
 * "금액이 같으면 매칭"으로는 실무에서 절반도 안 맞는다. 실제로 깨지는 지점:
 *   ① 합산입금 — 계산서 3장을 한 번에 몰아서 보냄        → 조합 탐색
 *   ② 분할입금 — 한 건을 두세 번에 나눠 보냄             → 누적 충당
 *   ③ 이름 불일치 — '(주)한국물류' vs '한국물류대금'      → 정규화 + 유사도
 *   ④ 차감입금 — 송금수수료·상계로 몇백 원 어긋남         → 허용오차
 *   ⑤ 기간 어긋남 — 3월 발행, 5월 입금                  → 날짜창
 *
 * 각 매칭에는 근거(rule)와 신뢰도(confidence)가 붙는다.
 * 신뢰도가 기준 미만이면 '확인 필요'로 남겨 사람이 판단하게 한다 — 조용히 틀리는 것보다 낫다.
 */
import { nameSimilarity, daysBetween, addDays } from './normalize.js';

export const DEFAULTS = {
  direction: 'sale',      // 'sale' = 매출·입금 대사 / 'purchase' = 매입·출금 대사
  toleranceAbs: 1000,     // 절대 허용오차(원) — 송금수수료 등
  toleranceRate: 0.002,   // 상대 허용오차(0.2%)
  daysBefore: 15,         // 입금이 계산서보다 앞설 수 있는 일수(선입금)
  daysAfter: 240,         // 계산서 이후 몇 일까지 입금으로 인정할지
  nameThreshold: 0.62,    // 거래처명 유사도 하한
  comboMax: 5,            // 합산입금 조합 최대 장수
  autoConfirm: 0.82,      // 이 값 이상이면 자동 확정, 미만이면 '확인 필요'
  creditDays: 30,         // 결제 조건(발행일 + N일 = 만기)
  fifoAllocate: true,     // 남은 입금을 오래된 계산서부터 충당할지
};

const RULE_LABEL = {
  exact: '완전일치',
  tolerance: '오차허용',
  aggregate: '합산입금',
  split: '분할입금',
  amountOnly: '금액만일치',
  fifo: '순차충당',
};

/** 계산서 한 건의 허용오차 — 절대값과 비율 중 큰 쪽. */
function tolFor(amount, opt) {
  return Math.max(opt.toleranceAbs, Math.round(amount * opt.toleranceRate));
}

/**
 * 메인 진입점.
 * @param {Array} invoices  parseInvoices 결과
 * @param {Array} payments  parsePayments 결과
 * @param {Object} options  DEFAULTS 참고
 */
export function reconcile(invoices, payments, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const warnings = [];

  // 방향에 맞는 것만 남긴다 — 매출이면 계산서=sale, 은행=입금
  const wantInvoiceDir = opt.direction === 'purchase' ? 'purchase' : 'sale';
  const wantPaymentDir = opt.direction === 'purchase' ? 'out' : 'in';

  const invs = invoices
    .filter((v) => v.direction === wantInvoiceDir)
    .map((v) => ({ ...v, paid: 0, matchIds: [] }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const pays = payments
    .filter((p) => p.direction === wantPaymentDir)
    .map((p) => ({ ...p, matched: 0, matchIds: [] }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (!invs.length) warnings.push(`${wantInvoiceDir === 'sale' ? '매출' : '매입'} 세금계산서가 없습니다.`);
  if (!pays.length) warnings.push(`${wantPaymentDir === 'in' ? '입금' : '출금'} 내역이 없습니다.`);

  const invById = new Map(invs.map((v) => [v.id, v]));
  const payById = new Map(pays.map((p) => [p.id, p]));

  const partners = buildPartners(invs);
  linkPaymentsToPartners(pays, partners, opt);

  const matches = [];
  const ctx = { invById, payById, partners, matches, opt };

  // 순서가 곧 우선순위 — 확실한 것부터 소진해야 뒤쪽 패스가 오염되지 않는다
  passPairwise(ctx, invs, pays, 'exact');
  passPairwise(ctx, invs, pays, 'tolerance');
  passAggregate(ctx);
  passSplit(ctx);
  passAmountOnly(ctx, invs, pays);
  if (opt.fifoAllocate) passFifo(ctx);

  recompute({ invoices: invs, payments: pays, matches }, opt);

  return {
    invoices: invs,
    payments: pays,
    matches,
    partners: summarizePartners(invs, pays, matches, opt),
    summary: summarize(invs, pays, matches, opt),
    warnings,
    options: opt,
  };
}

// ══════════════════════════════════════════════════════════
//  거래처 묶기
// ══════════════════════════════════════════════════════════

/**
 * 사업자번호가 있으면 그것을, 없으면 정규화된 이름을 거래처 식별자로 삼는다.
 * 같은 거래처의 표기 변형(이카운트 '한국물류' / 홈택스 '(주)한국물류')을 한 묶음으로 만든다.
 */
function buildPartners(invoices) {
  const partners = new Map();
  for (const inv of invoices) {
    const id = inv.partnerBizNo || inv.partnerKey;
    if (!id) continue;
    if (!partners.has(id)) {
      partners.set(id, { id, bizNo: inv.partnerBizNo, names: new Set(), keys: new Set(), invoiceIds: [] });
    }
    const p = partners.get(id);
    if (inv.partnerName) p.names.add(inv.partnerName);
    if (inv.partnerKey) p.keys.add(inv.partnerKey);
    p.invoiceIds.push(inv.id);
  }

  // 사업자번호로 묶인 거래처의 이름 변형을, 번호 없는 동명 거래처에도 공유
  const keyToId = new Map();
  for (const p of partners.values()) for (const k of p.keys) if (!keyToId.has(k)) keyToId.set(k, p.id);
  for (const p of partners.values()) p.displayName = [...p.names][0] || p.id;

  return { map: partners, keyToId };
}

/** 각 입금 건에 대해 "어느 거래처인가" 후보를 유사도순으로 붙인다. */
function linkPaymentsToPartners(payments, partners, opt) {
  const all = [...partners.map.values()];

  for (const pay of payments) {
    const keys = pay.nameKeys && pay.nameKeys.length ? pay.nameKeys : [pay.depositorKey].filter(Boolean);
    const scores = new Map();

    for (const key of keys) {
      // 완전일치가 있으면 그것만으로 확정에 가깝다
      const exactId = partners.keyToId.get(key);
      if (exactId) scores.set(exactId, Math.max(scores.get(exactId) || 0, 1));

      for (const p of all) {
        let best = 0;
        for (const pk of p.keys) best = Math.max(best, nameSimilarity(key, pk));
        if (best >= opt.nameThreshold) scores.set(p.id, Math.max(scores.get(p.id) || 0, best));
      }
    }

    pay.partnerCandidates = [...scores.entries()]
      .map(([id, sim]) => ({ id, sim }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
  }
}

// ══════════════════════════════════════════════════════════
//  매칭 패스
// ══════════════════════════════════════════════════════════

const openInv = (v) => v.amount - v.paid;
const openPay = (p) => p.amount - p.matched;

function inWindow(inv, pay, opt) {
  if (!inv.date || !pay.date) return true;            // 날짜를 모르면 배제하지 않는다
  const d = daysBetween(inv.date, pay.date);
  return d >= -opt.daysBefore && d <= opt.daysAfter;
}

/** 1:1 매칭 — mode 'exact' 는 금액 완전일치만, 'tolerance' 는 오차 허용. */
function passPairwise(ctx, invoices, payments, mode) {
  const { opt } = ctx;
  const candidates = [];

  for (const pay of payments) {
    if (openPay(pay) <= 0) continue;
    for (const cand of pay.partnerCandidates || []) {
      const partner = ctx.partners.map.get(cand.id);
      if (!partner) continue;

      for (const invId of partner.invoiceIds) {
        const inv = ctx.invById.get(invId);
        if (!inv || openInv(inv) <= 0) continue;
        if (!inWindow(inv, pay, opt)) continue;

        const diff = Math.abs(openInv(inv) - openPay(pay));
        const tol = tolFor(inv.amount, opt);
        if (mode === 'exact' ? diff !== 0 : (diff === 0 || diff > tol)) continue;

        candidates.push({
          inv, pay, diff, sim: cand.sim,
          conf: score({ identity: cand.sim, diff, tol, days: daysBetween(inv.date, pay.date), rule: mode }),
        });
      }
    }
  }

  // 확신이 큰 것부터 확정 — 같은 건이 여러 곳에 걸릴 때 가장 그럴듯한 짝을 남긴다
  candidates.sort((a, b) => b.conf - a.conf || a.diff - b.diff);
  for (const c of candidates) {
    if (openInv(c.inv) <= 0 || openPay(c.pay) <= 0) continue;
    const alloc = Math.min(openInv(c.inv), openPay(c.pay));
    addMatch(ctx, {
      rule: mode, confidence: c.conf,
      invoiceIds: [c.inv.id], paymentIds: [c.pay.id],
      amount: alloc, diff: c.diff,
      days: daysBetween(c.inv.date, c.pay.date),
      partnerName: c.inv.partnerName,
    });
  }
}

/** N:1 — 여러 계산서를 한 번에 몰아서 입금한 경우. */
function passAggregate(ctx) {
  const { opt } = ctx;

  for (const pay of [...ctx.payById.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
    if (openPay(pay) <= 0) continue;

    for (const cand of pay.partnerCandidates || []) {
      const partner = ctx.partners.map.get(cand.id);
      if (!partner) continue;

      const open = partner.invoiceIds
        .map((id) => ctx.invById.get(id))
        .filter((v) => v && openInv(v) > 0 && inWindow(v, pay, opt))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .slice(0, 20);                                 // 조합 폭발 방지
      if (open.length < 2) continue;

      const target = openPay(pay);
      const tol = tolFor(target, opt);
      const combo = findCombination(open, target, tol, opt.comboMax);
      if (!combo) continue;

      const total = combo.reduce((s, v) => s + openInv(v), 0);
      const diff = Math.abs(total - target);
      addMatch(ctx, {
        rule: 'aggregate',
        confidence: score({ identity: cand.sim, diff, tol, days: daysBetween(combo[0].date, pay.date), rule: 'aggregate' }),
        invoiceIds: combo.map((v) => v.id),
        paymentIds: [pay.id],
        amount: Math.min(total, target), diff,
        days: daysBetween(combo[0].date, pay.date),
        partnerName: combo[0].partnerName,
        note: `계산서 ${combo.length}건 합산`,
      });
      break;
    }
  }
}

/**
 * 부분집합 합 — 합이 target ±tol 이 되는 조합을 찾는다.
 * 가지치기(초과 / 남은 걸 다 더해도 부족)로 실무 규모에선 즉시 끝난다.
 */
function findCombination(items, target, tol, maxItems) {
  const arr = items.slice().sort((a, b) => openInv(b) - openInv(a));
  const n = arr.length;
  const suffix = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + openInv(arr[i]);

  let best = null;
  const chosen = [];

  function dfs(start, sum) {
    if (best) return;
    if (chosen.length >= 2 && Math.abs(sum - target) <= tol) { best = chosen.slice(); return; }
    if (chosen.length >= maxItems || start >= n) return;
    if (sum - target > tol) return;                    // 이미 초과
    if (sum + suffix[start] < target - tol) return;    // 남은 걸 다 더해도 부족

    for (let j = start; j < n; j++) {
      const v = openInv(arr[j]);
      if (sum + v > target + tol) continue;
      chosen.push(arr[j]);
      dfs(j + 1, sum + v);
      chosen.pop();
      if (best) return;
    }
  }

  dfs(0, 0);
  return best;
}

/** 1:N — 한 계산서를 여러 번 나눠 입금한 경우. */
function passSplit(ctx) {
  const { opt } = ctx;

  for (const inv of [...ctx.invById.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
    if (openInv(inv) <= 0) continue;

    const partnerId = inv.partnerBizNo || inv.partnerKey;
    const related = [...ctx.payById.values()]
      .filter((p) => openPay(p) > 0
        && (p.partnerCandidates || []).some((c) => c.id === partnerId)
        && inWindow(inv, p, opt))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (related.length < 2) continue;

    const target = openInv(inv);
    const tol = tolFor(inv.amount, opt);

    let sum = 0;
    const picked = [];
    for (const p of related) {
      if (sum + openPay(p) > target + tol) continue;
      picked.push(p);
      sum += openPay(p);
      if (Math.abs(sum - target) <= tol && picked.length >= 2) break;
    }
    if (picked.length < 2 || Math.abs(sum - target) > tol) continue;

    const sim = Math.max(...picked.map(
      (p) => (p.partnerCandidates.find((c) => c.id === partnerId) || { sim: 0 }).sim
    ));
    addMatch(ctx, {
      rule: 'split',
      confidence: score({ identity: sim, diff: Math.abs(sum - target), tol, days: daysBetween(inv.date, picked[0].date), rule: 'split' }),
      invoiceIds: [inv.id],
      paymentIds: picked.map((p) => p.id),
      amount: Math.min(sum, target), diff: Math.abs(sum - target),
      days: daysBetween(inv.date, picked[picked.length - 1].date),
      partnerName: inv.partnerName,
      note: `입금 ${picked.length}회 분할`,
    });
  }
}

/**
 * 이름이 안 붙는데 금액이 딱 맞는 경우 — 후보가 유일할 때만, 낮은 신뢰도로 제시.
 * (거래처명이 담당자 개인명으로 찍히는 공공기관 입금이 여기 걸린다)
 */
function passAmountOnly(ctx, invoices, payments) {
  const { opt } = ctx;
  const openInvoices = invoices.filter((v) => openInv(v) > 0);

  for (const pay of payments) {
    if (openPay(pay) <= 0) continue;
    const target = openPay(pay);
    const hits = openInvoices.filter(
      (v) => openInv(v) > 0 && openInv(v) === target && inWindow(v, pay, opt)
    );
    if (hits.length !== 1) continue;                   // 후보가 여럿이면 사람이 봐야 한다

    const inv = hits[0];
    addMatch(ctx, {
      rule: 'amountOnly',
      confidence: score({ identity: 0, diff: 0, tol: tolFor(inv.amount, opt), days: daysBetween(inv.date, pay.date), rule: 'amountOnly' }),
      invoiceIds: [inv.id], paymentIds: [pay.id],
      amount: Math.min(openInv(inv), target), diff: 0,
      days: daysBetween(inv.date, pay.date),
      partnerName: inv.partnerName,
      note: '입금자명 불일치 — 금액만 일치',
    });
  }
}

/**
 * 남은 입금을 같은 거래처의 오래된 계산서부터 충당(선입선출).
 * 회계에서 실제로 하는 방식이고, 이게 있어야 거래처별 잔액이 맞는다.
 */
function passFifo(ctx) {
  const { opt } = ctx;

  for (const pay of [...ctx.payById.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
    while (openPay(pay) > 0) {
      const cand = (pay.partnerCandidates || [])[0];
      if (!cand) break;
      const partner = ctx.partners.map.get(cand.id);
      if (!partner) break;

      const inv = partner.invoiceIds
        .map((id) => ctx.invById.get(id))
        .filter((v) => v && openInv(v) > 0 && inWindow(v, pay, opt))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
      if (!inv) break;

      const alloc = Math.min(openInv(inv), openPay(pay));
      addMatch(ctx, {
        rule: 'fifo',
        confidence: score({ identity: cand.sim, diff: 0, tol: tolFor(inv.amount, opt), days: daysBetween(inv.date, pay.date), rule: 'fifo' }),
        invoiceIds: [inv.id], paymentIds: [pay.id],
        amount: alloc, diff: Math.abs(openInv(inv) - openPay(pay)),
        days: daysBetween(inv.date, pay.date),
        partnerName: inv.partnerName,
        note: alloc < inv.amount ? '부분 충당' : '순차 충당',
      });
    }
  }
}

// ══════════════════════════════════════════════════════════
//  점수·집계
// ══════════════════════════════════════════════════════════

const RULE_PENALTY = { exact: 1, tolerance: 0.95, aggregate: 0.9, split: 0.9, fifo: 0.72, amountOnly: 0.55 };

function score({ identity, diff, tol, days, rule }) {
  const idScore = Math.max(0, Math.min(1, identity));
  const amtScore = diff === 0 ? 1 : Math.max(0, 1 - diff / Math.max(tol, 1)) * 0.85;
  const dayScore = days === null || days === undefined ? 0.5
    : days < 0 ? 0.6                                   // 선입금
      : days <= 60 ? 1
        : days <= 120 ? 0.85 : 0.7;
  const raw = idScore * 0.45 + amtScore * 0.40 + dayScore * 0.15;
  return Math.max(0, Math.min(1, raw * (RULE_PENALTY[rule] ?? 0.6)));
}

function addMatch(ctx, m) {
  const match = {
    id: `M${ctx.matches.length + 1}`,
    rejected: false,
    ruleLabel: RULE_LABEL[m.rule] || m.rule,
    status: m.confidence >= ctx.opt.autoConfirm ? 'confirmed' : 'review',
    note: '',
    ...m,
  };
  ctx.matches.push(match);

  for (const id of match.invoiceIds) {
    const inv = ctx.invById.get(id);
    if (inv) inv.matchIds.push(match.id);
  }
  for (const id of match.paymentIds) {
    const pay = ctx.payById.get(id);
    if (pay) pay.matchIds.push(match.id);
  }
  applyAllocation(ctx, match, +1);
  return match;
}

/** 매칭 금액을 계산서·입금에 배분(또는 회수). 여러 건이면 오래된 것부터 채운다. */
function applyAllocation(ctx, match, sign) {
  let remaining = match.amount;
  const invs = match.invoiceIds.map((id) => ctx.invById.get(id)).filter(Boolean);
  for (const inv of invs) {
    if (remaining <= 0) break;
    const take = sign > 0 ? Math.min(remaining, inv.amount - inv.paid) : Math.min(remaining, inv.paid);
    inv.paid += sign * take;
    remaining -= take;
  }

  remaining = match.amount;
  const pays = match.paymentIds.map((id) => ctx.payById.get(id)).filter(Boolean);
  for (const pay of pays) {
    if (remaining <= 0) break;
    const take = sign > 0 ? Math.min(remaining, pay.amount - pay.matched) : Math.min(remaining, pay.matched);
    pay.matched += sign * take;
    remaining -= take;
  }
}

/**
 * 사용자가 '확인 필요' 건을 승인/거절한 뒤 잔액을 다시 계산한다.
 * rejected=true 인 매칭은 없는 것으로 친다.
 */
export function recompute(state, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const invById = new Map(state.invoices.map((v) => [v.id, v]));
  const payById = new Map(state.payments.map((p) => [p.id, p]));

  for (const inv of state.invoices) inv.paid = 0;
  for (const pay of state.payments) pay.matched = 0;

  const ctx = { invById, payById };
  for (const m of state.matches) {
    if (m.rejected) continue;
    applyAllocation(ctx, m, +1);
  }

  for (const inv of state.invoices) {
    const tol = tolFor(inv.amount, opt);
    // residual = 산술적 잔액. 허용오차 안이면 수수료·상계로 보고 완납 처리하므로
    // 미수금(balance)에는 잡지 않는다 — 안 그러면 다 받은 건이 미수 목록에 남는다.
    inv.residual = inv.amount - inv.paid;
    inv.status = inv.residual <= tol ? '완납' : inv.paid > 0 ? '부분입금' : '미입금';
    inv.balance = inv.status === '완납' ? 0 : inv.residual;
    inv.dueDate = inv.date ? addDays(inv.date, opt.creditDays) : null;
    inv.overdueDays = inv.dueDate && opt.asOf ? Math.max(0, daysBetween(inv.dueDate, opt.asOf) || 0) : 0;
    inv.agingBucket = bucketOf(inv);
  }
  for (const pay of state.payments) {
    pay.unmatched = pay.amount - pay.matched;
    pay.status = pay.unmatched <= 0 ? '대사완료' : pay.matched > 0 ? '일부대사' : '미확인';
  }
  return state;
}

function bucketOf(inv) {
  if (inv.status === '완납') return '완납';
  const d = inv.overdueDays;
  if (d <= 0) return '기한전';
  if (d <= 30) return '30일';
  if (d <= 60) return '60일';
  if (d <= 90) return '90일';
  return '90일초과';
}

function summarizePartners(invoices, payments, matches, opt) {
  const map = new Map();
  for (const inv of invoices) {
    const id = inv.partnerBizNo || inv.partnerKey;
    if (!map.has(id)) {
      map.set(id, {
        id, name: inv.partnerName, bizNo: inv.partnerBizNo,
        invoiced: 0, paid: 0, balance: 0, count: 0, overdueMax: 0, oldest: null,
      });
    }
    const p = map.get(id);
    p.invoiced += inv.amount;
    p.paid += inv.paid;
    p.balance += inv.balance;
    p.count += 1;
    if (inv.balance > 0) {
      p.overdueMax = Math.max(p.overdueMax, inv.overdueDays);
      if (!p.oldest || (inv.date || '') < p.oldest) p.oldest = inv.date;
    }
  }
  return [...map.values()].sort((a, b) => b.balance - a.balance);
}

function summarize(invoices, payments, matches, opt) {
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const active = matches.filter((m) => !m.rejected);
  const buckets = {};
  for (const b of ['기한전', '30일', '60일', '90일', '90일초과']) buckets[b] = { count: 0, amount: 0 };
  for (const inv of invoices) {
    if (inv.status === '완납') continue;
    const b = buckets[inv.agingBucket];
    if (b) { b.count += 1; b.amount += inv.balance; }
  }

  const unmatchedPays = payments.filter((p) => p.unmatched > 0);
  return {
    invoiceCount: invoices.length,
    invoiceTotal: sum(invoices, (v) => v.amount),
    paidTotal: sum(invoices, (v) => v.paid),
    balanceTotal: sum(invoices, (v) => v.balance),
    // 완납 처리하면서 떨어낸 자투리(송금수수료·상계) — 미수금이 아니라 비용이다
    writeOffTotal: sum(invoices.filter((v) => v.status === '완납'), (v) => v.residual),
    settledCount: invoices.filter((v) => v.status === '완납').length,
    partialCount: invoices.filter((v) => v.status === '부분입금').length,
    unpaidCount: invoices.filter((v) => v.status === '미입금').length,
    paymentCount: payments.length,
    paymentTotal: sum(payments, (p) => p.amount),
    unmatchedPaymentCount: unmatchedPays.length,
    unmatchedPaymentTotal: sum(unmatchedPays, (p) => p.unmatched),
    matchCount: active.length,
    confirmedCount: active.filter((m) => m.status === 'confirmed').length,
    reviewCount: active.filter((m) => m.status === 'review').length,
    buckets,
    asOf: opt.asOf,
  };
}
