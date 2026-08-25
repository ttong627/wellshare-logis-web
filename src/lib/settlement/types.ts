// 정산 대사 엔진 타입.
// 엔진 본체(*.js)는 브라우저·Node 공용 순수 JS로 두고(의존성 0, D:\Gemma4\settlement 와 동일본),
// 앱에서 쓰는 표면만 여기서 타입으로 고정한다.

/** 대사 기준일·허용오차 등 실행 조건 */
export interface SettlementOptions {
  /** 'sale' = 매출·입금 대사 / 'purchase' = 매입·출금 대사 */
  direction: 'sale' | 'purchase';
  /** 절대 허용오차(원) — 송금수수료·상계 흡수 */
  toleranceAbs: number;
  /** 상대 허용오차(0.002 = 0.2%) */
  toleranceRate: number;
  /** 입금이 계산서보다 앞설 수 있는 일수(선입금) */
  daysBefore: number;
  /** 계산서 이후 며칠까지 입금으로 인정할지 */
  daysAfter: number;
  /** 거래처명 유사도 하한 */
  nameThreshold: number;
  /** 합산입금 조합 최대 장수 */
  comboMax: number;
  /** 이 신뢰도 이상이면 자동 확정 */
  autoConfirm: number;
  /** 결제 조건 — 발행일 + N일 = 만기 */
  creditDays: number;
  /** 남은 입금을 오래된 계산서부터 충당할지 */
  fifoAllocate: boolean;
  /** 연체일 계산 기준일 'YYYY-MM-DD' */
  asOf: string;
  /** 우리 회사 사업자번호(숫자 10). 비우면 홈택스 자료에서 추론 */
  ownBizNo?: string;
}

export type InvoiceStatus = '완납' | '부분입금' | '미입금';
export type AgingBucket = '완납' | '기한전' | '30일' | '60일' | '90일' | '90일초과';
export type SourceKind = 'hometax' | 'ecount' | 'bank';

export interface Invoice {
  id: string;
  src: string;
  kind: SourceKind;
  direction: 'sale' | 'purchase';
  rowNo: number;
  date: string | null;
  partnerName: string;
  partnerKey: string;
  partnerBizNo: string;
  amount: number;
  supply: number;
  tax: number;
  docNo: string;
  note: string;
  /** 대사로 충당된 금액 */
  paid: number;
  /** 산술 잔액 (amount - paid) */
  residual: number;
  /** 미수금 — 허용오차 안이면 0(완납 처리) */
  balance: number;
  status: InvoiceStatus;
  dueDate: string | null;
  overdueDays: number;
  agingBucket: AgingBucket;
  matchIds: string[];
  /** 홈택스·이카운트 중 어디서 왔는지 */
  sources?: SourceKind[];
}

export interface Payment {
  id: string;
  src: string;
  rowNo: number;
  date: string | null;
  time: string;
  /** 적요·기재내용 원본 */
  depositor: string;
  depositorKey: string;
  nameKeys: string[];
  inAmt: number;
  outAmt: number;
  direction: 'in' | 'out';
  amount: number;
  balance: number;
  branch: string;
  memo: string;
  matched: number;
  unmatched: number;
  status: '대사완료' | '일부대사' | '미확인';
  matchIds: string[];
}

export type MatchRule = 'exact' | 'tolerance' | 'aggregate' | 'split' | 'amountOnly' | 'fifo';

export interface Match {
  id: string;
  rule: MatchRule;
  ruleLabel: string;
  status: 'confirmed' | 'review';
  /** 사용자가 '아님'으로 판단하면 true — 잔액 계산에서 제외된다 */
  rejected: boolean;
  confidence: number;
  invoiceIds: string[];
  paymentIds: string[];
  /** 이번 매칭으로 충당된 금액 */
  amount: number;
  /** 금액 차이 */
  diff: number;
  /** 발행 → 입금 소요일 */
  days: number | null;
  partnerName: string;
  note: string;
}

export interface PartnerSummary {
  id: string;
  name: string;
  bizNo: string;
  invoiced: number;
  paid: number;
  balance: number;
  count: number;
  overdueMax: number;
  oldest: string | null;
}

export interface BucketCell { count: number; amount: number; }

export interface SettlementSummary {
  invoiceCount: number;
  invoiceTotal: number;
  paidTotal: number;
  balanceTotal: number;
  /** 허용오차 안에서 떨어낸 자투리(수수료·상계) — 미수금이 아니다 */
  writeOffTotal: number;
  settledCount: number;
  partialCount: number;
  unpaidCount: number;
  paymentCount: number;
  paymentTotal: number;
  unmatchedPaymentCount: number;
  unmatchedPaymentTotal: number;
  matchCount: number;
  confirmedCount: number;
  reviewCount: number;
  buckets: Record<string, BucketCell>;
  asOf: string;
}

/** 홈택스 ↔ 이카운트 교차검증 */
export interface CrossCheck {
  /** 국세청에는 있는데 장부에 없음 — 매출 누락 의심 */
  onlyHometax: Invoice[];
  /** 장부에만 있음 — 세금계산서 미발행 의심 */
  onlyEcount: Invoice[];
  bothCount: number;
  /** 양쪽 자료를 다 올렸을 때만 true */
  ran: boolean;
}

export interface SourceInfo {
  name: string;
  kind: SourceKind;
  kindLabel: string;
  sheetName: string;
  format: string;
  count: number;
}

export interface SettlementResult {
  invoices: Invoice[];
  payments: Payment[];
  matches: Match[];
  partners: PartnerSummary[];
  summary: SettlementSummary;
  crossCheck: CrossCheck;
  sources: SourceInfo[];
  ownBizNo: string;
  warnings: string[];
  options: SettlementOptions;
}

/** runSettlement 입력 — 브라우저 File 또는 이미 읽은 바이트 */
export interface SettlementInput {
  name: string;
  data: File | Blob | Uint8Array | ArrayBuffer;
}

export interface ReportMeta {
  title?: string;
  files?: string[];
  generatedAt?: string;
}
