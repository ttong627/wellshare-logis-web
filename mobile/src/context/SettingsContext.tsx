import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 알림음·진동·음 선택·음량 설정. AsyncStorage 영속화, 실패해도 기본값으로 동작.
const STORAGE_KEY = 'wellshare_notif_settings';

export interface NotifSettings {
  notifEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  soundChoice: string; // '1' 기본 · '2' 딩동 · '3' 차임
  volume: number;      // 0.0 ~ 1.0
}

const DEFAULT_SETTINGS: NotifSettings = {
  notifEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  soundChoice: '1',
  volume: 0.7,
};

interface SettingsContextType extends NotifSettings {
  loaded: boolean;
  setNotifEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setVibrationEnabled: (v: boolean) => void;
  setSoundChoice: (v: string) => void;
  setVolume: (v: number) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function sanitize(raw: unknown): NotifSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  const o = raw as Record<string, unknown>;
  return {
    notifEnabled: typeof o.notifEnabled === 'boolean' ? o.notifEnabled : DEFAULT_SETTINGS.notifEnabled,
    soundEnabled: typeof o.soundEnabled === 'boolean' ? o.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    vibrationEnabled: typeof o.vibrationEnabled === 'boolean' ? o.vibrationEnabled : DEFAULT_SETTINGS.vibrationEnabled,
    soundChoice: typeof o.soundChoice === 'string' && ['1', '2', '3'].includes(o.soundChoice) ? o.soundChoice : DEFAULT_SETTINGS.soundChoice,
    volume: typeof o.volume === 'number' && o.volume >= 0 && o.volume <= 1 ? o.volume : DEFAULT_SETTINGS.volume,
  };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<NotifSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (active && stored) setSettings(sanitize(JSON.parse(stored)));
      } catch (e) {
        console.warn('알림 설정 로드 실패 — 기본값 사용:', e);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const persist = (next: NotifSettings) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((e) => console.warn('알림 설정 저장 실패:', e));
  };

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        loaded,
        setNotifEnabled: (v) => persist({ ...settings, notifEnabled: v }),
        setSoundEnabled: (v) => persist({ ...settings, soundEnabled: v }),
        setVibrationEnabled: (v) => persist({ ...settings, vibrationEnabled: v }),
        setSoundChoice: (v) => persist({ ...settings, soundChoice: v }),
        setVolume: (v) => persist({ ...settings, volume: Math.max(0, Math.min(1, v)) }),
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
