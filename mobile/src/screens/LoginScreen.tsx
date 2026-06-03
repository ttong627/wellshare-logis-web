import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (e: any) {
      const msg = e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'
        ? '이메일 또는 비밀번호가 올바르지 않습니다.'
        : '로그인 중 오류가 발생했습니다.';
      Alert.alert('로그인 실패', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* 브랜드 헤더 */}
      <View style={styles.brandHeader}>
        <View style={styles.logoBadge}>
          <Image source={require('../../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />
        </View>
        <Text style={styles.brandName}>정부양곡정산</Text>
        <Text style={styles.brandSub}>웰쉐어 · 배송비 정산 포털</Text>
      </View>

      {/* 로그인 카드 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>로그인</Text>
        <Text style={styles.cardSub}>파트너 업무 포털에 접속합니다.</Text>

        {/* 이메일 */}
        <Text style={styles.inputLabel}>이메일</Text>
        <View style={styles.inputWrap}>
          <Feather name="mail" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="이메일을 입력하세요"
            placeholderTextColor={COLORS.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        {/* 비밀번호 */}
        <Text style={[styles.inputLabel, { marginTop: 14 }]}>비밀번호</Text>
        <View style={styles.inputWrap}>
          <Feather name="lock" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { paddingRight: 44 }]}
            placeholder="비밀번호를 입력하세요"
            placeholderTextColor={COLORS.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          <Pressable
            onPress={() => setShowPassword(v => !v)}
            style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}>
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={COLORS.textMuted} />
          </Pressable>
        </View>

        {/* 로그인 버튼 */}
        <Pressable
          style={({ pressed }) => [styles.button, loading && styles.buttonDisabled, pressed && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="로그인">
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Feather name="log-in" size={16} color={COLORS.white} />
              <Text style={styles.buttonText}>로그인</Text>
            </>
          )}
        </Pressable>

        <View style={styles.noticeRow}>
          <Feather name="info" size={12} color={COLORS.textMuted} />
          <Text style={styles.notice}>계정이 없으시면 관리자에게 문의해주세요.</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.brandDark, shadowOpacity: 0.18, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
    marginBottom: 16,
  },
  logoImg: { width: 52, height: 48 },
  brandName: { fontSize: 24, fontWeight: '900', color: COLORS.text, letterSpacing: -0.4 },
  brandSub: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginTop: 5 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.brandDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  cardTitle: { fontSize: 19, fontWeight: '900', color: COLORS.text },
  cardSub: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginTop: 4, marginBottom: 20 },

  inputLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 7, marginLeft: 2 },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  inputIcon: { position: 'absolute', left: 14, zIndex: 1 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingLeft: 40,
    paddingRight: 14,
    minHeight: 50,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    fontWeight: '600',
  },
  eyeBtn: {
    position: 'absolute', right: 6, top: 0, bottom: 0,
    width: 40, alignItems: 'center', justifyContent: 'center',
  },

  button: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.brand,
    borderRadius: 12,
    minHeight: 52,
    marginTop: 22,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
  },
  noticeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  notice: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontWeight: '600',
  },
});
