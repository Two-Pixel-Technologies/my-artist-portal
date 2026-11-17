import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';

export const PASSWORD = 'correct-horse-battery';

export async function makeApp(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myartist-test-'));
  const app = await buildApp({
    dataDir: dir,
    dbFile: path.join(dir, 'test.db'),
    logger: false,
    siteUrl: 'https://example.test',
    rl: { global: 100000, enquiry: 100000, review: 100000, login: 100000 },
    ...overrides,
  });
  app.db.prepare('INSERT INTO admins(email, name, password_hash) VALUES(?,?,?)').run('boss@example.com', 'Boss', await hashPassword(PASSWORD));
  const cleanup = async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { app, cleanup, dir };
}

export async function login(app, email = 'boss@example.com', password = PASSWORD) {
  const res = await app.inject({ method: 'POST', url: '/api/admin/auth/login', headers: { 'x-requested-with': 'ma-admin' }, payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies[0];
  return { cookie: `${cookie.name}=${cookie.value}` };
}

export const api = (app, session) => (method, url, payload) =>
  app.inject({
    method,
    url: `/api/admin${url}`,
    headers: { 'x-requested-with': 'ma-admin', cookie: session.cookie },
    payload,
  });

export const catId = (app, name) => app.db.prepare('SELECT id FROM categories WHERE name = ?').get(name).id;
export const cityId = (app, name) => app.db.prepare('SELECT id FROM cities WHERE name = ?').get(name).id;

export const artistPayload = (app, over = {}) => ({
  fullName: 'Priyanka Chauhan',
  stageName: 'Priya C',
  phone: '9876543210',
  email: 'priyanka.private@example.com',
  instagram: '@priyanka_sings',
  cityId: cityId(app, 'Ahmedabad'),
  categoryIds: [catId(app, 'Singer')],
  primaryCategoryId: catId(app, 'Singer'),
  languages: ['Hindi', 'Gujarati'],
  occasions: ['Wedding'],
  tags: ['Bollywood'],
  headline: 'Bollywood wedding vocalist',
  publicSummary: 'Sangeet-ready sets.',
  yearsExperience: 9,
  eventsDone: 163,
  priceMin: 20000,
  priceMax: 45000,
  internalNotes: 'secret-internal-note',
  status: 'active',
  ...over,
});
