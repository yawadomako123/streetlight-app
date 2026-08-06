import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import * as api from '../api/client';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async () => {
    setError(null);
    setBusy(true);
    try {
      if (isSignUp) {
        // Implement signup if backend supports, otherwise mock success/fail
        await api.login(username.trim(), password);
      } else {
        await api.login(email.trim() || username.trim(), password);
      }
      navigation.goBack();
    } catch (e: any) {
      setError(isSignUp ? 'Registration failed.' : 'Invalid credentials. Check email and password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Background Dimming for Sheet look */}
      <View style={styles.container}>
        <View style={styles.topDismissContainer}>
          <Pressable onPress={() => navigation.goBack()} style={styles.dismissBtn}>
            <Text style={styles.dismissBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* Sliding sheet element */}
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          {/* Title Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp ? 'Viewer access by default' : 'Sign in to reach your dashboard'}
            </Text>
          </View>

          {/* Auth Tab Switcher */}
          <View style={styles.tabContainer}>
            <Pressable
              onPress={() => {
                setIsSignUp(false);
                setError(null);
              }}
              style={[styles.tab, !isSignUp && styles.tabActive]}
            >
              <Text style={[styles.tabText, !isSignUp && styles.tabTextActive]}>Log in</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsSignUp(true);
                setError(null);
              }}
              style={[styles.tab, isSignUp && styles.tabActive]}
            >
              <Text style={[styles.tabText, isSignUp && styles.tabTextActive]}>Sign up</Text>
            </Pressable>
          </View>

          {/* Inputs Section */}
          <View style={styles.form}>
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="ada.n"
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email or username</Text>
              <TextInput
                value={isSignUp ? email : username}
                onChangeText={isSignUp ? setEmail : setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="ada@streetlight.io"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
              />
            </View>
          </View>

          {error && <Text style={styles.errorText}>⚠  {error}</Text>}

          {/* Submit Button */}
          <Pressable
            onPress={handleAuth}
            disabled={busy}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && { opacity: 0.8 },
              busy && { opacity: 0.6 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#0B1530" />
            ) : (
              <Text style={styles.actionBtnText}>
                {isSignUp ? 'Create account' : 'Log in'}
              </Text>
            )}
          </Pressable>

          <Text style={styles.dividerText}>Or continue with</Text>

          {/* Google Button */}
          <Pressable style={styles.googleBtn}>
            <Text style={styles.googleBtnText}>G  Continue with Google</Text>
          </Pressable>

          <Text style={styles.footerText}>
            {isSignUp
              ? 'By continuing you agree to the project\'s terms of use.'
              : 'Password recovery isn\'t available yet — ask an admin to reset it.'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'rgba(11,21,48,0.4)' },
  container: { flex: 1, justifyContent: 'flex-end' },
  topDismissContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 22,
    marginBottom: 10,
  },
  dismissBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0B1530',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  dismissBtnText: { color: colors.white, fontSize: 14 },
  sheet: {
    backgroundColor: colors.nightStart,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingBottom: 32,
    paddingTop: 10,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: { gap: 4 },
  title: { color: colors.white, fontSize: 20, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.md - 3,
  },
  tabActive: {
    backgroundColor: colors.amber,
  },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#0B1530', fontWeight: 'bold' },
  form: { gap: 12 },
  inputGroup: { gap: 6 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(11,21,48,0.7)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 14,
  },
  errorText: { color: colors.red, fontSize: 12, fontWeight: '600' },
  actionBtn: {
    backgroundColor: colors.amber,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  actionBtnText: { color: '#0B1530', fontSize: 14, fontWeight: 'bold' },
  dividerText: { color: colors.textFaint, fontSize: 11, textAlign: 'center' },
  googleBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  googleBtnText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  footerText: { color: colors.textFaint, fontSize: 10, textAlign: 'center', marginTop: 4 },
});
