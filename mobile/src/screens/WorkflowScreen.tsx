import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  COLORS, REGION_ORDER, PARTNER_REGIONS_INVERSE, getFullRegionName, isSeoulRegion,
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

type Stage = 'before' | 'pending' | 'requested' | 'issued';

interface RegionRow {
  region: string;
  seoul: boolean;
  deliveryDate: string;
  requestDate: string;
  publishDate: string;
  stage: Stage;
}

export default function WorkflowScreen() {
  const { currentMonth, deliveryDates, publishDates, publishRequests, isClosed, isLoading, sendPublishRequest, clearPublishRequest } = useData();
  const { isAdmin } = useAuth();
  const [sending, setSending] = useState<string | null>(null);

  const rows = useMemo<RegionRow[]>(() => {
    return REGION_ORDER.map((region) => {
      const deliveryDate = firstDeliveryForRegion(deliveryDates, region);
      const requestDate = firstDateForRegion(publishRequests, region);
      const publishDate = firstDateForRegion(publishDates, region);
      let stage: Stage;
      if (!deliveryDate) stage = 'before';            // 배송 전
      else if (publishDate) stage = 'issued';          // 발급 완료
      else if (requestDate) stage = 'requested';       // 발급 요청됨(완료 대기)
      else stage = 'pending';                          // 배송완료·발급요청 필요
      return { region, seoul: isSeoulRegion(region), deliveryDate, requestDate, publishDate, stage };
    });
  }, [deliveryDates, publishRequests, publishDates]);

  // 발급요청 필요(pending)를 위로 정렬(조치 필요 우선). 그 외는 REGION_ORDER 유지.
  const sortedRows = useMemo<RegionRow[]>(() => {
    const rank: Record<Stage, number> = { pending: 0, requested: 1, before: 2, issued: 2 };
    return [...rows].sort((a, b) => rank[a.stage] - rank[b.stage]);
  }, [rows]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const delivered = rows.filter((r) => r.stage !== 'before').length;
    const issued = rows.filter((r) => r.stage === 'issued').length;
    const pending = rows.filter((r) => r.stage === 'pending').length;
    return { total, delivered, issued, pending };
  }, [rows]);

  // 회원사 계산서 발급 요청 — 해당 지역 담당 회원사(배송완료·미요청)에게 전송.
  const handleSendRequest = (region: string, deliveryDate: string) => {
    if (isClosed) { Alert.alert('마감됨', '마감된 월에는 발급 요청을 보낼 수 없습니다.'); return; }
    const companies = (PARTNER_REGIONS_INVERSE[region] || []).filter(
      (c) => deliveryDates[c]?.[region]?.date && !publishRequests[c]?.[region],
    );
    if (companies.length === 0) {
      Alert.alert('발급 요청', '요청할 대상 회원사가 없습니다.\n(배송 미완료이거나 이미 요청됨)');
      return;
    }
    const date = deliveryDate || new Date().toISOString().slice(0, 10);
    Alert.alert(
      '계산서 발급 요청',
      `${getFullRegionName(region)} 배송 완료 확인.\n${companies.join(', ')}에\n${date} 일자로 발급 요청을 보내고 발급완료로 처리합니다.\n회원사에 알림이 전송됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '요청 보내기',
          onPress: async () => {
            setSending(region);
            try {
              for (const c of companies) await sendPublishRequest(c, region, date);
              Alert.alert('처리 완료', `${companies.length}개 회원사에 발급 요청을 보내고 발급완료 처리했습니다.`);
            } catch (e) {
              Alert.alert('오류', '발급 요청 전송 실패: ' + (e as Error).message);
            } finally {
              setSending(null);
            }
          },
        },
      ],
    );
  };

  // 발급 요청/완료 취소 — 해당 지역의 발급 정보를 삭제하고 배송완료 단계로 되돌린다.
  const handleCancel = (region: string) => {
    if (isClosed) { Alert.alert('마감됨', '마감된 월에는 취소할 수 없습니다.'); return; }
    const companies = (PARTNER_REGIONS_INVERSE[region] || []).filter(
      (c) => publishDates[c]?.[region] || publishRequests[c]?.[region],
    );
    if (companies.length === 0) return;
    Alert.alert(
      '발급 취소',
      `${getFullRegionName(region)}의 발급 요청·완료를 취소합니다.\n배송완료 단계로 되돌아갑니다.`,
      [
        { text: '닫기', style: 'cancel' },
        {
          text: '취소하기',
          style: 'destructive',
          onPress: async () => {
            setSending(region);
            try {
              for (const c of companies) await clearPublishRequest(c, region);
              Alert.alert('취소 완료', `${getFullRegionName(region)} 발급이 취소되었습니다.`);
            } catch (e) {
              Alert.alert('오류', '취소 실패: ' + (e as Error).message);
            } finally {
              setSending(null);
            }
          },
        },
      ],
    );
  };

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
          <Feather name="activity" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>정산 현황</Text>
          <Text style={styles.headerSub}>{formatMonth(currentMonth)} · 배송완료 → 발급요청 → 발급완료</Text>
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
          <Text style={[styles.kpiLabel, kpi.pending > 0 && { color: COLORS.warning }]}>요청 필요</Text>
        </View>
      </View>

      {/* 발급요청 필요 안내 */}
      {kpi.pending > 0 && (
        <View style={styles.noticeBanner}>
          <Feather name="alert-triangle" size={15} color={COLORS.warning} />
          <Text style={styles.noticeText}>
            배송완료 후 발급요청 미전송 {kpi.pending}건 — 회원사에 발급 요청을 보내 주세요.
          </Text>
        </View>
      )}

      {/* 지역 카드(발급요청 필요 우선) */}
      {sortedRows.map((r) => {
        const tone = r.seoul
          ? { border: COLORS.seoul, tint: COLORS.seoulBg, label: '서울' }
          : { border: COLORS.gyeonggi, tint: COLORS.gyeonggiBg, label: '경기' };
        const isPending = r.stage === 'pending';
        const isRequested = r.stage === 'requested';

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
                <StatusBadge status="requested" label="요청 필요" />
              ) : r.stage === 'requested' ? (
                <StatusBadge status="requested" label="발급 요청됨" />
              ) : (
                <StatusBadge status="done" label="발급 완료" />
              )}
            </View>

            <View style={styles.timelineRow}>
              {/* 배송완료일 */}
              <View style={styles.timelineItem}>
                <View style={styles.timelineHead}>
                  <Feather name="truck" size={13} color={r.deliveryDate ? COLORS.success : COLORS.textMuted} />
                  <Text style={styles.timelineLabel}>배송완료</Text>
                </View>
                <Text style={[styles.timelineValue, !r.deliveryDate && styles.timelineMuted]}>
                  {r.deliveryDate || '미완료'}
                </Text>
              </View>

              <Feather name="chevron-right" size={16} color={COLORS.textMuted} style={styles.timelineArrow} />

              {/* 발급 요청일 */}
              <View style={styles.timelineItem}>
                <View style={styles.timelineHead}>
                  <Feather name="send" size={13} color={r.requestDate ? COLORS.brand : (isPending ? COLORS.warning : COLORS.textMuted)} />
                  <Text style={styles.timelineLabel}>발급요청</Text>
                </View>
                <Text style={[styles.timelineValue, !r.requestDate && styles.timelineMuted, isPending && styles.timelineWarn]}>
                  {r.requestDate || (isPending ? '필요' : '-')}
                </Text>
              </View>

              <Feather name="chevron-right" size={16} color={COLORS.textMuted} style={styles.timelineArrow} />

              {/* 계산서 발급일 */}
              <View style={styles.timelineItem}>
                <View style={styles.timelineHead}>
                  <Feather name="file-text" size={13} color={r.publishDate ? COLORS.success : COLORS.textMuted} />
                  <Text style={styles.timelineLabel}>발급완료</Text>
                </View>
                <Text style={[styles.timelineValue, !r.publishDate && styles.timelineMuted]}>
                  {r.publishDate || (isRequested ? '대기' : '-')}
                </Text>
              </View>
            </View>

            {/* 발급 요청 버튼 — 관리자, 발급요청 필요 단계만 */}
            {isAdmin && isPending && (
              <Pressable
                onPress={() => handleSendRequest(r.region, r.deliveryDate)}
                disabled={sending === r.region || isClosed}
                style={({ pressed }) => [
                  styles.reqBtn,
                  (sending === r.region || isClosed) && styles.reqBtnDisabled,
                  pressed && !isClosed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${getFullRegionName(r.region)} 계산서 발급 요청 보내기`}
              >
                {sending === r.region ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Feather name="send" size={15} color={COLORS.white} />
                    <Text style={styles.reqBtnText}>회원사에 발급 요청 보내기</Text>
                  </>
                )}
              </Pressable>
            )}

            {/* 발급 취소 버튼 — 관리자, 발급요청됨/발급완료 단계 */}
            {isAdmin && (isRequested || r.stage === 'issued') && (
              <Pressable
                onPress={() => handleCancel(r.region)}
                disabled={sending === r.region || isClosed}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  (sending === r.region || isClosed) && styles.cancelBtnDisabled,
                  pressed && !isClosed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${getFullRegionName(r.region)} 발급 취소`}
              >
                {sending === r.region ? (
                  <ActivityIndicator size="small" color={COLORS.danger} />
                ) : (
                  <>
                    <Feather name="rotate-ccw" size={15} color={COLORS.danger} />
                    <Text style={styles.cancelBtnText}>발급 취소</Text>
                  </>
                )}
              </Pressable>
            )}
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
  timelineHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  timelineValue: { fontSize: 13, fontWeight: '800', color: COLORS.text, fontVariant: ['tabular-nums'] },
  timelineMuted: { color: COLORS.textMuted, fontWeight: '700' },
  timelineWarn: { color: COLORS.warning, fontWeight: '900' },
  timelineArrow: { marginHorizontal: 4 },

  reqBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.brand, borderRadius: 12, paddingVertical: 13, marginTop: 14, minHeight: 46,
  },
  reqBtnDisabled: { backgroundColor: COLORS.textMuted, opacity: 0.5 },
  reqBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '800' },

  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.dangerLight, borderRadius: 12, paddingVertical: 12, marginTop: 12, minHeight: 44,
    borderWidth: 1, borderColor: COLORS.danger,
  },
  cancelBtnDisabled: { opacity: 0.5 },
  cancelBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontWeight: '800', color: COLORS.text },
});
