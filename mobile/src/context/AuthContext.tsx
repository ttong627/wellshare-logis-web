import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  signOut as fbSignOut, User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, APP_ID } from '../firebase';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  partnerCompany: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [partnerCompany, setPartnerCompany] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'partnerAccounts'));
          const data = snap.exists() ? snap.data() : {};
          const role = data[u.email || ''];
          setIsAdmin(role === 'ADMIN');
          setPartnerCompany(role && role !== 'ADMIN' ? role : null);
        } catch {
          setIsAdmin(false);
          setPartnerCompany(null);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
        setPartnerCompany(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, partnerCompany, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
