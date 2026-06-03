import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
interface MenuItem { key: string; label: string; icon: FeatherName; route?: string }

const ADMIN_MENU: MenuItem[] = [
  { key: 'performance', label: '지역 포수', icon: 'edit-3', route: 'Performance' },
  { key: 'payment', label: '결제 내역', icon: 'credit-card', route: 'Payment' },
  { key: 'statement', label: '내역 확인', icon: 'list', route: 'Statement' },
  { key: 'schedule', label: '배송 일정', icon: 'calendar', route: 'Schedule' },
  { key: 'contacts', label: '주소록', icon: 'book-open', route: 'Contacts' },
  { key: 'users', label: '사용자 관리', icon: 'users', route: 'Users' },
  { key: 'docs', label: '공문 작성', icon: 'file-text' },
  { key: 'prices', label: '단가 설정', icon: 'tag' },
  { key: 'backup', label: '백업', icon: 'database' },
];

const PARTNER_MENU: MenuItem[] = [
  { key: 'schedule', label: '배송 일정', icon: 'calendar', route: 'Schedule' },
  { key: 'contacts', label: '주소록', icon: 'book-open', route: 'Contacts' },
];

export default function MoreScreen() {
  const { user, isAdmin, partnerCompany, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const menu = isAdmin ? ADMIN_MENU : PARTNER_MENU;
  const roleLabel = isAdmin ? '관리자' : (partnerCompany ?? '파트너');
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const handleSignOut = () => {
    Alert.alert('로그아웃', '로그아웃하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 계정 카드 */}
      <View style={styles.account}>
        <View style={styles.avatar}>
          <Feather name="user" size={24} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.email} numberOfLines={1}>{user?.email ?? ''}</Text>
          <View style={styles.roleBadge}>
            <Feather name={isAdmin ? 'shield' : 'briefcase'} size={12} color={COLORS.brandDark} />
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
        </View>
      </View>

      {/* 설정 — 알림음·진동 */}
      <Text style={styles.section}>설정</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => navigation.navigate('NotificationSettings')}
          style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="알림 설정"
        >
          <View style={styles.menuIcon}><Feather name="bell" size={18} color={COLORS.brand} /></View>
          <Text style={styles.menuLabel}>알림 설정</Text>
          <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
        </Pressable>
      </View>

      {/* 기능 메뉴 */}
      <Text style={[styles.section, styles.sectionGap]}>기능</Text>
      <View style={styles.card}>
        {menu.map((m, i) => (
          <Pressable
            key={m.key}
            onPress={() => m.route
              ? navigation.navigate(m.route)
              : Alert.alert(m.label, '다음 업데이트에서 제공 예정입니다.')}
            style={({ pressed }) => [styles.menuRow, i > 0 && styles.divider, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={m.label}
          >
            <View style={styles.menuIcon}><Feather name={m.icon} size={18} color={COLORS.brand} /></View>
            <Text style={styles.menuLabel}>{m.label}</Text>
            <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
          </Pressable>
        ))}
      </View>

      {/* 로그아웃 — 위험 동작, 분리 배치 */}
      <Pressable
        onPress={handleSignOut}
        style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="로그아웃"
      >
        <Feather name="log-out" size={18} color={COLORS.danger} />
        <Text style={styles.logoutText}>로그아웃</Text>
      </Pressable>

      <Text style={styles.version}>버전 {version}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  account: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 24,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  email: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: COLORS.infoLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  roleText: { fontSize: 12, fontWeight: '800', color: COLORS.brandDark },
  section: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, marginBottom: 8, marginLeft: 4 },
  sectionGap: { marginTop: 24 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 15, minHeight: 52 },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  menuIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  pressed: { opacity: 0.6 },
  logout: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.dangerLight, borderRadius: 14, paddingVertical: 15, marginTop: 24,
  },
  logoutText: { fontSize: 15, fontWeight: '800', color: COLORS.danger },
  version: { textAlign: 'center', color: COLORS.textMuted, fontSize: 12, marginTop: 20, fontWeight: '600' },
});
