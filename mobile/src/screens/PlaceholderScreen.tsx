import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

// 다음 업데이트에서 채워질 화면의 일관된 안내(빈 상태). 색맹대비 아이콘+텍스트.
export function Placeholder({ icon, title, desc, items }: {
  icon: FeatherName; title: string; desc: string; items: string[];
}) {
  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={34} color={COLORS.brand} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.desc}>{desc}</Text>
      <View style={styles.card}>
        {items.map((t) => (
          <View key={t} style={styles.row}>
            <Feather name="check-circle" size={16} color={COLORS.success} />
            <Text style={styles.rowText}>{t}</Text>
          </View>
        ))}
      </View>
      <View style={styles.badge}>
        <Feather name="clock" size={13} color={COLORS.warning} />
        <Text style={styles.badgeText}>다음 업데이트에서 제공 예정</Text>
      </View>
    </ScrollView>
  );
}

export function StatementScreen() {
  return (
    <Placeholder
      icon="list"
      title="정산 내역 확인"
      desc="이번 달 내 정산·계산서 발행 상태를 한눈에 확인합니다."
      items={['지역별 공급가·세액·합계', '계산서 발행 상태 배지', '월별 내역 조회']}
    />
  );
}

export function SettlementScreen() {
  return (
    <Placeholder
      icon="credit-card"
      title="정산 · 결제"
      desc="파트너 지급 현황과 결제 내역을 관리합니다."
      items={['파트너별 지급 현황', '결제 완료/대기 상태', '월별 정산 합계']}
    />
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { alignItems: 'center', padding: 28, paddingTop: 48 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.infoLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginBottom: 8 },
  desc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 24, fontWeight: '600' },
  card: {
    width: '100%', backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 8, marginBottom: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10 },
  rowText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.warningLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: COLORS.warning },
});
