// ECOUNT 통합 게이트웨이 호출 클라이언트.
// billingReport 행정구 항목 → 게이트웨이 /ecount/sale 전송. 토큰은 호출부에서 주입.
import { BillingItem } from '../types';
import { ZONE_TO_PROD } from './ecountExport';
import { getFullRegionName } from '../constants/regions';

// 게이트웨이는 이 앱의 프로젝트(wellshare-logis) 안에서 돈다. (2026-09-13 이전)
// 전에는 남의 프로젝트(logis-TMS · gen-lang-client-0075547354)에 얹혀 있어서, 2026-09-09 그 프로젝트가
// 지워지자 발행이 통째로 멈췄다. ECOUNT 허용 IP 는 이 프로젝트 NAT 고정 IP 34.64.142.198 (두 법인 등록).
const GATEWAY_URL =
  (import.meta.env.VITE_ECOUNT_GATEWAY_URL as string | undefined) ??
  'https://ecount-gateway-528541497350.asia-northeast3.run.app';

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

// 요청 상한. 게이트웨이 최악 경로 = ECOUNT 로그인 12s + SaveSale 12s + 세션만료 재로그인 12s +
// SaveSale 재시도 12s(= ecount-gateway/src/ecount.ts TIMEOUT_MS 12_000 × 4) + Cloud Run 콜드스타트·
// Firestore 왕복 ≈ 53초. 60초로 끊으면 성공할 요청을 죽인다 → 90초.
const REQUEST_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 8_000;

// AbortSignal.timeout 은 Chrome 103+ / Safari 16+ 다. 런타임 API라 트랜스파일로 못 메운다.
// 없는 기기에서 그대로 부르면 fetch 옵션을 만드는 순간 TypeError 가 나서 요청이 아예 안 나간다
// (되던 발행이 안 되는 퇴행). 없으면 상한 없이 보내던 종전 동작으로 되돌린다.
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(ms)
      : undefined;
  } catch {
    return undefined;
  }
}

// 응답 자체가 안 온 이유를 사람이 읽을 수 있는 말로 바꾼다.
// (2026-09-10 형 지적: 발행 실패 토스트에 "네트워크 오류: Failed to fetch" 만 떠서
//  무엇이 막힌 건지 — 인터넷인지, 서버인지 — 알 수 없었다.)
//
// 브라우저는 아래를 전부 똑같이 TypeError: Failed to fetch 로 뭉뚱그린다:
//   ① 인터넷 끊김  ② 게이트웨이가 죽음(5xx 는 CORS 헤더가 없어 fetch 가 아예 거부됨)  ③ CORS 차단
// 헬스체크(GET /)를 mode:'no-cors' 로 한 번 더 던지면 ①만 갈라낼 수 있다.
// no-cors 응답은 opaque(status 0)라 내용을 못 읽는다 — "응답이 오긴 했다"까지만 알려준다.
// ⚠️그래서 ②와 ③은 여기서 구분되지 않는다. 둘 다 형이 손쓸 수 없는 서버 쪽 문제라
//   한 문장으로 묶되, 서버가 죽었다고 단정하지는 않는다.
async function diagnoseFetchFailure(): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '인터넷 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도하세요';
  }
  try {
    await fetch(`${GATEWAY_URL}/`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: timeoutSignal(PROBE_TIMEOUT_MS),
    });
    return '발행 서버(ECOUNT 게이트웨이)에 닿았지만 응답을 받지 못했습니다. 서버 점검이 필요합니다 — 관리자에게 알려주세요';
  } catch {
    return '발행 서버에 연결할 수 없습니다. 인터넷 연결 또는 서버 상태를 확인하세요';
  }
}

// force=true: ECOUNT에서 기존 전표를 삭제한 뒤 새 전표를 강제 발행(멱등성 우회).
export async function sendRegion(token: string, payload: SalePayload, force = false): Promise<SendResult> {
  try {
    const res = await fetch(`${GATEWAY_URL}/ecount/sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(force ? { ...payload, force: true } : payload),
      // ECOUNT 원격 호출이 물리면 버튼이 영원히 도는 것을 막는다.
      signal: timeoutSignal(REQUEST_TIMEOUT_MS),
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
    const err = e as Error;
    // 상한에 걸린 경우 — 여기서 "다시 시도하세요" 라고 하면 안 된다.
    // 이미 발행 이력이 있는 지역([재발행] 버튼)은 BillingTab 이 force=true 로 보내고,
    // 게이트웨이 idempotency.claim() 은 force 면 done 기록을 pending 으로 덮고 ECOUNT 를 다시 호출한다.
    // 즉 서버가 뒤늦게 전표를 만든 뒤 형이 재시도하면 **전표가 두 장** 된다(비가역).
    // 상태머신이 막아주는 건 pending 동시요청과 force=false 동일입력뿐이다.
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return {
        ok: false,
        region: payload.region,
        status: 0,
        message:
          '발행 서버 응답이 늦어 기다리기를 멈췄습니다. 서버는 아직 처리 중일 수 있습니다 — ' +
          '몇 분 뒤 ECOUNT 화면에서 전표가 생겼는지 확인하고, 없을 때만 다시 발행하세요 (지금 다시 누르면 전표가 두 장 될 수 있습니다)',
      };
    }
    return { ok: false, region: payload.region, status: 0, message: await diagnoseFetchFailure() };
  }
}
