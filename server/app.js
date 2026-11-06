// Uygulama kurulumu: veritabanı, servisler, güvenlik katmanı ve API rotaları.
// createApp testlerde geçici veritabanı ve sahte AI sağlayıcısıyla da kurulabilir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import { errorHandler, newId, now, badRequest, text, oneOf, route } from './lib/http.js';
import { createAiService } from './services/ai/index.js';
import { createBrandService, identityCompleteness, PROFILE_FIELDS, FONT_OPTIONS } from './services/brands.js';
import { createAssetService, ASSET_CATEGORIES, MAX_ASSET_BYTES } from './services/assets.js';
import { createIdeaService, IDEA_CATEGORIES } from './services/ideas.js';
import { createAssistantService } from './services/assistant.js';

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

export function createApp({ dataDir = path.join(ROOT, 'data'), aiProvider, fetchImpl } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'app.db'));
  const ownerId = ensureOwner(db);
  const settings = createSettingsStore(db);
  const ai = createAiService(settings, { provider: aiProvider, fetchImpl });
  const brands = createBrandService(db, ownerId);
  const assets = createAssetService(db, path.join(dataDir, 'uploads'));
  const ideas = createIdeaService(db);
  const assistant = createAssistantService({ db, ai, brands, ideas });

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

  // --- Markalar ---
  api.get('/brands', (req, res) => {
    res.json({
      brands: brands.list().map(b => {
        const counts = brands.assetCounts(b.id);
        const logo = assets.list(b.id, 'logo')[0];
        return Object.assign(b, { completeness: identityCompleteness(b, counts), logoUrl: logo ? logo.url : null });
      })
    });
  });

  api.post('/brands', (req, res) => {
    const brand = brands.create(req.body || {});
    settings.set('ui.activeBrandId', brand.id);
    res.status(201).json({ brand });
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
    res.json({
      brand: req.brand,
      logoUrl: logo ? logo.url : null,
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
  app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));
  app.use(errorHandler);

  return { app, db, close: () => db.close() };
}
