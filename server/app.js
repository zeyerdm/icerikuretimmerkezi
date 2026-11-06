// Uygulama kurulumu: veritabanı, servisler, güvenlik katmanı ve API rotaları.
// createApp testlerde geçici veritabanı ve sahte AI sağlayıcısıyla da kurulabilir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import { errorHandler, newId, now, badRequest, text, oneOf, route, HttpError } from './lib/http.js';
import { createAiService } from './services/ai/index.js';
import { createBrandService, identityCompleteness, PROFILE_FIELDS, FONT_OPTIONS } from './services/brands.js';
import { createAssetService, ASSET_CATEGORIES, MAX_ASSET_BYTES } from './services/assets.js';
import { createIdeaService, IDEA_CATEGORIES } from './services/ideas.js';
import { createAssistantService } from './services/assistant.js';
import { createWorkspaceService, CONTENT_TYPES, CONTENT_STATUSES, DONE_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from './services/workspace.js';
import { transaction } from './db.js';
import { createBackupService } from './services/backup.js';
import { checkForUpdate, readVersion, readConfig, previousVersion, UpdateError, RESTART_CODES } from '../scripts/updater.js';
import { DEMO_BRAND, DEMO_ASSETS, DEMO_IDEAS, DEMO_CONTENTS, DEMO_TASKS, DEMO_NOTES, demoAssetBuffer } from './demo/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function createSettingsStore(db) {
  return {
    get: key => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) || {}).value,
    set: (key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),
    remove: key => db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  };
}

// Bu kurulumun sahibi: yerel kullanımda tek kullanıcı. Markalar ona bağlıdır;
// çok kullanıcılı kullanıma geçildiğinde buradaki kullanıcı oturumdan gelir.
function ensureOwner(db) {
  const row = db.prepare('SELECT id FROM users ORDER BY created_at LIMIT 1').get();
  if (row) return row.id;
  const id = newId();
  db.prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)').run(id, 'Sahip', now());
  return id;
}

// Yerel sunucu güvenliği: yalnızca localhost adına gelen istekler kabul edilir (DNS rebinding'e karşı)
// ve veri değiştiren istekler başka bir siteden gönderilemez (CSRF'ye karşı).
function localOnly(req, res, next) {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(host)) return res.status(403).json({ error: { code: 'FORBIDDEN_HOST', message: 'Bu sunucu yalnızca bu bilgisayardan kullanılabilir.' } });
  const origin = req.headers.origin;
  if (origin && !['GET', 'HEAD'].includes(req.method)) {
    let ok = false;
    try { ok = LOCAL_HOSTS.has(new URL(origin).hostname) || LOCAL_HOSTS.has('[' + new URL(origin).hostname + ']'); } catch { ok = false; }
    if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Başka bir siteden gelen istek reddedildi.' } });
  }
  next();
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  next();
}

const TOKEN_SETTING = 'update.githubToken';

export function createApp({ dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'), root = ROOT, aiProvider, fetchImpl, updateFetch, restart = code => process.exit(code) } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'app.db'));
  const ownerId = ensureOwner(db);
  const settings = createSettingsStore(db);
  const ai = createAiService(settings, { provider: aiProvider, fetchImpl });
  const brands = createBrandService(db, ownerId);
  const assets = createAssetService(db, path.join(dataDir, 'uploads'));
  const ideas = createIdeaService(db);
  const assistant = createAssistantService({ db, ai, brands, ideas });
  const workspace = createWorkspaceService(db, ownerId, brands);
  const backups = createBackupService({ db, dataDir, settings });

  const app = express();
  app.disable('x-powered-by');
  app.use(localOnly, securityHeaders);
  app.use(express.json({ limit: '200kb' }));

  const api = express.Router();

  api.get('/health', (req, res) => res.json({ ok: true }));

  // Arayüzün ihtiyaç duyduğu sabit listeler (kategoriler, fontlar, alan adları)
  api.get('/meta', (req, res) => res.json({
    profileFields: Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([k, v]) => [k, { label: v.label, max: v.max, required: Boolean(v.required) }])),
    fonts: FONT_OPTIONS,
    assetCategories: ASSET_CATEGORIES,
    ideaCategories: IDEA_CATEGORIES,
    contentTypes: CONTENT_TYPES,
    contentStatuses: CONTENT_STATUSES,
    doneStatuses: DONE_STATUSES,
    taskPriorities: TASK_PRIORITIES,
    taskStatuses: TASK_STATUSES,
    maxAssetBytes: MAX_ASSET_BYTES
  }));

  // --- Ayarlar (AI anahtarı yalnızca yazılır, hiçbir zaman geri okunmaz) ---
  api.get('/settings', (req, res) => res.json({ ai: ai.status(), activeBrandId: settings.get('ui.activeBrandId') || null }));

  api.put('/settings/ai', (req, res) => {
    const body = req.body || {};
    if ('apiKey' in body) {
      const key = text(body.apiKey, { field: 'API anahtarı', max: 300, required: true }).replace(/\s+/g, '');
      if (key.length < 20) throw badRequest('Bu bir API anahtarına benzemiyor.');
      ai.setApiKey(key);
    }
    if ('model' in body) ai.setModel(oneOf(body.model, ai.models, 'Model'));
    res.json({ ai: ai.status() });
  });

  api.delete('/settings/ai/key', (req, res) => { ai.clearApiKey(); res.json({ ai: ai.status() }); });

  api.post('/settings/ai/test', route(async (req, res) => res.json({ result: await ai.test(), ai: ai.status() })));

  api.put('/settings/active-brand', (req, res) => {
    const brand = brands.get(req.body && req.body.brandId);
    settings.set('ui.activeBrandId', brand.id);
    res.json({ activeBrandId: brand.id });
  });

  // --- Sürüm ve güncelleme ---
  // Güncellemenin kendisi başlatıcıda (scripts/start.js) yapılır: sunucu yeniden başlatılınca
  // son sürüm indirilir. Burada yalnızca durum, kontrol ve yeniden başlatma vardır.
  const updateToken = () => process.env.GITHUB_TOKEN || settings.get(TOKEN_SETTING) || '';
  const systemInfo = () => {
    const v = readVersion(root);
    const prev = previousVersion(root);
    return {
      version: readConfig(root).version, sha: v.sha, updatedAt: v.updatedAt, instance: root,
      supervised: process.env.SUPERVISED === '1', tokenConfigured: Boolean(updateToken()),
      skippedSha: v.skipSha || null, rolledBackAt: v.rolledBackAt || null,
      previous: prev ? { sha: prev.sha, updatedAt: prev.updatedAt } : null
    };
  };

  api.get('/system', (req, res) => res.json(systemInfo()));

  api.post('/system/check', route(async (req, res) => {
    try {
      res.json(Object.assign(await checkForUpdate({ root, token: updateToken(), fetchImpl: updateFetch }), { system: systemInfo() }));
    } catch (err) {
      if (err instanceof UpdateError) throw new HttpError(502, 'UPDATE_' + err.code, err.message);
      throw err;
    }
  }));

  const requireSupervisor = () => {
    if (process.env.SUPERVISED !== '1') {
      throw new HttpError(409, 'NOT_SUPERVISED', 'Uygulama Baslat dosyasıyla açılmadı. Pencereyi kapatıp Baslat dosyasına çift tıkla; güncelleme açılışta kendiliğinden yapılır.');
    }
  };

  // Yeniden başlat ve güncelle. force: daha önce geri alınmış (atlanan) sürüm olsa da güncelle.
  api.post('/system/restart', (req, res) => {
    requireSupervisor();
    res.status(202).json({ restarting: true });
    setTimeout(() => restart(req.body && req.body.force ? RESTART_CODES.forceUpdate : RESTART_CODES.restart), 400);
  });

  // Önceki sürüme dön: başlatıcı eski dosyaları geri koyar ve bu sürümü atlar
  api.post('/system/rollback', (req, res) => {
    requireSupervisor();
    if (!previousVersion(root)) throw new HttpError(409, 'NO_PREVIOUS', 'Dönülebilecek önceki bir sürüm yok (henüz bu bilgisayarda hiç güncelleme yapılmadı).');
    res.status(202).json({ restarting: true });
    setTimeout(() => restart(RESTART_CODES.rollback), 400);
  });

  api.put('/settings/update-token', (req, res) => {
    const token = text(req.body && req.body.token, { field: 'Erişim anahtarı', max: 300, required: true }).replace(/\s+/g, '');
    if (token.length < 20) throw badRequest('Bu bir GitHub erişim anahtarına benzemiyor.');
    settings.set(TOKEN_SETTING, token);
    res.json({ system: systemInfo() });
  });

  api.delete('/settings/update-token', (req, res) => { settings.remove(TOKEN_SETTING); res.json({ system: systemInfo() }); });

  // --- Yedekler ---
  const backupInfo = () => Object.assign({ backups: backups.list() }, backups.status());
  api.get('/backups', (req, res) => res.json(backupInfo()));
  api.post('/backups', (req, res) => {
    const backup = backups.create('elle');
    res.status(201).json(Object.assign({ backup }, backupInfo()));
  });
  api.put('/settings/backup', (req, res) => {
    backups.setCopyDir(req.body && req.body.copyDir);
    const r = backupInfo();
    // Klasör yeni seçildiyse son yedek hemen oraya da kopyalanır
    if (r.copyDir && r.backups[0]) { backups.copyOut(r.backups[0].name); Object.assign(r, backups.status()); }
    res.json(r);
  });
  // Yedek dosyasından geri yükleme (başka bilgisayardan ya da Drive'dan indirilen .zip)
  api.post('/backups/restore-upload', express.raw({ type: () => true, limit: '2gb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Yedek dosyası seçilmedi.');
    const result = backups.restoreBuffer(req.body);
    brands.logActivity(null, 'backup.restored', 'Yedek dosyasından geri yüklendi');
    res.json(Object.assign({ result }, backupInfo()));
  });
  api.get('/backups/:name', (req, res) => {
    const file = backups.file(req.params.name);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
    res.sendFile(file);
  });
  api.post('/backups/:name/restore', (req, res) => {
    const result = backups.restore(req.params.name);
    brands.logActivity(null, 'backup.restored', `Yedekten geri yüklendi: ${req.params.name}`);
    res.json(Object.assign({ result }, backupInfo()));
  });
  api.delete('/backups/:name', (req, res) => { backups.remove(req.params.name); res.json(backupInfo()); });

  // --- Yönetim merkezi ---
  // Ham kayıtlar gönderilir; günlere/haftalara bölme kullanıcının saat dilimine göre arayüzde yapılır.
  // brandId verilirse yalnızca o markanın verisi döner (marka analizleri).
  const brandSummary = b => {
    const logo = assets.list(b.id, 'logo')[0];
    const counts = brands.assetCounts(b.id);
    const c = db.prepare(`SELECT COUNT(*) AS total, SUM(status IN ('tamamlandi','yayinlandi')) AS done FROM contents WHERE brand_id = ?`).get(b.id);
    return {
      id: b.id, name: b.name, sector: b.sector, description: b.description, isDemo: b.isDemo, colors: b.colors,
      logoUrl: logo ? logo.url : null, completeness: identityCompleteness(b, counts),
      lastWorkedAt: brands.lastWorkedAt(b.id) || b.updatedAt,
      contentTotal: c.total || 0, contentDone: c.done || 0, contentPending: (c.total || 0) - (c.done || 0),
      ideaCount: db.prepare('SELECT COUNT(*) AS n FROM ideas WHERE brand_id = ?').get(b.id).n
    };
  };

  api.get('/dashboard', (req, res) => {
    const brandId = req.query.brandId ? brands.get(String(req.query.brandId)).id : null;
    const all = brands.list();
    const scope = brandId ? all.filter(b => b.id === brandId) : all;
    const ideaRows = brandId
      ? db.prepare('SELECT brand_id, category, created_at FROM ideas WHERE brand_id = ? ORDER BY created_at').all(brandId)
      : db.prepare('SELECT i.brand_id, i.category, i.created_at FROM ideas i JOIN brands b ON b.id = i.brand_id WHERE b.owner_id = ? ORDER BY i.created_at').all(ownerId);
    res.json({
      brands: scope.map(brandSummary),
      contents: workspace.listContents({ brandId }).map(c => ({
        id: c.id, title: c.title, brandId: c.brandId, brandName: c.brandName, brandColor: c.brandColor, type: c.type, typeLabel: c.typeLabel,
        status: c.status, statusLabel: c.statusLabel, done: c.done, scheduledAt: c.scheduledAt, createdAt: c.createdAt, completedAt: c.completedAt
      })),
      ideas: ideaRows.map(r => ({ brandId: r.brand_id, category: r.category, createdAt: r.created_at })),
      tasks: workspace.listTasks({ brandId }),
      pinnedNotes: workspace.listNotes({ brandId }).filter(n => n.pinned).slice(0, 6),
      activity: brandId ? brands.recentActivity(brandId, 12) : brands.recentActivityAll(12)
    });
  });

  // İçerik planı: takvim, arşiv
  api.get('/contents', (req, res) => {
    const q = req.query;
    res.json({ contents: workspace.listContents({
      brandId: q.brandId ? String(q.brandId) : null, from: q.from ? String(q.from) : null, to: q.to ? String(q.to) : null,
      status: q.status ? String(q.status) : null, type: q.type ? String(q.type) : null, unscheduled: q.unscheduled === '1'
    }) });
  });
  api.post('/contents', (req, res) => res.status(201).json({ content: workspace.createContent(req.body || {}) }));
  api.patch('/contents/:id', (req, res) => res.json({ content: workspace.updateContent(req.params.id, req.body || {}) }));
  api.delete('/contents/:id', (req, res) => { workspace.deleteContent(req.params.id); res.status(204).end(); });

  api.get('/tasks', (req, res) => res.json({ tasks: workspace.listTasks({ brandId: req.query.brandId ? String(req.query.brandId) : null, status: req.query.status ? String(req.query.status) : null }) }));
  api.post('/tasks', (req, res) => res.status(201).json({ task: workspace.createTask(req.body || {}) }));
  api.patch('/tasks/:id', (req, res) => res.json({ task: workspace.updateTask(req.params.id, req.body || {}) }));
  api.delete('/tasks/:id', (req, res) => { workspace.deleteTask(req.params.id); res.status(204).end(); });

  api.get('/notes', (req, res) => res.json({
    notes: workspace.listNotes({ brandId: req.query.brandId ? String(req.query.brandId) : null, category: req.query.category ? String(req.query.category) : null, q: req.query.q ? String(req.query.q) : null }),
    categories: workspace.noteCategories()
  }));
  api.post('/notes', (req, res) => res.status(201).json({ note: workspace.createNote(req.body || {}) }));
  api.patch('/notes/:id', (req, res) => res.json({ note: workspace.updateNote(req.params.id, req.body || {}) }));
  api.delete('/notes/:id', (req, res) => { workspace.deleteNote(req.params.id); res.status(204).end(); });

  // --- Markalar ---
  api.get('/brands', (req, res) => {
    res.json({
      brands: brands.list().map(b => {
        const counts = brands.assetCounts(b.id);
        const logo = assets.list(b.id, 'logo')[0];
        const mascot = assets.list(b.id, 'mascot')[0];
        return Object.assign(b, { completeness: identityCompleteness(b, counts), logoUrl: logo ? logo.url : null, mascotUrl: mascot ? mascot.url : null });
      })
    });
  });

  api.post('/brands', (req, res) => {
    const brand = brands.create(req.body || {});
    settings.set('ui.activeBrandId', brand.id);
    res.status(201).json({ brand });
  });

  // Örnek marka: kullanım şeklini göstermek için hazır doldurulmuş kurgusal bir marka.
  // Zaten varsa yenisi oluşturulmaz, mevcut olan açılır.
  api.post('/brands/demo', (req, res) => {
    const existing = brands.findDemo();
    if (existing) {
      settings.set('ui.activeBrandId', existing.id);
      return res.json({ brand: existing, created: false });
    }
    const brand = transaction(db, () => {
      const b = brands.markDemo(brands.create(DEMO_BRAND).id);
      DEMO_IDEAS.forEach(i => {
        const idea = ideas.create(b.id, i, 'demo');
        if (i.favorite) ideas.update(b.id, idea.id, { favorite: true });
      });
      const at = (day, hour) => { const d = new Date(); d.setDate(d.getDate() + day); d.setHours(hour, 0, 0, 0); return d; };
      DEMO_CONTENTS.forEach(c => {
        const when = at(c.day, c.hour);
        const created = workspace.createContent({ brandId: b.id, title: c.title, type: c.type, status: c.status, scheduledAt: when.toISOString() });
        // Örnek içerikler planlanan tarihten birkaç gün önce hazırlanmış, yayın günü tamamlanmış görünür (grafikler gerçekçi olsun)
        const madeAt = new Date(Math.min(Date.now(), when.getTime() - 3 * 86400000)).toISOString();
        db.prepare('UPDATE contents SET created_at = ?, completed_at = CASE WHEN completed_at IS NULL THEN NULL ELSE ? END WHERE id = ?')
          .run(madeAt, when.toISOString(), created.id);
      });
      DEMO_TASKS.forEach(t => workspace.createTask({ brandId: b.id, title: t.title, description: t.description, priority: t.priority, status: t.status,
        dueDate: at(t.day, 12).toISOString().slice(0, 10) }));
      DEMO_NOTES.forEach(n => workspace.createNote(Object.assign({ brandId: b.id }, n)));
      return b;
    });
    // Dosyalar veritabanı işleminden sonra yazılır; biri yazılamazsa marka yine kullanılabilir
    DEMO_ASSETS.forEach(a => assets.create(brand.id, { buffer: demoAssetBuffer(a.file), category: a.category, label: a.label }));
    brands.logActivity(brand.id, 'demo.created', 'Örnek marka hazırlandı: kimlik, logo, maskot, fikirler, takvim, görevler ve notlar');
    settings.set('ui.activeBrandId', brand.id);
    res.status(201).json({ brand, created: true });
  });

  // Marka parametresi: her alt rotada önce yetki kontrolü (marka bu kullanıcıya ait mi?)
  api.param('brandId', (req, res, next, id) => {
    try { req.brand = brands.get(id); next(); } catch (err) { next(err); }
  });

  api.get('/brands/:brandId', (req, res) => {
    const counts = brands.assetCounts(req.brand.id);
    res.json({ brand: req.brand, completeness: identityCompleteness(req.brand, counts), assetCounts: counts });
  });

  api.patch('/brands/:brandId', (req, res) => res.json({ brand: brands.update(req.brand.id, req.body || {}) }));

  api.delete('/brands/:brandId', (req, res) => {
    brands.remove(req.brand.id);
    assets.removeBrandFiles(req.brand.id);
    if (settings.get('ui.activeBrandId') === req.brand.id) settings.remove('ui.activeBrandId');
    res.status(204).end();
  });

  // Ana ekran özeti: kimlik durumu, son fikirler, son çalışmalar
  api.get('/brands/:brandId/overview', (req, res) => {
    const counts = brands.assetCounts(req.brand.id);
    const logo = assets.list(req.brand.id, 'logo')[0];
    const mascot = assets.list(req.brand.id, 'mascot')[0];
    res.json({
      brand: req.brand,
      logoUrl: logo ? logo.url : null,
      mascotUrl: mascot ? mascot.url : null,
      assetTotal: Object.values(counts).reduce((a, b) => a + b, 0),
      ideaTimes: ideas.recentTimes(req.brand.id, 14),
      completeness: identityCompleteness(req.brand, counts),
      assetCounts: counts,
      recentIdeas: ideas.list(req.brand.id, { limit: 6 }),
      favoriteCount: ideas.list(req.brand.id, { favorite: true }).length,
      ideaCount: ideas.list(req.brand.id).length,
      activity: brands.recentActivity(req.brand.id),
      chatCount: assistant.history(req.brand.id, 1000).length
    });
  });

  // --- Varlık kütüphanesi ---
  api.get('/brands/:brandId/assets', (req, res) => {
    const category = req.query.category ? oneOf(String(req.query.category), Object.keys(ASSET_CATEGORIES), 'Kategori') : null;
    res.json({ assets: assets.list(req.brand.id, category) });
  });

  // Dosya ham gövde olarak gönderilir (multipart ayrıştırıcıya gerek yok); tür içerikten doğrulanır
  api.post('/brands/:brandId/assets', express.raw({ type: () => true, limit: MAX_ASSET_BYTES }), (req, res) => {
    const asset = assets.create(req.brand.id, { buffer: req.body, category: String(req.query.category || ''), label: String(req.query.label || '') });
    brands.logActivity(req.brand.id, 'asset.uploaded', `${asset.categoryLabel} yüklendi${asset.label ? ': ' + asset.label : ''}`);
    res.status(201).json({ asset });
  });

  api.patch('/brands/:brandId/assets/:assetId', (req, res) => res.json({ asset: assets.update(req.brand.id, req.params.assetId, req.body || {}) }));

  api.delete('/brands/:brandId/assets/:assetId', (req, res) => { assets.remove(req.brand.id, req.params.assetId); res.status(204).end(); });

  api.get('/brands/:brandId/assets/:assetId/file', (req, res) => {
    const f = assets.file(req.brand.id, req.params.assetId);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(f.path);
  });

  // --- İçerik fikirleri ---
  api.get('/brands/:brandId/ideas', (req, res) => {
    const category = req.query.category ? oneOf(String(req.query.category), Object.keys(IDEA_CATEGORIES), 'Kategori') : null;
    res.json({ ideas: ideas.list(req.brand.id, { category, favorite: req.query.favorite === '1' }) });
  });

  api.post('/brands/:brandId/ideas', (req, res) => res.status(201).json({ idea: ideas.create(req.brand.id, req.body || {}) }));

  api.patch('/brands/:brandId/ideas/:ideaId', (req, res) => res.json({ idea: ideas.update(req.brand.id, req.params.ideaId, req.body || {}) }));

  api.delete('/brands/:brandId/ideas/:ideaId', (req, res) => { ideas.remove(req.brand.id, req.params.ideaId); res.status(204).end(); });

  // --- AI asistanı ---
  api.get('/brands/:brandId/chat', (req, res) => res.json({ messages: assistant.history(req.brand.id) }));

  api.post('/brands/:brandId/chat', route(async (req, res) => {
    res.json(await assistant.send(req.brand.id, req.body && req.body.message));
  }));

  api.delete('/brands/:brandId/chat', (req, res) => { assistant.clear(req.brand.id); res.status(204).end(); });

  api.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Böyle bir API uç noktası yok.' } }));

  app.use('/api', api);
  // Arayüz dosyaları her açılışta yeniden doğrulanır; tarayıcı eski arayüzü önbellekten göstermez
  app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html', setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
  app.use(errorHandler);

  return { app, db, backups, close: () => db.close() };
}
