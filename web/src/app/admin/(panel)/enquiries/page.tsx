'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/client';
import { ago, Drawer, fmtDate, fmtDateTime, Field, Pager, Pill, STATUS_LABEL, useAdmin, useDebounced, useLoad, waLink } from '@/components/admin/ui';

const STATUSES = ['new', 'contacted', 'options_sent', 'booked', 'lost'];

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const status = params.get('status') || 'all';
  const open = Number(params.get('open')) || null;
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const { badges, refreshBadges } = useAdmin();
  const { data, loading, reload } = useLoad(() => adminApi.get(`/enquiries?status=${status}&q=${encodeURIComponent(dq)}&page=${page}`), [status, dq, page]);
  useEffect(() => setPage(1), [status, dq]);
  const setStatus = (s: string) => router.push(s === 'all' ? '/admin/enquiries' : `/admin/enquiries?status=${s}`);
  const counts = data?.counts || {};
  const all = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="adm-title"><h1>Enquiries</h1></div>
      <div className="tabs" role="tablist">
        <button className="chip chip--sm" role="tab" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>All · {all}</button>
        {STATUSES.map((s) => <button key={s} role="tab" className="chip chip--sm" aria-pressed={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]} · {counts[s] || 0}</button>)}
      </div>
      <div className="toolbar"><input className="input grow" placeholder="Search name, phone, reference or artist ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search enquiries" /></div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Received</th><th>Visitor</th><th>Artist</th><th>Event</th><th>Status</th><th>Owner</th></tr></thead>
          <tbody>
            {(data?.enquiries || []).map((e: any) => (
              <tr key={e.id} className="is-click" onClick={() => router.push(`/admin/enquiries?${status !== 'all' ? `status=${status}&` : ''}open=${e.id}`)}>
                <td><div>{ago(e.created_at)}</div><div className="sub">{fmtDateTime(e.created_at)}</div></td>
                <td><div><strong>{e.name}</strong></div><div className="sub">{e.phone} · {e.ref}</div></td>
                <td>{e.artist_public_id ? <><span className="mono" style={{ color: 'var(--orange-2)' }}>{e.artist_public_id}</span><div className="sub">{e.artist_name}</div></> : <span className="muted">General</span>}</td>
                <td><div>{[e.occasion, e.event_city].filter(Boolean).join(' · ') || '—'}</div><div className="sub">{e.event_date ? fmtDate(e.event_date) : ''}</div></td>
                <td><Pill s={e.status} /></td>
                <td className="sub">{e.assigned_name || '—'}</td>
              </tr>
            ))}
            {!loading && data?.enquiries.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 32, textAlign: 'center' }}>No enquiries here yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      {open && <EnquiryDrawer id={open} onClose={() => router.push(status === 'all' ? '/admin/enquiries' : `/admin/enquiries?status=${status}`)} onChanged={() => { reload(); refreshBadges(); }} />}
    </>
  );
}

function EnquiryDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => adminApi.get(`/enquiries/${id}`), [id]);
  const { data: admins } = useLoad(() => adminApi.get('/admins'), []);
  const [note, setNote] = useState('');
  const [booking, setBooking] = useState(false);
  const [bf, setBf] = useState<any>({ amount: '', commission: '', artistQuery: '', artistId: null });
  const [found, setFound] = useState<any[]>([]);
  const dq = useDebounced(bf.artistQuery, 250);
  useEffect(() => { if (booking && dq.length >= 1) adminApi.get(`/artists-lookup?q=${encodeURIComponent(dq)}`).then((r) => setFound(r.artists)).catch(() => {}); }, [dq, booking]);

  if (!data) return <Drawer title="Enquiry" onClose={onClose}><p className="muted">Loading…</p></Drawer>;
  const e = data.enquiry;
  const patch = async (body: any) => { try { await adminApi.patch(`/enquiries/${id}`, body); reload(); onChanged(); } catch (err: any) { toast(err.message, true); } };
  const addNote = async () => { if (!note.trim()) return; await adminApi.post(`/enquiries/${id}/notes`, { body: note }); setNote(''); reload(); };
  const msg = `Hi ${e.name.split(' ')[0]}, this is the myartist.in team about your enquiry${e.artist_public_id ? ` for artist ${e.artist_public_id}` : ''}.`;

  async function createBooking() {
    try {
      const body: any = {};
      if (bf.artistId) body.artistId = bf.artistId;
      if (bf.amount) body.amount = Number(bf.amount);
      if (bf.commission) body.commissionAmount = Number(bf.commission);
      await adminApi.post(`/enquiries/${id}/booking`, body);
      toast('Booking created');
      setBooking(false);
      reload(); onChanged();
    } catch (err: any) { toast(err instanceof ApiError ? err.message : 'Failed', true); }
  }

  return (
    <Drawer title={`Enquiry ${e.ref}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn btn--wa btn--sm" href={waLink(e.phone, msg)} target="_blank" rel="noopener noreferrer">WhatsApp {e.name.split(' ')[0]}</a>
        <a className="btn btn--outline btn--sm" href={`tel:+91${e.phone}`}>Call {e.phone}</a>
      </div>

      <dl className="kv">
        <dt>Visitor</dt><dd>{e.name}{e.email ? ` · ${e.email}` : ''}</dd>
        <dt>Received</dt><dd>{fmtDateTime(e.created_at)}</dd>
        <dt>Event</dt><dd>{[e.occasion, e.event_city, e.event_date ? fmtDate(e.event_date) : null].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Artist</dt><dd>{e.artist_public_id ? <><span className="mono" style={{ color: 'var(--orange-2)' }}>{e.artist_public_id}</span> · {e.artist_name}{e.artist_headline ? <span className="muted"> ({e.artist_headline})</span> : null}{e.artist_phone ? <div className="sub muted">Artist phone: {e.artist_phone}</div> : null}</> : 'General enquiry'}</dd>
        {e.message && <><dt>Message</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{e.message}</dd></>}
        {e.page_url && <><dt>From page</dt><dd className="muted">{e.page_url}</dd></>}
      </dl>

      <div className="form-grid">
        <Field label="Status">
          <select className="select" value={e.status} onChange={(ev) => patch({ status: ev.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        </Field>
        <Field label="Handled by">
          <select className="select" value={e.assigned_to || ''} onChange={(ev) => patch({ assignedTo: ev.target.value ? Number(ev.target.value) : null })}>
            <option value="">Unassigned</option>
            {(admins?.admins || []).filter((a: any) => a.active).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>

      <section>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Booking</h3>
        {data.bookings.length > 0 && <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>{data.bookings.length} booking(s) created from this enquiry. Manage them under Bookings.</p>}
        {!booking ? <button className="btn btn--outline btn--sm" onClick={() => setBooking(true)}>Create booking</button> : (
          <div className="panel" style={{ display: 'grid', gap: 12 }}>
            {!e.artist_id && (
              <Field label="Artist" hint="Search by name or ID">
                <input className="input" value={bf.artistQuery} onChange={(ev) => setBf({ ...bf, artistQuery: ev.target.value, artistId: null })} placeholder="Search…" />
                {found.length > 0 && !bf.artistId && <div>{found.map((a) => <button key={a.id} className="opt" style={{ minHeight: 44, fontSize: 15 }} onClick={() => setBf({ ...bf, artistId: a.id, artistQuery: `${a.public_id} · ${a.stage_name || a.full_name}` })}>{a.public_id} · {a.stage_name || a.full_name}</button>)}</div>}
              </Field>
            )}
            <div className="form-grid">
              <Field label="Deal amount (₹)"><input className="input" inputMode="numeric" value={bf.amount} onChange={(ev) => setBf({ ...bf, amount: ev.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="Our commission (₹)"><input className="input" inputMode="numeric" value={bf.commission} onChange={(ev) => setBf({ ...bf, commission: ev.target.value.replace(/\D/g, '') })} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary btn--sm" onClick={createBooking} disabled={!e.artist_id && !bf.artistId}>Confirm booking</button>
              <button className="btn btn--outline btn--sm" onClick={() => setBooking(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Notes</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ minHeight: 44 }} placeholder="Add a note…" value={note} onChange={(ev) => setNote(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && addNote()} />
          <button className="btn btn--outline btn--sm" onClick={addNote}>Add</button>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {data.notes.map((n: any) => <div className="note" key={n.id}>{n.body}<small>{n.admin_name} · {fmtDateTime(n.created_at)}</small></div>)}
        </div>
      </section>
    </Drawer>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="muted">Loading…</p>}><Inner /></Suspense>;
}
