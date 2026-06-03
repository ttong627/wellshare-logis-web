import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { SettingsProvider } from './src/context/SettingsContext';
import AppNavigator from './src/navigation';
import { useOtaUpdate } from './src/hooks/useOtaUpdate';
import AppErrorBoundary from './src/components/AppErrorBoundary';

export default function App() {
  useOtaUpdate(); // 백그라운드 OTA 체크(다음 실행에 적용)

  return (
    <AppErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <DataProvider>
            <StatusBar style="light" />
            <AppNavigator />
          </DataProvider>
        </AuthProvider>
      </SettingsProvider>
    </AppErrorBoundary>
  );
}
