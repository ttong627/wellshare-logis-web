import { initializeApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
// getReactNativePersistence는 firebase의 RN 빌드(index.rn)에만 타입이 노출되어
// 기본 타입 정의에선 누락된다(런타임 Metro 번들에선 정상). 알려진 이슈로 ts-ignore 처리.
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
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

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const APP_ID = 'wellshare-logis-v1-production-stable';
