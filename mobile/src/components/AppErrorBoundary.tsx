import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

interface Props { children: React.ReactNode }
interface State { error: Error | null }

// 렌더 중 발생한 오류를 흰화면/종료 대신 화면에 표시한다(원인 파악용).
export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('앱 오류:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <ScrollView style={styles.bg} contentContainerStyle={styles.content}>
          <Text style={styles.title}>앱 오류가 발생했어요</Text>
          <Text style={styles.hint}>아래 내용을 캡처해서 관리자에게 보내주세요.</Text>
          <View style={styles.box}>
            <Text style={styles.msg}>{String(error?.message || error)}</Text>
            {error?.stack ? <Text style={styles.stack}>{error.stack}</Text> : null}
          </View>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.danger, marginBottom: 6 },
  hint: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 16 },
  box: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  msg: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  stack: { fontSize: 11, color: COLORS.textMuted, fontFamily: 'monospace' },
});
