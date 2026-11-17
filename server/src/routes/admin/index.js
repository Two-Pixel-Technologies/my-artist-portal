import { z } from 'zod';
import { audit } from '../../db.js';
import { forbidden, HttpError, unauthorized } from '../../errors.js';
import { burnPasswordCheck, hashIp, hashPassword, randomToken, sha256, verifyPassword } from '../../security.js';
import artistsRoutes from './artists.js';
import dealsRoutes from './deals.js';
import miscRoutes from './misc.js';

export const COOKIE = 'ma_session';

const loginInput = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

function startSession(app, req, reply, adminId) {
  const { db, cfg } = app;
  const token = randomToken(32);
  db.prepare(`INSERT INTO sessions(admin_id, token_hash, user_agent, expires_at) VALUES(?,?,?, datetime('now', ?))`).run(
    adminId,
    sha256(token),
    String(req.headers['user-agent'] || '').slice(0, 200),
    `+${cfg.sessionDays} days`,
  );
  db.prepare(`UPDATE admins SET last_login_at = datetime('now') WHERE id = ?`).run(adminId);
  reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, path: '/', maxAge: cfg.sessionDays * 86400 });
}

export default async function adminRoutes(app) {
  const { db, cfg } = app;

  // Browsers cannot send a custom header cross-site without CORS (which we never enable),
  // so requiring one on writes blocks CSRF on top of SameSite=Lax cookies.
  app.addHook('preHandler', async (req) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'ma-admin') {
      throw forbidden('Missing request header');
    }
  });
  app.addHook('onSend', async (req, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.post('/auth/login', { config: { rateLimit: { max: cfg.rl.login, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = loginInput.parse(req.body);
    const ipHash = hashIp(req.ip, cfg.ipSalt);
    const failsByEmail = db.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND ok = 0 AND created_at > datetime('now','-15 minutes')`).get(email).n;
    const failsByIp = db.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND ok = 0 AND created_at > datetime('now','-15 minutes')`).get(ipHash).n;
    if (failsByEmail >= 5 || failsByIp >= 30) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');

    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
    const ok = admin && admin.active ? await verifyPassword(password, admin.password_hash) : (await burnPasswordCheck(password), false);
    db.prepare('INSERT INTO login_attempts(email, ip_hash, ok) VALUES(?,?,?)').run(email, ipHash, ok ? 1 : 0);
    if (!ok) throw unauthorized('Incorrect email or password');

    startSession(app, req, reply, admin.id);
    audit(db, admin.id, 'login');
    return { admin: { id: admin.id, email: admin.email, name: admin.name } };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies?.[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  // Everything below requires a valid session.
  await app.register(async (authed) => {
    authed.decorateRequest('admin', null);
    authed.addHook('preHandler', async (req) => {
      const token = req.cookies?.[COOKIE];
      if (!token) throw unauthorized();
      const admin = db
        .prepare(
          `SELECT ad.id, ad.email, ad.name, ad.notif_seen_at FROM sessions s JOIN admins ad ON ad.id = s.admin_id
           WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND ad.active = 1`,
        )
        .get(sha256(token));
      if (!admin) throw unauthorized();
      req.admin = admin;
    });

    authed.get('/auth/me', async (req) => ({ admin: { id: req.admin.id, email: req.admin.email, name: req.admin.name } }));

    authed.post('/auth/change-password', async (req) => {
      const { current, next } = z.object({ current: z.string().min(1), next: z.string().min(10, 'Use at least 10 characters').max(200) }).parse(req.body);
      const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.admin.id);
      if (!(await verifyPassword(current, row.password_hash))) throw unauthorized('Current password is incorrect');
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.admin.id);
      // sign out every other session
      const token = req.cookies?.[COOKIE];
      db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').run(req.admin.id, sha256(token));
      audit(db, req.admin.id, 'password.change');
      return { ok: true };
    });

    await authed.register(artistsRoutes);
    await authed.register(dealsRoutes);
    await authed.register(miscRoutes);
  });
}
