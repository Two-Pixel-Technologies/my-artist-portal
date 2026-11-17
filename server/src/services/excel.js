import ExcelJS from 'exceljs';
import { GROUP_TYPES, OCCASIONS } from '../config.js';
import { artistInput, findLeaks } from './artists.js';
import { normalizePhone } from '../security.js';

export const COLUMNS = [
  { key: 'fullName', header: 'Full Name', width: 24, required: true, note: 'Private. Never shown to visitors.' },
  { key: 'stageName', header: 'Stage Name', width: 20, note: 'Private.' },
  { key: 'phone', header: 'Phone', width: 16, required: true, note: '10-digit Indian mobile. Used to detect duplicates.' },
  { key: 'altPhone', header: 'Alt Phone', width: 16 },
  { key: 'email', header: 'Email', width: 26 },
  { key: 'instagram', header: 'Instagram', width: 22 },
  { key: 'youtube', header: 'YouTube', width: 26 },
  { key: 'gender', header: 'Gender', width: 10, note: 'female / male / other' },
  { key: 'city', header: 'City', width: 16, required: true, note: 'Home city. Created automatically if new (State is then required).' },
  { key: 'state', header: 'State', width: 16, required: true },
  { key: 'travelsTo', header: 'Travels To', width: 28, note: 'Comma-separated existing cities the artist will travel to.' },
  { key: 'categories', header: 'Categories', width: 26, required: true, note: 'Comma-separated. The first one is the primary category.' },
  { key: 'tags', header: 'Tags', width: 26, note: 'Comma-separated public tags, e.g. Bollywood, Sufi. Must not contain names or contacts.' },
  { key: 'languages', header: 'Languages', width: 22, note: 'Comma-separated.' },
  { key: 'occasions', header: 'Occasions', width: 28, note: `Comma-separated from: ${OCCASIONS.join(', ')}` },
  { key: 'yearsExperience', header: 'Years Experience', width: 12 },
  { key: 'eventsDone', header: 'Events Done', width: 12 },
  { key: 'groupType', header: 'Group Type', width: 12, note: GROUP_TYPES.join(' / ') },
  { key: 'teamSize', header: 'Team Size', width: 10 },
  { key: 'headline', header: 'Headline', width: 36, note: 'PUBLIC one-liner, anonymous. e.g. "Bollywood & Gujarati wedding vocalist"' },
  { key: 'publicSummary', header: 'Public Summary', width: 40, note: 'PUBLIC. No names or contact details.' },
  { key: 'priceMin', header: 'Price Min', width: 12, note: 'Private. Never shown.' },
  { key: 'priceMax', header: 'Price Max', width: 12 },
  { key: 'priceNotes', header: 'Price Notes', width: 24 },
  { key: 'commissionPct', header: 'Commission Pct', width: 12 },
  { key: 'verified', header: 'Verified', width: 10, note: 'Yes / No' },
  { key: 'status', header: 'Status', width: 12, note: 'active / inactive / pending' },
  { key: 'equipment', header: 'Equipment', width: 24 },
  { key: 'requirements', header: 'Requirements', width: 24 },
  { key: 'internalNotes', header: 'Internal Notes', width: 30 },
  { key: 'source', header: 'Source', width: 16 },
];

const norm = (h) => String(h ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const KEY_BY_HEADER = new Map(COLUMNS.map((c) => [norm(c.header), c.key]));

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.hyperlink) return String(v.hyperlink);
    return '';
  }
  return String(v).trim();
}

export async function buildTemplate(db) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'myartist.in';
  const ws = wb.addWorksheet('Artists', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.height = 22;
  COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? 'FFFFE0B2' : 'FFEDEDED' } };
    const note = [c.required ? 'Required.' : null, c.note].filter(Boolean).join(' ');
    if (note) cell.note = note;
  });
  ws.addRow({
    fullName: 'Example Artist (delete this row)', phone: '9876543210', city: 'Ahmedabad', state: 'Gujarat', categories: 'Singer, Musician',
    languages: 'Hindi, Gujarati', occasions: 'Wedding, Corporate', yearsExperience: 8, eventsDone: 150, groupType: 'Solo',
    headline: 'Bollywood & Gujarati wedding vocalist', verified: 'No', status: 'active',
  });

  // Lookup sheet so people can copy exact spellings.
  const lk = wb.addWorksheet('Lookups');
  const cats = db.prepare('SELECT name FROM categories ORDER BY sort, name').all().map((r) => r.name);
  const cities = db.prepare('SELECT name, state FROM cities ORDER BY state, name').all();
  lk.addRow(['Categories', 'Cities', 'State', 'Occasions', 'Group types']).font = { bold: true };
  const rows = Math.max(cats.length, cities.length, OCCASIONS.length, GROUP_TYPES.length);
  for (let i = 0; i < rows; i++) lk.addRow([cats[i], cities[i]?.name, cities[i]?.state, OCCASIONS[i], GROUP_TYPES[i]]);
  [24, 20, 20, 20, 16].forEach((w, i) => (lk.getColumn(i + 1).width = w));

  const readme = wb.addWorksheet('Read me');
  [
    'How to import artists',
    '1. Fill one artist per row on the "Artists" sheet. Delete the example row.',
    '2. Headers shaded orange are required. Hover over a header for tips.',
    '3. Phone numbers are the unique key: a number that already exists is flagged as a duplicate.',
    '4. Category names must already exist (see the Lookups sheet). New cities are created automatically.',
    '5. Headline, Public Summary and Tags are PUBLIC. Keep them anonymous: no names, phone numbers or social handles.',
    '6. Photos are uploaded afterwards on each artist profile.',
    '7. Upload the file in Admin > Artists > Import. You will see a preview before anything is saved.',
  ].forEach((t, i) => { const r = readme.addRow([t]); if (i === 0) r.font = { bold: true, size: 14 }; });
  readme.getColumn(1).width = 110;

  return wb.xlsx.writeBuffer();
}

export async function exportArtists(db) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Artists', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ header: 'ID', key: 'publicId', width: 12 }, ...COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }))];
  ws.getRow(1).font = { bold: true };
  const list = (sql, id) => db.prepare(sql).all(id).map((r) => Object.values(r)[0]).join(', ');
  for (const a of db.prepare(`SELECT a.*, c.name AS city_name, c.state AS city_state FROM artists a LEFT JOIN cities c ON c.id = a.city_id ORDER BY a.id`).all()) {
    ws.addRow({
      publicId: a.public_id, fullName: a.full_name, stageName: a.stage_name, phone: a.phone, altPhone: a.alt_phone, email: a.email,
      instagram: a.instagram, youtube: a.youtube, gender: a.gender, city: a.city_name, state: a.city_state,
      travelsTo: list('SELECT c.name FROM artist_cities t JOIN cities c ON c.id = t.city_id WHERE t.artist_id = ?', a.id),
      categories: list('SELECT cat.name FROM artist_categories ac JOIN categories cat ON cat.id = ac.category_id WHERE ac.artist_id = ? ORDER BY ac.is_primary DESC', a.id),
      tags: list('SELECT tag FROM artist_tags WHERE artist_id = ?', a.id),
      languages: list('SELECT language FROM artist_languages WHERE artist_id = ?', a.id),
      occasions: list('SELECT occasion FROM artist_occasions WHERE artist_id = ?', a.id),
      yearsExperience: a.years_experience, eventsDone: a.events_done, groupType: a.group_type, teamSize: a.team_size,
      headline: a.headline, publicSummary: a.public_summary, priceMin: a.price_min, priceMax: a.price_max, priceNotes: a.price_notes,
      commissionPct: a.commission_pct, verified: a.verified ? 'Yes' : 'No', status: a.status, equipment: a.equipment,
      requirements: a.requirements, internalNotes: a.internal_notes, source: a.source,
    });
  }
  return wb.xlsx.writeBuffer();
}

const splitList = (s) => String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const toNum = (s) => {
  if (s === '' || s == null) return null;
  const n = Number(String(s).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Parses an uploaded workbook into validated rows + errors. Nothing is written to the database here.
 * Each valid row carries an artistInput-shaped `input` plus the home city name/state to be created on commit.
 */
export async function parseWorkbook(db, buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Artists') || wb.worksheets[0];
  if (!ws) return { fatal: 'The workbook has no sheets.' };

  const colIndex = {};
  const unknownHeaders = [];
  ws.getRow(1).eachCell((cell, n) => {
    const key = KEY_BY_HEADER.get(norm(cellText(cell.value)));
    if (key) colIndex[key] = n;
    else if (cellText(cell.value)) unknownHeaders.push(cellText(cell.value));
  });
  const missing = COLUMNS.filter((c) => c.required && !colIndex[c.key]).map((c) => c.header);
  if (missing.length) return { fatal: `Missing required column(s): ${missing.join(', ')}. Download the template for the exact headers.` };

  const cats = new Map(db.prepare('SELECT id, name FROM categories').all().map((c) => [c.name.toLowerCase(), c.id]));
  const catsByName = (n) => cats.get(n.toLowerCase());
  const cities = db.prepare('SELECT id, name, state FROM cities').all();
  const occasionByLower = new Map(OCCASIONS.map((o) => [o.toLowerCase(), o]));
  const groupByLower = new Map(GROUP_TYPES.map((g) => [g.toLowerCase(), g]));

  const rows = [];
  const errors = [];
  const seenPhones = new Map();

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (k) => (colIndex[k] ? cellText(row.getCell(colIndex[k]).value) : '');
    if (COLUMNS.every((c) => !get(c.key))) return; // blank line
    if (/\(delete this row\)/i.test(get('fullName'))) return; // the template's example row

    const problems = [];
    const categoryNames = splitList(get('categories'));
    const categoryIds = [];
    for (const n of categoryNames) {
      const id = catsByName(n);
      if (id) categoryIds.push(id);
      else problems.push(`Unknown category "${n}"`);
    }
    const occasions = [];
    for (const o of splitList(get('occasions'))) {
      const hit = occasionByLower.get(o.toLowerCase());
      if (hit) occasions.push(hit);
      else problems.push(`Unknown occasion "${o}"`);
    }
    const travelCityIds = [];
    for (const n of splitList(get('travelsTo'))) {
      const hit = cities.find((c) => c.name.toLowerCase() === n.toLowerCase());
      if (hit) travelCityIds.push(hit.id);
      else problems.push(`Unknown travel city "${n}" (add it as a home city first)`);
    }
    const groupRaw = get('groupType');
    const groupType = groupRaw ? groupByLower.get(groupRaw.toLowerCase()) : null;
    if (groupRaw && !groupType) problems.push(`Unknown group type "${groupRaw}"`);

    const cityName = get('city');
    const cityState = get('state');
    if (!cityName || !cityState) problems.push('City and State are required');
    const knownCity = cities.find((c) => c.name.toLowerCase() === cityName.toLowerCase() && c.state.toLowerCase() === cityState.toLowerCase());

    const numeric = { yearsExperience: toNum(get('yearsExperience')), eventsDone: toNum(get('eventsDone')), teamSize: toNum(get('teamSize')), priceMin: toNum(get('priceMin')), priceMax: toNum(get('priceMax')), commissionPct: toNum(get('commissionPct')) };
    for (const [k, v] of Object.entries(numeric)) if (Number.isNaN(v)) problems.push(`"${k}" must be a number`);

    const genderRaw = get('gender').toLowerCase();
    const verifiedRaw = get('verified').toLowerCase();
    const statusRaw = (get('status') || 'active').toLowerCase();

    const candidate = {
      fullName: get('fullName'),
      stageName: get('stageName') || null,
      phone: get('phone'),
      altPhone: get('altPhone') || null,
      email: get('email') || null,
      instagram: get('instagram') || null,
      youtube: get('youtube') || null,
      gender: ['female', 'male', 'other'].includes(genderRaw) ? genderRaw : null,
      cityId: knownCity?.id ?? null,
      travelCityIds,
      categoryIds,
      primaryCategoryId: categoryIds[0],
      languages: splitList(get('languages')),
      occasions,
      tags: splitList(get('tags')),
      headline: get('headline') || null,
      publicSummary: get('publicSummary') || null,
      yearsExperience: Number.isNaN(numeric.yearsExperience) ? null : numeric.yearsExperience,
      eventsDone: Number.isNaN(numeric.eventsDone) ? null : numeric.eventsDone,
      groupType: groupType || null,
      teamSize: Number.isNaN(numeric.teamSize) ? null : numeric.teamSize,
      priceMin: Number.isNaN(numeric.priceMin) ? null : numeric.priceMin,
      priceMax: Number.isNaN(numeric.priceMax) ? null : numeric.priceMax,
      priceNotes: get('priceNotes') || null,
      commissionPct: Number.isNaN(numeric.commissionPct) ? null : numeric.commissionPct,
      equipment: get('equipment') || null,
      requirements: get('requirements') || null,
      internalNotes: get('internalNotes') || null,
      source: get('source') || 'Excel import',
      verified: ['yes', 'y', 'true', '1'].includes(verifiedRaw),
      status: ['active', 'inactive', 'pending'].includes(statusRaw) ? statusRaw : 'active',
      links: [],
    };
    if (!['active', 'inactive', 'pending'].includes(statusRaw)) problems.push(`Unknown status "${statusRaw}"`);

    const parsed = artistInput.safeParse(candidate);
    if (!parsed.success) for (const i of parsed.error.issues) problems.push(`${i.path.join('.') || 'row'}: ${i.message}`);
    else {
      const leaks = findLeaks(parsed.data);
      if (leaks.length) problems.push(`Public text ${leaks.join('; ')}`);
      if (parsed.data.priceMin != null && parsed.data.priceMax != null && parsed.data.priceMin > parsed.data.priceMax) problems.push('Price Min is higher than Price Max');
    }

    const phone = normalizePhone(get('phone'));
    if (phone) {
      if (seenPhones.has(phone)) problems.push(`Same phone as row ${seenPhones.get(phone)} in this file`);
      else seenPhones.set(phone, rowNumber);
    }

    if (problems.length) {
      errors.push({ row: rowNumber, name: get('fullName') || '(no name)', problems });
      return;
    }
    const existing = db.prepare('SELECT id, public_id FROM artists WHERE phone = ?').get(parsed.data.phone);
    rows.push({
      row: rowNumber,
      cityName,
      cityState,
      input: { ...parsed.data, cityId: knownCity?.id ?? null },
      duplicateOf: existing ? { id: existing.id, publicId: existing.public_id } : null,
    });
  });

  return { rows, errors, unknownHeaders };
}
