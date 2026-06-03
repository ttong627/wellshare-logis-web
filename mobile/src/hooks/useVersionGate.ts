import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';

export interface VersionGate {
  forced: boolean;
  latestVersion: string;
  apkUrl: string;
}

const DEFAULT_APK_URL = 'https://wellshare-logis.web.app/app';

// 버전 비교 "1.0.9": a<b → -1, a==b → 0, a>b → 1
function cmpVersion(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * 앱 시작 시 설치 버전을 서버(settings/app_version.minVersion)와 비교한다.
 * 설치버전 < minVersion 이면 forced=true → 차단 화면에서 새 APK 다운로드를 강제한다.
 * OTA(EXPO_TOKEN) 없이도 동작하는 네이티브 버전 강제 업데이트 게이트.
 * - 실시간 구독: 관리자가 서버 minVersion만 올리면 모든 구버전 앱이 즉시 차단된다.
 * - 오프라인/오류 시 통과(fail-open) — 네트워크 문제로 앱이 잠기지 않도록.
 */
export function useVersionGate(): VersionGate {
  const installed = Constants.expoConfig?.version || '0.0.0';
  const [gate, setGate] = useState<VersionGate>({ forced: false, latestVersion: installed, apkUrl: DEFAULT_APK_URL });

  useEffect(() => {
    const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'app_version');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setGate({ forced: false, latestVersion: installed, apkUrl: DEFAULT_APK_URL });
          return;
        }
        const d = snap.data() as { minVersion?: string; latestVersion?: string; apkUrl?: string };
        const minV = String(d.minVersion || '0.0.0');
        const latest = String(d.latestVersion || installed);
        const apkUrl = String(d.apkUrl || DEFAULT_APK_URL);
        setGate({ forced: cmpVersion(installed, minV) < 0, latestVersion: latest, apkUrl });
      },
      (e) => { console.warn('버전 확인 실패(오프라인 등) — 통과:', e); },
    );
    return unsub;
  }, [installed]);

  return gate;
}
