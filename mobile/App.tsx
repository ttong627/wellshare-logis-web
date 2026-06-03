import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { SettingsProvider } from './src/context/SettingsContext';
import AppNavigator from './src/navigation';
import { useOtaUpdate } from './src/hooks/useOtaUpdate';
import { useVersionGate } from './src/hooks/useVersionGate';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import { COLORS } from './src/constants';

// FCM 기기 토큰 등록기 — AuthProvider 내부에서만 동작(렌더 출력 없음).
function PushRegistrar() {
  usePushNotifications();
  return null;
}

// 강제 업데이트 차단 화면 — 설치 버전이 서버 minVersion보다 낮을 때.
function UpdateRequiredScreen({ latestVersion, apkUrl }: { latestVersion: string; apkUrl: string }) {
  return (
    <View style={styles.gate}>
      <View style={styles.gateIcon}>
        <Feather name="download-cloud" size={42} color={COLORS.brand} />
      </View>
      <Text style={styles.gateTitle}>새 버전 업데이트</Text>
      <Text style={styles.gateDesc}>
        {`원활하고 안전한 사용을 위해\n최신 버전(v${latestVersion})으로 업데이트가 필요합니다.`}
      </Text>
      <Pressable
        onPress={() => Linking.openURL(apkUrl).catch(() => {})}
        style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="지금 업데이트"
      >
        <Feather name="download" size={18} color={COLORS.white} />
        <Text style={styles.gateBtnText}>지금 업데이트</Text>
      </Pressable>
      <Text style={styles.gateHint}>버튼을 누르면 다운로드 페이지가 열립니다.{'\n'}설치 후 앱을 다시 실행해 주세요.</Text>
    </View>
  );
}

export default function App() {
  const gate = useVersionGate();      // 시작 시 버전 비교 → 신규 버전 강제 업데이트
  const updating = useOtaUpdate();    // OTA(JS) 신규 버전 즉시 적용

  if (gate.forced) {
    return <UpdateRequiredScreen latestVersion={gate.latestVersion} apkUrl={gate.apkUrl} />;
  }

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

  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 32 },
  gateIcon: {
    width: 96, height: 96, borderRadius: 28, backgroundColor: COLORS.infoLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  gateTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginBottom: 12 },
  gateDesc: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  gateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.brand, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, minWidth: 240,
  },
  gateBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  gateHint: { marginTop: 20, color: COLORS.textMuted, fontWeight: '600', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
