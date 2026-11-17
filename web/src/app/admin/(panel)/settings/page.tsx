'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/client';
import { Field, fmtDateTime, useAdmin, useLoad } from '@/components/admin/ui';

export default function Settings() {
  const { toast } = useAdmin();
  const { data: s } = useLoad(() => adminApi.get('/settings'), []);
  const { data: cat, reload: reloadCat } = useLoad(() => adminApi.get('/catalog'), []);
  const { data: audit } = useLoad(() => adminApi.get('/audit'), []);
  const [f, setF] = useState<any>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [newCat, setNewCat] = useState('');
  const [newCity, setNewCity] = useState({ name: '', state: 'Gujarat' });
  useEffect(() => { if (s) setF(s); }, [s]);
  if (!f) return <p className="muted">Loading…</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await adminApi.put('/settings', f); toast('Settings saved'); } catch (err: any) { toast(err.message, true); }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    try { await adminApi.post('/auth/change-password', pw); setPw({ current: '', next: '' }); toast('Password changed. Other sessions were signed out.'); } catch (err: any) { toast(err.message, true); }
  }

  return (
    <>
      <div className="adm-title"><h1>Settings</h1></div>
      <div className="two-col" style={{ alignItems: 'start' }}>
        <form className="panel" onSubmit={save} style={{ display: 'grid', gap: 14 }}>
          <h2>Site &amp; reviews</h2>
          <Field label="WhatsApp number" hint="Digits with country code, e.g. 919712026900. Used by every WhatsApp button on the site."><input className="input" inputMode="numeric" value={f.whatsappNumber} onChange={(e) => setF({ ...f, whatsappNumber: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Review link expires after (days)"><input className="input" inputMode="numeric" value={f.reviewExpiryDays} onChange={(e) => setF({ ...f, reviewExpiryDays: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
          <label className="check"><input type="checkbox" checked={f.reviewAutoApprove} onChange={(e) => setF({ ...f, reviewAutoApprove: e.target.checked })} /><span>Publish reviews automatically (skip approval). Not recommended at first.</span></label>
          <div><button className="btn btn--primary btn--sm">Save settings</button></div>
        </form>

        <form className="panel" onSubmit={changePw} style={{ display: 'grid', gap: 14 }}>
          <h2>Change my password</h2>
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password" hint="At least 10 characters"><input className="input" type="password" autoComplete="new-password" required minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <div><button className="btn btn--primary btn--sm">Change password</button></div>
        </form>

        <section className="panel">
          <h2>Categories</h2>
          <div className="chips" style={{ marginBottom: 12 }}>{cat?.categories.map((c: any) => <span key={c.id} className="chip chip--sm">{c.name}</span>)}</div>
          <form style={{ display: 'flex', gap: 8 }} onSubmit={async (e) => { e.preventDefault(); try { await adminApi.post('/categories', { name: newCat }); setNewCat(''); reloadCat(); toast('Category added'); } catch (err: any) { toast(err.message, true); } }}>
            <input className="input" style={{ minHeight: 44 }} placeholder="New category, e.g. Mimicry artist" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="btn btn--outline btn--sm">Add</button>
          </form>
        </section>

        <section className="panel">
          <h2>Cities <span className="muted" style={{ fontWeight: 400 }}>· {cat?.cities.length}</span></h2>
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={async (e) => { e.preventDefault(); try { await adminApi.post('/cities', newCity); setNewCity({ ...newCity, name: '' }); reloadCat(); toast('City added'); } catch (err: any) { toast(err.message, true); } }}>
            <input className="input" style={{ minHeight: 44, flex: '1 1 140px' }} placeholder="City" value={newCity.name} onChange={(e) => setNewCity({ ...newCity, name: e.target.value })} />
            <input className="input" style={{ minHeight: 44, flex: '1 1 140px' }} placeholder="State" value={newCity.state} onChange={(e) => setNewCity({ ...newCity, state: e.target.value })} />
            <button className="btn btn--outline btn--sm">Add</button>
          </form>
          <p className="form-note" style={{ marginTop: 10 }}>Cities also get created automatically when you import from Excel.</p>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recent activity (audit log)</h2>
        <div className="tbl-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="tbl" style={{ minWidth: 0 }}><tbody>
            {(audit?.entries || []).slice(0, 60).map((a: any) => <tr key={a.id}><td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</td><td>{a.admin_name || 'system'}</td><td>{a.action}</td><td className="sub">{a.entity ? `${a.entity} ${a.entity_id ?? ''}` : ''}</td></tr>)}
          </tbody></table>
        </div>
      </section>
    </>
  );
}
