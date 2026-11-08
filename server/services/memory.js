// Akıllı marka hafızası: yasaklı kelimeler, tercih edilen ifadeler ve bilgi kartları (ürün, fiyat, iletişim, kampanya…).
// Hepsi brands.memory() üzerinden her AI üretimine girer; denetçi yasaklı kelimeleri ayrıca yakalar.
import { newId, now, text, badRequest, notFound, oneOf, parseJson } from '../lib/http.js';

export const FACT_CATEGORIES = { urun: 'Ürün / hizmet', fiyat: 'Fiyat', iletisim: 'Adres ve iletişim', saat: 'Çalışma saatleri', kampanya: 'Kampanya', sss: 'Sık sorulan', hikaye: 'Marka hikâyesi', diger: 'Diğer' };
const MAX_WORDS = 60;
const MAX_FACTS = 80;

const cleanList = (v, max, len) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,\n]+/))
  .map(x => String(x).trim().replace(/\s+/g, ' ').slice(0, len)).filter(Boolean))].slice(0, max);

export function createMemoryService({ db, brands }) {
  const toFact = r => ({ id: r.id, category: r.category, categoryLabel: FACT_CATEGORIES[r.category] || r.category, title: r.title, content: r.content, source: r.source, updatedAt: r.updated_at });
  const lists = id => {
    const r = db.prepare('SELECT banned_words, preferred_phrases FROM brands WHERE id = ?').get(id) || {};
    return { banned: parseJson(r.banned_words, []), preferred: parseJson(r.preferred_phrases, []) };
  };

  const service = {
    categories: FACT_CATEGORIES,
    get(brandId) {
      const b = brands.get(brandId);
      return Object.assign(lists(b.id), {
        facts: db.prepare('SELECT * FROM brand_facts WHERE brand_id = ? ORDER BY category, updated_at DESC').all(b.id).map(toFact),
        // Yapay zekâya giden marka hafızası metninin tamamı (şeffaflık için)
        preview: brands.memory(b.id)
      });
    },
    banned: brandId => lists(brands.get(brandId).id).banned,
    setLists(brandId, body = {}) {
      const b = brands.get(brandId);
      const cur = lists(b.id);
      const banned = 'banned' in body ? cleanList(body.banned, MAX_WORDS, 60) : cur.banned;
      const preferred = 'preferred' in body ? cleanList(body.preferred, 30, 160) : cur.preferred;
      db.prepare('UPDATE brands SET banned_words = ?, preferred_phrases = ? WHERE id = ?').run(JSON.stringify(banned), JSON.stringify(preferred), b.id);
      return service.get(b.id);
    },
    // Asistan için: listeye ekleme
    addBanned(brandId, words) { const cur = lists(brands.get(brandId).id).banned; return service.setLists(brandId, { banned: cur.concat(cleanList(words, MAX_WORDS, 60)) }); },
    addFact(brandId, body = {}, source = 'manual') {
      const b = brands.get(brandId);
      const n = db.prepare('SELECT COUNT(*) AS n FROM brand_facts WHERE brand_id = ?').get(b.id).n;
      if (n >= MAX_FACTS) throw badRequest(`Bir markada en fazla ${MAX_FACTS} bilgi kartı olabilir.`);
      const t = now();
      const row = { id: newId(), category: oneOf(body.category || 'diger', Object.keys(FACT_CATEGORIES), 'Kategori'), title: text(body.title, { field: 'Başlık', max: 120, required: true }), content: text(body.content, { field: 'Bilgi', max: 2000, required: true }) };
      db.prepare('INSERT INTO brand_facts (id, brand_id, category, title, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(row.id, b.id, row.category, row.title, row.content, source === 'assistant' ? 'assistant' : 'manual', t, t);
      brands.logActivity(b.id, 'memory.fact', `Hafızaya eklendi: ${row.title}`);
      return toFact(db.prepare('SELECT * FROM brand_facts WHERE id = ?').get(row.id));
    },
    updateFact(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const r = db.prepare('SELECT * FROM brand_facts WHERE id = ? AND brand_id = ?').get(String(id), b.id);
      if (!r) throw notFound('Bilgi kartı bulunamadı.');
      const next = {
        category: 'category' in body ? oneOf(body.category, Object.keys(FACT_CATEGORIES), 'Kategori') : r.category,
        title: 'title' in body ? text(body.title, { field: 'Başlık', max: 120, required: true }) : r.title,
        content: 'content' in body ? text(body.content, { field: 'Bilgi', max: 2000, required: true }) : r.content
      };
      db.prepare('UPDATE brand_facts SET category = ?, title = ?, content = ?, updated_at = ? WHERE id = ?').run(next.category, next.title, next.content, now(), r.id);
      return toFact(db.prepare('SELECT * FROM brand_facts WHERE id = ?').get(r.id));
    },
    removeFact(brandId, id) {
      const b = brands.get(brandId);
      const r = db.prepare('DELETE FROM brand_facts WHERE id = ? AND brand_id = ?').run(String(id), b.id);
      if (!r.changes) throw notFound('Bilgi kartı bulunamadı.');
    }
  };
  return service;
}
