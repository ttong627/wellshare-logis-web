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

export default function DeliveryScreen() {
  const { isAdmin, partnerCompany } = useAuth();
  const { deliveryDates, partnerInputs, isClosed, saveDelivery, clearDelivery, currentMonth } = useData();
  const [saving, setSaving] = useState<string | null>(null);
  const [localInputs, setLocalInputs] = useState<Record<string, { date: string; delayDays: string }>>({});
  const [selectedCompany, setSelectedCompany] = useState('');

  const targetCompanies = isAdmin
    ? (selectedCompany ? [selectedCompany] : MEMBERS)
    : [partnerCompany || ''];

  const handleChange = (company: string, region: string, field: 'date' | 'delayDays', value: string) => {
    const key = `${company}::${region}`;
    setLocalInputs(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { date: '', delayDays: '' }), [field]: value },
    }));
  };

  const handleSave = async (company: string, region: string) => {
    if (isClosed && !isAdmin) {
      Alert.alert('마감됨', '이번 달 정산이 마감되었습니다.');
      return;
    }
    const key = `${company}::${region}`;
    const local = localInputs[key] || {};
    const existing = deliveryDates[company]?.[region] || {};
    const date = local.date !== undefined ? local.date : (existing.date || '');
    const delayDays = local.delayDays !== undefined
      ? (local.delayDays === '' ? '' : Number(local.delayDays))
      : (existing.delayDays ?? '');

    if (!date) {
      Alert.alert('입력 오류', '완료 일자를 입력해주세요. (YYYY-MM-DD 형식)');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('입력 오류', '날짜를 YYYY-MM-DD 형식으로 입력해주세요.');
      return;
    }

    setSaving(key);
    try {
      await saveDelivery(company, region, date, delayDays as any);
      setLocalInputs(prev => { const n = { ...prev }; delete n[key]; return n; });
      Alert.alert('저장 완료', `[${region}] 배송 완료가 저장되었습니다.`);
    } catch (e: any) {
      Alert.alert('오류', '저장 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  const handleClear = async (company: string, region: string) => {
    Alert.alert('취소 확인', `[${region}] 배송 완료 내역을 취소하시겠습니까?`, [
      { text: '아니오', style: 'cancel' },
      {
        text: '취소하기', style: 'destructive', onPress: async () => {
          const key = `${company}::${region}`;
          setSaving(key);
          try {
            await clearDelivery(company, region);
          } catch (e: any) {
            Alert.alert('오류', e.message);
          } finally {
            setSaving(null);
          }
        }
      }
    ]);
  };

  const [yr, mo] = currentMonth.split('-');
  const formattedMonth = `${yr}년 ${parseInt(mo, 10)}월`;

  // 진행 현황(현재 표시 대상 기준)
  const visibleCompanies = targetCompanies.filter(c => (PARTNER_REGIONS[c] || []).length > 0);
  let totalRegions = 0;
  let doneRegions = 0;
  visibleCompanies.forEach(company => {
    (PARTNER_REGIONS[company] || []).forEach(region => {
      totalRegions += 1;
      if (deliveryDates[company]?.[region]?.date) doneRegions += 1;
    });
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 헤더 카드 */}
      <View style={styles.headerCard}>
        <View style={styles.headerIcon}>
          <Feather name="truck" size={18} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>배송 완료 입력</Text>
          <Text style={styles.headerSub}>{formattedMonth} · 완료일자 / 지체일수</Text>
        </View>
        {isClosed && (
          <View style={styles.lockChip}>
            <Feather name="lock" size={12} color={COLORS.white} />
            <Text style={styles.lockChipText}>마감</Text>
          </View>
        )}
      </View>

      {/* 진행 카드 */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryTitle}>배송 완료 진행</Text>
            <Text style={styles.summaryValue}>
              {doneRegions}<Text style={styles.summaryTotal}>/{totalRegions}</Text>
              <Text style={styles.summaryUnit}> 지역</Text>
            </Text>
          </View>
          <View style={styles.progressBadge}>
            <Feather
              name={totalRegions > 0 && doneRegions === totalRegions ? 'check-circle' : 'clock'}
              size={14}
              color={COLORS.white}
            />
            <Text style={styles.progressBadgeText}>
              {totalRegions > 0 ? Math.round((doneRegions / totalRegions) * 100) : 0}%
            </Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${totalRegions > 0 ? (doneRegions / totalRegions) * 100 : 0}%` }]} />
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
                const dbData = deliveryDates[company]?.[region] || {};
                const local = localInputs[key];
                const isSavedInDB = !!dbData.date;
                const displayDate = local?.date !== undefined ? local.date : (dbData.date || '');
                const displayDelay = local?.delayDays !== undefined ? local.delayDays : (dbData.delayDays !== undefined && dbData.delayDays !== '' ? String(dbData.delayDays) : '');
                const pData = partnerInputs[company]?.[region] || {};
                const pQty = (Number(pData.basicQty) || 0) + (Number(pData.povertyQty) || 0);
                const isSavingThis = saving === key;
                const seoul = isSeoulRegion(region);
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
                      <StatusBadge status={isSavedInDB ? 'done' : 'wait'} label={isSavedInDB ? '완료' : '미완료'} />
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Feather name="package" size={12} color={COLORS.textMuted} />
                        <Text style={styles.metaText}>배정 <Text style={styles.metaStrong}>{pQty}</Text>포</Text>
                      </View>
                      {isSavedInDB && (
                        <View style={styles.metaItem}>
                          <Feather name="calendar" size={12} color={COLORS.success} />
                          <Text style={[styles.metaText, { color: COLORS.success }]}>
                            {dbData.date}
                            {dbData.delayDays ? `  ·  지체 ${dbData.delayDays}일` : ''}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.inputRow}>
                      <View style={[styles.inputGroup, { flex: 2 }]}>
                        <Text style={styles.inputLabel}>완료일자 (YYYY-MM-DD)</Text>
                        <TextInput
                          style={[styles.input, !editable && styles.inputDisabled]}
                          value={displayDate}
                          onChangeText={v => handleChange(company, region, 'date', v)}
                          placeholder="2025-05-15"
                          placeholderTextColor={COLORS.textMuted}
                          editable={editable}
                          keyboardType="numeric"
                          maxLength={10}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>지체일수</Text>
                        <TextInput
                          style={[styles.input, styles.inputCenter, !editable && styles.inputDisabled]}
                          value={displayDelay}
                          onChangeText={v => handleChange(company, region, 'delayDays', v)}
                          placeholder="0"
                          placeholderTextColor={COLORS.textMuted}
                          editable={editable}
                          keyboardType="numeric"
                          maxLength={3}
                        />
                      </View>
                    </View>

                    <View style={styles.btnRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.saveBtn,
                          (isSavingThis || (isClosed && !isAdmin)) && styles.btnDisabled,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => handleSave(company, region)}
                        disabled={isSavingThis || (isClosed && !isAdmin)}
                        accessibilityRole="button" accessibilityLabel={`${region} ${isSavedInDB ? '수정' : '저장'}`}>
                        {isSavingThis
                          ? <ActivityIndicator size="small" color={COLORS.white} />
                          : <>
                              <Feather name={isSavedInDB ? 'edit-2' : 'check'} size={14} color={COLORS.white} />
                              <Text style={styles.saveBtnText}>{isSavedInDB ? '수정' : '저장'}</Text>
                            </>
                        }
                      </Pressable>
                      {isSavedInDB && (
                        <Pressable
                          style={({ pressed }) => [
                            styles.clearBtn,
                            (isClosed && !isAdmin) && styles.btnDisabled,
                            pressed && { opacity: 0.7 },
                          ]}
                          onPress={() => handleClear(company, region)}
                          disabled={isClosed && !isAdmin}
                          accessibilityRole="button" accessibilityLabel={`${region} 취소`}>
                          <Feather name="x" size={14} color={COLORS.danger} />
                          <Text style={styles.clearBtnText}>취소</Text>
                        </Pressable>
                      )}
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

  summaryCard: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, gap: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { color: COLORS.border, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  summaryValue: { color: COLORS.white, fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryTotal: { color: COLORS.border, fontSize: 16, fontWeight: '800' },
  summaryUnit: { color: COLORS.border, fontSize: 13, fontWeight: '700' },
  progressBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  progressBadgeText: { color: COLORS.white, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 999, backgroundColor: COLORS.white },

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

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  metaStrong: { color: COLORS.brandDark, fontWeight: '900' },

  inputRow: { flexDirection: 'row', gap: 10 },
  inputGroup: { flex: 1, gap: 5 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 12, minHeight: 48, fontSize: 15, fontWeight: '700',
    color: COLORS.text, backgroundColor: COLORS.bg, fontVariant: ['tabular-nums'],
  },
  inputCenter: { textAlign: 'center' },
  inputDisabled: { backgroundColor: COLORS.surfaceAlt, color: COLORS.textMuted },

  btnRow: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.brand, borderRadius: 12, minHeight: 48,
  },
  clearBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.dangerLight, borderRadius: 12, minHeight: 48,
    borderWidth: 1, borderColor: COLORS.danger,
  },
  btnDisabled: { opacity: 0.5 },
  saveBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },
  clearBtnText: { color: COLORS.danger, fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontWeight: '800', color: COLORS.text },
});
