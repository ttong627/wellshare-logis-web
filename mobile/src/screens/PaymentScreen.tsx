import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, LayoutAnimation,
  Platform, UIManager,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import {
  COLORS, getFullRegionName, isSeoulRegion, won,
} from '../constants';
import { computeBillingSummary, PartnerSettle } from '../lib/billing';

// 안드로이드에서 LayoutAnimation 활성화(펼침/접힘 부드럽게).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// "YYYY-MM" → "YYYY년 M월"
function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  const mNum = Number(m);
  if (!y || !Number.isFinite(mNum)) return month;
  return `${y}년 ${mNum}월`;
}

// 상단 전체 합계 KPI 한 칸.
function KpiCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.kpiCell}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, accent && styles.kpiValueAccent]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function MemberCard({ item }: { item: PartnerSettle }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={styles.card}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${item.member} 결제 내역 ${open ? '접기' : '펼치기'}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.memberName} numberOfLines={1}>{item.member}</Text>
          <Text style={styles.memberMeta}>
            총 {won(item.totalQty)}포 · 공급가 {won(item.totalSupply)} · 세액 {won(item.totalVat)}
          </Text>
        </View>
        <View style={styles.amountBox}>
          <Text style={styles.amountValue}>{won(item.totalAmount)}</Text>
          <Feather
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORS.textMuted}
          />
        </View>
      </Pressable>

      {open && (
        <View style={styles.detail}>
          <View style={styles.detailHeadRow}>
            <Text style={[styles.colRegion, styles.detailHeadText]}>지역</Text>
            <Text style={[styles.colNum, styles.detailHeadText]}>수량</Text>
            <Text style={[styles.colNum, styles.detailHeadText]}>공급가</Text>
            <Text style={[styles.colNum, styles.detailHeadText]}>세액</Text>
            <Text style={[styles.colNum, styles.detailHeadText]}>합계</Text>
          </View>
          {item.regions.map((row) => {
            const seoul = isSeoulRegion(row.region);
            return (
              <View key={row.region} style={styles.detailRow}>
                <View style={styles.colRegion}>
                  <View style={[styles.dot, { backgroundColor: seoul ? COLORS.seoul : COLORS.gyeonggi }]} />
                  <Text style={styles.regionText} numberOfLines={1}>{getFullRegionName(row.region)}</Text>
                </View>
                <Text style={[styles.colNum, styles.numText]}>{won(row.qty)}</Text>
                <Text style={[styles.colNum, styles.numText]}>{won(row.supply)}</Text>
                <Text style={[styles.colNum, styles.numText]}>{won(row.vat)}</Text>
                <Text style={[styles.colNum, styles.numTextBold]}>{won(row.total)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function PaymentScreen() {
  const { currentMonth, partnerInputs, orders, zonePrices, regions, isLoading } = useData();

  const summary = useMemo(
    () => computeBillingSummary(partnerInputs, orders, zonePrices, regions),
    [partnerInputs, orders, zonePrices, regions],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>결제 내역을 불러오는 중…</Text>
      </View>
    );
  }

  const hasData = summary.sorted.length > 0;

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 헤더 카드 */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="credit-card" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>결제 내역</Text>
          <Text style={styles.headerSub}>{formatMonth(currentMonth)} · 회원사 {summary.sorted.length}곳</Text>
        </View>
      </View>

      {hasData && (
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <KpiCell label="총수량" value={`${won(summary.grandTotalQty)}포`} />
            <View style={styles.kpiSep} />
            <KpiCell label="공급가" value={won(summary.grandTotalSupply)} />
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiRow}>
            <KpiCell label="세액" value={won(summary.grandTotalVat)} />
            <View style={styles.kpiSep} />
            <KpiCell label="합계" value={won(summary.grandTotalAmount)} accent />
          </View>
        </View>
      )}

      {!hasData ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="inbox" size={28} color={COLORS.brand} />
          </View>
          <Text style={styles.emptyTitle}>결제 내역이 없습니다</Text>
          <Text style={styles.emptyDesc}>회원사 실적이 입력되면 이곳에 정산 내역이 표시됩니다.</Text>
        </View>
      ) : (
        summary.sorted.map((item) => <MemberCard key={item.member} item={item} />)
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
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },

  kpiCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  kpiRow: { flexDirection: 'row', alignItems: 'center' },
  kpiCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 },
  kpiValue: { fontSize: 16, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },
  kpiValueAccent: { color: COLORS.brandDark, fontSize: 17 },
  kpiSep: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.border },
  kpiDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 56 },
  memberName: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  memberMeta: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 4, fontVariant: ['tabular-nums'] },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amountValue: { fontSize: 17, fontWeight: '900', color: COLORS.brandDark, fontVariant: ['tabular-nums'] },

  detail: { borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10 },
  detailHeadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  detailHeadText: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  colRegion: { flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  colNum: { flex: 1, textAlign: 'right' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  regionText: { fontSize: 12, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  numText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  numTextBold: { fontSize: 12, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.infoLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text, marginBottom: 6 },
  emptyDesc: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  pressed: { opacity: 0.7 },
});
