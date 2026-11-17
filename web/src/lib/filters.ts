import type { Facets } from './api';

export type Filters = {
  category: string[];
  city: string | null;
  state: string | null;
  occasion: string[];
  language: string[];
  minYears: number | null;
  minRating: number | null;
  q: string;
  sort: string;
};

export const emptyFilters: Filters = { category: [], city: null, state: null, occasion: [], language: [], minYears: null, minRating: null, q: '', sort: 'top' };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
const list = (v: string | string[] | undefined) => first(v).split(',').map((s) => s.trim()).filter(Boolean);
const num = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return first(v) !== '' && Number.isFinite(n) ? n : null;
};

/** `/artists/<category|all>/<city>` carry the main SEO dimensions; everything else is a query param. */
export function parseFilters(segments: string[] | undefined, sp: SP): Filters {
  const [seg0, seg1] = segments || [];
  const category = seg0 && seg0 !== 'all' ? [seg0] : list(sp.category);
  return {
    category,
    city: seg1 || first(sp.city) || null,
    state: first(sp.state) || null,
    occasion: list(sp.occasion),
    language: list(sp.language),
    minYears: num(sp.minYears),
    minRating: num(sp.minRating),
    q: first(sp.q).slice(0, 80),
    sort: ['top', 'experience', 'events', 'new'].includes(first(sp.sort)) ? first(sp.sort) : 'top',
  };
}

function extras(f: Filters, params: URLSearchParams) {
  if (f.state && !f.city) params.set('state', f.state);
  if (f.occasion.length) params.set('occasion', f.occasion.join(','));
  if (f.language.length) params.set('language', f.language.join(','));
  if (f.minYears != null) params.set('minYears', String(f.minYears));
  if (f.minRating != null) params.set('minRating', String(f.minRating));
  if (f.q) params.set('q', f.q);
  if (f.sort && f.sort !== 'top') params.set('sort', f.sort);
}

/** Query string for the API (flat). */
export function toApiQuery(f: Filters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  if (f.category.length) p.set('category', f.category.join(','));
  if (f.city) p.set('city', f.city);
  extras(f, p);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

/** Browser URL: a single category and/or a city become path segments (crawlable landing pages). */
export function toUrl(f: Filters) {
  const p = new URLSearchParams();
  let path = '/artists';
  const single = f.category.length === 1;
  if (single || f.city) path += `/${single ? f.category[0] : 'all'}`;
  if (f.city) path += `/${f.city}`;
  if (f.category.length > 1) p.set('category', f.category.join(','));
  extras(f, p);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

export const activeFilterCount = (f: Filters) =>
  (f.category.length ? 1 : 0) + (f.city || f.state ? 1 : 0) + (f.occasion.length ? 1 : 0) + (f.language.length ? 1 : 0) + (f.minYears != null ? 1 : 0) + (f.minRating != null ? 1 : 0);

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function describe(f: Filters, facets: Facets) {
  const cats = f.category.map((s) => facets.categories.find((c) => c.slug === s)).filter(Boolean) as Facets['categories'];
  const city = f.city ? facets.cities.find((c) => c.slug === f.city) : null;
  const where = city ? city.name : f.state || null;
  const noun = cats.length === 1 ? cats[0].plural : cats.length > 1 ? cats.map((c) => c.plural).join(' & ') : 'Artists';
  const occ = f.occasion.length === 1 ? `${f.occasion[0]} ` : '';
  const base = occ ? `${occ}${lower(noun)}` : noun;
  const heading = where ? `${base} in ${where}` : cats.length || occ ? base : 'Find your artist';
  const filtered = !!(cats.length || where || occ);
  const desc = filtered
    ? `Browse ${lower(heading)} on myartist.in. See experience, events done and verified client reviews, then enquire and we will introduce you to the right artist.`
    : 'Browse vetted performers for weddings, corporate events, birthdays and more. See experience, events done and verified client reviews, then enquire and we will introduce you.';
  return { heading, filtered, description: desc, cityName: city?.name || null, categoryName: cats.length === 1 ? cats[0].name : null };
}
