import { slugify } from '../security.js';

export const DEFAULT_CATEGORIES = [
  ['Singer', 'Singers'],
  ['DJ', 'DJs'],
  ['Makeup artist', 'Makeup artists'],
  ['Dancer / troupe', 'Dancers & troupes'],
  ['Host / anchor', 'Hosts & anchors'],
  ['Comedian', 'Comedians'],
  ['Folk artist', 'Folk artists'],
  ['Musician', 'Musicians'],
  ['Magician', 'Magicians'],
  ['Sketch artist', 'Sketch artists'],
];

export const DEFAULT_CITIES = [
  ['Ahmedabad', 'Gujarat'], ['Surat', 'Gujarat'], ['Vadodara', 'Gujarat'], ['Rajkot', 'Gujarat'],
  ['Gandhinagar', 'Gujarat'], ['Bhavnagar', 'Gujarat'], ['Jamnagar', 'Gujarat'], ['Junagadh', 'Gujarat'],
  ['Anand', 'Gujarat'], ['Bharuch', 'Gujarat'], ['Mehsana', 'Gujarat'], ['Morbi', 'Gujarat'],
  ['Navsari', 'Gujarat'], ['Vapi', 'Gujarat'], ['Bhuj', 'Gujarat'], ['Nadiad', 'Gujarat'],
  ['Mumbai', 'Maharashtra'], ['Pune', 'Maharashtra'], ['Nashik', 'Maharashtra'],
  ['Jaipur', 'Rajasthan'], ['Udaipur', 'Rajasthan'], ['Delhi', 'Delhi'], ['Indore', 'Madhya Pradesh'],
  ['Bengaluru', 'Karnataka'], ['Hyderabad', 'Telangana'], ['Goa', 'Goa'],
];

export function seedCatalog(db) {
  const insCat = db.prepare('INSERT OR IGNORE INTO categories(slug, name, plural, sort) VALUES(?,?,?,?)');
  DEFAULT_CATEGORIES.forEach(([name, plural], i) => insCat.run(slugify(name), name, plural, i));
  const insCity = db.prepare('INSERT OR IGNORE INTO cities(slug, name, state) VALUES(?,?,?)');
  DEFAULT_CITIES.forEach(([name, state]) => insCity.run(slugify(name), name, state));
}

export function findOrCreateCity(db, name, state) {
  const found = db.prepare('SELECT id FROM cities WHERE name = ? AND state = ?').get(name, state);
  if (found) return found.id;
  let slug = slugify(name);
  if (db.prepare('SELECT 1 FROM cities WHERE slug = ?').get(slug)) slug = `${slug}-${slugify(state)}`;
  return Number(db.prepare('INSERT INTO cities(slug, name, state) VALUES(?,?,?)').run(slug, name, state).lastInsertRowid);
}

export function createCategory(db, name) {
  const slug = slugify(name);
  const info = db.prepare('INSERT INTO categories(slug, name, plural, sort) VALUES(?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM categories))').run(slug, name, `${name}s`);
  return Number(info.lastInsertRowid);
}
