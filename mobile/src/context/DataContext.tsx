import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteField, collection, query, onSnapshot, addDoc } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { useAuth } from './AuthContext';
import { INITIAL_ZONES, INITIAL_REGIONS_DATA } from '../constants';

export interface RegionData { basicQty: number | ''; povertyQty: number | '' }
export interface DeliveryData { date?: string; delayDays?: number | '' }

// ── billing 회사별 격리(2026-08 · 웹 useMonthData와 동일 구조) ──
//   회사별 4필드는 `billing_records/{월}/{필드}/{회사}` 서브독에 산다. **write 는 서브독에만** —
//   부모에 쓰면 회원사는 규칙에 거부되고(저장 실패), 관리자는 아무도 안 읽는 곳에 저장된다.
//   공통 필드(zonePrices·regions·orders·isClosed)는 부모 문서(비민감·인증자 read 허용).
//   서브독이 없으면(미마이그레이션 월) 부모 필드로 폴백해 읽는다.
const BILLING = ['artifacts', APP_ID, 'public', 'data', 'billing_records'] as const;
const COMPANY_FIELDS = ['partnerInputs', 'deliveryDates', 'publishDates', 'publishRequests'] as const;
type CompanyField = typeof COMPANY_FIELDS[number];

// 서브독의 메타 필드(_company·_month·updatedAt·updatedBy)를 벗겨 지역맵만 남긴다(웹 stripMeta와 동일).
const stripMeta = (d: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === '_company' || k === '_month' || k === 'updatedAt' || k === 'updatedBy') continue;
    out[k] = v;
  }
  return out;
};

interface DataContextType {
  currentMonth: string;
  setCurrentMonth: (m: string) => void;
  partnerInputs: Record<string, Record<string, RegionData>>;
  deliveryDates: Record<string, Record<string, DeliveryData>>;
  publishRequests: Record<string, Record<string, string>>;
  publishDates: Record<string, Record<string, string>>;
  orders: Record<string, { basicQty?: number | ''; povertyQty?: number | '' }>;
  zonePrices: Record<string, { billing: number }>;
  regions: Record<string, string>;
  isClosed: boolean;
  isLoading: boolean;
  savedMonths: string[];
  savePerformance: (company: string, region: string, data: RegionData) => Promise<void>;
  saveDelivery: (company: string, region: string, date: string, delayDays?: number | '') => Promise<void>;
  clearDelivery: (company: string, region: string) => Promise<void>;
  saveOrder: (region: string, data: { basicQty: number | ''; povertyQty: number | '' }) => Promise<void>;
  setClosed: (closed: boolean) => Promise<void>;
  sendPublishRequest: (company: string, region: string, date: string) => Promise<void>;
  clearPublishRequest: (company: string, region: string) => Promise<void>;
  loadMonth: (month: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, partnerCompany } = useAuth();

  const [currentMonth, setCurrentMonthState] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [partnerInputs, setPartnerInputs] = useState<Record<string, Record<string, RegionData>>>({});
  const [deliveryDates, setDeliveryDates] = useState<Record<string, Record<string, DeliveryData>>>({});
  const [publishRequests, setPublishRequests] = useState<Record<string, Record<string, string>>>({});
  const [publishDates, setPublishDates] = useState<Record<string, Record<string, string>>>({});
  const [orders, setOrders] = useState<Record<string, any>>({});
  const [zonePrices, setZonePrices] = useState<Record<string, { billing: number }>>(INITIAL_ZONES);
  const [regions, setRegions] = useState<Record<string, string>>(INITIAL_REGIONS_DATA);
  const [isClosed, setIsClosed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [savedMonths, setSavedMonths] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records'));
    return onSnapshot(q, snap => {
      setSavedMonths(snap.docs.map(d => d.id).sort().reverse());
    });
  }, [user]);

  // 이전 달이 마감되지 않았으면 기본 표시 월을 이전 달로 전환(웹과 동일 — 마감 전엔 직전 달이 작업 월).
  const hasResolvedDefaultMonth = useRef(false);
  useEffect(() => {
    if (!user || hasResolvedDefaultMonth.current) return;
    hasResolvedDefaultMonth.current = true;
    (async () => {
      const now = new Date();
      const tm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (currentMonth !== tm) return;
      const pd = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prev = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
      try {
        const snap = await getDoc(doc(db, ...BILLING, prev));
        const prevClosed = snap.exists() ? snap.data().isClosed === true : false;
        if (!prevClosed) setCurrentMonthState(prev);
      } catch (e) {
        console.warn('기본 월 확인 실패:', e);
      }
    })();
  }, [user, currentMonth]);

  const setCurrentMonth = useCallback((m: string) => {
    setCurrentMonthState(m);
  }, []);

  // 월 전환 — 아래 실시간 구독 effect가 자동으로 재구독하여 최신 데이터를 로드한다.
  const loadMonth = useCallback(async (month: string) => {
    setCurrentMonthState(month);
  }, []);

  // 현재 월 실시간 구독 — 부모(공통) 1개 + 회사별 4필드.
  //   관리자: 각 필드의 서브컬렉션 전체 구독. 회원사: 자기 서브독만 구독(남의 것은 규칙이 거부).
  //   서브 스냅샷이 비어 있으면 미마이그레이션 월 → 부모 필드로 폴백(웹 loadCompanyField와 동일 판정).
  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    // 최근 스냅샷 원본 보관 — 폴백 판정은 항상 최신 부모/서브 값으로 다시 계산한다.
    const parentData: { current: Record<string, any> } = { current: {} };
    const subData: Record<CompanyField, Record<string, any> | null> = {
      partnerInputs: null, deliveryDates: null, publishDates: null, publishRequests: null,
    };
    const setters: Record<CompanyField, (v: any) => void> = {
      partnerInputs: setPartnerInputs, deliveryDates: setDeliveryDates,
      publishDates: setPublishDates, publishRequests: setPublishRequests,
    };

    const applyField = (field: CompanyField) => {
      if (subData[field] !== null) { setters[field](subData[field]); return; }
      // 폴백: 서브독 없음(미마이그레이션 월) → 부모 필드. 회원사는 자기 회사 몫만.
      const pf = parentData.current[field] || {};
      if (isAdmin) { setters[field](pf); return; }
      if (partnerCompany && pf[partnerCompany]) { setters[field]({ [partnerCompany]: pf[partnerCompany] }); return; }
      setters[field]({});
    };

    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      doc(db, ...BILLING, currentMonth),
      (snap) => {
        parentData.current = snap.exists() ? snap.data() : {};
        const d = parentData.current;
        setOrders(d.orders || {});
        setZonePrices(d.zonePrices || INITIAL_ZONES);
        setRegions(d.regions || INITIAL_REGIONS_DATA);
        setIsClosed(d.isClosed === true);
        COMPANY_FIELDS.forEach(applyField);   // 부모가 갱신되면 폴백 값도 다시 계산
        setIsLoading(false);
      },
      (e) => { console.warn('월 데이터 구독 실패:', e); setIsLoading(false); },
    ));

    for (const field of COMPANY_FIELDS) {
      if (isAdmin) {
        unsubs.push(onSnapshot(
          collection(db, ...BILLING, currentMonth, field),
          (snap) => {
            if (snap.empty) { subData[field] = null; }
            else {
              const out: Record<string, any> = {};
              snap.docs.forEach(d => { out[d.id] = stripMeta(d.data()); });
              subData[field] = out;
            }
            applyField(field);
          },
          (e) => console.warn(`${field} 구독 실패:`, e),
        ));
      } else if (partnerCompany) {
        unsubs.push(onSnapshot(
          doc(db, ...BILLING, currentMonth, field, partnerCompany),
          (snap) => {
            subData[field] = snap.exists() ? { [partnerCompany]: stripMeta(snap.data()) } : null;
            applyField(field);
          },
          (e) => console.warn(`${field} 구독 실패:`, e),
        ));
      }
    }

    return () => unsubs.forEach(u => u());
  }, [user, currentMonth, isAdmin, partnerCompany]);

  // 회사별 서브독 참조·메타(웹 saveCompany와 동일한 메타를 남긴다).
  const companyRef = useCallback((field: CompanyField, company: string) =>
    doc(db, ...BILLING, currentMonth, field, company), [currentMonth]);
  const subMeta = useCallback((company: string) => ({
    _company: company, _month: currentMonth,
    updatedAt: new Date().toISOString(), updatedBy: user?.email || '',
  }), [currentMonth, user]);

  // 서브독에서 지역 키 하나 삭제 — merge 는 사라진 키를 못 지우므로 deleteField 로 명시 삭제.
  //   서브독 자체가 아직 없으면(미마이그레이션 월) 지울 것도 없으므로 not-found 는 통과시킨다.
  const deleteRegionKey = useCallback(async (field: CompanyField, company: string, region: string) => {
    try {
      await updateDoc(companyRef(field, company), {
        [region]: deleteField(),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      });
    } catch (e: any) {
      if (e?.code !== 'not-found') throw e;
    }
  }, [companyRef, user]);

  const savePerformance = useCallback(async (company: string, region: string, data: RegionData) => {
    setPartnerInputs(prev => ({
      ...prev,
      [company]: { ...(prev[company] || {}), [region]: data },
    }));
    // ★자기 회사 서브독에만 쓴다(billing 격리) — 부모에 쓰면 회원사는 규칙에 거부된다.
    await setDoc(companyRef('partnerInputs', company), { [region]: data, ...subMeta(company) }, { merge: true });
  }, [companyRef, subMeta]);

  const saveDelivery = useCallback(async (company: string, region: string, date: string, delayDays?: number | '') => {
    const deliveryData: DeliveryData = { date, delayDays };
    setDeliveryDates(prev => ({
      ...prev,
      [company]: { ...(prev[company] || {}), [region]: deliveryData },
    }));
    await setDoc(companyRef('deliveryDates', company), { [region]: deliveryData, ...subMeta(company) }, { merge: true });
  }, [companyRef, subMeta]);

  const clearDelivery = useCallback(async (company: string, region: string) => {
    setDeliveryDates(prev => {
      const next = { ...prev };
      if (next[company]) { next[company] = { ...next[company] }; delete next[company][region]; }
      return next;
    });
    await deleteRegionKey('deliveryDates', company, region);
  }, [deleteRegionKey]);

  // 관리자 월 마감/마감취소 — 공통 필드(부모). 마감되면 파트너 입력 잠김(규칙도 서브독 쓰기를 차단).
  const setClosed = useCallback(async (closed: boolean) => {
    setIsClosed(closed);
    const ref = doc(db, ...BILLING, currentMonth);
    await setDoc(ref, {
      isClosed: closed,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email,
    }, { merge: true });
  }, [currentMonth, user]);

  // 관리자 포수입력(orders) 저장 — 공통 필드(부모). 중첩 객체 merge 로 해당 지역만 병합(CLAUDE.md 규칙).
  const saveOrder = useCallback(async (region: string, data: { basicQty: number | ''; povertyQty: number | '' }) => {
    setOrders(prev => ({ ...prev, [region]: data }));
    const ref = doc(db, ...BILLING, currentMonth);
    await setDoc(ref, {
      orders: { [region]: data },
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email,
    }, { merge: true });
  }, [currentMonth, user]);

  // 회원사 계산서 발급 요청 — publishRequests + publishDates(자동 발급완료 처리)를 함께 기록 + 회원사 알림.
  //   두 필드 모두 회사별 서브독에 쓴다(publishRequests 서브독 write 는 규칙상 관리자 전용).
  const sendPublishRequest = useCallback(async (company: string, region: string, date: string) => {
    setPublishRequests(prev => ({ ...prev, [company]: { ...(prev[company] || {}), [region]: date } }));
    setPublishDates(prev => ({ ...prev, [company]: { ...(prev[company] || {}), [region]: date } }));
    await Promise.all([
      setDoc(companyRef('publishRequests', company), { [region]: date, ...subMeta(company) }, { merge: true }),
      setDoc(companyRef('publishDates', company), { [region]: date, ...subMeta(company) }, { merge: true }),
    ]);
    await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
      message: `[💰정산요청] ${company} ${region} 배송이 확인되었습니다. ${date} 일자로 세금계산서를 발행해 주세요.`,
      target: company,
      timestamp: new Date().toISOString(),
    });
  }, [companyRef, subMeta]);

  // 발급 요청/완료 취소 — 해당 지역의 publishRequests·publishDates를 함께 삭제(배송완료 단계로 복귀).
  const clearPublishRequest = useCallback(async (company: string, region: string) => {
    setPublishRequests(prev => {
      const next = { ...prev };
      if (next[company]) { next[company] = { ...next[company] }; delete next[company][region]; }
      return next;
    });
    setPublishDates(prev => {
      const next = { ...prev };
      if (next[company]) { next[company] = { ...next[company] }; delete next[company][region]; }
      return next;
    });
    await Promise.all([
      deleteRegionKey('publishRequests', company, region),
      deleteRegionKey('publishDates', company, region),
    ]);
  }, [deleteRegionKey]);

  return (
    <DataContext.Provider value={{
      currentMonth, setCurrentMonth,
      partnerInputs, deliveryDates, publishRequests, publishDates, orders,
      zonePrices, regions,
      isClosed, isLoading, savedMonths,
      savePerformance, saveDelivery, clearDelivery, saveOrder, setClosed, sendPublishRequest, clearPublishRequest, loadMonth,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
