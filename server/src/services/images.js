import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const privateDir = (dataDir) => path.join(dataDir, 'private');
export const publicDir = (dataDir) => path.join(dataDir, 'public');

/**
 * Takes an uploaded photo and produces:
 *  - a normalised private original (EXIF stripped, max 1600px) for admins only
 *  - a heavily pre-blurred public derivative under a random key
 * The public file is blurred on the server, so the real photo never reaches a browser.
 */
export async function processArtistPhoto(buffer, dataDir) {
  fs.mkdirSync(privateDir(dataDir), { recursive: true });
  fs.mkdirSync(publicDir(dataDir), { recursive: true });

  const base = sharp(buffer, { failOn: 'error' }).rotate(); // honour EXIF orientation, then drop metadata
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw Object.assign(new Error('Not a valid image'), { statusCode: 400 });

  const privateName = `${crypto.randomUUID()}.jpg`;
  await base.clone().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(path.join(privateDir(dataDir), privateName));

  // Shrink to a tiny thumbnail, then scale back up with smoothing: detail is destroyed, not just hidden.
  const tiny = await base.clone().resize(18, 18, { fit: 'cover' }).modulate({ saturation: 1.1 }).toBuffer();
  const publicKey = crypto.randomBytes(12).toString('hex');
  await sharp(tiny)
    .resize(240, 240, { kernel: 'cubic' })
    .blur(7)
    .jpeg({ quality: 62 })
    .toFile(path.join(publicDir(dataDir), `${publicKey}.jpg`));

  return { privateName, publicKey };
}

export function deletePhotoFiles(dataDir, { privateName, publicKey }) {
  for (const f of [privateName && path.join(privateDir(dataDir), privateName), publicKey && path.join(publicDir(dataDir), `${publicKey}.jpg`)]) {
    if (f) fs.rmSync(f, { force: true });
  }
}
