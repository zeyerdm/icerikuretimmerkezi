// Aşama 5.12: Çöp kutusu. Silme, kaydın ve ona bağlı alt kayıtların (sürümler) anlık görüntüsü alınarak yapılır;
// ilişkili kayıtlardaki bağlantılar (ör. takvimdeki içeriğin tasarım bağlantısı) da not edilir. 30 gün içinde geri alınabilir.
// Görüntü alma ve silme aynı kayıt noktasında (SAVEPOINT) yapılır: silme reddedilirse (yetki, bulunamadı) çöpe de bir şey düşmez.
import { newId, now, notFound, badRequest } from '../lib/http.js';

export const TRASH_DAYS = 30;

// kind → tablo, başlık, alt kayıtlar (CASCADE ile silinenler), geri bağlantılar (SET NULL olanlar), geri alırken boşaltılabilir bağlar
export const TRASH_KINDS = {
  idea: { table: 'ideas', label: 'Fikir', title: r => r.title, backrefs: [['contents', 'idea_id']] },
  note: { table: 'notes', label: 'Not', title: r => r.title || String(r.body || '').slice(0, 80) },
  task: { table: 'tasks', label: 'Görev', title: r => r.title },
  content: { table: 'contents', label: 'Takvim içeriği', title: r => r.title, nullable: [['idea_id', 'ideas'], ['reels_id', 'reels'], ['post_id', 'posts']] },
  post: { table: 'posts', label: 'Tasarım', title: r => r.title, backrefs: [['contents', 'post_id']] },
  prompt: { table: 'prompts', label: 'Prompt', title: r => r.title, children: [['prompt_versions', 'prompt_id']] },
  reels: { table: 'reels', label: 'Reels senaryosu', title: r => r.title, children: [['reels_versions', 'reels_id']], backrefs: [['contents', 'reels_id']], nullable: [['pool_id', 'reels_pool']] },
  competitor: { table: 'competitors', label: 'Rakip', title: r => r.name },
  // 8.7: kütüphane görseli (dosyası .trash klasöründe bekler; kancalar dosyayı taşır)
  asset: { table: 'assets', label: 'Kütüphane görseli', title: r => r.label || r.file_name, file: true },
  pattern: { table: 'patterns', label: 'Reels kalıbı', title: r => r.title }
};

function insertRow(db, table, row) {
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map(c => row[c]));
}

// hooks: { [kind]: { restore(row), undo(row), drop(row) } } — dosyası olan kayıtlar (8.7 görseller) için
export function createTrashService(db, ownerId, hooks = {}) {
  // Kalıcı silinen dosyalı kayıtların saklanan dosyası da silinir
  const dropFiles = rows => rows.forEach(r => {
    const h = hooks[r.kind];
    if (!h || !h.drop) return;
    try { h.drop(JSON.parse(r.payload).row); } catch { /* dosya zaten yoksa sorun değil */ }
  });
  const purge = () => {
    const before = new Date(Date.now() - TRASH_DAYS * 864e5).toISOString();
    dropFiles(db.prepare("SELECT kind, payload FROM trash WHERE owner_id = ? AND deleted_at < ? AND kind = 'asset'").all(ownerId, before));
    db.prepare('DELETE FROM trash WHERE owner_id = ? AND deleted_at < ?').run(ownerId, before);
  };
  const toItem = r => {
    const k = TRASH_KINDS[r.kind] || {};
    return { id: r.id, kind: r.kind, kindLabel: k.label || r.kind, title: r.title, brandId: r.brand_id, brandName: r.brand_name || '', deletedAt: r.deleted_at,
      expiresAt: new Date(new Date(r.deleted_at).getTime() + TRASH_DAYS * 864e5).toISOString() };
  };

  return {
    // remove(): asıl silme (servisin kendi yetki kontrolüyle). Dönen değer çöp kaydının kimliği (yoksa null).
    capture(kind, id, remove) {
      const spec = TRASH_KINDS[kind];
      const row = db.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).get(String(id));
      db.exec('SAVEPOINT trash_capture');
      try {
        let trashId = null;
        if (row) {
          const children = (spec.children || []).map(([t, fk]) => ({ table: t, rows: db.prepare(`SELECT * FROM ${t} WHERE ${fk} = ?`).all(row.id) }));
          const backrefs = (spec.backrefs || []).map(([t, col]) => ({ table: t, col, ids: db.prepare(`SELECT id FROM ${t} WHERE ${col} = ?`).all(row.id).map(r => r.id) }));
          trashId = newId();
          const brandId = row.brand_id && db.prepare('SELECT 1 FROM brands WHERE id = ?').get(row.brand_id) ? row.brand_id : null;
          db.prepare('INSERT INTO trash (id, owner_id, brand_id, kind, title, payload, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(trashId, ownerId, brandId, kind, String(spec.title(row) || spec.label).slice(0, 200), JSON.stringify({ row, children, backrefs }), now());
        }
        remove();
        db.exec('RELEASE trash_capture');
        return trashId;
      } catch (err) {
        db.exec('ROLLBACK TO trash_capture');
        db.exec('RELEASE trash_capture');
        throw err;
      }
    },

    list({ brandId = null } = {}) {
      purge();
      let sql = 'SELECT t.*, b.name AS brand_name FROM trash t LEFT JOIN brands b ON b.id = t.brand_id WHERE t.owner_id = ?';
      const args = [ownerId];
      if (brandId) { sql += ' AND t.brand_id = ?'; args.push(String(brandId)); }
      return db.prepare(sql + ' ORDER BY t.deleted_at DESC').all(...args).map(toItem);
    },

    restore(trashId) {
      const t = db.prepare('SELECT * FROM trash WHERE id = ? AND owner_id = ?').get(String(trashId), ownerId);
      if (!t) throw notFound('Çöp kutusunda böyle bir kayıt yok (30 günü geçmiş olabilir).');
      const spec = TRASH_KINDS[t.kind];
      const { row, children = [], backrefs = [] } = JSON.parse(t.payload);
      if (db.prepare(`SELECT 1 FROM ${spec.table} WHERE id = ?`).get(row.id)) throw badRequest('Bu kayıt zaten geri alınmış.');
      if (row.brand_id && !db.prepare('SELECT 1 FROM brands WHERE id = ?').get(row.brand_id)) throw badRequest('Kaydın markası silinmiş; geri alınamaz.');
      // Bağlı olduğu kayıt (ör. içerik fikri) bu arada silinmişse bağlantı boşaltılır
      (spec.nullable || []).forEach(([col, table]) => { if (row[col] && !db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(row[col])) row[col] = null; });
      const h = hooks[t.kind];
      if (h && h.restore) h.restore(row);
      db.exec('SAVEPOINT trash_restore');
      try {
        insertRow(db, spec.table, row);
        children.forEach(c => c.rows.forEach(r => insertRow(db, c.table, r)));
        backrefs.forEach(br => br.ids.forEach(id => db.prepare(`UPDATE ${br.table} SET ${br.col} = ? WHERE id = ? AND ${br.col} IS NULL`).run(row.id, id)));
        db.prepare('DELETE FROM trash WHERE id = ?').run(t.id);
        db.exec('RELEASE trash_restore');
      } catch (err) {
        db.exec('ROLLBACK TO trash_restore');
        db.exec('RELEASE trash_restore');
        if (h && h.undo) h.undo(row);
        throw err;
      }
      return { kind: t.kind, id: row.id, brandId: row.brand_id || null, title: t.title };
    },

    remove(trashId) {
      dropFiles(db.prepare('SELECT kind, payload FROM trash WHERE id = ? AND owner_id = ?').all(String(trashId), ownerId));
      const r = db.prepare('DELETE FROM trash WHERE id = ? AND owner_id = ?').run(String(trashId), ownerId);
      if (!r.changes) throw notFound('Çöp kutusunda böyle bir kayıt yok.');
    },

    empty() {
      dropFiles(db.prepare("SELECT kind, payload FROM trash WHERE owner_id = ? AND kind = 'asset'").all(ownerId));
      return db.prepare('DELETE FROM trash WHERE owner_id = ?').run(ownerId).changes;
    }
  };
}
