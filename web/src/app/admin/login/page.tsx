'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Logo from '@/components/Logo';
import { adminApi, ApiError } from '@/lib/client';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.post('/auth/login', { email, password });
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__box" onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Logo size={34} /><span className="tag" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--orange-2)', fontWeight: 600 }}>Admin</span></div>
        <h1 className="display" style={{ fontSize: 28 }}>Sign in</h1>
        <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
