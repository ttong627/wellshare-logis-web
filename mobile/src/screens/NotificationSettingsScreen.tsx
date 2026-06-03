import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
  Vibration,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { COLORS } from '../constants';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

// 테스트 사운드 재생. expo-audio는 통합 단계에서 설치되며, 미설치 시 조용히 무시(절대 크래시 금지).
async function playTestSound() {
  try {
    // @ts-ignore - expo-audio는 메인 통합 단계에서 설치됨(없으면 catch로 무시)
    const mod = require('expo-audio');
    // createAudioPlayer(source) → player.play() (expo SDK 54+ 표준 API)
    if (mod && typeof mod.createAudioPlayer === 'function') {
      // notify.wav는 메인 통합 시 metro asset으로 번들됨
      const player = mod.createAudioPlayer(require('../../assets/notify.wav'));
      player.play();
    }
  } catch (e) {
    // 사운드 모듈 미설치 또는 재생 실패 — 무시(UI는 정상 동작)
  }
}

interface ToggleRowProps {
  icon: FeatherName;
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  showDivider?: boolean;
}

function ToggleRow({
  icon,
  label,
  hint,
  value,
  onValueChange,
  disabled,
  showDivider,
}: ToggleRowProps) {
  return (
    <View style={[styles.row, showDivider && styles.divider, disabled && styles.rowDisabled]}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={18} color={disabled ? COLORS.textMuted : COLORS.brand} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, disabled && styles.textDisabled]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: COLORS.border, true: COLORS.brand }}
        thumbColor={COLORS.white}
        ios_backgroundColor={COLORS.border}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled: !!disabled }}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const {
    notifEnabled,
    soundEnabled,
    vibrationEnabled,
    setNotifEnabled,
    setSoundEnabled,
    setVibrationEnabled,
  } = useSettings();

  // 알림이 꺼져 있으면 알림음·진동 하위 설정은 비활성화.
  const subDisabled = !notifEnabled;

  const handleTest = () => {
    if (vibrationEnabled) {
      // RN core Vibration — 네이티브 추가 설치 불필요. [대기, 진동, 대기, 진동]
      Vibration.vibrate([0, 200, 100, 200]);
    }
    if (soundEnabled) {
      playTestSound();
    }
  };

  const testDisabled = subDisabled || (!soundEnabled && !vibrationEnabled);

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      {/* 알림 전체 */}
      <Text style={styles.section}>알림</Text>
      <View style={styles.card}>
        <ToggleRow
          icon="bell"
          label="알림 받기"
          hint="배송·정산 등 주요 소식을 받습니다"
          value={notifEnabled}
          onValueChange={setNotifEnabled}
        />
        <ToggleRow
          icon="volume-2"
          label="알림음"
          value={soundEnabled}
          onValueChange={setSoundEnabled}
          disabled={subDisabled}
          showDivider
        />
        <ToggleRow
          icon="smartphone"
          label="진동"
          value={vibrationEnabled}
          onValueChange={setVibrationEnabled}
          disabled={subDisabled}
          showDivider
        />
      </View>

      {/* 테스트 버튼 */}
      <Pressable
        onPress={handleTest}
        disabled={testDisabled}
        style={({ pressed }) => [
          styles.testBtn,
          testDisabled && styles.testBtnDisabled,
          pressed && !testDisabled && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="알림음과 진동 테스트"
        accessibilityState={{ disabled: testDisabled }}
      >
        <Feather
          name="play-circle"
          size={18}
          color={testDisabled ? COLORS.textMuted : COLORS.white}
        />
        <Text style={[styles.testBtnText, testDisabled && styles.textDisabled]}>테스트</Text>
      </Pressable>

      {/* 안내 */}
      <View style={styles.notice}>
        <Feather name="info" size={14} color={COLORS.textMuted} />
        <Text style={styles.noticeText}>
          알림음·진동은 다음 알림부터 적용됩니다.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, marginBottom: 8, marginLeft: 4 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 60,
  },
  rowDisabled: { opacity: 0.45 },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  rowHint: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginTop: 3 },
  textDisabled: { color: COLORS.textMuted },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.brand,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 20,
    minHeight: 52,
  },
  testBtnDisabled: { backgroundColor: COLORS.border },
  testBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  pressed: { opacity: 0.7 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 16,
  },
  noticeText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
});
