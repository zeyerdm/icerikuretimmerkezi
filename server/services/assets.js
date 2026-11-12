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
  inspiration: 'İlham rafı',
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

// @ ile anma için etiketin sade hâli (Türkçe harfler sadeleşir, boşluk → tire); etiket yoksa kimliğin başı
export const REF_ROLES = { kimlik: 'Kimlik (karakter)', nesne: 'Nesne / ürün', stil: 'Stil' };
const TRM = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
export function mentionOf(label, id) {
  const s = String(label || '').replace(/[çğıİöşüÇĞÖŞÜ]/g, c => TRM[c]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return s || 'gorsel-' + String(id).slice(0, 6);
}

const toAsset = r => ({
  id: r.id, category: r.category, categoryLabel: ASSET_CATEGORIES[r.category] || r.category,
  label: r.label, mime: r.mime, size: r.size, createdAt: r.created_at, driveUrl: r.drive_url || '',
  pack: r.pack || '', tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
  refRole: r.ref_role || '', mention: mentionOf(r.label, r.id),
  ocrText: r.ocr_text || '', analyzedAt: r.analyzed_at || null,
  url: `/api/brands/${r.brand_id}/assets/${r.id}/file`,
  // 8.10: ızgaralar küçük resmi kullanır; yoksa asıl dosya. Büyük durağan görsellerin küçük resmi tarayıcıda bir kez üretilir.
  thumbUrl: r.thumb ? `/api/brands/${r.brand_id}/assets/${r.id}/thumb` : `/api/brands/${r.brand_id}/assets/${r.id}/file`,
  needsThumb: !r.thumb && r.size > THUMB_MIN_BYTES && /^image\/(png|jpeg|webp)$/.test(r.mime)
});

// Paket adı tek satır; etiketler küçük harfli, tekrarsız, virgülle saklanır
const cleanPack = v => String(v || '').replace(/[\r\n,]+/g, ' ').trim().slice(0, 60);
const cleanTags = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(','))
  .map(t => String(t).trim().toLocaleLowerCase('tr-TR').replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 12).join(',');
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
export const THUMB_MIN_BYTES = 150 * 1024; // daha küçük dosyada küçük resme gerek yok
export const MAX_THUMB_BYTES = 200 * 1024;
export const MAX_PACK_BYTES = 60 * 1024 * 1024;
const MAX_PACK_FILES = 200;

export function createAssetService(db, uploadDir) {
  const brandDir = brandId => path.join(uploadDir, brandId);
  const filePath = row => path.join(brandDir(row.brand_id), row.file_name);
  const thumbPath = row => path.join(brandDir(row.brand_id), '.thumbs', `${row.id}.img`);
  const stashPath = row => path.join(brandDir(row.brand_id), '.trash', path.basename(row.file_name));
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
      const refRole = 'refRole' in body ? (body.refRole ? oneOf(body.refRole, Object.keys(REF_ROLES), 'Referans rolü') : '') : (row.ref_role || '');
      db.prepare('UPDATE assets SET label = ?, category = ?, pack = ?, tags = ?, ref_role = ? WHERE id = ? AND brand_id = ?').run(label, category, pack, tags, refRole, row.id, brandId);
      return toAsset(Object.assign(row, { label, category, pack, tags, ref_role: refRole }));
    },

    // stash: dosya silinmez, markanın .trash klasörüne taşınır (8.7 çöp kutusu; 30 gün içinde geri alınabilir)
    remove(brandId, assetId, { stash = false } = {}) {
      const row = getRow(brandId, assetId);
      db.prepare('DELETE FROM assets WHERE id = ? AND brand_id = ?').run(row.id, brandId);
      fs.rmSync(thumbPath(row), { force: true }); // geri alınırsa küçük resim yeniden üretilir
      if (stash && fs.existsSync(filePath(row))) {
        fs.mkdirSync(path.dirname(stashPath(row)), { recursive: true });
        fs.renameSync(filePath(row), stashPath(row));
      } else fs.rmSync(filePath(row), { force: true });
    },
    // Çöp kutusu kancaları: geri alınca dosya yerine döner; kalıcı silinince saklanan dosya da silinir
    trashHooks: {
      restore(row) {
        if (!fs.existsSync(stashPath(row))) throw badRequest('Görselin dosyası bulunamadı; geri alınamaz.');
        fs.mkdirSync(brandDir(row.brand_id), { recursive: true });
        fs.renameSync(stashPath(row), filePath(row));
        row.thumb = 0; // küçük resim silmede kaldırıldı; tarayıcı yeniden üretir
      },
      undo(row) { if (fs.existsSync(filePath(row))) { fs.mkdirSync(path.dirname(stashPath(row)), { recursive: true }); fs.renameSync(filePath(row), stashPath(row)); } },
      drop(row) { fs.rmSync(stashPath(row), { force: true }); }
    },

    // 8.10 küçük resim: tarayıcı üretir (canvas), sunucu biçimini ve boyutunu denetleyip saklar
    saveThumb(brandId, assetId, buffer) {
      const row = getRow(brandId, assetId);
      const kind = Buffer.isBuffer(buffer) ? detectImage(buffer) : null;
      if (!kind || kind.mime === 'image/gif') throw badRequest('Küçük resim PNG, JPEG ya da WebP olmalı.');
      if (buffer.length > MAX_THUMB_BYTES) throw badRequest('Küçük resim en çok 200 KB olabilir.');
      fs.mkdirSync(path.dirname(thumbPath(row)), { recursive: true });
      fs.writeFileSync(thumbPath(row), buffer);
      db.prepare('UPDATE assets SET thumb = 1 WHERE id = ?').run(row.id);
      return toAsset(Object.assign(row, { thumb: 1 }));
    },
    thumb(brandId, assetId) {
      const row = getRow(brandId, assetId);
      const p = thumbPath(row);
      if (!row.thumb || !fs.existsSync(p)) return { path: filePath(row), mime: row.mime, fallback: true };
      const kind = detectImage(fs.readFileSync(p).subarray(0, 16));
      return { path: p, mime: kind ? kind.mime : 'image/webp', fallback: false };
    },

    file(brandId, assetId) {
      const row = getRow(brandId, assetId);
      return { path: filePath(row), mime: row.mime, label: row.label, category: row.category, ext: path.extname(row.file_name) };
    },

    // AI okuması sonucu: yazı kaydedilir, etiketler mevcutlara eklenir (en fazla 12), ad boşsa önerilen ad kullanılır
    saveAnalysis(brandId, assetId, { ocrText = '', tags = [], label = '' }) {
      const row = getRow(brandId, assetId);
      const merged = cleanTags([...(row.tags ? row.tags.split(',') : []), ...tags]);
      const newLabel = row.label ? row.label : text(label, { field: 'Etiket', max: 80 });
      const at = now();
      const ocr = String(ocrText || '').slice(0, 2000);
      db.prepare('UPDATE assets SET ocr_text = ?, tags = ?, label = ?, analyzed_at = ? WHERE id = ? AND brand_id = ?').run(ocr, merged, newLabel, at, row.id, brandId);
      return toAsset(Object.assign(row, { ocr_text: ocr, tags: merged, label: newLabel, analyzed_at: at }));
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

    packIds(brandId, pack) {
      const ids = db.prepare('SELECT id FROM assets WHERE brand_id = ? AND pack = ?').all(brandId, cleanPack(pack)).map(r => r.id);
      if (!ids.length) throw notFound('Paket bulunamadı.');
      return ids;
    },
    removeBrandFiles(brandId) {
      fs.rmSync(brandDir(brandId), { recursive: true, force: true });
    }
  };
}
