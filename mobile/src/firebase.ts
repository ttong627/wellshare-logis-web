import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
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
