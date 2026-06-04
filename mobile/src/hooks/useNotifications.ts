import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { useAuth } from '../context/AuthContext';

export interface Notif {
  id: string;
  message: string;
  target: string;
  timestamp?: string;
  readBy?: string[];
}

/**
 * 내 타겟(관리자=ADMIN / 파트너=회사명) 알림을 실시간 구독한다.
 * 홈(안읽음 배지)·알림내역(목록·읽음처리) 공용 — 한 곳에서 markRead를 관리해 일관성 유지.
 * markRead는 낙관적 업데이트(탭 즉시 읽음 전환) + 실패 시 롤백.
 */
export function useNotifications() {
  const { user, isAdmin, partnerCompany } = useAuth();
  const myTarget = isAdmin ? 'ADMIN' : (partnerCompany || '');
  const uid = user?.uid || '';

  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myTarget) { setItems([]); setLoading(false); return; }
    const q = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'),
      where('target', '==', myTarget),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Notif[];
        list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        setItems(list);
        setLoading(false);
      },
      (e) => { console.warn('알림 구독 실패:', e); setLoading(false); },
    );
    return unsub;
  }, [myTarget]);

  const markRead = useCallback((n: Notif) => {
    if (!uid || n.readBy?.includes(uid)) return;
    // 낙관적 업데이트 — 탭하면 즉시 읽음 상태로 전환(서버 왕복 대기 없음)
    setItems((prev) => prev.map((it) => (
      it.id === n.id ? { ...it, readBy: [...(it.readBy || []), uid] } : it
    )));
    updateDoc(
      doc(db, 'artifacts', APP_ID, 'public', 'data', 'notifications', n.id),
      { readBy: arrayUnion(uid) },
    ).catch((e) => {
      console.warn('읽음 처리 실패 — 롤백:', e);
      setItems((prev) => prev.map((it) => (
        it.id === n.id ? { ...it, readBy: (it.readBy || []).filter((u) => u !== uid) } : it
      )));
    });
  }, [uid]);

  const markAll = useCallback(() => {
    items.forEach((n) => { if (!n.readBy?.includes(uid)) markRead(n); });
  }, [items, uid, markRead]);

  const unread = items.filter((n) => !n.readBy?.includes(uid)).length;

  return { items, unread, loading, markRead, markAll, uid };
}
