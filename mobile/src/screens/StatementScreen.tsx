import React, { useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { COLORS, getFullRegionName, isSeoulRegion, won } from '../constants';
import { computeBillingSummary, PartnerSettle } from '../lib/billing';

// "YYYY-MM" → "YYYY년 M월"
function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  const mNum = Number(m);
  if (!y || !Number.isFinite(mNum)) return month;
  return `${y}년 ${mNum}월`;
}

// 한 회원사의 정산 카드: 회원사명 + 총합 + 지역별 공급가/세액/합계.
function CompanyCard({ item }: { item: PartnerSettle }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.memberName} numberOfLines={1}>{item.member}</Text>
          <Text style={styles.memberMeta}>총 {won(item.totalQty)}포</Text>
        </View>
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>합계</Text>
          <Text style={styles.amountValue}>{won(item.totalAmount)}</Text>
        </View>
      </View>

      <View style={styles.detail}>
        <View style={styles.detailHeadRow}>
          <Text style={[styles.colRegion, styles.detailHeadText]}>지역</Text>
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
              <Text style={[styles.colNum, styles.numText]}>{won(row.supply)}</Text>
              <Text style={[styles.colNum, styles.numText]}>{won(row.vat)}</Text>
              <Text style={[styles.colNum, styles.numTextBold]}>{won(row.total)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalCaption}>공급가 {won(item.totalSupply)} · 세액 {won(item.totalVat)}</Text>
      </View>
    </View>
  );
}

export default function StatementScreen() {
  const { currentMonth, partnerInputs, orders, zonePrices, regions, isLoading } = useData();
  const { isAdmin, partnerCompany } = useAuth();

  const summary = useMemo(
    () => computeBillingSummary(partnerInputs, orders, zonePrices, regions),
    [partnerInputs, orders, zonePrices, regions],
  );

  // 파트너는 자기 회사 항목만, 관리자는 전체.
  const rows = useMemo(() => {
    if (isAdmin) return summary.sorted;
    if (!partnerCompany) return [];
    return summary.sorted.filter((s) => s.member === partnerCompany);
  }, [isAdmin, partnerCompany, summary.sorted]);

  const grandTotal = useMemo(
    () => rows.reduce((sum, r) => sum + r.totalAmount, 0),
    [rows],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>내역을 불러오는 중…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 헤더 카드 */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="file-text" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>내역 확인</Text>
          <Text style={styles.headerSub}>
            {formatMonth(currentMonth)} · {isAdmin ? '전체 정산 내역' : (partnerCompany ?? '내 정산 내역')}
          </Text>
        </View>
      </View>

      {rows.length > 0 && (
        <View style={styles.grandCard}>
          <Text style={styles.grandLabel}>{isAdmin ? '전체 합계' : '내 정산 합계'}</Text>
          <Text style={styles.grandValue}>{won(grandTotal)}</Text>
        </View>
      )}

      {rows.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="file-text" size={28} color={COLORS.brand} />
          </View>
          <Text style={styles.emptyTitle}>표시할 내역이 없습니다</Text>
          <Text style={styles.emptyDesc}>
            {isAdmin
              ? '회원사 실적이 입력되면 이곳에 정산 내역이 표시됩니다.'
              : '담당 지역 실적이 입력되면 이곳에 정산 내역이 표시됩니다.'}
          </Text>
        </View>
      ) : (
        rows.map((item) => <CompanyCard key={item.member} item={item} />)
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

  grandCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.brandDark, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 16,
  },
  grandLabel: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  grandValue: { fontSize: 22, fontWeight: '900', color: COLORS.white, fontVariant: ['tabular-nums'] },

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  memberName: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  memberMeta: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 4, fontVariant: ['tabular-nums'] },
  amountBox: { alignItems: 'flex-end' },
  amountLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  amountValue: { fontSize: 18, fontWeight: '900', color: COLORS.brandDark, fontVariant: ['tabular-nums'], marginTop: 2 },

  detail: { borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10 },
  detailHeadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  detailHeadText: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  colRegion: { flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  colNum: { flex: 1, textAlign: 'right' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  regionText: { fontSize: 12, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  numText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  numTextBold: { fontSize: 12, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },

  totalRow: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  totalCaption: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right', fontVariant: ['tabular-nums'] },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.infoLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text, marginBottom: 6 },
  emptyDesc: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
