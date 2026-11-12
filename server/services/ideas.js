// Markaya özel içerik fikirleri: içerik üretiminin ana kaynağı (içerik havuzu).
// 10.4 Fikirler türlere ayrılır (Reels, Post, YouTube, Hikâye, Genel); stüdyolar kendi türünden fikir çeker.
// 10.5 Fikir işlemleri: benzerlerini üret, favori, kullanıldı, arşiv, sil; kullanılanları toplu arşivle/sil.
// 10.6 Tekrarın önlenmesi: fikir bir yerde kullanılınca işaretlenir; rastgele seçimlere girmez, başka yerde kullanılırken
// ve çok benzer bir fikir eklenirken uyarı verilir.
import { notFound, badRequest, newId, now, text, oneOf } from '../lib/http.js';
import { polish } from './reels/rules.js';

export const IDEA_CATEGORIES = {
  guncel: 'Güncel',
  egitici: 'Eğitici',
  bilgilendirici: 'Bilgilendirici',
  eglenceli: 'Eğlenceli',
  satis: 'Satış odaklı',
  bilinirlik: 'Marka bilinirliği',
  trend: 'Trend',
  ozel_gun: 'Özel gün'
};
export const IDEA_FORMATS = { genel: 'Genel', reels: 'Reels', post: 'Post', youtube: 'YouTube', story: 'Hikâye' };
// Fikrin kullanıldığı yerler
export const USE_PLACES = { takvim: 'Takvim', post: 'Post stüdyosu', prompt: 'Prompt Studio', reels: 'Reels', youtube: 'YouTube kapağı', elle: 'Elle işaretlendi' };
const SIMILAR = 0.6;

const fold = s => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
const words = s => new Set(fold(s).split(' ').filter(w => w.length > 2));
export function titleSimilarity(a, b) {
  const A = words(a); const B = words(b);
  if (!A.size || !B.size) return fold(a) === fold(b) ? 1 : 0;
  let n = 0; A.forEach(w => { if (B.has(w)) n++; });
  return n / Math.min(A.size, B.size);
}

const places = r => String(r.used_in || '').split(',').filter(Boolean);
const toIdea = r => ({
  id: r.id, title: r.title, description: r.description, category: r.category,
  categoryLabel: IDEA_CATEGORIES[r.category] || r.category, favorite: Boolean(r.favorite),
  format: r.format || 'genel', formatLabel: IDEA_FORMATS[r.format] || IDEA_FORMATS.genel,
  used: Boolean(r.used_at), usedAt: r.used_at || null, usedIn: places(r), usedInLabels: places(r).map(p => USE_PLACES[p] || p),
  archived: Boolean(r.archived), source: r.source, createdAt: r.created_at
});

// Fikri bir yerde kullanıldı olarak işaretler (başka servisler de çağırır: takvim, stüdyolar).
// Daha önce başka bir yerde kullanıldıysa uyarı döner; işaret yine konur (karar kullanıcının).
export function markIdeaUsed(db, brandId, ideaId, place) {
  const r = db.prepare('SELECT * FROM ideas WHERE id = ? AND brand_id = ?').get(String(ideaId), brandId);
  if (!r) return null;
  const p = USE_PLACES[place] ? place : 'elle';
  const before = places(r);
  const warning = before.length && !before.includes(p) ? `Bu fikir daha önce ${before.map(x => USE_PLACES[x] || x).join(', ')} için kullanıldı; tekrar olmamasına dikkat et.` : null;
  const next = [...new Set([...before, p])].join(',');
  db.prepare('UPDATE ideas SET used_at = COALESCE(used_at, ?), used_in = ? WHERE id = ?').run(now(), next, r.id);
  return { idea: toIdea(Object.assign(r, { used_at: r.used_at || now(), used_in: next })), warning };
}

export function createIdeaService(db, { ai = null, brands = null } = {}) {
  const getRow = (brandId, ideaId) => {
    const row = db.prepare('SELECT * FROM ideas WHERE id = ? AND brand_id = ?').get(String(ideaId), brandId);
    if (!row) throw notFound('Fikir bulunamadı.');
    return row;
  };
  // Aynı ya da çok benzer başlıklı fikir (kullanılmış olanlar dahil, arşivdekiler dahil)
  const nearOf = (brandId, title, exceptId = null) => {
    let best = null;
    for (const r of db.prepare('SELECT * FROM ideas WHERE brand_id = ?').all(brandId)) {
      if (r.id === exceptId) continue;
      const s = titleSimilarity(title, r.title);
      if (s >= SIMILAR && (!best || s > best.s)) best = { s, r };
    }
    return best ? toIdea(best.r) : null;
  };

  const service = {
    // status: aktif (arşivde olmayanlar, varsayılan) | kullanilmamis | kullanildi | arsiv | hepsi
    list(brandId, { category, favorite, format, status = 'aktif', limit = 500 } = {}) {
      let sql = 'SELECT * FROM ideas WHERE brand_id = ?';
      const args = [brandId];
      if (category) { sql += ' AND category = ?'; args.push(category); }
      if (format) { sql += ' AND format = ?'; args.push(format); }
      if (favorite) sql += ' AND favorite = 1';
      if (status === 'aktif') sql += ' AND archived = 0';
      if (status === 'kullanilmamis') sql += ' AND archived = 0 AND used_at IS NULL';
      if (status === 'kullanildi') sql += ' AND archived = 0 AND used_at IS NOT NULL';
      if (status === 'arsiv') sql += ' AND archived = 1';
      sql += ' ORDER BY created_at DESC, rowid DESC LIMIT ?';
      args.push(limit);
      return db.prepare(sql).all(...args).map(toIdea);
    },

    // Son N günde eklenen fikirlerin zamanları (arayüz yerel saate göre günlere böler)
    recentTimes(brandId, days = 14) {
      const since = new Date(Date.now() - (days + 1) * 86400000).toISOString();
      return db.prepare('SELECT created_at FROM ideas WHERE brand_id = ? AND created_at >= ? ORDER BY created_at').all(brandId, since).map(r => r.created_at);
    },

    create(brandId, body, source = 'manual') {
      const row = {
        id: newId(), brand_id: brandId,
        title: text(body.title, { field: 'Fikir başlığı', max: 200, required: true }),
        description: text(body.description, { field: 'Açıklama', max: 2000 }),
        category: oneOf(body.category, Object.keys(IDEA_CATEGORIES), 'Kategori'),
        format: body.format ? oneOf(body.format, Object.keys(IDEA_FORMATS), 'Fikir türü') : 'genel',
        favorite: 0, source, created_at: now()
      };
      const near = nearOf(brandId, row.title);
      db.prepare('INSERT INTO ideas (id, brand_id, title, description, category, format, favorite, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(row.id, row.brand_id, row.title, row.description, row.category, row.format, row.favorite, row.source, row.created_at);
      const idea = toIdea(row);
      if (near) idea.similarTo = { id: near.id, title: near.title, used: near.used, archived: near.archived };
      return idea;
    },

    update(brandId, ideaId, body) {
      const row = getRow(brandId, ideaId);
      const next = {
        title: 'title' in body ? text(body.title, { field: 'Fikir başlığı', max: 200, required: true }) : row.title,
        description: 'description' in body ? text(body.description, { field: 'Açıklama', max: 2000 }) : row.description,
        category: 'category' in body ? oneOf(body.category, Object.keys(IDEA_CATEGORIES), 'Kategori') : row.category,
        format: 'format' in body ? oneOf(body.format, Object.keys(IDEA_FORMATS), 'Fikir türü') : row.format,
        favorite: 'favorite' in body ? (body.favorite ? 1 : 0) : row.favorite,
        archived: 'archived' in body ? (body.archived ? 1 : 0) : row.archived
      };
      db.prepare('UPDATE ideas SET title = ?, description = ?, category = ?, format = ?, favorite = ?, archived = ? WHERE id = ? AND brand_id = ?')
        .run(next.title, next.description, next.category, next.format, next.favorite, next.archived, row.id, brandId);
      // "Kullanıldı" elle açılıp kapatılabilir
      if ('used' in body) {
        if (body.used) markIdeaUsed(db, brandId, row.id, 'elle');
        else db.prepare("UPDATE ideas SET used_at = NULL, used_in = '' WHERE id = ?").run(row.id);
      }
      return toIdea(getRow(brandId, row.id));
    },

    use(brandId, ideaId, place) { getRow(brandId, ideaId); return markIdeaUsed(db, brandId, ideaId, place); },

    remove(brandId, ideaId) {
      const row = getRow(brandId, ideaId);
      db.prepare('DELETE FROM ideas WHERE id = ? AND brand_id = ?').run(row.id, brandId);
    },

    // Kullanılanları toplu arşivle ya da sil (silme çöp kutusuna değil, kalıcıdır; arayüz onay ister)
    bulkUsed(brandId, action) {
      if (action === 'arsivle') return { changed: Number(db.prepare('UPDATE ideas SET archived = 1 WHERE brand_id = ? AND used_at IS NOT NULL AND archived = 0').run(brandId).changes) };
      if (action === 'sil') return { changed: Number(db.prepare('DELETE FROM ideas WHERE brand_id = ? AND used_at IS NOT NULL').run(brandId).changes) };
      throw badRequest('Geçersiz toplu işlem.');
    },

    // 10.7/10.8: stüdyoların "rastgele fikir çek"i. Yalnız kullanılmamış ve arşivde olmayan fikirler; tür verilirse o tür
    // (yoksa Genel fikirler de olur). exclude: aynı oturumda az önce çekilenler.
    random(brandId, { format = '', exclude = [] } = {}) {
      const ex = new Set((Array.isArray(exclude) ? exclude : []).map(String));
      let rows = db.prepare('SELECT * FROM ideas WHERE brand_id = ? AND archived = 0 AND used_at IS NULL').all(brandId).filter(r => !ex.has(r.id));
      if (format) {
        const same = rows.filter(r => r.format === format);
        rows = same.length ? same : rows.filter(r => r.format === 'genel');
      }
      if (!rows.length) return null;
      return toIdea(rows[Math.floor(Math.random() * rows.length)]);
    },

    // 10.5 Benzerlerini üret: aynı tür ve kategoride n yeni fikir; var olanların aynısı ya da çok benzeri kaydedilmez
    async similar(brandId, ideaId, { count = 3, modelRef = null } = {}) {
      if (!ai || !brands) throw badRequest('Yapay zekâ bağlı değil.');
      const src = toIdea(getRow(brandId, ideaId));
      const n = Math.max(1, Math.min(10, Math.round(Number(count) || 3)));
      const existing = db.prepare('SELECT title FROM ideas WHERE brand_id = ? ORDER BY created_at DESC LIMIT 80').all(brandId).map(r => r.title);
      const prompt = [
        'BENZER İÇERİK FİKİRLERİ',
        `Aşağıdaki fikre benzeyen ama onun tekrarı olmayan ${n} yeni ${src.formatLabel === 'Genel' ? '' : src.formatLabel + ' '}içerik fikri üret. Aynı konuyu farklı açılardan ele al; başlıklar kısa ve somut olsun.`,
        '', 'MARKA:', brands.memory(brandId), '',
        `KAYNAK FİKİR: ${src.title}${src.description ? ` — ${src.description}` : ''}`,
        `TÜR: ${src.formatLabel} · KATEGORİ: ${src.categoryLabel}`, '',
        'Var olan fikirlerin aynısını ya da çok benzerini YAZMA:', existing.map(t => `- ${t}`).join('\n'), '',
        'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify({ ideas: [{ title: 'Fikir başlığı', description: 'Bir iki cümle: ne anlatılacak, nasıl' }] })
      ].join('\n');
      const out = await ai.run({ task: 'fikir', brandId, prompt, json: true, modelRef, temperature: 0.9 });
      const list = Array.isArray(out.output && out.output.ideas) ? out.output.ideas : [];
      const saved = []; let skipped = 0;
      for (const it of list.slice(0, n)) {
        const title = polish(String((it && it.title) || '')).slice(0, 200);
        if (!title) continue;
        if (nearOf(brandId, title)) { skipped++; continue; }
        saved.push(service.create(brandId, { title, description: String((it && it.description) || '').slice(0, 2000), category: src.category, format: src.format }, 'benzer'));
      }
      if (brands.logActivity && saved.length) brands.logActivity(brandId, 'idea.similar', `"${src.title}" fikrinin ${saved.length} benzeri üretildi`);
      return { ideas: saved, skipped, ai: { model: out.servedRef || out.ref, modelLabel: ai.labelOf(out.servedRef || out.ref), cost: out.cost, ms: out.ms, fallbackUsed: Boolean(out.fallbackUsed) } };
    }
  };
  return service;
}
