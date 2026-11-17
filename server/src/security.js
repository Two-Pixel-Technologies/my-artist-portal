import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algo, n, r, p, saltHex, keyHex] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(keyHex, 'hex');
    const key = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, { N: +n, r: +r, p: +p });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Run a hash even when the user does not exist, so response time doesn't reveal valid emails.
const DUMMY_HASH = await hashPassword('dummy-password-for-timing');
export const burnPasswordCheck = (password) => verifyPassword(password, DUMMY_HASH);

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const hashIp = (ip, salt) => sha256(`${salt}:${ip || ''}`).slice(0, 32);

const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

export function generatePublicId(db) {
  for (let i = 0; i < 20; i++) {
    const id = `MA-${randomCode(4)}`;
    if (!db.prepare('SELECT 1 FROM artists WHERE public_id = ?').get(id)) return id;
  }
  // Extremely unlikely; widen the code instead of failing.
  return `MA-${randomCode(6)}`;
}

export function generateEnquiryRef(db) {
  for (let i = 0; i < 20; i++) {
    const ref = `EQ-${randomCode(6)}`;
    if (!db.prepare('SELECT 1 FROM enquiries WHERE ref = ?').get(ref)) return ref;
  }
  return `EQ-${randomCode(8)}`;
}

/** Indian mobile: accepts +91 / 91 / 0 prefixes and separators. Returns 10 digits or null. */
export function normalizePhone(input) {
  if (input == null) return null;
  let d = String(input).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
