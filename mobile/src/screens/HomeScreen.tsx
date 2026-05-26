import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { PARTNER_REGIONS, COLORS } from '../constants';

export default function HomeScreen() {
  const { user, isAdmin, partnerCompany, signOut } = useAuth();
  const { currentMonth, setCurrentMonth, savedMonths, partnerInputs, deliveryDates, publishDates, publishRequests, isClosed, isLoading } = useData();

  const assignedRegions = partnerCompany ? (PARTNER_REGIONS[partnerCompany] || []) : [];

  const submittedCount = assignedRegions.filter(r => {
    const d = partnerInputs[partnerCompany || '']?.[r] || {};
    return (d.basicQty !== undefined && d.basicQty !== '') || (d.povertyQty !== undefined && d.povertyQty !== '');
  }).length;

  const deliveredCount = assignedRegions.filter(r =>
    !!deliveryDates[partnerCompany || '']?.[r]?.date
  ).length;

  const issuedCount = assignedRegions.filter(r =>
    !!publishDates[partnerCompany || '']?.[r]
  ).length;

  const reqCount = assignedRegions.filter(r =>
    !!publishRequests[partnerCompany || '']?.[r]
  ).length;

  const [yr, mo] = currentMonth.split('-');
  const formattedMonth = `${yr}년 ${parseInt(mo, 10)}월`;

  const handleSignOut = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: signOut },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>데이터 로딩 중...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header card */}
      <View style={styles.headerCard}>
        <Text style={styles.greeting}>
          {isAdmin ? '관리자' : (partnerCompany || user?.email || '')}
        </Text>
        <Text style={styles.monthLabel}>{formattedMonth} 업무 현황</Text>
        {isClosed && (
          <View style={styles.closedBadge}>
            <Text style={styles.closedText}>🔒 이번 달 마감 완료</Text>
          </View>
        )}
      </View>

      {/* Month selector */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>조회 월 선택</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
          {savedMonths.slice(0, 6).map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => setCurrentMonth(m)}
              style={[styles.monthChip, m === currentMonth && styles.monthChipActive]}
            >
              <Text style={[styles.monthChipText, m === currentMonth && styles.monthChipTextActive]}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Status cards (partner only) */}
      {partnerCompany && (
        <View style={styles.statsGrid}>
          <StatCard
            label="실적 입력"
            value={`${submittedCount}/${assignedRegions.length}`}
            sub="지역 완료"
            color={submittedCount === assignedRegions.length ? COLORS.accent : COLORS.warning}
          />
          <StatCard
            label="배송 완료"
            value={`${deliveredCount}/${assignedRegions.length}`}
            sub="지역 완료"
            color={deliveredCount === assignedRegions.length ? COLORS.accent : COLORS.warning}
          />
          <StatCard
            label="계산서 발급"
            value={`${issuedCount}/${reqCount}`}
            sub="발급 완료"
            color={reqCount > 0 && issuedCount === reqCount ? COLORS.accent : COLORS.info}
          />
        </View>
      )}

      {/* Admin notice */}
      {isAdmin && (
        <View style={[styles.sectionCard, { backgroundColor: COLORS.infoLight }]}>
          <Text style={[styles.sectionTitle, { color: COLORS.info }]}>관리자 모드</Text>
          <Text style={styles.adminNotice}>
            모든 회원사 데이터를 조회합니다.{'\n'}
            상세 작업은 웹 버전을 이용해주세요.
          </Text>
        </View>
      )}

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>로그아웃</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontWeight: '600' },
  headerCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 24,
    gap: 4,
  },
  greeting: { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  monthLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  closedBadge: {
    backgroundColor: '#ef444430',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  closedText: { color: '#fca5a5', fontSize: 12, fontWeight: '700' },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  monthScroll: { marginTop: 4 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  monthChipText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  monthChipTextActive: { color: COLORS.white },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderTopWidth: 3,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  statValue: { fontSize: 20, fontWeight: '900' },
  statSub: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  adminNotice: { color: COLORS.info, fontSize: 13, fontWeight: '600', lineHeight: 20 },
  signOutBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  signOutText: { color: COLORS.danger, fontWeight: '700', fontSize: 15 },
});
