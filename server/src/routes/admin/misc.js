import { z } from 'zod';
import { audit, getSetting, setSetting } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { hashPassword } from '../../security.js';
import { createCategory, findOrCreateCity } from '../../services/catalog.js';

const password = z.string().min(10, 'Use at least 10 characters').max(200);

export default async function miscRoutes(app) {
  const { db } = app;

  /* ----------------------------- dashboard ----------------------------- */
  app.get('/dashboard', async () => {
    const n = (sql, ...p) => db.prepare(sql).get(...p).n;
    return {
      newEnquiries: n(`SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'`),
      enquiriesThisWeek: n(`SELECT COUNT(*) AS n FROM enquiries WHERE created_at > datetime('now','-7 days')`),
      activeArtists: n(`SELECT COUNT(*) AS n FROM artists WHERE status = 'active'`),
      pendingArtists: n(`SELECT COUNT(*) AS n FROM artists WHERE status = 'pending'`),
      pendingReviews: n(`SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'`),
      whatsappClicks7d: n(`SELECT COUNT(*) AS n FROM wa_clicks WHERE created_at > datetime('now','-7 days')`),
      upcomingBookings: n(`SELECT COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND event_date >= date('now')`),
      awaitingReview: n(`SELECT COUNT(*) AS n FROM bookings b WHERE b.status IN ('confirmed','completed') AND b.event_date < date('now') AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id AND r.status != 'rejected')`),
      pipeline: db.prepare('SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status').all(),
      topArtists: db
        .prepare(
          `SELECT a.public_id, COALESCE(a.stage_name, a.full_name) AS name, COUNT(e.id) AS enquiries
           FROM enquiries e JOIN artists a ON a.id = e.artist_id WHERE e.created_at > datetime('now','-30 days')
           GROUP BY a.id ORDER BY enquiries DESC LIMIT 5`,
        )
        .all(),
      whatsappTop: db
        .prepare(
          `SELECT a.public_id, COALESCE(a.stage_name, a.full_name) AS name, COUNT(*) AS clicks
           FROM wa_clicks w JOIN artists a ON a.id = w.artist_id WHERE w.created_at > datetime('now','-30 days')
           GROUP BY a.id ORDER BY clicks DESC LIMIT 5`,
        )
        .all(),
    };
  });

  /* --------------------------- notifications --------------------------- */
  app.get('/notifications', async (req) => {
    const seen = req.admin.notif_seen_at || '1970-01-01 00:00:00';
    const rows = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 50').all();
    const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE created_at > ?').get(seen).n;
    return { unread, notifications: rows.map((r) => ({ ...r, unread: r.created_at > seen })) };
  });

  app.post('/notifications/seen', async (req) => {
    db.prepare(`UPDATE admins SET notif_seen_at = datetime('now') WHERE id = ?`).run(req.admin.id);
    return { ok: true };
  });

  /* ------------------------------- admins ------------------------------ */
  app.get('/admins', async () => ({
    admins: db.prepare('SELECT id, email, name, active, created_at, last_login_at FROM admins ORDER BY id').all().map((a) => ({ ...a, active: !!a.active })),
  }));

  app.post('/admins', async (req) => {
    const b = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(2).max(80), password }).parse(req.body);
    if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(b.email)) throw conflict('An admin with this email already exists.');
    const id = Number(
      db.prepare('INSERT INTO admins(email, name, password_hash, created_by) VALUES(?,?,?,?)').run(b.email, b.name, await hashPassword(b.password), req.admin.id).lastInsertRowid,
    );
    audit(db, req.admin.id, 'admin.create', 'admin', id, { email: b.email });
    return { id };
  });

  app.patch('/admins/:id', async (req) => {
    const id = Number(req.params.id);
    const b = z.object({ active: z.boolean().optional(), name: z.string().trim().min(2).max(80).optional(), password: password.optional() }).parse(req.body);
    const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
    if (!target) throw notFound('Admin not found');
    if (b.active === false) {
      if (id === req.admin.id) throw badRequest('You cannot deactivate your own account.');
      const others = db.prepare('SELECT COUNT(*) AS n FROM admins WHERE active = 1 AND id != ?').get(id).n;
      if (others < 1) throw badRequest('At least one active admin is required.');
    }
    if (b.active !== undefined) {
      db.prepare('UPDATE admins SET active = ? WHERE id = ?').run(b.active ? 1 : 0, id);
      if (!b.active) db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(id);
    }
    if (b.name) db.prepare('UPDATE admins SET name = ? WHERE id = ?').run(b.name, id);
    if (b.password) {
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(await hashPassword(b.password), id);
      if (id !== req.admin.id) db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(id);
    }
    audit(db, req.admin.id, 'admin.update', 'admin', id, { active: b.active, renamed: !!b.name, passwordReset: !!b.password });
    return { ok: true };
  });

  /* ----------------------------- taxonomy ------------------------------ */
  app.get('/catalog', async () => ({
    categories: db.prepare('SELECT id, slug, name FROM categories ORDER BY sort, name').all(),
    cities: db.prepare('SELECT id, slug, name, state FROM cities ORDER BY state, name').all(),
  }));

  app.post('/categories', async (req) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    try {
      const id = createCategory(db, name);
      audit(db, req.admin.id, 'category.create', 'category', id);
      return { id };
    } catch {
      throw conflict('That category already exists.');
    }
  });

  app.post('/cities', async (req) => {
    const b = z.object({ name: z.string().trim().min(2).max(60), state: z.string().trim().min(2).max(60) }).parse(req.body);
    const id = findOrCreateCity(db, b.name, b.state);
    audit(db, req.admin.id, 'city.create', 'city', id);
    return { id };
  });

  /* ------------------------------ settings ----------------------------- */
  app.get('/settings', async () => ({
    reviewAutoApprove: getSetting(db, 'review_auto_approve') === '1',
    reviewExpiryDays: Number(getSetting(db, 'review_expiry_days')),
    whatsappNumber: getSetting(db, 'whatsapp_number') || app.cfg.waNumber,
  }));

  app.put('/settings', async (req) => {
    const b = z
      .object({ reviewAutoApprove: z.boolean(), reviewExpiryDays: z.number().int().min(1).max(365), whatsappNumber: z.string().regex(/^\d{10,15}$/, 'Digits only, with country code, e.g. 919712026900') })
      .parse(req.body);
    setSetting(db, 'review_auto_approve', b.reviewAutoApprove ? '1' : '0');
    setSetting(db, 'review_expiry_days', b.reviewExpiryDays);
    setSetting(db, 'whatsapp_number', b.whatsappNumber);
    audit(db, req.admin.id, 'settings.update', 'settings', null, b);
    return { ok: true };
  });

  app.get('/audit', async () => ({
    entries: db
      .prepare(`SELECT l.id, l.action, l.entity, l.entity_id, l.meta, l.created_at, ad.name AS admin_name FROM audit_log l LEFT JOIN admins ad ON ad.id = l.admin_id ORDER BY l.id DESC LIMIT 200`)
      .all(),
  }));
}
