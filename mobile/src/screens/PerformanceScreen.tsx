import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { PARTNER_REGIONS, MEMBERS, COLORS } from '../constants';

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
              const dbData = partnerInputs[company]?.[region] || {};
              const local = localInputs[key];
              const basicVal = local?.basicQty !== undefined ? local.basicQty : (dbData.basicQty !== undefined && dbData.basicQty !== '' ? String(dbData.basicQty) : '');
              const povertyVal = local?.povertyQty !== undefined ? local.povertyQty : (dbData.povertyQty !== undefined && dbData.povertyQty !== '' ? String(dbData.povertyQty) : '');
              const hasData = (dbData.basicQty !== undefined && dbData.basicQty !== '') || (dbData.povertyQty !== undefined && dbData.povertyQty !== '');
              const isDirty = local !== undefined;
              const isSavingThis = saving === key;

              return (
                <View key={region} style={styles.regionRow}>
                  <View style={styles.regionHeader}>
                    <Text style={styles.regionName}>{region}</Text>
                    {hasData && !isDirty && (
                      <View style={styles.savedBadge}>
                        <Text style={styles.savedText}>✅ 저장됨</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>차상위</Text>
                      <TextInput
                        style={styles.input}
                        value={povertyVal}
                        onChangeText={v => handleChange(company, region, 'povertyQty', v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        editable={!isClosed || isAdmin}
                        selectTextOnFocus
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>수급자</Text>
                      <TextInput
                        style={styles.input}
                        value={basicVal}
                        onChangeText={v => handleChange(company, region, 'basicQty', v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        editable={!isClosed || isAdmin}
                        selectTextOnFocus
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.saveBtn, (isSavingThis || (isClosed && !isAdmin)) && styles.saveBtnDisabled]}
                      onPress={() => handleSave(company, region)}
                      disabled={isSavingThis || (isClosed && !isAdmin)}
                    >
                      {isSavingThis
                        ? <ActivityIndicator size="small" color={COLORS.white} />
                        : <Text style={styles.saveBtnText}>저장</Text>
                      }
                    </TouchableOpacity>
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
  regionRow: {
    padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  regionName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  savedBadge: { backgroundColor: COLORS.accentLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  savedText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  inputGroup: { flex: 1, gap: 4 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10,
    padding: 10, fontSize: 16, fontWeight: '800',
    color: COLORS.text, backgroundColor: COLORS.bg, textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: COLORS.accent, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    justifyContent: 'center', alignItems: 'center',
    minWidth: 56,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },
});
