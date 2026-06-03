// 정부양곡 배송비 정산 금액 계산 — 웹 AppContext의 billingReport/billingSummary 로직 1:1 포팅.
// 공급가 = round(합계/1.1), 세액 = 합계 - 공급가.
import {
  REGION_ORDER, SEOUL_REGIONS, PARTNER_REGIONS_INVERSE,
  INITIAL_ZONES, INITIAL_REGIONS_DATA,
} from '../constants';

export type QtyInput = { basicQty?: number | ''; povertyQty?: number | '' };
export type ZonePrices = Record<string, { billing: number }>;
export type RegionsMap = Record<string, string>; // region -> 급지

export interface Calc { qty: number; tot: number; sup: number; vat: number }
export interface BillingRow {
  region: string; city: '서울' | '경기'; zone: string; price: number;
  poverty: Calc; basic: Calc;
  sum: { qty: number; amount: number; supply: number; vat: number };
}
export interface Totals { qty: number; supply: number; vat: number; amount: number }
export interface BillingReport {
  report: BillingRow[];
  seoulTotal: Totals; gyeonggiTotal: Totals; grandTotal: Totals;
}

const isSeoul = (r: string) => r.includes('서울') || SEOUL_REGIONS.some((s) => r.includes(s));
const emptyTotals = (): Totals => ({ qty: 0, supply: 0, vat: 0, amount: 0 });

// 회원사 입력(partnerInputs)을 지역별로 합산
function aggregatePartners(
  partnerInputs: Record<string, Record<string, QtyInput>>,
): Record<string, { basicQty: number; povertyQty: number }> {
  const agg: Record<string, { basicQty: number; povertyQty: number }> = {};
  Object.values(partnerInputs || {}).forEach((regions) => {
    Object.entries(regions || {}).forEach(([region, d]) => {
      agg[region] ||= { basicQty: 0, povertyQty: 0 };
      agg[region].basicQty += Number(d?.basicQty) || 0;
      agg[region].povertyQty += Number(d?.povertyQty) || 0;
    });
  });
  return agg;
}

// 관리자 주문(orders)이 비어있으면 회원사 합으로 대체
function getEffectiveOrder(
  orders: Record<string, QtyInput>,
  agg: Record<string, { basicQty: number; povertyQty: number }>,
  r: string,
): { basicQty: number; povertyQty: number } {
  const o = orders?.[r] || {};
  const p = agg[r] || { basicQty: 0, povertyQty: 0 };
  const povEmpty = o.povertyQty === undefined || o.povertyQty === '';
  const basEmpty = o.basicQty === undefined || o.basicQty === '';
  return {
    povertyQty: povEmpty ? p.povertyQty : Number(o.povertyQty) || 0,
    basicQty: basEmpty ? p.basicQty : Number(o.basicQty) || 0,
  };
}

// 계산서발급용 — 지역별 공급가/세액/합계 + 서울/경기/총계
export function computeBillingReport(
  orders: Record<string, QtyInput> = {},
  partnerInputs: Record<string, Record<string, QtyInput>> = {},
  zonePrices: ZonePrices = INITIAL_ZONES,
  regions: RegionsMap = INITIAL_REGIONS_DATA,
): BillingReport {
  const agg = aggregatePartners(partnerInputs);
  const report: BillingRow[] = [];
  const seoulTotal = emptyTotals();
  const gyeonggiTotal = emptyTotals();
  const grandTotal = emptyTotals();

  REGION_ORDER.forEach((r) => {
    const zone = regions[r] || INITIAL_REGIONS_DATA[r] || '2급지';
    const price = zonePrices[zone]?.billing ?? INITIAL_ZONES[zone]?.billing ?? 0;
    const order = getEffectiveOrder(orders, agg, r);
    const tr = order.basicQty + order.povertyQty;
    if (tr <= 0) return;

    const calc = (q: number): Calc => {
      const tot = q * price;
      const sup = Math.round(tot / 1.1);
      return { qty: q, tot, sup, vat: tot - sup };
    };
    const poverty = calc(order.povertyQty);
    const basic = calc(order.basicQty);
    const sum = {
      qty: tr, amount: poverty.tot + basic.tot,
      supply: poverty.sup + basic.sup, vat: poverty.vat + basic.vat,
    };
    const seoul = isSeoul(r);
    report.push({ region: r, city: seoul ? '서울' : '경기', zone, price, poverty, basic, sum });

    const t = seoul ? seoulTotal : gyeonggiTotal;
    t.qty += tr; t.amount += sum.amount; t.supply += sum.supply; t.vat += sum.vat;
    grandTotal.qty += tr; grandTotal.amount += sum.amount;
    grandTotal.supply += sum.supply; grandTotal.vat += sum.vat;
  });

  return { report, seoulTotal, gyeonggiTotal, grandTotal };
}

export interface PartnerSettleRow { region: string; qty: number; supply: number; vat: number; total: number }
export interface PartnerSettle {
  member: string; totalQty: number; totalSupply: number; totalVat: number; totalAmount: number;
  regions: PartnerSettleRow[];
}
export interface BillingSummary {
  sorted: PartnerSettle[];
  grandTotalQty: number; grandTotalSupply: number; grandTotalVat: number; grandTotalAmount: number;
}

// 결제내역/내역확인용 — 회원사별 배분 금액(0.975 차감, 100원 절사)
export function computeBillingSummary(
  partnerInputs: Record<string, Record<string, QtyInput>> = {},
  orders: Record<string, QtyInput> = {},
  zonePrices: ZonePrices = INITIAL_ZONES,
  regions: RegionsMap = INITIAL_REGIONS_DATA,
): BillingSummary {
  // 지역 → 회원사 → 수량
  const computed: Record<string, Record<string, number>> = {};
  REGION_ORDER.forEach((r) => {
    computed[r] = {};
    const partners = PARTNER_REGIONS_INVERSE[r] || [];
    partners.forEach((m) => {
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

  const pDetails: Record<string, PartnerSettle> = {};
  let gtQty = 0, gtSup = 0, gtVat = 0, gtAmt = 0;
  REGION_ORDER.forEach((r) => {
    const zone = regions[r] || INITIAL_REGIONS_DATA[r] || '2급지';
    const price = zonePrices[zone]?.billing ?? INITIAL_ZONES[zone]?.billing ?? 0;
    Object.entries(computed[r] || {}).forEach(([m, qty]) => {
      if (qty <= 0) return;
      const total = Math.floor((qty * price * 0.975) / 100) * 100;
      const supply = Math.round(total / 1.1);
      const vat = total - supply;
      pDetails[m] ||= { member: m, totalQty: 0, totalSupply: 0, totalVat: 0, totalAmount: 0, regions: [] };
      pDetails[m].totalQty += qty;
      pDetails[m].totalSupply += supply;
      pDetails[m].totalVat += vat;
      pDetails[m].totalAmount += total;
      pDetails[m].regions.push({ region: r, qty, supply, vat, total });
      gtQty += qty; gtSup += supply; gtVat += vat; gtAmt += total;
    });
  });

  const sorted = Object.values(pDetails).sort((a, b) => a.member.localeCompare(b.member));
  return { sorted, grandTotalQty: gtQty, grandTotalSupply: gtSup, grandTotalVat: gtVat, grandTotalAmount: gtAmt };
}
