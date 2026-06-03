import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import OrdersScreen from '../screens/OrdersScreen';
import PerformanceScreen from '../screens/PerformanceScreen';
import DeliveryScreen from '../screens/DeliveryScreen';
import BillingScreen from '../screens/BillingScreen';
import PaymentScreen from '../screens/PaymentScreen';
import StatementScreen from '../screens/StatementScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import ContactsScreen from '../screens/ContactsScreen';
import UsersScreen from '../screens/UsersScreen';
import MoreScreen from '../screens/MoreScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';

export type RootStackParamList = { Login: undefined; Main: undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();
const MoreStackNav = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

type FeatherName = React.ComponentProps<typeof Feather>['name'];

function tabIcon(name: FeatherName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Feather name={name} size={focused ? 24 : 22} color={color} />
  );
}

const tabScreenOptions = {
  tabBarActiveTintColor: COLORS.brand,
  tabBarInactiveTintColor: COLORS.textMuted,
  tabBarStyle: { backgroundColor: COLORS.card, borderTopColor: COLORS.border, paddingBottom: 8, paddingTop: 6, height: 64 },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const, marginBottom: 4 },
  headerStyle: { backgroundColor: COLORS.primary },
  headerTintColor: COLORS.white,
  headerTitleStyle: { fontWeight: '800' as const },
};

const moreStackOptions = {
  headerStyle: { backgroundColor: COLORS.primary },
  headerTintColor: COLORS.white,
  headerTitleStyle: { fontWeight: '800' as const },
};

// 더보기 스택 — 더보기 홈 + 7메뉴 중 탭에 없는 화면들 + 설정
function MoreStack() {
  return (
    <MoreStackNav.Navigator screenOptions={moreStackOptions}>
      <MoreStackNav.Screen name="MoreHome" component={MoreScreen} options={{ title: '더보기' }} />
      <MoreStackNav.Screen name="Orders" component={OrdersScreen} options={{ title: '포수 입력' }} />
      <MoreStackNav.Screen name="Performance" component={PerformanceScreen} options={{ title: '지역 포수' }} />
      <MoreStackNav.Screen name="Payment" component={PaymentScreen} options={{ title: '결제 내역' }} />
      <MoreStackNav.Screen name="Statement" component={StatementScreen} options={{ title: '내역 확인' }} />
      <MoreStackNav.Screen name="Schedule" component={ScheduleScreen} options={{ title: '배송 일정' }} />
      <MoreStackNav.Screen name="Contacts" component={ContactsScreen} options={{ title: '주소록' }} />
      <MoreStackNav.Screen name="Users" component={UsersScreen} options={{ title: '사용자 관리' }} />
      <MoreStackNav.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: '알림 설정' }} />
    </MoreStackNav.Navigator>
  );
}

// 관리자 하단탭: 홈·포수입력·배송완료·계산서·더보기
function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: '홈', headerShown: false, tabBarIcon: tabIcon('home') }} />
      <Tab.Screen name="OrdersTab" component={OrdersScreen} options={{ title: '포수입력', headerTitle: '포수 입력', tabBarIcon: tabIcon('clipboard') }} />
      <Tab.Screen name="DeliveryTab" component={DeliveryScreen} options={{ title: '배송완료', headerTitle: '배송 완료', tabBarIcon: tabIcon('truck') }} />
      <Tab.Screen name="BillingTab" component={BillingScreen} options={{ title: '계산서', headerTitle: '계산서 발급 · ECOUNT', tabBarIcon: tabIcon('file-text') }} />
      <Tab.Screen name="More" component={MoreStack} options={{ title: '더보기', headerShown: false, tabBarIcon: tabIcon('grid') }} />
    </Tab.Navigator>
  );
}

// 파트너 하단탭: 홈·지역포수·배송완료·내역확인·더보기
function PartnerTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: '홈', headerShown: false, tabBarIcon: tabIcon('home') }} />
      <Tab.Screen name="PerformanceTab" component={PerformanceScreen} options={{ title: '지역포수', headerTitle: '지역 포수 입력', tabBarIcon: tabIcon('edit-3') }} />
      <Tab.Screen name="DeliveryTab" component={DeliveryScreen} options={{ title: '배송완료', headerTitle: '배송 완료', tabBarIcon: tabIcon('truck') }} />
      <Tab.Screen name="StatementTab" component={StatementScreen} options={{ title: '내역확인', headerTitle: '정산 내역', tabBarIcon: tabIcon('list') }} />
      <Tab.Screen name="More" component={MoreStack} options={{ title: '더보기', headerShown: false, tabBarIcon: tabIcon('grid') }} />
    </Tab.Navigator>
  );
}

function NoRoleScreen() {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.center}>
      <View style={styles.iconCircle}><Feather name="clock" size={36} color={COLORS.brand} /></View>
      <Text style={styles.centerTitle}>승인 대기 중</Text>
      <Text style={styles.centerDesc}>{`${user?.email ?? ''} 계정은 아직 승인되지 않았습니다.\n관리자에게 계정 승인을 요청해 주세요.`}</Text>
      <Text style={styles.link} onPress={signOut}>로그아웃</Text>
    </View>
  );
}

export default function AppNavigator() {
  const { user, isAdmin, partnerCompany, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.splash}>정부양곡정산</Text>
      </View>
    );
  }

  const hasRole = isAdmin || !!partnerCompany;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !hasRole ? (
          <Stack.Screen name="Main" component={NoRoleScreen} />
        ) : (
          <Stack.Screen name="Main" component={isAdmin ? AdminTabs : PartnerTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 32 },
  splash: { marginTop: 16, color: COLORS.brandDark, fontWeight: '800', fontSize: 16 },
  iconCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.infoLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  centerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginBottom: 10 },
  centerDesc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 24, fontWeight: '600' },
  link: { color: COLORS.brand, fontWeight: '800', fontSize: 15, paddingVertical: 12, paddingHorizontal: 24 },
});
