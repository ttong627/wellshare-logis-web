import { useEffect } from 'react';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { useAuth } from '../context/AuthContext';

// 포그라운드(앱 켜진 상태)에서도 알림 배너·소리를 표시한다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * FCM 기기 토큰을 등록하고 Firestore(pushTokens/{uid})에 저장한다.
 * Cloud Function이 알림 생성 시 같은 target의 토큰들로 FCM을 직접 발송 → 앱이 꺼져 있어도 푸시 수신.
 * - 실기기에서만 동작(에뮬레이터 제외). 권한 거부·실패해도 앱은 정상 구동(예외 무시).
 * - target: 관리자=ADMIN, 파트너=회사명(알림 화면 구독 키와 동일).
 */
export function usePushNotifications(): void {
  const { user, isAdmin, partnerCompany } = useAuth();

  // 앱이 포그라운드로 올 때(및 마운트 시) 트레이 알림 + 런처 아이콘 배지를 정리한다.
  // FCM 푸시가 알림창에 남아 앱 아이콘 숫자 배지가 인앱에서 확인해도 안 사라지던 문제 해결.
  useEffect(() => {
    const clear = async () => {
      try {
        await Notifications.setBadgeCountAsync(0);
        await Notifications.dismissAllNotificationsAsync();
      } catch (e) {
        console.warn('알림 배지 정리 실패:', e);
      }
    };
    clear();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') clear(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const target = isAdmin ? 'ADMIN' : (partnerCompany || '');
    if (!target) return;

    let cancelled = false;
    (async () => {
      try {
        if (!Device.isDevice) return; // 에뮬레이터/시뮬레이터에는 FCM 토큰이 없다
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: '기본 알림',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#0284c7',
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let granted = existing.granted;
        if (!granted) {
          const req = await Notifications.requestPermissionsAsync();
          granted = req.granted;
        }
        if (!granted || cancelled) return;

        // Android: 원시 FCM 토큰 — Cloud Function의 firebase-admin이 이 토큰으로 직접 발송한다.
        const tokenResp = await Notifications.getDevicePushTokenAsync();
        const token = tokenResp?.data;
        if (!token || cancelled) return;

        await setDoc(
          doc(db, 'artifacts', APP_ID, 'public', 'data', 'pushTokens', uid),
          {
            token: String(token),
            target,
            email: user.email || '',
            platform: Platform.OS,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      } catch (e) {
        console.warn('푸시 토큰 등록 실패:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [user, isAdmin, partnerCompany]);
}
