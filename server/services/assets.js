// Marka varlık kütüphanesi: logo, maskot pozları, sticker, görseller...
// Dosyalar marka klasörüne rastgele adla kaydedilir; tür, uzantıya değil dosyanın ilk baytlarına göre doğrulanır.
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound, newId, now, text, oneOf } from '../lib/http.js';

export const ASSET_CATEGORIES = {
  logo: 'Logo',
  mascot: 'Maskot pozu',
  brand_image: 'Marka görseli',
  product: 'Ürün fotoğrafı',
  sticker: 'Sticker',
  illustration: 'İllüstrasyon',
  background: 'Arka plan',
  reference: 'Tasarım referansı',
  other: 'Diğer'
};

export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

// SVG kabul edilmez: içine betik gömülebilir
const SIGNATURES = [
  { mime: 'image/png', ext: 'png', test: b => b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG' },
  { mime: 'image/jpeg', ext: 'jpg', test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', ext: 'gif', test: b => b.length > 6 && /^GIF8[79]a$/.test(b.toString('ascii', 0, 6)) },
  { mime: 'image/webp', ext: 'webp', test: b => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
];

export function detectImage(buffer) {
  return SIGNATURES.find(s => s.test(buffer)) || null;
}

const toAsset = r => ({
  id: r.id, category: r.category, categoryLabel: ASSET_CATEGORIES[r.category] || r.category,
  label: r.label, mime: r.mime, size: r.size, createdAt: r.created_at,
  url: `/api/brands/${r.brand_id}/assets/${r.id}/file`
});

export function createAssetService(db, uploadDir) {
  const brandDir = brandId => path.join(uploadDir, brandId);
  const filePath = row => path.join(brandDir(row.brand_id), row.file_name);
  const getRow = (brandId, assetId) => {
    const row = db.prepare('SELECT * FROM assets WHERE id = ? AND brand_id = ?').get(String(assetId), brandId);
    if (!row) throw notFound('Dosya bulunamadı.');
    return row;
  };

  return {
    list(brandId, category) {
      const rows = category
        ? db.prepare('SELECT * FROM assets WHERE brand_id = ? AND category = ? ORDER BY created_at DESC').all(brandId, category)
        : db.prepare('SELECT * FROM assets WHERE brand_id = ? ORDER BY created_at DESC').all(brandId);
      return rows.map(toAsset);
    },

    create(brandId, { buffer, category, label }) {
      oneOf(category, Object.keys(ASSET_CATEGORIES), 'Kategori');
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw badRequest('Dosya boş.');
      if (buffer.length > MAX_ASSET_BYTES) throw badRequest('Dosya en fazla 10 MB olabilir.');
      const kind = detectImage(buffer);
      if (!kind) throw badRequest('Yalnızca PNG, JPEG, WEBP veya GIF görselleri yüklenebilir.');
      const id = newId();
      const fileName = `${id}.${kind.ext}`;
      fs.mkdirSync(brandDir(brandId), { recursive: true });
      fs.writeFileSync(path.join(brandDir(brandId), fileName), buffer);
      const row = { id, brand_id: brandId, category, label: text(label, { field: 'Etiket', max: 80 }), file_name: fileName, mime: kind.mime, size: buffer.length, created_at: now() };
      db.prepare('INSERT INTO assets (id, brand_id, category, label, file_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(row.id, row.brand_id, row.category, row.label, row.file_name, row.mime, row.size, row.created_at);
      return toAsset(row);
    },

    update(brandId, assetId, body) {
      const row = getRow(brandId, assetId);
      const label = 'label' in body ? text(body.label, { field: 'Etiket', max: 80 }) : row.label;
      const category = 'category' in body ? oneOf(body.category, Object.keys(ASSET_CATEGORIES), 'Kategori') : row.category;
      db.prepare('UPDATE assets SET label = ?, category = ? WHERE id = ? AND brand_id = ?').run(label, category, row.id, brandId);
      return toAsset(Object.assign(row, { label, category }));
    },

    remove(brandId, assetId) {
      const row = getRow(brandId, assetId);
      db.prepare('DELETE FROM assets WHERE id = ? AND brand_id = ?').run(row.id, brandId);
      fs.rmSync(filePath(row), { force: true });
    },

    file(brandId, assetId) {
      const row = getRow(brandId, assetId);
      return { path: filePath(row), mime: row.mime };
    },

    removeBrandFiles(brandId) {
      fs.rmSync(brandDir(brandId), { recursive: true, force: true });
    }
  };
}
