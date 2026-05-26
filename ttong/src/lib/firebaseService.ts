/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  addDoc,
  query, 
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  runTransaction,
  DocumentData,
  DocumentReference,
  FirestoreError
} from 'firebase/firestore';
import { db, auth, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
  ScheduleData, 
  DocHistoryItem, 
  Driver, 
  OfficialDoc, 
  DocType, 
  DocFormatSettings,
  UserRole,
  UserStatus,
  AppUser,
  InviteCode,
  EmergencyContact
} from '../types';

export type SettingValue = Partial<OfficialDoc> | Record<DocType, DocFormatSettings> | string | number | boolean | null | Record<string, unknown>;

export interface BackupData {
  meta: {
    exportedAt: string;
    userId: string;
    email: string | null;
  };
  data: {
    settings: Record<string, SettingValue>;
    drivers: Driver[];
    officialDocs: DocHistoryItem[];
    schedules: ScheduleData[];
    emergencyContacts?: EmergencyContact[];
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
  BATCH = 'batch'
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firebaseService = {
  // Test connection
  async testConnection() {
    try {
      const docRef = doc(db, 'test', 'connection');
      await getDoc(docRef);
      return true;
    } catch (error) {
      console.error('Firebase connection test failed:', error);
      return false;
    }
  },

  // Global Settings (Shared)
  async getGlobalSettings(): Promise<Record<string, string | null>> {
    try {
      const docRef = doc(db, 'settings', 'global');
      const snapshot = await getDoc(docRef);
      return (snapshot.exists() ? snapshot.data() : {}) as Record<string, string | null>;
    } catch (error) {
      console.error('Failed to get global settings:', error);
      return {};
    }
  },

  async setGlobalSettings(settings: Record<string, unknown>): Promise<void> {
    try {
      const docRef = doc(db, 'settings', 'global');
      await setDoc(docRef, { ...settings, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    }
  },

  // User Management
  async getOrCreateUserProfile(user: User, inviteCode?: string): Promise<AppUser | null> {
    const userRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(userRef);
      const now = new Date().toISOString();

      if (snap.exists()) {
        const data = snap.data() as AppUser;
        // Check if status is pending and if there was an invite code provided now (though usually they check before login)
        // For existing users, just update login time
        await setDoc(userRef, { lastLoginAt: now }, { merge: true });
        return { ...data, lastLoginAt: now };
      }

      // First time user
      let role = UserRole.VIEWER;
      let status = UserStatus.PENDING;
      let invitedBy = '';

      // Special handling for the designated admin
      if (user.uid === '5hX65FLQgBhuZzxnXuS8dyiRi4G3' || user.email === 'ttong627@gmail.com') {
        role = UserRole.ADMIN;
        status = UserStatus.ACTIVE;
      } else if (inviteCode) {
        // Find and validate invite code
        const q = query(
          collection(db, 'invites'), 
          where('code', '==', inviteCode), 
          where('used', '==', false),
          limit(1)
        );
        const inviteSnaps = await getDocs(q);
        if (!inviteSnaps.empty) {
          const inviteDoc = inviteSnaps.docs[0];
          const inviteData = inviteDoc.data() as InviteCode;
          const expiresAt = new Date(inviteData.expiresAt).getTime();
          if (expiresAt > Date.now()) {
            role = inviteData.role;
            status = UserStatus.ACTIVE;
            invitedBy = inviteData.createdBy;
            // Mark code as used
            await setDoc(inviteDoc.ref, { used: true }, { merge: true });
          }
        }
      }

      const newUser: AppUser = {
        id: user.uid,
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
        role,
        status,
        invitedBy,
        createdAt: now,
        lastLoginAt: now
      };

      await setDoc(userRef, newUser);
      return newUser;
    } catch (error) {
      console.error('Failed to get/create user profile:', error);
      return null;
    }
  },

  subscribeToUserProfile(uid: string, callback: (user: AppUser | null) => void) {
    const userRef = doc(db, 'users', uid);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() } as AppUser);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('User profile subscription failed:', error);
    });
  },

  subscribeToAllUsers(callback: (users: AppUser[]) => void) {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser)));
    }, (error) => {
      console.error('All users subscription failed:', error);
    });
  },

  async updateUserRoleOrStatus(uid: string, data: Partial<{ role: UserRole, status: UserStatus }>) {
    const userRef = doc(db, 'users', uid);
    try {
      await setDoc(userRef, data, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  },

  async deleteUser(uid: string) {
    const userRef = doc(db, 'users', uid);
    try {
      await deleteDoc(userRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  },

  // Invites
  async createInvite(email: string, role: UserRole, createdBy: string): Promise<string> {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    const invite: Omit<InviteCode, 'id'> = {
      code,
      email,
      role,
      createdBy,
      createdAt: new Date().toISOString(),
      expiresAt,
      used: false
    };

    try {
      await addDoc(collection(db, 'invites'), invite);
      return code;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invites');
      throw error;
    }
  },

  // Legacy Settings (to be used during migration)
  async getLegacySetting<T>(userId: string, key: string, defaultValue: T): Promise<T> {
    try {
      const docRef = doc(db, 'users', userId, 'settings', key);
      const snapshot = await getDoc(docRef);
      return snapshot.exists() ? (snapshot.data()?.value as T) : defaultValue;
    } catch (error) {
      console.warn(`Failed to get legacy setting ${key}:`, error);
      return defaultValue;
    }
  },

  // Drivers (Shared)
  async getDrivers(): Promise<Driver[]> {
    try {
      const snapshot = await getDocs(collection(db, 'drivers'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'drivers');
      return [];
    }
  },

  async setDrivers(drivers: Driver[]): Promise<void> {
    try {
      let batch = writeBatch(db);
      const batchLimit = 400; 
      let count = 0;
      
      for (const driver of drivers) {
        const docRef = doc(db, 'drivers', driver.id);
        batch.set(docRef, { ...driver, updatedAt: new Date().toISOString() });
        count++;
        
        if (count >= batchLimit) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      
      if (count > 0) {
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.BATCH, 'drivers');
    }
  },
  
  async saveDriver(driver: Driver): Promise<void> {
    try {
      const now = new Date().toISOString();
      await setDoc(doc(db, 'drivers', driver.id), {
        ...driver,
        updatedAt: now,
        createdAt: (driver as { createdAt?: string }).createdAt || now
      });
    } catch (error) {
      const err = error as FirestoreError;
      console.error('기사 저장 오류:', err.code, err.message);
      handleFirestoreError(error, OperationType.WRITE, `drivers/${driver.id}`);
    }
  },

  async addDriver(driver: Omit<Driver, 'id'>): Promise<void> {
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'drivers'), {
        ...driver,
        createdAt: now,
        updatedAt: now
      });
    } catch (error) {
      const err = error as FirestoreError;
      console.error('기사 등록 오류:', err.code, err.message);
      handleFirestoreError(error, OperationType.CREATE, 'drivers');
    }
  },

  async updateDriver(id: string, data: Partial<Driver>): Promise<void> {
    try {
      const now = new Date().toISOString();
      await setDoc(doc(db, 'drivers', id), {
        ...data,
        updatedAt: now
      }, { merge: true });
    } catch (error) {
      const err = error as FirestoreError;
      console.error('기사 수정 오류:', err.code, err.message);
      handleFirestoreError(error, OperationType.UPDATE, `drivers/${id}`);
    }
  },

  async deleteDriver(driverId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'drivers', driverId));
    } catch (error) {
      const err = error as FirestoreError;
      console.error('기사 삭제 오류:', err.code, err.message);
      handleFirestoreError(error, OperationType.DELETE, `drivers/${driverId}`);
    }
  },

  // Subscription for shared drivers
  subscribeToDrivers(callback: (drivers: Driver[]) => void) {
    const q = query(collection(db, 'drivers'));
    return onSnapshot(q, (snapshot) => {
      const drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver));
      callback(drivers);
    }, (error) => {
      console.error('Drivers subscription failed:', error);
    });
  },

  // Schedules (Shared)
  async getSchedule(year: number, month: number, sido: string, sigungu: string): Promise<ScheduleData | null> {
    const clean = (str: string) => String(str).replace(/\s/g, '_').trim();
    const id = `${year}_${month}_${clean(sido)}_${clean(sigungu)}`;
    try {
      const docRef = doc(db, 'schedules', id);
      const snapshot = await getDoc(docRef);
      return snapshot.exists() ? snapshot.data() as ScheduleData : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `schedules/${id}`);
      return null;
    }
  },

  async saveSchedule(year: number, month: number, sido: string, sigungu: string, data: ScheduleData): Promise<void> {
    const clean = (str: string) => String(str).replace(/\s/g, '_').trim();
    const id = `${year}_${month}_${clean(sido)}_${clean(sigungu)}`;
    try {
      await setDoc(doc(db, 'schedules', id), {
        ...data,
        year,
        month,
        sido,
        sigungu,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `schedules/${id}`);
    }
  },

  // Real-time synchronization (Shared)
  subscribeToGlobalSettings(callback: (data: Record<string, unknown>) => void) {
    const docRef = doc(db, 'settings', 'global');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      } else {
        callback({});
      }
    }, (error) => {
      console.error('Subscription error for global settings:', error);
    });
  },

  subscribeToSchedule(year: number, month: number, sido: string, sigungu: string, callback: (data: ScheduleData | null) => void) {
    const clean = (str: string) => String(str).replace(/\s/g, '_').trim();
    const id = `${year}_${month}_${clean(sido)}_${clean(sigungu)}`;
    const docRef = doc(db, 'schedules', id);
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as ScheduleData);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error(`Subscription error for schedule ${id}:`, error);
    });
  },

  // Official Docs History (Shared)
  subscribeToDocHistory(callback: (items: DocHistoryItem[]) => void) {
    const q = query(collection(db, 'officialDocs'), orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocHistoryItem));
      callback(items);
    }, (error) => {
      console.warn('History subscription with order failed, trying timestamp descending:', error);
      const qAlt = query(collection(db, 'officialDocs'), orderBy('timestamp', 'desc'));
      return onSnapshot(qAlt, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocHistoryItem));
        callback(items);
      }, (innerError) => {
        console.error('History subscription failed:', innerError);
      });
    });
  },

  async getDocHistory(): Promise<DocHistoryItem[]> {
    try {
      const q = query(collection(db, 'officialDocs'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocHistoryItem));
    } catch (error) {
      console.warn('History query with order failed, trying without order:', error);
      try {
        const qSimple = query(collection(db, 'officialDocs'));
        const snapshot = await getDocs(qSimple);
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocHistoryItem));
        return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (innerError) {
        handleFirestoreError(innerError, OperationType.LIST, 'officialDocs');
        return [];
      }
    }
  },

  async saveDocHistoryItem(item: DocHistoryItem): Promise<void> {
    try {
      await setDoc(doc(db, 'officialDocs', item.id), item);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `officialDocs/${item.id}`);
    }
  },

  async deleteDocHistoryItem(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'officialDocs', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `officialDocs/${id}`);
    }
  },

  // Document Settings (Shared)
  subscribeToDocSettings<T>(key: string, callback: (val: T | null) => void) {
    const docRef = doc(db, 'settings', key);
    return onSnapshot(docRef, (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data()?.value as T) : null);
    }, (error) => {
      console.error(`Doc setting subscription failed for ${key}:`, error);
    });
  },

  async getDocSetting<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const docRef = doc(db, 'settings', key);
      const snapshot = await getDoc(docRef);
      return snapshot.exists() ? (snapshot.data()?.value as T) : defaultValue;
    } catch (error) {
      console.warn(`Failed to get doc setting ${key}:`, error);
      return defaultValue;
    }
  },

  async setDocSetting<T>(key: string, value: T): Promise<void> {
    try {
      await setDoc(doc(db, 'settings', key), { 
        value, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `settings/${key}`);
    }
  },

  // Document Numbering (Shared)
  async getNextDocNumber(type: 'A' | 'B'): Promise<string> {
    const field = type === 'A' ? 'docSeqA' : 'docSeqB';
    const settingsRef = doc(db, 'settings', 'global');
    
    try {
      const newSeq = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(settingsRef);
        const current = snap.exists() ? (snap.data()[field] || 0) : 0;
        const next = current + 1;
        transaction.set(settingsRef, { [field]: next }, { merge: true });
        return next;
      });

      const year = new Date().getFullYear();
      if (type === 'A') return `웰쉐어 사회 ${year} - ${newSeq}`;
      return `웰쉐어로지스 ${year} - ${String(newSeq).padStart(2, '0')}`;
    } catch (error) {
      console.error('Failed to get next doc number:', error);
      throw error;
    }
  },

  // Image Upload & Management
  async uploadImage(file: File, path: string): Promise<string | null> {
    if (file.size > 2 * 1024 * 1024) {
      alert('이미지 크기는 2MB 이하여야 합니다.');
      return null;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowed.includes(file.type)) {
      alert('JPG, PNG, GIF 형식만 업로드 가능합니다.');
      return null;
    }

    try {
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const fieldMap: Record<string, string> = {
        'images/formA/logo.png': 'formA_logoUrl',
        'images/formA/stamp.png': 'formA_stampUrl',
        'images/formB/logo.png': 'formB_logoUrl',
        'images/formB/stamp.png': 'formB_stampUrl',
      };

      if (fieldMap[path]) {
        await this.setGlobalSettings({ [fieldMap[path]]: url });
      }

      return url;
    } catch (error) {
      console.error('Image upload failed:', error);
      return null;
    }
  },

  async deleteImage(path: string): Promise<void> {
    try {
      const storageRef = ref(storage, path);
      await deleteObject(storageRef);

      const fieldMap: Record<string, string> = {
        'images/formA/logo.png': 'formA_logoUrl',
        'images/formA/stamp.png': 'formA_stampUrl',
        'images/formB/logo.png': 'formB_logoUrl',
        'images/formB/stamp.png': 'formB_stampUrl',
      };

      if (fieldMap[path]) {
        await this.setGlobalSettings({ [fieldMap[path]]: null });
      }
    } catch (error) {
      console.error('Image delete failed:', error);
      // Even if storage delete fails (e.g. file already gone), clear the URL in firestore if requested
      const fieldMap: Record<string, string> = {
        'images/formA/logo.png': 'formA_logoUrl',
        'images/formA/stamp.png': 'formA_stampUrl',
        'images/formB/logo.png': 'formB_logoUrl',
        'images/formB/stamp.png': 'formB_stampUrl',
      };
      if (fieldMap[path]) {
        await this.setGlobalSettings({ [fieldMap[path]]: null });
      }
    }
  },
  
  // Emergency Contacts (Shared)
  subscribeToEmergencyContacts(callback: (contacts: Record<string, EmergencyContact>) => void) {
    const q = query(collection(db, 'emergencyContacts'));
    return onSnapshot(q, (snapshot) => {
      const map: Record<string, EmergencyContact> = {};
      snapshot.docs.forEach(doc => {
        map[doc.id] = { id: doc.id, ...doc.data() } as EmergencyContact;
      });
      callback(map);
    }, (error) => {
      console.error('Emergency contacts subscription failed:', error);
    });
  },

  async saveEmergencyContact(sido: string, sigungu: string, phone: string, description: string): Promise<void> {
    const id = `${sido}_${sigungu}`.replace(/\s/g, '_');
    try {
      await setDoc(doc(db, 'emergencyContacts', id), {
        id,
        sido,
        sigungu,
        phone: phone.trim(),
        description: description?.trim() || '',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `emergencyContacts/${id}`);
    }
  },

  async deleteEmergencyContact(sido: string, sigungu: string): Promise<void> {
    const id = `${sido}_${sigungu}`.replace(/\s/g, '_');
    try {
      await deleteDoc(doc(db, 'emergencyContacts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `emergencyContacts/${id}`);
    }
  },

  async bulkSaveEmergencyContacts(list: Omit<EmergencyContact, 'id' | 'updatedAt'>[]): Promise<void> {
    try {
      let batch = writeBatch(db);
      let count = 0;
      const now = new Date().toISOString();

      for (const item of list) {
        const id = `${item.sido}_${item.sigungu}`.replace(/\s/g, '_');
        const docRef = doc(db, 'emergencyContacts', id);
        batch.set(docRef, {
          ...item,
          id,
          updatedAt: now
        });
        count++;

        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.BATCH, 'emergencyContacts');
    }
  },

  // Data Migration Logic (V2)
  async migrateDataV2() {
    const user = auth.currentUser;
    if (!user) return;

    const migrationFlag = localStorage.getItem('migrated_v2');
    if (migrationFlag === 'true') return;

    console.log('Starting data migration to V2 (Shared Store)...');

    try {
      // 1. Migrate Global Settings
      const localSettingsKeys = ['defaultEmergency', 'defaultSido', 'defaultSigungu'];
      const globalSettings: Record<string, unknown> = {};
      
      for (const key of localSettingsKeys) {
        const localVal = localStorage.getItem(key);
        if (localVal) {
          globalSettings[key] = localVal.startsWith('{') || localVal.startsWith('[') ? JSON.parse(localVal) : localVal;
        } else {
          const firestoreVal = await this.getLegacySetting(user.uid, key, null);
          if (firestoreVal !== null) globalSettings[key] = firestoreVal;
        }
      }

      if (Object.keys(globalSettings).length > 0) {
        await this.setGlobalSettings(globalSettings);
      }

      // 2. Migrate Doc Settings
      const docSettingKeys = ['current_doc', 'docFormatSettings'];
      for (const key of docSettingKeys) {
        const val = await this.getLegacySetting(user.uid, key, null);
        if (val !== null) {
          await this.setDocSetting(key, val);
        }
      }

      // 3. Migrate Drivers
      let driversToMigrate: Driver[] = [];
      const localDrivers = localStorage.getItem('drivers');
      if (localDrivers) {
        driversToMigrate = JSON.parse(localDrivers);
      } else {
        const userDriversSnap = await getDocs(collection(db, 'users', user.uid, 'drivers'));
        driversToMigrate = userDriversSnap.docs.map(d => ({ id: d.id, ...d.data() } as Driver));
      }

      if (driversToMigrate.length > 0) {
        await this.setDrivers(driversToMigrate);
      }

      // 4. Migrate Schedules
      const userSchedulesSnap = await getDocs(collection(db, 'users', user.uid, 'schedules'));
      if (!userSchedulesSnap.empty) {
        let batch = writeBatch(db);
        let count = 0;
        for (const sDoc of userSchedulesSnap.docs) {
          const docRef = doc(db, 'schedules', sDoc.id);
          batch.set(docRef, sDoc.data());
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // 5. Migrate Official Docs History
      const userDocsSnap = await getDocs(collection(db, 'users', user.uid, 'officialDocs'));
      if (!userDocsSnap.empty) {
        let batch = writeBatch(db);
        let count = 0;
        for (const dDoc of userDocsSnap.docs) {
          const docRef = doc(db, 'officialDocs', dDoc.id);
          batch.set(docRef, dDoc.data());
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // 6. Cleanup Local Storage
      localSettingsKeys.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('drivers');
      localStorage.setItem('migrated_v2', 'true');
      console.log('Migration to V2 completed successfully');
      
    } catch (error) {
      console.error('Migration to V2 failed:', error);
    }
  },

  async getSavedMonths(year: number, sido: string, sigungu: string): Promise<number[]> {
    try {
      const q = query(
        collection(db, 'schedules'),
        where('year', '==', year),
        where('sido', '==', sido),
        where('sigungu', '==', sigungu)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => (doc.data() as ScheduleData).month);
    } catch (error) {
      console.error('Failed to get saved months:', error);
      return [];
    }
  },

  // Export all shared data
  async exportData(): Promise<BackupData | null> {
    const user = auth.currentUser;
    if (!user) return null;
    
    try {
      const exportJson: BackupData = {
        meta: {
          exportedAt: new Date().toISOString(),
          userId: user.uid,
          email: user.email
        },
        data: {
          settings: {},
          drivers: [],
          officialDocs: [],
          schedules: []
        }
      };

      // 1. Settings (Shared)
      const settingsSnap = await getDocs(collection(db, 'settings'));
      settingsSnap.forEach(doc => {
        exportJson.data.settings[doc.id] = doc.data();
      });

      // 2. Drivers (Shared)
      const driversSnap = await getDocs(collection(db, 'drivers'));
      exportJson.data.drivers = driversSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver));

      // 3. Official Docs (Shared)
      const docsSnap = await getDocs(collection(db, 'officialDocs'));
      exportJson.data.officialDocs = docsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocHistoryItem));

      // 4. Schedules (Shared)
      const schedulesSnap = await getDocs(collection(db, 'schedules'));
      exportJson.data.schedules = schedulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as ScheduleData));

      return exportJson;
    } catch (error) {
      console.error('Data export failed:', error);
      throw error;
    }
  },

  // Import data to shared paths
  async importData(importJson: BackupData): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;

    try {
      let batch = writeBatch(db);
      let count = 0;
      const batchLimit = 400;
      const data = importJson.data;

      const queueBatch = async (docRef: DocumentReference, value: DocumentData) => {
        batch.set(docRef, value);
        count++;
        if (count >= batchLimit) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      };

      // 1. Settings (Shared)
      if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
          const docRef = doc(db, 'settings', key);
          await queueBatch(docRef, value as DocumentData);
        }
      }

      // 2. Drivers (Shared)
      if (Array.isArray(data.drivers)) {
        for (const driver of data.drivers) {
          const docRef = doc(db, 'drivers', driver.id);
          await queueBatch(docRef, driver);
        }
      }

      // 3. Official Docs (Shared)
      if (Array.isArray(data.officialDocs)) {
        for (const item of data.officialDocs) {
          const docRef = doc(db, 'officialDocs', item.id);
          await queueBatch(docRef, item);
        }
      }

      // 4. Schedules (Shared)
      if (Array.isArray(data.schedules)) {
        for (const schedule of data.schedules) {
          const id = `${schedule.year}_${schedule.month}_${schedule.sido}_${schedule.sigungu}`;
          const docRef = doc(db, 'schedules', id);
          await queueBatch(docRef, schedule);
        }
      }

      if (count > 0) {
        await batch.commit();
      }
    } catch (error) {
      console.error('Data import failed:', error);
      throw error;
    }
  }
};
