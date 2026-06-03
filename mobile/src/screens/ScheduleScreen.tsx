import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { REGION_ORDER, PARTNER_REGIONS, getFullRegionName, isSeoulRegion, COLORS } from '../constants';

// schedule_records/{월-지역}.items — 동별 배송 일정(기사·예정일·완료). 웹 배송일정 관리와 동일 문서.
interface ScheduleItem {
  id?: string; no?: number; dong?: string;
  driverName?: string; driverPhone?: string; emergencyPhone?: string;
  deliveryDate?: string; deliveryDates?: string[]; isCompleted?: boolean; notes?: string;
}

// 배송예정일 표시 — 웹 캘린더의 deliveryDates(배열) 우선, 없으면 레거시 deliveryDate.
function formatItemDate(it: ScheduleItem): string {
  const dates = (it.deliveryDates || []).filter(Boolean);
  if (dates.length > 0) {
    return [...dates].sort().map((d) => {
      const [, m, day] = d.split('-');
      return `${parseInt(m || '0', 10)}/${parseInt(day || '0', 10)}`;
    }).join(', ');
  }
  return it.deliveryDate || '-';
}

export default function ScheduleScreen() {
  const { currentMonth } = useData();
  const { isAdmin, partnerCompany } = useAuth();
  const myRegions = useMemo(
    () => (isAdmin ? REGION_ORDER : (PARTNER_REGIONS[partnerCompany || ''] || [])),
    [isAdmin, partnerCompany],
  );

  const [regionData, setRegionData] = useState<Record<string, ScheduleItem[]>>({});
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(true);

  // 현재 월의 모든 지역 일정을 실시간 구독(문서ID = `${month}-${region}`). 컬렉션이 작아 전체 구독 후 클라이언트 필터.
  useEffect(() => {
    setLoading(true);
    const col = collection(db, 'artifacts', APP_ID, 'public', 'data', 'schedule_records');
    const prefix = `${currentMonth}-`;
    const unsub = onSnapshot(
      col,
      (snap) => {
        const map: Record<string, ScheduleItem[]> = {};
        snap.forEach((d) => {
          if (!d.id.startsWith(prefix)) return;
          const r = d.id.slice(prefix.length);
          const items = ((d.data().items || []) as ScheduleItem[]);
          if (items.length > 0) {
            map[r] = [...items].sort((a, b) => (a.dong || '').localeCompare(b.dong || '', 'ko'));
          }
        });
        setRegionData(map);
        setLoading(false);
      },
      (e) => { console.warn('배송일정 구독 실패:', e); setLoading(false); },
    );
    return unsub;
  }, [currentMonth]);

  // 내 지역 중 일정이 있는 지역만(REGION_ORDER 순).
  const regionsWithData = useMemo(() => {
    const mine = new Set(myRegions);
    return REGION_ORDER.filter((r) => mine.has(r) && (regionData[r]?.length ?? 0) > 0);
  }, [myRegions, regionData]);

  // 선택 지역 자동 보정 — 데이터가 있는 첫 지역으로(기본값 빈지역 문제 해결).
  useEffect(() => {
    if (regionsWithData.length === 0) {
      if (region) setRegion('');
      return;
    }
    if (!region || !regionsWithData.includes(region)) setRegion(regionsWithData[0]);
  }, [regionsWithData, region]);

  const call = (phone?: string) => {
    const digits = (phone || '').replace(/[^0-9]/g, '');
    if (digits) Linking.openURL('tel:' + digits).catch(() => {});
  };

  const [y, m] = currentMonth.split('-');
  const items = region ? (regionData[region] || []) : [];
  const completed = items.filter((i) => i.isCompleted).length;

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Feather name="calendar" size={18} color={COLORS.white} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerMonth}>{y}년 {parseInt(m || '0', 10)}월 배송 일정</Text>
          <Text style={styles.headerSub}>지역별 동·기사 배송 예정</Text>
        </View>
      </View>

      {/* 지역 선택 — 일정이 있는 지역만 노출 */}
      {regionsWithData.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.regionScroll} contentContainerStyle={{ gap: 8 }}>
          {regionsWithData.map((r) => {
            const active = r === region;
            const count = regionData[r]?.length ?? 0;
            return (
              <Pressable key={r} onPress={() => setRegion(r)}
                style={[styles.regionChip, active && styles.regionChipActive]}
                accessibilityRole="button" accessibilityLabel={`${getFullRegionName(r)} 일정 ${count}건`}>
                <Text style={[styles.regionChipText, active && styles.regionChipTextActive]}>{r} ({count})</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator size="large" color={COLORS.brand} /><Text style={styles.loadingText}>일정 불러오는 중…</Text></View>
      ) : regionsWithData.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Feather name="calendar" size={28} color={COLORS.brand} /></View>
          <Text style={styles.emptyTitle}>{y}년 {parseInt(m || '0', 10)}월 등록된 배송 일정이 없습니다</Text>
          <Text style={styles.emptyDesc}>웹 관리자 화면에서 이 달의 배송일정을 등록하면 여기에 표시됩니다.</Text>
        </View>
      ) : (
        <>
          {region ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryRegion}>{getFullRegionName(region)}</Text>
              <Text style={styles.summaryCount}>완료 {completed}/{items.length}</Text>
            </View>
          ) : null}

          {items.map((it, i) => {
            const tone = isSeoulRegion(region) ? COLORS.seoul : COLORS.gyeonggi;
            return (
              <View key={it.id || i} style={[styles.card, { borderLeftColor: tone }]}>
                <View style={styles.cardTop}>
                  <View style={styles.noBadge}><Text style={styles.noText}>{it.no ?? i + 1}</Text></View>
                  <Text style={styles.dong}>{it.dong || '-'}</Text>
                  <View style={[styles.statusBadge, it.isCompleted ? styles.statusDone : styles.statusWait]}>
                    <Feather name={it.isCompleted ? 'check-circle' : 'clock'} size={12} color={it.isCompleted ? COLORS.success : COLORS.warning} />
                    <Text style={[styles.statusText, { color: it.isCompleted ? COLORS.success : COLORS.warning }]}>{it.isCompleted ? '완료' : '예정'}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Feather name="calendar" size={13} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>배송예정 {formatItemDate(it)}</Text>
                </View>

                {it.driverName || it.driverPhone ? (
                  <View style={styles.driverRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.metaRow}>
                        <Feather name="user" size={13} color={COLORS.textMuted} />
                        <Text style={styles.metaText}>{it.driverName || '기사 미지정'}</Text>
                      </View>
                    </View>
                    {it.driverPhone ? (
                      <Pressable onPress={() => call(it.driverPhone)} style={({ pressed }) => [styles.callBtn, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button" accessibilityLabel={`기사 전화 ${it.driverName || ''}`}>
                        <Feather name="phone" size={14} color={COLORS.white} />
                        <Text style={styles.callText}>{it.driverPhone}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {it.notes ? <Text style={styles.notes}>{it.notes}</Text> : null}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  headerMonth: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },
  regionScroll: { marginBottom: 12 },
  regionChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, minHeight: 40, justifyContent: 'center' },
  regionChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  regionChipText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  regionChipTextActive: { color: COLORS.white },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { color: COLORS.textMuted, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginLeft: 2 },
  summaryRegion: { fontSize: 15, fontWeight: '900', color: COLORS.brandDark },
  summaryCount: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  noBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: COLORS.infoLight, alignItems: 'center', justifyContent: 'center' },
  noText: { fontSize: 12, fontWeight: '900', color: COLORS.brandDark },
  dong: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.text },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusDone: { backgroundColor: COLORS.successLight },
  statusWait: { backgroundColor: COLORS.warningLight },
  statusText: { fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand, borderRadius: 10, paddingHorizontal: 12, minHeight: 40 },
  callText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  notes: { fontSize: 12.5, fontWeight: '600', color: COLORS.textMuted, marginTop: 8, lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 44 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.infoLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text, marginBottom: 6, textAlign: 'center' },
  emptyDesc: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
});
