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

// Paylaşım sonucu alanları. Etkileşim oranı: (beğeni + yorum + 2×kaydetme + 3×paylaşım) / izlenme × 100
// (kaydetme ve paylaşım Instagram'da daha güçlü sinyal olduğu için ağırlıklı).
export const METRIC_FIELDS = { views: 'İzlenme / gösterim', reach: 'Erişim', likes: 'Beğeni', comments: 'Yorum', saves: 'Kaydetme', shares: 'Paylaşım', follows: 'Yeni takipçi' };
export function engagementRate(m) {
  if (!m || !m.views) return null;
  return Math.round(((m.likes || 0) + (m.comments || 0) + 2 * (m.saves || 0) + 3 * (m.shares || 0)) / m.views * 1000) / 10;
}
function cleanMetrics(v) {
  if (v == null || v === '') return '';
  if (typeof v !== 'object') throw badRequest('Paylaşım sonuçları geçersiz.');
  const out = {};
  for (const k of Object.keys(METRIC_FIELDS)) {
    if (v[k] === '' || v[k] == null) continue;
    const n = Number(v[k]);
    if (!Number.isFinite(n) || n < 0 || n > 1e10) throw badRequest(`${METRIC_FIELDS[k]} 0 ya da pozitif bir sayı olmalı.`);
    out[k] = Math.round(n);
  }
  if (!Object.keys(out).length) return '';
  out.at = now();
  return JSON.stringify(out);
}

// İçerik türüne göre varsayılan yapılacaklar (kart ilk açıldığında); kullanıcı adım ekleyip silebilir
export const CHECKLIST_DEFAULTS = {
  reels: ['Senaryo', 'Çekim', 'Kurgu', 'Kapak', 'Açıklama'],
  post: ['Metin', 'Tasarım', 'Açıklama', 'Son kontrol'],
  carousel: ['Metin', 'Slayt tasarımı', 'Açıklama', 'Son kontrol'],
  story: ['Metin', 'Tasarım', 'Etkileşim (anket/soru)', 'Son kontrol'],
  reklam: ['Metin', 'Tasarım', 'Hedef kitle ve bütçe', 'Onay'],
  grafik: ['Bilgi ve kaynak', 'Tasarım', 'Açıklama', 'Son kontrol']
};
const defaultChecklist = type => (CHECKLIST_DEFAULTS[type] || CHECKLIST_DEFAULTS.post).map(label => ({ label, done: false }));
function cleanChecklist(v) {
  if (!Array.isArray(v)) throw badRequest('Yapılacaklar listesi geçersiz.');
  return JSON.stringify(v.slice(0, 15).map(i => ({ label: String((i && i.label) || '').trim().slice(0, 60), done: Boolean(i && i.done) })).filter(i => i.label));
}
const cleanTags = v => (Array.isArray(v) ? v : String(v || '').split(/[\s,]+/)).map(h => String(h).trim().replace(/^#*/, '')).filter(Boolean).map(h => '#' + h.slice(0, 40)).slice(0, 30).join(' ');

// Taslak ve hazırlanıyor "bekleyen", tamamlandı ve yayınlandı "tamamlanan" sayılır
export const CONTENT_STATUSES = {
  taslak: 'Taslak',
  hazirlaniyor: 'Hazırlanıyor',
  onay: 'Onay bekliyor',
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
    scheduledAt: r.scheduled_at, notes: r.notes, ideaId: r.idea_id, reelsId: r.reels_id || null, postId: r.post_id || null, completedAt: r.completed_at,
    caption: r.caption || '', hashtags: r.hashtags ? r.hashtags.split(' ').filter(Boolean) : [], firstComment: r.first_comment || '',
    checklist: r.checklist ? parseJson(r.checklist, []) : defaultChecklist(r.type),
    metrics: r.metrics ? parseJson(r.metrics, null) : null, rate: r.metrics ? engagementRate(parseJson(r.metrics, null)) : null, hook: r.hook || '', theme: r.theme || '',
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

    getContent(id) { return toContent(getContentRow(id)); },

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
      if (body.caption || body.hashtags) {
        db.prepare('UPDATE contents SET caption = ?, hashtags = ? WHERE id = ?').run(text(body.caption, { field: 'Açıklama', max: 2200 }), cleanTags(body.hashtags), row.id);
      }
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
        notes: 'notes' in body ? text(body.notes, { field: 'Not', max: 2000 }) : row.notes,
        metrics: 'metrics' in body ? cleanMetrics(body.metrics) : (row.metrics || ''),
        hook: 'hook' in body ? text(body.hook, { field: 'Giriş cümlesi', max: 300 }) : (row.hook || ''),
        theme: 'theme' in body ? text(body.theme, { field: 'Tema', max: 60 }) : (row.theme || ''),
        caption: 'caption' in body ? text(body.caption, { field: 'Açıklama', max: 2200 }) : (row.caption || ''),
        hashtags: 'hashtags' in body ? cleanTags(body.hashtags) : (row.hashtags || ''),
        first_comment: 'firstComment' in body ? text(body.firstComment, { field: 'İlk yorum', max: 2200 }) : (row.first_comment || ''),
        checklist: 'checklist' in body ? cleanChecklist(body.checklist) : (row.checklist || '')
      };
      // Sayılar değişmediyse giriş zamanı korunur
      if ('metrics' in body && next.metrics && row.metrics) {
        const a = parseJson(row.metrics, {}); const b2 = parseJson(next.metrics, {});
        if (Object.keys(METRIC_FIELDS).every(k => a[k] === b2[k])) next.metrics = row.metrics;
      }
      // Tamamlanma zamanı: tamamlanan duruma ilk geçişte yazılır, geri alınınca silinir
      const wasDone = DONE_STATUSES.includes(row.status);
      const isDone = DONE_STATUSES.includes(next.status);
      next.completed_at = isDone ? (wasDone ? row.completed_at : now()) : null;
      if (next.brand_id !== row.brand_id) next.idea_id = null; else next.idea_id = row.idea_id;
      db.prepare(`UPDATE contents SET brand_id = ?, idea_id = ?, title = ?, type = ?, status = ?, scheduled_at = ?, notes = ?, completed_at = ?, metrics = ?, hook = ?, theme = ?,
        caption = ?, hashtags = ?, first_comment = ?, checklist = ?, updated_at = ? WHERE id = ?`)
        .run(next.brand_id, next.idea_id, next.title, next.type, next.status, next.scheduled_at, next.notes, next.completed_at, next.metrics, next.hook, next.theme,
          next.caption, next.hashtags, next.first_comment, next.checklist, now(), row.id);
      if (next.metrics && next.metrics !== row.metrics) brands.logActivity(next.brand_id, 'content.metrics', `Paylaşım sonucu girildi: ${next.title}`);
      // Marka değişince başka markanın senaryosuna/postuna bağlantı kalmaz
      if (next.brand_id !== row.brand_id) db.prepare('UPDATE contents SET reels_id = NULL, post_id = NULL WHERE id = ?').run(row.id);
      if (!wasDone && isDone) brands.logActivity(next.brand_id, 'content.completed', `${CONTENT_STATUSES[next.status]}: ${next.title}`);
      return toContent(getContentRow(row.id));
    },

    // "Ne işe yaradı": sonucu girilmiş içeriklerden özet (marka verilirse yalnızca o marka)
    performance({ brandId = null } = {}) {
      let sql = CONTENT_SELECT + " AND c.metrics <> ''";
      const args = [ownerId];
      if (brandId) { sql += ' AND c.brand_id = ?'; args.push(ownBrand(brandId).id); }
      const items = db.prepare(sql + ' ORDER BY c.scheduled_at DESC').all(...args).map(toContent).filter(c => c.metrics);
      const rated = items.filter(c => c.rate != null);
      const avg = list => (list.length ? Math.round(list.reduce((n, c) => n + c.rate, 0) / list.length * 10) / 10 : null);
      const group = key => {
        const m = new Map();
        rated.forEach(c => { const k = key(c); if (k == null || k === '') return; if (!m.has(k)) m.set(k, []); m.get(k).push(c); });
        return [...m.entries()].map(([k, list]) => ({ key: k, count: list.length, rate: avg(list) })).sort((a, b) => b.rate - a.rate);
      };
      const sum = k => items.reduce((n, c) => n + (c.metrics[k] || 0), 0);
      return {
        count: items.length,
        totals: Object.fromEntries(Object.keys(METRIC_FIELDS).map(k => [k, sum(k)])),
        averageRate: avg(rated),
        top: [...rated].sort((a, b) => b.rate - a.rate).slice(0, 5),
        bottom: rated.length > 5 ? [...rated].sort((a, b) => a.rate - b.rate).slice(0, 3) : [],
        byType: group(c => c.type).map(g => Object.assign(g, { label: CONTENT_TYPES[g.key] || g.key })),
        byTheme: group(c => c.theme),
        // Gün ve saat yerel saate göre arayüzde hesaplanır; burada ham yayın zamanları gönderilir
        times: rated.filter(c => c.scheduledAt).map(c => ({ at: c.scheduledAt, rate: c.rate })),
        hooks: [...rated].filter(c => c.hook).sort((a, b) => b.rate - a.rate).slice(0, 6).map(c => ({ hook: c.hook, rate: c.rate, title: c.title, type: c.typeLabel }))
      };
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
