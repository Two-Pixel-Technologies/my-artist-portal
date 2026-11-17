import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { api, artistPayload, login, makeApp, PASSWORD } from './helpers.js';

const reviewBody = (over = {}) => ({
  ratings: { punctuality: 5, performance: 4, professionalism: 5, communication: 5, value: 4 },
  text: 'Great evening',
  reviewerName: 'Riya S.',
  consent: true,
  ...over,
});

async function seedBooking(app, call) {
  const artist = (await call('POST', '/artists', artistPayload(app))).json().artist;
  const booking = (await call('POST', '/bookings', { artistId: artist.id, clientName: 'Riya Shah', clientPhone: '9811111111', eventDate: '2026-01-10', occasion: 'Wedding' })).json();
  return { artist, bookingId: booking.id };
}

test('review link works exactly once and GET never consumes it', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const { bookingId } = await seedBooking(app, call);

  const link = (await call('POST', `/bookings/${bookingId}/review-link`)).json();
  assert.match(link.url, /^https:\/\/example\.test\/review\/[\w-]{20,}$/);
  const token = link.url.split('/').pop();
  assert.ok(link.whatsappUrl.startsWith('https://wa.me/919811111111?text='));

  // the raw token is not stored anywhere in the database
  const hits = app.db.prepare('SELECT COUNT(*) AS n FROM review_requests WHERE token_hash = ?').get(token).n;
  assert.equal(hits, 0);

  // link-preview bots can GET repeatedly without burning it
  for (let i = 0; i < 3; i++) {
    const info = (await app.inject({ url: `/api/public/review/${token}` })).json();
    assert.equal(info.valid, true);
  }

  const bad = await app.inject({ method: 'POST', url: `/api/public/review/${token}`, payload: reviewBody({ consent: false }) });
  assert.equal(bad.statusCode, 400);
  const incomplete = await app.inject({ method: 'POST', url: `/api/public/review/${token}`, payload: { ...reviewBody(), ratings: { punctuality: 5 } } });
  assert.equal(incomplete.statusCode, 400);

  const first = await app.inject({ method: 'POST', url: `/api/public/review/${token}`, payload: reviewBody() });
  assert.equal(first.statusCode, 200, first.body);
  const second = await app.inject({ method: 'POST', url: `/api/public/review/${token}`, payload: reviewBody() });
  assert.equal(second.statusCode, 410);
  assert.equal((await app.inject({ url: `/api/public/review/${token}` })).json().reason, 'used');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n, 1);
});

test('concurrent submissions of the same link produce a single review', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const { bookingId } = await seedBooking(app, call);
  const token = (await call('POST', `/bookings/${bookingId}/review-link`)).json().url.split('/').pop();
  const results = await Promise.all(Array.from({ length: 6 }, () => app.inject({ method: 'POST', url: `/api/public/review/${token}`, payload: reviewBody() })));
  assert.equal(results.filter((r) => r.statusCode === 200).length, 1);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n, 1);
});

test('expired, revoked and replaced links are rejected', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const { bookingId } = await seedBooking(app, call);

  const old = (await call('POST', `/bookings/${bookingId}/review-link`)).json().url.split('/').pop();
  const fresh = (await call('POST', `/bookings/${bookingId}/review-link`)).json().url.split('/').pop();
  assert.equal((await app.inject({ url: `/api/public/review/${old}` })).json().reason, 'revoked'); // regenerating revokes the old link
  assert.equal((await app.inject({ url: `/api/public/review/${fresh}` })).json().valid, true);

  app.db.prepare(`UPDATE review_requests SET expires_at = datetime('now','-1 minute') WHERE revoked_at IS NULL`).run();
  assert.equal((await app.inject({ url: `/api/public/review/${fresh}` })).json().reason, 'expired');
  assert.equal((await app.inject({ method: 'POST', url: `/api/public/review/${fresh}`, payload: reviewBody() })).statusCode, 410);
  assert.equal((await app.inject({ url: '/api/public/review/not-a-real-token' })).json().reason, 'invalid');
});

test('reviews need approval and only approved reviews affect public ratings', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const { artist } = await seedBooking(app, call);
  // three bookings -> three reviews (rating shows from 3 approved reviews)
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const b = (await call('POST', '/bookings', { artistId: artist.id, clientName: `Client ${i}`, eventDate: '2026-01-10' })).json().id;
    const token = (await call('POST', `/bookings/${b}/review-link`)).json().url.split('/').pop();
    await app.inject({ method: 'POST', url: `/api/public/review/${token}`, payload: reviewBody() });
  }
  const pending = (await call('GET', '/reviews?status=pending')).json().reviews;
  assert.equal(pending.length, 3);
  assert.equal((await app.inject({ url: '/api/public/artists' })).json().artists[0].rating, null);
  for (const r of pending.slice(0, 2)) await call('PATCH', `/reviews/${r.id}`, { status: 'approved' });
  assert.equal((await app.inject({ url: '/api/public/artists' })).json().artists[0].rating, null, 'two reviews are below the display threshold');
  await call('PATCH', `/reviews/${pending[2].id}`, { status: 'approved' });
  const shown = (await app.inject({ url: '/api/public/artists' })).json().artists[0];
  assert.deepEqual(shown.rating, { avg: 4.6, count: 3 });
  assert.ok(!JSON.stringify(shown).includes('Client'), 'reviewer identity is not part of the public listing');
});

test('enquiries: validation, honeypot, double-submit, notification', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const artist = (await call('POST', '/artists', artistPayload(app))).json().artist;
  const post = (payload) => app.inject({ method: 'POST', url: '/api/public/enquiries', payload });
  const good = { name: 'Riya Shah', phone: '+91 98111 11111', eventCity: 'Surat', occasion: 'Wedding', consent: true, artistId: artist.publicId };

  assert.equal((await post({ ...good, phone: '12345' })).statusCode, 400);
  assert.equal((await post({ ...good, consent: false })).statusCode, 400);
  assert.equal((await post({ ...good, occasion: 'Nope' })).statusCode, 400);

  const hp = await post({ ...good, website: 'http://spam.example' });
  assert.equal(hp.statusCode, 200);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n, 0, 'honeypot submissions are not stored');

  const a = (await post(good)).json();
  const b = (await post(good)).json();
  assert.equal(a.ref, b.ref, 'a quick repeat returns the same enquiry');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n, 1);

  const inbox = (await call('GET', '/enquiries')).json();
  assert.equal(inbox.enquiries[0].artist_public_id, artist.publicId);
  assert.equal(inbox.enquiries[0].phone, '9811111111');
  const notes = (await call('GET', '/notifications')).json();
  assert.equal(notes.unread, 1);
  await call('POST', '/notifications/seen');
  assert.equal((await call('GET', '/notifications')).json().unread, 0);
});

test('enquiry endpoint is rate limited', async (t) => {
  const { app, cleanup } = await makeApp({ rl: { enquiry: 3 } });
  t.after(cleanup);
  const codes = [];
  for (let i = 0; i < 5; i++) {
    const r = await app.inject({ method: 'POST', url: '/api/public/enquiries', payload: { name: 'A B', phone: `98111111${10 + i}`, consent: true } });
    codes.push(r.statusCode);
  }
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test('WhatsApp hand-off logs the click and prefills the artist id', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const artist = (await call('POST', '/artists', artistPayload(app))).json().artist;
  const res = await app.inject({ url: `/go/wa?a=${artist.publicId}` });
  assert.equal(res.statusCode, 302);
  const loc = new URL(res.headers.location);
  assert.equal(loc.origin + loc.pathname, 'https://wa.me/919712026900');
  assert.ok(loc.searchParams.get('text').includes(artist.publicId));
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM wa_clicks WHERE artist_id = ?').get(artist.id).n, 1);
  // junk ids still redirect, but are not attributed to an artist
  assert.equal((await app.inject({ url: '/go/wa?a=MA-ZZZZ' })).statusCode, 302);
});

test('admin API requires a session and the CSRF header', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  assert.equal((await app.inject({ url: '/api/admin/artists' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/admin/dashboard' })).statusCode, 401);

  const session = await login(app);
  const noHeader = await app.inject({ method: 'POST', url: '/api/admin/artists', headers: { cookie: session.cookie }, payload: artistPayload(app) });
  assert.equal(noHeader.statusCode, 403);
  assert.equal((await app.inject({ url: '/api/admin/artists', headers: { cookie: session.cookie } })).statusCode, 200);

  await app.inject({ method: 'POST', url: '/api/admin/auth/logout', headers: { 'x-requested-with': 'ma-admin', cookie: session.cookie } });
  assert.equal((await app.inject({ url: '/api/admin/artists', headers: { cookie: session.cookie } })).statusCode, 401);
});

test('login: wrong passwords are rejected and repeated failures lock the account', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const attempt = (password, email = 'boss@example.com') =>
    app.inject({ method: 'POST', url: '/api/admin/auth/login', headers: { 'x-requested-with': 'ma-admin' }, payload: { email, password } });
  assert.equal((await attempt('nope', 'ghost@example.com')).statusCode, 401);
  for (let i = 0; i < 5; i++) assert.equal((await attempt('wrong')).statusCode, 401);
  assert.equal((await attempt(PASSWORD)).statusCode, 429, 'locked even with the right password');
});

test('any admin can add admins; guard rails protect the last one', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  assert.equal((await call('POST', '/admins', { email: 'x@example.com', name: 'Xavier', password: 'short' })).statusCode, 400);
  const made = await call('POST', '/admins', { email: 'new@example.com', name: 'Nina', password: 'another-long-password' });
  assert.equal(made.statusCode, 200);
  assert.equal((await call('POST', '/admins', { email: 'NEW@example.com', name: 'Dup', password: 'another-long-password' })).statusCode, 409);

  const second = await login(app, 'new@example.com', 'another-long-password');
  assert.equal((await api(app, second)('GET', '/auth/me')).json().admin.name, 'Nina');

  const me = (await call('GET', '/auth/me')).json().admin;
  assert.equal((await call('PATCH', `/admins/${me.id}`, { active: false })).statusCode, 400, 'cannot deactivate yourself');
  const nina = (await call('GET', '/admins')).json().admins.find((a) => a.email === 'new@example.com');
  assert.equal((await call('PATCH', `/admins/${nina.id}`, { active: false })).statusCode, 200);
  assert.equal((await api(app, second)('GET', '/auth/me')).statusCode, 401, 'deactivated admins are signed out immediately');
});

test('duplicate phone numbers are rejected on create and update', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const a = (await call('POST', '/artists', artistPayload(app))).json().artist;
  assert.equal((await call('POST', '/artists', artistPayload(app, { fullName: 'Someone Else' }))).statusCode, 409);
  const b = (await call('POST', '/artists', artistPayload(app, { fullName: 'Someone Else', phone: '+91 98765 43299' }))).json().artist;
  assert.equal((await call('PUT', `/artists/${b.id}`, artistPayload(app, { fullName: 'Someone Else', phone: '98765 43210' }))).statusCode, 409);
  assert.equal((await call('PUT', `/artists/${a.id}`, artistPayload(app, { headline: 'Updated headline' }))).statusCode, 200);
});

async function workbookWith(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Artists');
  const headers = ['Full Name*', 'Phone', 'City', 'State', 'Categories', 'Languages', 'Occasions', 'Years Experience', 'Events Done', 'Headline', 'Verified'];
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function multipartXlsx(buffer, name = 'artists.xlsx') {
  const boundary = '----x';
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

test('excel import: preview reports errors and duplicates, commit applies the rest', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const session = await login(app);
  const call = api(app, session);
  await call('POST', '/artists', artistPayload(app)); // 9876543210 already exists

  const buf = await workbookWith([
    ['Asha Rao', '9000000001', 'Ahmedabad', 'Gujarat', 'Singer, Musician', 'Hindi, Gujarati', 'Wedding', 6, 80, 'Playback-style stage vocalist', 'Yes'],
    ['Dup Person', '9876543210', 'Ahmedabad', 'Gujarat', 'Singer', '', '', '', '', '', ''],
    ['Bad Category', '9000000002', 'Ahmedabad', 'Gujarat', 'Juggler', '', '', '', '', '', ''],
    ['Bad Phone', '123', 'Ahmedabad', 'Gujarat', 'Singer', '', '', '', '', '', ''],
    ['Leaky Lena', '9000000003', 'Ahmedabad', 'Gujarat', 'Singer', '', '', '', '', 'Lena sings at weddings', ''],
    ['New City Guy', '9000000004', 'Kota', 'Rajasthan', 'DJ', 'Hindi', '', 3, '', 'Wedding DJ', 'No'],
  ]);
  const up = multipartXlsx(buf);
  const prev = await app.inject({ method: 'POST', url: '/api/admin/artists/import/preview', headers: { 'x-requested-with': 'ma-admin', cookie: session.cookie, ...up.headers }, payload: up.payload });
  assert.equal(prev.statusCode, 200, prev.body);
  const p = prev.json();
  assert.equal(p.summary.valid, 3);
  assert.equal(p.summary.errors, 3);
  assert.equal(p.summary.duplicates, 1);
  assert.deepEqual(p.summary.newCities, ['Kota, Rajasthan']);
  const problems = p.errors.map((e) => e.problems.join(' ')).join(' | ');
  assert.match(problems, /Unknown category "Juggler"/);
  assert.match(problems, /valid 10-digit/);
  assert.match(problems, /artist's name/);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM artists').get().n, 1, 'preview writes nothing');

  const done = (await call('POST', `/artists/import/${p.batchId}/commit`, { onDuplicate: 'skip' })).json();
  assert.deepEqual({ c: done.created, u: done.updated, s: done.skipped, f: done.failed.length }, { c: 2, u: 0, s: 1, f: 0 });
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM artists').get().n, 3);
  assert.ok(app.db.prepare(`SELECT 1 FROM cities WHERE name = 'Kota'`).get());
  assert.equal((await call('POST', `/artists/import/${p.batchId}/commit`, {})).statusCode, 400, 'a batch can only be applied once');
});

test('excel template downloads and re-imports cleanly', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const session = await login(app);
  const tpl = await app.inject({ url: '/api/admin/artists/template.xlsx', headers: { cookie: session.cookie } });
  assert.equal(tpl.statusCode, 200);
  assert.match(tpl.headers['content-type'], /spreadsheetml/);
  const up = multipartXlsx(tpl.rawPayload);
  const prev = await app.inject({ method: 'POST', url: '/api/admin/artists/import/preview', headers: { 'x-requested-with': 'ma-admin', cookie: session.cookie, ...up.headers }, payload: up.payload });
  assert.equal(prev.statusCode, 200, prev.body);
  assert.equal(prev.json().summary.valid + prev.json().summary.errors, 0, 'the example row is ignored');
});

test('public filters: city covers home city and travel cities; categories; sorting', async (t) => {
  const { app, cleanup } = await makeApp();
  t.after(cleanup);
  const call = api(app, await login(app));
  const { cityId, catId } = await import('./helpers.js');
  await call('POST', '/artists', artistPayload(app, { travelCityIds: [cityId(app, 'Surat')] }));
  await call('POST', '/artists', artistPayload(app, { fullName: 'Dj Person', phone: '9876543299', headline: 'Club DJ', categoryIds: [catId(app, 'DJ')], primaryCategoryId: catId(app, 'DJ'), cityId: cityId(app, 'Mumbai'), yearsExperience: 2 }));
  const get = async (qs) => (await app.inject({ url: `/api/public/artists?${qs}` })).json();
  assert.equal((await get('city=surat')).total, 1, 'travel city matches');
  assert.equal((await get('city=ahmedabad')).total, 1);
  assert.equal((await get('state=Gujarat')).total, 1);
  assert.equal((await get('category=dj')).total, 1);
  assert.equal((await get('category=dj,singer')).total, 2);
  assert.equal((await get('minYears=5')).total, 1);
  assert.equal((await get('language=Gujarati')).total, 2);
  assert.equal((await get('language=Punjabi')).total, 0);
  assert.equal((await get('sort=experience')).artists[0].category, 'Singer');
  assert.equal((await get("q=%25")).total, 0, 'LIKE wildcards are escaped');
  const facets = (await app.inject({ url: '/api/public/filters' })).json();
  assert.equal(facets.categories.find((c) => c.slug === 'singer').count, 1);
  assert.ok(facets.cities.every((c) => c.count > 0));
});
