// ─── 기간별 통계 계산 (순수함수) ──────────────────────────────────────────────
// 목적: 여러 월(billing_records/{YYYY-MM}) 데이터를 기간 집계하기 위한 계산 로직.
//
// ⚠️ 이 파일의 계산식은 src/context/AppContext.tsx 의 useMemo 5종을 "그대로 복제"한 것이다.
//    AppContext 의 계산은 monthData 상태를 클로저로 참조해 "현재 1개월" 전용이라 N개월에 재사용 불가.
//    검증된 정산 경로(AppContext)는 회귀 방지를 위해 건드리지 않고, 동일 공식을 여기에 순수함수로 둔다.
//    공식 수정 시 두 곳을 함께 고칠 것 (각 함수에 원본 라인 표기).

import {
  Orders, PartnerInputs, ZonePrices, RegionsData,
  BillingReport, BillingItem, BillingTotal, BillingCalc,
  BillingSummary, PartnerBillingSummaryItem, PartnerBillingRegion,
} from '../types';
import { REGION_ORDER, SEOUL_REGIONS } from '../constants/regions';
import { PARTNER_REGIONS_INVERSE } from '../constants/members';

// ─── 입력 타입 ────────────────────────────────────────────────────────────────
export interface MonthRaw {
  month: string;        // 'YYYY-MM'
  exists: boolean;      // Firestore 문서 존재 여부
  isClosed: boolean;
  zonePrices: ZonePrices;
  regions: RegionsData;
  orders: Orders;
  partnerInputs: PartnerInputs;
}

// ─── 출력 타입 ────────────────────────────────────────────────────────────────
export interface RegionQty { basicQty: number; povertyQty: number; }
export interface QtyByRegion { region: string; basicQty: number; povertyQty: number; }
export interface CompanyRegionQty { region: string; basicQty: number; povertyQty: number; }
export interface CompanyQty { company: string; basicQty: number; povertyQty: number; regions: CompanyRegionQty[]; }

export interface QuantityResult {
  byRegion: QtyByRegion[];        // 지자체별 (REGION_ORDER 순)
  byCompany: CompanyQty[];        // 회원사별 (이름 정렬)
  seoulTotal: RegionQty;
  gyeonggiTotal: RegionQty;
  grandTotal: RegionQty;          // 전체 (지자체 기준 = getEffectiveOrder 합)
}

export interface MonthStats {
  month: string;
  exists: boolean;
  isClosed: boolean;
  quantity: QuantityResult;
  billingReport: BillingReport;   // 계산서발급액 (지자체별)
  billingSummary: BillingSummary; // 결제내역 (회원사별)
}

export interface PeriodStats {
  months: MonthStats[];           // 월별내역 (오름차순)
  quantityTotal: QuantityResult;
  billingReportTotal: BillingReport;
  billingSummaryTotal: BillingSummary;
}

// ─── 수량 집계: partnerAggregatedOrders (AppContext.tsx:136-148 복제) ────────────
export function aggregatePartnerOrders(partnerInputs: PartnerInputs): Record<string, RegionQty> {
  const agg: Record<string, RegionQty> = {};
  REGION_ORDER.forEach(r => { agg[r] = { basicQty: 0, povertyQty: 0 }; });
  Object.values(partnerInputs).forEach(regionsData => {
    Object.entries(regionsData).forEach(([region, data]) => {
      if (agg[region]) {
        agg[region].basicQty += (Number(data.basicQty) || 0);
        agg[region].povertyQty += (Number(data.povertyQty) || 0);
      }
    });
  });
  return agg;
}

// ─── getEffectiveOrder (AppContext.tsx:150-159 복제) ────────────────────────────
// orders[r]에 값이 있으면 그 값, 비었으면('' | undefined) partner 합으로 대체.
export function effectiveOrder(
  region: string,
  orders: Orders,
  partnerAgg: Record<string, RegionQty>,
): RegionQty {
  const o = orders[region] || {};
  const pSum = partnerAgg[region] || { basicQty: 0, povertyQty: 0 };
  const isPovEmpty = o.povertyQty === undefined || o.povertyQty === '';
  const isBasEmpty = o.basicQty === undefined || o.basicQty === '';
  return {
    povertyQty: isPovEmpty ? pSum.povertyQty : (Number(o.povertyQty) || 0),
    basicQty: isBasEmpty ? pSum.basicQty : (Number(o.basicQty) || 0),
  };
}

// ─── computedAllocations (AppContext.tsx:161-178 복제) ──────────────────────────
// 지역별 회원사 수량(수급자+차상위 합). 회원사 입력 없고 지역 회원사 1곳뿐이면 orders값을 그 회원사에 귀속.
export function computeAllocations(orders: Orders, partnerInputs: PartnerInputs): Record<string, Record<string, number>> {
  const computed: Record<string, Record<string, number>> = {};
  REGION_ORDER.forEach(r => {
    computed[r] = {};
    const partners = PARTNER_REGIONS_INVERSE[r] || [];
    partners.forEach(m => {
      const pData = partnerInputs[m]?.[r] || {};
      const pQty = (Number(pData.basicQty) || 0) + (Number(pData.povertyQty) || 0);
      if (pQty > 0) computed[r][m] = pQty;
    });
    if (Object.keys(computed[r]).length === 0 && partners.length === 1) {
      const o = orders[r] || {};
      const oQty = (Number(o.basicQty) || 0) + (Number(o.povertyQty) || 0);
      if (oQty > 0) computed[r][partners[0]] = oQty;
    }
  });
  return computed;
}

// ─── 회원사별 수량 (수급자/차상위 분리, 지자체별 분해 포함). computedAllocations와 동일한 귀속 규칙 ──
function quantityByCompany(orders: Orders, partnerInputs: PartnerInputs): CompanyQty[] {
  const map: Record<string, { basicQty: number; povertyQty: number; regionMap: Record<string, CompanyRegionQty> }> = {};
  const add = (company: string, region: string, basic: number, pov: number) => {
    if (!map[company]) map[company] = { basicQty: 0, povertyQty: 0, regionMap: {} };
    map[company].basicQty += basic;
    map[company].povertyQty += pov;
    if (!map[company].regionMap[region]) map[company].regionMap[region] = { region, basicQty: 0, povertyQty: 0 };
    map[company].regionMap[region].basicQty += basic;
    map[company].regionMap[region].povertyQty += pov;
  };
  REGION_ORDER.forEach(r => {
    const partners = PARTNER_REGIONS_INVERSE[r] || [];
    let anyInput = false;
    partners.forEach(m => {
      const pData = partnerInputs[m]?.[r] || {};
      const basic = Number(pData.basicQty) || 0;
      const pov = Number(pData.povertyQty) || 0;
      if (basic + pov > 0) { anyInput = true; add(m, r, basic, pov); }
    });
    if (!anyInput && partners.length === 1) {
      const o = orders[r] || {};
      const basic = Number(o.basicQty) || 0;
      const pov = Number(o.povertyQty) || 0;
      if (basic + pov > 0) add(partners[0], r, basic, pov);
    }
  });
  return Object.entries(map)
    .map(([company, q]) => ({
      company, basicQty: q.basicQty, povertyQty: q.povertyQty,
      regions: REGION_ORDER.filter(r => q.regionMap[r]).map(r => q.regionMap[r]),
    }))
    .sort((a, b) => a.company.localeCompare(b.company));
}

// ─── 수량 통합 (orderSummaries AppContext.tsx:233-244 + 지자체/회원사 분해) ────────
export function computeQuantity(raw: MonthRaw): QuantityResult {
  const partnerAgg = aggregatePartnerOrders(raw.partnerInputs);
  const byRegion: QtyByRegion[] = [];
  const seoulTotal: RegionQty = { basicQty: 0, povertyQty: 0 };
  const gyeonggiTotal: RegionQty = { basicQty: 0, povertyQty: 0 };
  const grandTotal: RegionQty = { basicQty: 0, povertyQty: 0 };
  REGION_ORDER.forEach(r => {
    const eo = effectiveOrder(r, raw.orders, partnerAgg);
    byRegion.push({ region: r, basicQty: eo.basicQty, povertyQty: eo.povertyQty });
    grandTotal.basicQty += eo.basicQty;
    grandTotal.povertyQty += eo.povertyQty;
    const t = SEOUL_REGIONS.includes(r) ? seoulTotal : gyeonggiTotal;
    t.basicQty += eo.basicQty;
    t.povertyQty += eo.povertyQty;
  });
  const byCompany = quantityByCompany(raw.orders, raw.partnerInputs);
  return { byRegion, byCompany, seoulTotal, gyeonggiTotal, grandTotal };
}

// ─── 계산서발급액: billingReport (AppContext.tsx:180-204 복제) ──────────────────
export function computeBillingReport(raw: MonthRaw): BillingReport {
  const partnerAgg = aggregatePartnerOrders(raw.partnerInputs);
  const report: BillingItem[] = [];
  const gTotal: BillingTotal = { qty: 0, supply: 0, vat: 0, amount: 0 };
  const sTotal: BillingTotal = { qty: 0, supply: 0, vat: 0, amount: 0 };
  const grandTotal: BillingTotal = { qty: 0, supply: 0, vat: 0, amount: 0 };
  REGION_ORDER.forEach(r => {
    const z = raw.regions[r] || '2급지';
    const p = raw.zonePrices[z]?.billing || 0;
    const order = effectiveOrder(r, raw.orders, partnerAgg);
    const tr = order.basicQty + order.povertyQty;
    if (tr > 0) {
      const isSeoul = SEOUL_REGIONS.includes(r);
      const city = isSeoul ? '서울시' : '경기도';
      const calc = (q: number): BillingCalc => { const tot = q * p; const sup = Math.round(tot / 1.1); const vat = tot - sup; return { qty: q, tot, sup, vat }; };
      const poverty = calc(order.povertyQty);
      const basic = calc(order.basicQty);
      const sum = { qty: tr, amount: poverty.tot + basic.tot, supply: poverty.sup + basic.sup, vat: poverty.vat + basic.vat };
      report.push({ city, region: r, poverty, basic, sum });
      const t = isSeoul ? sTotal : gTotal;
      t.qty += tr; t.amount += sum.amount; t.supply += sum.supply; t.vat += sum.vat;
      grandTotal.qty += tr; grandTotal.amount += sum.amount; grandTotal.supply += sum.supply; grandTotal.vat += sum.vat;
    }
  });
  return { report, gTotal, sTotal, grandTotal };
}

// ─── 결제내역: billingSummary (AppContext.tsx:206-231 복제) ─────────────────────
export function computeBillingSummary(raw: MonthRaw): BillingSummary {
  const allocations = computeAllocations(raw.orders, raw.partnerInputs);
  let gtQty = 0, gtSup = 0, gtVat = 0, gtAmt = 0;
  const pDetails: Record<string, Omit<PartnerBillingSummaryItem, 'member'>> = {};
  REGION_ORDER.forEach(r => {
    const z = raw.regions[r] || '2급지';
    const price = raw.zonePrices[z]?.billing || 0;
    Object.entries(allocations[r] || {}).forEach(([m, qty]) => {
      if (qty > 0) {
        const total = Math.floor((qty * price * 0.975) / 100) * 100;
        const supply = Math.round(total / 1.1);
        const vat = total - supply;
        if (!pDetails[m]) pDetails[m] = { totalQty: 0, totalSupply: 0, totalVat: 0, totalAmount: 0, regions: [] };
        pDetails[m].totalQty += qty;
        pDetails[m].totalSupply += supply;
        pDetails[m].totalVat += vat;
        pDetails[m].totalAmount += total;
        pDetails[m].regions.push({ region: r, qty, supplyValue: supply, vatValue: vat, finalRowTotal: total });
        gtQty += qty; gtSup += supply; gtVat += vat; gtAmt += total;
      }
    });
  });
  const sorted = Object.entries(pDetails)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([member, d]) => ({ member, ...d }));
  return { sorted, grandTotalQty: gtQty, grandTotalSupply: gtSup, grandTotalVat: gtVat, grandTotalAmount: gtAmt };
}

// ─── 월 통합 ───────────────────────────────────────────────────────────────────
export function computeMonthStats(raw: MonthRaw): MonthStats {
  return {
    month: raw.month,
    exists: raw.exists,
    isClosed: raw.isClosed,
    quantity: computeQuantity(raw),
    billingReport: computeBillingReport(raw),
    billingSummary: computeBillingSummary(raw),
  };
}

// ─── 기간 합산 (정수 덧셈만 — 월별 round/100원 절사 결과를 그대로 누적) ─────────────
//     ⚠️ "단가 × 총수량" 재계산 금지: 월별 절사와 어긋남.
const emptyTotal = (): BillingTotal => ({ qty: 0, supply: 0, vat: 0, amount: 0 });
const emptyCalc = (): BillingCalc => ({ qty: 0, tot: 0, sup: 0, vat: 0 });
const addTotal = (a: BillingTotal, b: BillingTotal) => { a.qty += b.qty; a.supply += b.supply; a.vat += b.vat; a.amount += b.amount; };
const addCalc = (a: BillingCalc, b: BillingCalc) => { a.qty += b.qty; a.tot += b.tot; a.sup += b.sup; a.vat += b.vat; };

function sumQuantity(list: QuantityResult[]): QuantityResult {
  const regionMap: Record<string, QtyByRegion> = {};
  REGION_ORDER.forEach(r => { regionMap[r] = { region: r, basicQty: 0, povertyQty: 0 }; });
  const companyMap: Record<string, { basicQty: number; povertyQty: number; regionMap: Record<string, CompanyRegionQty> }> = {};
  const seoulTotal: RegionQty = { basicQty: 0, povertyQty: 0 };
  const gyeonggiTotal: RegionQty = { basicQty: 0, povertyQty: 0 };
  const grandTotal: RegionQty = { basicQty: 0, povertyQty: 0 };
  list.forEach(q => {
    q.byRegion.forEach(r => { if (regionMap[r.region]) { regionMap[r.region].basicQty += r.basicQty; regionMap[r.region].povertyQty += r.povertyQty; } });
    q.byCompany.forEach(c => {
      if (!companyMap[c.company]) companyMap[c.company] = { basicQty: 0, povertyQty: 0, regionMap: {} };
      const dst = companyMap[c.company];
      dst.basicQty += c.basicQty;
      dst.povertyQty += c.povertyQty;
      c.regions.forEach(rg => {
        if (!dst.regionMap[rg.region]) dst.regionMap[rg.region] = { region: rg.region, basicQty: 0, povertyQty: 0 };
        dst.regionMap[rg.region].basicQty += rg.basicQty;
        dst.regionMap[rg.region].povertyQty += rg.povertyQty;
      });
    });
    seoulTotal.basicQty += q.seoulTotal.basicQty; seoulTotal.povertyQty += q.seoulTotal.povertyQty;
    gyeonggiTotal.basicQty += q.gyeonggiTotal.basicQty; gyeonggiTotal.povertyQty += q.gyeonggiTotal.povertyQty;
    grandTotal.basicQty += q.grandTotal.basicQty; grandTotal.povertyQty += q.grandTotal.povertyQty;
  });
  return {
    byRegion: REGION_ORDER.map(r => regionMap[r]),
    byCompany: Object.entries(companyMap)
      .map(([company, d]) => ({
        company, basicQty: d.basicQty, povertyQty: d.povertyQty,
        regions: REGION_ORDER.filter(r => d.regionMap[r]).map(r => d.regionMap[r]),
      }))
      .sort((a, b) => a.company.localeCompare(b.company)),
    seoulTotal, gyeonggiTotal, grandTotal,
  };
}

function sumBillingReport(list: BillingReport[]): BillingReport {
  const itemMap: Record<string, BillingItem> = {};
  const gTotal = emptyTotal(), sTotal = emptyTotal(), grandTotal = emptyTotal();
  list.forEach(br => {
    br.report.forEach(it => {
      if (!itemMap[it.region]) {
        itemMap[it.region] = {
          city: SEOUL_REGIONS.includes(it.region) ? '서울시' : '경기도',
          region: it.region,
          poverty: emptyCalc(), basic: emptyCalc(),
          sum: { qty: 0, amount: 0, supply: 0, vat: 0 },
        };
      }
      const dst = itemMap[it.region];
      addCalc(dst.poverty, it.poverty);
      addCalc(dst.basic, it.basic);
      dst.sum.qty += it.sum.qty; dst.sum.amount += it.sum.amount; dst.sum.supply += it.sum.supply; dst.sum.vat += it.sum.vat;
    });
    addTotal(gTotal, br.gTotal); addTotal(sTotal, br.sTotal); addTotal(grandTotal, br.grandTotal);
  });
  const report = REGION_ORDER.filter(r => itemMap[r]).map(r => itemMap[r]);
  return { report, gTotal, sTotal, grandTotal };
}

function sumBillingSummary(list: BillingSummary[]): BillingSummary {
  const memberMap: Record<string, Omit<PartnerBillingSummaryItem, 'member'> & { regionMap: Record<string, PartnerBillingRegion> }> = {};
  let gtQty = 0, gtSup = 0, gtVat = 0, gtAmt = 0;
  list.forEach(bs => {
    bs.sorted.forEach(item => {
      if (!memberMap[item.member]) memberMap[item.member] = { totalQty: 0, totalSupply: 0, totalVat: 0, totalAmount: 0, regions: [], regionMap: {} };
      const dst = memberMap[item.member];
      dst.totalQty += item.totalQty; dst.totalSupply += item.totalSupply; dst.totalVat += item.totalVat; dst.totalAmount += item.totalAmount;
      item.regions.forEach(rg => {
        if (!dst.regionMap[rg.region]) dst.regionMap[rg.region] = { region: rg.region, qty: 0, supplyValue: 0, vatValue: 0, finalRowTotal: 0 };
        const rdst = dst.regionMap[rg.region];
        rdst.qty += rg.qty; rdst.supplyValue += rg.supplyValue; rdst.vatValue += rg.vatValue; rdst.finalRowTotal += rg.finalRowTotal;
      });
    });
    gtQty += bs.grandTotalQty; gtSup += bs.grandTotalSupply; gtVat += bs.grandTotalVat; gtAmt += bs.grandTotalAmount;
  });
  const sorted: PartnerBillingSummaryItem[] = Object.entries(memberMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([member, d]) => ({
      member,
      totalQty: d.totalQty, totalSupply: d.totalSupply, totalVat: d.totalVat, totalAmount: d.totalAmount,
      regions: REGION_ORDER.filter(r => d.regionMap[r]).map(r => d.regionMap[r]),
    }));
  return { sorted, grandTotalQty: gtQty, grandTotalSupply: gtSup, grandTotalVat: gtVat, grandTotalAmount: gtAmt };
}

export function aggregatePeriod(monthStatsList: MonthStats[]): PeriodStats {
  const months = [...monthStatsList].sort((a, b) => a.month.localeCompare(b.month));
  return {
    months,
    quantityTotal: sumQuantity(months.map(m => m.quantity)),
    billingReportTotal: sumBillingReport(months.map(m => m.billingReport)),
    billingSummaryTotal: sumBillingSummary(months.map(m => m.billingSummary)),
  };
}

// ─── 월 범위 생성 ('YYYY-MM' 포함 범위, start>end면 swap) ────────────────────────
export function monthRange(start: string, end: string): string[] {
  let s = start, e = end;
  if (s > e) { const t = s; s = e; e = t; }
  const [sy, sm] = s.split('-').map(Number);
  const [ey, em] = e.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const result: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return result;
}
