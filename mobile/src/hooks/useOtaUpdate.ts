import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

/**
 * 앱 실행 시 새 OTA 버전이 있으면 **즉시 다운로드 후 강제 재시작**하여 최신을 적용한다.
 * - 개발(Expo Go)에서는 비활성(__DEV__).
 * - 실패(네트워크 등)해도 앱은 기존 임베드 번들로 정상 구동(예외 무시).
 * updating=true 동안 "업데이트 적용 중" 화면을 보여준다.
 */
export function useOtaUpdate(): boolean {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (__DEV__) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (cancelled || !res.isAvailable) return;
        setUpdating(true);
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        await Updates.reloadAsync(); // 새 버전 즉시 적용(강제 재시작)
      } catch (e) {
        console.warn('OTA 강제 업데이트 실패 — 기존 버전으로 구동:', e);
        if (!cancelled) setUpdating(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return updating;
}
