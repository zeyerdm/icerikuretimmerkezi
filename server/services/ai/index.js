// AI servis katmanı: birden çok sağlayıcı, işe göre model ataması, yedek modele geçiş, harcama kaydı ve aylık sınır.
// Anahtarlar yalnızca sunucuda (ayarlar tablosunda ya da ortam değişkeninde) durur; istemciye hiçbir zaman gönderilmez.
import { newId, now, badRequest, parseJson, HttpError } from '../../lib/http.js';
import { PROVIDERS, MODELS, TASKS, DEFAULT_ORDER, RECOMMENDED, IMAGE_MODELS, IMAGE_DEFAULTS, IMAGE_ASPECTS, modelRef, parseRef, catalogModel } from './catalog.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createAnthropicProvider } from './providers/anthropic.js';
import { createOpenAiCompatibleProvider } from './providers/openai.js';

const TASKS_SETTING = 'ai.tasks';
const BUDGET_SETTING = 'ai.budget';
const PRICES_SETTING = 'ai.prices';
const IMAGE_SETTING = 'ai.imageModel';
const keySetting = id => `ai.${id}.apiKey`;
export const GEMINI_TEXT_MODELS = MODELS.filter(m => m.provider === 'gemini').map(m => m.id);
// İşe göre düşünme derinliği (Claude): yazım özen ister, çeviri hızlı olmalı
const EFFORT = { yazim: 'high', fikir: 'medium', ceviri: 'low', denetim: 'medium', karsilastirma: 'high' };

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function createAiService(settings, { db, provider: legacyProvider, fetchImpl, providers: overrides = {} } = {}) {
  const getKey = id => process.env[PROVIDERS[id].env] || settings.get(keySetting(id)) || '';
  const keySource = id => (process.env[PROVIDERS[id].env] ? 'env' : (settings.get(keySetting(id)) ? 'settings' : null));

  const providers = {
    anthropic: overrides.anthropic || createAnthropicProvider({ getApiKey: () => getKey('anthropic'), fetchImpl }),
    openai: overrides.openai || createOpenAiCompatibleProvider({ id: 'openai', label: PROVIDERS.openai.label, shortLabel: 'OpenAI', baseURL: 'https://api.openai.com/v1', getApiKey: () => getKey('openai'), fetchImpl }),
    openrouter: overrides.openrouter || createOpenAiCompatibleProvider({
      id: 'openrouter', label: PROVIDERS.openrouter.label, shortLabel: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', getApiKey: () => getKey('openrouter'), fetchImpl,
      extraHeaders: { 'X-Title': 'Icerik Uretim Merkezi' }
    }),
    gemini: overrides.gemini || createGeminiProvider({ getApiKey: () => getKey('gemini'), fetchImpl })
  };
  // Testlerde kullanılan sahte sağlayıcı (eski arayüz: generate(prompt, opts) doğrudan sonucu döndürür)
  if (legacyProvider) {
    providers.fake = {
      id: 'fake', label: legacyProvider.label || 'Test',
      async generate({ prompt, json, temperature, images }) {
        const r = await legacyProvider.generate(prompt, { json, temperature, images });
        return { output: r, usage: { input: 0, output: 0 }, model: 'test' };
      },
      async listModels() { return [{ id: 'test', label: 'Test modeli' }]; }
    };
  }
  const isConfigured = id => id === 'fake' ? Boolean(providers.fake) : Boolean(PROVIDERS[id] && getKey(id));

  // Canlı model listeleri (özellikle OpenRouter fiyatları) bellekte tutulur
  const liveModels = {};

  // --- Fiyat ve harcama ---
  const priceOverrides = () => parseJson(settings.get(PRICES_SETTING) || '{}', {});
  function priceFor(ref) {
    const o = priceOverrides()[ref];
    if (o && Number.isFinite(o.input) && Number.isFinite(o.output)) return { input: o.input, output: o.output, source: 'elle' };
    const c = catalogModel(ref);
    if (c) return c.price;
    const p = parseRef(ref);
    const live = p && (liveModels[p.provider] || []).find(m => m.id === p.id);
    return live && live.price ? live.price : null;
  }
  const costOf = (ref, usage) => {
    const p = priceFor(ref);
    return p ? ((usage.input || 0) * p.input + (usage.output || 0) * p.output) / 1e6 : 0;
  };

  function record({ ref, task, brandId, usage = {}, cost = 0, ok = true, error = '' }) {
    if (!db) return;
    const p = parseRef(ref) || { provider: 'bilinmiyor', id: ref };
    db.prepare(`INSERT INTO ai_usage (id, created_at, provider, model, task, brand_id, input_tokens, output_tokens, cost_usd, ok, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId(), now(), p.provider, p.id, task, brandId || null, usage.input || 0, usage.output || 0, cost, ok ? 1 : 0, String(error).slice(0, 300));
  }

  const budget = () => Object.assign({ monthlyUsd: 0, warnPercent: 80 }, parseJson(settings.get(BUDGET_SETTING) || '{}', {}));
  const monthSpend = () => (db ? db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage WHERE created_at >= ?').get(monthStart()).s : 0);
  function budgetStatus() {
    const b = budget();
    const spent = monthSpend();
    const percent = b.monthlyUsd > 0 ? Math.round((spent / b.monthlyUsd) * 100) : null;
    return { monthlyUsd: b.monthlyUsd, warnPercent: b.warnPercent, spent, percent, warning: percent != null && percent >= b.warnPercent, blocked: percent != null && spent >= b.monthlyUsd };
  }
  function checkBudget() {
    const s = budgetStatus();
    if (s.blocked) {
      throw new HttpError(402, 'AI_BUDGET', `Bu ayın AI harcama sınırına ulaşıldı (${s.spent.toFixed(2)} $ / ${s.monthlyUsd} $). Yapay zekâ → Harcama bölümünden sınırı artırabilirsin.`);
    }
  }

  // --- İş atamaları ---
  function storedTasks() { return parseJson(settings.get(TASKS_SETTING) || '{}', {}); }
  function defaultFor(task) {
    if (providers.fake) return 'fake:test';
    const pid = DEFAULT_ORDER.find(isConfigured);
    return pid ? modelRef(pid, RECOMMENDED[pid][task] || RECOMMENDED[pid].fikir) : null;
  }
  function assignment(task) {
    const t = storedTasks()[task] || {};
    const primary = t.primary && parseRef(t.primary) && isConfigured(parseRef(t.primary).provider) ? t.primary : defaultFor(task);
    const fallback = t.fallback && parseRef(t.fallback) && isConfigured(parseRef(t.fallback).provider) && t.fallback !== primary ? t.fallback : null;
    return { primary, fallback, auto: !t.primary || primary !== t.primary };
  }

  function labelOf(ref) {
    const c = catalogModel(ref) || IMAGE_MODELS.find(m => modelRef(m.provider, m.id) === ref);
    if (c) return c.label;
    const p = parseRef(ref);
    if (!p) return ref;
    const live = (liveModels[p.provider] || []).find(m => m.id === p.id);
    return (live && live.label) || p.id;
  }

  // Tek modelle çalıştırır; harcamayı kaydeder
  async function runOne(ref, { task, brandId, prompt, json, temperature, images = [], videoUrl = null }) {
    const p = parseRef(ref);
    if (!p || !providers[p.provider]) throw badRequest('Geçersiz model seçimi.');
    // YouTube videosunu okuyabilen tek sağlayıcı Gemini (video bağlantısını doğrudan girdi olarak alır)
    if (videoUrl && p.provider !== 'gemini') throw badRequest('YouTube videosunu okumak için Gemini modeli gerekli.');
    if (!isConfigured(p.provider)) throw new HttpError(409, 'AI_NOT_CONFIGURED', `${PROVIDERS[p.provider] ? PROVIDERS[p.provider].label : p.provider} bağlı değil.`);
    const started = Date.now();
    try {
      const r = await providers[p.provider].generate(Object.assign({ model: p.id, prompt, json, temperature, effort: EFFORT[task] || 'medium', images }, videoUrl ? { videoUrl } : {}));
      const servedRef = modelRef(p.provider, r.model || p.id);
      const cost = typeof r.cost === 'number' ? r.cost : costOf(servedRef, r.usage || {}) || costOf(ref, r.usage || {});
      record({ ref: servedRef, task, brandId, usage: r.usage, cost });
      return { output: r.output, ref, servedRef, usage: r.usage || { input: 0, output: 0 }, cost, ms: Date.now() - started };
    } catch (err) {
      record({ ref, task, brandId, ok: false, error: err.message });
      throw err;
    }
  }

  // İş için atanan modelle (ya da o an seçilen modelle) çalıştırır; geçici bir hata olursa işin yedek modeline geçer
  async function run({ task = 'fikir', brandId = null, prompt, json = false, temperature = 0.8, modelRef = null, images = [], videoUrl = null }) {
    checkBudget();
    const a = assignment(task);
    let primary = a.primary;
    if (modelRef) {
      const p = parseRef(modelRef);
      if (!p || !providers[p.provider]) throw badRequest('Geçersiz model seçimi.');
      if (!isConfigured(p.provider)) throw new HttpError(409, 'AI_NOT_CONFIGURED', `${PROVIDERS[p.provider] ? PROVIDERS[p.provider].label : p.provider} bağlı değil.`);
      primary = modelRef;
    }
    if (!primary) throw new HttpError(409, 'AI_NOT_CONFIGURED', 'AI bağlı değil. Yapay zekâ → Sağlayıcılar bölümünden bir anahtar ekle.');
    const fb = a.fallback && a.fallback !== primary ? a.fallback : null;
    // Video girdisinde yedek model de Gemini olmalı; değilse yedeğe geçilmez
    const fallback = fb && (!videoUrl || (parseRef(fb) || {}).provider === 'gemini') ? fb : null;
    try {
      return Object.assign(await runOne(primary, { task, brandId, prompt, json, temperature, images, videoUrl }), { fallbackUsed: false });
    } catch (err) {
      if (!fallback || !err.retryable) throw err;
      const r = await runOne(fallback, { task, brandId, prompt, json, temperature, images, videoUrl });
      return Object.assign(r, { fallbackUsed: true, primaryError: err.message });
    }
  }

  // --- Görsel üretimi (ayrı model listesi; görsel başına ücret) ---
  const imageProviders = ['gemini', 'openai', 'openrouter'];
  const imageCatalog = ref => IMAGE_MODELS.find(m => modelRef(m.provider, m.id) === ref) || null;
  function imageDefault() {
    const saved = settings.get(IMAGE_SETTING);
    const p = saved && parseRef(saved);
    if (p && imageProviders.includes(p.provider) && isConfigured(p.provider)) return saved;
    const pid = imageProviders.find(isConfigured);
    return pid ? modelRef(pid, IMAGE_DEFAULTS[pid]) : null;
  }
  function imageOverview() {
    return {
      configured: imageProviders.some(isConfigured),
      default: imageDefault(),
      aspects: IMAGE_ASPECTS,
      models: IMAGE_MODELS.map(m => Object.assign({}, m, { ref: modelRef(m.provider, m.id), available: isConfigured(m.provider), providerLabel: PROVIDERS[m.provider].label }))
    };
  }
  async function image({ brandId = null, prompt, modelRef: ref = null, aspect = '1:1', refs = [], keepAspect = false }) {
    checkBudget();
    const chosen = ref || imageDefault();
    if (!chosen) throw new HttpError(409, 'AI_IMAGE_NOT_CONFIGURED', 'Görsel üretimi için Gemini, OpenAI ya da OpenRouter anahtarı gerekli. Yapay zekâ → Sağlayıcılar bölümünden ekle.');
    const p = parseRef(chosen);
    if (!p || !imageProviders.includes(p.provider) || !providers[p.provider] || !providers[p.provider].image) throw badRequest('Bu model görsel üretmiyor; görsel modellerinden birini seç.');
    if (!isConfigured(p.provider)) throw new HttpError(409, 'AI_NOT_CONFIGURED', `${PROVIDERS[p.provider].label} bağlı değil.`);
    if (!IMAGE_ASPECTS[aspect]) throw badRequest('Geçersiz görsel oranı.');
    const cat = imageCatalog(chosen);
    const started = Date.now();
    try {
      const r = await providers[p.provider].image({ model: p.id, prompt, aspect: keepAspect ? null : aspect, refs: cat && cat.refs === false ? [] : refs });
      const cost = typeof r.cost === 'number' ? r.cost : (cat ? cat.perImage : 0);
      record({ ref: chosen, task: 'gorsel', brandId, usage: r.usage || {}, cost });
      return { buffer: r.buffer, mime: r.mime, ref: chosen, label: cat ? cat.label : p.id, cost, ms: Date.now() - started, usedRefs: Boolean(refs.length && (!cat || cat.refs)) };
    } catch (err) {
      record({ ref: chosen, task: 'gorsel', brandId, ok: false, error: err.message });
      throw err;
    }
  }

  return {
    providers,
    tasks: TASKS,
    image,
    imageOverview,
    setImageDefault(ref) {
      const p = parseRef(ref);
      if (ref && (!p || !imageProviders.includes(p.provider))) throw badRequest('Geçersiz görsel modeli.');
      settings.set(IMAGE_SETTING, ref || '');
      return imageOverview();
    },

    // İstemciye gönderilen özet (eski arayüzle uyumlu alanlar dahil). Anahtarın kendisi asla yok.
    status() {
      const a = assignment('fikir');
      const p = a.primary && parseRef(a.primary);
      const gKey = getKey('gemini');
      return {
        configured: Boolean(a.primary),
        provider: p ? p.provider : null,
        providerLabel: p ? (PROVIDERS[p.provider] || { label: providers[p.provider].label }).label : null,
        model: p ? labelOf(a.primary) : null,
        keyHint: gKey ? '••••' + gKey.slice(-4) : null,
        source: keySource('gemini'),
        models: GEMINI_TEXT_MODELS,
        budget: budgetStatus()
      };
    },

    overview() {
      const list = Object.entries(PROVIDERS).map(([id, p]) => {
        const key = getKey(id);
        return { id, label: p.label, note: p.note, keyUrl: p.keyUrl, keyPlaceholder: p.keyPlaceholder, configured: Boolean(key), source: keySource(id), keyHint: key ? '••••' + key.slice(-4) : null };
      });
      // Testlerdeki sahte sağlayıcı "bağlı" görünür (arayüz testleri gerçek anahtar olmadan çalışsın)
      if (providers.fake) list.push({ id: 'fake', label: providers.fake.label, note: '', keyUrl: '', keyPlaceholder: '', configured: true, source: 'test', keyHint: null, test: true });
      return {
        providers: list,
        models: MODELS.map(m => {
          const ref = modelRef(m.provider, m.id);
          return Object.assign({}, m, { ref, price: priceFor(ref) || m.price, available: isConfigured(m.provider) });
        }),
        tasks: Object.entries(TASKS).map(([id, t]) => Object.assign({ id }, t, assignment(id), { primaryLabel: assignment(id).primary ? labelOf(assignment(id).primary) : null })),
        budget: budgetStatus(),
        priceOverrides: priceOverrides()
      };
    },

    setApiKey(id, key) {
      if (!PROVIDERS[id]) throw badRequest('Geçersiz sağlayıcı.');
      settings.set(keySetting(id), key);
    },
    clearApiKey(id) {
      if (!PROVIDERS[id]) throw badRequest('Geçersiz sağlayıcı.');
      settings.remove(keySetting(id));
    },

    // Anahtarı doğrular ve modelleri listeler (OpenRouter'da fiyatlarla)
    async listModels(id) {
      if (!providers[id]) throw badRequest('Geçersiz sağlayıcı.');
      const list = await providers[id].listModels();
      liveModels[id] = list;
      return list.map(m => Object.assign({}, m, { ref: modelRef(id, m.id), price: priceFor(modelRef(id, m.id)) || m.price || null }));
    },

    setTasks(input) {
      const current = storedTasks();
      for (const [task, v] of Object.entries(input || {})) {
        if (!TASKS[task]) throw badRequest('Geçersiz iş: ' + task);
        const primary = v && v.primary ? String(v.primary) : '';
        const fallback = v && v.fallback ? String(v.fallback) : '';
        if (primary && !parseRef(primary)) throw badRequest('Geçersiz model seçimi.');
        if (fallback && !parseRef(fallback)) throw badRequest('Geçersiz yedek model seçimi.');
        current[task] = { primary, fallback };
      }
      settings.set(TASKS_SETTING, JSON.stringify(current));
    },

    setBudget({ monthlyUsd, warnPercent }) {
      const b = budget();
      if (monthlyUsd !== undefined) {
        const v = Number(monthlyUsd);
        if (!Number.isFinite(v) || v < 0 || v > 100000) throw badRequest('Aylık sınır 0 ile 100000 $ arasında olmalı (0 = sınırsız).');
        b.monthlyUsd = Math.round(v * 100) / 100;
      }
      if (warnPercent !== undefined) {
        const w = Number(warnPercent);
        if (!Number.isInteger(w) || w < 10 || w > 100) throw badRequest('Uyarı eşiği 10 ile 100 arasında olmalı.');
        b.warnPercent = w;
      }
      settings.set(BUDGET_SETTING, JSON.stringify(b));
      return budgetStatus();
    },

    setPrice(ref, price) {
      if (!parseRef(ref)) throw badRequest('Geçersiz model.');
      const all = priceOverrides();
      if (!price) delete all[ref];
      else {
        const input = Number(price.input);
        const output = Number(price.output);
        if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0 || input > 1000 || output > 1000) throw badRequest('Fiyat 0 ile 1000 $ arasında olmalı.');
        all[ref] = { input, output };
      }
      settings.set(PRICES_SETTING, JSON.stringify(all));
    },

    // Bu ayın (veya verilen ayın) harcama dökümü
    usage(month) {
      const start = month ? new Date(`${month}-01T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      if (Number.isNaN(start.getTime())) throw badRequest('Geçersiz ay.');
      const from = start.toISOString();
      const to = new Date(start.getFullYear(), start.getMonth() + 1, 1).toISOString();
      const q = (group, label) => db.prepare(`SELECT ${group} AS k, ${label} SUM(cost_usd) AS cost, SUM(input_tokens) AS input, SUM(output_tokens) AS output, COUNT(*) AS calls, SUM(ok = 0) AS failed
        FROM ai_usage u ${group.includes('b.') ? 'LEFT JOIN brands b ON b.id = u.brand_id' : ''} WHERE u.created_at >= ? AND u.created_at < ? GROUP BY k ORDER BY cost DESC`).all(from, to);
      const total = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS cost, COUNT(*) AS calls, COALESCE(SUM(ok = 0), 0) AS failed FROM ai_usage WHERE created_at >= ? AND created_at < ?').get(from, to);
      return {
        month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
        total,
        byBrand: q("COALESCE(b.name, 'Markasız')", ''),
        byTask: q('u.task', '').map(r => Object.assign(r, { label: (TASKS[r.k] && TASKS[r.k].label) || (r.k === 'karsilastirma' ? 'Model karşılaştırma' : r.k === 'gorsel' ? 'Görsel üretimi' : r.k) })),
        byModel: q("u.provider || ':' || u.model", '').map(r => Object.assign(r, { label: labelOf(r.k) })),
        budget: budgetStatus()
      };
    },

    run,
    runOne: async (ref, opts) => { checkBudget(); return runOne(ref, opts); },
    labelOf,
    priceFor,

    // Eski arayüz (asistan): generate(prompt, { json, temperature, task, brandId }) → yalnızca çıktı
    async generate(prompt, opts = {}) {
      const r = await run(Object.assign({ prompt }, opts));
      return r.output;
    }
  };
}
