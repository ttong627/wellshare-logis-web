import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

interface Props {
  value: string;                 // "YYYY-MM-DD" 또는 ''
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  defaultMonth?: string;         // "YYYY-MM" — 값이 없을 때 달력이 열릴 월
}

/**
 * 탭하면 달력(월 그리드)이 뜨는 날짜 선택기. 순수 JS(네이티브 의존성 없음).
 * 날짜를 누르면 "YYYY-MM-DD"로 onChange 후 닫힌다.
 */
export default function DatePickerField({ value, onChange, placeholder = '날짜 선택', disabled, defaultMonth }: Props) {
  const [open, setOpen] = useState(false);

  const initialView = () => {
    if (value && isYmd(value)) { const [y, m] = value.split('-'); return { y: +y, m: +m }; }
    if (defaultMonth && /^\d{4}-\d{2}$/.test(defaultMonth)) { const [y, m] = defaultMonth.split('-'); return { y: +y, m: +m }; }
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 };
  };
  const [view, setView] = useState(initialView);

  const openCal = () => { if (!disabled) { setView(initialView()); setOpen(true); } };
  const prev = () => setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }));
  const next = () => setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }));

  const pick = (dateStr: string) => { onChange(dateStr); setOpen(false); };

  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const firstDow = new Date(view.y, view.m - 1, 1).getDay();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return (
    <>
      <Pressable
        onPress={openCal}
        disabled={disabled}
        style={[styles.field, disabled && styles.fieldDisabled]}
        accessibilityRole="button"
        accessibilityLabel={`날짜 선택, 현재 ${value || '미선택'}`}
      >
        <Feather name="calendar" size={16} color={value ? COLORS.brand : COLORS.textMuted} />
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {!disabled && <Feather name="chevron-down" size={16} color={COLORS.textMuted} />}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.calCard} onPress={() => {}}>
            {/* 헤더 — 월 이동 */}
            <View style={styles.calHeader}>
              <Pressable onPress={prev} style={styles.navBtn} hitSlop={10} accessibilityLabel="이전 달">
                <Feather name="chevron-left" size={22} color={COLORS.text} />
              </Pressable>
              <Text style={styles.calTitle}>{view.y}년 {view.m}월</Text>
              <Pressable onPress={next} style={styles.navBtn} hitSlop={10} accessibilityLabel="다음 달">
                <Feather name="chevron-right" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            {/* 요일 */}
            <View style={styles.weekRow}>
              {WEEKDAYS.map((w, i) => (
                <Text key={w} style={[styles.weekday, i === 0 && { color: COLORS.danger }, i === 6 && { color: COLORS.brand }]}>{w}</Text>
              ))}
            </View>

            {/* 날짜 그리드 */}
            <View style={styles.grid}>
              {Array.from({ length: firstDow }).map((_, i) => <View key={`b${i}`} style={styles.cell} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${view.y}-${pad(view.m)}-${pad(day)}`;
                const selected = dateStr === value;
                const isToday = dateStr === todayStr;
                const dow = (firstDow + i) % 7;
                return (
                  <Pressable key={day} onPress={() => pick(dateStr)} style={styles.cell}>
                    <View style={[styles.dayInner, selected && styles.daySelected, isToday && !selected && styles.dayToday]}>
                      <Text style={[
                        styles.dayText,
                        dow === 0 && { color: COLORS.danger },
                        dow === 6 && { color: COLORS.brand },
                        selected && styles.dayTextSelected,
                      ]}>{day}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* 하단 — 오늘 / 닫기 */}
            <View style={styles.calFooter}>
              <Pressable onPress={() => pick(todayStr)} style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.7 }]}>
                <Feather name="sun" size={14} color={COLORS.brand} />
                <Text style={styles.footerBtnText}>오늘</Text>
              </Pressable>
              <Pressable onPress={() => setOpen(false)} style={({ pressed }) => [styles.footerBtn, styles.footerClose, pressed && { opacity: 0.7 }]}>
                <Text style={[styles.footerBtnText, { color: COLORS.white }]}>닫기</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 12, minHeight: 48, backgroundColor: COLORS.bg,
  },
  fieldDisabled: { backgroundColor: COLORS.surfaceAlt },
  fieldText: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'] },
  fieldPlaceholder: { color: COLORS.textMuted, fontWeight: '600' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  calCard: {
    width: '100%', maxWidth: 360, backgroundColor: COLORS.card, borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  navBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  calTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayInner: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: COLORS.brand },
  dayToday: { borderWidth: 1.5, borderColor: COLORS.brand },
  dayText: { fontSize: 14, fontWeight: '700', color: COLORS.text, fontVariant: ['tabular-nums'] },
  dayTextSelected: { color: COLORS.white, fontWeight: '900' },
  calFooter: { flexDirection: 'row', gap: 10, marginTop: 14 },
  footerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, borderRadius: 12, backgroundColor: COLORS.infoLight,
  },
  footerClose: { backgroundColor: COLORS.brand },
  footerBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.brand },
});
