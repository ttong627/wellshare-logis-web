/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { auth } from './firebase';
import { FirebaseContext } from '../hooks/useFirebase';
import { firebaseService } from './firebaseService';
import { AppUser, UserStatus } from '../types';

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLoading, setUserLoading] = useState(false);

  const login = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      
      if (authUser) {
        setUserLoading(true);
        // Get invite code from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const inviteCode = urlParams.get('invite') || undefined;
        
        try {
          const profile = await firebaseService.getOrCreateUserProfile(authUser, inviteCode);
          setUserProfile(profile);
          
          if (inviteCode && profile?.status === UserStatus.ACTIVE) {
            // Remove invite param from URL
            const url = new URL(window.location.href);
            url.searchParams.delete('invite');
            window.history.replaceState({}, '', url.toString());
          }

          // Real-time listener for profile changes (role/status)
          const unsubProfile = firebaseService.subscribeToUserProfile(authUser.uid, (updatedProfile) => {
            setUserProfile(updatedProfile);
            if (updatedProfile?.status === UserStatus.DISABLED) {
              logout();
              alert('계정이 비활성화되었습니다.');
            }
          });

          setLoading(false);
          setUserLoading(false);
          return () => unsubProfile();
        } catch (err) {
          console.error('Failed to sync profile:', err);
          setLoading(false);
          setUserLoading(false);
        }
      } else {
        setUserProfile(null);
        setLoading(false);
        setUserLoading(false);
      }
    });
    return unsubscribe;
  }, [logout]);

  return (
    <FirebaseContext.Provider value={{ user, userProfile, loading, userLoading, login, logout }}>
      {children}
    </FirebaseContext.Provider>
  );
};
