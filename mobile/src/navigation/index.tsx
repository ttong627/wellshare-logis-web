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
import PerformanceScreen from '../screens/PerformanceScreen';
import DeliveryScreen from '../screens/DeliveryScreen';
import BillingScreen from '../screens/BillingScreen';
import MoreScreen from '../screens/MoreScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import StatementScreen from '../screens/StatementScreen';
import { SettlementScreen } from '../screens/PlaceholderScreen';

export type RootStackParamList = { Login: undefined; Main: undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();
const MoreStackNav = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// 벡터 아이콘(이모지 금지) — Feather 24pt 통일
type FeatherName = React.ComponentProps<typeof Feather>['name'];

function tabIcon(name: FeatherName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Feather name={name} size={focused ? 24 : 22} color={color} />
  );
}

const tabScreenOptions = {
  tabBarActiveTintColor: COLORS.brand,
  tabBarInactiveTintColor: COLORS.textMuted,
  tabBarStyle: {
    backgroundColor: COLORS.card,
    borderTopColor: COLORS.border,
    paddingBottom: 8,
    paddingTop: 6,
    height: 64,
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const, marginBottom: 4 },
  headerStyle: { backgroundColor: COLORS.primary },
  headerTintColor: COLORS.white,
  headerTitleStyle: { fontWeight: '800' as const },
};

// 더보기 탭 내부 스택: 더보기 홈 + 알림 설정 (향후 관리자 기능 화면도 여기에 push)
function MoreStack() {
  return (
    <MoreStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <MoreStackNav.Screen name="MoreHome" component={MoreScreen} options={{ title: '더보기' }} />
      <MoreStackNav.Screen name="NotificationSettings" component={NotificationSettingsScreen}
        options={{ title: '알림 설정' }} />
    </MoreStackNav.Navigator>
  );
}

// 파트너(협동조합) 하단탭: 홈·실적입력·배송완료·내역확인·더보기
function PartnerTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ title: '홈', headerTitle: '웰쉐어 나라미', tabBarIcon: tabIcon('home') }} />
      <Tab.Screen name="Performance" component={PerformanceScreen}
        options={{ title: '실적입력', headerTitle: '실적 입력', tabBarIcon: tabIcon('edit-3') }} />
      <Tab.Screen name="Delivery" component={DeliveryScreen}
        options={{ title: '배송완료', headerTitle: '배송 완료 체크', tabBarIcon: tabIcon('truck') }} />
      <Tab.Screen name="Statement" component={StatementScreen}
        options={{ title: '내역확인', headerTitle: '정산 내역', tabBarIcon: tabIcon('list') }} />
      <Tab.Screen name="More" component={MoreStack}
        options={{ title: '더보기', headerShown: false, tabBarIcon: tabIcon('grid') }} />
    </Tab.Navigator>
  );
}

// 관리자 하단탭: 홈·배송·계산서·정산·더보기
function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ title: '홈', headerTitle: '웰쉐어 나라미 · 관리', tabBarIcon: tabIcon('home') }} />
      <Tab.Screen name="Delivery" component={DeliveryScreen}
        options={{ title: '배송', headerTitle: '배송 관리', tabBarIcon: tabIcon('truck') }} />
      <Tab.Screen name="Billing" component={BillingScreen}
        options={{ title: '계산서', headerTitle: '계산서 발급 · ECOUNT', tabBarIcon: tabIcon('file-text') }} />
      <Tab.Screen name="Settlement" component={SettlementScreen}
        options={{ title: '정산', headerTitle: '정산 · 결제', tabBarIcon: tabIcon('credit-card') }} />
      <Tab.Screen name="More" component={MoreStack}
        options={{ title: '더보기', headerShown: false, tabBarIcon: tabIcon('grid') }} />
    </Tab.Navigator>
  );
}

function CenterScreen({ icon, title, desc, children }: {
  icon: FeatherName; title: string; desc: string; children?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={36} color={COLORS.brand} />
      </View>
      <Text style={styles.centerTitle}>{title}</Text>
      <Text style={styles.centerDesc}>{desc}</Text>
      {children}
    </View>
  );
}

// 인증O·역할X → 승인 대기 안내 + 로그아웃
function NoRoleScreen() {
  const { user, signOut } = useAuth();
  return (
    <CenterScreen icon="clock" title="승인 대기 중"
      desc={`${user?.email ?? ''} 계정은 아직 승인되지 않았습니다.\n관리자에게 계정 승인을 요청해 주세요.`}>
      <Text style={styles.link} onPress={signOut}>로그아웃</Text>
    </CenterScreen>
  );
}

export default function AppNavigator() {
  const { user, isAdmin, partnerCompany, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.splash}>웰쉐어 나라미</Text>
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
  iconCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.infoLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  centerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginBottom: 10 },
  centerDesc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 24, fontWeight: '600' },
  link: { color: COLORS.brand, fontWeight: '800', fontSize: 15, paddingVertical: 12, paddingHorizontal: 24 },
});
