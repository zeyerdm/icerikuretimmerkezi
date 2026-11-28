// Sektör kaynakları: markanın takip ettiği güncel blog, haber, dokümantasyon veya RSS/Atom kaynaklarından
// haftalık olarak (veya elle tetiklendiğinde) başlık + özet çeker; post üretiminde AI'ya gerçek bilgi kaynağı olur.
import { newId, now, text, badRequest, notFound } from '../lib/http.js';
import { decode, pageText } from './siteReader.js';

const DAY_MS = 24 * 3600 * 1000;
const MAX_SOURCES = 15;
const MAX_ITEMS_PER_FETCH = 12;

const stripTags = s => decode(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// RSS / Atom feed'den öğeleri çıkarır
export function parseFeed(xml, baseUrl) {
  const s = String(xml || '');
  const isAtom = /<feed\b/i.test(s) && /<entry\b/i.test(s);
  const blocks = [...s.matchAll(isAtom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi : /<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const out = [];
  for (const m of blocks.slice(0, MAX_ITEMS_PER_FETCH)) {
    const b = m[1];
    const title = stripTags((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 200);
    if (!title || title.length < 6) continue;
    let link = '';
    if (isAtom) {
      const lm = b.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      link = lm ? lm[1] : '';
    } else {
      link = stripTags((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
    }
    try { if (link) link = new URL(link, baseUrl).href; } catch { link = ''; }
    const rawDesc = (b.match(/<(?:description|summary|content:encoded|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content:encoded|content)>/i) || [])[1] || '';
    const summary = stripTags(rawDesc).slice(0, 400);
    out.push({ title, url: link, summary });
  }
  return out;
}

const DATE_OR_META = /^(?:(?:research|news|blog|product|safety|company|announcement|update|ai|tech)\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+\d{1,2},?\s+\d{2,4}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^\d+\s*(?:dk|min|dakika)\s*(?:okuma|read)?$/i;
const SITE_NOISE = /^(?:site adı:|site açıklaması:|===|https?:\/\/|ana sayfa|iletişim|hakkımızda|giriş|kayıt|çerez|gizlilik|menü|copyright|©|reklam|künye|abone ol|skip to main|bunu biliyor muydunuz|uygulama\s*\/\s*yazılım|teknoloji haberleri|devamını oku|read more|tümünü gör|see all|son dakika|popüler haberler|en çok okunan)/i;
const PROMO_SUFFIX = /(?:takip edin\.?|göz atın\.?|abone olun\.?|keşfedin\.?)$/i;
const BAD_HREF = /\/(?:category|kategori|tag|etiket|author|yazar|login|giris|register|kayit|iletisim|contact|hakkimizda|about|gizlilik|privacy|search|ara)\b|^#/i;

function isGoodTitle(t) {
  if (!t || t.length < 24 || t.length > 160) return false;
  if (DATE_OR_META.test(t) || SITE_NOISE.test(t) || PROMO_SUFFIX.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 4 || (words.length >= 3 && t.length >= 28);
}

// HTML içinden gezinme/menü/altbilgi bloklarını atıp gerçek makale/haber başlıklarını çıkarır
export function extractArticlesFromHtml(html, baseUrl = '') {
  const cleaned = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|form|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  const out = [];
  const seen = new Set();
  const push = (rawTitle, rawHref = '', rawSummary = '') => {
    const title = stripTags(rawTitle).slice(0, 180);
    if (!isGoodTitle(title)) return;
    const key = title.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) return;
    let url = baseUrl;
    if (rawHref) {
      if (BAD_HREF.test(rawHref)) return;
      try { url = new URL(rawHref, baseUrl).href; } catch { url = baseUrl; }
    }
    seen.add(key);
    const summary = stripTags(rawSummary).slice(0, 360);
    out.push({ title, url, summary });
  };

  // 1. Önce <article> kartlarından başlık + link + özet çıkar
  for (const m of cleaned.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    if (out.length >= MAX_ITEMS_PER_FETCH) break;
    const block = m[1];
    const hm = block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const am = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const pm = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const titleHtml = (hm && hm[1]) || (am && am[2]) || '';
    const href = (hm && (hm[1].match(/href=["']([^"']+)["']/i) || [])[1]) || (am && am[1]) || '';
    push(titleHtml, href, pm ? pm[1] : '');
  }

  // 2. Yeterli <article> yoksa sayfadaki başlık + bağlantılı haber başlıklarını tara
  if (out.length < 4) {
    for (const m of cleaned.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      if (out.length >= MAX_ITEMS_PER_FETCH) break;
      const href = (m[2].match(/href=["']([^"']+)["']/i) || [])[1] || '';
      push(m[2], href, '');
    }
  }
  if (out.length < 4) {
    for (const m of cleaned.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      if (out.length >= MAX_ITEMS_PER_FETCH) break;
      push(m[2], m[1], '');
    }
  }
  return out;
}

// Düz metin sayfasından makale / blog / duyuru başlık ve özetlerini çıkarır
export function extractArticles(pages) {
  const out = [];
  const seen = new Set();
  for (const p of pages) {
    const lines = String(p.text || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length && out.length < MAX_ITEMS_PER_FETCH; i++) {
      const line = lines[i];
      if (!isGoodTitle(line)) continue;
      const key = line.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) continue;
      seen.add(key);
      const next = lines[i + 1] || '';
      const summary = next.length > 35 && next.length <= 420 && !DATE_OR_META.test(next) && !SITE_NOISE.test(next) ? next.slice(0, 360) : '';
      out.push({ title: line, url: p.url || '', summary });
      if (summary) i++;
    }
  }
  return out;
}

export function createSourceService({ db, brands, siteReader }) {
  const toSource = r => ({
    id: r.id, brandId: r.brand_id, url: r.url, label: r.label,
    lastFetchedAt: r.last_fetched_at, lastError: r.last_error, lastCount: r.last_count,
    enabled: Boolean(r.enabled), createdAt: r.created_at
  });
  const toItem = r => ({
    id: r.id, sourceId: r.source_id, title: r.title, url: r.url, summary: r.summary, fetchedAt: r.fetched_at
  });
  const row = (brandId, id) => {
    const r = db.prepare('SELECT * FROM brand_sources WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Kaynak bulunamadı.');
    return r;
  };

  // Önceki hatalı meta/menü satırlarını temizler
  function cleanNoise() {
    const delItem = db.prepare('DELETE FROM brand_source_items WHERE id = ?');
    for (const r of db.prepare('SELECT id, title FROM brand_source_items').all()) {
      if (!isGoodTitle(r.title)) delItem.run(r.id);
    }
    const delIdea = db.prepare('DELETE FROM ideas WHERE id = ?');
    for (const r of db.prepare("SELECT id, title FROM ideas WHERE source LIKE 'kaynak%'").all()) {
      if (!isGoodTitle(r.title)) delIdea.run(r.id);
    }
  }
  cleanNoise();

  // Her kaynaktan günde en fazla 1 yeni fikir: hem yeni çekilenlerden hem daha önce çekilmiş bekleyenlerden seçer
  function ensureDailyIdea(src, t = now()) {
    const dayAgo = new Date(Date.now() - DAY_MS).toISOString();
    const labelSuffix = src.label ? `Kaynak: ${src.label}` : '';
    const alreadyToday = labelSuffix
      ? db.prepare("SELECT 1 FROM ideas WHERE brand_id = ? AND source = 'kaynak' AND description LIKE ? AND created_at >= ? LIMIT 1").get(src.brand_id, `%${labelSuffix}%`, dayAgo)
      : db.prepare("SELECT 1 FROM ideas WHERE brand_id = ? AND source = 'kaynak' AND created_at >= ? LIMIT 1").get(src.brand_id, dayAgo);
    if (alreadyToday) return 0;
    const existingIdeas = new Set(db.prepare('SELECT title FROM ideas WHERE brand_id = ?').all(src.brand_id).map(x => x.title.toLocaleLowerCase('tr-TR')));
    const candidates = db.prepare('SELECT title, summary FROM brand_source_items WHERE source_id = ? ORDER BY fetched_at DESC LIMIT 30').all(src.id);
    const insIdea = db.prepare('INSERT INTO ideas (id, brand_id, title, description, category, format, favorite, source, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)');
    for (const it of candidates) {
      if (!isGoodTitle(it.title)) continue;
      const k = it.title.toLocaleLowerCase('tr-TR');
      if (existingIdeas.has(k)) continue;
      const desc = [it.summary, labelSuffix].filter(Boolean).join(' · ').slice(0, 1000);
      insIdea.run(newId(), src.brand_id, it.title.slice(0, 200), desc, 'guncel', 'post', 'kaynak', t);
      return 1;
    }
    return 0;
  }

  async function pullOne(src) {
    cleanNoise();
    const t = now();
    try {
      const data = siteReader.readSource ? await siteReader.readSource(src.url) : await siteReader.read(src.url);
      let items = [];
      if (data.rawXml) items = parseFeed(data.rawXml, data.feedUrl || src.url);
      if (!items.length && data.html) items = extractArticlesFromHtml(data.html, data.url || src.url);
      if (!items.length && Array.isArray(data.pages)) items = extractArticles(data.pages);
      if (!items.length && data.text) items = extractArticles([{ url: data.url || src.url, text: data.text }]);

      const existing = new Set(db.prepare('SELECT title FROM brand_source_items WHERE source_id = ?').all(src.id).map(x => x.title.toLocaleLowerCase('tr-TR')));
      let added = 0;
      const ins = db.prepare('INSERT INTO brand_source_items (id, brand_id, source_id, title, url, summary, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const it of items.slice(0, MAX_ITEMS_PER_FETCH)) {
        const k = it.title.toLocaleLowerCase('tr-TR');
        if (existing.has(k)) continue;
        existing.add(k);
        ins.run(newId(), src.brand_id, src.id, it.title, it.url || '', it.summary || '', t);
        added++;
      }
      // Kaynak başına en yeni 30 başlık kalsın
      db.prepare('DELETE FROM brand_source_items WHERE source_id = ? AND id NOT IN (SELECT id FROM brand_source_items WHERE source_id = ? ORDER BY fetched_at DESC LIMIT 30)').run(src.id, src.id);
      db.prepare("UPDATE brand_sources SET last_fetched_at = ?, last_error = '', last_count = ? WHERE id = ?").run(t, items.length, src.id);
      const ideasAdded = ensureDailyIdea(src, t);
      return { added, ideasAdded, total: items.length };
    } catch (err) {
      db.prepare('UPDATE brand_sources SET last_fetched_at = ?, last_error = ? WHERE id = ?').run(t, String(err && err.message || 'Çekilemedi').slice(0, 200), src.id);
      throw err;
    }
  }

  return {
    list(brandId) {
      const b = brands.get(brandId);
      const sources = db.prepare('SELECT * FROM brand_sources WHERE brand_id = ? ORDER BY created_at DESC').all(b.id).map(toSource);
      const items = db.prepare('SELECT * FROM brand_source_items WHERE brand_id = ? ORDER BY fetched_at DESC LIMIT 40').all(b.id).map(toItem);
      return { sources, items };
    },
    add(brandId, { url, label = '' } = {}) {
      const b = brands.get(brandId);
      const raw = text(url, { field: 'Kaynak adresi', max: 400, required: true });
      let parsed;
      try { parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { throw badRequest('Geçerli bir adres yaz (ör. blog.ornek.com).'); }
      if (!/^https?:$/.test(parsed.protocol)) throw badRequest('Yalnız http ve https adresleri eklenebilir.');
      const normUrl = u => {
        const p = new URL(u);
        return `${p.hostname.replace(/^www\./, '').toLowerCase()}${p.pathname.replace(/\/+$/, '')}${p.search}`;
      };
      const targetKey = normUrl(parsed.href);
      const exists = db.prepare('SELECT url FROM brand_sources WHERE brand_id = ?').all(b.id).some(s => {
        try { return normUrl(s.url) === targetKey; } catch { return false; }
      });
      if (exists) throw badRequest('Bu web sitesi zaten kaynaklara eklenmiş.');
      const count = db.prepare('SELECT COUNT(*) AS n FROM brand_sources WHERE brand_id = ?').get(b.id).n;
      if (count >= MAX_SOURCES) throw badRequest(`Bir markada en fazla ${MAX_SOURCES} kaynak olabilir.`);
      const lb = text(label, { field: 'Kaynak adı', max: 80 }) || parsed.hostname.replace(/^www\./, '');
      const id = newId();
      db.prepare('INSERT INTO brand_sources (id, brand_id, url, label, created_at) VALUES (?, ?, ?, ?, ?)').run(id, b.id, parsed.href, lb, now());
      return toSource(row(b.id, id));
    },
    remove(brandId, id) {
      const b = brands.get(brandId);
      db.prepare('DELETE FROM brand_sources WHERE id = ? AND brand_id = ?').run(row(b.id, id).id, b.id);
    },
    async fetchSource(brandId, id) {
      const b = brands.get(brandId);
      const src = row(b.id, id);
      const res = await pullOne(src);
      return Object.assign({ source: toSource(row(b.id, id)) }, res);
    },
    async fetchBrand(brandId) {
      const b = brands.get(brandId);
      const list = db.prepare('SELECT * FROM brand_sources WHERE brand_id = ? AND enabled = 1').all(b.id);
      let added = 0; let ideasAdded = 0; let errors = 0;
      for (const s of list) {
        try { const r = await pullOne(s); added += r.added; ideasAdded += r.ideasAdded || 0; } catch { errors++; }
      }
      return { checked: list.length, added, ideasAdded, errors };
    },
    // Post üretiminde konuya göre güncel kaynaklardan en alakalı başlık + özetleri döndürür
    recentContext(brandId, topic = '', limit = 6) {
      const rows = db.prepare('SELECT i.title, i.summary, s.label FROM brand_source_items i JOIN brand_sources s ON s.id = i.source_id WHERE i.brand_id = ? ORDER BY i.fetched_at DESC LIMIT 40').all(brandId);
      if (!rows.length) return '';
      const words = String(topic || '').toLocaleLowerCase('tr-TR').split(/\s+/).filter(w => w.length >= 3);
      const scored = rows.map(r => {
        const hay = `${r.title} ${r.summary}`.toLocaleLowerCase('tr-TR');
        const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
        return { r, score };
      }).sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map(({ r }) => `- [${r.label}] ${r.title}${r.summary ? `: ${r.summary}` : ''}`).join('\n');
    },
    // Konuyla ilgili kayıtlı kaynak linklerinin içine girip asıl yazı/makale metnini okuyarak araştırma özeti çıkarır
    async research(brandId, topic = '', { maxPages = 2 } = {}) {
      let items = db.prepare('SELECT i.title, i.url, i.summary, s.label FROM brand_source_items i JOIN brand_sources s ON s.id = i.source_id WHERE i.brand_id = ? ORDER BY i.fetched_at DESC LIMIT 40').all(brandId);
      const sourcesList = db.prepare('SELECT url, label FROM brand_sources WHERE brand_id = ? AND enabled = 1 ORDER BY created_at DESC').all(brandId);
      if (!sourcesList.length) return { text: '', used: [] };
      if (!items.length) {
        await this.fetchBrand(brandId).catch(() => {});
        items = db.prepare('SELECT i.title, i.url, i.summary, s.label FROM brand_source_items i JOIN brand_sources s ON s.id = i.source_id WHERE i.brand_id = ? ORDER BY i.fetched_at DESC LIMIT 40').all(brandId);
      }
      const words = String(topic || '').toLocaleLowerCase('tr-TR').split(/\s+/).filter(w => w.length >= 3);
      const scored = items.map(it => {
        const hay = `${it.title} ${it.summary}`.toLocaleLowerCase('tr-TR');
        return { it, score: words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) };
      }).sort((a, b) => b.score - a.score);
      const targets = [];
      const seenUrl = new Set();
      for (const { it } of scored) {
        if (it.url && !seenUrl.has(it.url)) { seenUrl.add(it.url); targets.push({ url: it.url, label: it.label, title: it.title }); }
        if (targets.length >= maxPages) break;
      }
      if (!targets.length) {
        for (const s of sourcesList.slice(0, maxPages)) targets.push({ url: s.url, label: s.label, title: s.label });
      }
      const blocks = [];
      const used = [];
      for (const tg of targets) {
        try {
          const page = await siteReader.read(tg.url);
          const body = String(page.text || '').replace(/\s+/g, ' ').trim().slice(0, 2600);
          if (body.length > 60) {
            blocks.push(`[${tg.label} · ${tg.title}]\n${body}`);
            used.push(tg.url);
          }
        } catch { /* erişilemeyen linki atla */ }
      }
      const summaryLines = this.recentContext(brandId, topic, 5);
      const textOut = [blocks.join('\n\n'), summaryLines ? `Diğer güncel başlıklar:\n${summaryLines}` : ''].filter(Boolean).join('\n\n');
      return { text: textOut.slice(0, 6500), used };
    },
    async syncDue() {
      cleanNoise();
      const cutoff = new Date(Date.now() - DAY_MS).toISOString();
      const due = db.prepare(`SELECT s.* FROM brand_sources s WHERE s.enabled = 1 AND (s.last_fetched_at = '' OR s.last_fetched_at < ? OR NOT EXISTS (SELECT 1 FROM brand_source_items i WHERE i.source_id = s.id)) LIMIT 15`).all(cutoff);
      for (const s of due) { try { await pullOne(s); } catch { /* sonraki döngüde tekrar denenir */ } }
      // Daha önce çekilmiş ama bugün henüz fikir üretmemiş kaynaklar için bekleyen başlıklardan 1 fikir çıkar
      const allActive = db.prepare('SELECT * FROM brand_sources WHERE enabled = 1').all();
      for (const s of allActive) ensureDailyIdea(s);
      return due.length;
    },
    startWeeklySync() {
      const boot = setTimeout(() => { this.syncDue().catch(() => {}); }, 4000);
      if (boot.unref) boot.unref();
      const t = setInterval(() => { this.syncDue().catch(() => {}); }, 6 * 3600 * 1000);
      if (t.unref) t.unref();
      return t;
    }
  };
}
