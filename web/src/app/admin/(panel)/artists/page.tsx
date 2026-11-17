'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/client';
import { Pager, Pill, useDebounced, useLoad } from '@/components/admin/ui';

export default function Artists() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [verified, setVerified] = useState('');
  const [page, setPage] = useState(1);
  const { data: catalog } = useLoad(() => adminApi.get('/catalog'), []);
  const qs = new URLSearchParams({ q: dq, page: String(page), ...(status ? { status } : {}), ...(category ? { category } : {}), ...(city ? { city } : {}), ...(verified ? { verified } : {}) }).toString();
  const { data, loading } = useLoad(() => adminApi.get(`/artists?${qs}`), [qs]);
  useEffect(() => setPage(1), [dq, status, category, city, verified]);

  return (
    <>
      <div className="adm-title">
        <h1>Artists {data && <span className="muted" style={{ fontSize: 16, fontFamily: 'var(--font-body)' }}>· {data.total}</span>}</h1>
        <div className="adm-actions">
          <Link className="btn btn--outline btn--sm" href="/admin/artists/import">Import Excel</Link>
          <a className="btn btn--outline btn--sm" href="/api/admin/artists/export.xlsx">Export</a>
          <Link className="btn btn--primary btn--sm" href="/admin/artists/new">Add artist</Link>
        </div>
      </div>

      <div className="toolbar">
        <input className="input grow" placeholder="Search name, phone, ID or headline" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search artists" />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Active &amp; pending</option><option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option><option value="archived">Archived</option><option value="all">All</option></select>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"><option value="">All categories</option>{catalog?.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="select" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City"><option value="">All cities</option>{catalog?.cities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="select" value={verified} onChange={(e) => setVerified(e.target.value)} aria-label="Verified"><option value="">Verified: any</option><option value="1">Verified</option><option value="0">Not verified</option></select>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>ID</th><th>Artist</th><th>Phone</th><th>Location</th><th>Category</th><th className="num">Exp / events</th><th className="num">Rating</th><th className="num">Enq.</th><th>Status</th></tr></thead>
          <tbody>
            {(data?.artists || []).map((a: any) => (
              <tr key={a.id} className="is-click" onClick={() => router.push(`/admin/artists/${a.id}`)}>
                <td className="mono" style={{ color: 'var(--orange-2)', fontSize: 13 }}>{a.public_id}</td>
                <td><div><strong>{a.stage_name || a.full_name}</strong>{a.verified && <span className="verified" style={{ marginLeft: 8 }}>✓</span>}</div><div className="sub">{a.stage_name ? a.full_name : a.headline}</div></td>
                <td>{a.phone}</td>
                <td>{a.city ? `${a.city}, ${a.state}` : '—'}</td>
                <td>{a.categories || '—'}</td>
                <td className="num">{a.years_experience ?? '—'}y / {a.events_done ?? '—'}</td>
                <td className="num">{a.rating ? `★ ${a.rating} (${a.reviews})` : a.reviews ? `(${a.reviews})` : '—'}</td>
                <td className="num">{a.enquiries}</td>
                <td><Pill s={a.status} /></td>
              </tr>
            ))}
            {!loading && data?.artists.length === 0 && <tr><td colSpan={9} className="muted" style={{ padding: 32, textAlign: 'center' }}>No artists match. <Link className="link" href="/admin/artists/new">Add one</Link> or <Link className="link" href="/admin/artists/import">import from Excel</Link>.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
