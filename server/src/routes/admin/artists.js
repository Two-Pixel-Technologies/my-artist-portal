import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { audit } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import { artistInput, getArtistFull, saveArtist } from '../../services/artists.js';
import { findOrCreateCity } from '../../services/catalog.js';
import { buildTemplate, exportArtists, parseWorkbook } from '../../services/excel.js';
import { deletePhotoFiles, privateDir, processArtistPhoto } from '../../services/images.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
};

export default async function artistsRoutes(app) {
  const { db, cfg } = app;

  app.get('/artists', async (req) => {
    const q = req.query;
    const where = ['1=1'];
    const params = [];
    if (q.status && q.status !== 'all') { where.push('a.status = ?'); params.push(q.status); }
    else if (!q.status) where.push(`a.status != 'archived'`);
    if (q.category) { where.push('EXISTS (SELECT 1 FROM artist_categories ac WHERE ac.artist_id = a.id AND ac.category_id = ?)'); params.push(Number(q.category)); }
    if (q.city) { where.push('a.city_id = ?'); params.push(Number(q.city)); }
    if (q.verified === '1' || q.verified === '0') { where.push('a.verified = ?'); params.push(Number(q.verified)); }
    if (q.q) {
      const like = `%${String(q.q).toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where.push(`(lower(a.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(a.stage_name,'')) LIKE ? ESCAPE '\\' OR a.phone LIKE ? ESCAPE '\\' OR lower(a.public_id) LIKE ? ESCAPE '\\' OR lower(COALESCE(a.headline,'')) LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like, like);
    }
    const sortMap = { updated: 'a.updated_at DESC', name: 'a.full_name COLLATE NOCASE', created: 'a.created_at DESC', events: 'a.events_done DESC' };
    const order = sortMap[q.sort] || sortMap.updated;
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
    const from = `FROM artists a LEFT JOIN cities c ON c.id = a.city_id`;
    const total = db.prepare(`SELECT COUNT(*) AS n ${from} WHERE ${where.join(' AND ')}`).get(...params).n;
    const rows = db
      .prepare(
        `SELECT a.id, a.public_id, a.full_name, a.stage_name, a.phone, a.status, a.verified, a.featured, a.years_experience, a.events_done, a.headline,
                a.photo_public, a.updated_at, c.name AS city, c.state,
                (SELECT group_concat(cat.name, ', ') FROM artist_categories ac JOIN categories cat ON cat.id = ac.category_id WHERE ac.artist_id = a.id ORDER BY ac.is_primary DESC) AS categories,
                (SELECT COUNT(*) FROM enquiries e WHERE e.artist_id = a.id) AS enquiries,
                (SELECT COUNT(*) FROM reviews r WHERE r.artist_id = a.id AND r.status = 'approved') AS reviews,
                (SELECT ROUND(AVG(rating_overall),1) FROM reviews r WHERE r.artist_id = a.id AND r.status = 'approved') AS rating
         ${from} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
      )
      .all(...params, size, (page - 1) * size);
    return { total, page, pageSize: size, artists: rows.map((r) => ({ ...r, verified: !!r.verified, featured: !!r.featured })) };
  });

  // Lightweight list for pickers (bookings, enquiries).
  app.get('/artists-lookup', async (req) => {
    const like = `%${String(req.query.q || '').toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    return {
      artists: db
        .prepare(
          `SELECT id, public_id, full_name, stage_name, headline FROM artists
           WHERE status != 'archived' AND (lower(full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(stage_name,'')) LIKE ? ESCAPE '\\' OR lower(public_id) LIKE ? ESCAPE '\\')
           ORDER BY full_name COLLATE NOCASE LIMIT 20`,
        )
        .all(like, like, like),
    };
  });

  app.get('/artists/template.xlsx', async (req, reply) => {
    reply.header('content-type', XLSX).header('content-disposition', 'attachment; filename="myartist-artists-template.xlsx"');
    return reply.send(Buffer.from(await buildTemplate(db)));
  });

  app.get('/artists/export.xlsx', async (req, reply) => {
    audit(db, req.admin.id, 'artists.export');
    reply.header('content-type', XLSX).header('content-disposition', `attachment; filename="myartist-artists-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    return reply.send(Buffer.from(await exportArtists(db)));
  });

  app.get('/artists/:id', async (req) => {
    const a = getArtistFull(db, idParam(req));
    if (!a) throw notFound('Artist not found');
    return { artist: a };
  });

  app.post('/artists', async (req) => {
    const data = artistInput.parse(req.body);
    const id = saveArtist(db, null, data, req.admin.id);
    audit(db, req.admin.id, 'artist.create', 'artist', id);
    return { artist: getArtistFull(db, id) };
  });

  app.put('/artists/:id', async (req) => {
    const id = idParam(req);
    if (!db.prepare('SELECT 1 FROM artists WHERE id = ?').get(id)) throw notFound('Artist not found');
    saveArtist(db, id, artistInput.parse(req.body), req.admin.id);
    audit(db, req.admin.id, 'artist.update', 'artist', id);
    return { artist: getArtistFull(db, id) };
  });

  // Soft delete: bookings, reviews and enquiries keep pointing at a real row.
  app.delete('/artists/:id', async (req) => {
    const id = idParam(req);
    const info = db.prepare(`UPDATE artists SET status = 'archived', updated_at = datetime('now') WHERE id = ?`).run(id);
    if (!info.changes) throw notFound('Artist not found');
    audit(db, req.admin.id, 'artist.archive', 'artist', id);
    return { ok: true };
  });

  // ---- photo ----
  app.post('/artists/:id/photo', async (req) => {
    const id = idParam(req);
    const row = db.prepare('SELECT photo_private, photo_public FROM artists WHERE id = ?').get(id);
    if (!row) throw notFound('Artist not found');
    const file = await req.file();
    if (!file) throw badRequest('No file uploaded');
    if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.mimetype)) throw badRequest('Upload a JPG, PNG or WebP image');
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw badRequest('Image is too large (max 10 MB)');
    let out;
    try {
      out = await processArtistPhoto(buffer, cfg.dataDir);
    } catch (e) {
      throw badRequest('That file could not be read as an image');
    }
    db.prepare(`UPDATE artists SET photo_private = ?, photo_public = ?, updated_at = datetime('now') WHERE id = ?`).run(out.privateName, out.publicKey, id);
    deletePhotoFiles(cfg.dataDir, { privateName: row.photo_private, publicKey: row.photo_public });
    audit(db, req.admin.id, 'artist.photo', 'artist', id);
    return { ok: true, publicPhotoKey: out.publicKey };
  });

  app.delete('/artists/:id/photo', async (req) => {
    const id = idParam(req);
    const row = db.prepare('SELECT photo_private, photo_public FROM artists WHERE id = ?').get(id);
    if (!row) throw notFound('Artist not found');
    db.prepare(`UPDATE artists SET photo_private = NULL, photo_public = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
    deletePhotoFiles(cfg.dataDir, { privateName: row.photo_private, publicKey: row.photo_public });
    return { ok: true };
  });

  // The original (unblurred) photo is admin-only.
  app.get('/artists/:id/photo', async (req, reply) => {
    const row = db.prepare('SELECT photo_private FROM artists WHERE id = ?').get(idParam(req));
    if (!row?.photo_private) throw notFound('No photo');
    const full = path.join(privateDir(cfg.dataDir), path.basename(row.photo_private));
    if (!fs.existsSync(full)) throw notFound('No photo');
    reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=300');
    return reply.send(fs.createReadStream(full));
  });

  // ---- Excel import: upload -> preview -> commit ----
  app.post('/artists/import/preview', async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('Upload an .xlsx file');
    if (!/\.xlsx$/i.test(file.filename || '')) throw badRequest('Only .xlsx files are supported');
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw badRequest('File too large');
    let parsed;
    try {
      parsed = await parseWorkbook(db, buffer);
    } catch {
      throw badRequest('That file could not be read. Re-download the template and try again.');
    }
    if (parsed.fatal) throw badRequest(parsed.fatal);
    const batchId = Number(
      db.prepare('INSERT INTO import_batches(admin_id, payload) VALUES(?,?)').run(req.admin.id, JSON.stringify(parsed.rows)).lastInsertRowid,
    );
    return {
      batchId,
      summary: {
        valid: parsed.rows.length,
        errors: parsed.errors.length,
        duplicates: parsed.rows.filter((r) => r.duplicateOf).length,
        newCities: [...new Set(parsed.rows.filter((r) => !r.input.cityId).map((r) => `${r.cityName}, ${r.cityState}`))],
      },
      unknownHeaders: parsed.unknownHeaders,
      errors: parsed.errors.slice(0, 200),
      preview: parsed.rows.slice(0, 50).map((r) => ({
        row: r.row, fullName: r.input.fullName, phone: r.input.phone, city: r.cityName, categories: r.input.categoryIds.length, headline: r.input.headline,
        duplicateOf: r.duplicateOf?.publicId ?? null,
      })),
    };
  });

  app.post('/artists/import/:batchId/commit', async (req) => {
    const { onDuplicate } = z.object({ onDuplicate: z.enum(['skip', 'update']).default('skip') }).parse(req.body ?? {});
    const batch = db.prepare('SELECT * FROM import_batches WHERE id = ? AND admin_id = ?').get(Number(req.params.batchId), req.admin.id);
    if (!batch) throw notFound('Import not found. Upload the file again.');
    if (batch.committed_at) throw badRequest('This import was already applied.');
    const rows = JSON.parse(batch.payload);
    const result = { created: 0, updated: 0, skipped: 0, failed: [] };
    for (const r of rows) {
      try {
        const input = artistInput.parse({ ...r.input, cityId: null });
        input.cityId = db.transaction(() => findOrCreateCity(db, r.cityName, r.cityState))();
        // Re-check the duplicate now: another admin may have added the phone since the preview.
        const existing = db.prepare('SELECT id FROM artists WHERE phone = ?').get(input.phone);
        if (existing) {
          if (onDuplicate === 'skip') { result.skipped++; continue; }
          saveArtist(db, existing.id, input, req.admin.id);
          result.updated++;
        } else {
          saveArtist(db, null, input, req.admin.id);
          result.created++;
        }
      } catch (e) {
        result.failed.push({ row: r.row, name: r.input.fullName, error: e.message });
      }
    }
    db.prepare(`UPDATE import_batches SET committed_at = datetime('now'), payload = '[]' WHERE id = ?`).run(batch.id);
    audit(db, req.admin.id, 'artists.import', 'import', batch.id, { ...result, failed: result.failed.length });
    return result;
  });
}
