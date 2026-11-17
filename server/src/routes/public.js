import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { OCCASIONS, REVIEW_CATEGORIES } from '../config.js';
import { getSetting, notify } from '../db.js';
import { badRequest, HttpError } from '../errors.js';
import { generateEnquiryRef, hashIp, normalizePhone, sha256 } from '../security.js';
import { listPublicArtists, publicFacets } from '../services/public.js';
import { publicDir } from '../services/images.js';

const optStr = (max) => z.string().trim().max(max).nullish().transform((v) => v || null);

const enquiryInput = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  phone: z.string().refine((v) => normalizePhone(v), 'Enter a valid 10-digit mobile number').transform((v) => normalizePhone(v)),
  email: z.string().trim().max(160).nullish().transform((v) => v || null).refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Invalid email'),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').nullish().transform((v) => v || null),
  eventCity: optStr(80),
  occasion: z.enum(OCCASIONS).nullish().transform((v) => v ?? null),
  message: optStr(1000),
  artistId: z.string().regex(/^MA-[A-Z0-9]{4,8}$/).nullish().transform((v) => v || null),
  consent: z.literal(true, { error: 'Please agree to be contacted' }),
  website: z.string().max(200).optional(), // honeypot: real users never see or fill this
  turnstileToken: z.string().max(4000).optional(),
  pageUrl: optStr(300),
});

const reviewInput = z.object({
  ratings: z.object(Object.fromEntries(REVIEW_CATEGORIES.map((c) => [c.key, z.number().int().min(1).max(5)]))),
  text: optStr(1200),
  reviewerName: z.string().trim().min(2, 'Please add your name').max(60),
  consent: z.literal(true, { error: 'Please confirm to publish your review' }),
});

async function verifyTurnstile(secret, token, ip) {
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip || '' }),
    });
    const json = await res.json();
    return !!json.success;
  } catch {
    return false;
  }
}

/** Looks up a review link. Never consumes it: link-preview bots GET these URLs. */
function lookupReviewRequest(db, token) {
  const row = db
    .prepare(
      `SELECT rr.*, a.full_name, a.stage_name, a.headline, b.occasion, b.event_date, b.event_city,
              (SELECT cat.name FROM artist_categories ac JOIN categories cat ON cat.id = ac.category_id WHERE ac.artist_id = a.id AND ac.is_primary = 1) AS category
       FROM review_requests rr JOIN artists a ON a.id = rr.artist_id JOIN bookings b ON b.id = rr.booking_id
       WHERE rr.token_hash = ?`,
    )
    .get(sha256(token));
  if (!row) return { state: 'invalid' };
  if (row.revoked_at) return { state: 'revoked', row };
  if (row.used_at) return { state: 'used', row };
  const expired = db.prepare(`SELECT ? < datetime('now') AS e`).get(row.expires_at).e;
  if (expired) return { state: 'expired', row };
  return { state: 'valid', row };
}

export default async function publicRoutes(app) {
  const { db, cfg } = app;

  app.get('/api/public/artists', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=30');
    return listPublicArtists(db, req.query, cfg.minReviewsToShow);
  });

  app.get('/api/public/filters', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return publicFacets(db);
  });

  app.get('/api/public/config', async () => ({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
    minReviewsToShow: cfg.minReviewsToShow,
    reviewCategories: REVIEW_CATEGORIES,
  }));

  app.post('/api/public/enquiries', { config: { rateLimit: { max: cfg.rl.enquiry, timeWindow: '1 hour' } } }, async (req) => {
    const data = enquiryInput.parse(req.body);
    if (data.website) return { ok: true, ref: 'EQ-OK' }; // honeypot hit: pretend success, store nothing
    if (!(await verifyTurnstile(cfg.turnstileSecret, data.turnstileToken, req.ip))) throw badRequest('Verification failed. Please try again.');

    const artist = data.artistId ? db.prepare(`SELECT id, public_id FROM artists WHERE public_id = ? AND status = 'active'`).get(data.artistId) : null;

    // Double-submit protection: same phone + same artist within 10 minutes returns the existing enquiry.
    const recent = db
      .prepare(`SELECT ref FROM enquiries WHERE phone = ? AND artist_id IS ? AND created_at > datetime('now','-10 minutes') ORDER BY id DESC LIMIT 1`)
      .get(data.phone, artist?.id ?? null);
    if (recent) return { ok: true, ref: recent.ref };

    const ref = generateEnquiryRef(db);
    const info = db
      .prepare(
        `INSERT INTO enquiries(ref, artist_id, name, phone, email, event_date, event_city, occasion, message, page_url, ip_hash)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(ref, artist?.id ?? null, data.name, data.phone, data.email, data.eventDate, data.eventCity, data.occasion, data.message, data.pageUrl, hashIp(req.ip, cfg.ipSalt));
    notify(db, {
      type: 'enquiry',
      title: `New enquiry from ${data.name}`,
      body: [artist ? `Artist ${artist.public_id}` : 'General enquiry', data.occasion, data.eventCity, data.eventDate].filter(Boolean).join(' · '),
      link: `/admin/enquiries?open=${info.lastInsertRowid}`,
    });
    return { ok: true, ref };
  });

  // WhatsApp hand-off: logs the click, then sends the visitor to the My Artist number with the artist ID pre-filled.
  app.get('/go/wa', async (req, reply) => {
    const id = String(req.query.a || '').toUpperCase();
    const artist = /^MA-[A-Z0-9]{4,8}$/.test(id) ? db.prepare(`SELECT id, public_id FROM artists WHERE public_id = ?`).get(id) : null;
    db.prepare('INSERT INTO wa_clicks(artist_id, ip_hash) VALUES(?,?)').run(artist?.id ?? null, hashIp(req.ip, cfg.ipSalt));
    const number = (getSetting(db, 'whatsapp_number') || cfg.waNumber).replace(/\D/g, '');
    const text = artist
      ? `Hi myartist team, could you please share the details of the artist with ID ${artist.public_id}? (from myartist.in)`
      : 'Hi myartist team, I would like help finding an artist for my event. (from myartist.in)';
    reply.header('cache-control', 'no-store');
    return reply.redirect(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, 302);
  });

  // Pre-blurred artist thumbnails. File names are random keys, never derived from names or ids.
  app.get('/media/p/:file', async (req, reply) => {
    const { file } = req.params;
    if (!/^[a-f0-9]{24}\.jpg$/.test(file)) throw new HttpError(404, 'Not found');
    const full = path.join(publicDir(cfg.dataDir), file);
    if (!fs.existsSync(full)) throw new HttpError(404, 'Not found');
    reply.header('content-type', 'image/jpeg').header('cache-control', 'public, max-age=31536000, immutable');
    return reply.send(fs.createReadStream(full));
  });

  // ---- one-time review links ----
  app.get('/api/public/review/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { state, row } = lookupReviewRequest(db, String(req.params.token || ''));
    if (state !== 'valid') return { valid: false, reason: state };
    return {
      valid: true,
      artist: { name: row.stage_name || row.full_name, category: row.category, headline: row.headline },
      booking: { occasion: row.occasion, city: row.event_city, eventDate: row.event_date },
      categories: REVIEW_CATEGORIES,
    };
  });

  app.post('/api/public/review/:token', { config: { rateLimit: { max: cfg.rl.review, timeWindow: '1 hour' } } }, async (req) => {
    const input = reviewInput.parse(req.body);
    const token = String(req.params.token || '');
    const looked = lookupReviewRequest(db, token);
    if (looked.state !== 'valid') throw new HttpError(410, 'This review link is no longer valid.', { reason: looked.state });
    const rr = looked.row;
    const r = input.ratings;
    const overall = (r.punctuality + r.performance + r.professionalism + r.communication + r.value) / 5;
    const autoApprove = getSetting(db, 'review_auto_approve') === '1';

    db.transaction(() => {
      // The WHERE clause makes consumption atomic: two simultaneous submits cannot both win.
      const claimed = db
        .prepare(`UPDATE review_requests SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at >= datetime('now')`)
        .run(rr.id);
      if (claimed.changes !== 1) throw new HttpError(410, 'This review link is no longer valid.', { reason: 'used' });
      db.prepare(
        `INSERT INTO reviews(review_request_id, artist_id, booking_id, reviewer_name, r_punctuality, r_performance, r_professionalism, r_communication, r_value, rating_overall, body, status)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(rr.id, rr.artist_id, rr.booking_id, input.reviewerName, r.punctuality, r.performance, r.professionalism, r.communication, r.value, overall, input.text, autoApprove ? 'approved' : 'pending');
      notify(db, {
        type: 'review',
        title: `New review (${overall.toFixed(1)}★)`,
        body: `${input.reviewerName} reviewed ${rr.stage_name || rr.full_name}${autoApprove ? '' : ' · awaiting approval'}`,
        link: '/admin/reviews',
      });
    })();
    return { ok: true };
  });

  // Data for the sitemap: only combinations that actually have artists.
  app.get('/api/public/sitemap', async () => {
    const f = publicFacets(db);
    const combos = db
      .prepare(
        `SELECT DISTINCT cat.slug AS category, c.slug AS city
         FROM artists a JOIN cities c ON c.id = a.city_id
         JOIN artist_categories ac ON ac.artist_id = a.id JOIN categories cat ON cat.id = ac.category_id
         WHERE a.status = 'active'`,
      )
      .all();
    return { categories: f.categories.filter((c) => c.count > 0).map((c) => c.slug), cities: f.cities.map((c) => c.slug), combos };
  });
}
