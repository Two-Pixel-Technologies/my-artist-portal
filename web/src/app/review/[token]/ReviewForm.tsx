'use client';
import { useEffect, useState } from 'react';
import { ApiError, request } from '@/lib/client';
import { CheckIcon, StarIcon } from '@/lib/icons';

type Info = { valid: true; artist: { name: string; category: string | null; headline: string | null }; booking: { occasion: string | null; city: string | null; eventDate: string | null }; categories: { key: string; label: string }[] } | { valid: false; reason: string };

const REASONS: Record<string, { title: string; text: string }> = {
  used: { title: 'This review has already been submitted', text: 'Thank you! Each link can only be used once.' },
  expired: { title: 'This link has expired', text: 'Please ask the myartist.in team to send you a new review link.' },
  revoked: { title: 'This link is no longer active', text: 'Please ask the myartist.in team to send you a new review link.' },
  invalid: { title: "We couldn't find this review link", text: 'Check that you opened the full link, or ask the myartist.in team to send it again.' },
};

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={`rstar${n <= value ? ' on' : ''}`} onClick={() => onChange(n)}>
          <StarIcon filled={n <= value} />
        </button>
      ))}
    </div>
  );
}

export default function ReviewForm({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    request<Info>('GET', `/api/public/review/${encodeURIComponent(token)}`).then(setInfo).catch(() => setInfo({ valid: false, reason: 'invalid' }));
  }, [token]);

  if (!info) return <div className="review"><p className="muted">Loading…</p></div>;

  if (!info.valid) {
    const r = REASONS[(info as any).reason] || REASONS.invalid;
    return <div className="review review__done"><h1>{r.title}</h1><p className="muted">{r.text}</p></div>;
  }

  if (done) {
    return (
      <div className="review review__done">
        <div className="big-check"><CheckIcon size={34} /></div>
        <h1>Thank you for your review</h1>
        <p className="muted">It helps other people choose the right artist, and helps artists grow. Your review will appear once our team has checked it.</p>
      </div>
    );
  }

  const allRated = info.categories.every((c) => ratings[c.key]);
  const eventBits = [info.booking.occasion, info.booking.city].filter(Boolean).join(' · ');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!allRated) return setError('Please rate every category.');
    if (name.trim().length < 2) return setError('Please add your name.');
    if (!consent) return setError('Please confirm to publish your review.');
    setBusy(true);
    setError('');
    try {
      await request('POST', `/api/public/review/${encodeURIComponent(token)}`, { ratings, text: text || null, reviewerName: name, consent: true });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setInfo({ valid: false, reason: err.data?.reason || 'used' });
      else setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="review" onSubmit={submit} noValidate>
      <p className="muted" style={{ fontSize: 14 }}>{eventBits || 'Your recent booking'}</p>
      <h1>How was {info.artist.name}?</h1>
      <p className="muted" style={{ marginTop: 8 }}>Rate each area from 1 to 5 stars. It takes about a minute.</p>

      <div className="review__box">
        {info.categories.map((c) => (
          <div className="rate-row" key={c.key}>
            <span>{c.label}</span>
            <Stars value={ratings[c.key] || 0} onChange={(n) => setRatings((r) => ({ ...r, [c.key]: n }))} label={c.label} />
          </div>
        ))}

        <div className="field">
          <label htmlFor="rv-text">Tell others about your experience <span className="hint">(optional)</span></label>
          <textarea id="rv-text" className="textarea" rows={4} maxLength={1200} value={text} onChange={(e) => setText(e.target.value)} placeholder="What went well? What would you tell a friend planning a similar event?" />
        </div>

        <div className="field">
          <label htmlFor="rv-name">Your name</label>
          <input id="rv-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <span className="hint">Only your first name and initial are shown publicly.</span>
        </div>

        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I confirm this review is honest and based on my own experience, and I agree to it being published on myartist.in.</span>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit review'}</button>
        <p className="form-note" style={{ textAlign: 'center' }}>You can only submit this review once.</p>
      </div>
    </form>
  );
}
