'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { adminApi, ApiError, request } from '@/lib/client';
import type { Artist } from '@/lib/api';
import ArtistCard from '../ArtistCard';
import { Field, MultiPick, Pill, TagInput, useAdmin, useLoad } from './ui';

const OCCASIONS = ['Wedding', 'Corporate', 'Birthday', 'College fest', 'Religious', 'Cultural', 'Private party'];
const GROUPS = ['Solo', 'Duo', 'Band', 'Troupe', 'Other'];
const LANG_SUGGEST = ['Hindi', 'Gujarati', 'English', 'Punjabi', 'Marathi', 'Urdu', 'Rajasthani', 'Bengali', 'Tamil', 'Telugu'];

const bucket = (n: number | null, steps: number[]) => { if (n == null) return null; let b: number | null = null; for (const s of steps) if (n >= s) b = s; return b; };
const YEARS = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40];
const EVENTS = [10, 25, 50, 100, 150, 200, 300, 500, 750, 1000, 2000, 5000];

const blank = {
  fullName: '', stageName: '', phone: '', altPhone: '', email: '', instagram: '', youtube: '', website: '', gender: '',
  cityId: '' as number | '', travelCityIds: [] as number[], categoryIds: [] as number[], primaryCategoryId: 0,
  languages: [] as string[], occasions: [] as string[], tags: [] as string[],
  headline: '', publicSummary: '', yearsExperience: '', eventsDone: '', groupType: '', teamSize: '',
  priceMin: '', priceMax: '', priceNotes: '', commissionPct: '', equipment: '', requirements: '', travelNotes: '', internalNotes: '', source: '',
  verified: false, featured: false, status: 'active', links: [] as { label: string; url: string }[],
};
type F = typeof blank;

const nstr = (s: any) => (String(s ?? '').trim() === '' ? null : String(s).trim());
const nnum = (s: any) => (String(s ?? '').trim() === '' ? null : Number(String(s).replace(/,/g, '')));

function toPayload(f: F) {
  return {
    fullName: f.fullName, stageName: nstr(f.stageName), phone: f.phone, altPhone: nstr(f.altPhone), email: nstr(f.email),
    instagram: nstr(f.instagram), youtube: nstr(f.youtube), website: nstr(f.website), gender: f.gender || null,
    cityId: f.cityId || null, travelCityIds: f.travelCityIds, categoryIds: f.categoryIds, primaryCategoryId: f.primaryCategoryId,
    languages: f.languages, occasions: f.occasions, tags: f.tags, headline: nstr(f.headline), publicSummary: nstr(f.publicSummary),
    yearsExperience: nnum(f.yearsExperience), eventsDone: nnum(f.eventsDone), groupType: f.groupType || null, teamSize: nnum(f.teamSize),
    priceMin: nnum(f.priceMin), priceMax: nnum(f.priceMax), priceNotes: nstr(f.priceNotes), commissionPct: nnum(f.commissionPct),
    equipment: nstr(f.equipment), requirements: nstr(f.requirements), travelNotes: nstr(f.travelNotes), internalNotes: nstr(f.internalNotes), source: nstr(f.source),
    verified: f.verified, featured: f.featured, status: f.status, links: f.links.filter((l) => l.url.trim()).map((l) => ({ label: nstr(l.label), url: l.url.trim() })),
  };
}

function fromArtist(a: any): F {
  const s = (v: any) => (v == null ? '' : v);
  return {
    ...blank,
    fullName: a.fullName, stageName: s(a.stageName), phone: a.phone, altPhone: s(a.altPhone), email: s(a.email), instagram: s(a.instagram), youtube: s(a.youtube), website: s(a.website),
    gender: s(a.gender), cityId: a.cityId ?? '', travelCityIds: a.travelCityIds, categoryIds: a.categoryIds, primaryCategoryId: a.primaryCategoryId ?? 0,
    languages: a.languages, occasions: a.occasions, tags: a.tags, headline: s(a.headline), publicSummary: s(a.publicSummary),
    yearsExperience: s(a.yearsExperience), eventsDone: s(a.eventsDone), groupType: s(a.groupType), teamSize: s(a.teamSize),
    priceMin: s(a.priceMin), priceMax: s(a.priceMax), priceNotes: s(a.priceNotes), commissionPct: s(a.commissionPct),
    equipment: s(a.equipment), requirements: s(a.requirements), travelNotes: s(a.travelNotes), internalNotes: s(a.internalNotes), source: s(a.source),
    verified: a.verified, featured: a.featured, status: a.status, links: a.links.map((l: any) => ({ label: l.label || '', url: l.url })),
  };
}

export default function ArtistForm({ id }: { id?: number }) {
  const router = useRouter();
  const { toast } = useAdmin();
  const { data: catalog } = useLoad(() => adminApi.get('/catalog'), []);
  const { data: loaded, reload } = useLoad(() => (id ? adminApi.get(`/artists/${id}`) : Promise.resolve(null)), [id]);
  const [f, setF] = useState<F>(blank);
  const [ready, setReady] = useState(!id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; field?: string } | null>(null);
  const [photoBust, setPhotoBust] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { if (loaded) { setF(fromArtist(loaded.artist)); setReady(true); } }, [loaded]);
  const artist = loaded?.artist;

  if (!catalog || !ready) return <p className="muted">Loading…</p>;
  const cats: any[] = catalog.categories;
  const cities: any[] = catalog.cities;
  const cityOpts = cities.map((c) => ({ id: c.id, label: `${c.name}, ${c.state}` }));
  const toggleCat = (cid: number) => {
    const has = f.categoryIds.includes(cid);
    const next = has ? f.categoryIds.filter((x) => x !== cid) : [...f.categoryIds, cid];
    setF((p) => ({ ...p, categoryIds: next, primaryCategoryId: next.includes(p.primaryCategoryId) ? p.primaryCategoryId : next[0] || 0 }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = toPayload(f);
      const res = id ? await adminApi.put(`/artists/${id}`, body) : await adminApi.post('/artists', body);
      toast(id ? 'Saved' : `Created ${res.artist.publicId}`);
      if (!id) router.replace(`/admin/artists/${res.artist.id}`);
      else reload();
    } catch (e2: any) {
      const message = e2 instanceof ApiError ? e2.message : 'Could not save';
      setErr({ message, field: e2.data?.field });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setBusy(false); }
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    try { await request('POST', `/api/admin/artists/${id}/photo`, fd); setPhotoBust(Date.now()); reload(); toast('Photo updated'); }
    catch (e2: any) { toast(e2.message || 'Upload failed', true); }
  }
  async function removePhoto() {
    if (!confirm('Remove this photo?')) return;
    await adminApi.del(`/artists/${id}/photo`); setPhotoBust(Date.now()); reload();
  }
  async function archive() {
    if (!confirm('Archive this artist? They disappear from the public site; bookings and reviews are kept.')) return;
    await adminApi.del(`/artists/${id}`); toast('Archived'); router.replace('/admin/artists');
  }

  const primaryName = cats.find((c) => c.id === f.primaryCategoryId)?.name || null;
  const city = cities.find((c) => c.id === f.cityId);
  const yb = bucket(nnum(f.yearsExperience), YEARS);
  const eb = bucket(nnum(f.eventsDone), EVENTS);
  const preview: Artist = {
    id: artist?.publicId || 'MA-XXXX', headline: f.headline || primaryName || 'Artist', category: primaryName, categorySlug: null,
    city: city?.name || null, state: city?.state || null, citySlug: null,
    experience: nnum(f.yearsExperience) == null ? null : yb ? `${yb}+ yrs` : 'New to stage', events: eb ? `${eb}+` : nnum(f.eventsDone) == null ? null : '<10',
    groupType: f.groupType || null, rating: null, reviewCount: 0, isNew: true, verified: f.verified, languages: f.languages, tags: f.tags,
    photo: artist?.publicPhotoKey ? `/media/p/${artist.publicPhotoKey}.jpg` : null,
  };
  const bad = (name: string) => (err?.field === name ? ' is-error' : '');

  return (
    <form onSubmit={save}>
      <div className="adm-title">
        <h1>{id ? (f.stageName || f.fullName) : 'Add artist'} {artist && <span className="mono" style={{ fontSize: 14, color: 'var(--orange-2)', marginLeft: 8 }}>{artist.publicId}</span>} {artist && <Pill s={artist.status} />}</h1>
        <div className="adm-actions">
          {id && <button type="button" className="btn btn--outline btn--sm btn--danger" onClick={archive}>Archive</button>}
          <button type="button" className="btn btn--outline btn--sm" onClick={() => router.push('/admin/artists')}>Back</button>
          <button className="btn btn--primary btn--sm" disabled={busy}>{busy ? 'Saving…' : 'Save artist'}</button>
        </div>
      </div>

      {err && <div className="warn" role="alert" style={{ marginBottom: 16 }}><strong>Could not save.</strong> {err.message}</div>}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)' }} className="artist-grid">
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>

          <section className="panel">
            <h2>Identity &amp; contact <span className="muted" style={{ fontWeight: 400 }}>· private, never shown to visitors</span></h2>
            <div className="form-grid">
              <Field label="Full name *"><input className="input" required value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
              <Field label="Stage / brand name"><input className="input" value={f.stageName} onChange={(e) => set('stageName', e.target.value)} /></Field>
              <Field label="Mobile *" hint="Unique. Also used to detect duplicates on import."><input className={`input${bad('phone')}`} inputMode="tel" required value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Alternate phone"><input className="input" value={f.altPhone} onChange={(e) => set('altPhone', e.target.value)} /></Field>
              <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Gender"><select className="select" value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">Not set</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></Field>
              <Field label="Instagram"><input className="input" value={f.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@handle or link" /></Field>
              <Field label="YouTube"><input className="input" value={f.youtube} onChange={(e) => set('youtube', e.target.value)} /></Field>
              <Field label="Website" span2><input className="input" value={f.website} onChange={(e) => set('website', e.target.value)} /></Field>
            </div>
          </section>

          <section className="panel">
            <h2>Public profile <span className="muted" style={{ fontWeight: 400 }}>· visitors see only this</span></h2>
            <div className="warn" style={{ marginBottom: 14 }}>Keep it anonymous. No names, phone numbers, @handles or links. The server rejects text that includes any of these.</div>
            <div className="form-grid">
              <Field label="Headline" hint='One line, e.g. "Bollywood & Gujarati wedding vocalist"' span2><input className={`input${bad('headline')}`} maxLength={140} value={f.headline} onChange={(e) => set('headline', e.target.value)} /></Field>
              <Field label="Short summary" hint="Optional, used for search. 600 characters max." span2><textarea className="textarea" maxLength={600} value={f.publicSummary} onChange={(e) => set('publicSummary', e.target.value)} /></Field>
              <Field label="Public tags" hint="Genres and styles, e.g. Sufi, Garba" span2><TagInput value={f.tags} onChange={(v) => set('tags', v)} placeholder="Type and press Enter" /></Field>
            </div>
          </section>

          <section className="panel">
            <h2>Categories, languages &amp; occasions</h2>
            <div className="form-grid">
              <Field label="Categories *" hint="Pick all that apply, then choose the primary one" span2>
                <div className="chips">{cats.map((c) => <button type="button" key={c.id} className="chip chip--sm" aria-pressed={f.categoryIds.includes(c.id)} onClick={() => toggleCat(c.id)}>{c.name}</button>)}</div>
              </Field>
              {f.categoryIds.length > 1 && (
                <Field label="Primary category" hint="Shown on the artist card"><select className="select" value={f.primaryCategoryId} onChange={(e) => set('primaryCategoryId', Number(e.target.value))}>{f.categoryIds.map((cid) => <option key={cid} value={cid}>{cats.find((c) => c.id === cid)?.name}</option>)}</select></Field>
              )}
              <Field label="Languages" span2><TagInput value={f.languages} onChange={(v) => set('languages', v)} suggestions={LANG_SUGGEST} placeholder="Type and press Enter" /></Field>
              <Field label="Occasions served" span2>
                <div className="chips">{OCCASIONS.map((o) => <button type="button" key={o} className="chip chip--sm" aria-pressed={f.occasions.includes(o)} onClick={() => set('occasions', f.occasions.includes(o) ? f.occasions.filter((x) => x !== o) : [...f.occasions, o])}>{o}</button>)}</div>
              </Field>
              <Field label="Format"><select className="select" value={f.groupType} onChange={(e) => set('groupType', e.target.value)}><option value="">Not set</option>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></Field>
              <Field label="Team size"><input className="input" inputMode="numeric" value={f.teamSize} onChange={(e) => set('teamSize', e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
          </section>

          <section className="panel">
            <h2>Location</h2>
            <div className="form-grid">
              <Field label="Home city"><select className="select" value={f.cityId} onChange={(e) => set('cityId', e.target.value ? Number(e.target.value) : '')}><option value="">Select…</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}</select></Field>
              <Field label="Travel notes"><input className="input" value={f.travelNotes} onChange={(e) => set('travelNotes', e.target.value)} placeholder="e.g. Needs travel + stay beyond 200 km" /></Field>
              <Field label="Also travels to" hint="Visitors searching these cities will see this artist too" span2><MultiPick options={cityOpts} value={f.travelCityIds} onChange={(v) => set('travelCityIds', v)} placeholder="Search cities…" /></Field>
            </div>
          </section>

          <section className="panel">
            <h2>Experience</h2>
            <div className="form-grid">
              <Field label="Years of experience" hint="Shown as a range, e.g. 8+ yrs"><input className="input" inputMode="numeric" value={f.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Events done" hint="Self-reported total. Shown as a range."><input className="input" inputMode="numeric" value={f.eventsDone} onChange={(e) => set('eventsDone', e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
          </section>

          <section className="panel">
            <h2>Commercials &amp; logistics <span className="muted" style={{ fontWeight: 400 }}>· private</span></h2>
            <div className="form-grid">
              <Field label="Price from (₹)"><input className="input" inputMode="numeric" value={f.priceMin} onChange={(e) => set('priceMin', e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Price up to (₹)"><input className="input" inputMode="numeric" value={f.priceMax} onChange={(e) => set('priceMax', e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Our commission (%)"><input className="input" inputMode="decimal" value={f.commissionPct} onChange={(e) => set('commissionPct', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
              <Field label="Price notes"><input className="input" value={f.priceNotes} onChange={(e) => set('priceNotes', e.target.value)} /></Field>
              <Field label="Equipment"><textarea className="textarea" value={f.equipment} onChange={(e) => set('equipment', e.target.value)} /></Field>
              <Field label="Requirements / rider"><textarea className="textarea" value={f.requirements} onChange={(e) => set('requirements', e.target.value)} /></Field>
            </div>
          </section>

          <section className="panel">
            <h2>Portfolio links <span className="muted" style={{ fontWeight: 400 }}>· private, to share on WhatsApp</span></h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {f.links.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <input className="input" style={{ flex: '1 1 30%' }} placeholder="Label" value={l.label} onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className="input" style={{ flex: '2 1 60%' }} placeholder="https://…" value={l.url} onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                  <button type="button" className="icon-btn" aria-label="Remove link" onClick={() => set('links', f.links.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <div><button type="button" className="btn btn--outline btn--sm" onClick={() => set('links', [...f.links, { label: '', url: '' }])}>Add link</button></div>
            </div>
          </section>

          <section className="panel">
            <h2>Status &amp; internal</h2>
            <div className="form-grid">
              <Field label="Status"><select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="active">Active (visible on site)</option><option value="pending">Pending (hidden)</option><option value="inactive">Inactive (hidden)</option><option value="archived">Archived</option></select></Field>
              <Field label="Source"><input className="input" value={f.source} onChange={(e) => set('source', e.target.value)} placeholder="Referral, Google Form, Instagram…" /></Field>
              <label className="check"><input type="checkbox" checked={f.verified} onChange={(e) => set('verified', e.target.checked)} /><span>Verified (shows a badge)</span></label>
              <label className="check"><input type="checkbox" checked={f.featured} onChange={(e) => set('featured', e.target.checked)} /><span>Featured (listed first)</span></label>
              <Field label="Internal notes" span2><textarea className="textarea" value={f.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} /></Field>
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', gap: 16, alignContent: 'start' }} className="artist-side">
          <section className="panel">
            <h2>Photo</h2>
            {!id ? <p className="muted" style={{ fontSize: 14 }}>Save the artist first, then upload a photo here.</p> : (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <div className="photo-box">{artist?.hasPhoto ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/admin/artists/${id}/photo?v=${photoBust}`} alt="Original (admin only)" /> : 'No photo'}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Original · admin only</div>
                  </div>
                  <div>
                    <div className="photo-box">{artist?.publicPhotoKey ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/media/p/${artist.publicPhotoKey}.jpg`} alt="Blurred public version" /> : 'Blurred version'}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>What visitors get</div>
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ''; }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => fileRef.current?.click()}>{artist?.hasPhoto ? 'Replace photo' : 'Upload photo'}</button>
                  {artist?.hasPhoto && <button type="button" className="btn btn--outline btn--sm btn--danger" onClick={removePhoto}>Remove</button>}
                </div>
                <p className="form-note">The blurred version is generated on the server. The original never reaches the public site.</p>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>How visitors will see this</h2>
            <div style={{ pointerEvents: 'none' }} aria-hidden="true"><ArtistCard artist={preview} onEnquire={() => {}} /></div>
          </section>
        </aside>
      </div>
      <style>{`@media (min-width: 1100px){ .artist-grid{ grid-template-columns: minmax(0,1fr) 380px !important; align-items:start } .artist-side{ position: sticky; top: 76px } }`}</style>
    </form>
  );
}
