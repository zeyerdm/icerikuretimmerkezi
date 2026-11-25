// Toplu üretim kuyruğu: seçilen fikirler sıraya alınır, her biri bağımsız işlenir (kendi başlığı, metni, sayfaları ve
// üretim kaydı). Şablon ortak, içerik verisi ayrıdır. Bir işte hata diğerlerini durdurmaz; hata alan iş bir kez daha
// denenir, yine olmazsa "hata" kalır. Kuyruk durdurulabilir, devam ettirilebilir, tek tek yeniden işlenebilir.
// Aynı fikir bekleyen, işlenen ya da tamamlanmış bir işte varsa yeniden kuyruğa alınmaz (çift üretim engeli).
import { newId, now, badRequest, notFound, parseJson, text } from '../lib/http.js';
import { markIdeaUsed } from './ideas.js';

export const JOB_STATUS = { bekliyor: 'Bekliyor', isleniyor: 'İşleniyor', tamamlandi: 'Tamamlandı', hata: 'Hata oluştu', yeniden: 'Yeniden denenecek', durduruldu: 'Durduruldu' };
const MAX_BATCH = 50;
const MAX_ATTEMPTS = 2;
const TYPE_SQL = `(CASE WHEN options LIKE '%"type":"reels"%' THEN 'reels' ELSE 'post' END)`;
const typeOf = t => (t === 'reels' ? 'reels' : 'post');

// Kontrollü paralellik: aynı anda en çok `concurrency` iş (varsayılan 2). Ücretsiz kotalı sağlayıcıda dakikalık sınıra
// çarpmamak için düşük tutulur; her iş kendi içinde yine sırayla ilerler.
export const QUEUE_CONCURRENCY = 2;
export function createGenQueue({ db, brands, posts, ideas, getPrompts = () => null, autostart = true, concurrency = QUEUE_CONCURRENCY }) {
  // Sunucu yeniden başlarsa yarıda kalan işler kuyruğa döner
  db.prepare("UPDATE gen_jobs SET status = 'bekliyor', updated_at = ? WHERE status = 'isleniyor'").run(now());
  let active = 0;
  const limit = Math.max(1, Math.min(4, Number(concurrency) || 1));
  let stopped = !autostart;

  const toJob = r => {
    const idea = db.prepare('SELECT title, category, format FROM ideas WHERE id = ?').get(r.idea_id);
    const post = r.post_id ? db.prepare('SELECT title FROM posts WHERE id = ?').get(r.post_id) : null;
    const pr = r.prompt_id ? db.prepare('SELECT title FROM prompts WHERE id = ?').get(r.prompt_id) : null;
    const o = parseJson(r.options, {}) || {};
    return { id: r.id, type: o.type === 'reels' ? 'reels' : 'post', promptId: r.prompt_id || null, promptTitle: pr ? pr.title : '', batchId: r.batch_id, ideaId: r.idea_id, ideaTitle: idea ? idea.title : '(silinmiş fikir)', templateId: r.template_id, templateVersion: r.template_version,
      status: r.status, statusLabel: JOB_STATUS[r.status] || r.status, error: r.error, postId: r.post_id, postTitle: post ? post.title : '', attempts: r.attempts, createdAt: r.created_at, updatedAt: r.updated_at };
  };

  // İşçi: sıradaki işi alır (seçme ve "işleniyor" yapma arasında bekleme yok; aynı iş iki işçiye düşmez)
  async function worker() {
    try {
      for (;;) {
        if (stopped) break;
        const r = db.prepare("SELECT * FROM gen_jobs WHERE status IN ('bekliyor', 'yeniden') ORDER BY status = 'yeniden', created_at, rowid LIMIT 1").get();
        if (!r) break;
        const claim = db.prepare("UPDATE gen_jobs SET status = 'isleniyor', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status IN ('bekliyor', 'yeniden')").run(now(), r.id);
        if (!claim.changes) continue;
        const o = parseJson(r.options, {});
        try {
          // Toplu Reels: fikirden senaryo planı + Flow şablonuna dökülen sahneler (Prompt Studio'da kaydedilir); fikir "kullanıldı" olur
          if (o.type === 'reels') {
            const prompts = getPrompts();
            if (!prompts) throw new Error('Prompt Studio kullanılamıyor.');
            const idea = db.prepare('SELECT title, description FROM ideas WHERE id = ?').get(r.idea_id);
            if (!idea) throw new Error('Fikir bulunamadı.');
            const brief = idea.title + (idea.description ? `\n${idea.description}` : '');
            const pl = await prompts.plan(r.brand_id, { brief, scenes: o.scenes || 4, modelRef: o.modelRef || null });
            const p = await prompts.create(r.brand_id, { kind: 'reels', brief, plan: pl.plan, modelRef: o.modelRef || null });
            db.prepare("UPDATE gen_jobs SET status = 'tamamlandi', error = '', prompt_id = ?, updated_at = ? WHERE id = ?").run(p.id, now(), r.id);
            try { markIdeaUsed(db, r.brand_id, r.idea_id, 'reels'); } catch { /* fikir silinmiş olabilir */ }
            continue;
          }
          const res = await posts.fromIdea(r.brand_id, { ideaId: r.idea_id, templateId: r.template_id || null, templateVersion: r.template_version || null, slides: o.slides || null, mascot: o.mascot || 'auto', modelRef: o.modelRef || null });
          // İş bu sırada durdurulduysa sonuç yine kaydedilir (üretim tamamlandı)
          db.prepare("UPDATE gen_jobs SET status = 'tamamlandi', error = '', post_id = ?, updated_at = ? WHERE id = ?").run(res.post.id, now(), r.id);
        } catch (err) {
          const cur = db.prepare('SELECT attempts, status FROM gen_jobs WHERE id = ?').get(r.id);
          if (!cur) continue;
          const next = cur.status === 'durduruldu' ? 'durduruldu' : cur.attempts >= MAX_ATTEMPTS ? 'hata' : 'yeniden';
          db.prepare('UPDATE gen_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(next, String(err && err.message || err).slice(0, 300), now(), r.id);
        }
      }
    } finally { active--; }
  }
  function work() {
    if (stopped) return;
    const waiting = db.prepare("SELECT COUNT(*) AS n FROM gen_jobs WHERE status IN ('bekliyor', 'yeniden')").get().n;
    while (active < limit && active < waiting) { active++; worker().catch(() => {}); }
  }
  const kick = () => { setImmediate(work); };

  return {
    statuses: JOB_STATUS,
    // Fikirleri kuyruğa alır: doğrudan kimliklerle ya da tür/kategori süzgeciyle (kullanılmamış, arşivlenmemiş fikirler)
    createBatch(brandId, { ideaIds = null, category = null, format = null, templateId = null, templateVersion = null, slides = null, mascot = 'auto', modelRef = null, force = false, type = 'post', scenes = null } = {}) {
      const reels = type === 'reels';
      const b = brands.get(brandId);
      let list;
      if (Array.isArray(ideaIds) && ideaIds.length) list = ideaIds.map(String);
      else {
        list = db.prepare("SELECT id FROM ideas WHERE brand_id = ? AND archived = 0 AND (used_at IS NULL OR used_at = '')" + (category ? ' AND category = ?' : '') + (format ? ' AND format = ?' : '') + ' ORDER BY created_at').all(...[b.id, category, format].filter(Boolean)).map(r => r.id);
      }
      list = [...new Set(list)].slice(0, MAX_BATCH);
      if (!list.length) throw badRequest('Kuyruğa alınacak fikir yok. Fikir seç ya da süzgeci değiştir.');
      if (templateId && !db.prepare('SELECT 1 FROM post_templates WHERE id = ? AND brand_id = ?').get(String(templateId), b.id)) throw notFound('Şablon bulunamadı.');
      const batchId = newId();
      const added = []; const skipped = [];
      const opts = JSON.stringify({ type: reels ? 'reels' : 'post', scenes: reels ? Math.max(1, Math.min(6, Number(scenes) || 4)) : null, slides: Number(slides) || null, mascot: ['auto', 'manual', 'none'].includes(mascot) ? mascot : 'auto', modelRef: text(modelRef, { field: 'Model', max: 200 }) || null });
      for (const id of list) {
        const idea = db.prepare('SELECT id, title FROM ideas WHERE id = ? AND brand_id = ?').get(id, b.id);
        if (!idea) { skipped.push({ ideaId: id, reason: 'Fikir bulunamadı' }); continue; }
        // Çift üretim engeli tür başına: aynı fikirden hem post hem Reels üretilebilir
        const dup = db.prepare("SELECT status FROM gen_jobs WHERE brand_id = ? AND idea_id = ? AND status IN ('bekliyor', 'isleniyor', 'yeniden', 'tamamlandi') AND (CASE WHEN options LIKE '%\"type\":\"reels\"%' THEN 'reels' ELSE 'post' END) = ? LIMIT 1").get(b.id, id, reels ? 'reels' : 'post');
        if (dup && !force) { skipped.push({ ideaId: id, title: idea.title, reason: dup.status === 'tamamlandi' ? 'Daha önce üretildi' : 'Zaten kuyrukta' }); continue; }
        const t = now();
        db.prepare('INSERT INTO gen_jobs (id, brand_id, batch_id, idea_id, template_id, template_version, options, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(newId(), b.id, batchId, id, templateId || null, Number(templateVersion) || null, opts, 'bekliyor', t, t);
        added.push({ ideaId: id, title: idea.title });
      }
      if (added.length) { brands.logActivity(b.id, 'queue.created', `${added.length} fikir toplu ${reels ? 'Reels' : 'üretim'} kuyruğuna alındı`); kick(); }
      return { batchId, added, skipped };
    },
    // type: 'post' (Post stüdyosu) ya da 'reels' (Prompt Studio); her ekran yalnız kendi işlerini görür
    list(brandId, { batchId = null, type = 'post' } = {}) {
      const b = brands.get(brandId);
      const rows = batchId ? db.prepare(`SELECT * FROM gen_jobs WHERE brand_id = ? AND batch_id = ? AND ${TYPE_SQL} = ? ORDER BY created_at, rowid`).all(b.id, String(batchId), typeOf(type))
        : db.prepare(`SELECT * FROM gen_jobs WHERE brand_id = ? AND ${TYPE_SQL} = ? ORDER BY created_at DESC, rowid DESC LIMIT 200`).all(b.id, typeOf(type));
      return rows.map(toJob);
    },
    // Kuyruk özetleri (son 10 toplu üretim)
    batches(brandId, { type = 'post' } = {}) {
      const b = brands.get(brandId);
      return db.prepare('SELECT batch_id, MIN(created_at) AS created_at, COUNT(*) AS total, SUM(status = \'tamamlandi\') AS done, SUM(status = \'hata\') AS failed, SUM(status IN (\'bekliyor\', \'yeniden\')) AS waiting, SUM(status = \'isleniyor\') AS working, SUM(status = \'durduruldu\') AS paused FROM gen_jobs WHERE brand_id = ? AND ' + TYPE_SQL + ' = ? GROUP BY batch_id ORDER BY created_at DESC LIMIT 10').all(b.id, typeOf(type))
        .map(r => ({ batchId: r.batch_id, createdAt: r.created_at, total: r.total, done: r.done || 0, failed: r.failed || 0, waiting: r.waiting || 0, working: r.working || 0, paused: r.paused || 0 }));
    },
    pause(brandId, batchId) { const b = brands.get(brandId); const r = db.prepare("UPDATE gen_jobs SET status = 'durduruldu', updated_at = ? WHERE brand_id = ? AND batch_id = ? AND status IN ('bekliyor', 'yeniden')").run(now(), b.id, String(batchId)); return { changed: r.changes }; },
    resume(brandId, batchId) { const b = brands.get(brandId); const r = db.prepare("UPDATE gen_jobs SET status = 'bekliyor', updated_at = ? WHERE brand_id = ? AND batch_id = ? AND status = 'durduruldu'").run(now(), b.id, String(batchId)); kick(); return { changed: r.changes }; },
    cancel(brandId, batchId) { const b = brands.get(brandId); const r = db.prepare("DELETE FROM gen_jobs WHERE brand_id = ? AND batch_id = ? AND status IN ('bekliyor', 'yeniden', 'durduruldu')").run(b.id, String(batchId)); return { removed: r.changes }; },
    retry(brandId, jobId) {
      const b = brands.get(brandId);
      const r = db.prepare('SELECT * FROM gen_jobs WHERE id = ? AND brand_id = ?').get(String(jobId), b.id);
      if (!r) throw notFound('İş bulunamadı.');
      if (r.status === 'isleniyor') throw badRequest('Bu iş şu an işleniyor.');
      if (r.status === 'tamamlandi') throw badRequest('Bu iş tamamlandı; yeniden üretmek için fikri yeniden kuyruğa al.');
      db.prepare("UPDATE gen_jobs SET status = 'bekliyor', attempts = 0, error = '', updated_at = ? WHERE id = ?").run(now(), r.id);
      kick();
      return toJob(db.prepare('SELECT * FROM gen_jobs WHERE id = ?').get(r.id));
    },
    start() { stopped = false; kick(); },
    idle: () => active === 0,
    concurrency: limit
  };
}
