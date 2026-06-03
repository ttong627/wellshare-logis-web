import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import { computeBillingReport, BillingRow } from '../lib/billing';
import { ECOUNT_COMPANIES, DEFAULT_COMCODE, buildRegionPayload, sendRegion } from '../lib/ecountGateway';
import { won, getFullRegionName, COLORS } from '../constants';

type SendState = 'idle' | 'sending' | 'done' | 'error';

export default function BillingScreen() {
  const { currentMonth, orders, partnerInputs, zonePrices, regions, isLoading } = useData();
  const { isAdmin } = useAuth();
  const [comCode, setComCode] = useState(DEFAULT_COMCODE);
  const [sendStatus, setSendStatus] = useState<Record<string, SendState>>({});

  const { report, seoulTotal, gyeonggiTotal, grandTotal } = useMemo(
    () => computeBillingReport(orders, partnerInputs, zonePrices, regions),
    [orders, partnerInputs, zonePrices, regions],
  );
  const [y, m] = currentMonth.split('-');
  const month = parseInt(m || '0', 10);

  const handleSend = (row: BillingRow) => {
    const company = ECOUNT_COMPANIES.find(c => c.comCode === comCode)?.label;
    Alert.alert(
      'ECOUNT 매출자료 생성',
      `[${row.region}] ${company}\n수량 ${row.sum.qty} · 합계 ${won(row.sum.amount)}원\n\n운영 ECOUNT에 매출자료를 생성합니다. 계속할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전송', onPress: async () => {
            setSendStatus(s => ({ ...s, [row.region]: 'sending' }));
            try {
              const token = await auth.currentUser?.getIdToken();
              if (!token) throw new Error('로그인이 필요합니다');
              const res = await sendRegion(token, buildRegionPayload(row, month, regions, zonePrices, comCode));
              if (res.ok) {
                setSendStatus(s => ({ ...s, [row.region]: 'done' }));
                Alert.alert('전송 완료', res.cached
                  ? `[${row.region}] 이미 전송된 자료입니다.`
                  : `[${row.region}] 매출자료 생성 완료${res.slipNos?.length ? `\n전표: ${res.slipNos.join(', ')}` : ''}`);
              } else {
                setSendStatus(s => ({ ...s, [row.region]: 'error' }));
                Alert.alert('전송 실패', `[${row.region}] ${res.message}`);
              }
            } catch (e) {
              setSendStatus(s => ({ ...s, [row.region]: 'error' }));
              Alert.alert('전송 오류', (e as Error).message);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brand} /><Text style={styles.loadingText}>계산서 불러오는 중…</Text></View>;
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Feather name="file-text" size={18} color={COLORS.white} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerMonth}>{y}년 {parseInt(m || '0', 10)}월 계산서</Text>
          <Text style={styles.headerSub}>지역별 공급가·세액 · ECOUNT 전송</Text>
        </View>
      </View>

      {isAdmin && (
        <View style={styles.companyRow}>
          {ECOUNT_COMPANIES.map(c => {
            const active = c.comCode === comCode;
            return (
              <Pressable key={c.comCode} onPress={() => setComCode(c.comCode)}
                style={({ pressed }) => [styles.companyChip, active && styles.companyChipActive, pressed && { opacity: 0.7 }]}
                accessibilityRole="button" accessibilityLabel={`발행회사 ${c.label}`}>
                <Feather name={active ? 'check-circle' : 'circle'} size={14} color={active ? COLORS.white : COLORS.textMuted} />
                <Text style={[styles.companyText, active && styles.companyTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.totalCard}>
        <Text style={styles.totalTitle}>전체 합계</Text>
        <View style={styles.totalGrid}>
          <TotalCell label="수량" value={String(grandTotal.qty)} />
          <TotalCell label="공급가" value={won(grandTotal.supply)} />
          <TotalCell label="세액" value={won(grandTotal.vat)} />
          <TotalCell label="합계" value={won(grandTotal.amount)} strong />
        </View>
        <View style={styles.subTotals}>
          <Text style={styles.subTotalText}>서울 {won(seoulTotal.amount)}원 · 경기 {won(gyeonggiTotal.amount)}원</Text>
        </View>
      </View>

      {report.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={28} color={COLORS.brand} />
          <Text style={styles.emptyText}>이번 달 발행할 내역이 없습니다.</Text>
          <Text style={styles.emptySub}>포수입력/지역포수가 입력되면 금액이 계산됩니다.</Text>
        </View>
      ) : (
        report.map(row => {
          const st = sendStatus[row.region] || 'idle';
          const seoul = row.city === '서울';
          return (
            <View key={row.region} style={[styles.row, { borderLeftColor: seoul ? COLORS.seoul : COLORS.gyeonggi }]}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.regionName}>{getFullRegionName(row.region)}</Text>
                  <Text style={styles.regionMeta}>{row.zone} · 단가 {won(row.price)} · 수량 {row.sum.qty}</Text>
                </View>
                <View style={[styles.cityTag, { backgroundColor: seoul ? COLORS.seoulBg : COLORS.gyeonggiBg }]}>
                  <Text style={[styles.cityTagText, { color: seoul ? COLORS.seoul : COLORS.gyeonggi }]}>{row.city}</Text>
                </View>
              </View>

              <View style={styles.amountGrid}>
                <Amount label="공급가" value={won(row.sum.supply)} />
                <Amount label="세액" value={won(row.sum.vat)} />
                <Amount label="합계" value={won(row.sum.amount)} strong />
              </View>

              {isAdmin && (
                <Pressable
                  onPress={() => handleSend(row)}
                  disabled={st === 'sending'}
                  style={({ pressed }) => [
                    styles.sendBtn,
                    st === 'done' && styles.sendBtnDone,
                    st === 'error' && styles.sendBtnError,
                    (pressed || st === 'sending') && { opacity: 0.7 },
                  ]}
                  accessibilityRole="button" accessibilityLabel={`${row.region} ECOUNT 전송`}>
                  {st === 'sending'
                    ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <Feather name={st === 'done' ? 'check' : st === 'error' ? 'alert-circle' : 'upload-cloud'} size={15} color={COLORS.white} />}
                  <Text style={styles.sendText}>
                    {st === 'sending' ? '전송 중…' : st === 'done' ? '전송됨' : st === 'error' ? '재시도' : 'ECOUNT 전송'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}

      <View style={styles.notice}>
        <Feather name="info" size={13} color={COLORS.textMuted} />
        <Text style={styles.noticeText}>전송 후 ECOUNT 화면에서 일괄회계반영→전자세금계산서 발행을 진행하세요.</Text>
      </View>
    </ScrollView>
  );
}

function TotalCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.totalCell}>
      <Text style={styles.totalCellLabel}>{label}</Text>
      <Text style={[styles.totalCellValue, strong && { fontSize: 15 }]}>{value}</Text>
    </View>
  );
}
function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.amountCell}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, strong && { color: COLORS.brandDark }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  headerMonth: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },
  companyRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  companyChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  companyChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  companyText: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted },
  companyTextActive: { color: COLORS.white },
  totalCard: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, marginBottom: 16 },
  totalTitle: { color: '#bae6fd', fontSize: 12, fontWeight: '800', marginBottom: 10 },
  totalGrid: { flexDirection: 'row', gap: 8 },
  totalCell: { flex: 1 },
  totalCellLabel: { color: '#bae6fd', fontSize: 10, fontWeight: '700', marginBottom: 3 },
  totalCellValue: { color: COLORS.white, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  subTotals: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  subTotalText: { color: '#e0f2fe', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  regionName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  regionMeta: { fontSize: 11.5, fontWeight: '600', color: COLORS.textMuted, marginTop: 3, fontVariant: ['tabular-nums'] },
  cityTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  cityTagText: { fontSize: 11, fontWeight: '800' },
  amountGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  amountCell: { flex: 1, backgroundColor: COLORS.bg, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  amountLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, marginBottom: 2 },
  amountValue: { fontSize: 13.5, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.brand, borderRadius: 12, paddingVertical: 12, minHeight: 44 },
  sendBtnDone: { backgroundColor: COLORS.success },
  sendBtnError: { backgroundColor: COLORS.danger },
  sendText: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingHorizontal: 16 },
  noticeText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
});
