import React, { useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { COLORS, REGION_ORDER, getFullRegionName, isSeoulRegion } from '../constants';

// "YYYY-MM" → "YYYY년 M월"
function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  const mNum = Number(m);
  if (!y || !Number.isFinite(mNum)) return month;
  return `${y}년 ${mNum}월`;
}

// "YYYY-MM-DD" → "M월 D일" (없으면 '-')
function formatDate(date?: string): string {
  if (!date) return '-';
  const parts = date.split('-');
  if (parts.length < 3) return date;
  const mNum = Number(parts[1]);
  const dNum = Number(parts[2]);
  if (!Number.isFinite(mNum) || !Number.isFinite(dNum)) return date;
  return `${mNum}월 ${dNum}일`;
}

// 어떤 회사든 해당 지역에 찍힌 첫 배송완료일을 찾는다(가장 이른 날짜 우선).
function findDeliveryDate(
  deliveryDates: Record<string, Record<string, { date?: string }>>,
  region: string,
): string | undefined {
  let earliest: string | undefined;
  Object.values(deliveryDates || {}).forEach((byRegion) => {
    const d = byRegion?.[region]?.date;
    if (d && (!earliest || d < earliest)) earliest = d;
  });
  return earliest;
}

// 어떤 회사든 해당 지역에 찍힌 계산서 발행일을 찾는다(가장 이른 날짜 우선).
function findPublishDate(
  publishDates: Record<string, Record<string, string>>,
  region: string,
): string | undefined {
  let earliest: string | undefined;
  Object.values(publishDates || {}).forEach((byRegion) => {
    const d = byRegion?.[region];
    if (d && (!earliest || d < earliest)) earliest = d;
  });
  return earliest;
}

interface ScheduleRow {
  region: string;
  delivery?: string;
  publish?: string;
}

// 일정 한 칸(배송/발행).
function DateCell({ icon, label, value }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value?: string }) {
  const has = !!value;
  return (
    <View style={styles.dateCell}>
      <View style={styles.dateLabelRow}>
        <Feather name={icon} size={13} color={has ? COLORS.brand : COLORS.textMuted} />
        <Text style={styles.dateLabel}>{label}</Text>
      </View>
      <Text style={[styles.dateValue, !has && styles.dateValueEmpty]}>{formatDate(value)}</Text>
    </View>
  );
}

export default function ScheduleScreen() {
  const { currentMonth, deliveryDates, publishDates, isLoading } = useData();

  const rows: ScheduleRow[] = useMemo(
    () => REGION_ORDER.map((region) => ({
      region,
      delivery: findDeliveryDate(deliveryDates, region),
      publish: findPublishDate(publishDates, region),
    })),
    [deliveryDates, publishDates],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>배송 일정을 불러오는 중…</Text>
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
          <Text style={styles.headerTitle}>배송 일정</Text>
          <Text style={styles.headerSub}>{formatMonth(currentMonth)} · 지역별 배송·발행일</Text>
        </View>
      </View>

      {rows.map((row) => {
        const seoul = isSeoulRegion(row.region);
        const tone = seoul
          ? { border: COLORS.seoul, tint: COLORS.seoulBg, label: '서울' }
          : { border: COLORS.gyeonggi, tint: COLORS.gyeonggiBg, label: '경기' };
        return (
          <View key={row.region} style={[styles.card, { borderLeftColor: tone.border }]}>
            <View style={styles.cardHead}>
              <Text style={styles.regionName}>{getFullRegionName(row.region)}</Text>
              <View style={[styles.regionBadge, { backgroundColor: tone.tint }]}>
                <Text style={[styles.regionBadgeText, { color: tone.border }]}>{tone.label}</Text>
              </View>
            </View>
            <View style={styles.dateRow}>
              <DateCell icon="truck" label="배송완료" value={row.delivery} />
              <View style={styles.cellSep} />
              <DateCell icon="file-text" label="계산서발행" value={row.publish} />
            </View>
          </View>
        );
      })}
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

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  regionName: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  regionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  regionBadgeText: { fontSize: 11, fontWeight: '800' },

  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateCell: { flex: 1, alignItems: 'center' },
  dateLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  dateLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  dateValue: { fontSize: 17, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },
  dateValueEmpty: { color: COLORS.textMuted, fontWeight: '700' },
  cellSep: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.border, marginVertical: 2 },
});
