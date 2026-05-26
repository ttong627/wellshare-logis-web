import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { addDoc, collection, setDoc, doc } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { PARTNER_REGIONS, MEMBERS, COLORS } from '../constants';

export default function BillingScreen() {
  const { isAdmin, partnerCompany, user } = useAuth();
  const { publishRequests, publishDates, deliveryDates, isClosed, currentMonth, loadMonth } = useData();
  const [saving, setSaving] = useState<string | null>(null);
  const [localDate, setLocalDate] = useState<Record<string, string>>({});
  const [selectedCompany, setSelectedCompany] = useState('');

  const targetCompanies = isAdmin
    ? (selectedCompany ? [selectedCompany] : MEMBERS)
    : [partnerCompany || ''];

  const handleIssue = async (company: string, region: string) => {
    const key = `${company}::${region}`;
    const date = localDate[key] || '';
    if (!date) {
      Alert.alert('입력 오류', '발급 일자를 입력해주세요. (YYYY-MM-DD)');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('입력 오류', '날짜를 YYYY-MM-DD 형식으로 입력해주세요.');
      return;
    }

    setSaving(key);
    try {
      const newPublishDates = {
        ...publishDates,
        [company]: { ...(publishDates[company] || {}), [region]: date },
      };
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, { publishDates: newPublishDates, updatedAt: new Date().toISOString(), updatedBy: user?.email }, { merge: true });

      const msg = `[🧾발행완료] ${company} ${region} 세금계산서(${date}) 발행이 완료되었습니다. 대금 결제 부탁드립니다.`;
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
        message: msg, target: 'ADMIN', timestamp: new Date().toISOString(),
      });

      setLocalDate(prev => { const n = { ...prev }; delete n[key]; return n; });
      await loadMonth(currentMonth);
      Alert.alert('발급 완료', `[${region}] 세금계산서가 발급 처리되었습니다.`);
    } catch (e: any) {
      Alert.alert('오류', e.message);
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
              const reqDate = publishRequests[company]?.[region];
              const pubDate = publishDates[company]?.[region];
              const isDelivered = !!deliveryDates[company]?.[region]?.date;
              const isSavingThis = saving === key;

              let statusBadge: React.ReactElement;
              if (pubDate) {
                statusBadge = (
                  <View style={styles.issuedBadge}>
                    <Text style={styles.issuedText}>✅ {pubDate} 발급완료</Text>
                  </View>
                );
              } else if (reqDate) {
                statusBadge = (
                  <View style={styles.reqBadge}>
                    <Text style={styles.reqText}>📋 {reqDate} 요청됨</Text>
                  </View>
                );
              } else {
                statusBadge = (
                  <View style={styles.waitBadge}>
                    <Text style={styles.waitText}>⏳ {isDelivered ? '요청대기' : '배송전'}</Text>
                  </View>
                );
              }

              return (
                <View key={region} style={styles.regionRow}>
                  <View style={styles.regionHeader}>
                    <Text style={styles.regionName}>{region}</Text>
                    {statusBadge}
                  </View>

                  {/* Partner can issue when admin has requested */}
                  {!isAdmin && reqDate && !pubDate && (
                    <View style={styles.issueArea}>
                      <TextInput
                        style={styles.dateInput}
                        value={localDate[key] || ''}
                        onChangeText={v => setLocalDate(prev => ({ ...prev, [key]: v }))}
                        placeholder="발급일자 YYYY-MM-DD"
                        placeholderTextColor={COLORS.textMuted}
                        editable={!isClosed}
                        keyboardType="numeric"
                        maxLength={10}
                      />
                      <TouchableOpacity
                        style={[styles.issueBtn, (isSavingThis || isClosed) && styles.btnDisabled]}
                        onPress={() => handleIssue(company, region)}
                        disabled={isSavingThis || isClosed}
                      >
                        {isSavingThis
                          ? <ActivityIndicator size="small" color={COLORS.white} />
                          : <Text style={styles.issueBtnText}>발급</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Admin can issue for partner */}
                  {isAdmin && reqDate && !pubDate && (
                    <View style={styles.issueArea}>
                      <TextInput
                        style={styles.dateInput}
                        value={localDate[key] || ''}
                        onChangeText={v => setLocalDate(prev => ({ ...prev, [key]: v }))}
                        placeholder="발급일자 YYYY-MM-DD"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                        maxLength={10}
                      />
                      <TouchableOpacity
                        style={[styles.issueBtn, isSavingThis && styles.btnDisabled]}
                        onPress={() => handleIssue(company, region)}
                        disabled={isSavingThis}
                      >
                        {isSavingThis
                          ? <ActivityIndicator size="small" color={COLORS.white} />
                          : <Text style={styles.issueBtnText}>발급처리</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  )}
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
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  regionName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  issuedBadge: { backgroundColor: COLORS.accentLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  issuedText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  reqBadge: { backgroundColor: COLORS.warningLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  reqText: { fontSize: 11, fontWeight: '700', color: COLORS.warning },
  waitBadge: { backgroundColor: COLORS.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  waitText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  issueArea: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dateInput: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10,
    padding: 10, fontSize: 13, fontWeight: '700',
    color: COLORS.text, backgroundColor: COLORS.bg,
  },
  issueBtn: {
    backgroundColor: COLORS.info, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  issueBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
});
