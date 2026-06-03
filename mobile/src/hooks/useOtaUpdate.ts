import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

/**
 * 앱 실행 시 EAS Update(OTA)로 배포된 새 버전을 감지하면
 * 다운로드 후 즉시 재시작하여 자동 적용한다.
 * - 개발(Expo Go)에서는 비활성(__DEV__).
 * - 실패해도 앱은 기존(캐시) 버전으로 정상 구동(예외 무시).
 * 반환값 updating=true 동안 "업데이트 적용 중" 화면을 보여준다.
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
        await Updates.reloadAsync(); // 새 버전으로 재시작
      } catch (e) {
        console.warn('OTA 업데이트 확인 실패:', e);
        if (!cancelled) setUpdating(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return updating;
}
