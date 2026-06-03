import React from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Vibration } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { COLORS } from '../constants';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const SOUNDS: Record<string, any> = {
  '1': require('../../assets/notify.wav'),
  '2': require('../../assets/notify2.wav'),
  '3': require('../../assets/notify3.wav'),
};
const SOUND_LABELS: { id: string; label: string }[] = [
  { id: '1', label: '기본음' }, { id: '2', label: '딩동' }, { id: '3', label: '차임' },
];
const VOLUMES: { id: string; label: string; value: number; icon: FeatherName }[] = [
  { id: 'low', label: '작게', value: 0.35, icon: 'volume-1' },
  { id: 'mid', label: '보통', value: 0.7, icon: 'volume-2' },
  { id: 'high', label: '크게', value: 1.0, icon: 'volume-2' },
];

// expo-audio로 선택 음을 음량 적용해 재생(미설치/실패 시 무시).
function playSound(choice: string, volume: number) {
  try {
    // @ts-ignore - expo-audio
    const mod = require('expo-audio');
    if (mod && typeof mod.createAudioPlayer === 'function') {
      const player = mod.createAudioPlayer(SOUNDS[choice] || SOUNDS['1']);
      try { player.volume = volume; } catch {}
      player.play();
    }
  } catch {}
}

function ToggleRow({ icon, label, hint, value, onValueChange, disabled, showDivider }: {
  icon: FeatherName; label: string; hint?: string; value: boolean;
  onValueChange: (v: boolean) => void; disabled?: boolean; showDivider?: boolean;
}) {
  return (
    <View style={[styles.row, showDivider && styles.divider, disabled && styles.rowDisabled]}>
      <View style={styles.rowIcon}><Feather name={icon} size={18} color={disabled ? COLORS.textMuted : COLORS.brand} /></View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, disabled && styles.textDisabled]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled}
        trackColor={{ false: COLORS.border, true: COLORS.brand }} thumbColor={COLORS.white}
        ios_backgroundColor={COLORS.border} accessibilityRole="switch" accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled: !!disabled }} />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const {
    notifEnabled, soundEnabled, vibrationEnabled, soundChoice, volume,
    setNotifEnabled, setSoundEnabled, setVibrationEnabled, setSoundChoice, setVolume,
  } = useSettings();

  const subDisabled = !notifEnabled;
  const soundDisabled = subDisabled || !soundEnabled;

  const handleTest = () => {
    if (vibrationEnabled) Vibration.vibrate([0, 200, 100, 200]);
    if (soundEnabled) playSound(soundChoice, volume);
  };
  const testDisabled = subDisabled || (!soundEnabled && !vibrationEnabled);

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <Text style={styles.section}>알림</Text>
      <View style={styles.card}>
        <ToggleRow icon="bell" label="알림 받기" hint="배송·정산 등 주요 소식" value={notifEnabled} onValueChange={setNotifEnabled} />
        <ToggleRow icon="volume-2" label="알림음" value={soundEnabled} onValueChange={setSoundEnabled} disabled={subDisabled} showDivider />
        <ToggleRow icon="smartphone" label="진동" value={vibrationEnabled} onValueChange={setVibrationEnabled} disabled={subDisabled} showDivider />
      </View>

      {/* 알림음 선택 */}
      <Text style={[styles.section, styles.gap]}>알림음 선택</Text>
      <View style={[styles.card, styles.pad, soundDisabled && styles.cardDisabled]}>
        {SOUND_LABELS.map((s) => {
          const active = soundChoice === s.id;
          return (
            <Pressable key={s.id} disabled={soundDisabled}
              onPress={() => { setSoundChoice(s.id); playSound(s.id, volume); }}
              style={({ pressed }) => [styles.soundRow, pressed && { opacity: 0.7 }]}
              accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={`알림음 ${s.label}`}>
              <Feather name={active ? 'check-circle' : 'circle'} size={20} color={active ? COLORS.brand : COLORS.textMuted} />
              <Text style={[styles.soundLabel, active && { color: COLORS.brandDark }]}>{s.label}</Text>
              <View style={styles.previewBtn}><Feather name="play" size={14} color={COLORS.brand} /></View>
            </Pressable>
          );
        })}
      </View>

      {/* 음량 */}
      <Text style={[styles.section, styles.gap]}>음량</Text>
      <View style={[styles.volRow, soundDisabled && styles.cardDisabled]}>
        {VOLUMES.map((v) => {
          const active = Math.abs(volume - v.value) < 0.05;
          return (
            <Pressable key={v.id} disabled={soundDisabled}
              onPress={() => { setVolume(v.value); playSound(soundChoice, v.value); }}
              style={({ pressed }) => [styles.volBtn, active && styles.volBtnActive, pressed && { opacity: 0.7 }]}
              accessibilityRole="button" accessibilityLabel={`음량 ${v.label}`}>
              <Feather name={v.icon} size={18} color={active ? COLORS.white : COLORS.textMuted} />
              <Text style={[styles.volLabel, active && { color: COLORS.white }]}>{v.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={handleTest} disabled={testDisabled}
        style={({ pressed }) => [styles.testBtn, testDisabled && styles.testBtnDisabled, pressed && !testDisabled && { opacity: 0.7 }]}
        accessibilityRole="button" accessibilityLabel="알림음과 진동 테스트">
        <Feather name="play-circle" size={18} color={testDisabled ? COLORS.textMuted : COLORS.white} />
        <Text style={[styles.testBtnText, testDisabled && styles.textDisabled]}>테스트</Text>
      </Pressable>

      <View style={styles.notice}>
        <Feather name="info" size={14} color={COLORS.textMuted} />
        <Text style={styles.noticeText}>알림음·진동은 다음 알림부터 적용됩니다.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, marginBottom: 8, marginLeft: 4 },
  gap: { marginTop: 22 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  cardDisabled: { opacity: 0.45 },
  pad: { padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 60 },
  rowDisabled: { opacity: 0.45 },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  rowHint: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginTop: 3 },
  textDisabled: { color: COLORS.textMuted },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 52 },
  soundLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  previewBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.infoLight, alignItems: 'center', justifyContent: 'center' },
  volRow: { flexDirection: 'row', gap: 8 },
  volBtn: { flex: 1, alignItems: 'center', gap: 5, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: COLORS.border, minHeight: 64, justifyContent: 'center' },
  volBtnActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  volLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.brand, borderRadius: 14, paddingVertical: 15, marginTop: 22, minHeight: 52 },
  testBtnDisabled: { backgroundColor: COLORS.border },
  testBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, paddingHorizontal: 16 },
  noticeText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
});
