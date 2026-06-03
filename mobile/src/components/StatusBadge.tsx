import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
export type BadgeStatus = 'wait' | 'progress' | 'requested' | 'done';

// 색맹 대비: 색 + 아이콘 + 텍스트 3중 표기(색만으로 의미 전달 금지).
const MAP: Record<BadgeStatus, { label: string; icon: FeatherName; color: string; bg: string }> = {
  wait:      { label: '대기',     icon: 'clock',         color: COLORS.textMuted, bg: COLORS.surfaceAlt },
  progress:  { label: '입력완료', icon: 'check',         color: COLORS.brandDark, bg: COLORS.infoLight },
  requested: { label: '발행대기', icon: 'alert-circle',  color: COLORS.warning,   bg: COLORS.warningLight },
  done:      { label: '완료',     icon: 'check-circle',  color: COLORS.success,   bg: COLORS.successLight },
};

export default function StatusBadge({ status, label }: { status: BadgeStatus; label?: string }) {
  const s = MAP[status];
  return (
    <View
      style={[styles.badge, { backgroundColor: s.bg }]}
      accessibilityRole="text"
      accessibilityLabel={label ?? s.label}
    >
      <Feather name={s.icon} size={12} color={s.color} />
      <Text style={[styles.text, { color: s.color }]}>{label ?? s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '800' },
});
