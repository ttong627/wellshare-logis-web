import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import {
  ZonePrices, RegionsData, Orders, PartnerInputs,
  DeliveryDates, PublishDates, PublishRequests,
} from '../types';
import { INITIAL_ZONES, INITIAL_REGIONS_DATA } from '../constants/regions';
import { PARTNER_REGIONS_INVERSE } from '../constants/members';

export function useMonthData(user: User | null) {
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [zonePrices, setZonePrices] = useState<ZonePrices>(INITIAL_ZONES);
  const [regions, setRegions] = useState<RegionsData>(INITIAL_REGIONS_DATA);
  const [orders, setOrders] = useState<Orders>({});
  const [partnerInputs, setPartnerInputs] = useState<PartnerInputs>({});
  const [publishDates, setPublishDates] = useState<PublishDates>({});
  const [publishRequests, setPublishRequests] = useState<PublishRequests>({});
  const [deliveryDates, setDeliveryDates] = useState<DeliveryDates>({});
  const [isClosed, setIsClosed] = useState(false);
  const [savedMonths, setSavedMonths] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Listen to saved months list
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records'));
    const unsub = onSnapshot(q, (snap) => {
      setSavedMonths(snap.docs.map(d => d.id).sort().reverse());
    });
    return () => unsub();
  }, [user]);

  const loadMonth = useCallback(async (month: string) => {
    if (!user || !month) return;
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', month);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        let loadedOrders: Orders = data.orders || {};
        let loadedPartnerInputs: PartnerInputs = data.partnerInputs || {};

        // Auto-fill single-partner regions
        Object.keys(loadedOrders).forEach(r => {
          const o = loadedOrders[r];
          const partners = PARTNER_REGIONS_INVERSE[r] || [];
          if (partners.length === 1 && ((o.basicQty && +o.basicQty > 0) || (o.povertyQty && +o.povertyQty > 0))) {
            const comp = partners[0];
            if (!loadedPartnerInputs[comp]) loadedPartnerInputs[comp] = {};
            if (!loadedPartnerInputs[comp][r]) {
              loadedPartnerInputs[comp][r] = { basicQty: o.basicQty, povertyQty: o.povertyQty };
            }
          }
        });

        setZonePrices(data.zonePrices || INITIAL_ZONES);
        setRegions(data.regions || INITIAL_REGIONS_DATA);
        setOrders(loadedOrders);
        setPartnerInputs(loadedPartnerInputs);
        setPublishDates(data.publishDates || {});
        setPublishRequests(data.publishRequests || {});
        setDeliveryDates(data.deliveryDates || {});
        setIsClosed(data.isClosed || false);
      } else {
        setZonePrices(INITIAL_ZONES);
        setRegions(INITIAL_REGIONS_DATA);
        setOrders({});
        setPartnerInputs({});
        setPublishDates({});
        setPublishRequests({});
        setDeliveryDates({});
        setIsClosed(false);
      }
    } catch (e) {
      console.error('월 데이터 로드 오류:', e);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadMonth(currentMonth);
  }, [currentMonth, user, loadMonth]);

  const saveAll = useCallback(async (email: string) => {
    setIsSaving(true);
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, {
        zonePrices, regions, orders, partnerInputs,
        publishDates, publishRequests, deliveryDates, isClosed,
        updatedAt: new Date().toISOString(), updatedBy: email,
      }, { merge: true });
    } finally {
      setIsSaving(false);
    }
  }, [currentMonth, zonePrices, regions, orders, partnerInputs, publishDates, publishRequests, deliveryDates, isClosed]);

  const saveField = useCallback(async (field: string, value: unknown, email: string) => {
    setIsSaving(true);
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, { [field]: value, updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });
    } finally {
      setIsSaving(false);
    }
  }, [currentMonth]);

  return {
    currentMonth, setCurrentMonth,
    zonePrices, setZonePrices,
    regions, setRegions,
    orders, setOrders,
    partnerInputs, setPartnerInputs,
    publishDates, setPublishDates,
    publishRequests, setPublishRequests,
    deliveryDates, setDeliveryDates,
    isClosed, setIsClosed,
    savedMonths,
    isSaving, setIsSaving,
    loadMonth,
    saveAll,
    saveField,
  };
}
