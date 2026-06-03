import { useEffect } from 'react';
import * as Updates from 'expo-updates';

/**
 * 새 OTA 업데이트가 있으면 백그라운드로 받아두고, 다음 앱 실행 때 자연스럽게 적용한다.
 * - 강제 reloadAsync(즉시 재시작)는 하지 않는다: 문제 있는 업데이트가 앱을 막아버리는 위험을 방지.
 * - 개발(Expo Go)에서는 비활성(__DEV__).
 * - 실패해도 앱은 임베드 번들로 정상 구동(예외 무시).
 * 반환값은 항상 false(별도 "업데이트 중" 화면 없음).
 */
export function useOtaUpdate(): boolean {
  useEffect(() => {
    if (__DEV__) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!cancelled && res.isAvailable) {
          await Updates.fetchUpdateAsync(); // 다음 실행 때 적용
        }
      } catch (e) {
        console.warn('OTA 업데이트 확인 실패:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return false;
}
