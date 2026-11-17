// Fills a fresh database with clearly fictional demo artists, bookings and reviews so the portal can be explored.
// Usage: npm run seed            (does nothing if artists already exist)
//        npm run seed -- --force (adds the demo set again)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { openDb } from '../src/db.js';
import { hashPassword, randomToken, sha256 } from '../src/security.js';
import { artistInput, saveArtist } from '../src/services/artists.js';
import { seedCatalog } from '../src/services/catalog.js';
import { processArtistPhoto } from '../src/services/images.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_DIR = process.env.SEED_IMAGES || path.resolve(here, '../../public/images');
const db = openDb(config.dbFile || path.join(config.dataDir, 'myartist.db'));
seedCatalog(db);

if (db.prepare('SELECT COUNT(*) AS n FROM artists').get().n > 0 && !process.argv.includes('--force')) {
  console.log('Artists already exist; skipping demo seed (use --force to add anyway).');
  process.exit(0);
}

const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@myartist.in';
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe-12345';
if (!db.prepare('SELECT 1 FROM admins WHERE email = ?').get(adminEmail)) {
  db.prepare('INSERT INTO admins(email, name, password_hash) VALUES(?,?,?)').run(adminEmail, 'Demo Admin', await hashPassword(adminPassword));
  console.log(`Created demo admin: ${adminEmail} / ${adminPassword}   (change this!)`);
}

const city = (name) => db.prepare('SELECT id FROM cities WHERE name = ?').get(name).id;
const cat = (name) => db.prepare('SELECT id FROM categories WHERE name = ?').get(name).id;

// [private name, stage name, phone, city, [categories], languages, occasions, years, events, headline, summary, tags, group, image, [review count, avg rating], travels]
const DEMO = [
  ['Kavya Desai', 'Kavya D', '9800000001', 'Ahmedabad', ['Singer'], ['Hindi', 'Gujarati'], ['Wedding', 'Corporate', 'Private party'], 8, 156, 'Bollywood & Gujarati wedding vocalist', 'Sangeet-ready sets that glide from soft ghazals to a full dance floor.', ['Bollywood', 'Garba'], 'Solo', 'indian-singer.jpg', [31, 4.9], ['Surat', 'Vadodara']],
  ['Rohan Mehta', 'DJ Rohan', '9800000002', 'Vadodara', ['DJ'], ['Hindi', 'English'], ['Wedding', 'College fest', 'Birthday'], 10, 320, 'Wedding sangeet & club-set DJ', 'High-energy mixes with a live-reading approach to the crowd.', ['Sangeet', 'EDM'], 'Solo', 'indian-dj.jpg', [44, 4.7], ['Ahmedabad']],
  ['Nisha Patel', 'Nisha Makeovers', '9800000003', 'Surat', ['Makeup artist'], ['Hindi', 'Gujarati'], ['Wedding', 'Cultural'], 6, 92, 'Bridal & HD makeup specialist', 'Long-wear bridal looks, tested for photography and heat.', ['Bridal', 'HD makeup'], 'Solo', 'indian-makeup-1.jpg', [22, 4.8], ['Vadodara', 'Mumbai']],
  ['Harshad Solanki', 'Solanki Folk Troupe', '9800000004', 'Rajkot', ['Folk artist', 'Musician'], ['Gujarati', 'Hindi'], ['Wedding', 'Religious', 'Cultural'], 12, 215, 'Gujarati folk ensemble, five members', 'Dhol, harmonium and vocals for garba nights and traditional ceremonies.', ['Garba', 'Dandiya', 'Bhajan'], 'Band', 'indian-folk-singer.jpg', [18, 4.9], ['Ahmedabad', 'Jamnagar']],
  ['Ananya Rao', 'Ananya & Co', '9800000005', 'Ahmedabad', ['Dancer / troupe'], ['Hindi', 'English'], ['Wedding', 'Corporate', 'College fest'], 7, 112, 'Classical-fusion dance troupe', 'Six dancers, choreographed entries and sangeet performances.', ['Fusion', 'Sangeet'], 'Troupe', 'indian-dance-group.jpg', [15, 4.8], ['Gandhinagar']],
  ['Vikram Shah', 'Vik Strings', '9800000006', 'Gandhinagar', ['Musician', 'Singer'], ['Hindi', 'English'], ['Corporate', 'Private party', 'Birthday'], 5, 64, 'Acoustic singer-guitarist for cocktail evenings', 'Unplugged covers and originals, ideal for lounges and receptions.', ['Acoustic', 'Unplugged'], 'Solo', 'indian-guitarist.jpg', [12, 4.6], ['Ahmedabad']],
  ['Sana Qureshi', 'Sana Q', '9800000007', 'Mumbai', ['Singer'], ['Hindi', 'Urdu'], ['Wedding', 'Corporate', 'Cultural'], 14, 228, 'Sufi and ghazal evenings', 'An intimate repertoire of qawwali-inspired and ghazal sets.', ['Sufi', 'Ghazal'], 'Solo', 'singer.jpg', [27, 4.9], ['Pune']],
  ['Aman Kapoor', 'Aman Live', '9800000008', 'Pune', ['Singer'], ['Hindi', 'Punjabi', 'English'], ['Wedding', 'College fest', 'Private party'], 6, 97, 'Pop and Punjabi party singer', 'Chart-toppers and bhangra openers that fill a floor quickly.', ['Pop', 'Punjabi'], 'Solo', 'indian-guitarist.jpg', [19, 4.7], []],
  ['Rina Joshi', 'Rina Glam', '9800000009', 'Ahmedabad', ['Makeup artist'], ['Hindi', 'Gujarati', 'English'], ['Wedding', 'Birthday', 'Corporate'], 9, 140, 'Editorial and party makeup artist', 'Natural-finish looks for photoshoots, receptions and parties.', ['Party', 'Editorial'], 'Solo', 'indian-makeup.jpg', [14, 4.6], ['Surat']],
  ['Dev Trivedi', 'DJ Dev', '9800000010', 'Surat', ['DJ'], ['Hindi', 'Gujarati', 'English'], ['Wedding', 'Birthday', 'Private party'], 4, 58, 'Bollywood and Gujarati remix DJ', 'Clean transitions, strong dhol-meets-electronic edits.', ['Remix', 'Bollywood'], 'Solo', 'dj.jpg', [0, 0], []],
  ['Pooja Nair', 'Pooja Hosts', '9800000011', 'Ahmedabad', ['Host / anchor'], ['Hindi', 'Gujarati', 'English'], ['Wedding', 'Corporate', 'College fest'], 8, 205, 'Bilingual wedding and corporate host', 'Keeps ceremonies on time and crowds engaged, in Hindi, Gujarati or English.', ['Anchor', 'Emcee'], 'Solo', 'singer.jpg', [26, 4.8], ['Vadodara', 'Surat']],
  ['Kunal Bhatt', 'Kunal K', '9800000012', 'Ahmedabad', ['Comedian'], ['Hindi', 'Gujarati', 'English'], ['Corporate', 'College fest', 'Private party'], 5, 73, 'Clean stand-up comedian for corporate shows', 'Family-friendly observational comedy, adaptable to the audience.', ['Stand-up', 'Clean comedy'], 'Solo', 'indian-comedian.jpg', [9, 4.5], ['Gandhinagar']],
];

const insertReview = db.transaction((artistId, i, avg, pastDays) => {
  const booking = Number(
    db
      .prepare(`INSERT INTO bookings(artist_id, client_name, event_date, event_city, occasion, status) VALUES(?,?,date('now', ?),?,?, 'completed')`)
      .run(artistId, `Demo Client ${i + 1}`, `-${pastDays + i * 3} days`, 'Ahmedabad', 'Wedding').lastInsertRowid,
  );
  const rr = Number(
    db
      .prepare(`INSERT INTO review_requests(booking_id, artist_id, token_hash, expires_at, used_at) VALUES(?,?,?, datetime('now','+30 days'), datetime('now'))`)
      .run(booking, artistId, sha256(randomToken())).lastInsertRowid,
  );
  const base = Math.round(avg);
  const jitter = () => Math.max(3, Math.min(5, base + (Math.random() > 0.8 ? -1 : 0)));
  const r = [jitter(), jitter(), jitter(), jitter(), jitter()];
  const overall = r.reduce((a, b) => a + b, 0) / 5;
  db.prepare(
    `INSERT INTO reviews(review_request_id, artist_id, booking_id, reviewer_name, r_punctuality, r_performance, r_professionalism, r_communication, r_value, rating_overall, status, body)
     VALUES(?,?,?,?,?,?,?,?,?,?, 'approved', ?)`,
  ).run(rr, artistId, booking, `Client ${String.fromCharCode(65 + (i % 26))}.`, ...r, overall, i === 0 ? 'Wonderful performance, guests loved it and everything ran on time.' : null);
});

for (const [full, stage, phone, home, cats, langs, occasions, years, events, headline, summary, tags, group, image, [reviewCount, avg], travels] of DEMO) {
  const id = saveArtist(
    db,
    null,
    artistInput.parse({
      fullName: full, stageName: stage, phone,
      cityId: city(home),
      travelCityIds: travels.map(city),
      categoryIds: cats.map(cat),
      primaryCategoryId: cat(cats[0]),
      languages: langs, occasions, tags,
      headline, publicSummary: summary,
      yearsExperience: years, eventsDone: events, groupType: group,
      priceMin: 15000 + years * 1000, priceMax: 40000 + years * 2500, priceNotes: 'Demo data',
      commissionPct: 15, internalNotes: 'Demo artist created by the seed script.', source: 'seed', verified: true,
      featured: phone === '9800000001', status: 'active',
    }),
    null,
  );
  const file = path.join(IMAGE_DIR, image);
  if (fs.existsSync(file)) {
    const out = await processArtistPhoto(fs.readFileSync(file), config.dataDir);
    db.prepare('UPDATE artists SET photo_private = ?, photo_public = ? WHERE id = ?').run(out.privateName, out.publicKey, id);
  }
  for (let i = 0; i < Math.min(reviewCount, 40); i++) insertReview(id, i, avg, 20);
}

// A few enquiries so the admin inbox is not empty.
const someArtists = db.prepare('SELECT id FROM artists ORDER BY id LIMIT 3').all();
const insEnq = db.prepare(`INSERT INTO enquiries(ref, artist_id, name, phone, occasion, event_city, event_date, message, status) VALUES(?,?,?,?,?,?,date('now', ?),?,?)`);
insEnq.run('EQ-DEMO01', someArtists[0].id, 'Riya Shah', '9811111111', 'Wedding', 'Ahmedabad', '+45 days', 'Looking for a sangeet performance, around 300 guests.', 'new');
insEnq.run('EQ-DEMO02', someArtists[1].id, 'Imran Khan', '9822222222', 'Birthday', 'Vadodara', '+20 days', null, 'contacted');
insEnq.run('EQ-DEMO03', null, 'Priya Menon', '9833333333', 'Corporate', 'Pune', '+60 days', 'Annual day, need a host and a live band.', 'new');
db.prepare(`INSERT INTO notifications(type, title, body, link) VALUES('enquiry','New enquiry from Riya Shah','Artist enquiry · Wedding · Ahmedabad','/admin/enquiries')`).run();

console.log(`Seeded ${DEMO.length} demo artists with photos from ${IMAGE_DIR}.`);
