import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import { ZodError } from 'zod';
import { config } from './config.js';
import { openDb } from './db.js';
import { HttpError } from './errors.js';
import { seedCatalog } from './services/catalog.js';
import adminRoutes from './routes/admin/index.js';
import publicRoutes from './routes/public.js';

export async function buildApp(overrides = {}) {
  const cfg = { ...config, ...overrides, rl: { ...config.rl, ...(overrides.rl || {}) } };
  const db = openDb(cfg.dbFile || path.join(cfg.dataDir, 'myartist.db'));
  seedCatalog(db);

  const app = Fastify({ logger: cfg.logger, trustProxy: cfg.trustProxy, bodyLimit: 1_000_000 });
  app.decorate('db', db);
  app.decorate('cfg', cfg);

  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: cfg.rl.global, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 } });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return reply.code(400).send({ error: issues[0]?.message || 'Invalid input', issues });
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message, ...err.extra });
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Something went wrong' : err.message });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'Not found' }));

  app.get('/healthz', async () => ({ ok: true }));
  await app.register(publicRoutes);
  await app.register(adminRoutes, { prefix: '/api/admin' });

  app.addHook('onClose', async () => db.close());
  return app;
}
