import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import AppNavigator from './src/navigation';

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </DataProvider>
    </AuthProvider>
  );
}
