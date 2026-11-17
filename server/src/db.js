import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { migrations } from './schema.js';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

export const DEFAULT_SETTINGS = {
  review_auto_approve: '0',
  review_expiry_days: '30',
  whatsapp_number: '',
};

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) return row.value;
  return fallback ?? DEFAULT_SETTINGS[key] ?? null;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

export function audit(db, adminId, action, entity = null, entityId = null, meta = null) {
  db.prepare('INSERT INTO audit_log(admin_id, action, entity, entity_id, meta) VALUES(?,?,?,?,?)').run(
    adminId ?? null,
    action,
    entity,
    entityId == null ? null : String(entityId),
    meta ? JSON.stringify(meta) : null,
  );
}

export function notify(db, { type, title, body = null, link = null }) {
  db.prepare('INSERT INTO notifications(type, title, body, link) VALUES(?,?,?,?)').run(type, title, body, link);
}
