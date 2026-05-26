/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import { User } from 'firebase/auth';
import { AppUser } from '../types';

export interface FirebaseContextType {
  user: User | null;
  userProfile: AppUser | null;
  loading: boolean;
  userLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
