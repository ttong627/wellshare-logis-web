// 금액 계산 — ecount_sync.py:test_sale 과 동일 규칙.
// 라인별: tot = qty * price(VAT포함), sup = round(tot/1.1), vat = tot - sup.
// 각 라인이 sup+vat=tot 로 내부정합하므로 합계는 항상 sum(tot)와 일치한다.
// (안전장치) 부동소수 누적오차 방지를 위해 정수 연산으로 처리.

export interface SaleLineInput {
  prodCd: string;
  prodDes: string;
  qty: number;
  price: number; // VAT 포함 단가
}

export interface ComputedLine extends SaleLineInput {
  total: number;
  supply: number;
  vat: number;
}

export interface ComputedAmounts {
  lines: ComputedLine[];
  supply: number;
  vat: number;
  total: number;
}

export function computeAmounts(lines: SaleLineInput[]): ComputedAmounts {
  const computed: ComputedLine[] = lines.map((l) => {
    const total = Math.round(l.qty * l.price);
    const supply = Math.round(total / 1.1);
    const vat = total - supply;
    return { ...l, total, supply, vat };
  });

  const supply = computed.reduce((s, l) => s + l.supply, 0);
  const vat = computed.reduce((s, l) => s + l.vat, 0);
  const total = computed.reduce((s, l) => s + l.total, 0);

  return { lines: computed, supply, vat, total };
}
