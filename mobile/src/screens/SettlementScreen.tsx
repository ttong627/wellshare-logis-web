import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { COLORS, MEMBERS, PARTNER_REGIONS } from '../constants';
import StatusBadge, { BadgeStatus } from '../components/StatusBadge';

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  const mNum = Number(m);
  if (!y || !Number.isFinite(mNum)) return month;
  return `${y}년 ${mNum}월`;
}

// 한 지역의 계산서 발행 상태 + 발행일 파생(순수 계산).
function invoiceState(date?: string, requested?: string): { status: BadgeStatus; date?: string } {
  if (date) return { status: 'done', date };
  if (requested) return { status: 'requested' };
  return { status: 'wait' };
}

export default function SettlementScreen() {
  const { currentMonth, publishDates, publishRequests, isLoading } = useData();
  const { isAdmin, partnerCompany } = useAuth();

  // 관리자는 전체 회원사, 파트너는 자기 회사만(파트너도 자기 발행현황 열람 가능).
  const companies = isAdmin ? MEMBERS : partnerCompany ? [partnerCompany] : [];

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>정산 현황을 불러오는 중…</Text>
      </View>
    );
  }

  // 전체 집계
  let issued = 0, requested = 0, total = 0;
  companies.forEach((c) => {
    (PARTNER_REGIONS[c] || []).forEach((r) => {
      total += 1;
      if (publishDates[c]?.[r]) issued += 1;
      else if (publishRequests[c]?.[r]) requested += 1;
    });
  });
  const pending = total - issued - requested;

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="credit-card" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerMonth}>{formatMonth(currentMonth)}</Text>
          <Text style={styles.headerSub}>계산서 발행 · 정산 현황</Text>
        </View>
      </View>

      {/* 전체 집계 */}
      <View style={styles.kpiRow}>
        <KpiBox label="발행완료" value={issued} color={COLORS.success} icon="check-circle" />
        <KpiBox label="발행대기" value={requested} color={COLORS.warning} icon="alert-circle" />
        <KpiBox label="미요청" value={pending} color={COLORS.textMuted} icon="clock" />
      </View>

      {companies.map((c) => {
        const regions = PARTNER_REGIONS[c] || [];
        if (regions.length === 0) return null;
        const cIssued = regions.filter((r) => publishDates[c]?.[r]).length;
        return (
          <View key={c} style={styles.section}>
            <View style={styles.companyHead}>
              <Text style={styles.companyTitle} numberOfLines={1}>{c}</Text>
              <Text style={styles.companyCount}>발행 {cIssued}/{regions.length}</Text>
            </View>
            {regions.map((r) => {
              const st = invoiceState(publishDates[c]?.[r], publishRequests[c]?.[r]);
              return (
                <View key={r} style={styles.regionRow}>
                  <Text style={styles.regionName} numberOfLines={1}>{r}</Text>
                  {st.date ? <Text style={styles.issueDate}>{st.date}</Text> : null}
                  <StatusBadge status={st.status} />
                </View>
              );
            })}
          </View>
        );
      })}

      <View style={styles.notice}>
        <Feather name="info" size={13} color={COLORS.textMuted} />
        <Text style={styles.noticeText}>금액·결제 상세 및 ECOUNT 전송은 웹 관리자에서 진행합니다.</Text>
      </View>
    </ScrollView>
  );
}

function KpiBox({ label, value, color, icon }: {
  label: string; value: number; color: string; icon: React.ComponentProps<typeof Feather>['name'];
}) {
  return (
    <View style={[styles.kpiBox, { borderTopColor: color }]}>
      <Feather name={icon} size={15} color={color} />
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  loadingBox: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 14,
  },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  headerMonth: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },

  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiBox: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14,
    borderTopWidth: 3, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 4,
  },
  kpiValue: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },

  section: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  companyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  companyTitle: { fontSize: 14, fontWeight: '900', color: COLORS.brandDark, flex: 1, marginRight: 8 },
  companyCount: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  regionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  regionName: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  issueDate: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },

  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6, paddingHorizontal: 16 },
  noticeText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
});
