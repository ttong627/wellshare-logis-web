// ECOUNT 통합 게이트웨이 호출 클라이언트.
// billingReport 행정구 항목 → 게이트웨이 /ecount/sale 전송. 토큰은 호출부에서 주입.
import { BillingItem } from '../types';
import { ZONE_TO_PROD } from './ecountExport';
import { getFullRegionName } from '../constants/regions';

const GATEWAY_URL =
  (import.meta.env.VITE_ECOUNT_GATEWAY_URL as string | undefined) ??
  'https://ecount-gateway-673351301105.asia-northeast3.run.app';

// 발행 회사(COM_CODE) — 게이트웨이 ECOUNT_COMPANIES와 동일하게 유지
export const ECOUNT_COMPANIES = [
  { comCode: '631989', label: '웰쉐어 로지스' },
  { comCode: '156855', label: '웰쉐어 사협' },
];
export const DEFAULT_COMCODE = '631989';

// 회사별 급지→ECOUNT 품목코드 (회사마다 품목코드 체계가 다름)
const ZONE_TO_PROD_BY_COMPANY: Record<string, Record<string, string>> = {
  '631989': ZONE_TO_PROD, // wsl_z1~z7
  // 156855 (형 확인): j_0001=2급지, j_0002=1급지, j_0004=4급지 — 현 정산은 1·2·4급지만 사용
  '156855': { '1급지': 'j_0002', '2급지': 'j_0001', '4급지': 'j_0004' },
};

export interface SaleLine {
  prodCd: string;
  prodDes: string;
  qty: number;
  price: number;
  supply: number;
  vat: number;
}
export interface SalePayload {
  comCode: string;
  month: number;
  region: string;
  lines: SaleLine[];
}
export interface SendResult {
  ok: boolean;
  region: string;
  slipNos?: string[];
  cached?: boolean;
  status: number;
  errorCode?: string;
  message?: string;
}

// billingReport 행정구 1건 → 전송 페이로드 (ecountExport.buildEcountSaleRows와 동일 매핑).
// 급지(regions)·단가(zonePrices)는 화면이 쓰는 실제 편집값을 주입받는다 — 하드코딩 상수 금지
// (편집된 단가/급지와 ECOUNT 전송값이 어긋나는 것을 방지).
export function buildRegionPayload(
  item: BillingItem,
  month: number,
  regions: Record<string, string>,
  zonePrices: Record<string, { billing: number }>,
  comCode: string,
): SalePayload {
  const zone = regions[item.region] ?? '2급지';
  const zoneMap = ZONE_TO_PROD_BY_COMPANY[comCode] ?? ZONE_TO_PROD;
  const prodCd = zoneMap[zone] ?? zoneMap['2급지'] ?? 'wsl_z2';
  const price = Math.round(zonePrices[zone]?.billing ?? 0); // 정수 보장(게이트웨이 검증 대응)
  const prodDes = `${getFullRegionName(item.region)} ${month}월 정부양곡배송비`;
  return {
    comCode,
    month,
    region: item.region,
    lines: [
      { prodCd, prodDes, qty: item.sum.qty, price, supply: item.sum.supply, vat: item.sum.vat },
    ],
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: '로그인이 필요합니다',
  invalid_token: '인증이 만료됐습니다. 새로고침 후 다시 시도하세요',
  email_not_verified: '이메일 인증이 필요합니다',
  forbidden: '관리자 권한이 없습니다',
  conflict: '다른 내용으로 이미 전송됨 (ECOUNT 확인 필요)',
  in_progress: '같은 행정구 처리 중',
  ecount_error: 'ECOUNT 처리 오류',
  invalid_input: '입력값 오류',
  ip_lookup_failed: 'egress 확인 실패',
};

// force=true: ECOUNT에서 기존 전표를 삭제한 뒤 새 전표를 강제 발행(멱등성 우회).
export async function sendRegion(token: string, payload: SalePayload, force = false): Promise<SendResult> {
  try {
    const res = await fetch(`${GATEWAY_URL}/ecount/sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(force ? { ...payload, force: true } : payload),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && data.ok) {
      return {
        ok: true,
        region: payload.region,
        slipNos: data.slipNos as string[] | undefined,
        cached: data.cached as boolean | undefined,
        status: res.status,
      };
    }
    const code = data.error as string | undefined;
    return {
      ok: false,
      region: payload.region,
      status: res.status,
      errorCode: code,
      message: (code && ERROR_MESSAGES[code]) || (data.message as string) || `오류 (${res.status})`,
    };
  } catch (e) {
    return { ok: false, region: payload.region, status: 0, message: '네트워크 오류: ' + (e as Error).message };
  }
}
