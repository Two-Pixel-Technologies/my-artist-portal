'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Artist, ArtistList, Facets } from '@/lib/api';
import { activeFilterCount, emptyFilters, toApiQuery, toUrl, type Filters } from '@/lib/filters';
import { ChevronDown, SearchIcon, SlidersIcon } from '@/lib/icons';
import ArtistCard from './ArtistCard';
import EnquireSheet from './EnquireSheet';
import FilterSheet, { emptyText, ROWS, valueText, type PickerKey } from './FilterSheet';

const SORTS = [
  { value: 'top', label: 'Top rated' },
  { value: 'experience', label: 'Most experienced' },
  { value: 'events', label: 'Most events' },
  { value: 'new', label: 'Newest' },
];

export default function Explorer({ initial, facets, filters }: { initial: ArtistList; facets: Facets; filters: Filters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<Artist[]>(initial.artists);
  const [page, setPage] = useState(initial.page);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState(filters.q);
  const [sheet, setSheet] = useState<{ start: PickerKey | null } | null>(null);
  const [enquire, setEnquire] = useState<{ artist: Artist | null } | null>(null);

  const apply = (f: Filters) => {
    setSheet(null);
    startTransition(() => router.push(toUrl(f), { scroll: false }));
  };
  const count = activeFilterCount(filters);
  const cityName = filters.city ? facets.cities.find((c) => c.slug === filters.city)?.name : undefined;

  async function more() {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/public/artists?${toApiQuery(filters, { page: String(page + 1) })}`);
      const j: ArtistList = await res.json();
      setItems((cur) => [...cur, ...j.artists.filter((a) => !cur.some((c) => c.id === a.id))]);
      setPage(j.page);
      setHasMore(j.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  const chips: { key: PickerKey; label: string }[] = [
    { key: 'category', label: 'Type' }, { key: 'city', label: 'City' }, { key: 'occasion', label: 'Occasion' },
    { key: 'language', label: 'Language' }, { key: 'experience', label: 'Experience' }, { key: 'rating', label: 'Rating' },
  ];

  return (
    <>
      <div className="searchbar-wrap">
        <form className="searchbar" role="search" onSubmit={(e) => { e.preventDefault(); apply({ ...filters, q: q.trim() }); }}>
          <label className="search">
            <SearchIcon />
            <span className="sr-only">Search artists</span>
            <input type="search" placeholder="Search artists" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          </label>
          <button type="button" className="filter-btn" aria-label={count ? `All filters, ${count} applied` : 'All filters'} onClick={() => setSheet({ start: null })}>
            <SlidersIcon size={22} />
            {count > 0 && <span className="badge-count">{count}</span>}
          </button>
        </form>
        <div className="chip-scroll" role="group" aria-label="Quick filters">
          {chips.map((c) => {
            const v = valueText(c.key, filters, facets);
            return (
              <button key={c.key} className={`chip${v ? ' is-active' : ''}`} onClick={() => setSheet({ start: c.key })}>
                {v ? (v.length > 18 ? `${v.slice(0, 16)}…` : v) : c.label}
                <ChevronDown />
              </button>
            );
          })}
        </div>
      </div>

      <div className="explorer">
        <aside className="rail" aria-label="Filters">
          <div className="rail__title"><span>Filters</span>{count > 0 && <button className="link" style={{ fontSize: 13 }} onClick={() => apply({ ...emptyFilters, q: filters.q, sort: filters.sort })}>Clear all</button>}</div>
          <div className="rail__group">
            <div className="rail__label">Type of artist</div>
            {facets.categories.filter((c) => c.count > 0).map((c) => (
              <label key={c.slug} className="rail__check">
                <input type="checkbox" checked={filters.category.includes(c.slug)} onChange={() => apply({ ...filters, category: filters.category.includes(c.slug) ? filters.category.filter((s) => s !== c.slug) : [...filters.category, c.slug] })} />
                {c.name}
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {ROWS.filter((r) => r.key !== 'category').map((r) => {
              const v = valueText(r.key, filters, facets);
              return (
                <button key={r.key} className="rail__row" onClick={() => setSheet({ start: r.key })}>
                  <span><small>{r.label}</small><span className={`v${v ? '' : ' is-empty'}`}>{v || emptyText(r.key)}</span></span>
                  <ChevronDown />
                </button>
              );
            })}
          </div>
        </aside>

        <section aria-live="polite">
          <div className="results-bar">
            <span>{initial.total} artist{initial.total === 1 ? '' : 's'}</span>
            <label className="sort">
              <span className="sr-only">Sort by</span>
              <select value={filters.sort} onChange={(e) => apply({ ...filters, sort: e.target.value })}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {items.length === 0 ? (
            <div className="empty">
              <h2>No artists match these filters</h2>
              <p>Try widening your search, or tell us about your event and we&apos;ll shortlist artists for you.</p>
              <div className="hero__cta" style={{ marginTop: 0, justifyContent: 'center' }}>
                {count > 0 && <button className="btn btn--outline" onClick={() => apply({ ...emptyFilters })}>Clear filters</button>}
                <button className="btn btn--primary" onClick={() => setEnquire({ artist: null })}>Tell us what you need</button>
              </div>
            </div>
          ) : (
            <div className={`grid${pending ? ' skeleton' : ''}`}>
              {items.map((a) => <ArtistCard key={a.id} artist={a} onEnquire={(x) => setEnquire({ artist: x })} />)}
            </div>
          )}

          {hasMore && (
            <div className="more">
              <button className="btn btn--outline" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more artists'}</button>
            </div>
          )}
        </section>
      </div>

      {sheet && <FilterSheet facets={facets} filters={filters} startAt={sheet.start} onApply={apply} onClose={() => setSheet(null)} />}
      {enquire && <EnquireSheet artist={enquire.artist} defaultCity={cityName} onClose={() => setEnquire(null)} />}
    </>
  );
}
