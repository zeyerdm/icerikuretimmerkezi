// Sektör kaynakları: markanın takip ettiği güncel blog, haber, dokümantasyon veya RSS/Atom kaynaklarından
// haftalık olarak (veya elle tetiklendiğinde) başlık + özet çeker; post üretiminde AI'ya gerçek bilgi kaynağı olur.
import { newId, now, text, badRequest, notFound } from '../lib/http.js';
import { decode, pageText } from './siteReader.js';

const WEEK_MS = 7 * 24 * 3600 * 1000;
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

// HTML sayfasından makale / blog / duyuru başlık ve özetlerini çıkarır
export function extractArticles(pages) {
  const out = [];
  const seen = new Set();
  for (const p of pages) {
    const lines = String(p.text || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length && out.length < MAX_ITEMS_PER_FETCH; i++) {
      const line = lines[i];
      if (line.length < 18 || line.length > 140) continue;
      if (/^(ana sayfa|iletişim|hakkımızda|giriş|kayıt|çerez|gizlilik|menü|copyright|©)/i.test(line)) continue;
      const key = line.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) continue;
      seen.add(key);
      // Sonraki satır açıklayıcı paragraf gibiyse özet olarak al
      const next = lines[i + 1] || '';
      const summary = next.length > 35 && next.length <= 420 ? next.slice(0, 360) : '';
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

  async function pullOne(src) {
    const t = now();
    try {
      const data = await siteReader.read(src.url);
      let items = [];
      if (data.rawXml) items = parseFeed(data.rawXml, src.url);
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
      return { added, total: items.length };
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
      let added = 0; let errors = 0;
      for (const s of list) {
        try { added += (await pullOne(s)).added; } catch { errors++; }
      }
      return { checked: list.length, added, errors };
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
      const cutoff = new Date(Date.now() - WEEK_MS).toISOString();
      const due = db.prepare("SELECT * FROM brand_sources WHERE enabled = 1 AND (last_fetched_at = '' OR last_fetched_at < ?) LIMIT 10").all(cutoff);
      for (const s of due) { try { await pullOne(s); } catch { /* sonraki döngüde tekrar denenir */ } }
      return due.length;
    },
    startWeeklySync() {
      const t = setInterval(() => { this.syncDue().catch(() => {}); }, 6 * 3600 * 1000);
      if (t.unref) t.unref();
      return t;
    }
  };
}
