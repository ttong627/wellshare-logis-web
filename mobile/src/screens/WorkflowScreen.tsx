import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import {
  COLORS, REGION_ORDER, getFullRegionName, isSeoulRegion,
} from '../constants';
import StatusBadge from '../components/StatusBadge';

// "YYYY-MM" → "YYYY년 M월"
function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  const mNum = Number(m);
  if (!y || !Number.isFinite(mNum)) return month;
  return `${y}년 ${mNum}월`;
}

// company→region→value 구조에서 해당 지역의 첫 존재값을 추출(회원사 무관).
function firstDateForRegion(
  byCompany: Record<string, Record<string, string>>,
  region: string,
): string {
  for (const regions of Object.values(byCompany || {})) {
    const v = regions?.[region];
    if (v) return v;
  }
  return '';
}

// company→region→{date} 구조에서 해당 지역의 첫 배송완료일을 추출.
function firstDeliveryForRegion(
  byCompany: Record<string, Record<string, { date?: string }>>,
  region: string,
): string {
  for (const regions of Object.values(byCompany || {})) {
    const v = regions?.[region]?.date;
    if (v) return v;
  }
  return '';
}

type Stage = 'before' | 'pending' | 'issued';

interface RegionRow {
  region: string;
  seoul: boolean;
  deliveryDate: string;
  publishDate: string;
  stage: Stage;
}

export default function WorkflowScreen() {
  const { currentMonth, deliveryDates, publishDates, isLoading } = useData();

  const rows = useMemo<RegionRow[]>(() => {
    return REGION_ORDER.map((region) => {
      const deliveryDate = firstDeliveryForRegion(deliveryDates, region);
      const publishDate = firstDateForRegion(publishDates, region);
      let stage: Stage;
      if (!deliveryDate) stage = 'before';        // 배송 전
      else if (!publishDate) stage = 'pending';   // 배송완료·발급 대기
      else stage = 'issued';                       // 발급 완료
      return { region, seoul: isSeoulRegion(region), deliveryDate, publishDate, stage };
    });
  }, [deliveryDates, publishDates]);

  // 발급대기를 위로 정렬(끊어야 할 건수 우선 노출). 그 외는 REGION_ORDER 유지.
  const sortedRows = useMemo<RegionRow[]>(() => {
    const rank: Record<Stage, number> = { pending: 0, before: 1, issued: 1 };
    return [...rows].sort((a, b) => rank[a.stage] - rank[b.stage]);
  }, [rows]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const delivered = rows.filter((r) => r.stage !== 'before').length;
    const issued = rows.filter((r) => r.stage === 'issued').length;
    const pending = rows.filter((r) => r.stage === 'pending').length;
    return { total, delivered, issued, pending };
  }, [rows]);

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>정산 현황을 불러오는 중…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 헤더 카드 */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="calendar" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>정산 현황</Text>
          <Text style={styles.headerSub}>{formatMonth(currentMonth)} · 배송완료 → 계산서 발급 일정</Text>
        </View>
      </View>

      {/* KPI 요약 */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Feather name="truck" size={16} color={COLORS.brandDark} />
          <Text style={styles.kpiValue}>
            {kpi.delivered}<Text style={styles.kpiTotal}>/{kpi.total}</Text>
          </Text>
          <Text style={styles.kpiLabel}>배송완료</Text>
        </View>
        <View style={styles.kpiCard}>
          <Feather name="check-circle" size={16} color={COLORS.success} />
          <Text style={styles.kpiValue}>
            {kpi.issued}<Text style={styles.kpiTotal}>/{kpi.total}</Text>
          </Text>
          <Text style={styles.kpiLabel}>발급완료</Text>
        </View>
        <View style={[styles.kpiCard, kpi.pending > 0 && styles.kpiCardAlert]}>
          <Feather name="alert-circle" size={16} color={kpi.pending > 0 ? COLORS.warning : COLORS.textMuted} />
          <Text style={[styles.kpiValue, kpi.pending > 0 && { color: COLORS.warning }]}>{kpi.pending}</Text>
          <Text style={[styles.kpiLabel, kpi.pending > 0 && { color: COLORS.warning }]}>발급대기</Text>
        </View>
      </View>

      {/* 발급대기 안내 — 끊어야 할 건수 강조 */}
      {kpi.pending > 0 && (
        <View style={styles.noticeBanner}>
          <Feather name="alert-triangle" size={15} color={COLORS.warning} />
          <Text style={styles.noticeText}>
            배송완료 후 계산서 일자 미지정 {kpi.pending}건 — 발급일을 지정해 주세요.
          </Text>
        </View>
      )}

      {/* 지역 카드(발급대기 우선) */}
      {sortedRows.map((r) => {
        const tone = r.seoul
          ? { border: COLORS.seoul, tint: COLORS.seoulBg, label: '서울' }
          : { border: COLORS.gyeonggi, tint: COLORS.gyeonggiBg, label: '경기' };
        const isPending = r.stage === 'pending';

        return (
          <View
            key={r.region}
            style={[
              styles.card,
              { borderLeftColor: isPending ? COLORS.warning : tone.border },
              isPending && styles.cardAlert,
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.regionTitleWrap}>
                <Text style={styles.regionName}>{getFullRegionName(r.region)}</Text>
                <View style={[styles.cityTag, { backgroundColor: tone.tint }]}>
                  <Text style={[styles.cityTagText, { color: tone.border }]}>{tone.label}</Text>
                </View>
              </View>
              {r.stage === 'before' ? (
                <StatusBadge status="wait" label="배송 전" />
              ) : r.stage === 'pending' ? (
                <StatusBadge status="requested" label="발급 대기" />
              ) : (
                <StatusBadge status="done" label="발급 완료" />
              )}
            </View>

            <View style={styles.timelineRow}>
              {/* 배송완료일 */}
              <View style={styles.timelineItem}>
                <View style={styles.timelineHead}>
                  <Feather
                    name="truck"
                    size={13}
                    color={r.deliveryDate ? COLORS.success : COLORS.textMuted}
                  />
                  <Text style={styles.timelineLabel}>배송완료일</Text>
                </View>
                <Text style={[styles.timelineValue, !r.deliveryDate && styles.timelineMuted]}>
                  {r.deliveryDate || '미완료'}
                </Text>
              </View>

              <Feather name="chevron-right" size={16} color={COLORS.textMuted} style={styles.timelineArrow} />

              {/* 계산서 발급일 */}
              <View style={styles.timelineItem}>
                <View style={styles.timelineHead}>
                  <Feather
                    name="file-text"
                    size={13}
                    color={r.publishDate ? COLORS.success : (isPending ? COLORS.warning : COLORS.textMuted)}
                  />
                  <Text style={styles.timelineLabel}>계산서 발급일</Text>
                </View>
                <Text
                  style={[
                    styles.timelineValue,
                    !r.publishDate && styles.timelineMuted,
                    isPending && styles.timelineWarn,
                  ]}
                >
                  {r.publishDate || (isPending ? '지정 필요' : '미지정')}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      {rows.length === 0 && (
        <View style={styles.empty}>
          <Feather name="inbox" size={28} color={COLORS.brand} />
          <Text style={styles.emptyText}>표시할 지역이 없습니다.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 48 },

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
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },

  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiCard: {
    flex: 1, alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  kpiCardAlert: { borderColor: COLORS.warning, backgroundColor: COLORS.warningLight },
  kpiValue: { fontSize: 22, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },
  kpiTotal: { fontSize: 14, fontWeight: '800', color: COLORS.textMuted },
  kpiLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted },

  noticeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.warningLight, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  noticeText: { fontSize: 13, fontWeight: '700', color: COLORS.warning, flex: 1, fontVariant: ['tabular-nums'] },

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4,
  },
  cardAlert: { borderColor: COLORS.warning },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  regionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  regionName: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  cityTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  cityTagText: { fontSize: 10, fontWeight: '800' },

  timelineRow: { flexDirection: 'row', alignItems: 'center' },
  timelineItem: { flex: 1, gap: 5 },
  timelineHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timelineLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted },
  timelineValue: { fontSize: 15, fontWeight: '800', color: COLORS.text, fontVariant: ['tabular-nums'] },
  timelineMuted: { color: COLORS.textMuted, fontWeight: '700' },
  timelineWarn: { color: COLORS.warning, fontWeight: '900' },
  timelineArrow: { marginHorizontal: 8 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontWeight: '800', color: COLORS.text },
});
