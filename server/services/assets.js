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
  ai_image: 'AI görseli',
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
  label: r.label, mime: r.mime, size: r.size, createdAt: r.created_at, driveUrl: r.drive_url || '',
  pack: r.pack || '', tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
  url: `/api/brands/${r.brand_id}/assets/${r.id}/file`
});

// Paket adı tek satır; etiketler küçük harfli, tekrarsız, virgülle saklanır
const cleanPack = v => String(v || '').replace(/[\r\n,]+/g, ' ').trim().slice(0, 60);
const cleanTags = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(','))
  .map(t => String(t).trim().toLocaleLowerCase('tr-TR').replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 12).join(',');
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
export const MAX_PACK_BYTES = 60 * 1024 * 1024;
const MAX_PACK_FILES = 200;

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

    create(brandId, { buffer, category, label, pack = '', tags = '' }) {
      oneOf(category, Object.keys(ASSET_CATEGORIES), 'Kategori');
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw badRequest('Dosya boş.');
      if (buffer.length > MAX_ASSET_BYTES) throw badRequest('Dosya en fazla 10 MB olabilir.');
      const kind = detectImage(buffer);
      if (!kind) throw badRequest('Yalnızca PNG, JPEG, WEBP veya GIF görselleri yüklenebilir.');
      const id = newId();
      const fileName = `${id}.${kind.ext}`;
      fs.mkdirSync(brandDir(brandId), { recursive: true });
      fs.writeFileSync(path.join(brandDir(brandId), fileName), buffer);
      const row = { id, brand_id: brandId, category, label: text(label, { field: 'Etiket', max: 80 }), file_name: fileName, mime: kind.mime, size: buffer.length, created_at: now(), pack: cleanPack(pack), tags: cleanTags(tags) };
      db.prepare('INSERT INTO assets (id, brand_id, category, label, file_name, mime, size, created_at, pack, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(row.id, row.brand_id, row.category, row.label, row.file_name, row.mime, row.size, row.created_at, row.pack, row.tags);
      return toAsset(row);
    },

    update(brandId, assetId, body) {
      const row = getRow(brandId, assetId);
      const label = 'label' in body ? text(body.label, { field: 'Etiket', max: 80 }) : row.label;
      const category = 'category' in body ? oneOf(body.category, Object.keys(ASSET_CATEGORIES), 'Kategori') : row.category;
      const pack = 'pack' in body ? cleanPack(body.pack) : (row.pack || '');
      const tags = 'tags' in body ? cleanTags(body.tags) : (row.tags || '');
      db.prepare('UPDATE assets SET label = ?, category = ?, pack = ?, tags = ? WHERE id = ? AND brand_id = ?').run(label, category, pack, tags, row.id, brandId);
      return toAsset(Object.assign(row, { label, category, pack, tags }));
    },

    remove(brandId, assetId) {
      const row = getRow(brandId, assetId);
      db.prepare('DELETE FROM assets WHERE id = ? AND brand_id = ?').run(row.id, brandId);
      fs.rmSync(filePath(row), { force: true });
    },

    file(brandId, assetId) {
      const row = getRow(brandId, assetId);
      return { path: filePath(row), mime: row.mime, label: row.label, category: row.category, ext: path.extname(row.file_name) };
    },

    setDriveUrl(brandId, assetId, url) {
      const row = getRow(brandId, assetId);
      db.prepare('UPDATE assets SET drive_url = ? WHERE id = ? AND brand_id = ?').run(url, row.id, brandId);
      return toAsset(Object.assign(row, { drive_url: url }));
    },

    // ZIP paketinden toplu yükleme: yalnızca görseller alınır (klasör yolları, gizli dosyalar ve diğer türler atlanır).
    // Dosya adı etiket olur; alt klasör adı (varsa) etikete eklenir. Geçersiz görseller atlanır, sayısı bildirilir.
    importPack(brandId, { entries, category, pack }) {
      oneOf(category, Object.keys(ASSET_CATEGORIES), 'Kategori');
      const name = cleanPack(pack);
      if (!name) throw badRequest('Paket adı zorunlu.');
      const images = entries.filter(e => IMAGE_EXT.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name));
      if (!images.length) throw badRequest('Arşivde PNG, JPEG, WEBP ya da GIF görsel bulunamadı.');
      if (images.length > MAX_PACK_FILES) throw badRequest(`Bir pakette en fazla ${MAX_PACK_FILES} görsel olabilir.`);
      const added = [];
      let skipped = 0;
      for (const e of images) {
        const parts = e.name.split('/');
        const base = parts.pop().replace(IMAGE_EXT, '').replace(/[_-]+/g, ' ').trim();
        const folder = parts.filter(Boolean).pop();
        try { added.push(this.create(brandId, { buffer: e.data, category, label: base.slice(0, 80), pack: name, tags: folder || '' })); } catch { skipped++; }
      }
      return { added, skipped: skipped + (entries.length - images.length) };
    },

    packs(brandId) {
      return db.prepare("SELECT pack, category, COUNT(*) AS count FROM assets WHERE brand_id = ? AND pack <> '' GROUP BY pack, category ORDER BY pack").all(brandId)
        .map(r => ({ name: r.pack, category: r.category, count: r.count }));
    },

    removePack(brandId, pack) {
      const rows = db.prepare('SELECT * FROM assets WHERE brand_id = ? AND pack = ?').all(brandId, cleanPack(pack));
      if (!rows.length) throw notFound('Paket bulunamadı.');
      db.prepare('DELETE FROM assets WHERE brand_id = ? AND pack = ?').run(brandId, cleanPack(pack));
      rows.forEach(r => fs.rmSync(filePath(r), { force: true }));
      return rows.length;
    },

    removeBrandFiles(brandId) {
      fs.rmSync(brandDir(brandId), { recursive: true, force: true });
    }
  };
}
