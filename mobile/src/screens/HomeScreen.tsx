import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useNotifications } from '../hooks/useNotifications';
import { PARTNER_REGIONS, MEMBERS, COLORS } from '../constants';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export default function HomeScreen() {
  const { isAdmin, partnerCompany } = useAuth();
  const {
    currentMonth, setCurrentMonth, savedMonths,
    partnerInputs, deliveryDates, publishDates, publishRequests,
    isClosed, isLoading, setClosed,
  } = useData();
  const navigation = useNavigation<any>();
  const { unread } = useNotifications();
  const goToNotifications = () => navigation.navigate('More', { screen: 'Notifications' });

  const handleToggleClose = () => {
    const next = !isClosed;
    Alert.alert(
      next ? '월 마감' : '마감 취소',
      next ? `${currentMonth} 작업을 마감할까요?\n마감하면 파트너 입력이 잠깁니다.` : `${currentMonth} 마감을 취소할까요?`,
      [{ text: '취소', style: 'cancel' }, { text: next ? '마감' : '마감취소', onPress: () => setClosed(next) }],
    );
  };

  // ── 상태 판정 헬퍼 ──────────────────────────────
  const hasInput = (c: string, r: string) => {
    const d = partnerInputs[c]?.[r];
    return !!d && ((d.basicQty !== undefined && d.basicQty !== '') ||
      (d.povertyQty !== undefined && d.povertyQty !== ''));
  };
  const hasDelivery = (c: string, r: string) => !!deliveryDates[c]?.[r]?.date;
  const hasIssued = (c: string, r: string) => !!publishDates[c]?.[r];
  const hasRequested = (c: string, r: string) => !!publishRequests[c]?.[r];

  // ── 집계 대상(회사,지역) 쌍 ─────────────────────
  const pairs: { c: string; r: string }[] = isAdmin
    ? MEMBERS.flatMap((c) => (PARTNER_REGIONS[c] || []).map((r) => ({ c, r })))
    : (PARTNER_REGIONS[partnerCompany || ''] || []).map((r) => ({ c: partnerCompany || '', r }));

  const total = pairs.length;
  const nInput = pairs.filter((p) => hasInput(p.c, p.r)).length;
  const nDeliver = pairs.filter((p) => hasDelivery(p.c, p.r)).length;
  const nIssued = pairs.filter((p) => hasIssued(p.c, p.r)).length;
  const nReq = pairs.filter((p) => hasRequested(p.c, p.r)).length;

  const [yr, mo] = currentMonth.split('-');
  const formattedMonth = `${yr}년 ${parseInt(mo, 10)}월`;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>데이터 로딩 중…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 헤더 — WS 로고 + 브랜드 */}
      <View style={styles.headerCard}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Image source={require('../../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandName}>정부양곡정산</Text>
            <Text style={styles.brandSub}>웰쉐어 · 배송비 정산 포털</Text>
          </View>
          {/* 알림 벨 — 안 읽은 알림 배지 */}
          <Pressable onPress={goToNotifications}
            style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button" accessibilityLabel={`알림 ${unread > 0 ? `안읽음 ${unread}건` : ''}`}>
            <Feather name="bell" size={20} color={COLORS.white} />
            {unread > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <View style={styles.headerDivider} />
        <View style={styles.headerBottom}>
          <View>
            <Text style={styles.greeting}>{isAdmin ? '관리자' : (partnerCompany || '')}</Text>
            <Text style={styles.monthLabel}>{formattedMonth} 업무 현황</Text>
          </View>
          {isAdmin ? (
            <Pressable onPress={handleToggleClose}
              style={({ pressed }) => [styles.closeBtn, isClosed && styles.closeBtnDone, pressed && { opacity: 0.7 }]}
              accessibilityRole="button" accessibilityLabel={isClosed ? '마감 취소' : '월 마감'}>
              <Feather name={isClosed ? 'lock' : 'check-circle'} size={13} color={COLORS.white} />
              <Text style={styles.closedText}>{isClosed ? '마감됨' : '마감하기'}</Text>
            </Pressable>
          ) : isClosed ? (
            <View style={styles.closedBadge}>
              <Feather name="lock" size={12} color={COLORS.white} />
              <Text style={styles.closedText}>마감 완료</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* 월 선택 */}
      {savedMonths.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>조회 월</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
            {savedMonths.slice(0, 8).map((m) => {
              const active = m === currentMonth;
              return (
                <Pressable key={m} onPress={() => setCurrentMonth(m)}
                  style={[styles.monthChip, active && styles.monthChipActive]}>
                  <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>{m}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* KPI */}
      <View style={styles.kpiGrid}>
        <Kpi icon="edit-3" label="실적 입력" value={nInput} total={total}
          done={total > 0 && nInput === total} />
        <Kpi icon="truck" label="배송 완료" value={nDeliver} total={total}
          done={total > 0 && nDeliver === total} />
        <Kpi icon="file-text" label="계산서 발행" value={nIssued} total={isAdmin ? total : Math.max(nReq, nIssued)}
          done={nIssued > 0 && nIssued >= (isAdmin ? total : nReq)} />
      </View>

      {/* 관리자: 회원사별 진행 */}
      {isAdmin && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>회원사별 실적 입력</Text>
          <View style={{ gap: 10, marginTop: 4 }}>
            {MEMBERS.map((c) => {
              const rs = PARTNER_REGIONS[c] || [];
              const done = rs.filter((r) => hasInput(c, r)).length;
              const pct = rs.length ? Math.round((done / rs.length) * 100) : 0;
              return (
                <View key={c}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.companyName} numberOfLines={1}>{c}</Text>
                    <Text style={styles.companyPct}>{done}/{rs.length}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* 빠른 이동 */}
      <Text style={styles.sectionTitle}>빠른 이동</Text>
      <View style={styles.quickGrid}>
        {(isAdmin
          ? [
              { icon: 'clipboard' as FeatherName, label: '포수입력', to: 'OrdersTab' },
              { icon: 'truck' as FeatherName, label: '배송완료', to: 'DeliveryTab' },
              { icon: 'file-text' as FeatherName, label: '계산서', to: 'BillingTab' },
            ]
          : [
              { icon: 'edit-3' as FeatherName, label: '지역포수', to: 'PerformanceTab' },
              { icon: 'truck' as FeatherName, label: '배송완료', to: 'DeliveryTab' },
              { icon: 'list' as FeatherName, label: '내역확인', to: 'StatementTab' },
            ]
        ).map((q) => (
          <Pressable key={q.to} onPress={() => navigation.navigate(q.to)}
            style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel={q.label}>
            <View style={styles.quickIcon}><Feather name={q.icon} size={20} color={COLORS.brand} /></View>
            <Text style={styles.quickLabel}>{q.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Kpi({ icon, label, value, total, done }: {
  icon: FeatherName; label: string; value: number; total: number; done: boolean;
}) {
  const color = done ? COLORS.success : COLORS.brand;
  return (
    <View style={[styles.kpiCard, { borderTopColor: color }]}>
      <Feather name={icon} size={16} color={color} />
      <Text style={styles.kpiValue}>
        {value}<Text style={styles.kpiTotal}>/{total}</Text>
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: COLORS.bg },
  loadingText: { color: COLORS.textMuted, fontWeight: '600' },
  headerCard: {
    backgroundColor: COLORS.primary, borderRadius: 22, padding: 20,
    shadowColor: COLORS.brandDark, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBadge: {
    width: 46, height: 46, borderRadius: 13, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  logoImg: { width: 32, height: 30 },
  bellBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.overlayWhite,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: COLORS.primary,
  },
  bellBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  brandName: { color: COLORS.white, fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  brandSub: { color: '#bae6fd', fontSize: 12, fontWeight: '600', marginTop: 2 },
  headerDivider: { height: 1, backgroundColor: COLORS.overlayWhite, marginVertical: 14 },
  headerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { color: COLORS.white, fontSize: 17, fontWeight: '900' },
  monthLabel: { color: '#bae6fd', fontSize: 13, fontWeight: '600', marginTop: 2 },
  closedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.scrimDark,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  closedText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  closeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.success,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36,
  },
  closeBtnDone: { backgroundColor: COLORS.danger },
  sectionCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5, marginLeft: 2 },
  monthChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.bg,
    marginRight: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  monthChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  monthChipText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  monthChipTextActive: { color: COLORS.white },
  kpiGrid: { flexDirection: 'row', gap: 10 },
  kpiCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 8,
    borderTopWidth: 3, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 4,
  },
  kpiValue: { fontSize: 22, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },
  kpiTotal: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  companyName: { fontSize: 13, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 8 },
  companyPct: { fontSize: 12, fontWeight: '800', color: COLORS.brandDark, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: COLORS.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 999, backgroundColor: COLORS.brand },
  quickGrid: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 16,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 8,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.infoLight,
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  pressed: { opacity: 0.6 },
});
