'use client';
import Link from 'next/link';
import { adminApi } from '@/lib/client';
import { ago, Pill, STATUS_LABEL, useAdmin, useLoad } from '@/components/admin/ui';

export default function Dashboard() {
  const { admin } = useAdmin();
  const { data: d, error } = useLoad(() => adminApi.get('/dashboard'), []);
  const { data: n } = useLoad(() => adminApi.get('/notifications'), []);
  if (error) return <p className="form-error">{error}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const total = d.pipeline.reduce((a: number, p: any) => a + p.n, 0) || 1;
  const order = ['new', 'contacted', 'options_sent', 'booked', 'lost'];
  const pipe = order.map((s) => ({ s, n: d.pipeline.find((p: any) => p.status === s)?.n || 0 }));
  return (
    <>
      <div className="adm-title"><h1>Hello, {admin.name.split(' ')[0]}</h1></div>

      <div className="stat-grid">
        <Link href="/admin/enquiries?status=new" className={`stat${d.newEnquiries ? ' is-hot' : ''}`}><b>{d.newEnquiries}</b><span>New enquiries</span></Link>
        <Link href="/admin/reviews" className={`stat${d.pendingReviews ? ' is-hot' : ''}`}><b>{d.pendingReviews}</b><span>Reviews to approve</span></Link>
        <Link href="/admin/bookings?awaiting=1" className="stat"><b>{d.awaitingReview}</b><span>Past events, no review yet</span></Link>
        <Link href="/admin/bookings" className="stat"><b>{d.upcomingBookings}</b><span>Upcoming bookings</span></Link>
        <Link href="/admin/artists" className="stat"><b>{d.activeArtists}</b><span>Active artists{d.pendingArtists ? ` · ${d.pendingArtists} pending` : ''}</span></Link>
        <div className="stat"><b>{d.whatsappClicks7d}</b><span>WhatsApp clicks (7 days)</span></div>
      </div>

      <div className="two-col">
        <section className="panel">
          <h2>Enquiry pipeline</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {pipe.map(({ s, n: c }) => (
              <Link key={s} href={`/admin/enquiries?status=${s}`} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 34px', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <span>{STATUS_LABEL[s]}</span>
                <span style={{ background: 'var(--bg-alt)', borderRadius: 999, height: 10, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(c / total) * 100}%`, background: 'var(--grad)' }} /></span>
                <span style={{ textAlign: 'right' }}>{c}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Latest activity</h2>
          {!n || n.notifications.length === 0 ? <p className="muted">Nothing yet. New enquiries and reviews will appear here.</p> : (
            <div style={{ display: 'grid', gap: 2 }}>
              {n.notifications.slice(0, 6).map((x: any) => (
                <Link key={x.id} href={x.link || '/admin'} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <strong style={{ fontSize: 14 }}>{x.title}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>{x.body} · {ago(x.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Most enquired artists (30 days)</h2>
          {d.topArtists.length === 0 ? <p className="muted">No enquiries yet.</p> : (
            <table className="tbl" style={{ minWidth: 0 }}><tbody>{d.topArtists.map((a: any) => <tr key={a.public_id}><td><span className="mono" style={{ color: 'var(--orange-2)' }}>{a.public_id}</span></td><td>{a.name}</td><td className="num">{a.enquiries}</td></tr>)}</tbody></table>
          )}
        </section>

        <section className="panel">
          <h2>Most WhatsApp clicks (30 days)</h2>
          {d.whatsappTop.length === 0 ? <p className="muted">No clicks yet.</p> : (
            <table className="tbl" style={{ minWidth: 0 }}><tbody>{d.whatsappTop.map((a: any) => <tr key={a.public_id}><td><span className="mono" style={{ color: 'var(--orange-2)' }}>{a.public_id}</span></td><td>{a.name}</td><td className="num">{a.clicks}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>
    </>
  );
}
