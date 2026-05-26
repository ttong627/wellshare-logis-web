import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc, collection, query, onSnapshot } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { useAuth } from './AuthContext';

export interface RegionData { basicQty: number | ''; povertyQty: number | '' }
export interface DeliveryData { date?: string; delayDays?: number | '' }

interface DataContextType {
  currentMonth: string;
  setCurrentMonth: (m: string) => void;
  partnerInputs: Record<string, Record<string, RegionData>>;
  deliveryDates: Record<string, Record<string, DeliveryData>>;
  publishRequests: Record<string, Record<string, string>>;
  publishDates: Record<string, Record<string, string>>;
  orders: Record<string, { basicQty?: number | ''; povertyQty?: number | '' }>;
  isClosed: boolean;
  isLoading: boolean;
  savedMonths: string[];
  savePerformance: (company: string, region: string, data: RegionData) => Promise<void>;
  saveDelivery: (company: string, region: string, date: string, delayDays?: number | '') => Promise<void>;
  clearDelivery: (company: string, region: string) => Promise<void>;
  loadMonth: (month: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [currentMonth, setCurrentMonthState] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [partnerInputs, setPartnerInputs] = useState<Record<string, Record<string, RegionData>>>({});
  const [deliveryDates, setDeliveryDates] = useState<Record<string, Record<string, DeliveryData>>>({});
  const [publishRequests, setPublishRequests] = useState<Record<string, Record<string, string>>>({});
  const [publishDates, setPublishDates] = useState<Record<string, Record<string, string>>>({});
  const [orders, setOrders] = useState<Record<string, any>>({});
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

  const loadMonth = useCallback(async (month: string) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', month));
      if (snap.exists()) {
        const data = snap.data();
        setPartnerInputs(data.partnerInputs || {});
        setDeliveryDates(data.deliveryDates || {});
        setPublishRequests(data.publishRequests || {});
        setPublishDates(data.publishDates || {});
        setOrders(data.orders || {});
        setIsClosed(data.isClosed || false);
      } else {
        setPartnerInputs({});
        setDeliveryDates({});
        setPublishRequests({});
        setPublishDates({});
        setOrders({});
        setIsClosed(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const setCurrentMonth = useCallback((m: string) => {
    setCurrentMonthState(m);
  }, []);

  useEffect(() => {
    if (user) loadMonth(currentMonth);
  }, [user, currentMonth, loadMonth]);

  const savePerformance = useCallback(async (company: string, region: string, data: RegionData) => {
    setPartnerInputs(prev => ({
      ...prev,
      [company]: { ...(prev[company] || {}), [region]: data },
    }));
    const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
    await updateDoc(ref, {
      [`partnerInputs.${company}.${region}`]: data,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || '',
    });
  }, [currentMonth, user]);

  const saveDelivery = useCallback(async (company: string, region: string, date: string, delayDays?: number | '') => {
    const deliveryData: DeliveryData = { date, delayDays };
    const newDates = {
      ...deliveryDates,
      [company]: { ...(deliveryDates[company] || {}), [region]: deliveryData },
    };
    setDeliveryDates(newDates);
    const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
    await setDoc(ref, { deliveryDates: newDates, updatedAt: new Date().toISOString(), updatedBy: user?.email }, { merge: true });
  }, [currentMonth, deliveryDates, user]);

  const clearDelivery = useCallback(async (company: string, region: string) => {
    const newDates = { ...deliveryDates };
    if (newDates[company]) {
      newDates[company] = { ...newDates[company] };
      delete newDates[company][region];
    }
    setDeliveryDates(newDates);
    const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
    await setDoc(ref, { deliveryDates: newDates, updatedAt: new Date().toISOString(), updatedBy: user?.email }, { merge: true });
  }, [currentMonth, deliveryDates, user]);

  return (
    <DataContext.Provider value={{
      currentMonth, setCurrentMonth,
      partnerInputs, deliveryDates, publishRequests, publishDates, orders,
      isClosed, isLoading, savedMonths,
      savePerformance, saveDelivery, clearDelivery, loadMonth,
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
