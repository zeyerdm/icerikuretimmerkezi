// 8.12 Instagram sonuçlarını içe aktarma: Meta (Business Suite / Instagram) "İstatistikler" CSV dışa aktarımı yüklenir,
// satırlar markanın takvimdeki içerikleriyle tarih ve metin benzerliğine göre eşleştirilir; kullanıcı onaylayınca
// metrikler içeriklere yazılır. API bağlantısı istemez. Sütun adları İngilizce ve Türkçe dışa aktarımlardan tanınır.
import { badRequest } from '../lib/http.js';

const fold = s => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();

// Alan → olası sütun adları (sadeleştirilmiş)
const ALIASES = {
  date: ['publish time', 'published', 'date', 'yayinlanma zamani', 'yayin zamani', 'yayinlanma tarihi', 'tarih', 'olusturulma zamani'],
  caption: ['description', 'caption', 'aciklama', 'gonderi metni', 'baslik'],
  permalink: ['permalink', 'link', 'kalici baglanti', 'baglanti'],
  postType: ['post type', 'type', 'gonderi turu', 'tur'],
  views: ['views', 'impressions', 'plays', 'goruntulemeler', 'goruntuleme', 'gosterimler', 'gosterim', 'oynatmalar'],
  reach: ['reach', 'accounts reached', 'erisim', 'erisilen hesaplar'],
  likes: ['likes', 'begenmeler', 'begeni', 'begenme', 'begeniler'],
  comments: ['comments', 'yorumlar', 'yorum'],
  saves: ['saves', 'kaydetmeler', 'kaydetme', 'kaydedilenler'],
  shares: ['shares', 'paylasimlar', 'paylasim'],
  follows: ['follows', 'takipler', 'takip', 'yeni takipciler']
};
export const METRIC_KEYS = ['views', 'reach', 'likes', 'comments', 'saves', 'shares', 'follows'];

// RFC 4180 benzeri ayrıştırıcı: BOM, tırnak, satır içi yeni satır; ayraç ilk satırdan seçilir (, ; sekme)
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

export function mapColumns(header) {
  const h = header.map(fold);
  const out = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const exact = h.findIndex(x => names.includes(x));
    const idx = exact >= 0 ? exact : h.findIndex(x => names.some(n => n.length > 3 && x.startsWith(n)));
    if (idx >= 0 && !Object.values(out).includes(idx)) out[key] = idx;
  }
  return out;
}

// Sayılar tamsayıdır: "1.234", "1,234", "1 234" → 1234; boş/tire → yok
const num = v => { const d = String(v || '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };

// Tarih: ISO, "MM/DD/YYYY HH:mm" (Meta İngilizce), "DD.MM.YYYY HH:mm" (Türkçe)
export function parseDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 12), +(m[5] || 0));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) { const a = +m[1]; const b = +m[2]; const [mo, d] = a > 12 ? [b, a] : [a, b]; return new Date(+m[3], mo - 1, d, +(m[4] || 12), +(m[5] || 0)); }
  const t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(t) ? null : new Date(t);
}

const words = s => new Set(fold(s).split(' ').filter(w => w.length > 2));
function similarity(a, b) {
  const A = words(a); const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(w => { if (B.has(w)) n++; });
  return n / Math.min(A.size, B.size);
}

export function createIgImportService({ db, brands, workspace }) {
  return {
    // Ön izleme: kaydetmez; her satır için en iyi eşleşme ve güven
    preview(brandId, csvText) {
      const b = brands.get(brandId);
      const rows = parseCsv(csvText);
      if (rows.length < 2) throw badRequest('CSV boş ya da yalnız başlık satırı var.');
      const cols = mapColumns(rows[0]);
      if (cols.date == null) throw badRequest('Tarih sütunu bulunamadı ("Publish time" / "Yayınlanma zamanı"). Meta İstatistikler dışa aktarımını yükle.');
      if (!METRIC_KEYS.some(k => cols[k] != null)) throw badRequest('Metrik sütunu bulunamadı (görüntüleme, beğeni, yorum…).');
      const contents = db.prepare('SELECT id, title, caption, scheduled_at, metrics FROM contents WHERE brand_id = ? AND scheduled_at IS NOT NULL').all(b.id);
      const items = rows.slice(1).map((r, i) => {
        const date = parseDate(r[cols.date]);
        const metrics = {};
        METRIC_KEYS.forEach(k => { if (cols[k] != null) { const v = num(r[cols[k]]); if (v != null) metrics[k] = v; } });
        const caption = cols.caption != null ? String(r[cols.caption] || '') : '';
        return { row: i + 1, date: date ? date.toISOString() : null, caption: caption.slice(0, 140), permalink: cols.permalink != null ? String(r[cols.permalink] || '') : '', metrics };
      }).filter(x => x.date && Object.keys(x.metrics).length);
      // Aday puanı: aynı gün (±1 gün) şart; metin benzerliği ve saat yakınlığı sıralar
      const scored = [];
      items.forEach(it => contents.forEach(c => {
        const dh = Math.abs(new Date(c.scheduled_at) - new Date(it.date)) / 36e5;
        if (dh > 36) return;
        const sim = it.caption ? Math.max(similarity(it.caption, c.caption), similarity(it.caption, c.title)) : 0;
        scored.push({ it, c, score: sim * 2 + (1 - dh / 36), sim, dh });
      }));
      scored.sort((a, z) => z.score - a.score);
      const usedRow = new Set(); const usedContent = new Set();
      for (const s of scored) {
        if (usedRow.has(s.it.row) || usedContent.has(s.c.id)) continue;
        usedRow.add(s.it.row); usedContent.add(s.c.id);
        s.it.match = { contentId: s.c.id, title: s.c.title, scheduledAt: s.c.scheduled_at, hasMetrics: Boolean(s.c.metrics), confidence: s.sim >= 0.5 || s.dh <= 2 ? 'yuksek' : 'dusuk' };
      }
      // Eşleşmeyen satır için elle seçilebilecek adaylar (±3 gün)
      items.forEach(it => {
        it.match = it.match || null;
        it.candidates = contents.filter(c => Math.abs(new Date(c.scheduled_at) - new Date(it.date)) <= 3 * 864e5).map(c => ({ id: c.id, title: c.title, scheduledAt: c.scheduled_at }));
      });
      return { columns: Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, rows[0][i]])), items, matched: items.filter(x => x.match).length, total: items.length };
    },
    // Uygula: seçilen eşleşmelerin metrikleri yazılır (var olan diğer metrikler korunur)
    apply(brandId, items = []) {
      const b = brands.get(brandId);
      if (!Array.isArray(items) || !items.length) throw badRequest('Kaydedilecek eşleşme yok.');
      const seen = new Set();
      const done = [];
      for (const x of items.slice(0, 1000)) {
        const id = String((x && x.contentId) || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const c = db.prepare('SELECT id, metrics FROM contents WHERE id = ? AND brand_id = ?').get(id, b.id);
        if (!c) throw badRequest('Eşleşen içerik bu markaya ait değil.');
        const prev = c.metrics ? JSON.parse(c.metrics) : {};
        const next = Object.assign({}, prev);
        METRIC_KEYS.forEach(k => { const v = x.metrics && x.metrics[k]; if (Number.isFinite(Number(v)) && v !== '' && v != null) next[k] = Math.max(0, Math.round(Number(v))); });
        delete next.at;
        done.push(workspace.updateContent(id, { metrics: next }));
      }
      brands.logActivity(b.id, 'content.metrics', `Instagram sonuçları içe aktarıldı (${done.length} içerik)`);
      return { updated: done.length, contents: done };
    }
  };
}
