// Uygulama kurulumu: veritabanı, servisler, güvenlik katmanı ve API rotaları.
// createApp testlerde geçici veritabanı ve sahte AI sağlayıcısıyla da kurulabilir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import { errorHandler, newId, now, badRequest, text, oneOf, route, HttpError } from './lib/http.js';
import { createAiService, GEMINI_TEXT_MODELS } from './services/ai/index.js';
import { createBrandService, identityCompleteness, PROFILE_FIELDS, FONT_OPTIONS } from './services/brands.js';
import { createAssetService, ASSET_CATEGORIES, MAX_ASSET_BYTES, MAX_PACK_BYTES } from './services/assets.js';
import { readZip, ZipError } from './lib/zip.js';
import { createIdeaService, IDEA_CATEGORIES } from './services/ideas.js';
import { createAssistantService } from './services/assistant.js';
import { createWorkspaceService, CONTENT_TYPES, CONTENT_STATUSES, DONE_STATUSES, TASK_PRIORITIES, TASK_STATUSES, METRIC_FIELDS } from './services/workspace.js';
import { transaction } from './db.js';
import { createBackupService } from './services/backup.js';
import { createDriveService } from './services/drive.js';
import { createCompareService } from './services/compare.js';
import { createReelsService } from './services/reels/index.js';
import { createPostService } from './services/posts.js';
import { createPromptService } from './services/prompts.js';
import { createImageService } from './services/images.js';
import { createDesignRefService } from './services/designRef.js';
import { createAssetTagService } from './services/assetTags.js';
import { createCaptionService } from './services/captions.js';
import { specialDays, DAY_CATEGORIES } from './services/specialDays.js';
import { createIdentityService } from './services/identity.js';
import { createMemoryService } from './services/memory.js';
import { createSharedTemplateService } from './services/sharedTemplates.js';
import { createPatternService } from './services/patterns.js';
import { createCompetitorService } from './services/competitors.js';
import { createReviewService } from './services/review.js';
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

export function createApp({ dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'), root = ROOT, aiProvider, aiProviders, fetchImpl, updateFetch, driveFetch, restart = code => process.exit(code) } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'app.db'));
  const ownerId = ensureOwner(db);
  const settings = createSettingsStore(db);
  const ai = createAiService(settings, { db, provider: aiProvider, fetchImpl, providers: aiProviders });
  const brands = createBrandService(db, ownerId);
  const assets = createAssetService(db, path.join(dataDir, 'uploads'));
  const ideas = createIdeaService(db);
  const workspace = createWorkspaceService(db, ownerId, brands);
  const memory = createMemoryService({ db, brands });
  const backups = createBackupService({ db, dataDir, settings });
  const drive = createDriveService(settings, { fetchImpl: driveFetch });
  const compare = createCompareService({ db, ai, brands });
  const patterns = createPatternService({ db, ai, brands });
  const competitors = createCompetitorService({ db, ai, brands });
  const reels = createReelsService({ db, ai, brands, workspace, patterns });
  const posts = createPostService({ db, ai, brands, assets, workspace });
  const shared = createSharedTemplateService({ db, ownerId, brands, assets });
  const review = createReviewService({ ai, brands, memory });
  const prompts = createPromptService({ db, ai, brands, reels });
  const images = createImageService({ db, ai, brands, assets });
  const designRef = createDesignRefService({ db, ai, brands, assets });
  const assetTags = createAssetTagService({ ai, brands, assets });
  const captions = createCaptionService({ db, ai, brands, workspace, reels });
  const identity = createIdentityService({ ai });
  const assistant = createAssistantService({ db, ai, brands, ideas, reels, posts, prompts, workspace, images, memory });

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
    metricFields: METRIC_FIELDS,
    doneStatuses: DONE_STATUSES,
    taskPriorities: TASK_PRIORITIES,
    taskStatuses: TASK_STATUSES,
    maxAssetBytes: MAX_ASSET_BYTES,
    reels: reels.meta,
    posts: { kinds: posts.kinds, formats: posts.formats, kindDefaults: posts.kindDefaults },
    reviewKinds: review.kinds,
    prompts: { kinds: prompts.kinds, actions: prompts.actions }
  }));

  // --- Ayarlar (AI anahtarı yalnızca yazılır, hiçbir zaman geri okunmaz) ---
  api.get('/settings', (req, res) => res.json({ ai: ai.status(), drive: drive.status(), activeBrandId: settings.get('ui.activeBrandId') || null }));

  // --- Google Drive bağlantısı (Apps Script). Adres ve gizli anahtar istemciye ham hâliyle dönmez;
  // yalnızca kullanıcının Apps Script'e yapıştıracağı kod gösterilir. ---
  api.get('/settings/drive', (req, res) => res.json(Object.assign({ script: drive.script() }, drive.status())));
  api.put('/settings/drive', route(async (req, res) => {
    const r = await drive.setScriptUrl(req.body && req.body.scriptUrl);
    brands.logActivity(null, 'drive.connected', 'Google Drive bağlantısı kuruldu');
    res.json(Object.assign({ rootFolder: r.klasorAdi || null }, drive.status()));
  }));
  api.delete('/settings/drive', (req, res) => { drive.clear(); res.json(drive.status()); });

  // Eski uç noktalar (yalnızca Gemini): geriye dönük uyumluluk için duruyor
  const readKey = (body, field = 'API anahtarı') => {
    const key = text(body && body.apiKey, { field, max: 300, required: true }).replace(/\s+/g, '');
    if (key.length < 20) throw badRequest('Bu bir API anahtarına benzemiyor.');
    return key;
  };
  api.put('/settings/ai', (req, res) => {
    const body = req.body || {};
    if ('apiKey' in body) ai.setApiKey('gemini', readKey(body));
    if ('model' in body) ai.setTasks({ fikir: { primary: 'gemini:' + oneOf(body.model, GEMINI_TEXT_MODELS, 'Model') } });
    res.json({ ai: ai.status() });
  });
  api.delete('/settings/ai/key', (req, res) => { ai.clearApiKey('gemini'); res.json({ ai: ai.status() }); });
  api.post('/settings/ai/test', route(async (req, res) => {
    const models = await ai.listModels('gemini');
    res.json({ result: { ok: true, modelCount: models.length, modelAvailable: true }, ai: ai.status() });
  }));

  // --- Yapay zekâ: sağlayıcılar, işe göre model, harcama, karşılaştırma ---
  const aiOverview = () => Object.assign(ai.overview(), { kinds: compare.kinds, scoreboard: compare.scoreboard() });
  api.get('/ai', (req, res) => res.json(aiOverview()));
  api.put('/ai/keys/:provider', route(async (req, res) => {
    const id = String(req.params.provider);
    ai.setApiKey(id, readKey(req.body));
    // Anahtar hemen denenir: çalışmıyorsa kaydedilmez
    try {
      const models = await ai.listModels(id);
      brands.logActivity(null, 'ai.connected', `${ai.overview().providers.find(p => p.id === id).label} bağlandı`);
      res.json(Object.assign(aiOverview(), { modelCount: models.length }));
    } catch (err) {
      ai.clearApiKey(id);
      throw err;
    }
  }));
  api.delete('/ai/keys/:provider', (req, res) => { ai.clearApiKey(String(req.params.provider)); res.json(aiOverview()); });
  api.get('/ai/models/:provider', route(async (req, res) => res.json({ models: await ai.listModels(String(req.params.provider)) })));
  api.put('/ai/tasks', (req, res) => { ai.setTasks(req.body && req.body.tasks); res.json(aiOverview()); });
  api.put('/ai/budget', (req, res) => { ai.setBudget(req.body || {}); res.json(aiOverview()); });
  api.put('/ai/prices', (req, res) => {
    const body = req.body || {};
    ai.setPrice(String(body.ref || ''), body.price || null);
    res.json(aiOverview());
  });
  api.get('/ai/usage', (req, res) => res.json(ai.usage(req.query.month ? String(req.query.month) : null)));
  api.post('/ai/compare', route(async (req, res) => {
    const body = req.body || {};
    res.status(201).json({ comparison: await compare.run({ brief: body.brief, kind: body.kind || 'serbest', brandId: body.brandId || null, models: body.models }) });
  }));
  api.get('/ai/comparisons', (req, res) => res.json({ comparisons: compare.list(20), scoreboard: compare.scoreboard() }));
  api.put('/ai/comparisons/:id/winner', (req, res) => res.json({ comparison: compare.setWinner(req.params.id, req.body && req.body.ref ? String(req.body.ref) : '') }));

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

  // Kimliği AI ile doldurma (yeni markada da çalışır; brandId varsa harcama o markaya yazılır)
  api.post('/identity-draft', route(async (req, res) => {
    const b = req.body || {};
    const brandId = b.brandId ? brands.get(String(b.brandId)).id : null;
    res.json(await identity.draft({ text: b.text, modelRef: mr(b), brandId }));
  }));

  // Özel günler: from/to (YYYY-MM-DD) aralığı, en fazla 2 yıl
  api.get('/special-days', (req, res) => {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const from = re.test(String(req.query.from)) ? String(req.query.from) : new Date().toISOString().slice(0, 10);
    const to = re.test(String(req.query.to)) ? String(req.query.to) : from;
    if (to < from || Number(to.slice(0, 4)) - Number(from.slice(0, 4)) > 2) throw badRequest('Tarih aralığı geçersiz.');
    res.json({ days: specialDays(from, to), categories: DAY_CATEGORIES });
  });

  api.get('/performance', (req, res) => res.json(workspace.performance({ brandId: req.query.brandId ? String(req.query.brandId) : null })));

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
  api.post('/contents/:id/write', route(async (req, res) => res.json(await captions.write(req.params.id, { modelRef: mr(req.body) }))));
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

  // --- Markanın Drive klasörü ---
  api.post('/brands/:brandId/drive/test', route(async (req, res) => {
    if (!req.brand.driveFolderId) throw badRequest('Bu markaya henüz Google Drive klasörü eklenmedi.');
    const r = await drive.ping(req.brand.driveFolderId);
    res.json({ folderName: r.klasorAdi || null, folderUrl: req.brand.driveFolderUrl });
  }));

  // Kütüphanedeki bir dosyayı markanın Drive klasörüne gönderir
  api.post('/brands/:brandId/assets/:assetId/drive', route(async (req, res) => {
    const f = assets.file(req.brand.id, req.params.assetId);
    const day = new Date().toISOString().slice(0, 10);
    const base = [req.brand.name, f.label || ASSET_CATEGORIES[f.category] || 'Dosya', day].join(' - ').replace(/[\\/:*?"<>|]+/g, ' ').trim();
    const sent = await drive.upload(req.brand.driveFolderId, { name: base + f.ext, mime: f.mime, buffer: fs.readFileSync(f.path) });
    const asset = assets.setDriveUrl(req.brand.id, req.params.assetId, sent.url);
    brands.logActivity(req.brand.id, 'drive.uploaded', `Google Drive'a gönderildi: ${f.label || ASSET_CATEGORIES[f.category]}`);
    res.json({ asset, drive: sent });
  }));

  // Üretilen dosyayı (başlık PNG'si, post görseli, altyazı, senaryo metni) markanın Drive klasörüne gönderir
  const DRIVE_UPLOAD_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'text/plain': '.txt', 'application/x-subrip': '.srt' };
  api.post('/brands/:brandId/drive/upload', express.raw({ type: () => true, limit: MAX_ASSET_BYTES }), route(async (req, res) => {
    const mime = String(req.query.mime || '');
    if (!DRIVE_UPLOAD_TYPES[mime]) throw badRequest('Bu dosya türü Drive\'a gönderilemez.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Gönderilecek dosya boş.');
    const base = text(String(req.query.name || ''), { field: 'Dosya adı', max: 120, required: true }).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\.[a-z0-9]{2,4}$/i, '').trim();
    const sent = await drive.upload(req.brand.driveFolderId, { name: `${req.brand.name} - ${base}${DRIVE_UPLOAD_TYPES[mime]}`, mime, buffer: req.body });
    brands.logActivity(req.brand.id, 'drive.uploaded', `Google Drive'a gönderildi: ${base}`);
    res.json({ drive: sent });
  }));

  // --- Reels: fikir havuzu ve senaryolar ---
  const mr = body => (body && body.model ? String(body.model) : null);
  api.get('/brands/:brandId/reels/settings', (req, res) => res.json({ settings: reels.settings(req.brand.id) }));
  api.put('/brands/:brandId/reels/settings', (req, res) => res.json({ settings: reels.setSettings(req.brand.id, req.body || {}) }));
  api.get('/brands/:brandId/reels/pool', (req, res) => res.json({ pool: reels.listPool(req.brand.id) }));
  api.post('/brands/:brandId/reels/pool', (req, res) => res.status(201).json({ item: reels.addPool(req.brand.id, req.body || {}) }));
  api.post('/brands/:brandId/reels/pool/expand', route(async (req, res) => {
    const b = req.body || {};
    res.status(201).json(await reels.expandPool(req.brand.id, { category: b.category || null, similarTo: b.similarTo || null, modelRef: mr(b) }));
  }));
  api.patch('/brands/:brandId/reels/pool/:id', (req, res) => res.json({ item: reels.updatePool(req.brand.id, req.params.id, req.body || {}) }));
  api.delete('/brands/:brandId/reels/pool/:id', (req, res) => { reels.removePool(req.brand.id, req.params.id); res.status(204).end(); });
  api.get('/brands/:brandId/reels', (req, res) => res.json({ reels: reels.list(req.brand.id) }));
  api.post('/brands/:brandId/reels', route(async (req, res) => {
    const b = req.body || {};
    res.status(201).json({ reels: await reels.create(req.brand.id, { topic: b.topic, poolId: b.poolId || null, format: b.format || null, patternId: b.patternId || null, modelRef: mr(b) }) });
  }));
  api.get('/brands/:brandId/reels/:id', (req, res) => res.json({ reels: reels.get(req.brand.id, req.params.id) }));
  api.patch('/brands/:brandId/reels/:id', (req, res) => res.json({ reels: reels.update(req.brand.id, req.params.id, req.body || {}) }));
  api.delete('/brands/:brandId/reels/:id', (req, res) => { reels.remove(req.brand.id, req.params.id); res.status(204).end(); });
  api.post('/brands/:brandId/reels/:id/regenerate', route(async (req, res) => {
    const b = req.body || {};
    res.json({ reels: await reels.regenerate(req.brand.id, req.params.id, { sceneIndex: b.sceneIndex, modelRef: mr(b) }) });
  }));
  api.post('/brands/:brandId/reels/:id/translate', route(async (req, res) => {
    const b = req.body || {};
    res.json({ reels: await reels.translate(req.brand.id, req.params.id, { sceneIndex: b.sceneIndex, to: b.to === 'tr' ? 'tr' : 'en', modelRef: mr(b) }) });
  }));
  api.post('/brands/:brandId/reels/:id/restore', (req, res) => res.json({ reels: reels.restore(req.brand.id, req.params.id, req.body && req.body.versionId) }));
  api.post('/brands/:brandId/reels/:id/schedule', (req, res) => res.status(201).json({ content: reels.schedule(req.brand.id, req.params.id, { scheduledAt: (req.body && req.body.scheduledAt) || null }) }));

  // --- Post stüdyosu ---
  api.get('/brands/:brandId/posts', (req, res) => res.json({ posts: posts.list(req.brand.id) }));
  api.post('/brands/:brandId/posts', route(async (req, res) => {
    const b = req.body || {};
    const post = b.blank ? posts.createBlank(req.brand.id, b) : await posts.create(req.brand.id, { topic: b.topic, kind: b.kind, format: b.format || null, slides: b.slides, modelRef: mr(b) });
    res.status(201).json({ post });
  }));
  api.get('/brands/:brandId/posts/:id', (req, res) => res.json({ post: posts.get(req.brand.id, req.params.id) }));
  api.put('/brands/:brandId/posts/:id', (req, res) => res.json({ post: posts.update(req.brand.id, req.params.id, req.body || {}) }));
  api.delete('/brands/:brandId/posts/:id', (req, res) => { posts.remove(req.brand.id, req.params.id); res.status(204).end(); });
  // Ortak (markalar arası) şablonlar: liste hedef markanın kimliğiyle önizlenir
  api.get('/brands/:brandId/shared-templates', (req, res) => res.json({ templates: shared.list(req.brand.id) }));
  api.post('/brands/:brandId/posts/:id/share-template', (req, res) => res.status(201).json({ template: shared.saveFromPost(req.brand.id, req.params.id, req.body || {}) }));
  api.post('/brands/:brandId/shared-templates/:tid/use', (req, res) => res.status(201).json({ post: shared.use(req.brand.id, req.params.tid, req.body || {}) }));
  api.delete('/shared-templates/:tid', (req, res) => { shared.remove(req.params.tid); res.status(204).end(); });
  api.get('/brands/:brandId/post-templates', (req, res) => res.json({ templates: posts.listTemplates(req.brand.id) }));
  api.post('/brands/:brandId/posts/:id/template', (req, res) => res.status(201).json({ template: posts.saveTemplate(req.brand.id, req.params.id, req.body || {}) }));
  api.delete('/brands/:brandId/post-templates/:tid', (req, res) => { posts.removeTemplate(req.brand.id, req.params.tid); res.status(204).end(); });
  api.post('/brands/:brandId/posts/:id/rewrite', route(async (req, res) => res.json({ post: await posts.rewrite(req.brand.id, req.params.id, { modelRef: mr(req.body) }) })));
  api.post('/brands/:brandId/posts/:id/schedule', (req, res) => res.status(201).json({ content: posts.schedule(req.brand.id, req.params.id, { scheduledAt: (req.body && req.body.scheduledAt) || null }) }));

  // --- AI içerik denetçisi ---
  api.post('/brands/:brandId/review', route(async (req, res) => {
    const b = req.body || {};
    res.json({ review: await review.review(req.brand.id, { text: b.text, kind: b.kind || 'serbest', modelRef: mr(b) }) });
  }));

  // --- Rakip profilleri ---
  api.get('/brands/:brandId/competitors', (req, res) => res.json({ competitors: competitors.list(req.brand.id) }));
  api.post('/brands/:brandId/competitors', (req, res) => res.status(201).json({ competitor: competitors.create(req.brand.id, req.body || {}) }));
  api.put('/brands/:brandId/competitors/:id', (req, res) => res.json({ competitor: competitors.update(req.brand.id, req.params.id, req.body || {}) }));
  api.delete('/brands/:brandId/competitors/:id', (req, res) => { competitors.remove(req.brand.id, req.params.id); res.status(204).end(); });
  api.post('/brands/:brandId/competitors/:id/analyze', route(async (req, res) => res.json({ competitor: await competitors.analyze(req.brand.id, req.params.id, { modelRef: mr(req.body) }) })));

  // --- Kalıp arşivi ---
  api.get('/brands/:brandId/patterns', (req, res) => res.json({ patterns: patterns.list(req.brand.id), sources: patterns.sources, hookTypes: patterns.hookTypes }));
  api.post('/brands/:brandId/patterns', route(async (req, res) => {
    const b = req.body || {};
    res.status(201).json({ pattern: await patterns.analyze(req.brand.id, { text: b.text, sourceType: b.sourceType, sourceNote: b.sourceNote, modelRef: mr(b) }) });
  }));
  api.put('/brands/:brandId/patterns/:id', (req, res) => res.json({ pattern: patterns.update(req.brand.id, req.params.id, req.body || {}) }));
  api.delete('/brands/:brandId/patterns/:id', (req, res) => { patterns.remove(req.brand.id, req.params.id); res.status(204).end(); });

  // --- Akıllı marka hafızası ---
  api.get('/brands/:brandId/memory', (req, res) => res.json({ memory: memory.get(req.brand.id), categories: memory.categories }));
  api.put('/brands/:brandId/memory', (req, res) => res.json({ memory: memory.setLists(req.brand.id, req.body || {}) }));
  api.post('/brands/:brandId/memory/facts', (req, res) => res.status(201).json({ fact: memory.addFact(req.brand.id, req.body || {}) }));
  api.put('/brands/:brandId/memory/facts/:id', (req, res) => res.json({ fact: memory.updateFact(req.brand.id, req.params.id, req.body || {}) }));
  api.delete('/brands/:brandId/memory/facts/:id', (req, res) => { memory.removeFact(req.brand.id, req.params.id); res.status(204).end(); });

  // --- Görsel üretimi ---
  api.get('/ai/images', (req, res) => res.json(images.overview()));
  api.put('/ai/images', (req, res) => res.json(ai.setImageDefault((req.body || {}).model || '')));
  api.get('/brands/:brandId/images', (req, res) => res.json({ images: images.history(req.brand.id, { promptId: req.query.promptId || null }) }));
  api.post('/brands/:brandId/images', route(async (req, res) => res.status(201).json(await images.generate(req.brand.id, req.body || {}))));
  // Alan düzenleme: gövde işaretli görselin kendisi (PNG/JPEG), diğerleri adres parametresi
  api.post('/brands/:brandId/images/edit', express.raw({ type: () => true, limit: MAX_ASSET_BYTES }), route(async (req, res) => res.status(201).json(await images.editRegion(req.brand.id, { assetId: String(req.query.assetId || ''), marked: req.body, instruction: String(req.query.instruction || ''), modelRef: req.query.model ? String(req.query.model) : null }))));

  // --- Tasarım referansı analizi ---
  api.post('/brands/:brandId/design-ref', route(async (req, res) => {
    const b = req.body || {};
    res.status(201).json(await designRef.analyze(req.brand.id, { assetId: b.assetId, modelRef: mr(b), name: b.name }));
  }));

  // --- Prompt Studio ---
  api.get('/brands/:brandId/prompts', (req, res) => res.json({ prompts: prompts.list(req.brand.id, { kind: req.query.kind || null, q: req.query.q || '' }) }));
  api.post('/brands/:brandId/prompts', route(async (req, res) => {
    const b = req.body || {};
    const prompt = b.manual ? prompts.createManual(req.brand.id, b) : await prompts.create(req.brand.id, { kind: b.kind, brief: b.brief, modelRef: mr(b) });
    res.status(201).json({ prompt });
  }));
  api.post('/brands/:brandId/prompts/brainstorm', route(async (req, res) => { const b = req.body || {}; res.json(await prompts.brainstorm(req.brand.id, { kind: b.kind, brief: b.brief, concepts: b.concepts, variations: b.variations, modelRef: mr(b) })); }));
  api.post('/brands/:brandId/prompts/enhance', route(async (req, res) => { const b = req.body || {}; res.json(await prompts.enhance(req.brand.id, { kind: b.kind, text: b.text, modelRef: mr(b) })); }));
  api.get('/brands/:brandId/prompts/:id', (req, res) => res.json({ prompt: prompts.get(req.brand.id, req.params.id) }));
  api.put('/brands/:brandId/prompts/:id', (req, res) => res.json({ prompt: prompts.update(req.brand.id, req.params.id, req.body || {}) }));
  api.delete('/brands/:brandId/prompts/:id', (req, res) => { prompts.remove(req.brand.id, req.params.id); res.status(204).end(); });
  api.post('/brands/:brandId/prompts/:id/improve', route(async (req, res) => {
    const b = req.body || {};
    res.json({ prompt: await prompts.improve(req.brand.id, req.params.id, { action: b.action, brief: b.brief, selection: b.selection, instruction: b.instruction, modelRef: mr(b) }) });
  }));
  api.get('/brands/:brandId/prompts/:id/versions/:vid', (req, res) => res.json({ version: prompts.version(req.brand.id, req.params.id, req.params.vid) }));
  api.post('/brands/:brandId/prompts/:id/restore', (req, res) => res.json({ prompt: prompts.restore(req.brand.id, req.params.id, (req.body || {}).versionId) }));

  // --- Varlık kütüphanesi ---
  api.get('/brands/:brandId/assets', (req, res) => {
    const category = req.query.category ? oneOf(String(req.query.category), Object.keys(ASSET_CATEGORIES), 'Kategori') : null;
    res.json({ assets: assets.list(req.brand.id, category) });
  });

  // Dosya ham gövde olarak gönderilir (multipart ayrıştırıcıya gerek yok); tür içerikten doğrulanır
  api.post('/brands/:brandId/assets', express.raw({ type: () => true, limit: MAX_ASSET_BYTES }), (req, res) => {
    const asset = assets.create(req.brand.id, { buffer: req.body, category: String(req.query.category || ''), label: String(req.query.label || ''), pack: String(req.query.pack || ''), tags: String(req.query.tags || '') });
    brands.logActivity(req.brand.id, 'asset.uploaded', `${asset.categoryLabel} yüklendi${asset.label ? ': ' + asset.label : ''}`);
    res.status(201).json({ asset });
  });

  // Paket yükleme: ZIP arşivi (gövde) ya da tek tek dosyalar ?pack= ile; paket listesi ve paket silme
  api.post('/brands/:brandId/asset-packs', express.raw({ type: () => true, limit: MAX_PACK_BYTES }), (req, res) => {
    let entries;
    try { entries = readZip(req.body, { maxEntries: 1000, maxTotal: 300 * 1024 * 1024 }); } catch (err) {
      if (err instanceof ZipError) throw badRequest(err.message);
      throw err;
    }
    const r = assets.importPack(req.brand.id, { entries, category: String(req.query.category || 'sticker'), pack: String(req.query.pack || '') });
    brands.logActivity(req.brand.id, 'asset.pack', `Paket yüklendi: ${String(req.query.pack || '')} (${r.added.length} görsel)`);
    res.status(201).json(r);
  });
  api.get('/brands/:brandId/asset-packs', (req, res) => res.json({ packs: assets.packs(req.brand.id) }));
  api.delete('/brands/:brandId/asset-packs', (req, res) => res.json({ removed: assets.removePack(req.brand.id, String(req.query.pack || '')) }));

  api.post('/brands/:brandId/assets/:assetId/analyze', route(async (req, res) => res.json(await assetTags.analyze(req.brand.id, req.params.assetId, { modelRef: mr(req.body || {}) }))));
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
