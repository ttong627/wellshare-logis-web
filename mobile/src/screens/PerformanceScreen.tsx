import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { PARTNER_REGIONS, MEMBERS, COLORS, isSeoulRegion } from '../constants';
import StatusBadge from '../components/StatusBadge';

export default function PerformanceScreen() {
  const { isAdmin, partnerCompany } = useAuth();
  const { partnerInputs, isClosed, savePerformance, currentMonth } = useData();
  const [saving, setSaving] = useState<string | null>(null);
  const [localInputs, setLocalInputs] = useState<Record<string, { basicQty: string; povertyQty: string }>>({});
  const [selectedCompany, setSelectedCompany] = useState('');

  const targetCompanies = isAdmin
    ? (selectedCompany ? [selectedCompany] : MEMBERS)
    : [partnerCompany || ''];

  const handleChange = (company: string, region: string, field: 'basicQty' | 'povertyQty', value: string) => {
    if (isClosed && !isAdmin) return;
    const key = `${company}::${region}`;
    setLocalInputs(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { basicQty: '', povertyQty: '' }), [field]: value },
    }));
  };

  const handleSave = async (company: string, region: string) => {
    if (isClosed && !isAdmin) {
      Alert.alert('마감됨', '이번 달 정산이 마감되었습니다.');
      return;
    }
    const key = `${company}::${region}`;
    const existing = partnerInputs[company]?.[region] || {};
    const local = localInputs[key] || {};
    const basicQty = local.basicQty !== undefined
      ? (local.basicQty === '' ? '' : Number(local.basicQty.replace(/,/g, '')) || 0)
      : (existing.basicQty ?? '');
    const povertyQty = local.povertyQty !== undefined
      ? (local.povertyQty === '' ? '' : Number(local.povertyQty.replace(/,/g, '')) || 0)
      : (existing.povertyQty ?? '');

    setSaving(key);
    try {
      await savePerformance(company, region, { basicQty: basicQty as any, povertyQty: povertyQty as any });
      setLocalInputs(prev => { const n = { ...prev }; delete n[key]; return n; });
      Alert.alert('저장 완료', `[${region}] 실적이 저장되었습니다.`);
    } catch (e: any) {
      Alert.alert('오류', '저장 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  const [yr, mo] = currentMonth.split('-');
  const formattedMonth = `${yr}년 ${parseInt(mo, 10)}월`;

  // 화면 전체 합계(현재 표시 대상 회사 기준)
  const visibleCompanies = targetCompanies.filter(c => (PARTNER_REGIONS[c] || []).length > 0);
  let totalBasic = 0;
  let totalPoverty = 0;
  visibleCompanies.forEach(company => {
    (PARTNER_REGIONS[company] || []).forEach(region => {
      const d = partnerInputs[company]?.[region] || {};
      totalBasic += Number(d.basicQty) || 0;
      totalPoverty += Number(d.povertyQty) || 0;
    });
  });
  const totalAll = totalBasic + totalPoverty;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 헤더 카드 */}
      <View style={styles.headerCard}>
        <View style={styles.headerIcon}>
          <Feather name="edit-3" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>지역 포수 입력</Text>
          <Text style={styles.headerSub}>{formattedMonth} · 차상위 / 수급자 수량</Text>
        </View>
        {isClosed && (
          <View style={styles.lockChip}>
            <Feather name="lock" size={12} color={COLORS.white} />
            <Text style={styles.lockChipText}>마감</Text>
          </View>
        )}
      </View>

      {/* 합계 카드 */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>입력 합계</Text>
        <View style={styles.summaryGrid}>
          <SummaryCell label="차상위" value={totalPoverty} />
          <SummaryCell label="수급자" value={totalBasic} />
          <SummaryCell label="합계" value={totalAll} strong />
        </View>
      </View>

      {/* 회사 필터 */}
      {isAdmin && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          <Pressable
            onPress={() => setSelectedCompany('')}
            style={({ pressed }) => [styles.chip, !selectedCompany && styles.chipActive, pressed && { opacity: 0.7 }]}
            accessibilityRole="button" accessibilityLabel="전체 회사">
            <Text style={[styles.chipText, !selectedCompany && styles.chipTextActive]}>전체</Text>
          </Pressable>
          {MEMBERS.map(m => {
            const active = selectedCompany === m;
            return (
              <Pressable
                key={m}
                onPress={() => setSelectedCompany(active ? '' : m)}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}
                accessibilityRole="button" accessibilityLabel={m}>
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {m.replace('사회적협동조합 ', '').replace(' 협동조합', '')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {visibleCompanies.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={28} color={COLORS.brand} />
          <Text style={styles.emptyText}>표시할 지역이 없습니다.</Text>
        </View>
      ) : (
        visibleCompanies.map(company => {
          const regions = PARTNER_REGIONS[company] || [];
          return (
            <View key={company} style={styles.companyGroup}>
              {isAdmin && (
                <View style={styles.companyHeader}>
                  <Feather name="home" size={13} color={COLORS.brandDark} />
                  <Text style={styles.companyName} numberOfLines={1}>{company}</Text>
                </View>
              )}
              {regions.map(region => {
                const key = `${company}::${region}`;
                const dbData = partnerInputs[company]?.[region] || {};
                const local = localInputs[key];
                const basicVal = local?.basicQty !== undefined ? local.basicQty : (dbData.basicQty !== undefined && dbData.basicQty !== '' ? String(dbData.basicQty) : '');
                const povertyVal = local?.povertyQty !== undefined ? local.povertyQty : (dbData.povertyQty !== undefined && dbData.povertyQty !== '' ? String(dbData.povertyQty) : '');
                const hasData = (dbData.basicQty !== undefined && dbData.basicQty !== '') || (dbData.povertyQty !== undefined && dbData.povertyQty !== '');
                const isDirty = local !== undefined;
                const isSavingThis = saving === key;
                const seoul = isSeoulRegion(region);
                const rowQty = (Number(basicVal) || 0) + (Number(povertyVal) || 0);
                const editable = !isClosed || isAdmin;

                return (
                  <View key={region} style={[styles.regionCard, { borderLeftColor: seoul ? COLORS.seoul : COLORS.gyeonggi }]}>
                    <View style={styles.regionHeader}>
                      <View style={styles.regionTitleWrap}>
                        <Text style={styles.regionName}>{region}</Text>
                        <View style={[styles.cityTag, { backgroundColor: seoul ? COLORS.seoulBg : COLORS.gyeonggiBg }]}>
                          <Text style={[styles.cityTagText, { color: seoul ? COLORS.seoul : COLORS.gyeonggi }]}>
                            {seoul ? '서울' : '경기'}
                          </Text>
                        </View>
                      </View>
                      {hasData && !isDirty ? (
                        <StatusBadge status="done" label="저장됨" />
                      ) : isDirty ? (
                        <StatusBadge status="progress" label="미저장" />
                      ) : (
                        <StatusBadge status="wait" />
                      )}
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>차상위</Text>
                        <TextInput
                          style={[styles.input, !editable && styles.inputDisabled]}
                          value={povertyVal}
                          onChangeText={v => handleChange(company, region, 'povertyQty', v)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.textMuted}
                          editable={editable}
                          selectTextOnFocus
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>수급자</Text>
                        <TextInput
                          style={[styles.input, !editable && styles.inputDisabled]}
                          value={basicVal}
                          onChangeText={v => handleChange(company, region, 'basicQty', v)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.textMuted}
                          editable={editable}
                          selectTextOnFocus
                        />
                      </View>
                    </View>

                    <View style={styles.rowFooter}>
                      <Text style={styles.rowTotalLabel}>
                        합계 <Text style={styles.rowTotalValue}>{rowQty}</Text>포
                      </Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.saveBtn,
                          (isSavingThis || (isClosed && !isAdmin)) && styles.saveBtnDisabled,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => handleSave(company, region)}
                        disabled={isSavingThis || (isClosed && !isAdmin)}
                        accessibilityRole="button" accessibilityLabel={`${region} 저장`}>
                        {isSavingThis
                          ? <ActivityIndicator size="small" color={COLORS.white} />
                          : <>
                              <Feather name="save" size={14} color={COLORS.white} />
                              <Text style={styles.saveBtnText}>저장</Text>
                            </>
                        }
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function SummaryCell({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryCellLabel}>{label}</Text>
      <Text style={[styles.summaryCellValue, strong && styles.summaryCellValueStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },

  headerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },
  lockChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.danger,
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
  },
  lockChipText: { color: COLORS.white, fontSize: 11, fontWeight: '800' },

  summaryCard: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16 },
  summaryTitle: { color: COLORS.border, fontSize: 12, fontWeight: '800', marginBottom: 10 },
  summaryGrid: { flexDirection: 'row', gap: 8 },
  summaryCell: { flex: 1 },
  summaryCellLabel: { color: COLORS.border, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  summaryCellValue: { color: COLORS.white, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryCellValueStrong: { fontSize: 22 },

  filterRow: { flexGrow: 0 },
  filterContent: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: COLORS.card, minHeight: 40, justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  chipTextActive: { color: COLORS.white },

  companyGroup: { gap: 10 },
  companyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginLeft: 2 },
  companyName: { fontSize: 13, fontWeight: '800', color: COLORS.brandDark, flex: 1 },

  regionCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4, gap: 12,
  },
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  regionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  regionName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  cityTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  cityTagText: { fontSize: 10, fontWeight: '800' },

  inputRow: { flexDirection: 'row', gap: 10 },
  inputGroup: { flex: 1, gap: 5 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 12, minHeight: 48, fontSize: 16, fontWeight: '800',
    color: COLORS.text, backgroundColor: COLORS.bg, textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  inputDisabled: { backgroundColor: COLORS.surfaceAlt, color: COLORS.textMuted },

  rowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTotalLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  rowTotalValue: { fontSize: 15, fontWeight: '900', color: COLORS.brandDark, fontVariant: ['tabular-nums'] },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.brand, borderRadius: 12,
    paddingHorizontal: 20, minHeight: 44, minWidth: 88,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontWeight: '800', color: COLORS.text },
});
