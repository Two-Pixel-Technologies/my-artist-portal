'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Sheet from '@/components/Sheet';
import { adminApi, ApiError } from '@/lib/client';
import { CopyBox, Field, fmtDate, money, Pill, useAdmin, useDebounced, useLoad } from '@/components/admin/ui';
import { CloseIcon } from '@/lib/icons';

const OCCASIONS = ['Wedding', 'Corporate', 'Birthday', 'College fest', 'Religious', 'Cultural', 'Private party'];

function Inner() {
  const params = useSearchParams();
  const awaiting = params.get('awaiting') === '1';
  const { toast } = useAdmin();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, reload } = useLoad(() => adminApi.get(`/bookings?status=${status}&q=${encodeURIComponent(dq)}`), [status, dq]);
  const [link, setLink] = useState<{ b: any; res: any } | null>(null);
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  let rows: any[] = data?.bookings || [];
  if (awaiting) rows = rows.filter((b) => b.event_date && b.event_date < today && b.status !== 'cancelled' && ['none', 'expired', 'revoked', 'link_sent'].includes(b.review_state));

  async function getReview(b: any) {
    try { setLink({ b, res: await adminApi.post(`/bookings/${b.id}/review-link`) }); reload(); }
    catch (e: any) { toast(e instanceof ApiError ? e.message : 'Failed', true); }
  }

  const reviewCell = (b: any) => {
    const s = b.review_state;
    if (b.status === 'cancelled') return <span className="muted">—</span>;
    if (s === 'review_approved') return <Pill s={s} />;
    if (s === 'review_pending') return <Link href="/admin/reviews"><Pill s={s} /></Link>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {s !== 'none' && <Pill s={s} />}
        <button className="btn btn--primary btn--sm" onClick={() => getReview(b)}>{s === 'link_sent' ? 'New link' : 'Get review'}</button>
      </span>
    );
  };

  return (
    <>
      <div className="adm-title">
        <h1>Bookings &amp; reviews {awaiting && <span className="pill pill--pending" style={{ marginLeft: 8 }}>Awaiting review</span>}</h1>
        <div className="adm-actions">{awaiting && <Link className="btn btn--outline btn--sm" href="/admin/bookings">Show all</Link>}<button className="btn btn--primary btn--sm" onClick={() => setEdit('new')}>New booking</button></div>
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>Bookings are confirmed offline. Record them here so you can send the client a one-time review link with <strong>Get review</strong>.</p>
      <div className="toolbar">
        <input className="input grow" placeholder="Search client or artist" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
      </div>
      <div className="tbl-wrap">
        <table className="tbl" style={{ minWidth: 900 }}>
          <thead><tr><th>Event</th><th>Client</th><th>Artist</th><th className="num">Deal / commission</th><th>Status</th><th>Review</th><th></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><div>{b.event_date ? fmtDate(b.event_date) : '—'}</div><div className="sub">{[b.occasion, b.event_city].filter(Boolean).join(' · ')}</div></td>
                <td><strong>{b.client_name}</strong><div className="sub">{b.client_phone || ''}</div></td>
                <td><span className="mono" style={{ color: 'var(--orange-2)' }}>{b.artist_public_id}</span><div className="sub">{b.artist_name}</div></td>
                <td className="num">{money(b.amount)}<div className="sub">{money(b.commission_amount)}</div></td>
                <td><Pill s={b.status} /></td>
                <td>{reviewCell(b)}</td>
                <td><button className="btn btn--outline btn--sm" onClick={() => setEdit(b)}>Edit</button></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="muted" style={{ padding: 32, textAlign: 'center' }}>No bookings yet. Create one from an enquiry, or use New booking.</td></tr>}
          </tbody>
        </table>
      </div>

      {link && (
        <Sheet label="Review link" onClose={() => setLink(null)}>
          <div className="sheet__head"><h2 className="sheet__title">Review link ready</h2><button className="icon-btn" aria-label="Close" onClick={() => setLink(null)}><CloseIcon /></button></div>
          <div className="sheet__body" style={{ display: 'grid', gap: 14, alignContent: 'start', paddingBottom: 16 }}>
            <p className="muted" style={{ fontSize: 14 }}>For <strong style={{ color: 'var(--text)' }}>{link.b.client_name}</strong> about <span className="mono" style={{ color: 'var(--orange-2)' }}>{link.b.artist_public_id}</span> ({link.b.artist_name}).</p>
            <CopyBox value={link.res.url} />
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>{link.res.message}</div>
            <p className="form-note">One-time link. It stops working after the review is submitted, and expires in {link.res.expiresInDays} days. Making a new link cancels the old one. Send it to every client after an event, not only happy ones.</p>
          </div>
          <div className="sheet__foot">
            <a className="btn btn--wa btn--block" style={{ minHeight: 50 }} href={link.res.whatsappUrl} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
          </div>
        </Sheet>
      )}

      {edit && <BookingModal booking={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function BookingModal({ booking, onClose, onSaved }: { booking: any | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useAdmin();
  const isNew = !booking;
  const [f, setF] = useState<any>(booking ? {
    status: booking.status, amount: booking.amount ?? '', commissionAmount: booking.commission_amount ?? '', eventDate: booking.event_date || '', eventCity: booking.event_city || '', notes: booking.notes || '',
  } : { artistId: 0, artistQuery: '', clientName: '', clientPhone: '', eventDate: '', eventCity: '', occasion: '', amount: '', commissionAmount: '', notes: '' });
  const [found, setFound] = useState<any[]>([]);
  const dq = useDebounced(f.artistQuery || '', 250);
  useEffect(() => { if (isNew && dq.length >= 1 && !f.artistId) adminApi.get(`/artists-lookup?q=${encodeURIComponent(dq)}`).then((r) => setFound(r.artists)).catch(() => {}); }, [dq, isNew, f.artistId]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const num = (v: any) => (v === '' || v == null ? null : Number(v));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (isNew) {
        if (!f.artistId) return toast('Choose an artist', true);
        await adminApi.post('/bookings', { artistId: f.artistId, clientName: f.clientName, clientPhone: f.clientPhone || null, eventDate: f.eventDate || null, eventCity: f.eventCity || null, occasion: f.occasion || null, amount: num(f.amount), commissionAmount: num(f.commissionAmount), notes: f.notes || null });
      } else {
        await adminApi.patch(`/bookings/${booking.id}`, { status: f.status, amount: num(f.amount), commissionAmount: num(f.commissionAmount), eventDate: f.eventDate || null, eventCity: f.eventCity || null, notes: f.notes || null });
      }
      toast('Saved');
      onSaved();
    } catch (err: any) { toast(err.message, true); }
  }

  return (
    <Sheet label={isNew ? 'New booking' : 'Edit booking'} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'contents' }}>
        <div className="sheet__head"><h2 className="sheet__title">{isNew ? 'New booking' : `Booking · ${booking.client_name}`}</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon /></button></div>
        <div className="sheet__body" style={{ display: 'grid', gap: 14, alignContent: 'start', paddingBottom: 16 }}>
          {isNew && (
            <>
              <Field label="Artist" hint="Search by name or ID">
                <input className="input" value={f.artistQuery} onChange={(e) => setF({ ...f, artistQuery: e.target.value, artistId: 0 })} placeholder="Search…" />
                {found.length > 0 && !f.artistId && <div>{found.map((a) => <button type="button" key={a.id} className="opt" style={{ minHeight: 44, fontSize: 15 }} onClick={() => setF({ ...f, artistId: a.id, artistQuery: `${a.public_id} · ${a.stage_name || a.full_name}` })}>{a.public_id} · {a.stage_name || a.full_name}</button>)}</div>}
              </Field>
              <Field label="Client name *"><input className="input" required value={f.clientName} onChange={(e) => set('clientName', e.target.value)} /></Field>
              <Field label="Client WhatsApp number"><input className="input" inputMode="tel" value={f.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} /></Field>
              <Field label="Occasion"><select className="select" value={f.occasion} onChange={(e) => set('occasion', e.target.value)}><option value="">Not set</option>{OCCASIONS.map((o) => <option key={o}>{o}</option>)}</select></Field>
            </>
          )}
          {!isNew && <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field>}
          <div className="form-grid">
            <Field label="Event date"><input type="date" className="input" value={f.eventDate} onChange={(e) => set('eventDate', e.target.value)} /></Field>
            <Field label="Event city"><input className="input" value={f.eventCity} onChange={(e) => set('eventCity', e.target.value)} /></Field>
            <Field label="Deal amount (₹)"><input className="input" inputMode="numeric" value={f.amount} onChange={(e) => set('amount', e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Our commission (₹)"><input className="input" inputMode="numeric" value={f.commissionAmount} onChange={(e) => set('commissionAmount', e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
          <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <div className="sheet__foot"><button className="btn btn--primary btn--block">Save booking</button></div>
      </form>
    </Sheet>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="muted">Loading…</p>}><Inner /></Suspense>;
}
