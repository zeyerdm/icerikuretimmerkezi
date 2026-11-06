// Markaya özel içerik fikirleri
import { notFound, newId, now, text, oneOf } from '../lib/http.js';

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

const toIdea = r => ({
  id: r.id, title: r.title, description: r.description, category: r.category,
  categoryLabel: IDEA_CATEGORIES[r.category] || r.category, favorite: Boolean(r.favorite),
  source: r.source, createdAt: r.created_at
});

export function createIdeaService(db) {
  const getRow = (brandId, ideaId) => {
    const row = db.prepare('SELECT * FROM ideas WHERE id = ? AND brand_id = ?').get(String(ideaId), brandId);
    if (!row) throw notFound('Fikir bulunamadı.');
    return row;
  };

  return {
    list(brandId, { category, favorite, limit = 200 } = {}) {
      let sql = 'SELECT * FROM ideas WHERE brand_id = ?';
      const args = [brandId];
      if (category) { sql += ' AND category = ?'; args.push(category); }
      if (favorite) sql += ' AND favorite = 1';
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
        favorite: 0, source, created_at: now()
      };
      db.prepare('INSERT INTO ideas (id, brand_id, title, description, category, favorite, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(row.id, row.brand_id, row.title, row.description, row.category, row.favorite, row.source, row.created_at);
      return toIdea(row);
    },

    update(brandId, ideaId, body) {
      const row = getRow(brandId, ideaId);
      const next = {
        title: 'title' in body ? text(body.title, { field: 'Fikir başlığı', max: 200, required: true }) : row.title,
        description: 'description' in body ? text(body.description, { field: 'Açıklama', max: 2000 }) : row.description,
        category: 'category' in body ? oneOf(body.category, Object.keys(IDEA_CATEGORIES), 'Kategori') : row.category,
        favorite: 'favorite' in body ? (body.favorite ? 1 : 0) : row.favorite
      };
      db.prepare('UPDATE ideas SET title = ?, description = ?, category = ?, favorite = ? WHERE id = ? AND brand_id = ?')
        .run(next.title, next.description, next.category, next.favorite, row.id, brandId);
      return toIdea(Object.assign(row, next));
    },

    remove(brandId, ideaId) {
      const row = getRow(brandId, ideaId);
      db.prepare('DELETE FROM ideas WHERE id = ? AND brand_id = ?').run(row.id, brandId);
    }
  };
}
