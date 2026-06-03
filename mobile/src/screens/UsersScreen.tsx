import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { MEMBERS, COLORS } from '../constants';
import { useAuth } from '../context/AuthContext';

// 역할 선택지: 회원사 각각 + '관리자'(저장값 'ADMIN'). 웹 UsersTab과 동일 의미.
const ADMIN_ROLE = 'ADMIN';
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: ADMIN_ROLE, label: '관리자' },
  ...MEMBERS.map((m) => ({ value: m, label: m })),
];
const roleLabel = (value: string): string =>
  value === ADMIN_ROLE ? '관리자' : value;

const SETTINGS_DOC = () =>
  doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings');

export default function UsersScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // partnerAccounts: Record<email, 회사명|'ADMIN'>, pendingUsers: 승인대기 이메일[]
  const [partnerAccounts, setPartnerAccounts] = useState<Record<string, string>>({});
  const [pendingUsers, setPendingUsers] = useState<string[]>([]);
  // per-email 역할 선택 상태(승인 대기 / 권한 변경 공용). 기본값은 첫 회원사.
  const [roleByEmail, setRoleByEmail] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const snap = await getDoc(SETTINGS_DOC());
      const data = snap.exists() ? snap.data() : {};
      setPartnerAccounts((data?.partnerAccounts as Record<string, string>) || {});
      setPendingUsers((data?.pendingUsers as string[]) || []);
    } catch (e) {
      console.error('사용자 설정 조회 실패:', e);
      Alert.alert('불러오기 실패', '사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => { await load(); if (alive) setLoading(false); })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // 이미 승인된 이메일은 대기 목록에서 제외(웹과 동일)
  const validPending = useMemo(
    () => pendingUsers.filter((e) => !partnerAccounts[e]),
    [pendingUsers, partnerAccounts],
  );
  const approvedEntries = useMemo(
    () => Object.entries(partnerAccounts),
    [partnerAccounts],
  );

  const pickedRole = (email: string): string =>
    roleByEmail[email] ?? MEMBERS[0];
  const setRole = (email: string, value: string) =>
    setRoleByEmail((prev) => ({ ...prev, [email]: value }));

  // 승인: partnerAccounts에 추가 + pendingUsers에서 제거
  const handleApprove = async (email: string) => {
    if (saving) return;
    const role = pickedRole(email);
    const updated = { ...partnerAccounts, [email]: role };
    const filtered = pendingUsers.filter((e) => e !== email);
    setSaving(true);
    try {
      await setDoc(SETTINGS_DOC(), {
        partnerAccounts: updated,
        pendingUsers: filtered,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setPartnerAccounts(updated);
      setPendingUsers(filtered);
      Alert.alert('승인 완료', `${email}\n역할: ${roleLabel(role)}`);
    } catch (e) {
      console.error('승인 실패:', e);
      Alert.alert('승인 실패', '저장 중 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  // 거절: pendingUsers에서만 제거(권한 부여 안 함)
  const handleReject = (email: string) => {
    Alert.alert('가입 거절', `${email}\n이 가입 요청을 거절할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '거절',
        style: 'destructive',
        onPress: async () => {
          if (saving) return;
          const filtered = pendingUsers.filter((e) => e !== email);
          setSaving(true);
          try {
            await setDoc(SETTINGS_DOC(), {
              pendingUsers: filtered,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
            setPendingUsers(filtered);
            Alert.alert('거절 완료', `${email} 요청을 삭제했습니다.`);
          } catch (e) {
            console.error('거절 실패:', e);
            Alert.alert('거절 실패', '저장 중 문제가 발생했습니다. 다시 시도해주세요.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  // 권한 변경: 선택한 역할로 partnerAccounts[email] 갱신
  const handleChangeRole = async (email: string) => {
    if (saving) return;
    const role = pickedRole(email);
    if (partnerAccounts[email] === role) {
      Alert.alert('변경 없음', `이미 '${roleLabel(role)}' 역할입니다.`);
      return;
    }
    const updated = { ...partnerAccounts, [email]: role };
    setSaving(true);
    try {
      await setDoc(SETTINGS_DOC(), {
        partnerAccounts: updated,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setPartnerAccounts(updated);
      Alert.alert('권한 변경 완료', `${email}\n역할: ${roleLabel(role)}`);
    } catch (e) {
      console.error('권한 변경 실패:', e);
      Alert.alert('변경 실패', '저장 중 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  // 삭제: partnerAccounts에서 제거(불변성 — 새 객체 생성 후 키 제거)
  const handleRemove = (email: string) => {
    Alert.alert('권한 삭제', `${email}\n이 계정의 권한을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (saving) return;
          const updated = { ...partnerAccounts };
          delete updated[email];
          setSaving(true);
          try {
            await setDoc(SETTINGS_DOC(), {
              partnerAccounts: updated,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
            setPartnerAccounts(updated);
            Alert.alert('삭제 완료', `${email} 권한을 삭제했습니다.`);
          } catch (e) {
            console.error('삭제 실패:', e);
            Alert.alert('삭제 실패', '저장 중 문제가 발생했습니다. 다시 시도해주세요.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>사용자 정보를 불러오는 중…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.brand]} tintColor={COLORS.brand} />}>
      {/* 헤더 카드 */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="users" size={22} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>사용자 관리</Text>
          <Text style={styles.headerSub}>계정 승인 · 권한 지정</Text>
        </View>
      </View>

      {/* 승인 대기 섹션 */}
      <View style={styles.sectionHead}>
        <Feather name="user-plus" size={15} color={COLORS.warning} />
        <Text style={styles.sectionTitle}>승인 대기</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{validPending.length}</Text>
        </View>
      </View>

      {validPending.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="check-circle" size={18} color={COLORS.success} />
          <Text style={styles.emptyText}>대기 중인 신규 가입자가 없습니다.</Text>
        </View>
      ) : (
        validPending.map((email) => (
          <View key={email} style={styles.card}>
            <View style={styles.cardTop}>
              <Feather name="mail" size={15} color={COLORS.brand} />
              <Text style={styles.email} numberOfLines={1}>{email}</Text>
            </View>

            <Text style={styles.fieldLabel}>역할 선택</Text>
            <RoleChips
              selected={pickedRole(email)}
              onSelect={(v) => setRole(email, v)}
            />

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => handleApprove(email)}
                disabled={saving}
                style={({ pressed }) => [styles.btn, styles.btnPrimary, (pressed || saving) && styles.btnDim]}
                accessibilityRole="button"
                accessibilityLabel={`${email} 승인`}
              >
                <Feather name="check" size={16} color={COLORS.white} />
                <Text style={styles.btnPrimaryText}>승인</Text>
              </Pressable>
              <Pressable
                onPress={() => handleReject(email)}
                disabled={saving}
                style={({ pressed }) => [styles.btn, styles.btnGhost, (pressed || saving) && styles.btnDim]}
                accessibilityRole="button"
                accessibilityLabel={`${email} 거절`}
              >
                <Feather name="x" size={16} color={COLORS.textMuted} />
                <Text style={styles.btnGhostText}>거절</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {/* 승인된 계정 섹션 */}
      <View style={[styles.sectionHead, styles.sectionGap]}>
        <Feather name="shield" size={15} color={COLORS.brand} />
        <Text style={styles.sectionTitle}>승인된 계정</Text>
        <View style={[styles.countBadge, styles.countBadgeBrand]}>
          <Text style={styles.countText}>{approvedEntries.length}</Text>
        </View>
      </View>

      {approvedEntries.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={18} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>등록된 계정이 없습니다.</Text>
        </View>
      ) : (
        approvedEntries.map(([email, role]) => {
          const isAdminRole = role === ADMIN_ROLE;
          return (
            <View key={email} style={styles.card}>
              <View style={styles.cardTop}>
                <Feather name="mail" size={15} color={COLORS.brand} />
                <Text style={styles.email} numberOfLines={1}>{email}</Text>
              </View>

              <View style={[styles.roleBadge, isAdminRole ? styles.roleBadgeAdmin : styles.roleBadgePartner]}>
                <Feather
                  name={isAdminRole ? 'shield' : 'briefcase'}
                  size={12}
                  color={isAdminRole ? COLORS.warning : COLORS.brandDark}
                />
                <Text style={[styles.roleBadgeText, { color: isAdminRole ? COLORS.warning : COLORS.brandDark }]}>
                  {roleLabel(role)}
                </Text>
              </View>

              <Text style={styles.fieldLabel}>권한 변경</Text>
              <RoleChips
                selected={roleByEmail[email] ?? role}
                onSelect={(v) => setRole(email, v)}
              />

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => handleChangeRole(email)}
                  disabled={saving}
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, (pressed || saving) && styles.btnDim]}
                  accessibilityRole="button"
                  accessibilityLabel={`${email} 권한 변경`}
                >
                  <Feather name="save" size={16} color={COLORS.white} />
                  <Text style={styles.btnPrimaryText}>권한 변경</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleRemove(email)}
                  disabled={saving}
                  style={({ pressed }) => [styles.btn, styles.btnDanger, (pressed || saving) && styles.btnDim]}
                  accessibilityRole="button"
                  accessibilityLabel={`${email} 삭제`}
                >
                  <Feather name="trash-2" size={16} color={COLORS.danger} />
                  <Text style={styles.btnDangerText}>삭제</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      <Text style={styles.footNote}>
        {user?.email ? `${user.email} (관리자)` : '관리자'} · 변경 사항은 즉시 저장됩니다.
      </Text>
    </ScrollView>
  );
}

// 가로 스크롤 역할 칩. 선택된 역할은 브랜드색으로 강조. 터치 44pt 보장.
function RoleChips({ selected, onSelect }: {
  selected: string; onSelect: (value: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {ROLE_OPTIONS.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`역할 ${opt.label}${active ? ' 선택됨' : ''}`}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.primary, borderRadius: 16, padding: 18, marginBottom: 22,
  },
  headerIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 19, fontWeight: '900', color: COLORS.white },
  headerSub: { fontSize: 13, fontWeight: '700', color: COLORS.accentLight, marginTop: 3 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, marginLeft: 2 },
  sectionGap: { marginTop: 26 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: COLORS.text },
  countBadge: {
    minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: 11,
    backgroundColor: COLORS.warningLight, alignItems: 'center', justifyContent: 'center',
  },
  countBadgeBrand: { backgroundColor: COLORS.infoLight },
  countText: { fontSize: 12, fontWeight: '900', color: COLORS.text },

  empty: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 22, paddingHorizontal: 16,
  },
  emptyText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  email: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.text },

  fieldLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 8 },

  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 14,
  },
  roleBadgeAdmin: { backgroundColor: COLORS.warningLight },
  roleBadgePartner: { backgroundColor: COLORS.infoLight },
  roleBadgeText: { fontSize: 12, fontWeight: '800' },

  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  chip: {
    minHeight: 44, paddingHorizontal: 14, justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt,
  },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted },
  chipTextActive: { color: COLORS.white },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: {
    flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 12, paddingHorizontal: 12,
  },
  btnDim: { opacity: 0.6 },
  btnPrimary: { backgroundColor: COLORS.brand },
  btnPrimaryText: { fontSize: 14, fontWeight: '900', color: COLORS.white },
  btnGhost: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { fontSize: 14, fontWeight: '900', color: COLORS.textMuted },
  btnDanger: { backgroundColor: COLORS.dangerLight },
  btnDangerText: { fontSize: 14, fontWeight: '900', color: COLORS.danger },

  footNote: { textAlign: 'center', color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 22 },
});
