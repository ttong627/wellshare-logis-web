import React, { useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { COLORS, PARTNER_REGIONS, MEMBERS } from '../constants';
import StatusBadge, { BadgeStatus } from '../components/StatusBadge';

// 서울 자치구('구')는 violet, 그 외('시' 등 경기)는 emarald 좌측 보더로 시각 구분.
// 색만으로 의미 전달하지 않으므로(배지는 색+아이콘+텍스트) 보더 색은 보조 장치일 뿐이다.
function regionTone(region: string): { border: string; tint: string } {
  const isSeoul = region.includes('구') && !region.includes('시');
  return isSeoul
    ? { border: COLORS.seoul, tint: COLORS.seoulBg }
    : { border: COLORS.gyeonggi, tint: COLORS.gyeonggiBg };
}

// "YYYY-MM" → "YYYY년 M월"
function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  const mNum = Number(m);
  if (!y || !Number.isFinite(mNum)) return month;
  return `${y}년 ${mNum}월`;
}

// 한 회사의 한 지역에 대한 3개 상태를 파생한다(순수 계산, 부수효과 없음).
interface RegionStatus {
  region: string;
  basicQty: number | '';
  povertyQty: number | '';
  performance: BadgeStatus;
  delivery: BadgeStatus;
  invoice: BadgeStatus;
}

const hasValue = (v: number | '' | undefined): boolean => v !== '' && v !== undefined;

interface RegionInputs {
  partnerInputs: Record<string, Record<string, { basicQty: number | ''; povertyQty: number | '' }>>;
  deliveryDates: Record<string, Record<string, { date?: string }>>;
  publishRequests: Record<string, Record<string, string>>;
  publishDates: Record<string, Record<string, string>>;
}

function deriveRegion(company: string, region: string, d: RegionInputs): RegionStatus {
  const input = d.partnerInputs[company]?.[region];
  const basicQty = input?.basicQty ?? '';
  const povertyQty = input?.povertyQty ?? '';

  const performance: BadgeStatus =
    hasValue(basicQty) || hasValue(povertyQty) ? 'progress' : 'wait';

  const delivery: BadgeStatus = d.deliveryDates[company]?.[region]?.date ? 'done' : 'wait';

  const invoice: BadgeStatus = d.publishDates[company]?.[region]
    ? 'done'
    : d.publishRequests[company]?.[region]
    ? 'requested'
    : 'wait';

  return { region, basicQty, povertyQty, performance, delivery, invoice };
}

// 한 회사 분량의 지역 카드 묶음 + 요약 한 줄.
function CompanySection({
  company,
  inputs,
  showCompanyTitle,
}: {
  company: string;
  inputs: RegionInputs;
  showCompanyTitle: boolean;
}) {
  const regions = PARTNER_REGIONS[company] ?? [];
  const rows = useMemo(
    () => regions.map((r) => deriveRegion(company, r, inputs)),
    [company, regions, inputs],
  );

  const total = rows.length;
  const perfDone = rows.filter((r) => r.performance !== 'wait').length;
  const delivDone = rows.filter((r) => r.delivery === 'done').length;
  const invDone = rows.filter((r) => r.invoice === 'done').length;

  if (total === 0) {
    if (!showCompanyTitle) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.companyTitle}>{company}</Text>
        <Text style={styles.emptyHint}>담당 지역이 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {showCompanyTitle && <Text style={styles.companyTitle}>{company}</Text>}

      {/* 요약 한 줄: 실적 n/N · 배송 n/N · 발행 n/N */}
      <View style={styles.summaryRow}>
        <SummaryChip icon="edit-3" label="실적" done={perfDone} total={total} />
        <SummaryChip icon="truck" label="배송" done={delivDone} total={total} />
        <SummaryChip icon="file-text" label="발행" done={invDone} total={total} />
      </View>

      {rows.map((r) => {
        const tone = regionTone(r.region);
        return (
          <View key={r.region} style={[styles.regionCard, { borderLeftColor: tone.border }]}>
            <View style={styles.regionHeader}>
              <Text style={styles.regionName}>{r.region}</Text>
              {(hasValue(r.basicQty) || hasValue(r.povertyQty)) && (
                <View style={styles.qtyRow}>
                  <Text style={styles.qtyText}>
                    기초 {hasValue(r.basicQty) ? r.basicQty : '-'}
                  </Text>
                  <Text style={styles.qtyDivider}>·</Text>
                  <Text style={styles.qtyText}>
                    차상위 {hasValue(r.povertyQty) ? r.povertyQty : '-'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.badgeRow}>
              <View style={styles.badgeCell}>
                <Text style={styles.badgeCaption}>실적</Text>
                <StatusBadge status={r.performance} />
              </View>
              <View style={styles.badgeCell}>
                <Text style={styles.badgeCaption}>배송</Text>
                <StatusBadge status={r.delivery} />
              </View>
              <View style={styles.badgeCell}>
                <Text style={styles.badgeCaption}>계산서</Text>
                <StatusBadge status={r.invoice} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SummaryChip({
  icon,
  label,
  done,
  total,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  done: number;
  total: number;
}) {
  const complete = total > 0 && done === total;
  return (
    <View style={styles.summaryChip}>
      <Feather name={icon} size={13} color={complete ? COLORS.success : COLORS.brand} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryCount, complete && styles.summaryCountDone]}>
        {done}/{total}
      </Text>
    </View>
  );
}

export default function StatementScreen() {
  const { currentMonth, partnerInputs, deliveryDates, publishRequests, publishDates, isLoading } =
    useData();
  const { isAdmin, partnerCompany } = useAuth();

  const inputs: RegionInputs = { partnerInputs, deliveryDates, publishRequests, publishDates };

  // 관리자는 회사명이 없으므로 전체(MEMBERS)를 회사별 섹션으로, 파트너는 자기 회사 한 개만.
  const companies = isAdmin ? MEMBERS : partnerCompany ? [partnerCompany] : [];

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>내역을 불러오는 중…</Text>
      </View>
    );
  }

  const hasAnyRegion = companies.some((c) => (PARTNER_REGIONS[c] ?? []).length > 0);

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 헤더: 이번 달 */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="calendar" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerMonth}>{formatMonth(currentMonth)}</Text>
          <Text style={styles.headerSub}>
            {isAdmin ? '전체 진행 현황' : '내 담당 지역 진행 현황'}
          </Text>
        </View>
      </View>

      {!hasAnyRegion ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="map-pin" size={28} color={COLORS.brand} />
          </View>
          <Text style={styles.emptyTitle}>담당 지역이 없습니다</Text>
          <Text style={styles.emptyDesc}>배정된 지역이 생기면 이곳에 진행 현황이 표시됩니다.</Text>
        </View>
      ) : (
        companies.map((c) => (
          <CompanySection key={c} company={c} inputs={inputs} showCompanyTitle={isAdmin} />
        ))
      )}
    </ScrollView>
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
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  headerMonth: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },

  section: { marginBottom: 8 },
  companyTitle: { fontSize: 14, fontWeight: '900', color: COLORS.brandDark, marginBottom: 8, marginLeft: 2 },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: COLORS.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  summaryLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  summaryCount: { fontSize: 13, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },
  summaryCountDone: { color: COLORS.success },

  regionCard: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4,
  },
  regionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  regionName: { fontSize: 15, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  qtyDivider: { fontSize: 12, color: COLORS.border, fontWeight: '700' },

  badgeRow: { flexDirection: 'row', gap: 8 },
  badgeCell: { flex: 1, alignItems: 'center', gap: 6 },
  badgeCaption: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.infoLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text, marginBottom: 6 },
  emptyDesc: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyHint: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginLeft: 2, marginBottom: 8 },
});
