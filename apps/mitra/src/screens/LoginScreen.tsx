/**
 * Login mitra — OTP phone (kontrak: POST /v1/auth/otp/request → /verify role MITRA).
 * DEV_MODE=true: server mengembalikan devCode untuk pengembangan.
 * Navigasi dikelola state auth (navigation.tsx) — tidak perlu react-navigation.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../state/auth';
import {
  BodyText,
  Button,
  Card,
  COLORS,
  ErrorBanner,
  Heading,
} from '../components/ui';

export function LoginScreen() {
  const { phase, error, devCode, sendOtp, login, clearError } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const busy = phase === 'requesting' || phase === 'verifying';

  async function onRequestOtp() {
    clearError();
    const ok = await sendOtp(phone);
    if (ok) setOtpSent(true);
  }

  async function onVerify() {
    clearError();
    await login(phone, code, name.trim() || undefined);
    // sukses → tokens berubah → navigation.tsx otomatis pindah ke MainTabs
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Heading size={34}>PIJAR Mitra</Heading>
          <BodyText muted style={styles.heroSub}>
            Masuk untuk menerima order pijat di sekitarmu
          </BodyText>
        </View>

        <Card>
          <ErrorBanner message={error} />
          {devCode ? (
            <View style={styles.devCodeBox}>
              <BodyText muted style={styles.devCodeLabel}>
                Kode OTP dev:
              </BodyText>
              <Heading size={22}>{devCode}</Heading>
            </View>
          ) : null}

          <BodyText muted style={styles.label}>
            Nomor telepon (format +62…)
          </BodyText>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+628123456789"
            keyboardType="phone-pad"
            autoCapitalize="none"
            style={styles.input}
            editable={!otpSent}
          />

          {!otpSent ? (
            <>
              <BodyText muted style={styles.label}>
                Nama terapis (opsional, saat daftar baru)
              </BodyText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nama Anda"
                style={styles.input}
              />
              <Button
                label="Kirim Kode OTP"
                onPress={onRequestOtp}
                loading={phase === 'requesting'}
                disabled={phone.length < 8 || busy}
                style={styles.gap}
              />
            </>
          ) : (
            <>
              <BodyText muted style={styles.label}>
                Kode OTP (6 digit)
              </BodyText>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="••••••"
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput]}
              />
              <Button
                label="Masuk sebagai Mitra"
                onPress={onVerify}
                loading={phase === 'verifying'}
                disabled={code.length !== 6 || busy}
                style={styles.gap}
              />
              <Button
                label="Ganti nomor"
                variant="outline"
                onPress={() => {
                  setOtpSent(false);
                  setCode('');
                }}
                disabled={busy}
              />
            </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  hero: { alignItems: 'center', marginBottom: 28 },
  heroSub: { marginTop: 6, textAlign: 'center' },
  devCodeBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  devCodeLabel: { fontSize: 12 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  codeInput: { letterSpacing: 8, textAlign: 'center', fontSize: 22 },
  gap: { marginTop: 16, marginBottom: 10 },
});
