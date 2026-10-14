// Halaman login admin: OTP via /v1/auth/otp/* dengan role ADMIN.
// DEV_MODE=true → kode OTP dikembalikan server (devCode) dan tampil otomatis.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestOtp, verifyOtp } from '../api/auth';
import { ApiError } from '../api/http';
import { useSession } from '../auth/SessionProvider';

export default function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(phone.trim());
      setDevCode(res.devCode ?? null);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengirim OTP');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const tokens = await verifyOtp(phone.trim(), code.trim());
      if (tokens.user.role !== 'ADMIN') {
        setError('Akun ini bukan admin');
        return;
      }
      login(tokens);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verifikasi gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pijar-50 via-slate-100 to-amber-50 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-4xl">🔥</span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">PIJAR Admin</h1>
            <p className="text-sm text-slate-500">Masuk dengan OTP admin</p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {devCode ? (
          <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Mode dev — kode OTP: <span className="font-mono font-bold">{devCode}</span>
          </div>
        ) : null}

        {step === 'phone' ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="phone">
                Nomor telepon admin
              </label>
              <input
                id="phone"
                className="field-input"
                placeholder="+628000000001"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy || !phone.trim()}>
              {busy ? 'Mengirim…' : 'Kirim OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="code">
                Kode OTP ({phone})
              </label>
              <input
                id="code"
                className="field-input text-center text-lg tracking-[0.5em]"
                placeholder="••••••"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                }}
              >
                Ubah nomor
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={busy || code.length < 6}>
                {busy ? 'Memeriksa…' : 'Masuk'}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Akun admin demo: +628000000001 (kode OTP tampil otomatis di mode dev)
        </p>
      </div>
    </div>
  );
}
