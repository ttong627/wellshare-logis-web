import { initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, type Auth } from 'firebase/auth';
import * as firebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAEzG4XylKA-Etc9ihXuiggiTt9D1oiOIo',
  authDomain: 'wellshare-logis.firebaseapp.com',
  projectId: 'wellshare-logis',
  storageBucket: 'wellshare-logis.firebasestorage.app',
  messagingSenderId: '528541497350',
  appId: '1:528541497350:web:cc085bee059efb461a2b87',
};

const app = initializeApp(firebaseConfig);

// getReactNativePersistence는 번들 해석(Metro package exports)에 따라 undefined일 수 있다.
// 그대로 호출하면 "undefined is not a function"으로 앱이 실행 직후 죽는다.
// → 있으면 AsyncStorage 영속(로그인 유지), 없으면 getAuth로 폴백(크래시 방지).
function createAuth(): Auth {
  const rnPersistence = (firebaseAuth as any).getReactNativePersistence;
  if (typeof rnPersistence === 'function') {
    try {
      return initializeAuth(app, { persistence: rnPersistence(AsyncStorage) });
    } catch (e) {
      console.warn('initializeAuth(RN persistence) 실패 → getAuth 폴백:', e);
    }
  }
  return getAuth(app);
}

export const auth = createAuth();
export const db = getFirestore(app);
export const APP_ID = 'wellshare-logis-v1-production-stable';
