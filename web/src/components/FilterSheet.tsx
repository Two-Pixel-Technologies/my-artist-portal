'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Facets } from '@/lib/api';
import { activeFilterCount, emptyFilters, toApiQuery, type Filters } from '@/lib/filters';
import { CheckIcon, ChevronLeft, ChevronRight, CloseIcon, SearchIcon } from '@/lib/icons';
import Sheet from './Sheet';

export type PickerKey = 'category' | 'city' | 'occasion' | 'language' | 'experience' | 'rating';

export const ROWS: { key: PickerKey; label: string }[] = [
  { key: 'category', label: 'Type of artist' },
  { key: 'city', label: 'City' },
  { key: 'occasion', label: 'Occasion' },
  { key: 'language', label: 'Language' },
  { key: 'experience', label: 'Experience' },
  { key: 'rating', label: 'Rating' },
];

const RATINGS = [
  { label: 'Any rating', value: null as number | null },
  { label: '4.0 and above', value: 4 },
  { label: '4.5 and above', value: 4.5 },
];

export function valueText(key: PickerKey, f: Filters, facets: Facets): string | null {
  switch (key) {
    case 'category': {
      const names = f.category.map((s) => facets.categories.find((c) => c.slug === s)?.name).filter(Boolean) as string[];
      return names.length ? names.join(', ') : null;
    }
    case 'city': {
      if (f.city) return facets.cities.find((c) => c.slug === f.city)?.name ?? f.city;
      return f.state;
    }
    case 'occasion': return f.occasion.length ? f.occasion.join(', ') : null;
    case 'language': return f.language.length ? f.language.join(', ') : null;
    case 'experience': return f.minYears != null ? `${f.minYears}+ years` : null;
    case 'rating': return f.minRating != null ? `${f.minRating.toFixed(1)}+` : null;
  }
}

const EMPTY_TEXT: Record<PickerKey, string> = { category: 'Any type', city: 'Anywhere', occasion: 'Any', language: 'Any', experience: 'Any', rating: 'Any' };
export const emptyText = (k: PickerKey) => EMPTY_TEXT[k];

function toggle<T>(arr: T[], v: T) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function FilterSheet({ facets, filters, startAt, onApply, onClose }: {
  facets: Facets;
  filters: Filters;
  startAt: PickerKey | null;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(filters);
  const [view, setView] = useState<PickerKey | null>(startAt);
  const [count, setCount] = useState<number | null>(null);
  const [cityQuery, setCityQuery] = useState('');

  // live result count for the button
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/artists?${toApiQuery(draft, { limit: '1' })}`, { signal: ctl.signal });
        const j = await res.json();
        setCount(j.total);
      } catch { /* ignore aborted */ }
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [draft]);

  const cta = count == null ? 'Show artists' : count === 0 ? 'No artists match' : `Show ${count} artist${count === 1 ? '' : 's'}`;
  const title = view ? ROWS.find((r) => r.key === view)!.label : 'Filters';

  const cities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const list = facets.cities.filter((c) => (!draft.state || c.state === draft.state) && (!q || c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)));
    const groups = new Map<string, typeof list>();
    for (const c of list) groups.set(c.state, [...(groups.get(c.state) || []), c]);
    return [...groups.entries()];
  }, [facets.cities, cityQuery, draft.state]);

  const Opt = ({ on, onClick, children, count: n }: { on: boolean; onClick: () => void; children: React.ReactNode; count?: number }) => (
    <button type="button" className={`opt${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span>{children}{n != null && <small>{n}</small>}</span>
      {on && <CheckIcon size={20} style={{ color: 'var(--orange-2)' }} />}
    </button>
  );

  return (
    <Sheet onClose={onClose} label={title}>
      {view ? (
        <div className="sheet__head sheet__head--back">
          <button className="icon-btn" aria-label="Back to all filters" onClick={() => setView(null)}><ChevronLeft /></button>
          <h2 className="sheet__title">{title}</h2>
        </div>
      ) : (
        <div className="sheet__head">
          <h2 className="sheet__title">Filters</h2>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            {activeFilterCount(draft) > 0 && (
              <button className="btn btn--sm" style={{ color: 'var(--orange-2)' }} onClick={() => setDraft({ ...emptyFilters, q: draft.q, sort: draft.sort })}>Clear all</button>
            )}
            <button className="icon-btn" aria-label="Close filters" onClick={onClose}><CloseIcon /></button>
          </span>
        </div>
      )}

      <div className="sheet__body">
        {!view && (
          <div>
            {ROWS.map((r) => {
              const v = valueText(r.key, draft, facets);
              return (
                <button key={r.key} type="button" className="row-btn" onClick={() => setView(r.key)}>
                  <span>
                    <span className="row-btn__label">{r.label}</span>
                    <span className={`row-btn__value${v ? '' : ' is-empty'}`}>{v || EMPTY_TEXT[r.key]}</span>
                  </span>
                  <ChevronRight style={{ color: 'var(--muted)' }} />
                </button>
              );
            })}
          </div>
        )}

        {view === 'category' && (
          <div>
            {facets.categories.filter((c) => c.count > 0).map((c) => (
              <Opt key={c.slug} on={draft.category.includes(c.slug)} count={c.count} onClick={() => setDraft({ ...draft, category: toggle(draft.category, c.slug) })}>{c.name}</Opt>
            ))}
          </div>
        )}

        {view === 'city' && (
          <div>
            <label className="search" style={{ height: 48, marginBottom: 6, borderRadius: 12 }}>
              <SearchIcon />
              <span className="sr-only">Search cities</span>
              <input placeholder="Search city" value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} />
            </label>
            {facets.states.length > 1 && (
              <div className="chips" style={{ padding: '10px 0 6px' }} role="group" aria-label="State">
                <button type="button" className="chip chip--sm" aria-pressed={!draft.state && !draft.city} onClick={() => setDraft({ ...draft, state: null, city: null })}>Anywhere</button>
                {facets.states.map((s) => (
                  <button type="button" key={s} className="chip chip--sm" aria-pressed={draft.state === s || (!!draft.city && facets.cities.find((c) => c.slug === draft.city)?.state === s)} onClick={() => setDraft({ ...draft, state: s, city: null })}>{s}</button>
                ))}
              </div>
            )}
            {cities.map(([state, list]) => (
              <div key={state}>
                <div className="opt-group">{state}</div>
                {list.map((c) => (
                  <Opt key={c.slug} on={draft.city === c.slug} count={c.count} onClick={() => setDraft({ ...draft, city: draft.city === c.slug ? null : c.slug, state: null })}>{c.name}</Opt>
                ))}
              </div>
            ))}
            {cities.length === 0 && <p className="muted" style={{ padding: '24px 0' }}>No cities match.</p>}
          </div>
        )}

        {view === 'occasion' && (
          <div>{facets.occasions.map((o) => <Opt key={o} on={draft.occasion.includes(o)} onClick={() => setDraft({ ...draft, occasion: toggle(draft.occasion, o) })}>{o}</Opt>)}</div>
        )}

        {view === 'language' && (
          <div>{facets.languages.map((l) => <Opt key={l.name} on={draft.language.includes(l.name)} count={l.count} onClick={() => setDraft({ ...draft, language: toggle(draft.language, l.name) })}>{l.name}</Opt>)}</div>
        )}

        {view === 'experience' && (
          <div>{facets.experience.map((e) => <Opt key={e.label} on={draft.minYears === e.value} onClick={() => setDraft({ ...draft, minYears: e.value })}>{e.label}</Opt>)}</div>
        )}

        {view === 'rating' && (
          <div>
            {RATINGS.map((r) => <Opt key={r.label} on={draft.minRating === r.value} onClick={() => setDraft({ ...draft, minRating: r.value })}>{r.label}</Opt>)}
            <p className="form-note" style={{ padding: '12px 0' }}>Ratings are shown for artists with at least 3 verified client reviews.</p>
          </div>
        )}
      </div>

      <div className="sheet__foot">
        <button className="btn btn--primary btn--block" style={{ minHeight: 54, fontSize: 16 }} onClick={() => onApply(draft)}>{cta}</button>
      </div>
    </Sheet>
  );
}
