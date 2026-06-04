import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNotifications } from '../hooks/useNotifications';
import { COLORS } from '../constants';

// ISO/문자 타임스탬프 → "M/D HH:mm"
function fmt(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function NotificationsScreen() {
  const { items, unread, loading, markRead, markAll, uid } = useNotifications();

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brand} /><Text style={styles.loadingText}>알림 불러오는 중…</Text></View>;
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Feather name="bell" size={18} color={COLORS.white} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>알림 내역</Text>
          <Text style={styles.headerSub}>{unread > 0 ? `안 읽은 알림 ${unread}건` : '모두 확인했습니다'}</Text>
        </View>
        {unread > 0 && (
          <Pressable onPress={markAll} style={({ pressed }) => [styles.allBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button" accessibilityLabel="모두 읽음">
            <Feather name="check-circle" size={14} color={COLORS.white} />
            <Text style={styles.allText}>모두 읽음</Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Feather name="bell-off" size={28} color={COLORS.brand} /></View>
          <Text style={styles.emptyTitle}>알림이 없습니다</Text>
          <Text style={styles.emptyDesc}>배송·정산 관련 알림이 오면 여기에 표시됩니다.</Text>
        </View>
      ) : (
        items.map((n) => {
          const isUnread = !n.readBy?.includes(uid);
          return (
            <Pressable key={n.id} onPress={() => markRead(n)}
              style={({ pressed }) => [styles.card, isUnread && styles.cardUnread, pressed && { opacity: 0.75 }]}
              accessibilityRole="button" accessibilityLabel={`알림 ${isUnread ? '안읽음, 탭하면 읽음 처리' : '읽음'}`}>
              <View style={styles.cardTop}>
                {isUnread ? <View style={styles.dot} /> : <Feather name="check" size={13} color={COLORS.success} />}
                <Feather name="bell" size={15} color={isUnread ? COLORS.brand : COLORS.textMuted} />
                <Text style={styles.time}>{fmt(n.timestamp)}</Text>
                {isUnread && <Text style={styles.tapHint}>탭하여 읽음</Text>}
              </View>
              <Text style={[styles.msg, isUnread && styles.msgUnread]}>{n.message}</Text>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },
  allBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.brand, borderRadius: 10, paddingHorizontal: 12, minHeight: 38 },
  allText: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardUnread: { borderColor: COLORS.brand, backgroundColor: COLORS.infoLight },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger },
  time: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  tapHint: { marginLeft: 'auto', fontSize: 11, fontWeight: '800', color: COLORS.brand },
  msg: { fontSize: 14, fontWeight: '600', color: COLORS.text, lineHeight: 20 },
  msgUnread: { fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.infoLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text, marginBottom: 6 },
  emptyDesc: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
});
