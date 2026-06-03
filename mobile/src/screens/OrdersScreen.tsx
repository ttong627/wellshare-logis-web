import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  ActivityIndicator, StyleSheet, Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import {
  COLORS, REGION_ORDER, getFullRegionName, isSeoulRegion, won,
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

interface RegionCardProps {
  region: string;
  zone: string;
  savedBasic: number | '';
  savedPoverty: number | '';
  isClosed: boolean;
  onSave: (region: string, basic: number | '', poverty: number | '') => Promise<void>;
}

function RegionCard({ region, zone, savedBasic, savedPoverty, isClosed, onSave }: RegionCardProps) {
  const [basic, setBasic] = useState<string>(savedBasic === '' || savedBasic === undefined ? '' : String(savedBasic));
  const [poverty, setPoverty] = useState<string>(savedPoverty === '' || savedPoverty === undefined ? '' : String(savedPoverty));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const seoul = isSeoulRegion(region);
  const tone = seoul
    ? { border: COLORS.seoul, tint: COLORS.seoulBg, label: '서울' }
    : { border: COLORS.gyeonggi, tint: COLORS.gyeonggiBg, label: '경기' };

  const basicNum = basic === '' ? 0 : Number(basic);
  const povertyNum = poverty === '' ? 0 : Number(poverty);
  const totalQty = basicNum + povertyNum;

  const dirty = basic !== (savedBasic === '' || savedBasic === undefined ? '' : String(savedBasic))
    || poverty !== (savedPoverty === '' || savedPoverty === undefined ? '' : String(savedPoverty));

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

      <View style={styles.inputRow}>
        <View style={styles.inputCol}>
          <Text style={styles.inputLabel}>기초포수</Text>
          <TextInput
            value={basic}
            onChangeText={(t) => setBasic(sanitizeQty(t))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="0"
            placeholderTextColor={COLORS.textMuted}
            editable={!isClosed}
            style={[styles.input, isClosed && styles.inputDisabled]}
            accessibilityLabel={`${getFullRegionName(region)} 기초포수 입력`}
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
            placeholder="0"
            placeholderTextColor={COLORS.textMuted}
            editable={!isClosed}
            style={[styles.input, isClosed && styles.inputDisabled]}
            accessibilityLabel={`${getFullRegionName(region)} 차상위포수 입력`}
            returnKeyType="done"
          />
        </View>
      </View>

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
  const { currentMonth, orders, regions, isClosed, isLoading, saveOrder } = useData();

  const handleSave = async (region: string, basic: number | '', poverty: number | '') => {
    await saveOrder(region, { basicQty: basic, povertyQty: poverty });
  };

  const grandTotal = useMemo(
    () => REGION_ORDER.reduce((sum, r) => {
      const o = orders[r] || {};
      return sum + toNum(o.basicQty) + toNum(o.povertyQty);
    }, 0),
    [orders],
  );

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

      {REGION_ORDER.map((r) => (
        <RegionCard
          key={r}
          region={r}
          zone={regions[r] || '2급지'}
          savedBasic={orders[r]?.basicQty ?? ''}
          savedPoverty={orders[r]?.povertyQty ?? ''}
          isClosed={isClosed}
          onSave={handleSave}
        />
      ))}
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

  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  inputCol: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 6, marginLeft: 2 },
  input: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 48,
    fontSize: 17, fontWeight: '800', color: COLORS.text, textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
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
