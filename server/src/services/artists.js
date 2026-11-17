import { z } from 'zod';
import { OCCASIONS, GROUP_TYPES } from '../config.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import { generatePublicId, normalizePhone } from '../security.js';

const str = (max) => z.string().trim().max(max).nullish().transform((v) => v || null);
const intField = (min, max) => z.number().int().min(min).max(max).nullish().transform((v) => v ?? null);
const list = (max, itemMax = 60) =>
  z.array(z.string().trim().min(1).max(itemMax)).max(max).default([]).transform((a) => [...new Set(a.map((s) => s.trim()))]);

export const artistInput = z.object({
  // private
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  stageName: str(120),
  phone: z.string().refine((v) => normalizePhone(v), 'Enter a valid 10-digit Indian mobile number').transform((v) => normalizePhone(v)),
  altPhone: str(30),
  email: z.string().trim().max(160).nullish().transform((v) => v || null).refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Invalid email'),
  instagram: str(160),
  youtube: str(300),
  website: str(300),
  gender: z.enum(['female', 'male', 'other']).nullish().transform((v) => v ?? null),
  // location
  cityId: z.number().int().positive().nullish().transform((v) => v ?? null),
  travelCityIds: z.array(z.number().int().positive()).max(60).default([]),
  // taxonomy
  categoryIds: z.array(z.number().int().positive()).min(1, 'Pick at least one category').max(6),
  primaryCategoryId: z.number().int().positive(),
  languages: list(12, 30),
  occasions: z.array(z.enum(OCCASIONS)).max(OCCASIONS.length).default([]),
  tags: list(12, 40),
  // public profile
  headline: str(140),
  publicSummary: str(600),
  yearsExperience: intField(0, 80),
  eventsDone: intField(0, 100000),
  groupType: z.enum(GROUP_TYPES).nullish().transform((v) => v ?? null),
  teamSize: intField(1, 200),
  // commercials & logistics (private)
  priceMin: intField(0, 100000000),
  priceMax: intField(0, 100000000),
  priceNotes: str(400),
  commissionPct: z.number().min(0).max(100).nullish().transform((v) => v ?? null),
  equipment: str(600),
  requirements: str(600),
  travelNotes: str(400),
  internalNotes: str(2000),
  source: str(120),
  verified: z.boolean().default(false),
  featured: z.boolean().default(false),
  status: z.enum(['active', 'inactive', 'pending', 'archived']).default('active'),
  links: z.array(z.object({ label: str(60), url: z.string().trim().max(500).min(4) })).max(12).default([]),
});

// Generic descriptors that appear in group/brand names but identify nobody ("Solanki Folk Troupe" -> only "Solanki" is sensitive).
const GENERIC_WORDS = new Set([
  'folk', 'troupe', 'band', 'live', 'music', 'musical', 'dance', 'dancer', 'dancers', 'group', 'team', 'studio', 'studios', 'entertainment',
  'events', 'event', 'artist', 'artists', 'singer', 'singers', 'show', 'shows', 'official', 'productions', 'production', 'creations',
  'makeup', 'makeover', 'makeovers', 'hosts', 'host', 'anchor', 'comedy', 'magic', 'sound', 'sounds', 'wedding', 'weddings', 'company',
]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The public headline/summary/tags are the only free text that reaches visitors.
 * Reject anything that could identify the artist or let a visitor bypass the platform.
 */
export function findLeaks(a) {
  const texts = [a.headline, a.publicSummary, ...(a.tags || [])].filter(Boolean).join(' \n ');
  if (!texts) return [];
  const issues = [];
  const words = new Set();
  for (const n of [a.fullName, a.stageName]) {
    for (const w of String(n || '').toLowerCase().split(/[^\p{L}]+/u)) if (w.length >= 4 && !GENERIC_WORDS.has(w)) words.add(w);
  }
  for (const w of words) {
    if (new RegExp(`(^|[^\\p{L}])${escapeRe(w)}($|[^\\p{L}])`, 'iu').test(texts)) issues.push(`mentions "${w}", which is part of the artist's name`);
  }
  if (/\d{8,}/.test(texts.replace(/[\s\-().+]/g, ''))) issues.push('contains what looks like a phone number');
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(texts) || /(^|\s)@[\w.]{3,}/.test(texts)) issues.push('contains an email or @handle');
  if (/https?:\/\/|www\.|instagram|youtube|whatsapp/i.test(texts)) issues.push('contains a link or social/contact reference');
  return issues;
}

const cityLabel = (r) => (r.city_name ? `${r.city_name}, ${r.city_state}` : null);

export function getArtistFull(db, id) {
  const a = db.prepare(`SELECT a.*, c.name AS city_name, c.state AS city_state FROM artists a LEFT JOIN cities c ON c.id = a.city_id WHERE a.id = ?`).get(id);
  if (!a) return null;
  const cats = db.prepare('SELECT category_id, is_primary FROM artist_categories WHERE artist_id = ?').all(id);
  return {
    id: a.id,
    publicId: a.public_id,
    fullName: a.full_name,
    stageName: a.stage_name,
    phone: a.phone,
    altPhone: a.alt_phone,
    email: a.email,
    instagram: a.instagram,
    youtube: a.youtube,
    website: a.website,
    gender: a.gender,
    cityId: a.city_id,
    cityLabel: cityLabel(a),
    travelCityIds: db.prepare('SELECT city_id FROM artist_cities WHERE artist_id = ?').all(id).map((r) => r.city_id),
    categoryIds: cats.map((c) => c.category_id),
    primaryCategoryId: cats.find((c) => c.is_primary)?.category_id ?? cats[0]?.category_id ?? null,
    languages: db.prepare('SELECT language FROM artist_languages WHERE artist_id = ? ORDER BY language').all(id).map((r) => r.language),
    occasions: db.prepare('SELECT occasion FROM artist_occasions WHERE artist_id = ?').all(id).map((r) => r.occasion),
    tags: db.prepare('SELECT tag FROM artist_tags WHERE artist_id = ? ORDER BY tag').all(id).map((r) => r.tag),
    headline: a.headline,
    publicSummary: a.public_summary,
    yearsExperience: a.years_experience,
    eventsDone: a.events_done,
    groupType: a.group_type,
    teamSize: a.team_size,
    priceMin: a.price_min,
    priceMax: a.price_max,
    priceNotes: a.price_notes,
    commissionPct: a.commission_pct,
    equipment: a.equipment,
    requirements: a.requirements,
    travelNotes: a.travel_notes,
    internalNotes: a.internal_notes,
    source: a.source,
    verified: !!a.verified,
    featured: !!a.featured,
    status: a.status,
    hasPhoto: !!a.photo_private,
    publicPhotoKey: a.photo_public,
    links: db.prepare('SELECT label, url FROM artist_links WHERE artist_id = ? ORDER BY id').all(id),
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

/** Creates (id = null) or fully replaces an artist and its child rows. Returns the artist id. */
export function saveArtist(db, id, data, adminId) {
  const issues = findLeaks(data);
  if (issues.length) {
    throw unprocessable(`Public headline/summary/tags ${issues.join('; ')}. Keep public text anonymous.`, { field: 'headline', issues });
  }
  if (!data.categoryIds.includes(data.primaryCategoryId)) {
    throw unprocessable('The primary category must be one of the selected categories.', { field: 'primaryCategoryId' });
  }
  if (data.priceMin != null && data.priceMax != null && data.priceMin > data.priceMax) {
    throw unprocessable('Minimum price cannot exceed the maximum price.', { field: 'priceMin' });
  }

  return db.transaction(() => {
    const dupe = db.prepare('SELECT id, public_id FROM artists WHERE phone = ? AND id IS NOT ?').get(data.phone, id);
    if (dupe) throw conflict(`This phone number already belongs to ${dupe.public_id}.`, { field: 'phone', existingId: dupe.id });

    for (const cid of data.categoryIds) if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(cid)) throw unprocessable('Unknown category.');
    if (data.cityId && !db.prepare('SELECT 1 FROM cities WHERE id = ?').get(data.cityId)) throw unprocessable('Unknown city.');

    const cols = {
      full_name: data.fullName, stage_name: data.stageName, phone: data.phone, alt_phone: data.altPhone, email: data.email,
      instagram: data.instagram, youtube: data.youtube, website: data.website, gender: data.gender, city_id: data.cityId,
      headline: data.headline, public_summary: data.publicSummary, years_experience: data.yearsExperience, events_done: data.eventsDone,
      group_type: data.groupType, team_size: data.teamSize, price_min: data.priceMin, price_max: data.priceMax, price_notes: data.priceNotes,
      commission_pct: data.commissionPct, equipment: data.equipment, requirements: data.requirements, travel_notes: data.travelNotes,
      internal_notes: data.internalNotes, source: data.source, verified: data.verified ? 1 : 0, featured: data.featured ? 1 : 0, status: data.status,
    };
    const names = Object.keys(cols);

    let artistId = id;
    if (id == null) {
      const publicId = generatePublicId(db);
      const info = db
        .prepare(`INSERT INTO artists(public_id, created_by, ${names.join(',')}) VALUES(?, ?, ${names.map(() => '?').join(',')})`)
        .run(publicId, adminId ?? null, ...names.map((n) => cols[n]));
      artistId = Number(info.lastInsertRowid);
    } else {
      const info = db
        .prepare(`UPDATE artists SET ${names.map((n) => `${n} = ?`).join(',')}, updated_at = datetime('now') WHERE id = ?`)
        .run(...names.map((n) => cols[n]), id);
      if (!info.changes) throw notFound('Artist not found');
    }

    for (const t of ['artist_categories', 'artist_cities', 'artist_languages', 'artist_occasions', 'artist_tags', 'artist_links']) {
      db.prepare(`DELETE FROM ${t} WHERE artist_id = ?`).run(artistId);
    }
    const insCat = db.prepare('INSERT INTO artist_categories(artist_id, category_id, is_primary) VALUES(?,?,?)');
    data.categoryIds.forEach((c) => insCat.run(artistId, c, c === data.primaryCategoryId ? 1 : 0));
    const insCity = db.prepare('INSERT OR IGNORE INTO artist_cities(artist_id, city_id) VALUES(?,?)');
    data.travelCityIds.forEach((c) => db.prepare('SELECT 1 FROM cities WHERE id = ?').get(c) && insCity.run(artistId, c));
    const insLang = db.prepare('INSERT OR IGNORE INTO artist_languages(artist_id, language) VALUES(?,?)');
    data.languages.forEach((l) => insLang.run(artistId, l));
    const insOcc = db.prepare('INSERT OR IGNORE INTO artist_occasions(artist_id, occasion) VALUES(?,?)');
    data.occasions.forEach((o) => insOcc.run(artistId, o));
    const insTag = db.prepare('INSERT OR IGNORE INTO artist_tags(artist_id, tag) VALUES(?,?)');
    data.tags.forEach((t) => insTag.run(artistId, t));
    const insLink = db.prepare('INSERT INTO artist_links(artist_id, label, url) VALUES(?,?,?)');
    data.links.forEach((l) => insLink.run(artistId, l.label, l.url));
    return artistId;
  })();
}
