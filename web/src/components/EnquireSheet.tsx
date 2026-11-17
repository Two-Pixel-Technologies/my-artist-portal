'use client';
import { useState } from 'react';
import type { Artist } from '@/lib/api';
import { CheckIcon, CloseIcon, LockIcon, WhatsAppIcon } from '@/lib/icons';
import { request, ApiError } from '@/lib/client';
import Sheet from './Sheet';

const OCCASIONS = ['Wedding', 'Corporate', 'Birthday', 'College fest', 'Religious', 'Cultural', 'Private party'];

export default function EnquireSheet({ artist, defaultCity, onClose }: { artist: Artist | null; defaultCity?: string; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', eventDate: '', eventCity: defaultCity || '', occasion: '', message: '', consent: false, website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const today = new Date().toISOString().slice(0, 10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = 'Please enter your name';
    if (!/^(\+?91|0)?[6-9]\d{9}$/.test(form.phone.replace(/[\s-]/g, ''))) errs.phone = 'Enter a valid 10-digit mobile number';
    if (!form.consent) errs.consent = 'Please agree to be contacted';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError('');
    try {
      const res = await request<{ ref: string }>('POST', '/api/public/enquiries', {
        name: form.name,
        phone: form.phone,
        eventDate: form.eventDate || null,
        eventCity: form.eventCity || null,
        occasion: form.occasion || null,
        message: form.message || null,
        artistId: artist?.id ?? null,
        consent: true,
        website: form.website,
        pageUrl: window.location.pathname + window.location.search,
      });
      setDone(res.ref);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setFormError('Too many requests. Please try again in a little while, or message us on WhatsApp.');
      else setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again or message us on WhatsApp.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Sheet onClose={onClose} label="Enquiry sent">
        <div className="sheet__body" style={{ textAlign: 'center', padding: '36px 24px 8px', display: 'grid', gap: 14, justifyItems: 'center' }}>
          <div className="big-check"><CheckIcon size={34} /></div>
          <h2 className="sheet__title" style={{ fontSize: 26 }}>We&apos;ve got your enquiry.</h2>
          <p className="muted" style={{ maxWidth: 320 }}>Our team will message you on WhatsApp or call with the artist&apos;s details and a few more options.</p>
          {artist && <div className="chip chip--sm" style={{ minHeight: 40 }}>Artist <span className="mono" style={{ color: 'var(--orange-2)' }}>{artist.id}</span></div>}
        </div>
        <div className="sheet__foot">
          <button className="btn btn--primary btn--block" onClick={onClose}>Keep browsing artists</button>
          <a className="btn btn--outline btn--block" href={artist ? `/go/wa?a=${artist.id}` : '/go/wa'} target="_blank" rel="noopener noreferrer"><WhatsAppIcon /> Chat with us on WhatsApp</a>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} label="Enquire about this artist">
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="sheet__head">
          <h2 className="sheet__title" style={{ fontSize: 20 }}>{artist ? 'Enquire about this artist' : 'Tell us about your event'}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet__body" style={{ display: 'grid', gap: 16, alignContent: 'start', paddingBottom: 16 }}>
          {artist && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 10, background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div className="card__img" style={{ width: 56, height: 56, flex: '0 0 56px', borderRadius: 8 }}>
                {artist.photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={artist.photo} alt="" width={56} height={56} />}
                <span className="lock"><LockIcon size={16} /></span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12, color: 'var(--orange-2)', letterSpacing: '.04em' }}>{artist.id}</div>
                <div style={{ fontSize: 14, marginTop: 3, lineHeight: 1.3 }}>{artist.headline}{artist.city ? ` · ${artist.city}` : ''}</div>
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="enq-name">Your name</label>
            <input id="enq-name" className={`input${errors.name ? ' is-error' : ''}`} autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="field">
            <label htmlFor="enq-phone">WhatsApp number</label>
            <div className={`input input--phone${errors.phone ? ' is-error' : ''}`}>
              <span>+91</span>
              <input id="enq-phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            {errors.phone && <span className="form-error">{errors.phone}</span>}
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label htmlFor="enq-date">Event date</label>
              <input id="enq-date" type="date" min={today} className="input" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="enq-city">Event city</label>
              <input id="enq-city" className="input" autoComplete="address-level2" value={form.eventCity} onChange={(e) => set('eventCity', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <span className="label">Occasion</span>
            <div className="chips" role="group" aria-label="Occasion">
              {OCCASIONS.map((o) => {
                const on = form.occasion === o;
                return (
                  <button type="button" key={o} className="chip chip--sm" aria-pressed={on} onClick={() => set('occasion', on ? '' : o)}>{o}</button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label htmlFor="enq-msg">Anything we should know <span className="hint">(optional)</span></label>
            <textarea id="enq-msg" className="textarea" rows={2} maxLength={1000} placeholder="Guests, venue, timing, language…" value={form.message} onChange={(e) => set('message', e.target.value)} />
          </div>

          <div className="hp" aria-hidden="true">
            <label>Leave this empty <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} /></label>
          </div>

          <label className="check">
            <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
            <span>I agree to be contacted by myartist.in on WhatsApp or phone about this enquiry.{errors.consent && <><br /><span className="form-error">{errors.consent}</span></>}</span>
          </label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </div>
        <div className="sheet__foot">
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'}</button>
          <p className="form-note" style={{ textAlign: 'center' }}>Our team will reach you on WhatsApp or call with the artist&apos;s details and other options.</p>
        </div>
      </form>
    </Sheet>
  );
}
