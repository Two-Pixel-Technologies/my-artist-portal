'use client';
import type { Artist } from '@/lib/api';
import { LockIcon, PinIcon, ShieldIcon, WhatsAppIcon } from '@/lib/icons';

export default function ArtistCard({ artist, onEnquire }: { artist: Artist; onEnquire: (a: Artist) => void }) {
  const a = artist;
  const place = [a.city, a.state].filter(Boolean).join(', ');
  const rated = !!a.rating;
  return (
    <article className="card" aria-label={`${a.category || 'Artist'} ${a.id}`}>
      <div className="card__top">
        <div className="card__photo">
          <div className="card__img">
            {a.photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.photo} alt="" width={72} height={72} loading="lazy" decoding="async" />}
            <span className="lock"><LockIcon size={18} /></span>
          </div>
          <span className="card__id">{a.id}</span>
        </div>
        <div className="card__info">
          <div className="card__cat">
            {a.category}
            {a.verified && <span className="verified"><ShieldIcon /> Verified</span>}
          </div>
          <h3 className="card__title">{a.headline}</h3>
          {place && <div className="card__city" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><PinIcon size={14} />{place}</div>}
        </div>
      </div>

      <div className="stats">
        <div>
          {rated ? (
            <>
              <b className="star">★ {a.rating!.avg.toFixed(1)}</b>
              <span>{a.rating!.count} reviews</span>
            </>
          ) : (
            <>
              <b>New</b>
              <span>{a.reviewCount > 0 ? `${a.reviewCount} review${a.reviewCount > 1 ? 's' : ''}` : 'Just joined'}</span>
            </>
          )}
        </div>
        <div><b>{a.experience || '—'}</b><span>Experience</span></div>
        <div><b>{a.events || '—'}</b><span>Events done</span></div>
      </div>

      {a.languages.length > 0 && <div className="card__langs">{a.languages.join(' · ')}</div>}

      <div className="card__actions">
        <a className="btn btn--wa" href={`/go/wa?a=${a.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Ask about artist ${a.id} on WhatsApp`}>
          <WhatsAppIcon /> WhatsApp
        </a>
        <button className="btn btn--primary" onClick={() => onEnquire(a)}>Enquire for details</button>
      </div>
    </article>
  );
}
