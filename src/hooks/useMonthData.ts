import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, collection, query, runTransaction } from 'firebase/firestore';
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

// ── billing 회사별 격리(2026-08) ──
//   회사별 필드(아래 4종)는 `billing_records/{월}/{필드}/{회사}` 서브컬렉션에 산다.
//   회원사는 자기 회사 서브독만 read/write → 규칙으로 실격리(설계 project_wellshare_billing_isolation).
//   공통 필드(zonePrices·regions·orders·isClosed·version)는 부모 문서(회원사 read 무방·비민감).
//   ecountSales(민감·관리자 전용)는 billing_admin/{월}.
//   ⚠️이행기간: 서브독이 없으면(2026-01~03 등 미마이그레이션) 부모 필드로 폴백해 읽는다.
//     write 는 서브독에만 한다 — 부모 원본은 규칙 조인 뒤 별도 단계에서 제거한다.
const BILLING = ['artifacts', APP_ID, 'public', 'data', 'billing_records'] as const;
const BILLING_ADMIN = ['artifacts', APP_ID, 'public', 'data', 'billing_admin'] as const;
const COMPANY_FIELDS = ['partnerInputs', 'deliveryDates', 'publishDates', 'publishRequests'] as const;

// 서브독의 메타 필드(_company·_month·updatedAt·updatedBy)를 벗겨 지역맵만 남긴다.
const stripMeta = (d: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === '_company' || k === '_month' || k === 'updatedAt' || k === 'updatedBy') continue;
    out[k] = v;
  }
  return out;
};

export function useMonthData(user: User | null, isAdmin: boolean, partnerCompany: string | null) {
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
  const loadedVersionRef = useRef(0);   // 낙관적 잠금: 부모 문서 버전(공통 필드 저장 충돌 감지 기준)

  const refreshSavedMonths = useCallback(async () => {
    if (!user) return;
    const q = query(collection(db, ...BILLING));
    const snap = await getDocs(q);
    setSavedMonths(snap.docs.map(d => d.id).sort().reverse());
  }, [user]);

  useEffect(() => { refreshSavedMonths(); }, [refreshSavedMonths]);

  // 회사별 필드 로드 — 관리자는 전체 서브컬렉션, 회원사는 자기 서브독만. 서브독 없으면 부모 폴백.
  const loadCompanyField = useCallback(async (
    month: string,
    field: string,
    parentField: Record<string, Record<string, unknown>>,
  ): Promise<Record<string, Record<string, unknown>>> => {
    const out: Record<string, Record<string, unknown>> = {};
    if (isAdmin) {
      const snap = await getDocs(collection(db, ...BILLING, month, field));
      if (!snap.empty) {
        snap.docs.forEach(d => { out[d.id] = stripMeta(d.data()) as Record<string, unknown>; });
        return out;
      }
      return parentField || {};   // 폴백: 미마이그레이션 월
    }
    if (partnerCompany) {
      const s = await getDoc(doc(db, ...BILLING, month, field, partnerCompany));
      if (s.exists()) {
        out[partnerCompany] = stripMeta(s.data()) as Record<string, unknown>;
      } else if (parentField && parentField[partnerCompany]) {
        out[partnerCompany] = parentField[partnerCompany];   // 폴백
      }
    }
    return out;
  }, [isAdmin, partnerCompany]);

  const loadMonth = useCallback(async (month: string) => {
    if (!user || !month) return;
    try {
      const parentRef = doc(db, ...BILLING, month);
      const snap = await getDoc(parentRef);
      const p = snap.exists() ? snap.data() : {};

      // 공통(부모)
      setZonePrices(p.zonePrices || INITIAL_ZONES);
      setRegions(p.regions || INITIAL_REGIONS_DATA);
      setOrders(p.orders || {});
      setIsClosed(p.isClosed || false);
      loadedVersionRef.current = (p.version as number) ?? 0;

      // 회사별(서브컬렉션, 폴백 부모)
      const [pi, dd, pd, pr] = await Promise.all([
        loadCompanyField(month, 'partnerInputs', p.partnerInputs || {}),
        loadCompanyField(month, 'deliveryDates', p.deliveryDates || {}),
        loadCompanyField(month, 'publishDates', p.publishDates || {}),
        loadCompanyField(month, 'publishRequests', p.publishRequests || {}),
      ]);
      setPartnerInputs(pi as PartnerInputs);
      setDeliveryDates(dd as DeliveryDates);
      setPublishDates(pd as PublishDates);
      setPublishRequests(pr as PublishRequests);

      // ecountSales — 관리자만(billing_admin), 회원사엔 노출 안 함
      if (isAdmin) {
        const adminSnap = await getDoc(doc(db, ...BILLING_ADMIN, month));
        setEcountSales(
          (adminSnap.exists() ? adminSnap.data().ecountSales : undefined) || p.ecountSales || {},
        );
      } else {
        setEcountSales({});
      }
    } catch (e) {
      console.error('월 데이터 로드 오류:', e);
    }
  }, [user, isAdmin, loadCompanyField]);

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
        const ref = doc(db, ...BILLING, previousMonth);
        const snap = await getDoc(ref);
        const previousMonthClosed = snap.exists() ? snap.data().isClosed === true : false;
        if (!previousMonthClosed) setCurrentMonth(previousMonth);
      } catch (e) {
        console.error('기본 월 확인 오류:', e);
      }
    };
    resolveDefaultMonth();
  }, [currentMonth, user]);

  // 공통 필드(부모) 병합 저장 — 낙관적 잠금. 회사별 필드는 여기 넣지 않는다(saveCompany 사용).
  //   ⚠️ 월 부모 문서는 updateDoc 금지(CLAUDE.md) → 트랜잭션 안에서도 tx.set(..., {merge:true}).
  const commitMerge = useCallback(async (
    data: Record<string, unknown>,
    email: string,
    opts: { rebase?: boolean } = {},
  ): Promise<boolean> => {
    const ref = doc(db, ...BILLING, currentMonth);
    let newVersion = loadedVersionRef.current;
    try {
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        const dbVersion = cur.exists() ? ((cur.data().version as number) ?? 0) : 0;
        if (cur.exists() && dbVersion !== loadedVersionRef.current) {
          const err = new Error('CONFLICT') as Error & { code?: string; dbVersion?: number };
          err.code = 'CONFLICT';
          err.dbVersion = dbVersion;
          throw err;
        }
        newVersion = dbVersion + 1;
        tx.set(ref, { ...data, version: newVersion, updatedAt: new Date().toISOString(), updatedBy: email }, { merge: true });
      });
      loadedVersionRef.current = newVersion;
      if (!savedMonths.includes(currentMonth)) refreshSavedMonths();
      return true;
    } catch (e) {
      const err = e as { code?: string; dbVersion?: number };
      if (err?.code === 'CONFLICT') {
        if (opts.rebase) {
          loadedVersionRef.current = err.dbVersion ?? loadedVersionRef.current;
          return await commitMergeRef.current!(data, email, { rebase: false });
        }
        if (typeof window !== 'undefined' && window.confirm(
          '다른 기기·탭에서 이 달 정산 데이터를 먼저 저장했습니다.\n' +
          '내 화면이 오래된 상태라 이번 저장을 취소했습니다.\n\n' +
          '[확인]을 누르면 최신 데이터를 불러옵니다. (방금 입력한 값은 반영되지 않습니다)'
        )) {
          await loadMonth(currentMonth);
        }
        return false;
      }
      throw e;
    }
  }, [currentMonth, savedMonths, refreshSavedMonths, loadMonth]);

  const commitMergeRef = useRef<typeof commitMerge | null>(null);
  commitMergeRef.current = commitMerge;

  // 회사별 서브독 저장 — value={회사:{지역:데이터}}. 회사별 문서에 merge.
  //   회사별이라 동시편집 충돌이 낮아 낙관적 잠금 없이 merge(지역 단위 병합). 규칙이 회사=문서ID를 격리한다.
  const saveCompany = useCallback(async (
    field: string,
    value: Record<string, Record<string, unknown>>,
    email: string,
  ): Promise<boolean> => {
    const entries = Object.entries(value || {});
    if (!entries.length) return true;
    await Promise.all(entries.map(([company, regionData]) =>
      setDoc(
        doc(db, ...BILLING, currentMonth, field, company),
        { ...regionData, _company: company, _month: currentMonth, updatedAt: new Date().toISOString(), updatedBy: email },
        { merge: true },
      ),
    ));
    if (!savedMonths.includes(currentMonth)) refreshSavedMonths();
    return true;
  }, [currentMonth, savedMonths, refreshSavedMonths]);

  const saveAll = useCallback(async (email: string) => {
    setIsSaving(true);
    try {
      // 공통(부모)
      await commitMerge({ zonePrices, regions, orders, isClosed }, email);
      // 회사별(서브독)
      await Promise.all([
        saveCompany('partnerInputs', partnerInputs, email),
        saveCompany('deliveryDates', deliveryDates, email),
        saveCompany('publishDates', publishDates, email),
        saveCompany('publishRequests', publishRequests, email),
      ]);
    } finally {
      setIsSaving(false);
    }
  }, [commitMerge, saveCompany, zonePrices, regions, orders, isClosed,
      partnerInputs, deliveryDates, publishDates, publishRequests]);

  // 단일 필드 저장 — 회사별 필드면 서브독으로, 공통 필드면 부모로 라우팅한다.
  const saveField = useCallback(async (field: string, value: unknown, email: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      if ((COMPANY_FIELDS as readonly string[]).includes(field)) {
        return await saveCompany(field, value as Record<string, Record<string, unknown>>, email);
      }
      // ecountSales(민감·관리자 전용)는 billing_admin — **읽는 문(loadMonth)과 같은 문**에 쓴다.
      //   8/14 격리 때 읽기만 billing_admin 으로 옮기고 쓰기가 부모에 남아, 발행 직후 저장분을
      //   billing_admin 기존본이 새로고침마다 덮었다(실측 2026-08-18: 부모 9건 ↔ billing_admin 8건).
      if (field === 'ecountSales') {
        await setDoc(
          doc(db, ...BILLING_ADMIN, currentMonth),
          { ecountSales: value, updatedAt: new Date().toISOString(), updatedBy: email },
          { merge: true },
        );
        if (!savedMonths.includes(currentMonth)) refreshSavedMonths();
        return true;
      }
      return await commitMerge({ [field]: value }, email, { rebase: true });
    } finally {
      setIsSaving(false);
    }
  }, [commitMerge, saveCompany, currentMonth, savedMonths, refreshSavedMonths]);

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
