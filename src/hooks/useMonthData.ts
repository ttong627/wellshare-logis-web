import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, runTransaction } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import {
  ZonePrices, RegionsData, Orders, PartnerInputs,
  DeliveryDates, PublishDates, PublishRequests, EcountSales,
} from '../types';
import { INITIAL_ZONES, INITIAL_REGIONS_DATA } from '../constants/regions';

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getPreviousMonth = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export function useMonthData(user: User | null) {
  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth);

  const [zonePrices, setZonePrices] = useState<ZonePrices>(INITIAL_ZONES);
  const [regions, setRegions] = useState<RegionsData>(INITIAL_REGIONS_DATA);
  const [orders, setOrders] = useState<Orders>({});
  const [partnerInputs, setPartnerInputs] = useState<PartnerInputs>({});
  const [publishDates, setPublishDates] = useState<PublishDates>({});
  const [publishRequests, setPublishRequests] = useState<PublishRequests>({});
  const [deliveryDates, setDeliveryDates] = useState<DeliveryDates>({});
  const [ecountSales, setEcountSales] = useState<EcountSales>({});
  const [isClosed, setIsClosed] = useState(false);
  const [savedMonths, setSavedMonths] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const hasResolvedDefaultMonth = useRef(false);
  const loadedVersionRef = useRef(0);   // 낙관적 잠금: 로드 시점 문서 버전(동시저장 충돌 감지 기준)

  // 저장된 월 목록 — 문서 ID(월)만 필요한데 onSnapshot으로 전체 컬렉션을 구독하면 어느 월이든
  // 저장할 때마다(orders/partnerInputs 등 큰 필드 포함) 모든 월 문서를 통째로 다시 내려받는
  // 낭비가 있었다(2026-07-11 점검 발견). 마운트 시 1회 조회로 바꾸고, 저장 직후(refreshSavedMonths)
  // 갱신해 새 월이 생겨도 목록이 갱신되도록 한다.
  const refreshSavedMonths = useCallback(async () => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records'));
    const snap = await getDocs(q);
    setSavedMonths(snap.docs.map(d => d.id).sort().reverse());
  }, [user]);

  useEffect(() => { refreshSavedMonths(); }, [refreshSavedMonths]);

  const loadMonth = useCallback(async (month: string) => {
    if (!user || !month) return;
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', month);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();

        setZonePrices(data.zonePrices || INITIAL_ZONES);
        setRegions(data.regions || INITIAL_REGIONS_DATA);
        // 단일 회원사 지역의 포수입력(orders)은 비워두면 지역포수(partnerInputs) 합으로 자동 대체된다(getEffectiveOrder).
        // 과거의 역방향 자동채움(orders→partnerInputs)은 회원사가 입력한 지역포수를 본사값으로 덮어써 제거함.
        setOrders(data.orders || {});
        setPartnerInputs(data.partnerInputs || {});
        setPublishDates(data.publishDates || {});
        setPublishRequests(data.publishRequests || {});
        setDeliveryDates(data.deliveryDates || {});
        setEcountSales(data.ecountSales || {});
        setIsClosed(data.isClosed || false);
        loadedVersionRef.current = (data.version as number) ?? 0;
      } else {
        setZonePrices(INITIAL_ZONES);
        setRegions(INITIAL_REGIONS_DATA);
        setOrders({});
        setPartnerInputs({});
        setPublishDates({});
        setPublishRequests({});
        setDeliveryDates({});
        setEcountSales({});
        setIsClosed(false);
        loadedVersionRef.current = 0;
      }
    } catch (e) {
      console.error('월 데이터 로드 오류:', e);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadMonth(currentMonth);
  }, [currentMonth, user, loadMonth]);

  useEffect(() => {
    if (!user || hasResolvedDefaultMonth.current) return;
    hasResolvedDefaultMonth.current = true;

    const resolveDefaultMonth = async () => {
      const thisMonth = getCurrentMonth();
      const previousMonth = getPreviousMonth(thisMonth);

      if (currentMonth !== thisMonth) return;

      try {
        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', previousMonth);
        const snap = await getDoc(ref);
        const previousMonthClosed = snap.exists() ? snap.data().isClosed === true : false;

        if (!previousMonthClosed) {
          setCurrentMonth(previousMonth);
        }
      } catch (e) {
        console.error('기본 월 확인 오류:', e);
      }
    };

    resolveDefaultMonth();
  }, [currentMonth, user]);

  // 낙관적 잠금 병합 저장 — runTransaction 안에서 로드시점 버전과 DB 버전을 비교해
  // 다른 탭·기기가 먼저 저장했으면(버전 불일치) 저장을 취소하고 최신 데이터를 재로드한다.
  // ⚠️ 월 문서는 updateDoc 금지(CLAUDE.md) → 트랜잭션 안에서도 tx.set(..., {merge:true})로 병합.
  const commitMerge = useCallback(async (data: Record<string, unknown>, email: string) => {
    const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
    let newVersion = loadedVersionRef.current;
    try {
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        const dbVersion = cur.exists() ? ((cur.data().version as number) ?? 0) : 0;
        if (cur.exists() && dbVersion !== loadedVersionRef.current) {
          const err = new Error('CONFLICT') as Error & { code?: string };
          err.code = 'CONFLICT';
          throw err;   // 동시저장 충돌 — 이전 저장 덮어쓰기 방지
        }
        newVersion = dbVersion + 1;
        tx.set(ref, { ...data, version: newVersion, updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });
      });
      loadedVersionRef.current = newVersion;
      if (!savedMonths.includes(currentMonth)) refreshSavedMonths();
    } catch (e) {
      if ((e as { code?: string })?.code === 'CONFLICT') {
        if (typeof window !== 'undefined' && window.confirm(
          '다른 기기·탭에서 이 달 정산 데이터를 먼저 저장했습니다.\n' +
          '내 화면이 오래된 상태라 이번 저장을 취소했습니다.\n\n' +
          '[확인]을 누르면 최신 데이터를 불러옵니다. (방금 입력한 값은 반영되지 않습니다)'
        )) {
          await loadMonth(currentMonth);
        }
        return;
      }
      throw e;
    }
  }, [currentMonth, savedMonths, refreshSavedMonths, loadMonth]);

  const saveAll = useCallback(async (email: string) => {
    setIsSaving(true);
    try {
      await commitMerge({
        zonePrices, regions, orders, partnerInputs,
        publishDates, publishRequests, deliveryDates, isClosed,
      }, email);
    } finally {
      setIsSaving(false);
    }
  }, [commitMerge, zonePrices, regions, orders, partnerInputs, publishDates, publishRequests, deliveryDates, isClosed]);

  const saveField = useCallback(async (field: string, value: unknown, email: string) => {
    setIsSaving(true);
    try {
      await commitMerge({ [field]: value }, email);
    } finally {
      setIsSaving(false);
    }
  }, [commitMerge]);

  return {
    currentMonth, setCurrentMonth,
    zonePrices, setZonePrices,
    regions, setRegions,
    orders, setOrders,
    partnerInputs, setPartnerInputs,
    publishDates, setPublishDates,
    publishRequests, setPublishRequests,
    deliveryDates, setDeliveryDates,
    ecountSales, setEcountSales,
    isClosed, setIsClosed,
    savedMonths,
    isSaving, setIsSaving,
    loadMonth,
    saveAll,
    saveField,
  };
}
