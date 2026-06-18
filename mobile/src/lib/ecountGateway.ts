// ECOUNT 통합 게이트웨이 호출(모바일). 웹 src/lib/ecountGateway.ts와 동일 매핑.
// billingReport 행정구 → 게이트웨이 /ecount/sale 전송. 토큰은 auth.currentUser.getIdToken() 주입.
import { getFullRegionName } from '../constants';
import type { BillingRow } from './billing';

const GATEWAY_URL = 'https://ecount-gateway-673351301105.asia-northeast3.run.app';

export const ECOUNT_COMPANIES = [
  { comCode: '631989', label: '웰쉐어 로지스' },
  { comCode: '156855', label: '웰쉐어 사협' },
];
export const DEFAULT_COMCODE = '631989';

// 급지 → ECOUNT 품목코드 (회사별)
const ZONE_TO_PROD: Record<string, string> = {
  '1급지': 'wsl_z1', '2급지': 'wsl_z2', '3급지': 'wsl_z3', '4급지': 'wsl_z4',
  '5급지': 'wsl_z5', '6급지': 'wsl_z6', '7급지': 'wsl_z7',
};
const ZONE_TO_PROD_BY_COMPANY: Record<string, Record<string, string>> = {
  '631989': ZONE_TO_PROD,
  '156855': { '1급지': 'j_0002', '2급지': 'j_0001', '4급지': 'j_0004' },
};

export interface SaleLine { prodCd: string; prodDes: string; qty: number; price: number; supply: number; vat: number }
export interface SalePayload { comCode: string; month: number; region: string; lines: SaleLine[] }
export interface SendResult {
  ok: boolean; region: string; slipNos?: string[]; cached?: boolean;
  status: number; errorCode?: string; message?: string;
}

// billingReport 행정구 1건 → 전송 페이로드. 화면이 쓰는 실제 단가/급지 주입.
export function buildRegionPayload(
  item: BillingRow, month: number,
  regions: Record<string, string>, zonePrices: Record<string, { billing: number }>,
  comCode: string,
): SalePayload {
  const zone = regions[item.region] ?? item.zone ?? '2급지';
  const zoneMap = ZONE_TO_PROD_BY_COMPANY[comCode] ?? ZONE_TO_PROD;
  const prodCd = zoneMap[zone] ?? zoneMap['2급지'] ?? 'wsl_z2';
  const price = Math.round(zonePrices[zone]?.billing ?? item.price ?? 0);
  const prodDes = `${getFullRegionName(item.region)} ${month}월 정부양곡배송비`;
  return {
    comCode, month, region: item.region,
    lines: [{ prodCd, prodDes, qty: item.sum.qty, price, supply: item.sum.supply, vat: item.sum.vat }],
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: '로그인이 필요합니다',
  invalid_token: '인증이 만료됐습니다. 다시 시도하세요',
  forbidden: '관리자 권한이 없습니다',
  conflict: '이미 전송됨 (ECOUNT 확인 필요)',
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
        ok: true, region: payload.region,
        slipNos: data.slipNos as string[] | undefined,
        cached: data.cached as boolean | undefined, status: res.status,
      };
    }
    const code = data.error as string | undefined;
    return {
      ok: false, region: payload.region, status: res.status, errorCode: code,
      message: (code && ERROR_MESSAGES[code]) || (data.message as string) || `오류 (${res.status})`,
    };
  } catch (e) {
    return { ok: false, region: payload.region, status: 0, message: '네트워크 오류: ' + (e as Error).message };
  }
}
