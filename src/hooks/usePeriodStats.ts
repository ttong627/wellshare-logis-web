import { useState, useCallback } from 'react';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { INITIAL_ZONES, INITIAL_REGIONS_DATA } from '../constants/regions';
import {
  MonthRaw, PeriodStats, computeMonthStats, aggregatePeriod, monthRange,
} from '../lib/stats';

const MAX_MONTHS = 36; // getDoc 비용·Firestore 요금 방지 상한

// billing 회사별 격리(2026-08): partnerInputs 는 서브컬렉션에 산다. 통계도 회원사는 자기 회사만 로드한다.
const stripMeta = (d: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === '_company' || k === '_month' || k === 'updatedAt' || k === 'updatedBy') continue;
    out[k] = v;
  }
  return out;
};

export interface PeriodState {
  loading: boolean;
  error: string | null;
  data: PeriodStats | null;
  loadedMonths: string[];   // 문서가 존재한 월
  emptyMonths: string[];    // 범위에 포함됐으나 데이터 없는 월
  range: { start: string; end: string } | null;
}

const INITIAL_STATE: PeriodState = {
  loading: false, error: null, data: null,
  loadedMonths: [], emptyMonths: [], range: null,
};

const monthDocRef = (month: string) =>
  doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', month);

// Firestore 문서 → MonthRaw (누락 필드는 안전 기본값)
//   ★partnerInputs 는 부모가 아니라 서브컬렉션에서 온 값을 주입받는다(billing 격리).
function toMonthRaw(
  month: string,
  snapData: Record<string, unknown> | null,
  partnerInputs: Record<string, unknown> = {},
): MonthRaw {
  if (!snapData) {
    return {
      month, exists: false, isClosed: false,
      zonePrices: INITIAL_ZONES, regions: INITIAL_REGIONS_DATA,
      orders: {}, partnerInputs: {},
    };
  }
  return {
    month,
    exists: true,
    isClosed: Boolean(snapData.isClosed),
    zonePrices: (snapData.zonePrices as MonthRaw['zonePrices']) || INITIAL_ZONES,
    regions: (snapData.regions as MonthRaw['regions']) || INITIAL_REGIONS_DATA,
    orders: (snapData.orders as MonthRaw['orders']) || {},
    partnerInputs: partnerInputs as MonthRaw['partnerInputs'],
  };
}

// 한 월의 partnerInputs 를 서브컬렉션에서 로드(관리자 전체·회원사 자기만, 폴백 부모).
async function loadPartnerInputs(
  month: string,
  parentPI: Record<string, unknown>,
  isAdmin: boolean,
  partnerCompany: string | null,
): Promise<Record<string, unknown>> {
  if (isAdmin) {
    const sub = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', month, 'partnerInputs'));
    if (!sub.empty) {
      const out: Record<string, unknown> = {};
      sub.docs.forEach(d => { out[d.id] = stripMeta(d.data()); });
      return out;
    }
    return parentPI || {};
  }
  if (partnerCompany) {
    const s = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', month, 'partnerInputs', partnerCompany));
    if (s.exists()) return { [partnerCompany]: stripMeta(s.data()) };
    const pv = (parentPI || {})[partnerCompany];
    if (pv) return { [partnerCompany]: pv };
  }
  return {};
}

export function usePeriodStats(isAdmin: boolean, partnerCompany: string | null) {
  const [state, setState] = useState<PeriodState>(INITIAL_STATE);

  const run = useCallback(async (start: string, end: string) => {
    const months = monthRange(start, end);
    if (months.length === 0) {
      setState({ ...INITIAL_STATE, error: '기간을 올바르게 선택해주세요.' });
      return;
    }
    if (months.length > MAX_MONTHS) {
      setState({ ...INITIAL_STATE, error: `조회 기간이 너무 깁니다. 최대 ${MAX_MONTHS}개월까지 조회할 수 있습니다.` });
      return;
    }

    setState({ ...INITIAL_STATE, loading: true, range: { start: months[0], end: months[months.length - 1] } });

    try {
      // 각 월: 부모 문서 + partnerInputs 서브컬렉션(회원사는 자기 회사만)을 함께 로드.
      const results = await Promise.allSettled(months.map(async (m): Promise<MonthRaw> => {
        const snap = await getDoc(monthDocRef(m));
        if (!snap.exists()) return toMonthRaw(m, null);
        const p = snap.data() as Record<string, unknown>;
        const pi = await loadPartnerInputs(m, (p.partnerInputs as Record<string, unknown>) || {}, isAdmin, partnerCompany);
        return toMonthRaw(m, p, pi);
      }));

      const raws: MonthRaw[] = [];
      const loadedMonths: string[] = [];
      const emptyMonths: string[] = [];
      let failedCount = 0;

      results.forEach((res, i) => {
        const month = months[i];
        if (res.status === 'fulfilled') {
          raws.push(res.value);
          if (res.value.exists) loadedMonths.push(month);
          else emptyMonths.push(month);
        } else {
          // 개별 월 실패는 격리: 빈 월로 처리하고 카운트만 남김
          raws.push(toMonthRaw(month, null));
          emptyMonths.push(month);
          failedCount += 1;
          console.error(`통계 월 로드 실패: ${month}`, res.reason);
        }
      });

      // 전체가 실패한 경우만 에러 화면
      if (failedCount === months.length) {
        setState({ ...INITIAL_STATE, error: '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
        return;
      }

      const monthStatsList = raws.map(computeMonthStats);
      const data = aggregatePeriod(monthStatsList);

      setState({
        loading: false,
        error: failedCount > 0 ? `${failedCount}개월 데이터를 불러오지 못해 제외했습니다.` : null,
        data,
        loadedMonths,
        emptyMonths,
        range: { start: months[0], end: months[months.length - 1] },
      });
    } catch (e) {
      console.error('기간 통계 로드 오류:', e);
      setState({ ...INITIAL_STATE, error: '통계를 불러오는 중 오류가 발생했습니다.' });
    }
  }, [isAdmin, partnerCompany]);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { state, run, reset };
}
