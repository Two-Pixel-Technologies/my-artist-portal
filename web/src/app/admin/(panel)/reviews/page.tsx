'use client';
import { useState } from 'react';
import { adminApi } from '@/lib/client';
import { fmtDate, Pill, useAdmin, useLoad } from '@/components/admin/ui';

const LABELS: [string, string][] = [['r_punctuality', 'Punctuality'], ['r_performance', 'Performance'], ['r_professionalism', 'Professionalism'], ['r_communication', 'Communication'], ['r_value', 'Value']];

export default function Reviews() {
  const { toast, refreshBadges } = useAdmin();
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useLoad(() => adminApi.get(`/reviews?status=${status}`), [status]);
  async function set(id: number, s: string) {
    try { await adminApi.patch(`/reviews/${id}`, { status: s }); toast(s === 'approved' ? 'Approved: now counts toward the artist rating' : s === 'rejected' ? 'Rejected' : 'Moved back to pending'); reload(); refreshBadges(); }
    catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="adm-title"><h1>Review approvals</h1></div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>Only approved reviews count toward an artist&apos;s rating. Review text can&apos;t be edited, only approved or rejected. Reject only abusive, off-topic or clearly fake reviews.</p>
      <div className="tabs">{['pending', 'approved', 'rejected'].map((s) => <button key={s} className="chip chip--sm" aria-pressed={status === s} onClick={() => setStatus(s)} style={{ textTransform: 'capitalize' }}>{s}</button>)}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {(data?.reviews || []).map((r: any) => (
          <article className="panel" key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 16 }}>★ {r.rating_overall.toFixed(1)}</strong>
                <span className="muted" style={{ marginLeft: 10 }}>by {r.reviewer_name}</span>
                <div className="sub muted" style={{ fontSize: 13, marginTop: 4 }}><span className="mono" style={{ color: 'var(--orange-2)' }}>{r.artist_public_id}</span> {r.artist_name} · booking by {r.client_name}{r.occasion ? ` · ${r.occasion}` : ''}{r.event_date ? ` · ${fmtDate(r.event_date)}` : ''}</div>
              </div>
              <Pill s={r.status} />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0', fontSize: 13, color: 'var(--text-2)' }}>{LABELS.map(([k, l]) => <span key={k}>{l}: <strong>{r[k]}</strong></span>)}</div>
            {r.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p> : <p className="muted" style={{ fontSize: 14 }}>No written review.</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {r.status !== 'approved' && <button className="btn btn--primary btn--sm" onClick={() => set(r.id, 'approved')}>Approve</button>}
              {r.status !== 'rejected' && <button className="btn btn--outline btn--sm btn--danger" onClick={() => set(r.id, 'rejected')}>Reject</button>}
              {r.status !== 'pending' && <button className="btn btn--outline btn--sm" onClick={() => set(r.id, 'pending')}>Back to pending</button>}
            </div>
          </article>
        ))}
        {!loading && data?.reviews.length === 0 && <p className="muted" style={{ padding: 24, textAlign: 'center' }}>Nothing here.</p>}
      </div>
    </>
  );
}
