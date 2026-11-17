import { OCCASIONS, GROUP_TYPES } from '../config.js';

const YEAR_STEPS = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40];
const EVENT_STEPS = [10, 25, 50, 100, 150, 200, 300, 500, 750, 1000, 2000, 5000];

function bucket(n, steps, none) {
  if (n == null) return null;
  let b = null;
  for (const s of steps) if (n >= s) b = s;
  return b == null ? none : `${b}+`;
}

/**
 * THE public contract. This is the only place an artist row becomes something a visitor can see.
 * Every field is listed explicitly: nothing is spread, so adding a column to `artists` can never leak it.
 * Not included on purpose: name, stage name, phone, email, social links, price, exact counts, internal notes.
 */
export function toPublicArtist(r, minReviews) {
  const count = r.review_count || 0;
  const showRating = count >= minReviews;
  return {
    id: r.public_id,
    headline: r.headline || (r.primary_category ? `${r.primary_category}` : 'Artist'),
    category: r.primary_category || null,
    categorySlug: r.primary_slug || null,
    city: r.city_name || null,
    state: r.city_state || null,
    citySlug: r.city_slug || null,
    experience: r.years_experience == null ? null : r.years_experience >= 1 ? `${bucket(r.years_experience, YEAR_STEPS)} yrs` : 'New to stage',
    events: r.events_done == null ? null : bucket(r.events_done, EVENT_STEPS, '<10'),
    groupType: r.group_type || null,
    rating: showRating ? { avg: Math.round(r.avg_rating * 10) / 10, count } : null,
    reviewCount: count,
    isNew: count === 0,
    verified: !!r.verified,
    languages: r.languages ? r.languages.split('|') : [],
    tags: r.tags ? r.tags.split('|').slice(0, 4) : [],
    photo: r.photo_public ? `/media/p/${r.photo_public}.jpg` : null,
  };
}

export const csv = (v) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export function parseFilters(q = {}) {
  const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const sort = ['top', 'experience', 'events', 'new'].includes(q.sort) ? q.sort : 'top';
  return {
    category: csv(q.category),
    city: String(q.city || '').trim().toLowerCase() || null,
    state: String(q.state || '').trim() || null,
    occasion: csv(q.occasion).filter((o) => OCCASIONS.includes(o)),
    language: csv(q.language),
    group: csv(q.group).filter((g) => GROUP_TYPES.includes(g)),
    minYears: num(q.minYears),
    minRating: num(q.minRating),
    q: String(q.q || '').trim().slice(0, 80),
    sort,
    page: Math.max(1, Math.floor(num(q.page) || 1)),
    limit: Math.min(24, Math.max(1, Math.floor(num(q.limit) || 12))),
  };
}

function buildWhere(f, minReviews) {
  const where = [`a.status = 'active'`];
  const params = [];

  if (f.category.length) {
    where.push(`EXISTS (SELECT 1 FROM artist_categories ac JOIN categories cat ON cat.id = ac.category_id WHERE ac.artist_id = a.id AND cat.slug IN (${f.category.map(() => '?').join(',')}))`);
    params.push(...f.category);
  }
  if (f.city) {
    // "where is the event": the artist is based there OR travels there
    where.push(`(c.slug = ? OR EXISTS (SELECT 1 FROM artist_cities t JOIN cities tc ON tc.id = t.city_id WHERE t.artist_id = a.id AND tc.slug = ?))`);
    params.push(f.city, f.city);
  } else if (f.state) {
    where.push(`(c.state = ? OR EXISTS (SELECT 1 FROM artist_cities t JOIN cities tc ON tc.id = t.city_id WHERE t.artist_id = a.id AND tc.state = ?))`);
    params.push(f.state, f.state);
  }
  if (f.occasion.length) {
    where.push(`EXISTS (SELECT 1 FROM artist_occasions o WHERE o.artist_id = a.id AND o.occasion IN (${f.occasion.map(() => '?').join(',')}))`);
    params.push(...f.occasion);
  }
  if (f.language.length) {
    where.push(`EXISTS (SELECT 1 FROM artist_languages l WHERE l.artist_id = a.id AND l.language IN (${f.language.map(() => '?').join(',')}))`);
    params.push(...f.language);
  }
  if (f.group.length) {
    where.push(`a.group_type IN (${f.group.map(() => '?').join(',')})`);
    params.push(...f.group);
  }
  if (f.minYears != null) {
    where.push('a.years_experience >= ?');
    params.push(f.minYears);
  }
  if (f.minRating != null) {
    where.push('(rs.review_count >= ? AND rs.avg_rating >= ?)');
    params.push(minReviews, f.minRating);
  }
  // Free text only ever searches PUBLIC fields: never name, phone or social handles.
  for (const token of f.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    const like = `%${likeEscape(token)}%`;
    where.push(`(
      lower(COALESCE(a.headline,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(a.public_summary,'')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.name,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.state,'')) LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM artist_categories ac JOIN categories cat ON cat.id = ac.category_id WHERE ac.artist_id = a.id AND lower(cat.name) LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM artist_tags t WHERE t.artist_id = a.id AND lower(t.tag) LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM artist_languages l WHERE l.artist_id = a.id AND lower(l.language) LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM artist_occasions o WHERE o.artist_id = a.id AND lower(o.occasion) LIKE ? ESCAPE '\\')
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }
  return { where: where.join(' AND '), params };
}

const BASE_FROM = `
FROM artists a
LEFT JOIN cities c ON c.id = a.city_id
LEFT JOIN (
  SELECT ac.artist_id, cat.name, cat.slug FROM artist_categories ac JOIN categories cat ON cat.id = ac.category_id WHERE ac.is_primary = 1
) pc ON pc.artist_id = a.id
LEFT JOIN (
  SELECT artist_id, COUNT(*) AS review_count, AVG(rating_overall) AS avg_rating FROM reviews WHERE status = 'approved' GROUP BY artist_id
) rs ON rs.artist_id = a.id`;

const ORDER = (sort, minReviews) => {
  switch (sort) {
    case 'experience': return 'a.years_experience DESC, a.id';
    case 'events': return 'a.events_done DESC, a.id';
    case 'new': return 'a.created_at DESC, a.id DESC';
    default:
      // featured first, then artists with enough reviews by rating, then the rest by experience
      return `a.featured DESC, (COALESCE(rs.review_count,0) >= ${Number(minReviews)}) DESC, rs.avg_rating DESC, rs.review_count DESC, a.years_experience DESC, a.id`;
  }
};

export function listPublicArtists(db, rawFilters, minReviews) {
  const f = parseFilters(rawFilters);
  const { where, params } = buildWhere(f, minReviews);
  const total = db.prepare(`SELECT COUNT(*) AS n ${BASE_FROM} WHERE ${where}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT a.public_id, a.headline, a.years_experience, a.events_done, a.group_type, a.verified, a.photo_public,
              c.name AS city_name, c.state AS city_state, c.slug AS city_slug,
              pc.name AS primary_category, pc.slug AS primary_slug,
              COALESCE(rs.review_count, 0) AS review_count, rs.avg_rating,
              (SELECT group_concat(language, '|') FROM artist_languages WHERE artist_id = a.id) AS languages,
              (SELECT group_concat(tag, '|') FROM artist_tags WHERE artist_id = a.id) AS tags
       ${BASE_FROM} WHERE ${where}
       ORDER BY ${ORDER(f.sort, minReviews)}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, f.limit, (f.page - 1) * f.limit);
  return {
    total,
    page: f.page,
    pageSize: f.limit,
    hasMore: f.page * f.limit < total,
    artists: rows.map((r) => toPublicArtist(r, minReviews)),
  };
}

export function publicFacets(db) {
  const active = `a.status = 'active'`;
  const categories = db
    .prepare(
      `SELECT cat.slug, cat.name, cat.plural, COUNT(DISTINCT a.id) AS n
       FROM categories cat LEFT JOIN artist_categories ac ON ac.category_id = cat.id
       LEFT JOIN artists a ON a.id = ac.artist_id AND ${active}
       GROUP BY cat.id ORDER BY cat.sort, cat.name`,
    )
    .all();
  const cities = db
    .prepare(
      `SELECT c.slug, c.name, c.state, COUNT(a.id) AS n
       FROM cities c LEFT JOIN artists a ON a.city_id = c.id AND ${active}
       GROUP BY c.id HAVING n > 0 ORDER BY n DESC, c.name`,
    )
    .all();
  const languages = db
    .prepare(
      `SELECT l.language AS name, COUNT(*) AS n FROM artist_languages l JOIN artists a ON a.id = l.artist_id AND ${active}
       GROUP BY l.language COLLATE NOCASE ORDER BY n DESC, name`,
    )
    .all();
  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, plural: c.plural, count: c.n })),
    cities: cities.map((c) => ({ slug: c.slug, name: c.name, state: c.state, count: c.n })),
    states: [...new Set(cities.map((c) => c.state))],
    languages: languages.map((l) => ({ name: l.name, count: l.n })),
    occasions: OCCASIONS,
    groupTypes: GROUP_TYPES,
    experience: [
      { label: 'Any', value: null },
      { label: '3+ years', value: 3 },
      { label: '5+ years', value: 5 },
      { label: '10+ years', value: 10 },
    ],
    totalArtists: db.prepare(`SELECT COUNT(*) AS n FROM artists a WHERE ${active}`).get().n,
  };
}
