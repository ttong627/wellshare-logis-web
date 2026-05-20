import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { useAuth, AuthState } from '../hooks/useAuth';
import { useMonthData } from '../hooks/useMonthData';
import {
  Orders, PartnerInputs, DeliveryDates, PublishDates, PublishRequests,
  Notification, ZonePrices, RegionsData,
  BillingReport, BillingSummary, OrderSummaries,
} from '../types';
import {
  REGION_ORDER, SEOUL_REGIONS, INITIAL_ZONES, INITIAL_REGIONS_DATA,
} from '../constants/regions';
import { PARTNER_REGIONS, PARTNER_REGIONS_INVERSE } from '../constants/members';
import { parseNumber, CLOSED_MSG } from '../lib/utils';
import { initKakao, sendKakaoNotification } from '../lib/kakao';

// ─── Computed Helpers ─────────────────────────────────────────────────

export interface EffectiveOrder { basicQty: number; povertyQty: number }
export interface PartnerAggregated { basicQty: number; povertyQty: number }

interface AppContextType extends AuthState {
  // Month data
  currentMonth: string;
  setCurrentMonth: (m: string) => void;
  zonePrices: ZonePrices;
  setZonePrices: React.Dispatch<React.SetStateAction<ZonePrices>>;
  regions: RegionsData;
  setRegions: React.Dispatch<React.SetStateAction<RegionsData>>;
  orders: Orders;
  setOrders: React.Dispatch<React.SetStateAction<Orders>>;
  partnerInputs: PartnerInputs;
  setPartnerInputs: React.Dispatch<React.SetStateAction<PartnerInputs>>;
  deliveryDates: DeliveryDates;
  setDeliveryDates: React.Dispatch<React.SetStateAction<DeliveryDates>>;
  localDeliveryInputs: DeliveryDates;
  setLocalDeliveryInputs: React.Dispatch<React.SetStateAction<DeliveryDates>>;
  publishDates: PublishDates;
  setPublishDates: React.Dispatch<React.SetStateAction<PublishDates>>;
  publishRequests: PublishRequests;
  setPublishRequests: React.Dispatch<React.SetStateAction<PublishRequests>>;
  isClosed: boolean;
  setIsClosed: React.Dispatch<React.SetStateAction<boolean>>;
  savedMonths: string[];
  isSaving: boolean;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  loadMonth: (month: string) => Promise<void>;
  saveField: (field: string, value: unknown, email: string) => Promise<void>;

  // Computed
  partnerAggregatedOrders: Record<string, PartnerAggregated>;
  getEffectiveOrder: (r: string) => EffectiveOrder;
  computedAllocations: Record<string, Record<string, number>>;
  billingReport: BillingReport;
  billingSummary: BillingSummary;
  orderSummaries: OrderSummaries;
  formattedMonthStr: string;
  unsubmittedPartners: string[];
  undeliveredPartners: string[];

  // Notifications
  myNotifications: Notification[];
  clearMyNotifications: () => Promise<void>;

  // UI
  toastMessage: string | null;
  showToast: (msg: string) => void;
  selectedAdminViewCompany: string;
  setSelectedAdminViewCompany: React.Dispatch<React.SetStateAction<string>>;

  // Handlers
  handleToggleClose: () => Promise<void>;
  handleSaveField: (field: string, value: unknown) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const monthData = useMonthData(auth.user);

  const [localDeliveryInputs, setLocalDeliveryInputs] = useState<DeliveryDates>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedAdminViewCompany, setSelectedAdminViewCompany] = useState('전체');

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const seenNotiIds = useRef(new Set<string>());
  const isFirstNotiSnap = useRef(true);

  // Load notifications + Kakao forward for admin
  useEffect(() => {
    if (!auth.user) {
      seenNotiIds.current.clear();
      isFirstNotiSnap.current = true;
      return;
    }
    initKakao();
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'));
    const unsub = onSnapshot(q, (snap) => {
      const notis = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Notification))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 50);

      if (isFirstNotiSnap.current) {
        notis.forEach(n => seenNotiIds.current.add(n.id));
        isFirstNotiSnap.current = false;
      } else if (auth.isAdmin) {
        notis
          .filter(n => n.target === 'ADMIN' && !seenNotiIds.current.has(n.id))
          .forEach(n => {
            seenNotiIds.current.add(n.id);
            sendKakaoNotification(n.message).catch(() => {});
          });
      }

      setNotifications(notis);
    });
    return () => unsub();
  }, [auth.user, auth.isAdmin]);

  const myNotifications = useMemo(() => {
    if (!auth.user) return [];
    return notifications.filter(n => n.target === (auth.isAdmin ? 'ADMIN' : auth.partnerCompany));
  }, [notifications, auth.isAdmin, auth.partnerCompany, auth.user]);

  const clearMyNotifications = useCallback(async () => {
    for (const n of myNotifications) {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'notifications', n.id));
    }
  }, [myNotifications]);

  // Computed: partner aggregated orders
  const partnerAggregatedOrders = useMemo(() => {
    const agg: Record<string, PartnerAggregated> = {};
    REGION_ORDER.forEach(r => { agg[r] = { basicQty: 0, povertyQty: 0 }; });
    Object.values(monthData.partnerInputs).forEach(regionsData => {
      Object.entries(regionsData).forEach(([region, data]) => {
        if (agg[region]) {
          agg[region].basicQty += (Number(data.basicQty) || 0);
          agg[region].povertyQty += (Number(data.povertyQty) || 0);
        }
      });
    });
    return agg;
  }, [monthData.partnerInputs]);

  const getEffectiveOrder = useCallback((r: string): EffectiveOrder => {
    const o = monthData.orders[r] || {};
    const pSum = partnerAggregatedOrders[r] || { basicQty: 0, povertyQty: 0 };
    const isPovEmpty = o.povertyQty === undefined || o.povertyQty === '';
    const isBasEmpty = o.basicQty === undefined || o.basicQty === '';
    return {
      povertyQty: isPovEmpty ? pSum.povertyQty : (Number(o.povertyQty) || 0),
      basicQty: isBasEmpty ? pSum.basicQty : (Number(o.basicQty) || 0),
    };
  }, [monthData.orders, partnerAggregatedOrders]);

  const computedAllocations = useMemo(() => {
    const computed: Record<string, Record<string, number>> = {};
    REGION_ORDER.forEach(r => {
      computed[r] = {};
      const partners = PARTNER_REGIONS_INVERSE[r] || [];
      partners.forEach(m => {
        const pData = monthData.partnerInputs[m]?.[r] || {};
        const pQty = (Number(pData.basicQty) || 0) + (Number(pData.povertyQty) || 0);
        if (pQty > 0) computed[r][m] = pQty;
      });
      if (Object.keys(computed[r]).length === 0 && partners.length === 1) {
        const o = monthData.orders[r] || {};
        const oQty = (Number(o.basicQty) || 0) + (Number(o.povertyQty) || 0);
        if (oQty > 0) computed[r][partners[0]] = oQty;
      }
    });
    return computed;
  }, [monthData.partnerInputs, monthData.orders]);

  const billingReport = useMemo((): BillingReport => {
    const report: BillingReport['report'] = [];
    const gTotal = { qty: 0, supply: 0, vat: 0, amount: 0 };
    const sTotal = { qty: 0, supply: 0, vat: 0, amount: 0 };
    const grandTotal = { qty: 0, supply: 0, vat: 0, amount: 0 };
    REGION_ORDER.forEach(r => {
      const z = monthData.regions[r] || '2급지';
      const p = monthData.zonePrices[z]?.billing || 0;
      const order = getEffectiveOrder(r);
      const tr = order.basicQty + order.povertyQty;
      if (tr > 0) {
        const isSeoul = SEOUL_REGIONS.includes(r);
        const city = isSeoul ? '서울시' : '경기도';
        const calc = (q: number) => { const tot = q * p; const sup = Math.round(tot / 1.1); const vat = tot - sup; return { qty: q, tot, sup, vat }; };
        const poverty = calc(order.povertyQty);
        const basic = calc(order.basicQty);
        const sum = { qty: tr, amount: poverty.tot + basic.tot, supply: poverty.sup + basic.sup, vat: poverty.vat + basic.vat };
        report.push({ city, region: r, poverty, basic, sum });
        const t = isSeoul ? sTotal : gTotal;
        t.qty += tr; t.amount += sum.amount; t.supply += sum.supply; t.vat += sum.vat;
        grandTotal.qty += tr; grandTotal.amount += sum.amount; grandTotal.supply += sum.supply; grandTotal.vat += sum.vat;
      }
    });
    return { report, gTotal, sTotal, grandTotal };
  }, [monthData.zonePrices, monthData.regions, monthData.orders, partnerAggregatedOrders, getEffectiveOrder]);

  const billingSummary = useMemo((): BillingSummary => {
    let gtQty = 0, gtSup = 0, gtVat = 0, gtAmt = 0;
    const pDetails: Record<string, Omit<BillingSummary['sorted'][0], 'member'>> = {};
    REGION_ORDER.forEach(r => {
      const z = monthData.regions[r] || '2급지';
      const price = monthData.zonePrices[z]?.billing || 0;
      Object.entries(computedAllocations[r] || {}).forEach(([m, qty]) => {
        if (qty > 0) {
          const total = Math.floor((qty * price * 0.975) / 100) * 100;
          const supply = Math.round(total / 1.1);
          const vat = total - supply;
          if (!pDetails[m]) pDetails[m] = { totalQty: 0, totalSupply: 0, totalVat: 0, totalAmount: 0, regions: [] };
          pDetails[m].totalQty += qty;
          pDetails[m].totalSupply += supply;
          pDetails[m].totalVat += vat;
          pDetails[m].totalAmount += total;
          pDetails[m].regions.push({ region: r, qty, supplyValue: supply, vatValue: vat, finalRowTotal: total });
          gtQty += qty; gtSup += supply; gtVat += vat; gtAmt += total;
        }
      });
    });
    const sorted = Object.entries(pDetails)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([member, d]) => ({ member, ...d }));
    return { sorted, grandTotalQty: gtQty, grandTotalSupply: gtSup, grandTotalVat: gtVat, grandTotalAmount: gtAmt };
  }, [monthData.zonePrices, monthData.regions, computedAllocations]);

  const orderSummaries = useMemo((): OrderSummaries => {
    let s = 0, g = 0, o = 0, b = 0, p = 0;
    REGION_ORDER.forEach(r => {
      const order = getEffectiveOrder(r);
      o += (order.basicQty + order.povertyQty);
      b += order.basicQty;
      p += order.povertyQty;
      if (SEOUL_REGIONS.includes(r)) s += (order.basicQty + order.povertyQty);
      else g += (order.basicQty + order.povertyQty);
    });
    return { seoulTotal: s, gyeonggiTotal: g, overallTotal: o, basicTotal: b, povertyTotal: p };
  }, [monthData.orders, partnerAggregatedOrders, getEffectiveOrder]);

  const formattedMonthStr = useMemo(() => {
    if (!monthData.currentMonth) return '';
    const [year, month] = monthData.currentMonth.split('-');
    return `${year}년 ${parseInt(month, 10)}월`;
  }, [monthData.currentMonth]);

  const unsubmittedPartners = useMemo(() => {
    return Object.keys(PARTNER_REGIONS).filter(m => {
      const regions = PARTNER_REGIONS[m] || [];
      if (regions.length === 0) return false;
      // Partner is "unsubmitted" if ANY region still has no data entered
      return regions.some(r => {
        const pData = monthData.partnerInputs[m]?.[r] || {};
        return (pData.povertyQty === undefined || pData.povertyQty === '') &&
               (pData.basicQty === undefined || pData.basicQty === '');
      });
    });
  }, [monthData.partnerInputs]);

  const undeliveredPartners = useMemo(() => {
    return Object.keys(PARTNER_REGIONS).filter(m => {
      const regions = PARTNER_REGIONS[m] || [];
      if (regions.length === 0) return false;
      return regions.some(r => !monthData.deliveryDates[m]?.[r]?.date);
    });
  }, [monthData.deliveryDates]);

  const handleToggleClose = useCallback(async () => {
    if (!auth.isAdmin) return showToast('마감 권한이 없습니다.');
    const newStatus = !monthData.isClosed;

    if (newStatus) {
      const issues: string[] = [];
      if (unsubmittedPartners.length > 0) {
        issues.push(`미입력 회원사 ${unsubmittedPartners.length}곳 (${unsubmittedPartners.join(', ')})`);
      }
      if (undeliveredPartners.length > 0) {
        issues.push(`배송 미완료 ${undeliveredPartners.length}곳 (${undeliveredPartners.join(', ')})`);
      }
      let unissuedCount = 0;
      Object.entries(monthData.publishRequests).forEach(([company, regions]) => {
        Object.keys(regions).forEach(region => {
          if (!monthData.publishDates[company]?.[region]) unissuedCount++;
        });
      });
      if (unissuedCount > 0) issues.push(`미발급 세금계산서 ${unissuedCount}건`);

      if (issues.length > 0) {
        const msg = `다음 항목이 완료되지 않았습니다:\n${issues.map(i => `• ${i}`).join('\n')}\n\n그래도 마감하시겠습니까?`;
        if (!window.confirm(msg)) return;
      }
    }

    monthData.setIsClosed(newStatus);
    try {
      await monthData.saveField('isClosed', newStatus, auth.user?.email || '');
      const [yr, mo] = monthData.currentMonth.split('-');
      const label = `${yr}년 ${parseInt(mo, 10)}월`;
      showToast(newStatus ? `${label} 정산이 마감되었습니다.` : `${label} 마감이 해제되었습니다.`);
    } catch (e) { showToast('마감 처리 오류: ' + (e as Error).message); }
  }, [auth.isAdmin, auth.user, monthData, unsubmittedPartners, undeliveredPartners]);

  const handleSaveField = useCallback(async (field: string, value: unknown) => {
    if (!auth.user?.email) return;
    try {
      await monthData.saveField(field, value, auth.user.email);
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
  }, [auth.user, monthData]);

  // Auto-publish: when a publishRequest date arrives (≤ today) and the invoice
  // hasn't been marked issued yet, automatically set publishDates to the request date.
  useEffect(() => {
    if (!auth.user?.email) return;
    const today = new Date().toISOString().slice(0, 10);
    const pubReqs = monthData.publishRequests;
    const pubDates = monthData.publishDates;

    const pending: { company: string; region: string; date: string }[] = [];
    Object.entries(pubReqs).forEach(([company, regions]) => {
      Object.entries(regions).forEach(([region, reqDate]) => {
        if (reqDate <= today && !pubDates[company]?.[region]) {
          pending.push({ company, region, date: reqDate });
        }
      });
    });

    if (pending.length === 0) return;

    const newPublishDates = { ...pubDates };
    pending.forEach(({ company, region, date }) => {
      newPublishDates[company] = { ...(newPublishDates[company] || {}), [region]: date };
    });

    monthData.setPublishDates(newPublishDates);
    monthData.saveField('publishDates', newPublishDates, auth.user!.email!)
      .catch(e => console.error('자동 발행 저장 오류:', e));

    showToast(`${pending.length}건의 세금계산서가 요청일 기준으로 자동 발행 처리되었습니다.`);
  // publishDates is intentionally excluded — the guard (!pubDates[company]?.[region])
  // prevents re-running after the effect itself sets publishDates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthData.publishRequests, auth.user?.email]);

  const value: AppContextType = {
    ...auth,
    ...monthData,
    localDeliveryInputs,
    setLocalDeliveryInputs,
    partnerAggregatedOrders,
    getEffectiveOrder,
    computedAllocations,
    billingReport,
    billingSummary,
    orderSummaries,
    formattedMonthStr,
    unsubmittedPartners,
    undeliveredPartners,
    myNotifications,
    clearMyNotifications,
    toastMessage,
    showToast,
    selectedAdminViewCompany,
    setSelectedAdminViewCompany,
    handleToggleClose,
    handleSaveField,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
