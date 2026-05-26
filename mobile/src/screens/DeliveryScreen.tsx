import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { PARTNER_REGIONS, MEMBERS, COLORS } from '../constants';

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.monthLabel}>{formattedMonth}</Text>

      {isAdmin && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity
            onPress={() => setSelectedCompany('')}
            style={[styles.chip, !selectedCompany && styles.chipActive]}
          >
            <Text style={[styles.chipText, !selectedCompany && styles.chipTextActive]}>전체</Text>
          </TouchableOpacity>
          {MEMBERS.map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => setSelectedCompany(selectedCompany === m ? '' : m)}
              style={[styles.chip, selectedCompany === m && styles.chipActive]}
            >
              <Text style={[styles.chipText, selectedCompany === m && styles.chipTextActive]} numberOfLines={1}>
                {m.replace('사회적협동조합 ', '').replace(' 협동조합', '')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {targetCompanies.filter(c => (PARTNER_REGIONS[c] || []).length > 0).map(company => {
        const regions = PARTNER_REGIONS[company] || [];
        return (
          <View key={company} style={styles.companyCard}>
            {isAdmin && (
              <Text style={styles.companyName}>🏢 {company}</Text>
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

              return (
                <View key={region} style={styles.regionRow}>
                  <View style={styles.regionHeader}>
                    <View>
                      <Text style={styles.regionName}>{region}</Text>
                      <Text style={styles.qtyLabel}>배정 {pQty}포</Text>
                    </View>
                    {isSavedInDB ? (
                      <View style={styles.doneBadge}>
                        <Text style={styles.doneText}>✅ {dbData.date}</Text>
                        {dbData.delayDays ? <Text style={styles.doneText}> 지체 {dbData.delayDays}일</Text> : null}
                      </View>
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>❌ 미완료</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 2 }]}>
                      <Text style={styles.inputLabel}>완료일자 (YYYY-MM-DD)</Text>
                      <TextInput
                        style={styles.input}
                        value={displayDate}
                        onChangeText={v => handleChange(company, region, 'date', v)}
                        placeholder="2025-05-15"
                        placeholderTextColor={COLORS.textMuted}
                        editable={!isClosed || isAdmin}
                        keyboardType="numeric"
                        maxLength={10}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>지체일수</Text>
                      <TextInput
                        style={styles.input}
                        value={displayDelay}
                        onChangeText={v => handleChange(company, region, 'delayDays', v)}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        editable={!isClosed || isAdmin}
                        keyboardType="numeric"
                        maxLength={3}
                      />
                    </View>
                  </View>

                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={[styles.saveBtn, (isSavingThis || (isClosed && !isAdmin)) && styles.btnDisabled]}
                      onPress={() => handleSave(company, region)}
                      disabled={isSavingThis || (isClosed && !isAdmin)}
                    >
                      {isSavingThis
                        ? <ActivityIndicator size="small" color={COLORS.white} />
                        : <Text style={styles.saveBtnText}>{isSavedInDB ? '수정' : '저장'}</Text>
                      }
                    </TouchableOpacity>
                    {isSavedInDB && (
                      <TouchableOpacity
                        style={[styles.clearBtn, (isClosed && !isAdmin) && styles.btnDisabled]}
                        onPress={() => handleClear(company, region)}
                        disabled={isClosed && !isAdmin}
                      >
                        <Text style={styles.clearBtnText}>취소</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 14, gap: 12 },
  monthLabel: { fontSize: 14, fontWeight: '800', color: COLORS.textMuted, textAlign: 'center', marginBottom: 4 },
  filterRow: { flexGrow: 0, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.card, marginRight: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  chipTextActive: { color: COLORS.white },
  companyCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
  },
  companyName: {
    backgroundColor: '#f8fafc', padding: 12,
    fontWeight: '800', fontSize: 13, color: COLORS.text,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  regionRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  regionName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  qtyLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },
  doneBadge: { backgroundColor: COLORS.accentLight, padding: 6, borderRadius: 8, alignItems: 'flex-end' },
  doneText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  pendingBadge: { backgroundColor: COLORS.dangerLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  pendingText: { fontSize: 11, fontWeight: '700', color: COLORS.danger },
  inputRow: { flexDirection: 'row', gap: 8 },
  inputGroup: { flex: 1, gap: 4 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10,
    padding: 10, fontSize: 13, fontWeight: '700',
    color: COLORS.text, backgroundColor: COLORS.bg,
  },
  btnRow: { flexDirection: 'row', gap: 8 },
  saveBtn: {
    flex: 1, backgroundColor: COLORS.accent, borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  clearBtn: {
    flex: 1, backgroundColor: COLORS.danger, borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  saveBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },
  clearBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },
});
