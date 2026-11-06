// Yönetim merkezi verileri: içerik planı (takvim ve arşiv), görevler ve notlar.
// İçerikler her zaman bir markaya aittir; görev ve notlar markasız da olabilir.
// Bütün sorgular sahibe göre süzülür; başka kullanıcının ya da markanın kaydı görünmez.
import { badRequest, notFound, newId, now, text, oneOf, parseJson } from '../lib/http.js';

export const CONTENT_TYPES = {
  post: 'Instagram post',
  carousel: 'Carousel',
  story: 'Story',
  reels: 'Reels',
  reklam: 'Reklam',
  grafik: 'Bilgilendirici grafik'
};

// Taslak ve hazırlanıyor "bekleyen", tamamlandı ve yayınlandı "tamamlanan" sayılır
export const CONTENT_STATUSES = {
  taslak: 'Taslak',
  hazirlaniyor: 'Hazırlanıyor',
  tamamlandi: 'Tamamlandı',
  yayinlandi: 'Yayınlandı'
};
export const DONE_STATUSES = ['tamamlandi', 'yayinlandi'];

export const TASK_PRIORITIES = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
export const TASK_STATUSES = { yapilacak: 'Yapılacak', devam: 'Devam ediyor', tamamlandi: 'Tamamlandı' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

function dateOrNull(value, field, re = DATE) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !re.test(value) || Number.isNaN(Date.parse(value))) throw badRequest(`${field} geçersiz.`);
  return value;
}

export function createWorkspaceService(db, ownerId, brands) {
  // Marka bu kullanıcıya ait mi? (değilse 404; varlığı sızdırılmaz)
  const ownBrand = brandId => brands.get(brandId);
  const brandInfo = row => ({ brandId: row.brand_id, brandName: row.brand_name || null, brandColor: row.brand_colors ? (parseJson(row.brand_colors, {}).primary || null) : null });

  const toContent = r => Object.assign({
    id: r.id, title: r.title, type: r.type, typeLabel: CONTENT_TYPES[r.type] || r.type,
    status: r.status, statusLabel: CONTENT_STATUSES[r.status] || r.status, done: DONE_STATUSES.includes(r.status),
    scheduledAt: r.scheduled_at, notes: r.notes, ideaId: r.idea_id, completedAt: r.completed_at,
    createdAt: r.created_at, updatedAt: r.updated_at
  }, brandInfo(r));

  const toTask = r => Object.assign({
    id: r.id, title: r.title, description: r.description, dueDate: r.due_date,
    priority: r.priority, priorityLabel: TASK_PRIORITIES[r.priority] || r.priority,
    status: r.status, statusLabel: TASK_STATUSES[r.status] || r.status, done: r.status === 'tamamlandi',
    completedAt: r.completed_at, createdAt: r.created_at, updatedAt: r.updated_at
  }, brandInfo(r));

  const toNote = r => Object.assign({
    id: r.id, title: r.title, body: r.body, category: r.category, pinned: Boolean(r.pinned),
    createdAt: r.created_at, updatedAt: r.updated_at
  }, brandInfo(r));

  const CONTENT_SELECT = `SELECT c.*, b.name AS brand_name, b.colors AS brand_colors FROM contents c JOIN brands b ON b.id = c.brand_id WHERE b.owner_id = ?`;
  const TASK_SELECT = `SELECT t.*, b.name AS brand_name, b.colors AS brand_colors FROM tasks t LEFT JOIN brands b ON b.id = t.brand_id WHERE t.owner_id = ?`;
  const NOTE_SELECT = `SELECT n.*, b.name AS brand_name, b.colors AS brand_colors FROM notes n LEFT JOIN brands b ON b.id = n.brand_id WHERE n.owner_id = ?`;

  const getContentRow = id => {
    const row = db.prepare(CONTENT_SELECT + ' AND c.id = ?').get(ownerId, String(id));
    if (!row) throw notFound('İçerik bulunamadı.');
    return row;
  };
  const getTaskRow = id => {
    const row = db.prepare(TASK_SELECT + ' AND t.id = ?').get(ownerId, String(id));
    if (!row) throw notFound('Görev bulunamadı.');
    return row;
  };
  const getNoteRow = id => {
    const row = db.prepare(NOTE_SELECT + ' AND n.id = ?').get(ownerId, String(id));
    if (!row) throw notFound('Not bulunamadı.');
    return row;
  };

  const optionalBrand = value => (value == null || value === '' ? null : ownBrand(value).id);

  const service = {
    // --- İçerik planı ---
    listContents({ brandId, from, to, status, type, unscheduled, limit = 2000 } = {}) {
      let sql = CONTENT_SELECT;
      const args = [ownerId];
      if (brandId) { sql += ' AND c.brand_id = ?'; args.push(ownBrand(brandId).id); }
      if (from) { sql += ' AND c.scheduled_at >= ?'; args.push(String(from)); }
      if (to) { sql += ' AND c.scheduled_at < ?'; args.push(String(to)); }
      if (unscheduled) sql += ' AND c.scheduled_at IS NULL';
      if (status) { sql += ' AND c.status = ?'; args.push(oneOf(status, Object.keys(CONTENT_STATUSES), 'Durum')); }
      if (type) { sql += ' AND c.type = ?'; args.push(oneOf(type, Object.keys(CONTENT_TYPES), 'İçerik türü')); }
      sql += ' ORDER BY COALESCE(c.scheduled_at, c.created_at) DESC, c.rowid DESC LIMIT ?';
      args.push(limit);
      return db.prepare(sql).all(...args).map(toContent);
    },

    createContent(body) {
      const brand = ownBrand(body.brandId);
      const status = body.status == null ? 'taslak' : oneOf(body.status, Object.keys(CONTENT_STATUSES), 'Durum');
      let ideaId = null;
      if (body.ideaId) {
        const idea = db.prepare('SELECT id FROM ideas WHERE id = ? AND brand_id = ?').get(String(body.ideaId), brand.id);
        if (!idea) throw badRequest('Bağlanmak istenen fikir bu markaya ait değil.');
        ideaId = idea.id;
      }
      const t = now();
      const row = {
        id: newId(), brand_id: brand.id, idea_id: ideaId,
        title: text(body.title, { field: 'Başlık', max: 200, required: true }),
        type: oneOf(body.type, Object.keys(CONTENT_TYPES), 'İçerik türü'),
        status, scheduled_at: dateOrNull(body.scheduledAt, 'Yayın tarihi', DATETIME),
        notes: text(body.notes, { field: 'Not', max: 2000 }),
        completed_at: DONE_STATUSES.includes(status) ? t : null, created_at: t, updated_at: t
      };
      db.prepare(`INSERT INTO contents (id, brand_id, idea_id, title, type, status, scheduled_at, notes, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.brand_id, row.idea_id, row.title, row.type, row.status, row.scheduled_at, row.notes, row.completed_at, row.created_at, row.updated_at);
      brands.logActivity(brand.id, 'content.created', `${CONTENT_TYPES[row.type]} planlandı: ${row.title}`);
      return toContent(getContentRow(row.id));
    },

    updateContent(id, body) {
      const row = getContentRow(id);
      const next = {
        brand_id: 'brandId' in body ? ownBrand(body.brandId).id : row.brand_id,
        title: 'title' in body ? text(body.title, { field: 'Başlık', max: 200, required: true }) : row.title,
        type: 'type' in body ? oneOf(body.type, Object.keys(CONTENT_TYPES), 'İçerik türü') : row.type,
        status: 'status' in body ? oneOf(body.status, Object.keys(CONTENT_STATUSES), 'Durum') : row.status,
        scheduled_at: 'scheduledAt' in body ? dateOrNull(body.scheduledAt, 'Yayın tarihi', DATETIME) : row.scheduled_at,
        notes: 'notes' in body ? text(body.notes, { field: 'Not', max: 2000 }) : row.notes
      };
      // Tamamlanma zamanı: tamamlanan duruma ilk geçişte yazılır, geri alınınca silinir
      const wasDone = DONE_STATUSES.includes(row.status);
      const isDone = DONE_STATUSES.includes(next.status);
      next.completed_at = isDone ? (wasDone ? row.completed_at : now()) : null;
      if (next.brand_id !== row.brand_id) next.idea_id = null; else next.idea_id = row.idea_id;
      db.prepare(`UPDATE contents SET brand_id = ?, idea_id = ?, title = ?, type = ?, status = ?, scheduled_at = ?, notes = ?, completed_at = ?, updated_at = ? WHERE id = ?`)
        .run(next.brand_id, next.idea_id, next.title, next.type, next.status, next.scheduled_at, next.notes, next.completed_at, now(), row.id);
      if (!wasDone && isDone) brands.logActivity(next.brand_id, 'content.completed', `${CONTENT_STATUSES[next.status]}: ${next.title}`);
      return toContent(getContentRow(row.id));
    },

    deleteContent(id) {
      const row = getContentRow(id);
      db.prepare('DELETE FROM contents WHERE id = ?').run(row.id);
    },

    // --- Görevler ---
    listTasks({ brandId, status } = {}) {
      let sql = TASK_SELECT;
      const args = [ownerId];
      if (brandId) { sql += ' AND t.brand_id = ?'; args.push(ownBrand(brandId).id); }
      if (status) { sql += ' AND t.status = ?'; args.push(oneOf(status, Object.keys(TASK_STATUSES), 'Durum')); }
      // Açık görevler önce; son tarihi yakın olan ve önceliği yüksek olan üstte
      sql += ` ORDER BY (t.status = 'tamamlandi'), CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date,
        CASE t.priority WHEN 'yuksek' THEN 0 WHEN 'orta' THEN 1 ELSE 2 END, t.created_at DESC`;
      return db.prepare(sql).all(...args).map(toTask);
    },

    createTask(body) {
      const t = now();
      const status = body.status == null ? 'yapilacak' : oneOf(body.status, Object.keys(TASK_STATUSES), 'Durum');
      const row = {
        id: newId(), brand_id: optionalBrand(body.brandId),
        title: text(body.title, { field: 'Görev', max: 200, required: true }),
        description: text(body.description, { field: 'Açıklama', max: 2000 }),
        due_date: dateOrNull(body.dueDate, 'Son tarih'),
        priority: body.priority == null ? 'orta' : oneOf(body.priority, Object.keys(TASK_PRIORITIES), 'Öncelik'),
        status, completed_at: status === 'tamamlandi' ? t : null
      };
      db.prepare(`INSERT INTO tasks (id, owner_id, brand_id, title, description, due_date, priority, status, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, ownerId, row.brand_id, row.title, row.description, row.due_date, row.priority, row.status, row.completed_at, t, t);
      brands.logActivity(row.brand_id, 'task.created', `Görev eklendi: ${row.title}`);
      return toTask(getTaskRow(row.id));
    },

    updateTask(id, body) {
      const row = getTaskRow(id);
      const next = {
        brand_id: 'brandId' in body ? optionalBrand(body.brandId) : row.brand_id,
        title: 'title' in body ? text(body.title, { field: 'Görev', max: 200, required: true }) : row.title,
        description: 'description' in body ? text(body.description, { field: 'Açıklama', max: 2000 }) : row.description,
        due_date: 'dueDate' in body ? dateOrNull(body.dueDate, 'Son tarih') : row.due_date,
        priority: 'priority' in body ? oneOf(body.priority, Object.keys(TASK_PRIORITIES), 'Öncelik') : row.priority,
        status: 'status' in body ? oneOf(body.status, Object.keys(TASK_STATUSES), 'Durum') : row.status
      };
      const wasDone = row.status === 'tamamlandi';
      const isDone = next.status === 'tamamlandi';
      next.completed_at = isDone ? (wasDone ? row.completed_at : now()) : null;
      db.prepare('UPDATE tasks SET brand_id = ?, title = ?, description = ?, due_date = ?, priority = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .run(next.brand_id, next.title, next.description, next.due_date, next.priority, next.status, next.completed_at, now(), row.id, ownerId);
      if (!wasDone && isDone) brands.logActivity(next.brand_id, 'task.completed', `Görev tamamlandı: ${next.title}`);
      return toTask(getTaskRow(row.id));
    },

    deleteTask(id) {
      const row = getTaskRow(id);
      db.prepare('DELETE FROM tasks WHERE id = ? AND owner_id = ?').run(row.id, ownerId);
    },

    // --- Notlar ---
    listNotes({ brandId, category, q } = {}) {
      let sql = NOTE_SELECT;
      const args = [ownerId];
      if (brandId) { sql += ' AND n.brand_id = ?'; args.push(ownBrand(brandId).id); }
      if (category) { sql += ' AND n.category = ?'; args.push(String(category)); }
      if (q) { sql += ' AND (n.title LIKE ? OR n.body LIKE ?)'; const like = '%' + String(q).slice(0, 100) + '%'; args.push(like, like); }
      sql += ' ORDER BY n.pinned DESC, n.updated_at DESC';
      return db.prepare(sql).all(...args).map(toNote);
    },

    noteCategories() {
      return db.prepare("SELECT DISTINCT category FROM notes WHERE owner_id = ? AND category != '' ORDER BY category").all(ownerId).map(r => r.category);
    },

    createNote(body) {
      const t = now();
      const row = {
        id: newId(), brand_id: optionalBrand(body.brandId),
        title: text(body.title, { field: 'Başlık', max: 120 }),
        body: text(body.body, { field: 'Not', max: 5000, required: true }),
        category: text(body.category, { field: 'Kategori', max: 40 }),
        pinned: body.pinned ? 1 : 0
      };
      db.prepare('INSERT INTO notes (id, owner_id, brand_id, title, body, category, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(row.id, ownerId, row.brand_id, row.title, row.body, row.category, row.pinned, t, t);
      return toNote(getNoteRow(row.id));
    },

    updateNote(id, body) {
      const row = getNoteRow(id);
      const next = {
        brand_id: 'brandId' in body ? optionalBrand(body.brandId) : row.brand_id,
        title: 'title' in body ? text(body.title, { field: 'Başlık', max: 120 }) : row.title,
        body: 'body' in body ? text(body.body, { field: 'Not', max: 5000, required: true }) : row.body,
        category: 'category' in body ? text(body.category, { field: 'Kategori', max: 40 }) : row.category,
        pinned: 'pinned' in body ? (body.pinned ? 1 : 0) : row.pinned
      };
      db.prepare('UPDATE notes SET brand_id = ?, title = ?, body = ?, category = ?, pinned = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .run(next.brand_id, next.title, next.body, next.category, next.pinned, now(), row.id, ownerId);
      return toNote(getNoteRow(row.id));
    },

    deleteNote(id) {
      const row = getNoteRow(id);
      db.prepare('DELETE FROM notes WHERE id = ? AND owner_id = ?').run(row.id, ownerId);
    }
  };
  return service;
}
