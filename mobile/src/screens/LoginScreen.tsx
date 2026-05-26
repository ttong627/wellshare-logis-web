import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <View style={styles.card}>
        <Text style={styles.logo}>🌾</Text>
        <Text style={styles.title}>웰쉐어 물류 관리</Text>
        <Text style={styles.subtitle}>파트너 업무 포털</Text>

        <TextInput
          style={styles.input}
          placeholder="이메일"
          placeholderTextColor={COLORS.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.buttonText}>로그인</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.notice}>
          계정이 없으시면 관리자에게 문의해주세요.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  logo: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 28,
  },
  input: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    marginBottom: 12,
    fontWeight: '600',
  },
  button: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
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
  notice: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontWeight: '500',
  },
});
