'use client';
import { useState } from 'react';
import Sheet from '@/components/Sheet';
import { adminApi } from '@/lib/client';
import { ago, Field, fmtDate, useAdmin, useLoad } from '@/components/admin/ui';
import { CloseIcon } from '@/lib/icons';

export default function Admins() {
  const { admin, toast } = useAdmin();
  const { data, reload } = useLoad(() => adminApi.get('/admins'), []);
  const [dlg, setDlg] = useState<{ mode: 'new' } | { mode: 'reset'; a: any } | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      if (dlg?.mode === 'new') { await adminApi.post('/admins', f); toast('Admin added'); }
      else if (dlg?.mode === 'reset') { await adminApi.patch(`/admins/${dlg.a.id}`, { password: f.password }); toast('Password reset. They are signed out.'); }
      setDlg(null); setF({ name: '', email: '', password: '' }); reload();
    } catch (e2: any) { setErr(e2.message); }
  }
  async function toggle(a: any) {
    try { await adminApi.patch(`/admins/${a.id}`, { active: !a.active }); toast(a.active ? 'Deactivated' : 'Reactivated'); reload(); }
    catch (e: any) { toast(e.message, true); }
  }

  return (
    <>
      <div className="adm-title"><h1>Admins</h1><button className="btn btn--primary btn--sm" onClick={() => { setF({ name: '', email: '', password: '' }); setErr(''); setDlg({ mode: 'new' }); }}>Add admin</button></div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>Any admin can add or deactivate other admins. Sign in with email and password. Deactivated admins are signed out immediately.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Last sign-in</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {(data?.admins || []).map((a: any) => (
              <tr key={a.id}>
                <td><strong>{a.name}</strong>{a.id === admin.id && <span className="pill" style={{ marginLeft: 8 }}>You</span>}{!a.active && <span className="pill pill--archived" style={{ marginLeft: 8 }}>Deactivated</span>}</td>
                <td>{a.email}</td>
                <td>{a.last_login_at ? ago(a.last_login_at) : 'Never'}</td>
                <td>{fmtDate(a.created_at)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn--outline btn--sm" onClick={() => { setF({ name: '', email: '', password: '' }); setErr(''); setDlg({ mode: 'reset', a }); }}>Reset password</button>{' '}
                  {a.id !== admin.id && <button className={`btn btn--outline btn--sm${a.active ? ' btn--danger' : ''}`} onClick={() => toggle(a)}>{a.active ? 'Deactivate' : 'Reactivate'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dlg && (
        <Sheet label="Admin" onClose={() => setDlg(null)}>
          <form onSubmit={submit} style={{ display: 'contents' }}>
            <div className="sheet__head"><h2 className="sheet__title">{dlg.mode === 'new' ? 'Add admin' : `Reset password · ${dlg.a.name}`}</h2><button type="button" className="icon-btn" aria-label="Close" onClick={() => setDlg(null)}><CloseIcon /></button></div>
            <div className="sheet__body" style={{ display: 'grid', gap: 14, alignContent: 'start', paddingBottom: 16 }}>
              {dlg.mode === 'new' && <><Field label="Name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Email"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></>}
              <Field label={dlg.mode === 'new' ? 'Temporary password' : 'New password'} hint="At least 10 characters. Share it securely; they can change it in Settings."><input className="input" type="text" required minLength={10} autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
              {err && <p className="form-error" role="alert">{err}</p>}
            </div>
            <div className="sheet__foot"><button className="btn btn--primary btn--block">{dlg.mode === 'new' ? 'Add admin' : 'Reset password'}</button></div>
          </form>
        </Sheet>
      )}
    </>
  );
}
