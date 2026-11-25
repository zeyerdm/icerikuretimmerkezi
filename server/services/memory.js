// Akıllı marka hafızası: yasaklı kelimeler, tercih edilen ifadeler ve bilgi kartları (ürün, fiyat, iletişim, kampanya…).
// Bilgi kartları üç katmanlıdır (göç 50):
//  - sabit: değişmeyen gerçekler (ürün, hizmet, fiyat, adres, hikâye)
//  - ogrenilen: kullanımdan öğrenilen tercihler (başarılı kalıplar, tekrar eden düzeltmeler)
//  - donemsel: kampanya, sezonluk ürün, geçici bilgi (geçerlilik tarihleriyle)
// Elle eklenen kart onaylıdır. Asistan, web sitesi ya da yapay zekâ çıkarımı "öneri" olarak gelir ve kullanıcı onaylamadan
// yapay zekâya gitmez (kesin kurala dönüşmez). Süresi dolan kart arşive geçer (silinmez). Her değişiklik geçmişe yazılır.
// Yapay zekâya yalnız onaylı ve bugün geçerli kartlar gider (brands.memory()).
import { newId, now, text, badRequest, notFound, oneOf, parseJson } from '../lib/http.js';

export const FACT_CATEGORIES = { urun: 'Ürün / hizmet', fiyat: 'Fiyat', iletisim: 'Adres ve iletişim', saat: 'Çalışma saatleri', kampanya: 'Kampanya', sss: 'Sık sorulan', hikaye: 'Marka hikâyesi', diger: 'Diğer' };
export const FACT_LAYERS = { sabit: 'Sabit bilgi', ogrenilen: 'Öğrenilen tercih', donemsel: 'Dönemsel bilgi' };
export const FACT_STATUSES = { onayli: 'Onaylı', oneri: 'Onay bekliyor', arsiv: 'Arşiv' };
export const FACT_CONFIDENCE = { yuksek: 'Yüksek', orta: 'Orta', dusuk: 'Düşük' };
export const FACT_SOURCES = { manual: 'Elle', assistant: 'Asistan', site: 'Web sitesi', ai: 'Yapay zekâ çıkarımı', performans: 'Performans' };
const MAX_WORDS = 60;
const MAX_FACTS = 80;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const cleanList = (v, max, len) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,\n]+/))
  .map(x => String(x).trim().replace(/\s+/g, ' ').slice(0, len)).filter(Boolean))].slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const dateOr = (v, field) => {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 10);
  if (!DATE.test(s)) throw badRequest(`${field} YYYY-AA-GG biçiminde olmalı.`);
  return s;
};
// Kaynağa göre varsayılan onay ve güven: elle ve kullanıcının açık isteğiyle (asistana "hatırla") gelen onaylı
const defaultsFor = source => (source === 'manual' || source === 'assistant' ? { status: 'onayli', confidence: 'yuksek' } : { status: 'oneri', confidence: source === 'site' ? 'orta' : 'dusuk' });

export function createMemoryService({ db, brands }) {
  const toFact = r => ({
    id: r.id, category: r.category, categoryLabel: FACT_CATEGORIES[r.category] || r.category, title: r.title, content: r.content,
    source: r.source, sourceLabel: FACT_SOURCES[r.source] || r.source,
    layer: r.layer || 'sabit', layerLabel: FACT_LAYERS[r.layer] || FACT_LAYERS.sabit,
    status: r.status || 'onayli', statusLabel: FACT_STATUSES[r.status] || FACT_STATUSES.onayli,
    validFrom: r.valid_from || null, validTo: r.valid_to || null,
    confidence: r.confidence || 'yuksek', confidenceLabel: FACT_CONFIDENCE[r.confidence] || FACT_CONFIDENCE.yuksek,
    createdAt: r.created_at, updatedAt: r.updated_at
  });
  const lists = id => {
    const r = db.prepare('SELECT banned_words, preferred_phrases FROM brands WHERE id = ?').get(id) || {};
    return { banned: parseJson(r.banned_words, []), preferred: parseJson(r.preferred_phrases, []) };
  };
  const row = (brandId, id) => {
    const r = db.prepare('SELECT * FROM brand_facts WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Bilgi kartı bulunamadı.');
    return r;
  };
  const snap = r => (r ? JSON.stringify(toFact(r)) : null);
  const log = (brandId, factId, action, before, after, actor = 'kullanici') => db.prepare('INSERT INTO brand_fact_history (id, fact_id, brand_id, at, action, before, after, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(newId(), factId, brandId, now(), action, before, after, actor);

  // Süresi dolan onaylı dönemsel kartlar arşive geçer (silinmez; geçmişe yazılır)
  function expire(brandId) {
    const rows = db.prepare("SELECT * FROM brand_facts WHERE brand_id = ? AND status = 'onayli' AND valid_to IS NOT NULL AND valid_to < ?").all(brandId, today());
    for (const r of rows) {
      db.prepare("UPDATE brand_facts SET status = 'arsiv', updated_at = ? WHERE id = ?").run(now(), r.id);
      log(brandId, r.id, 'sure_doldu', snap(r), snap(db.prepare('SELECT * FROM brand_facts WHERE id = ?').get(r.id)), 'sistem');
    }
    return rows.length;
  }

  const service = {
    categories: FACT_CATEGORIES,
    layers: FACT_LAYERS,
    statuses: FACT_STATUSES,
    get(brandId) {
      const b = brands.get(brandId);
      expire(b.id);
      const facts = db.prepare('SELECT * FROM brand_facts WHERE brand_id = ? ORDER BY category, updated_at DESC').all(b.id).map(toFact);
      // Aynı başlıkta onaylı bir kart varken gelen öneri "çelişki" olarak işaretlenir (kullanıcı karar verir)
      const approved = new Map(facts.filter(f => f.status === 'onayli').map(f => [f.title.toLocaleLowerCase('tr-TR'), f]));
      facts.forEach(f => { if (f.status === 'oneri') { const a = approved.get(f.title.toLocaleLowerCase('tr-TR')); if (a && a.content !== f.content) f.conflictWith = { id: a.id, content: a.content }; } });
      return Object.assign(lists(b.id), {
        facts,
        pending: facts.filter(f => f.status === 'oneri').length,
        // Yapay zekâya giden marka hafızası metninin tamamı (şeffaflık için)
        preview: brands.memory(b.id)
      });
    },
    expire,
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
    // source: manual | assistant | site | ai | performans
    addFact(brandId, body = {}, source = 'manual') {
      const b = brands.get(brandId);
      const n = db.prepare("SELECT COUNT(*) AS n FROM brand_facts WHERE brand_id = ? AND status != 'arsiv'").get(b.id).n;
      if (n >= MAX_FACTS) throw badRequest(`Bir markada en fazla ${MAX_FACTS} bilgi kartı olabilir. Eskileri arşivle.`);
      const src = FACT_SOURCES[source] ? source : 'manual';
      const d = defaultsFor(src);
      const t = now();
      const category = oneOf(body.category || 'diger', Object.keys(FACT_CATEGORIES), 'Kategori');
      const r = {
        id: newId(), category,
        title: text(body.title, { field: 'Başlık', max: 120, required: true }),
        content: text(body.content, { field: 'Bilgi', max: 2000, required: true }),
        layer: body.layer ? oneOf(body.layer, Object.keys(FACT_LAYERS), 'Katman') : (category === 'kampanya' ? 'donemsel' : 'sabit'),
        status: body.status && src === 'manual' ? oneOf(body.status, ['onayli', 'oneri'], 'Durum') : d.status,
        confidence: body.confidence ? oneOf(body.confidence, Object.keys(FACT_CONFIDENCE), 'Güven') : d.confidence,
        valid_from: dateOr(body.validFrom, 'Başlangıç'), valid_to: dateOr(body.validTo, 'Bitiş')
      };
      if (r.valid_from && r.valid_to && r.valid_to < r.valid_from) throw badRequest('Bitiş tarihi başlangıçtan önce olamaz.');
      db.prepare('INSERT INTO brand_facts (id, brand_id, category, title, content, source, layer, status, confidence, valid_from, valid_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(r.id, b.id, r.category, r.title, r.content, src, r.layer, r.status, r.confidence, r.valid_from, r.valid_to, t, t);
      const created = db.prepare('SELECT * FROM brand_facts WHERE id = ?').get(r.id);
      log(b.id, r.id, 'eklendi', null, snap(created), src === 'manual' ? 'kullanici' : src);
      brands.logActivity(b.id, 'memory.fact', r.status === 'oneri' ? `Hafızaya öneri geldi: ${r.title}` : `Hafızaya eklendi: ${r.title}`);
      return toFact(created);
    },
    updateFact(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const next = {
        category: 'category' in body ? oneOf(body.category, Object.keys(FACT_CATEGORIES), 'Kategori') : r.category,
        title: 'title' in body ? text(body.title, { field: 'Başlık', max: 120, required: true }) : r.title,
        content: 'content' in body ? text(body.content, { field: 'Bilgi', max: 2000, required: true }) : r.content,
        layer: 'layer' in body ? oneOf(body.layer, Object.keys(FACT_LAYERS), 'Katman') : r.layer,
        status: 'status' in body ? oneOf(body.status, Object.keys(FACT_STATUSES), 'Durum') : r.status,
        confidence: 'confidence' in body ? oneOf(body.confidence, Object.keys(FACT_CONFIDENCE), 'Güven') : r.confidence,
        valid_from: 'validFrom' in body ? dateOr(body.validFrom, 'Başlangıç') : r.valid_from,
        valid_to: 'validTo' in body ? dateOr(body.validTo, 'Bitiş') : r.valid_to
      };
      if (next.valid_from && next.valid_to && next.valid_to < next.valid_from) throw badRequest('Bitiş tarihi başlangıçtan önce olamaz.');
      // Kullanıcı düzenlediyse (içerik değişti) öneri artık kullanıcının bilgisidir: onaylı ve yüksek güven
      if (r.status === 'oneri' && !('status' in body) && ('content' in body || 'title' in body)) { next.status = 'onayli'; next.confidence = 'yuksek'; }
      db.prepare('UPDATE brand_facts SET category = ?, title = ?, content = ?, layer = ?, status = ?, confidence = ?, valid_from = ?, valid_to = ?, updated_at = ? WHERE id = ?')
        .run(next.category, next.title, next.content, next.layer, next.status, next.confidence, next.valid_from, next.valid_to, now(), r.id);
      const after = db.prepare('SELECT * FROM brand_facts WHERE id = ?').get(r.id);
      const action = r.status !== next.status ? ({ onayli: 'onaylandi', arsiv: 'arsivlendi', oneri: 'oneriye_alindi' }[next.status]) : 'duzenlendi';
      log(b.id, r.id, action, snap(r), snap(after));
      return toFact(after);
    },
    approve(brandId, id) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      // Aynı başlıkta onaylı başka kart varsa (çelişki) eskisi arşive geçer: yeni bilgi onu yerine geçer
      const old = db.prepare("SELECT * FROM brand_facts WHERE brand_id = ? AND status = 'onayli' AND id != ? AND lower(title) = lower(?)").all(b.id, r.id, r.title);
      for (const o of old) { db.prepare("UPDATE brand_facts SET status = 'arsiv', updated_at = ? WHERE id = ?").run(now(), o.id); log(b.id, o.id, 'yerine_gecildi', snap(o), snap(db.prepare('SELECT * FROM brand_facts WHERE id = ?').get(o.id))); }
      return service.updateFact(b.id, r.id, { status: 'onayli', confidence: 'yuksek' });
    },
    history(brandId, id) {
      const b = brands.get(brandId);
      return db.prepare('SELECT * FROM brand_fact_history WHERE brand_id = ? AND fact_id = ? ORDER BY at DESC, rowid DESC LIMIT 50').all(b.id, String(id))
        .map(h => ({ at: h.at, action: h.action, actor: h.actor, before: parseJson(h.before, null), after: parseJson(h.after, null) }));
    },
    removeFact(brandId, id) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      db.prepare('DELETE FROM brand_facts WHERE id = ? AND brand_id = ?').run(r.id, b.id);
      log(b.id, r.id, 'silindi', snap(r), null);
    }
  };
  return service;
}
