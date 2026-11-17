import { z } from 'zod';
import { audit, getSetting } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { OCCASIONS } from '../../config.js';
import { normalizePhone, randomToken, sha256 } from '../../security.js';

const str = (max) => z.string().trim().max(max).nullish().transform((v) => v || null);
const money = z.number().int().min(0).max(1_000_000_000).nullish().transform((v) => v ?? null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v || null);
const idOf = (req, key = 'id') => {
  const n = Number(req.params[key]);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

const bookingInput = z.object({
  artistId: z.number().int().positive(),
  clientName: z.string().trim().min(2).max(80),
  clientPhone: z.string().trim().max(30).nullish().transform((v) => (v ? normalizePhone(v) || v : null)),
  eventDate: date,
  eventCity: str(80),
  occasion: z.enum(OCCASIONS).nullish().transform((v) => v ?? null),
  amount: money,
  commissionAmount: money,
  notes: str(1000),
  enquiryId: z.number().int().positive().nullish().transform((v) => v ?? null),
});

const REVIEW_STATE_SQL = `
  CASE
    WHEN rv.id IS NOT NULL THEN 'review_' || rv.status
    WHEN rr.id IS NULL THEN 'none'
    WHEN rr.revoked_at IS NOT NULL THEN 'revoked'
    WHEN rr.used_at IS NOT NULL THEN 'used'
    WHEN rr.expires_at < datetime('now') THEN 'expired'
    ELSE 'link_sent'
  END`;

export default async function dealsRoutes(app) {
  const { db, cfg } = app;

  /* ------------------------------ enquiries ------------------------------ */
  app.get('/enquiries', async (req) => {
    const q = req.query;
    const where = ['1=1'];
    const params = [];
    if (q.status && q.status !== 'all') { where.push('e.status = ?'); params.push(q.status); }
    if (q.artist) { where.push('e.artist_id = ?'); params.push(Number(q.artist)); }
    if (q.q) {
      const like = `%${String(q.q).toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where.push(`(lower(e.name) LIKE ? ESCAPE '\\' OR e.phone LIKE ? ESCAPE '\\' OR lower(e.ref) LIKE ? ESCAPE '\\' OR lower(COALESCE(a.public_id,'')) LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like);
    }
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(100, Math.max(5, Number(q.pageSize) || 30));
    const from = 'FROM enquiries e LEFT JOIN artists a ON a.id = e.artist_id LEFT JOIN admins ad ON ad.id = e.assigned_to';
    const total = db.prepare(`SELECT COUNT(*) AS n ${from} WHERE ${where.join(' AND ')}`).get(...params).n;
    const rows = db
      .prepare(
        `SELECT e.id, e.ref, e.name, e.phone, e.event_date, e.event_city, e.occasion, e.status, e.created_at, e.assigned_to,
                a.id AS artist_id, a.public_id AS artist_public_id, COALESCE(a.stage_name, a.full_name) AS artist_name, ad.name AS assigned_name
         ${from} WHERE ${where.join(' AND ')} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, size, (page - 1) * size);
    const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status').all().map((r) => [r.status, r.n]));
    return { total, page, pageSize: size, counts, enquiries: rows };
  });

  app.get('/enquiries/:id', async (req) => {
    const id = idOf(req);
    const e = db
      .prepare(
        `SELECT e.*, a.public_id AS artist_public_id, COALESCE(a.stage_name, a.full_name) AS artist_name, a.phone AS artist_phone, a.headline AS artist_headline, ad.name AS assigned_name
         FROM enquiries e LEFT JOIN artists a ON a.id = e.artist_id LEFT JOIN admins ad ON ad.id = e.assigned_to WHERE e.id = ?`,
      )
      .get(id);
    if (!e) throw notFound('Enquiry not found');
    const notes = db
      .prepare(`SELECT n.id, n.body, n.created_at, ad.name AS admin_name FROM enquiry_notes n LEFT JOIN admins ad ON ad.id = n.admin_id WHERE n.enquiry_id = ? ORDER BY n.id DESC`)
      .all(id);
    const bookings = db.prepare('SELECT id, status, event_date, amount FROM bookings WHERE enquiry_id = ?').all(id);
    return { enquiry: e, notes, bookings };
  });

  app.patch('/enquiries/:id', async (req) => {
    const id = idOf(req);
    const body = z
      .object({ status: z.enum(['new', 'contacted', 'options_sent', 'booked', 'lost']).optional(), assignedTo: z.number().int().positive().nullable().optional() })
      .parse(req.body);
    const cur = db.prepare('SELECT status FROM enquiries WHERE id = ?').get(id);
    if (!cur) throw notFound('Enquiry not found');
    if (body.status !== undefined) db.prepare(`UPDATE enquiries SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(body.status, id);
    if (body.assignedTo !== undefined) {
      if (body.assignedTo && !db.prepare('SELECT 1 FROM admins WHERE id = ? AND active = 1').get(body.assignedTo)) throw badRequest('Unknown admin');
      db.prepare(`UPDATE enquiries SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?`).run(body.assignedTo, id);
    }
    audit(db, req.admin.id, 'enquiry.update', 'enquiry', id, body);
    return { ok: true };
  });

  app.post('/enquiries/:id/notes', async (req) => {
    const id = idOf(req);
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    if (!db.prepare('SELECT 1 FROM enquiries WHERE id = ?').get(id)) throw notFound('Enquiry not found');
    db.prepare('INSERT INTO enquiry_notes(enquiry_id, admin_id, body) VALUES(?,?,?)').run(id, req.admin.id, body);
    db.prepare(`UPDATE enquiries SET updated_at = datetime('now') WHERE id = ?`).run(id);
    return { ok: true };
  });

  /* ------------------------------ bookings ------------------------------ */
  const createBooking = (input, adminId) => {
    if (!db.prepare('SELECT 1 FROM artists WHERE id = ?').get(input.artistId)) throw badRequest('Choose an artist');
    const info = db
      .prepare(
        `INSERT INTO bookings(artist_id, enquiry_id, client_name, client_phone, event_date, event_city, occasion, amount, commission_amount, notes, created_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(input.artistId, input.enquiryId, input.clientName, input.clientPhone, input.eventDate, input.eventCity, input.occasion, input.amount, input.commissionAmount, input.notes, adminId);
    return Number(info.lastInsertRowid);
  };

  app.post('/bookings', async (req) => {
    const id = createBooking(bookingInput.parse(req.body), req.admin.id);
    audit(db, req.admin.id, 'booking.create', 'booking', id);
    return { id };
  });

  app.post('/enquiries/:id/booking', async (req) => {
    const eid = idOf(req);
    const e = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(eid);
    if (!e) throw notFound('Enquiry not found');
    const extra = z
      .object({ artistId: z.number().int().positive().optional(), amount: money, commissionAmount: money, notes: str(1000) })
      .parse(req.body ?? {});
    const artistId = extra.artistId ?? e.artist_id;
    if (!artistId) throw badRequest('Pick the artist for this booking');
    const id = db.transaction(() => {
      const bid = createBooking(
        bookingInput.parse({
          artistId, clientName: e.name, clientPhone: e.phone, eventDate: e.event_date, eventCity: e.event_city, occasion: e.occasion,
          amount: extra.amount, commissionAmount: extra.commissionAmount, notes: extra.notes, enquiryId: eid,
        }),
        req.admin.id,
      );
      db.prepare(`UPDATE enquiries SET status = 'booked', updated_at = datetime('now') WHERE id = ?`).run(eid);
      return bid;
    })();
    audit(db, req.admin.id, 'booking.create', 'booking', id, { enquiry: eid });
    return { id };
  });

  app.get('/bookings', async (req) => {
    const q = req.query;
    const where = ['1=1'];
    const params = [];
    if (q.status && q.status !== 'all') { where.push('b.status = ?'); params.push(q.status); }
    if (q.q) {
      const like = `%${String(q.q).toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where.push(`(lower(b.client_name) LIKE ? ESCAPE '\\' OR lower(a.public_id) LIKE ? ESCAPE '\\' OR lower(a.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(a.stage_name,'')) LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like);
    }
    const rows = db
      .prepare(
        `SELECT b.id, b.client_name, b.client_phone, b.event_date, b.event_city, b.occasion, b.amount, b.commission_amount, b.status, b.notes, b.created_at,
                a.id AS artist_id, a.public_id AS artist_public_id, COALESCE(a.stage_name, a.full_name) AS artist_name,
                rr.id AS request_id, rr.expires_at, ${REVIEW_STATE_SQL} AS review_state, rv.id AS review_id
         FROM bookings b JOIN artists a ON a.id = b.artist_id
         LEFT JOIN review_requests rr ON rr.id = (SELECT MAX(id) FROM review_requests WHERE booking_id = b.id)
         LEFT JOIN reviews rv ON rv.booking_id = b.id AND rv.status != 'rejected'
         WHERE ${where.join(' AND ')} ORDER BY b.event_date DESC, b.id DESC LIMIT 300`,
      )
      .all(...params);
    return { bookings: rows };
  });

  app.patch('/bookings/:id', async (req) => {
    const id = idOf(req);
    const b = z
      .object({
        status: z.enum(['confirmed', 'completed', 'cancelled']).optional(),
        amount: money.optional(),
        commissionAmount: money.optional(),
        eventDate: date.optional(),
        eventCity: str(80).optional(),
        notes: str(1000).optional(),
      })
      .parse(req.body);
    const map = { status: 'status', amount: 'amount', commissionAmount: 'commission_amount', eventDate: 'event_date', eventCity: 'event_city', notes: 'notes' };
    const sets = [];
    const vals = [];
    for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { sets.push(`${col} = ?`); vals.push(b[k]); }
    if (!sets.length) return { ok: true };
    const info = db.prepare(`UPDATE bookings SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
    if (!info.changes) throw notFound('Booking not found');
    audit(db, req.admin.id, 'booking.update', 'booking', id, b);
    return { ok: true };
  });

  /* --------------------------- review links ---------------------------- */
  // "Get review": mints a one-time link. The raw token is returned once and never stored.
  app.post('/bookings/:id/review-link', async (req) => {
    const id = idOf(req);
    const b = db.prepare(`SELECT b.*, COALESCE(a.stage_name, a.full_name) AS artist_name FROM bookings b JOIN artists a ON a.id = b.artist_id WHERE b.id = ?`).get(id);
    if (!b) throw notFound('Booking not found');
    if (b.status === 'cancelled') throw badRequest('Cancelled bookings cannot be reviewed');
    if (db.prepare(`SELECT 1 FROM reviews WHERE booking_id = ? AND status != 'rejected'`).get(id)) {
      throw conflict('A review has already been submitted for this booking.');
    }
    const days = Math.min(365, Math.max(1, Number(getSetting(db, 'review_expiry_days')) || 30));
    const token = randomToken(24);
    db.transaction(() => {
      db.prepare(`UPDATE review_requests SET revoked_at = datetime('now') WHERE booking_id = ? AND used_at IS NULL AND revoked_at IS NULL`).run(id);
      db.prepare(`INSERT INTO review_requests(booking_id, artist_id, token_hash, created_by, expires_at) VALUES(?,?,?,?, datetime('now', ?))`).run(
        id, b.artist_id, sha256(token), req.admin.id, `+${days} days`,
      );
    })();
    const url = `${cfg.siteUrl}/review/${token}`;
    const message = `Hi ${b.client_name.split(' ')[0]}, thank you for choosing myartist.in! We'd love to hear how your event went. It takes a minute: ${url}`;
    const phone = normalizePhone(b.client_phone);
    audit(db, req.admin.id, 'review.link', 'booking', id);
    return {
      url,
      message,
      expiresInDays: days,
      whatsappUrl: `https://wa.me/${phone ? `91${phone}` : ''}?text=${encodeURIComponent(message)}`,
    };
  });

  app.delete('/review-requests/:id', async (req) => {
    const info = db.prepare(`UPDATE review_requests SET revoked_at = datetime('now') WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`).run(idOf(req));
    if (!info.changes) throw notFound('Link not found or already used');
    audit(db, req.admin.id, 'review.revoke', 'review_request', req.params.id);
    return { ok: true };
  });

  /* ------------------------------ reviews ------------------------------ */
  app.get('/reviews', async (req) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const rows = db
      .prepare(
        `SELECT rv.id, rv.reviewer_name, rv.rating_overall, rv.r_punctuality, rv.r_performance, rv.r_professionalism, rv.r_communication, rv.r_value,
                rv.body, rv.status, rv.created_at, a.public_id AS artist_public_id, COALESCE(a.stage_name, a.full_name) AS artist_name,
                b.client_name, b.occasion, b.event_date
         FROM reviews rv JOIN artists a ON a.id = rv.artist_id JOIN bookings b ON b.id = rv.booking_id
         WHERE (? IS NULL OR rv.status = ?) ORDER BY rv.created_at DESC LIMIT 300`,
      )
      .all(status, status);
    return { reviews: rows };
  });

  app.patch('/reviews/:id', async (req) => {
    const { status } = z.object({ status: z.enum(['approved', 'rejected', 'pending']) }).parse(req.body);
    const info = db.prepare(`UPDATE reviews SET status = ?, moderated_by = ?, moderated_at = datetime('now') WHERE id = ?`).run(status, req.admin.id, idOf(req));
    if (!info.changes) throw notFound('Review not found');
    audit(db, req.admin.id, `review.${status}`, 'review', req.params.id);
    return { ok: true };
  });
}
