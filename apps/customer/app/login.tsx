import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthTokensDto } from '@pijar/shared';
import { api, ApiError } from '../src/lib/api';
import { useAuth, LOGIN_ROLE } from '../src/store/auth';
import { Button, Card, Typography, COLORS } from '../src/components/ui';

/** Login phone-OTP. Dev: kode OTP tampil di response (DEV_MODE server). */
export default function Login() {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const login = useAuth((s) => s.login);
  const router = useRouter();
  // Handle setInterval RN berupa number — cast satu kali di sini (well-known RN runtime).
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      // Handle RN berupa number; runtime RN mengerti number — cast sekali di sini.
      const handle = timerRef.current as unknown as number | undefined;
      clearInterval(handle);
    };
  }, []);

  function startCooldown() {
    setResendIn(45);
    // Cast satu kali: setInterval RN mengembalikan number (well-known RN runtime).
    timerRef.current = setInterval(() => {
      setResendIn((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current as unknown as number | undefined);
          timerRef.current = null;
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  async function requestCode() {
    setError(null);
    const normalized = phone.startsWith('+') ? phone : `+${phone.replace(/[^0-9]/g, '')}`;
    if (normalized.length < 10) {
      setError('Nomor telepon tidak valid (contoh: +628123456789)');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: true; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ phone: normalized }),
      });
      setStep('otp');
      startCooldown();
      if (res.devCode) setDevHint(`Kode dev: ${res.devCode}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.display : err instanceof Error ? err.message : 'Gagal mengirim kode');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError(null);
    const normalized = phone.startsWith('+') ? phone : `+${phone.replace(/[^0-9]/g, '')}`;
    if (code.trim().length !== 6) {
      setError('Masukkan 6 digit kode OTP');
      return;
    }
    setBusy(true);
    try {
      const tokens = await api<AuthTokensDto>('/auth/otp/verify', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          phone: normalized,
          code: code.trim(),
          role: LOGIN_ROLE,
          ...(name.trim() ? { name: name.trim() } : {}),
        }),
      });
      await login(tokens);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof ApiError ? err.display : err instanceof Error ? err.message : 'Gagal masuk');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: COLORS.primary, fontSize: 44, fontWeight: '900', textAlign: 'center' }}>PIJAR</Text>
        <Typography variant="muted" style={{ textAlign: 'center', marginBottom: 32 }}>
          Pijat & wellness on-demand
        </Typography>

        <Card>
          {step === 'phone' ? (
            <>
              <Typography variant="h2" style={{ marginBottom: 8 }}>
                Masuk / Daftar
              </Typography>
              <Typography variant="muted" style={{ marginBottom: 16 }}>
                Masukkan nomor WhatsApp aktif — kami kirim kode verifikasi.
              </Typography>
              <TextInput
                style={styles.input}
                placeholder="+628123456789"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
                autoCapitalize="none"
                value={phone}
                onChangeText={setPhone}
              />
              <TextInput
                style={[styles.input, { marginTop: 12 }]}
                placeholder="Nama Anda (opsional, untuk pendaftaran)"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
              />
              <Button title="Kirim Kode OTP" onPress={requestCode} loading={busy} style={{ marginTop: 16 }} />
            </>
          ) : (
            <>
              <Typography variant="h2" style={{ marginBottom: 8 }}>
                Masukkan Kode OTP
              </Typography>
              <Typography variant="muted" style={{ marginBottom: 16 }}>
                Kode 6 digit dikirim ke {phone}
              </Typography>
              <TextInput
                style={[styles.input, { textAlign: 'center', fontSize: 24, letterSpacing: 8 }]}
                placeholder="••••••"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
              <Button title="Verifikasi" onPress={verifyCode} loading={busy} style={{ marginTop: 16 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                <TouchableOpacity onPress={() => setStep('phone')} disabled={busy}>
                  <Typography variant="small" style={{ color: COLORS.primaryDark }}>
                    Ganti nomor
                  </Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={requestCode} disabled={busy || resendIn > 0}>
                  <Typography variant="small" style={{ color: resendIn > 0 ? COLORS.textMuted : COLORS.primaryDark }}>
                    {resendIn > 0 ? `Kirim ulang (${resendIn}s)` : 'Kirim ulang'}
                  </Typography>
                </TouchableOpacity>
              </View>
              {devHint ? (
                <Typography variant="small" style={{ marginTop: 12, color: COLORS.info }}>
                  {devHint}
                </Typography>
              ) : null}
            </>
          )}

          {error ? (
            <Typography variant="small" style={{ color: COLORS.danger, marginTop: 12 }}>
              {error}
            </Typography>
          ) : null}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = {
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: '#fff',
  },
} as const;


