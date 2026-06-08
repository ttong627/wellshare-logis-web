import 'react-native-gesture-handler';
import React, { useState } from 'react';
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
import { downloadAndInstallApk, APK_DIRECT_URL } from './src/lib/apkUpdater';

// FCM 기기 토큰 등록기 — AuthProvider 내부에서만 동작(렌더 출력 없음).
function PushRegistrar() {
  usePushNotifications();
  return null;
}

// 강제 업데이트 차단 화면 — 설치 버전이 서버 minVersion보다 낮을 때.
// 앱 내부에서 APK를 직접 다운로드하고 설치 화면을 띄운다(브라우저 안 거침). 실패 시 다운로드 페이지로 폴백.
function UpdateRequiredScreen({ latestVersion, apkUrl }: { latestVersion: string; apkUrl: string }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  const handleUpdate = async () => {
    setFailed(false);
    setDownloading(true);
    setProgress(0);
    try {
      await downloadAndInstallApk(APK_DIRECT_URL, setProgress);
      // 설치 화면(OS 패키지 설치기)이 떴다. 사용자가 설치를 마치면 새 버전으로 실행됨.
    } catch (e) {
      console.warn('인앱 업데이트 실패 → 다운로드 페이지로 폴백:', e);
      setFailed(true);
      Linking.openURL(apkUrl).catch(() => {});
    } finally {
      setDownloading(false);
    }
  };

  const pct = Math.round(progress * 100);

  return (
    <View style={styles.gate}>
      <View style={styles.gateIcon}>
        <Feather name="download-cloud" size={42} color={COLORS.brand} />
      </View>
      <Text style={styles.gateTitle}>새 버전 업데이트</Text>
      <Text style={styles.gateDesc}>
        {`원활하고 안전한 사용을 위해\n최신 버전(v${latestVersion})으로 업데이트가 필요합니다.`}
      </Text>

      {downloading ? (
        <View style={styles.dlBox}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.dlText}>다운로드 중… {pct}%</Text>
        </View>
      ) : (
        <Pressable
          onPress={handleUpdate}
          style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="지금 업데이트"
        >
          <Feather name="download" size={18} color={COLORS.white} />
          <Text style={styles.gateBtnText}>지금 업데이트</Text>
        </Pressable>
      )}

      <Text style={styles.gateHint}>
        {failed
          ? '자동 설치에 실패해 다운로드 페이지를 열었습니다.\n받은 파일을 눌러 설치해 주세요.'
          : downloading
            ? '다운로드가 끝나면 설치 화면이 자동으로 나타납니다.\n("출처를 알 수 없는 앱" 허용이 필요할 수 있어요)'
            : '버튼을 누르면 앱에서 바로 다운로드·설치합니다.'}
      </Text>
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

  dlBox: { width: '100%', maxWidth: 280, alignItems: 'center' },
  progressTrack: { width: '100%', height: 10, borderRadius: 999, backgroundColor: COLORS.infoLight, overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 999, backgroundColor: COLORS.brand },
  dlText: { marginTop: 10, color: COLORS.brandDark, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
});
