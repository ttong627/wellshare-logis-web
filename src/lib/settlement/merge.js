// -*- coding: utf-8 -*-
/**
 * 홈택스 · 이카운트 계산서 병합 + 교차검증.
 *
 * 둘 다 올리면 같은 계산서가 두 번 잡혀 미수금이 두 배로 보인다. 그래서 먼저 합쳐야 한다.
 * 그런데 합치는 김에 더 중요한 걸 얻을 수 있다 — 양쪽에 하나만 있는 건이 곧 사고다.
 *   · 홈택스에만 있음 → 이카운트 미입력 (장부 누락)
 *   · 이카운트에만 있음 → 세금계산서 미발행 (신고 누락 위험)
 *
 * 국세청 자료를 기준(SSOT)으로 삼고, 이카운트에서는 전표번호·품목만 빌려온다.
 */
import { nameSimilarity, daysBetween } from './normalize.js';

const DATE_SLACK = 5;          // 양쪽 작성일자가 며칠까지 어긋나도 같은 건으로 볼지
const NAME_FLOOR = 0.62;

/**
 * @param {Array<{source: string, kind: string, invoices: Array}>} sets
 * @returns {{invoices: Array, crossCheck: {onlyHometax: Array, onlyEcount: Array, bothCount: number}}}
 */
export function mergeInvoices(sets) {
  const hometax = sets.filter((s) => s.kind === 'hometax').flatMap((s) => s.invoices);
  const ecount = sets.filter((s) => s.kind === 'ecount').flatMap((s) => s.invoices);

  // 한쪽만 올린 경우엔 합칠 것도, 대조할 것도 없다
  if (!hometax.length || !ecount.length) {
    return {
      invoices: [...hometax, ...ecount],
      crossCheck: { onlyHometax: [], onlyEcount: [], bothCount: 0, ran: false },
    };
  }

  const used = new Set();
  const onlyHometax = [];
  let bothCount = 0;

  for (const inv of hometax) {
    const twin = findTwin(inv, ecount, used);
    if (twin) {
      used.add(twin.id);
      bothCount++;
      // 국세청 자료를 그대로 쓰되, 이카운트 쪽 부가정보만 채운다
      inv.docNo = inv.docNo || twin.docNo;
      inv.note = inv.note || twin.note;
      inv.ecountId = twin.id;
      inv.sources = ['hometax', 'ecount'];
    } else {
      inv.sources = ['hometax'];
      onlyHometax.push(inv);
    }
  }

  const onlyEcount = ecount.filter((v) => !used.has(v.id));
  for (const v of onlyEcount) v.sources = ['ecount'];

  return {
    // 이카운트 단독 건도 미수 관리 대상이므로 합쳐서 반환한다
    invoices: [...hometax, ...onlyEcount],
    crossCheck: { onlyHometax, onlyEcount, bothCount, ran: true },
  };
}

/** 같은 거래처 · 같은 금액 · 비슷한 날짜면 같은 계산서로 본다. */
function findTwin(inv, pool, used) {
  let best = null;
  let bestScore = 0;

  for (const cand of pool) {
    if (used.has(cand.id)) continue;
    if (cand.amount !== inv.amount) continue;

    const gap = inv.date && cand.date ? Math.abs(daysBetween(inv.date, cand.date)) : 0;
    if (gap > DATE_SLACK) continue;

    let identity = 0;
    if (inv.partnerBizNo && cand.partnerBizNo) {
      if (inv.partnerBizNo !== cand.partnerBizNo) continue;
      identity = 1;
    } else {
      identity = nameSimilarity(inv.partnerKey, cand.partnerKey);
      if (identity < NAME_FLOOR) continue;
    }

    const s = identity - gap * 0.02;
    if (s > bestScore) { bestScore = s; best = cand; }
  }
  return best;
}

/** 교차검증 결과를 사람이 읽을 경고 문장으로. */
export function crossCheckWarnings(crossCheck) {
  if (!crossCheck.ran) return [];
  const out = [];
  const sum = (arr) => arr.reduce((s, v) => s + v.amount, 0);

  if (crossCheck.onlyHometax.length) {
    out.push(
      `홈택스에만 있고 이카운트에 없는 계산서 ${crossCheck.onlyHometax.length}건 ` +
      `(${sum(crossCheck.onlyHometax).toLocaleString('ko-KR')}원) — 장부 미입력일 수 있습니다.`
    );
  }
  if (crossCheck.onlyEcount.length) {
    out.push(
      `이카운트에만 있고 홈택스에 없는 매출 ${crossCheck.onlyEcount.length}건 ` +
      `(${sum(crossCheck.onlyEcount).toLocaleString('ko-KR')}원) — 세금계산서 미발행일 수 있습니다.`
    );
  }
  return out;
}
