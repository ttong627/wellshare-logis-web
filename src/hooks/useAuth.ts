import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, APP_ID } from '../firebase';
import { ADMIN_EMAILS } from '../constants/members';
import { PartnerAccountsDB } from '../types';

export interface AuthState {
  user: User | null;
  isAdmin: boolean;
  partnerCompany: string | null;
  authLoading: boolean;
  isDbLoaded: boolean;
  partnerAccountsDB: PartnerAccountsDB;
  pendingUsers: string[];
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [partnerAccountsDB, setPartnerAccountsDB] = useState<PartnerAccountsDB>({});
  const [pendingUsers, setPendingUsers] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [partnerCompany, setPartnerCompany] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (!currentUser) {
        setIsAdmin(false);
        setPartnerCompany(null);
        setIsDbLoaded(false);
        setPartnerAccountsDB({});
        setPendingUsers([]);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const settingsRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings');
    const unsub = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPartnerAccountsDB(data.partnerAccounts || {});
        setPendingUsers(data.pendingUsers || []);
      } else {
        setPartnerAccountsDB({});
        setPendingUsers([]);
      }
      setIsDbLoaded(true);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user?.email) return;
    const dynamicAdmin = partnerAccountsDB[user.email] === 'ADMIN';
    const adminStatus = ADMIN_EMAILS.includes(user.email) || dynamicAdmin;
    setIsAdmin(adminStatus);
    const rawCompany = partnerAccountsDB[user.email];
    setPartnerCompany(adminStatus ? null : (rawCompany && rawCompany !== 'ADMIN' ? rawCompany : null));
  }, [user, partnerAccountsDB]);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return { user, isAdmin, partnerCompany, authLoading, isDbLoaded, partnerAccountsDB, pendingUsers, signOut };
}
