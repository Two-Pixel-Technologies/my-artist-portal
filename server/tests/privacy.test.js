import test from 'node:test';
import assert from 'node:assert/strict';
import { api, artistPayload, login, makeApp } from './helpers.js';

test('public API never exposes private artist data', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const created = await call('POST', '/artists', artistPayload(app));
  assert.equal(created.statusCode, 200);
  const publicId = created.json().artist.publicId;
  assert.match(publicId, /^MA-[A-Z0-9]{4}$/);

  const res = await app.inject({ url: '/api/public/artists' });
  assert.equal(res.statusCode, 200);
  const body = res.body;
  for (const secret of ['Priyanka', 'Chauhan', 'Priya C', '9876543210', 'priyanka.private', 'priyanka_sings', '20000', '45000', 'secret-internal-note', 'phone', 'email', 'instagram', 'fullName']) {
    assert.ok(!body.includes(secret), `public payload leaked "${secret}"`);
  }
  const artist = res.json().artists[0];
  assert.equal(artist.id, publicId);
  // exact whitelist: adding a column to the table must never change the public shape
  assert.deepEqual(Object.keys(artist).sort(), [
    'category', 'categorySlug', 'city', 'citySlug', 'events', 'experience', 'groupType', 'headline', 'id', 'isNew', 'languages',
    'photo', 'rating', 'reviewCount', 'state', 'tags', 'verified',
  ]);
  // numbers are bucketed, not exact
  assert.equal(artist.experience, '8+ yrs');
  assert.equal(artist.events, '150+');
});

test('public search cannot be used to look up names, phones or handles', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  await call('POST', '/artists', artistPayload(app));
  for (const q of ['Priyanka', 'Chauhan', '9876543210', 'priyanka_sings', 'Priya']) {
    const res = await app.inject({ url: `/api/public/artists?q=${encodeURIComponent(q)}` });
    assert.equal(res.json().total, 0, `search for "${q}" matched an artist`);
  }
  const ok = await app.inject({ url: '/api/public/artists?q=bollywood' });
  assert.equal(ok.json().total, 1);
});

test('public text that names the artist or includes contact details is rejected', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  for (const over of [
    { headline: 'Priyanka the wedding singer' },
    { publicSummary: 'Call 98765 43210 for bookings' },
    { tags: ['follow @priyanka_sings'] },
    { publicSummary: 'See instagram for more' },
  ]) {
    const res = await call('POST', '/artists', artistPayload(app, over));
    assert.equal(res.statusCode, 422, JSON.stringify(over));
  }
});

test('only active artists are public; archived and pending are hidden', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const a = (await call('POST', '/artists', artistPayload(app))).json().artist;
  await call('POST', '/artists', artistPayload(app, { fullName: 'Second Person', phone: '9876543211', status: 'pending' }));
  assert.equal((await app.inject({ url: '/api/public/artists' })).json().total, 1);
  await call('DELETE', `/artists/${a.id}`);
  assert.equal((await app.inject({ url: '/api/public/artists' })).json().total, 0);
});

test('blurred public photo is served; the original is admin-only', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const session = await login(app);
  const call = api(app, session);
  const a = (await call('POST', '/artists', artistPayload(app))).json().artist;

  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
  const boundary = '----t';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const up = await app.inject({
    method: 'POST',
    url: `/api/admin/artists/${a.id}/photo`,
    headers: { 'x-requested-with': 'ma-admin', cookie: session.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
  assert.equal(up.statusCode, 200, up.body);

  const list = (await app.inject({ url: '/api/public/artists' })).json();
  const photo = list.artists[0].photo;
  assert.match(photo, /^\/media\/p\/[a-f0-9]{24}\.jpg$/);
  assert.ok(!photo.includes(a.publicId) && !/priya/i.test(photo), 'photo URL must not embed the artist id or name');
  const img = await app.inject({ url: photo });
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers['content-type'], 'image/jpeg');
  const meta = await sharp(img.rawPayload).metadata();
  assert.equal(meta.width, 240);

  // original: 401 without a session, 200 with one
  assert.equal((await app.inject({ url: `/api/admin/artists/${a.id}/photo` })).statusCode, 401);
  assert.equal((await call('GET', `/artists/${a.id}/photo`)).statusCode, 200);
  // traversal attempts
  assert.equal((await app.inject({ url: '/media/p/..%2F..%2Fmyartist.db' })).statusCode, 404);
});
