// Global öğe kütüphanesi (yönetim paneli): bütün markalarda kullanılabilen, yüklenmiş SVG/PNG/WebP/GIF öğeler.
// Her öğede lisans bilgisi zorunludur; lisans süzgeci ticari ve kapalı kaynak üründe kullanılamayacak lisansları
// (paylaşım zorunluluğu, ticari kullanım yasağı, bilinmeyen lisans) reddeder. SVG'ler güvenlik süzgecinden geçer
// ve veritabanında saklanır; görseller dataDir/elements klasörüne rastgele adla kaydedilir.
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound, newId, now, text, oneOf } from '../lib/http.js';
import { detectImage } from './assets.js';
import { safeSvg } from './posts.js';
import { readZip, ZipError } from '../lib/zip.js';

export const ELEMENT_CATEGORIES = {
  sekiller: 'Şekiller', oklar: 'Oklar', cizgiler: 'Çizgiler', cerceveler: 'Çerçeveler', balonlar: 'Konuşma balonları', etiketler: 'Etiketler ve rozetler',
  susler: 'Dekoratif süsler', desenler: 'Desenler ve dokular', ikonlar: 'İkonlar', illustrasyon: 'İllüstrasyonlar', karakterler: 'İnsanlar ve karakterler',
  cikartmalar: 'Çıkartmalar', sosyal: 'Sosyal medya', diger: 'Diğer'
};
// Kabul edilen lisanslar (attribution: kaynak gösterme zorunlu mu)
export const ELEMENT_LICENSES = {
  'CC0-1.0': { title: 'CC0 1.0 (kamu malı)', attribution: false },
  'LicenseRef-own': { title: 'Kendi çizimimiz / bize ait', attribution: false },
  'LicenseRef-purchased': { title: 'Satın alınmış ticari lisans', attribution: false },
  'LicenseRef-free-commercial': { title: 'Ücretsiz, ticari kullanım serbest, atıf gerekmez', attribution: false },
  MIT: { title: 'MIT', attribution: true },
  'Apache-2.0': { title: 'Apache 2.0', attribution: true },
  ISC: { title: 'ISC', attribution: true },
  'CC-BY-4.0': { title: 'CC BY 4.0 (atıf zorunlu)', attribution: true },
  'OFL-1.1': { title: 'SIL Open Font License 1.1', attribution: true }
};
// Açıkça reddedilenler: neden kullanılamadığı kullanıcıya söylenir
const REJECTED = {
  'CC-BY-SA': 'CC BY-SA, türev çalışmanın aynı lisansla paylaşılmasını ister.',
  'CC-BY-NC': 'CC BY-NC ticari kullanımı yasaklar.',
  'CC-BY-ND': 'CC BY-ND değiştirmeyi (renk, boyut) yasaklar.',
  GPL: 'GPL/AGPL kapalı kaynak üründe kaynak açma yükümlülüğü doğurur.',
  AGPL: 'GPL/AGPL kapalı kaynak üründe kaynak açma yükümlülüğü doğurur.',
  unknown: 'Lisansı bilinmeyen öğe eklenemez.'
};
export const MAX_ELEMENT_BYTES = 2 * 1024 * 1024;
const MAX_ZIP_BYTES = 30 * 1024 * 1024;
const MAX_ZIP_FILES = 500;

const cleanTags = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(','))
  .map(t => String(t).trim().toLocaleLowerCase('tr-TR').replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 20);

function license(o = {}) {
  const spdx = String(o.license || '').trim();
  if (!spdx) throw badRequest('Lisans seçmeden öğe eklenemez.');
  const rej = Object.keys(REJECTED).find(k => spdx.toUpperCase().startsWith(k.toUpperCase()));
  if (rej) throw badRequest(`Bu lisans kullanılamaz: ${REJECTED[rej]}`);
  const lic = ELEMENT_LICENSES[spdx];
  if (!lic) throw badRequest('Lisans listede yok. Ticari kullanıma uygun lisanslardan birini seç.');
  const author = text(o.author, { field: 'Hak sahibi', max: 120 });
  const attribution = text(o.attribution, { field: 'Atıf metni', max: 300 });
  if (lic.attribution && !author && !attribution) throw badRequest(`${lic.title} lisansı hak sahibinin adını ister. "Hak sahibi" ya da "Atıf metni" alanını doldur.`);
  const sourceUrl = text(o.sourceUrl, { field: 'Kaynak adresi', max: 400 });
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw badRequest('Kaynak adresi http(s):// ile başlamalı.');
  return { spdx, author, attribution, sourceUrl };
}

// SVG: güvenlik süzgeci, görünüm kutusu ve tek renkse renk değiştirilebilir hâle getirme
export function prepareSvg(raw) {
  let svg = String(raw || '').replace(/^﻿/, '').replace(/<\?xml[^>]*\?>/i, '').replace(/<!DOCTYPE[^>]*>/i, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  svg = safeSvg(svg);
  if (!svg) throw badRequest('SVG güvenlik denetiminden geçmedi (betik, dış bağlantı ya da gömülü belge içeriyor) ya da 100 KB\'tan büyük.');
  const open = svg.match(/<svg\b[^>]*>/i)[0];
  let vb = (open.match(/viewBox="([^"]+)"/i) || [])[1];
  if (!vb) {
    const w = parseFloat((open.match(/\swidth="([\d.]+)/) || [])[1]) || 100; const h = parseFloat((open.match(/\sheight="([\d.]+)/) || [])[1]) || 100;
    vb = `0 0 ${w} ${h}`;
    svg = svg.replace(/<svg\b/i, `<svg viewBox="${vb}"`);
  }
  if (!/xmlns=/.test(open)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const colors = new Set((svg.match(/(?:fill|stroke)\s*[=:]\s*"?\s*(#[0-9a-f]{3,8}|black|currentColor)\b/gi) || []).map(m => m.split(/[=:]/)[1].replace(/["\s]/g, '').toLowerCase()));
  colors.delete('currentcolor');
  let recolor = /currentColor/.test(svg);
  if (colors.size === 1 && ![...colors][0].match(/^#fff(fff)?$/)) {
    const c = [...colors][0].replace('#', '\\#');
    svg = svg.replace(new RegExp(`((?:fill|stroke)\\s*[=:]\\s*"?\\s*)${c}\\b`, 'gi'), '$1currentColor');
    recolor = true;
  } else if (!colors.size && !/fill=|stroke=/.test(svg)) { // renksiz çizim varsayılan siyahla boyanır
    svg = svg.replace(/<svg\b/i, '<svg fill="currentColor"'); recolor = true;
  }
  return { svg, viewBox: vb, recolor };
}

function rasterSize(b, mime) {
  try {
    if (mime === 'image/png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (mime === 'image/gif') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (mime === 'image/webp') {
      const kind = b.toString('ascii', 12, 16);
      if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }; }
      if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    }
  } catch { /* ölçü okunamadı */ }
  return { w: 300, h: 300 };
}

export function createElementService(db, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const toEl = r => ({
    id: r.id, name: r.name, category: r.category, categoryLabel: ELEMENT_CATEGORIES[r.category] || r.category, tags: JSON.parse(r.tags || '[]'), kind: r.kind,
    svg: r.kind === 'svg' ? r.svg : null, url: `/api/elements/${r.id}/file`, viewBox: r.view_box, recolor: !!r.recolor, width: r.width, height: r.height,
    license: r.license, licenseTitle: (ELEMENT_LICENSES[r.license] || {}).title || r.license, author: r.author, attribution: r.attribution, sourceUrl: r.source_url,
    pack: r.pack, published: !!r.published, size: r.size, createdAt: r.created_at, updatedAt: r.updated_at
  });
  const get = id => { const r = db.prepare('SELECT * FROM elements WHERE id = ?').get(String(id)); if (!r) throw notFound('Öğe bulunamadı.'); return r; };

  function insert(buffer, meta, lic) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw badRequest('Dosya boş.');
    if (buffer.length > MAX_ELEMENT_BYTES) throw badRequest('Öğe dosyası en fazla 2 MB olabilir.');
    const id = newId(); const t = now();
    const name = text(meta.name, { field: 'Ad', max: 80, required: true });
    const category = oneOf(String(meta.category || 'diger'), Object.keys(ELEMENT_CATEGORIES), 'Kategori');
    const base = { id, name, category, tags: JSON.stringify(cleanTags(meta.tags)), pack: text(meta.pack, { field: 'Paket', max: 60 }), published: meta.published === false || meta.published === '0' ? 0 : 1 };
    const head = buffer.subarray(0, 512).toString('utf8').trimStart();
    if (/^(<\?xml|<svg|<!--|<!DOCTYPE svg)/i.test(head)) {
      const p = prepareSvg(buffer.toString('utf8'));
      db.prepare('INSERT INTO elements (id, name, category, tags, kind, svg, file, view_box, recolor, width, height, size, license, author, attribution, source_url, pack, published, created_at, updated_at) VALUES (?, ?, ?, ?, \'svg\', ?, \'\', ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, base.name, base.category, base.tags, p.svg, p.viewBox, p.recolor ? 1 : 0, Buffer.byteLength(p.svg), lic.spdx, lic.author, lic.attribution, lic.sourceUrl, base.pack, base.published, t, t);
    } else {
      const type = detectImage(buffer);
      if (!type || type.mime === 'image/jpeg') throw badRequest('Desteklenen biçimler: SVG, PNG, WebP, GIF.');
      const file = `${id}.${type.ext}`;
      fs.writeFileSync(path.join(dir, file), buffer);
      const { w, h } = rasterSize(buffer, type.mime);
      db.prepare('INSERT INTO elements (id, name, category, tags, kind, svg, file, view_box, recolor, width, height, size, license, author, attribution, source_url, pack, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'\', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, base.name, base.category, base.tags, type.ext, file, `0 0 ${w} ${h}`, w, h, buffer.length, lic.spdx, lic.author, lic.attribution, lic.sourceUrl, base.pack, base.published, t, t);
    }
    return toEl(get(id));
  }

  return {
    categories: ELEMENT_CATEGORIES, licenses: ELEMENT_LICENSES,
    list({ all = false } = {}) { return db.prepare(`SELECT * FROM elements ${all ? '' : 'WHERE published = 1'} ORDER BY created_at DESC, rowid DESC`).all().map(toEl); },
    create(buffer, meta = {}) { return insert(buffer, meta, license(meta)); },
    // ZIP ile toplu içe aktarma: .svg/.png/.webp/.gif dosyaları; isteğe bağlı elements.json [{ file, name, tags, category }]
    importZip(buffer, meta = {}) {
      if (!Buffer.isBuffer(buffer) || buffer.length > MAX_ZIP_BYTES) throw badRequest('ZIP en fazla 30 MB olabilir.');
      const lic = license(meta);
      let entries;
      try { entries = readZip(buffer, { maxEntries: MAX_ZIP_FILES * 2, maxTotal: 200 * 1024 * 1024 }); } catch (err) { if (err instanceof ZipError) throw badRequest(err.message); throw err; }
      const manifestEntry = entries.find(e => /(^|\/)elements\.json$/i.test(e.name));
      let manifest = [];
      if (manifestEntry) { try { manifest = JSON.parse(manifestEntry.data.toString('utf8')); } catch { throw badRequest('elements.json okunamadı (geçerli JSON değil).'); } }
      const byFile = new Map((Array.isArray(manifest) ? manifest : []).map(m => [String(m.file || '').toLowerCase(), m]));
      const files = entries.filter(e => /\.(svg|png|webp|gif)$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name)).slice(0, MAX_ZIP_FILES);
      if (!files.length) throw badRequest('ZIP içinde SVG, PNG, WebP ya da GIF dosyası yok.');
      const added = []; const failed = [];
      for (const f of files) {
        const baseName = f.name.split('/').pop();
        const folder = f.name.includes('/') ? f.name.split('/').slice(-2, -1)[0] : '';
        const m = byFile.get(baseName.toLowerCase()) || byFile.get(f.name.toLowerCase()) || {};
        const cat = Object.keys(ELEMENT_CATEGORIES).includes(m.category) ? m.category : Object.keys(ELEMENT_CATEGORIES).includes(folder) ? folder : (meta.category || 'diger');
        const name = m.name || baseName.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || 'Öğe';
        try { added.push(insert(f.data, { name, category: cat, tags: [...cleanTags(meta.tags), ...cleanTags(m.tags)], pack: meta.pack, published: meta.published }, lic)); }
        catch (err) { failed.push({ file: f.name, reason: err.message }); }
      }
      return { added: added.length, failed, elements: added };
    },
    update(id, o = {}) {
      const r = get(id);
      const lic = o.license !== undefined ? license({ license: o.license, author: o.author ?? r.author, attribution: o.attribution ?? r.attribution, sourceUrl: o.sourceUrl ?? r.source_url }) : null;
      const name = o.name !== undefined ? text(o.name, { field: 'Ad', max: 80, required: true }) : r.name;
      const category = o.category !== undefined ? oneOf(String(o.category), Object.keys(ELEMENT_CATEGORIES), 'Kategori') : r.category;
      const tags = o.tags !== undefined ? JSON.stringify(cleanTags(o.tags)) : r.tags;
      const pack = o.pack !== undefined ? text(o.pack, { field: 'Paket', max: 60 }) : r.pack;
      const published = o.published !== undefined ? (o.published ? 1 : 0) : r.published;
      const recolor = o.recolor !== undefined && r.kind === 'svg' ? (o.recolor ? 1 : 0) : r.recolor;
      db.prepare('UPDATE elements SET name = ?, category = ?, tags = ?, pack = ?, published = ?, recolor = ?, license = ?, author = ?, attribution = ?, source_url = ?, updated_at = ? WHERE id = ?')
        .run(name, category, tags, pack, published, recolor, lic ? lic.spdx : r.license, lic ? lic.author : r.author, lic ? lic.attribution : r.attribution, lic ? lic.sourceUrl : r.source_url, now(), r.id);
      return toEl(get(r.id));
    },
    // Paket işlemleri: bir paketin bütün öğelerini yayımla / gizle / sil
    packAction(pack, action) {
      const p = String(pack || '');
      if (action === 'publish' || action === 'hide') return { changed: db.prepare('UPDATE elements SET published = ?, updated_at = ? WHERE pack = ?').run(action === 'publish' ? 1 : 0, now(), p).changes };
      if (action === 'delete') { const rows = db.prepare('SELECT id FROM elements WHERE pack = ?').all(p); rows.forEach(x => this.remove(x.id)); return { removed: rows.length }; }
      throw badRequest('Geçersiz paket işlemi.');
    },
    remove(id) {
      const r = get(id);
      if (r.file) { try { fs.unlinkSync(path.join(dir, r.file)); } catch { /* dosya zaten yok */ } }
      db.prepare('DELETE FROM elements WHERE id = ?').run(r.id);
      return { ok: true };
    },
    file(id) {
      const r = get(id);
      if (!r.published) throw notFound('Öğe bulunamadı.');
      if (r.kind === 'svg') return { svg: r.svg, mime: 'image/svg+xml' };
      return { path: path.join(dir, r.file), mime: { png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[r.kind] };
    },
    // Lisans özeti (lisanslar sayfası): yüklenen öğeler lisans ve hak sahibine göre gruplanır
    licenseSummary() {
      return db.prepare('SELECT license, author, attribution, source_url, pack, COUNT(*) AS n FROM elements GROUP BY license, author, attribution, source_url, pack ORDER BY n DESC').all()
        .map(r => ({ license: r.license, licenseTitle: (ELEMENT_LICENSES[r.license] || {}).title || r.license, author: r.author, attribution: r.attribution, sourceUrl: r.source_url, pack: r.pack, count: r.n }));
    }
  };
}
