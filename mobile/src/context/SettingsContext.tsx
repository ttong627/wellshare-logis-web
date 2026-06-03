import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 알림음·진동 설정. AsyncStorage로 영속화하며, 저장 실패해도 기본값(모두 켜짐)으로 동작한다.
const STORAGE_KEY = 'wellshare_notif_settings';

export interface NotifSettings {
  notifEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const DEFAULT_SETTINGS: NotifSettings = {
  notifEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
};

interface SettingsContextType extends NotifSettings {
  loaded: boolean;
  setNotifEnabled: (value: boolean) => void;
  setSoundEnabled: (value: boolean) => void;
  setVibrationEnabled: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// 저장된 값이 객체이고 boolean 필드를 가질 때만 채택(타입 깨짐 방어).
function sanitize(raw: unknown): NotifSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  const obj = raw as Record<string, unknown>;
  return {
    notifEnabled: typeof obj.notifEnabled === 'boolean' ? obj.notifEnabled : DEFAULT_SETTINGS.notifEnabled,
    soundEnabled: typeof obj.soundEnabled === 'boolean' ? obj.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    vibrationEnabled:
      typeof obj.vibrationEnabled === 'boolean' ? obj.vibrationEnabled : DEFAULT_SETTINGS.vibrationEnabled,
  };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<NotifSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // 앱 시작 시 1회 로드. 실패해도 기본값 유지.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (active && stored) {
          setSettings(sanitize(JSON.parse(stored)));
        }
      } catch (e) {
        console.warn('알림 설정 로드 실패 — 기본값 사용:', e);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 변경 시 항상 새 객체로 갱신(불변성) 후 비동기 저장. 저장 실패는 무시(다음 변경 때 재시도).
  const persist = (next: NotifSettings) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((e) =>
      console.warn('알림 설정 저장 실패:', e),
    );
  };

  const setNotifEnabled = (value: boolean) =>
    persist({ ...settings, notifEnabled: value });
  const setSoundEnabled = (value: boolean) =>
    persist({ ...settings, soundEnabled: value });
  const setVibrationEnabled = (value: boolean) =>
    persist({ ...settings, vibrationEnabled: value });

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        loaded,
        setNotifEnabled,
        setSoundEnabled,
        setVibrationEnabled,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
