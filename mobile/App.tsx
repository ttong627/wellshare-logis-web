import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { SettingsProvider } from './src/context/SettingsContext';
import AppNavigator from './src/navigation';
import { useOtaUpdate } from './src/hooks/useOtaUpdate';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import { COLORS } from './src/constants';

// FCM 기기 토큰 등록기 — AuthProvider 내부에서만 동작(렌더 출력 없음).
function PushRegistrar() {
  usePushNotifications();
  return null;
}

export default function App() {
  const updating = useOtaUpdate(); // 신규 버전 있으면 즉시 강제 적용

  if (updating) {
    return (
      <View style={styles.updating}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.title}>최신 버전으로 업데이트 중…</Text>
        <Text style={styles.sub}>잠시만 기다려 주세요</Text>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <DataProvider>
            <PushRegistrar />
            <StatusBar style="light" />
            <AppNavigator />
          </DataProvider>
        </AuthProvider>
      </SettingsProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  updating: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 32 },
  title: { marginTop: 18, color: COLORS.text, fontWeight: '800', fontSize: 16 },
  sub: { marginTop: 6, color: COLORS.textMuted, fontWeight: '600', fontSize: 13 },
});
