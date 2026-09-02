// ─── 사용자 / 권한 ─────────────────────────────────────────────────
export enum UserRole {
  ADMIN = 'ADMIN',
  PARTNER = 'PARTNER',
}

export interface PartnerAccountsDB {
  [email: string]: string; // email → company name or 'ADMIN'
}

// ─── 정산 데이터 ────────────────────────────────────────────────────
export interface ZonePrice {
  billing: number;
}

export type ZonePrices = Record<string, ZonePrice>;
export type RegionsData = Record<string, string>; // region → zone

export interface OrderData {
  basicQty?: number | '';
  povertyQty?: number | '';
}

export type Orders = Record<string, OrderData>;

export interface PartnerRegionData {
  basicQty?: number | '';
  povertyQty?: number | '';
}

export type PartnerInputs = Record<string, Record<string, PartnerRegionData>>;
export type Allocations = Record<string, Record<string, number>>;

// ─── 배송 완료 ───────────────────────────────────────────────────────
export interface DeliveryData {
  date?: string;
  delayDays?: number | '';
}

export type DeliveryDates = Record<string, Record<string, DeliveryData>>;

// ─── 세금계산서 ──────────────────────────────────────────────────────
export type PublishDates = Record<string, Record<string, string>>;
export type PublishRequests = Record<string, Record<string, string>>;

// ─── 월별 저장 데이터 ─────────────────────────────────────────────────
export interface MonthRecord {
  zonePrices: ZonePrices;
  regions: RegionsData;
  orders: Orders;
  partnerInputs: PartnerInputs;
  publishDates: PublishDates;
  publishRequests: PublishRequests;
  deliveryDates: DeliveryDates;
  isClosed: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

// ─── 알림 ────────────────────────────────────────────────────────────
export interface Notification {
  id: string;
  message: string;
  target: string;
  timestamp: string;
  readBy?: string[]; // 읽은 사용자 uid 목록 (다중 관리자 유실 방지 — 삭제 대신 읽음처리)
  signupEmail?: string; // 신규 가입요청 알림에만 존재 — UsersTab 승인 대기 목록 파싱용
}

// ─── 공문 작성 (ttong) ───────────────────────────────────────────────
export enum DocType {
  A = 'WELSHARE_SOCIETY',
  B = 'WELSHARE_LOGIS',
  // 2026-09-02 CI 디자인판 — 기존 A·B 는 그대로 두고 새 서식을 나란히 둔다
  A_CI = 'WELSHARE_SOCIETY_CI',
  B_CI = 'WELSHARE_LOGIS_CI',
  N_CI = 'NARAMI_GYEONGGI_CI',
}

/** 문서 서식 계열 — 'classic'(기존 편집기) / 'ci2026'(한글 양식과 동일 조판) */
export type DocDesign = 'classic' | 'ci2026';

export interface DocPageFormat {
  // ── 페이지 여백 ──────────────────────────────────────
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;

  // ── 머리말 전체 ──────────────────────────────────────
  headerYOffset: number;      // 머리말 전체 시작 위치 (mm)
  headerLayout: 'centered' | 'logo-left' | 'side-by-side';
  headerStyle: 'solid' | 'double' | 'gradient' | 'dashed' | 'none';
  headerBgColor: string;
  headerBorderWidth: number;
  headerPaddingBottom: number;
  headerMarginBottom: number;

  // 로고
  logoHeight: number;
  logoMarginBottom: number;
  logoXOffset: number;
  logoYOffset: number;

  // 기관명
  orgNameFontFamily: string;
  orgNameFontSize: number;
  orgNameLetterSpacing: number;
  orgNameColor: string;
  orgNameAlign: 'left' | 'center' | 'right';
  orgNameXOffset: number;
  orgNameYOffset: number;

  // 슬로건
  showSlogan: boolean;
  sloganFontFamily: string;
  sloganFontSize: number;
  sloganColor: string;
  sloganAlign: 'left' | 'center' | 'right';
  sloganXOffset: number;
  sloganYOffset: number;

  // 연락처 (머리말)
  showContact: boolean;
  contactFontSize: number;
  contactColor: string;
  contactAlign: 'left' | 'center' | 'right';
  contactXOffset: number;

  // ── 본문 전체 ────────────────────────────────────────
  bodyYOffset: number;        // 본문 전체 시작 위치 추가 여백 (mm)

  // 메타정보
  metaStyle: 'table' | 'compact' | 'minimal';
  metaFontSize: number;

  // 제목
  subjectFontFamily: string;
  subjectFontSize: number;
  subjectAlign: 'left' | 'center' | 'right';
  subjectBold: boolean;
  subjectStyle: 'plain' | 'box' | 'underline' | 'gradient';

  // 본문 텍스트
  bodyFontFamily: string;
  bodyFontSize: number;
  bodyLineHeight: number;
  bodyAlign: 'left' | 'center' | 'right';
  bodyXOffset: number;

  // 첨부항목 (다음 목록)
  itemsFontFamily: string;
  itemsFontSize: number;
  itemsLineHeight: number;
  itemsAlign: 'left' | 'center' | 'right';
  itemsXOffset: number;

  // 구분선 (다음)
  dividerStyle: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  dividerColor: string;

  // ── 꼬리말 전체 ──────────────────────────────────────
  footerYOffset: number;      // 페이지 하단에서의 거리 (mm) — 절대 위치
  footerStyle: 'simple' | 'official';
  footerFontFamily: string;
  footerFontSize: number;
  footerAlign: 'left' | 'center' | 'right';
  footerXOffset: number;

  // 심플 꼬리말 항목
  showFooterOrgName: boolean;
  showFooterRepresentative: boolean;
  showFooterManager: boolean;
  showFooterAddress: boolean;
  showFooterTel: boolean;
  showFooterFax: boolean;
  showFooterEmail: boolean;

  // 도장
  sealHeight: number;
  sealRight: number;
  sealBottom: number;
  sealOpacity: number;

  // 워터마크
  watermarkText: string;
  watermarkOpacity: number;

  // 사용자 CSS
  customCss: string;
}

export interface DocTemplate {
  id: string;
  name: string;
  docPrefix: string;
  isBuiltIn?: boolean;
  orgName: string;
  orgSlogan: string;
  manager?: string;
  assistant?: string;
  representative: string;
  representativeTitle: string;
  address: string;
  postalCode: string;
  tel: string;
  fax: string;
  email: string;
  themeColor: string;
  publicStatus: string;
  logoUrl: string;
  sealUrl: string;
  headerExtraLines?: string[];
  footerExtraLines?: string[];
  format: DocPageFormat;
  /** 없으면 'classic' — 기존 문서가 깨지지 않게 기본값을 유지한다 */
  design?: DocDesign;
  /** ci2026 전용: 상·하단 띠 색 (웰쉐어 3색 / 나르미 5색) */
  ciColors?: string[];
  /** ci2026 전용: 로고 높이(mm) — 한글 양식과 같은 값 */
  ciLogoHeightMm?: number;
  /** ci2026 전용: 법인명 글자 크기(pt) */
  ciOrgNameSize?: number;
  /** ci2026 전용: 결재란 직함 — 발신명의는 '대표이사', 결재란은 '대표'가 공문 관례 */
  ciApprovalTitle?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocFormatSettings {
  orgName: string;
  slogan: string;
  representative: string;
  representativeTitle: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  publicStatus: string;
  sealText: string;
  themeColor: string;
  logoUrl?: string;
  fontFamily: string;
  orgNameSize: number;
  orgNameLetterSpacing: number;
  contentSize: number;
  contentColor: string;
  headerMarginTop: number;
  headerLogoHeight: number;
  showCenterLogo: boolean;
  footerMarginTop: number;
  footerLineColor: string;
  footerLineThickness: number;
  footerFontSize: number;
  sealUrl?: string;
  sealShape: 'circle' | 'square';
  sealSize: number;
  sealRightOffset: number;
  sealTopOffset: number;
  orgNameColor: string;
  orgNameFontFamily: string;
  orgNameXOffset: number;
  orgNameYOffset: number;
  sloganColor: string;
  sloganSize: number;
  sloganXOffset: number;
  sloganYOffset: number;
  sloganFontFamily: string;
  metadataSize: number;
  metadataXOffset: number;
  metadataYOffset: number;
  lineThickness: number;
  lineWidth: number;
  lineYOffset: number;
  lineColor: string;
  bodyMarginTop: number;
  bodySpacing: number;
  contentXOffset: number;
  contentYOffset: number;
  body1Align: 'left' | 'center' | 'right';
  body2Align: 'left' | 'center' | 'right';
  body3Align: 'left' | 'center' | 'right';
  body4Align: 'left' | 'center' | 'right';
  itemsHeader: string;
  itemsHeaderYOffset: number;
  itemsAlign: 'left' | 'center' | 'right';
  itemsSize: number;
  itemsLineHeight: number;
  metadataLabelWidth: number;
  metadataPaddingX: number;
  signatureXOffset: number;
  signatureYOffset: number;
  manager: string;
  associate: string;
}

export interface DocHistoryItem {
  id: string;
  timestamp: string;
  type: string;
  receiver: string;
  subject: string;
  docNo: { year: number; num: number };
  data: OfficialDocSnapshot;
}

export interface OfficialDocSnapshot {
  type: string;
  receiver: string;
  via: string;
  subject: string;
  body1: string;
  body2: string;
  body3?: string;
  body4?: string;
  items: string[];
  date: string;
  docNo: { year: number; num: number };
  docNumber?: string;
  settingsSnapshot: DocFormatSettings;
}

export interface OfficialDoc {
  type: DocType;
  receiver: string;
  via: string;
  subject: string;
  body1: string;
  body2: string;
  body3?: string;
  body4?: string;
  items: string[];
  date: string;
  docNo: { year: number; num: number };
  docNumber?: string;
  settings: Record<DocType, DocFormatSettings>;
  history: DocHistoryItem[];
  updatedAt?: number;
}

// ─── 청구 계산 ────────────────────────────────────────────────────────
export interface BillingCalc { qty: number; tot: number; sup: number; vat: number; }
export interface BillingTotal { qty: number; supply: number; vat: number; amount: number; }
export interface BillingItem {
  city: string;
  region: string;
  poverty: BillingCalc;
  basic: BillingCalc;
  sum: { qty: number; amount: number; supply: number; vat: number; };
}
export interface BillingReport {
  report: BillingItem[];
  gTotal: BillingTotal;
  sTotal: BillingTotal;
  grandTotal: BillingTotal;
}

// ECOUNT 발행 내역 (회사코드 → 지자체 → 발행 결과) — billing_records 영구 저장
export interface EcountSaleRecord {
  status: 'done' | 'cached';
  slipNos: string[];
  comCode: string;
  total: number;
  sentAt: string;
}
export type EcountSales = Record<string, Record<string, EcountSaleRecord>>;

export interface PartnerBillingRegion {
  region: string;
  qty: number;
  supplyValue: number;
  vatValue: number;
  finalRowTotal: number;
}
export interface PartnerBillingSummaryItem {
  member: string;
  totalQty: number;
  totalSupply: number;
  totalVat: number;
  totalAmount: number;
  regions: PartnerBillingRegion[];
}
export interface BillingSummary {
  sorted: PartnerBillingSummaryItem[];
  grandTotalQty: number;
  grandTotalSupply: number;
  grandTotalVat: number;
  grandTotalAmount: number;
}

export interface OrderSummaries {
  seoulTotal: number;
  gyeonggiTotal: number;
  overallTotal: number;
  basicTotal: number;
  povertyTotal: number;
}

// ─── 배송일정 (ttong) ─────────────────────────────────────────────────
export interface Driver {
  id: string;
  name: string;
  phone: string;
  emergency: string;
}

export interface EmergencyContact {
  id: string;
  sido: string;
  sigungu: string;
  phone: string;
  description: string;
  updatedAt: string;
}

export interface ScheduleItem {
  id: string;
  no: number;
  dong: string;
  driverName: string;
  driverPhone: string;
  emergencyPhone: string;
  deliveryDate: string;
  deliveryDates?: string[];
  isCompleted: boolean;
  notes: string;
}

export interface ScheduleData {
  year: number;
  month: number;
  sido: string;
  sigungu: string;
  items: ScheduleItem[];
  lastUpdated?: string;
  version?: number;   // 낙관적 잠금: 동시저장 충돌 감지용
}

// ─── 엑셀(SheetJS) 경계 타입 ────────────────────────────────────────────────
// XLSX는 CDN 전역으로 로드되는 외부 라이브러리다. 타입 패키지를 붙이는 대신,
// 이 앱이 실제로 호출하는 API만 최소로 정의해 경계에서만 타입을 고정한다.
// (전수 조사 2026-08-11: utils.book_new / aoa_to_sheet / table_to_sheet /
//  book_append_sheet, writeFile, 시트 속성 '!cols'·'!merges' — 그 외 사용처 없음)
export type ExcelCell = string | number | null;
export interface ExcelMerge { s: { r: number; c: number }; e: { r: number; c: number } }
export interface ExcelColWidth { wpx?: number; wch?: number }
export interface ExcelSheet {
  '!cols'?: ExcelColWidth[];
  '!merges'?: ExcelMerge[];
  [key: string]: unknown;
}
export interface ExcelWorkbook {
  SheetNames: string[];
  Sheets: Record<string, ExcelSheet>;
}
export interface XlsxApi {
  utils: {
    book_new(): ExcelWorkbook;
    aoa_to_sheet(data: ExcelCell[][]): ExcelSheet;
    table_to_sheet(el: HTMLElement): ExcelSheet;
    book_append_sheet(wb: ExcelWorkbook, ws: ExcelSheet, name: string): void;
  };
  writeFile(wb: ExcelWorkbook, fileName: string): void;
}
