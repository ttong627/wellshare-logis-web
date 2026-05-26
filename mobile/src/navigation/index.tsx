import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import PerformanceScreen from '../screens/PerformanceScreen';
import DeliveryScreen from '../screens/DeliveryScreen';
import BillingScreen from '../screens/BillingScreen';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Performance: undefined;
  Delivery: undefined;
  Billing: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '🏠', Performance: '📊', Delivery: '🚚', Billing: '🧾',
  };
  return <Text style={{ fontSize: focused ? 22 : 18 }}>{icons[label] || '●'}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.primary,
          borderTopColor: COLORS.primaryLight,
          paddingBottom: 8,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '800' },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: '홈', headerTitle: '웰쉐어 물류 관리' }} />
      <Tab.Screen name="Performance" component={PerformanceScreen} options={{ title: '실적입력', headerTitle: '실적 입력' }} />
      <Tab.Screen name="Delivery" component={DeliveryScreen} options={{ title: '배송완료', headerTitle: '배송 완료 체크' }} />
      <Tab.Screen name="Billing" component={BillingScreen} options={{ title: '계산서', headerTitle: '세금계산서 현황' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
