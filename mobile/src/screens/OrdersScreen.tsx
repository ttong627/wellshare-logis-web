import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  ActivityIndicator, StyleSheet, Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import {
  COLORS, REGION_ORDER, PARTNER_REGIONS_INVERSE,
  getFullRegionName, isSeoulRegion, won,
} from '../constants';

// "YYYY-MM" → "YYYY년 M월"
function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  const mNum = Number(m);
  if (!y || !Number.isFinite(mNum)) return month;
  return `${y}년 ${mNum}월`;
}

// 숫자 외 문자를 제거한 정수 문자열로 정규화(빈 값은 '' 유지).
function sanitizeQty(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits === '') return '';
  // 선행 0 제거(단, "0" 자체는 허용 안 하고 빈 값 취급)
  const n = String(parseInt(digits, 10));
  return n === '0' ? '' : n;
}

const toNum = (v: number | '' | undefined): number => (v === '' || v === undefined ? 0 : Number(v) || 0);
const isEmptyQty = (v: number | '' | undefined): boolean => v === undefined || v === '';

type AggOrder = { basicQty: number; povertyQty: number };
type SavedOrder = { basicQty?: number | ''; povertyQty?: number | '' };

interface RegionAggCardProps {
  region: string;
  zone: string;
  agg: AggOrder;
}

// 단일 회원사 지역 — 지역포수가 입력되면 포수입력이 자동 확정. 읽기전용 배지.
function RegionAggCard({ region, zone, agg }: RegionAggCardProps) {
  const seoul = isSeoulRegion(region);
  const tone = seoul
    ? { border: COLORS.seoul, tint: COLORS.seoulBg, label: '서울' }
    : { border: COLORS.gyeonggi, tint: COLORS.gyeonggiBg, label: '경기' };
  const totalQty = agg.basicQty + agg.povertyQty;

  return (
    <View style={[styles.card, { borderLeftColor: tone.border }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.regionName}>{getFullRegionName(region)}</Text>
          <View style={styles.zoneRow}>
            <View style={[styles.zoneBadge, { backgroundColor: tone.tint }]}>
              <Text style={[styles.zoneBadgeText, { color: tone.border }]}>{tone.label}</Text>
            </View>
            <Text style={styles.zoneText}>{zone}</Text>
          </View>
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>합계</Text>
          <Text style={styles.totalValue}>{won(totalQty)}</Text>
        </View>
      </View>

      <View
        style={styles.autoBadge}
        accessibilityRole="text"
        accessibilityLabel={`${getFullRegionName(region)} 자동 확인 총 ${totalQty}포`}
      >
        <Feather name="check-circle" size={16} color={COLORS.success} />
        <Text style={styles.autoBadgeText}>자동 확인 (총 {won(totalQty)}포)</Text>
      </View>

      <View style={styles.aggRow}>
        <View style={styles.aggCol}>
          <Text style={styles.aggLabel}>기초포수</Text>
          <Text style={styles.aggValue}>{won(agg.basicQty)}</Text>
        </View>
        <View style={styles.aggDivider} />
        <View style={styles.aggCol}>
          <Text style={styles.aggLabel}>차상위포수</Text>
          <Text style={styles.aggValue}>{won(agg.povertyQty)}</Text>
        </View>
      </View>

      <Text style={styles.autoHint}>지역포수가 입력되면 포수입력이 자동 확정됩니다.</Text>
    </View>
  );
}

interface RegionInputCardProps {
  region: string;
  zone: string;
  savedBasic: number | '';
  savedPoverty: number | '';
  agg: AggOrder;
  isClosed: boolean;
  onSave: (region: string, basic: number | '', poverty: number | '') => Promise<void>;
}

// 복수 회원사 지역 — 기초/차상위 입력칸 + 저장. admin 미입력 시 합산중 배지, 불일치 경고.
function RegionInputCard({ region, zone, savedBasic, savedPoverty, agg, isClosed, onSave }: RegionInputCardProps) {
  const [basic, setBasic] = useState<string>(isEmptyQty(savedBasic) ? '' : String(savedBasic));
  const [poverty, setPoverty] = useState<string>(isEmptyQty(savedPoverty) ? '' : String(savedPoverty));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const seoul = isSeoulRegion(region);
  const tone = seoul
    ? { border: COLORS.seoul, tint: COLORS.seoulBg, label: '서울' }
    : { border: COLORS.gyeonggi, tint: COLORS.gyeonggiBg, label: '경기' };

  const basicNum = basic === '' ? 0 : Number(basic);
  const povertyNum = poverty === '' ? 0 : Number(poverty);

  // admin 미입력 시 회원사 합으로 자동 대체(웹 getEffectiveOrder와 동일).
  const effBasic = basic === '' ? agg.basicQty : basicNum;
  const effPoverty = poverty === '' ? agg.povertyQty : povertyNum;
  const totalQty = effBasic + effPoverty;
  const aggTotal = agg.basicQty + agg.povertyQty;

  const hasAdminInput = basic !== '' || poverty !== '';
  // admin값과 회원사합 불일치(입력된 필드만 비교)
  const conflictBasic = basic !== '' && basicNum !== agg.basicQty;
  const conflictPoverty = poverty !== '' && povertyNum !== agg.povertyQty;
  const hasConflict = hasAdminInput && aggTotal > 0 && (conflictBasic || conflictPoverty);

  const dirty = basic !== (isEmptyQty(savedBasic) ? '' : String(savedBasic))
    || poverty !== (isEmptyQty(savedPoverty) ? '' : String(savedPoverty));

  const handleSave = async () => {
    if (isClosed || saving) return;
    Keyboard.dismiss();
    setSaving(true);
    setJustSaved(false);
    try {
      await onSave(region, basic === '' ? '' : Number(basic), poverty === '' ? '' : Number(poverty));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      console.error('포수 저장 실패:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, { borderLeftColor: hasConflict ? COLORS.danger : tone.border }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.regionName}>{getFullRegionName(region)}</Text>
          <View style={styles.zoneRow}>
            <View style={[styles.zoneBadge, { backgroundColor: tone.tint }]}>
              <Text style={[styles.zoneBadgeText, { color: tone.border }]}>{tone.label}</Text>
            </View>
            <Text style={styles.zoneText}>{zone}</Text>
          </View>
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>합계</Text>
          <Text style={styles.totalValue}>{won(totalQty)}</Text>
        </View>
      </View>

      {/* 상태 배지: 불일치 > 합산중(미입력) > 확정 */}
      {hasConflict ? (
        <View
          style={[styles.stateBadge, styles.stateBadgeDanger]}
          accessibilityRole="text"
          accessibilityLabel={`${getFullRegionName(region)} 불일치 경고. 본사 ${totalQty}포, 회원사 합 ${aggTotal}포`}
        >
          <Feather name="alert-triangle" size={15} color={COLORS.danger} />
          <Text style={[styles.stateBadgeText, { color: COLORS.danger }]}>
            불일치 — 회원사 합 {won(aggTotal)}포
          </Text>
        </View>
      ) : !hasAdminInput ? (
        <View
          style={[styles.stateBadge, styles.stateBadgeMuted]}
          accessibilityRole="text"
          accessibilityLabel={`${getFullRegionName(region)} 회원사 실적 합산중 총 ${aggTotal}포`}
        >
          <Feather name="loader" size={15} color={COLORS.textMuted} />
          <Text style={[styles.stateBadgeText, { color: COLORS.textMuted }]}>
            회원사 실적 합산중 (총 {won(aggTotal)}포)
          </Text>
        </View>
      ) : (
        <View
          style={[styles.stateBadge, styles.stateBadgeOk]}
          accessibilityRole="text"
          accessibilityLabel={`${getFullRegionName(region)} 검증 완료 총 ${totalQty}포`}
        >
          <Feather name="check-circle" size={15} color={COLORS.brandDark} />
          <Text style={[styles.stateBadgeText, { color: COLORS.brandDark }]}>
            검증 완료 (총 {won(totalQty)}포)
          </Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <View style={styles.inputCol}>
          <Text style={styles.inputLabel}>기초포수</Text>
          <TextInput
            value={basic}
            onChangeText={(t) => setBasic(sanitizeQty(t))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={won(agg.basicQty)}
            placeholderTextColor={COLORS.textMuted}
            editable={!isClosed}
            style={[
              styles.input,
              conflictBasic && styles.inputConflict,
              isClosed && styles.inputDisabled,
            ]}
            accessibilityLabel={`${getFullRegionName(region)} 기초포수 입력, 비우면 회원사 합 ${agg.basicQty}포 자동 적용`}
            returnKeyType="done"
          />
        </View>
        <View style={styles.inputCol}>
          <Text style={styles.inputLabel}>차상위포수</Text>
          <TextInput
            value={poverty}
            onChangeText={(t) => setPoverty(sanitizeQty(t))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={won(agg.povertyQty)}
            placeholderTextColor={COLORS.textMuted}
            editable={!isClosed}
            style={[
              styles.input,
              conflictPoverty && styles.inputConflict,
              isClosed && styles.inputDisabled,
            ]}
            accessibilityLabel={`${getFullRegionName(region)} 차상위포수 입력, 비우면 회원사 합 ${agg.povertyQty}포 자동 적용`}
            returnKeyType="done"
          />
        </View>
      </View>

      <Text style={styles.autoHint}>비우면 회원사 실적 합계로 자동 대체됩니다.</Text>

      <Pressable
        onPress={handleSave}
        disabled={isClosed || saving || (!dirty && !justSaved)}
        style={({ pressed }) => [
          styles.saveBtn,
          justSaved && styles.saveBtnDone,
          (isClosed || (!dirty && !justSaved)) && styles.saveBtnDisabled,
          pressed && !isClosed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${getFullRegionName(region)} 저장`}
      >
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : justSaved ? (
          <>
            <Feather name="check-circle" size={16} color={COLORS.white} />
            <Text style={styles.saveBtnText}>저장됨</Text>
          </>
        ) : (
          <>
            <Feather name="save" size={16} color={COLORS.white} />
            <Text style={styles.saveBtnText}>저장</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

export default function OrdersScreen() {
  const { currentMonth, orders, partnerInputs, regions, isClosed, isLoading, saveOrder } = useData();

  // 지역별 회원사 실적 합계(웹 partnerAggregatedOrders 동일).
  const aggByRegion = useMemo(() => {
    const agg: Record<string, AggOrder> = {};
    REGION_ORDER.forEach((r) => { agg[r] = { basicQty: 0, povertyQty: 0 }; });
    Object.values(partnerInputs || {}).forEach((regionsData) => {
      Object.entries(regionsData || {}).forEach(([region, d]) => {
        if (!agg[region]) agg[region] = { basicQty: 0, povertyQty: 0 };
        agg[region].basicQty += Number(d?.basicQty) || 0;
        agg[region].povertyQty += Number(d?.povertyQty) || 0;
      });
    });
    return agg;
  }, [partnerInputs]);

  // 유효주문 합계(admin값 우선, 없으면 회원사 합) — 상단 총계.
  const grandTotal = useMemo(
    () => REGION_ORDER.reduce((sum, r) => {
      const o: SavedOrder = orders[r] || {};
      const agg = aggByRegion[r] || { basicQty: 0, povertyQty: 0 };
      const eb = isEmptyQty(o.basicQty) ? agg.basicQty : toNum(o.basicQty);
      const ep = isEmptyQty(o.povertyQty) ? agg.povertyQty : toNum(o.povertyQty);
      return sum + eb + ep;
    }, 0),
    [orders, aggByRegion],
  );

  const handleSave = async (region: string, basic: number | '', poverty: number | '') => {
    await saveOrder(region, { basicQty: basic, povertyQty: poverty });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>포수 정보를 불러오는 중…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* 헤더 카드 */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="clipboard" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>포수 입력</Text>
          <Text style={styles.headerSub}>{formatMonth(currentMonth)} · 전체 {won(grandTotal)}포</Text>
        </View>
      </View>

      {isClosed && (
        <View style={styles.closedBanner}>
          <Feather name="lock" size={15} color={COLORS.warning} />
          <Text style={styles.closedText}>마감된 월입니다. 입력이 잠겨 있습니다.</Text>
        </View>
      )}

      {REGION_ORDER.map((r) => {
        const partners = PARTNER_REGIONS_INVERSE[r] || [];
        const agg = aggByRegion[r] || { basicQty: 0, povertyQty: 0 };
        const zone = regions[r] || '2급지';

        // 단일 회원사 지역 → 지역포수 입력 시 자동 확정(읽기전용 배지).
        if (partners.length === 1) {
          return <RegionAggCard key={r} region={r} zone={zone} agg={agg} />;
        }

        // 복수 회원사 지역 → 기존처럼 입력 + 저장.
        return (
          <RegionInputCard
            key={r}
            region={r}
            zone={zone}
            savedBasic={orders[r]?.basicQty ?? ''}
            savedPoverty={orders[r]?.povertyQty ?? ''}
            agg={agg}
            isClosed={isClosed}
            onSave={handleSave}
          />
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
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },

  closedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.warningLight, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  closedText: { fontSize: 13, fontWeight: '700', color: COLORS.warning, flex: 1 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  regionName: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  zoneBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  zoneBadgeText: { fontSize: 11, fontWeight: '800' },
  zoneText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },

  totalBox: { alignItems: 'flex-end' },
  totalLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  totalValue: { fontSize: 18, fontWeight: '900', color: COLORS.brandDark, fontVariant: ['tabular-nums'], marginTop: 2 },

  // 상태 배지(복수 회원사 지역)
  stateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14,
  },
  stateBadgeOk: { backgroundColor: COLORS.infoLight },
  stateBadgeMuted: { backgroundColor: COLORS.surfaceAlt },
  stateBadgeDanger: { backgroundColor: COLORS.dangerLight },
  stateBadgeText: { fontSize: 13, fontWeight: '800', flex: 1, fontVariant: ['tabular-nums'] },

  // 자동 확인 배지(단일 회원사 지역)
  autoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: COLORS.successLight, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, marginBottom: 14,
  },
  autoBadgeText: { fontSize: 14, fontWeight: '900', color: COLORS.success, fontVariant: ['tabular-nums'] },

  // 자동 확인 수량 표시(읽기전용)
  aggRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, paddingVertical: 12, marginBottom: 10,
  },
  aggCol: { flex: 1, alignItems: 'center', gap: 4 },
  aggDivider: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.border, marginVertical: 4 },
  aggLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  aggValue: { fontSize: 18, fontWeight: '900', color: COLORS.text, fontVariant: ['tabular-nums'] },

  autoHint: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginBottom: 14, marginLeft: 2 },

  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  inputCol: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 6, marginLeft: 2 },
  input: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 48,
    fontSize: 17, fontWeight: '800', color: COLORS.text, textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  inputConflict: { borderColor: COLORS.danger, backgroundColor: COLORS.dangerLight, color: COLORS.danger },
  inputDisabled: { backgroundColor: COLORS.border, color: COLORS.textMuted },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.brand, borderRadius: 12, paddingVertical: 13, minHeight: 48,
  },
  saveBtnDone: { backgroundColor: COLORS.success },
  saveBtnDisabled: { backgroundColor: COLORS.textMuted, opacity: 0.45 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  pressed: { opacity: 0.7 },
});
