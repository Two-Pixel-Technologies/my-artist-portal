// Usage: ADMIN_PASSWORD='long-password' npm run create-admin -- you@example.com "Your Name"
// Creates the first admin (or any admin) straight in the database.
import path from 'node:path';
import { config } from '../src/config.js';
import { openDb } from '../src/db.js';
import { hashPassword } from '../src/security.js';

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ') || 'Admin';
const password = process.env.ADMIN_PASSWORD;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password || password.length < 10) {
  console.error('Usage: ADMIN_PASSWORD=<10+ chars> npm run create-admin -- <email> [name]');
  process.exit(1);
}

const db = openDb(config.dbFile || path.join(config.dataDir, 'myartist.db'));
const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
if (existing) {
  db.prepare('UPDATE admins SET password_hash = ?, active = 1, name = ? WHERE id = ?').run(await hashPassword(password), name, existing.id);
  console.log(`Updated admin ${email}`);
} else {
  db.prepare('INSERT INTO admins(email, name, password_hash) VALUES(?,?,?)').run(email.toLowerCase(), name, await hashPassword(password));
  console.log(`Created admin ${email}`);
}
