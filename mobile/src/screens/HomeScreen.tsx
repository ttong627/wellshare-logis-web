import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { PARTNER_REGIONS, MEMBERS, COLORS } from '../constants';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export default function HomeScreen() {
  const { isAdmin, partnerCompany } = useAuth();
  const {
    currentMonth, setCurrentMonth, savedMonths,
    partnerInputs, deliveryDates, publishDates, publishRequests,
    isClosed, isLoading,
  } = useData();
  const navigation = useNavigation<any>();

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
      {/* 헤더 */}
      <View style={styles.headerCard}>
        <Text style={styles.greeting}>{isAdmin ? '관리자' : (partnerCompany || '')}</Text>
        <Text style={styles.monthLabel}>{formattedMonth} 업무 현황</Text>
        {isClosed && (
          <View style={styles.closedBadge}>
            <Feather name="lock" size={12} color={COLORS.white} />
            <Text style={styles.closedText}>이번 달 마감 완료</Text>
          </View>
        )}
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
              { icon: 'truck' as FeatherName, label: '배송', to: 'Delivery' },
              { icon: 'file-text' as FeatherName, label: '계산서', to: 'Billing' },
              { icon: 'credit-card' as FeatherName, label: '정산', to: 'Settlement' },
            ]
          : [
              { icon: 'edit-3' as FeatherName, label: '실적입력', to: 'Performance' },
              { icon: 'truck' as FeatherName, label: '배송완료', to: 'Delivery' },
              { icon: 'list' as FeatherName, label: '내역확인', to: 'Statement' },
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
  headerCard: { backgroundColor: COLORS.primary, borderRadius: 20, padding: 22, gap: 4 },
  greeting: { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  monthLabel: { color: '#bae6fd', fontSize: 13, fontWeight: '600' },
  closedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#00000030',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8,
  },
  closedText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
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
