// Reels modülü: marka başına fikir havuzu ve senaryolar (sürüm geçmişiyle).
// Her AI işleminde o an seçilen model kullanılabilir; seçilmezse işin atanmış modeli (senaryo: metin yazımı,
// havuz: fikir üretimi, çeviri: çeviri ve prompt) çalışır, geçici hatada işin yedek modeline geçilir.
import { newId, now, text, badRequest, notFound, oneOf, parseJson, HttpError } from '../../lib/http.js';
import { IDEA_CATEGORIES } from '../ideas.js';
import { TTS_VOICES } from '../ai/catalog.js';
import { FORMATS, STYLES, STATUSES, TITLE_STYLES, LIMITS, normalizeScenario, checkQuality, flowPrompt, cleanVideoPrompt, buildSrt, scriptText,
  scenarioPrompt, rewriteTask, poolPrompt, translatePrompt, totalSeconds, polish, titleKeyword } from './rules.js';

const MAX_POOL_TEXT = 300;

export function createReelsService({ db, ai, brands, workspace, patterns = null }) {
  // --- Marka ayarları: karakter adı, görsel stil, varsayılan başlık stili ---
  function settings(brandId) {
    const b = brands.get(brandId);
    const row = db.prepare('SELECT reels_settings FROM brands WHERE id = ?').get(b.id);
    const s = parseJson(row && row.reels_settings, {});
    // 8.13: markanın sesi (hazır ses + konuşma tarzı) seslendirmede varsayılan olur
    return { character: s.character || b.name, style: STYLES[s.style] ? s.style : '3d', titleStyle: TITLE_STYLES[s.titleStyle] ? s.titleStyle : 'marka', colors: b.colors, voice: TTS_VOICES[s.voice] ? s.voice : 'Kore', voiceStyle: s.voiceStyle || '' };
  }
  function setSettings(brandId, body = {}) {
    const b = brands.get(brandId);
    const cur = settings(b.id);
    const next = {
      character: 'character' in body ? text(body.character, { field: 'Karakter adı', max: 40, required: true }) : cur.character,
      style: 'style' in body ? oneOf(body.style, Object.keys(STYLES), 'Görsel stil') : cur.style,
      titleStyle: 'titleStyle' in body ? oneOf(body.titleStyle, Object.keys(TITLE_STYLES), 'Başlık stili') : cur.titleStyle,
      voice: 'voice' in body ? oneOf(body.voice, Object.keys(TTS_VOICES), 'Ses') : cur.voice,
      voiceStyle: 'voiceStyle' in body ? (text(body.voiceStyle, { field: 'Konuşma tarzı', max: 120 }) || '') : cur.voiceStyle
    };
    db.prepare('UPDATE brands SET reels_settings = ? WHERE id = ?').run(JSON.stringify(next), b.id);
    return settings(b.id);
  }

  const aiMeta = r => ({ model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) });
  const run = (brandId, task, prompt, { json = true, modelRef = null, temperature } = {}) =>
    ai.run({ task, brandId, prompt, json, modelRef: modelRef || null, temperature });

  // --- Fikir havuzu ---
  const toPool = r => ({ id: r.id, text: r.text, category: r.category, categoryLabel: IDEA_CATEGORIES[r.category] || r.category, rating: r.rating, source: r.source, createdAt: r.created_at,
    scenarioId: (db.prepare('SELECT id FROM reels WHERE pool_id = ? ORDER BY updated_at DESC LIMIT 1').get(r.id) || {}).id || null });
  const poolRow = (brandId, id) => {
    const r = db.prepare('SELECT * FROM reels_pool WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Fikir bulunamadı.');
    return r;
  };
  const poolKey = t => polish(t).toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N} ]/gu, '');

  function addPool(brandId, { text: t, category }, source = 'manual') {
    const b = brands.get(brandId);
    const row = { id: newId(), brand_id: b.id, text: text(t, { field: 'Fikir', max: MAX_POOL_TEXT, required: true }), category: IDEA_CATEGORIES[category] ? category : 'eglenceli', source, created_at: now() };
    const dup = db.prepare('SELECT text FROM reels_pool WHERE brand_id = ?').all(b.id).some(r => poolKey(r.text) === poolKey(row.text));
    if (dup) throw badRequest('Bu fikir havuzda zaten var.');
    db.prepare('INSERT INTO reels_pool (id, brand_id, text, category, source, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(row.id, row.brand_id, row.text, row.category, row.source, row.created_at);
    return toPool(Object.assign(row, { rating: 0 }));
  }

  async function expandPool(brandId, { category = null, similarTo = null, modelRef = null } = {}) {
    const b = brands.get(brandId);
    const all = db.prepare('SELECT * FROM reels_pool WHERE brand_id = ? ORDER BY created_at DESC').all(b.id);
    const source = similarTo ? poolRow(b.id, similarTo) : null;
    const cat = source ? source.category : (IDEA_CATEGORIES[category] ? category : null);
    const s = settings(b.id);
    const liked = all.filter(r => r.rating > 0).map(r => r.text);
    const examples = (liked.length ? liked : all.filter(r => !cat || r.category === cat).map(r => r.text)).slice(0, 12);
    const prompt = poolPrompt({ brandName: b.name, memory: brands.memory(b.id), character: s.character, categories: IDEA_CATEGORIES, examples,
      existing: all.slice(0, 200).map(r => r.text), disliked: all.filter(r => r.rating < 0).map(r => r.text).slice(0, 15), count: source ? 3 : 5, category: cat, similarTo: source && source.text });
    const r = await run(b.id, 'fikir', prompt, { modelRef, temperature: 1 });
    const raw = Array.isArray(r.output) ? r.output : ((r.output && r.output.ideas) || []);
    const added = [];
    for (const item of raw) {
      try { added.push(addPool(b.id, { text: String((item && item.text) || '').slice(0, MAX_POOL_TEXT), category: cat || (item && item.category) }, 'ai')); } catch { /* boş veya tekrar eden fikir atlanır */ }
    }
    if (!added.length) throw new HttpError(502, 'AI_NO_NEW', 'Yeni fikir çıkmadı (hepsi havuzda vardı). Tekrar dene.');
    brands.logActivity(b.id, 'reels.pool', `Reels fikir havuzuna ${added.length} fikir eklendi`);
    return { added, ai: aiMeta(r) };
  }

  // --- Senaryolar ---
  const scenarioRow = (brandId, id) => {
    const r = db.prepare('SELECT * FROM reels WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Senaryo bulunamadı.');
    return r;
  };
  function addVersion(reelsId, data, note, model = '') {
    db.prepare('INSERT INTO reels_versions (id, reels_id, note, model, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(newId(), reelsId, note, model, JSON.stringify(data), now());
  }

  function detail(brandId, row) {
    const s = settings(brandId);
    const data = parseJson(row.data, {});
    const allow = [brands.get(brandId).name, s.character];
    const issues = checkQuality(data, { character: s.character, allow });
    const opts = { character: s.character, style: s.style, colors: s.colors };
    const content = db.prepare('SELECT id, scheduled_at FROM contents WHERE reels_id = ? ORDER BY created_at DESC LIMIT 1').get(row.id);
    return {
      id: row.id, poolId: row.pool_id, title: row.title, status: row.status, statusLabel: STATUSES[row.status] || row.status, model: row.model, modelLabel: row.model ? ai.labelOf(row.model) : '',
      createdAt: row.created_at, updatedAt: row.updated_at, data, issues, totalSeconds: totalSeconds(data),
      prompts: (data.scenes || []).map((_, i) => ({
        flowEn: flowPrompt(data, i, Object.assign({ lang: 'en' }, opts)), flowTr: flowPrompt(data, i, Object.assign({ lang: 'tr' }, opts)),
        cleanEn: cleanVideoPrompt(data, i, Object.assign({ lang: 'en' }, opts)), cleanTr: cleanVideoPrompt(data, i, Object.assign({ lang: 'tr' }, opts))
      })),
      srt: buildSrt(data),
      script: scriptText(data, Object.assign({ issues }, opts)),
      content: content ? { id: content.id, scheduledAt: content.scheduled_at } : null,
      versions: db.prepare('SELECT id, note, model, created_at FROM reels_versions WHERE reels_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 30').all(row.id)
        .map(v => ({ id: v.id, note: v.note, model: v.model, modelLabel: v.model ? ai.labelOf(v.model) : '', createdAt: v.created_at }))
    };
  }

  function list(brandId) {
    const b = brands.get(brandId);
    const s = settings(b.id);
    return db.prepare('SELECT * FROM reels WHERE brand_id = ? ORDER BY updated_at DESC').all(b.id).map(r => {
      const data = parseJson(r.data, {});
      return { id: r.id, poolId: r.pool_id, title: r.title, status: r.status, statusLabel: STATUSES[r.status] || r.status, format: data.format, formatLabel: (FORMATS[data.format] || {}).label || '',
        screenTitle: data.screenTitle, totalSeconds: totalSeconds(data), sceneCount: (data.scenes || []).length, issueCount: checkQuality(data, { character: s.character, allow: [b.name, s.character] }).length,
        modelLabel: r.model ? ai.labelOf(r.model) : '', updatedAt: r.updated_at };
    });
  }

  function promptContext(b, excludeId) {
    const pool = db.prepare('SELECT text, rating FROM reels_pool WHERE brand_id = ?').all(b.id);
    return {
      liked: pool.filter(p => p.rating > 0).map(p => p.text).slice(0, 8),
      disliked: pool.filter(p => p.rating < 0).map(p => p.text).slice(0, 12),
      existing: db.prepare('SELECT title FROM reels WHERE brand_id = ? AND id != ? ORDER BY updated_at DESC LIMIT 30').all(b.id, excludeId || '').map(r => r.title)
    };
  }

  async function create(brandId, { topic, poolId = null, format = null, modelRef = null, patternId = null } = {}) {
    const b = brands.get(brandId);
    const pool = poolId ? poolRow(b.id, poolId) : null;
    const t = pool ? pool.text : text(topic, { field: 'Konu', max: 1000, required: true });
    if (format && !FORMATS[format]) throw badRequest('Geçersiz format.');
    const s = settings(b.id);
    const pattern = patterns ? patterns.promptBlock(b.id, patternId || null) : '';
    const prompt = scenarioPrompt(Object.assign({ brandName: b.name, memory: brands.memory(b.id), settings: s, topic: t, format, pattern }, promptContext(b)));
    const r = await run(b.id, 'yazim', prompt, { modelRef });
    const data = normalizeScenario(r.output, { titleStyle: s.titleStyle });
    if (!data) throw new HttpError(502, 'AI_BAD_SCENARIO', 'Model kullanılabilir bir senaryo döndürmedi. Tekrar dene ya da başka bir model seç.');
    const row = { id: newId(), brand_id: b.id, pool_id: pool ? pool.id : null, title: data.title, status: 'taslak', data: JSON.stringify(data), model: r.servedRef || r.ref, created_at: now() };
    db.prepare('INSERT INTO reels (id, brand_id, pool_id, title, status, data, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.id, row.brand_id, row.pool_id, row.title, row.status, row.data, row.model, row.created_at, row.created_at);
    addVersion(row.id, data, 'İlk senaryo', row.model);
    brands.logActivity(b.id, 'reels.created', `Reels senaryosu yazıldı: ${data.title}`);
    return Object.assign(detail(b.id, Object.assign(row, { updated_at: row.created_at })), { ai: aiMeta(r) });
  }

  function save(brandId, row, data, note, model) {
    const t = now();
    db.prepare('UPDATE reels SET title = ?, data = ?, model = ?, updated_at = ? WHERE id = ?').run(data.title || row.title, JSON.stringify(data), model || row.model, t, row.id);
    addVersion(row.id, data, note, model || '');
    return detail(brandId, scenarioRow(brandId, row.id));
  }

  // Senaryonun tamamını ya da tek sahnesini yeniden yazdırır (seçilen modelle)
  async function regenerate(brandId, id, { sceneIndex = null, modelRef = null } = {}) {
    const b = brands.get(brandId);
    const row = scenarioRow(b.id, id);
    const current = parseJson(row.data, {});
    const idx = sceneIndex == null || sceneIndex === '' ? null : Number(sceneIndex);
    if (idx != null && !(Number.isInteger(idx) && current.scenes && current.scenes[idx])) throw badRequest('Geçersiz sahne.');
    const s = settings(b.id);
    const topic = current.topic || current.title;
    const prompt = scenarioPrompt(Object.assign({ brandName: b.name, memory: brands.memory(b.id), settings: s, topic, format: current.format, rewrite: rewriteTask(current, idx) }, promptContext(b, row.id)));
    const r = await run(b.id, 'yazim', prompt, { modelRef });
    const fresh = normalizeScenario(r.output, { titleStyle: current.titleStyle || s.titleStyle });
    if (!fresh) throw new HttpError(502, 'AI_BAD_SCENARIO', 'Model kullanılabilir bir senaryo döndürmedi. Tekrar dene ya da başka bir model seç.');
    let data = fresh;
    if (idx != null) {
      // Yalnızca istenen sahne değişir; diğer sahneler ve başlık, açıklama gibi alanlar korunur
      const scene = fresh.scenes[idx] || fresh.scenes[0];
      data = Object.assign({}, current, { scenes: current.scenes.map((sc, i) => (i === idx ? Object.assign({}, scene, { duration: sc.duration }) : sc)) });
    } else {
      data.titleStyle = current.titleStyle || data.titleStyle;
    }
    const out = save(b.id, row, data, idx == null ? 'Senaryo yeniden yazıldı' : `Sahne ${idx + 1} yeniden yazıldı`, r.servedRef || r.ref);
    return Object.assign(out, { ai: aiMeta(r) });
  }

  // Elle düzenleme: başlık, açıklama, replikler, Türkçe/İngilizce sahne tarifi, durum
  function update(brandId, id, body = {}) {
    const b = brands.get(brandId);
    const row = scenarioRow(b.id, id);
    if ('status' in body) {
      db.prepare('UPDATE reels SET status = ?, updated_at = ? WHERE id = ?').run(oneOf(body.status, Object.keys(STATUSES), 'Durum'), now(), row.id);
      if (!body.data) return detail(b.id, scenarioRow(b.id, row.id));
    }
    const patch = body.data || {};
    const data = parseJson(row.data, {});
    if ('title' in patch) data.title = text(patch.title, { field: 'Video adı', max: 120, required: true });
    if ('screenTitle' in patch) { data.screenTitle = text(patch.screenTitle, { field: 'Ekran başlığı', max: 80, required: true }); data.titleKeyword = titleKeyword(data.screenTitle, patch.titleKeyword || data.titleKeyword); }
    if ('titleKeyword' in patch) data.titleKeyword = titleKeyword(data.screenTitle, patch.titleKeyword);
    if ('titleStyle' in patch) data.titleStyle = oneOf(patch.titleStyle, Object.keys(TITLE_STYLES), 'Başlık stili');
    if ('caption' in patch) data.caption = text(patch.caption, { field: 'Açıklama', max: 3000 });
    if ('hashtags' in patch) data.hashtags = (Array.isArray(patch.hashtags) ? patch.hashtags : String(patch.hashtags || '').split(/[\s,]+/)).map(h => polish(h).replace(/^#?/, '#')).filter(h => h.length > 1).slice(0, 10);
    if (Array.isArray(patch.scenes)) {
      patch.scenes.forEach((p, i) => {
        const sc = data.scenes[i];
        if (!sc || !p) return;
        if ('line' in p) sc.line = text(p.line, { field: `Sahne ${i + 1} repliği`, max: 400 });
        if ('flowSceneTr' in p && polish(p.flowSceneTr) !== polish(sc.flowSceneTr)) { sc.flowSceneTr = text(p.flowSceneTr, { field: `Sahne ${i + 1} Türkçe tarifi`, max: 3000 }); sc.enOutdated = true; }
        if ('flowScene' in p) { sc.flowScene = text(p.flowScene, { field: `Sahne ${i + 1} İngilizce prompt'u`, max: 3000 }); delete sc.enOutdated; }
      });
    }
    return save(b.id, row, data, 'Elle düzenlendi');
  }

  // Sahne tarifini diğer dile çevirir; Türkçe düzeltmeden sonra İngilizce prompt böyle güncellenir
  async function translate(brandId, id, { sceneIndex, to = 'en', modelRef = null } = {}) {
    const b = brands.get(brandId);
    const row = scenarioRow(b.id, id);
    const data = parseJson(row.data, {});
    const sc = data.scenes && data.scenes[Number(sceneIndex)];
    if (!sc) throw badRequest('Geçersiz sahne.');
    const source = to === 'en' ? sc.flowSceneTr : sc.flowScene;
    if (!source) throw badRequest('Çevrilecek sahne tarifi yok.');
    const r = await run(b.id, 'ceviri', translatePrompt(source, to, settings(b.id).character), { json: false, modelRef, temperature: 0.2 });
    const out = String(r.output).replace(/^```[a-z]*\s*|\s*```$/g, '').replace(/^(TÜRKÇE|İNGİLİZCE|ENGLISH|TURKISH):\s*/i, '').trim();
    if (to === 'en') { sc.flowScene = out; delete sc.enOutdated; } else sc.flowSceneTr = out;
    return Object.assign(save(b.id, row, data, `Sahne ${Number(sceneIndex) + 1} çevrildi (${to === 'en' ? 'İngilizce' : 'Türkçe'})`, r.servedRef || r.ref), { ai: aiMeta(r) });
  }

  function restore(brandId, id, versionId) {
    const b = brands.get(brandId);
    const row = scenarioRow(b.id, id);
    const v = db.prepare('SELECT * FROM reels_versions WHERE id = ? AND reels_id = ?').get(String(versionId), row.id);
    if (!v) throw notFound('Sürüm bulunamadı.');
    return save(b.id, row, parseJson(v.data, {}), `Önceki sürüme dönüldü (${new Date(v.created_at).toLocaleString('tr-TR')})`, v.model);
  }

  function remove(brandId, id) {
    const row = scenarioRow(brands.get(brandId).id, id);
    db.prepare('DELETE FROM reels WHERE id = ?').run(row.id);
  }

  // Takvime ekler: içerik "Reels" türünde, senaryoya bağlı; arşivde ve takvimde senaryoya dönülebilir
  function schedule(brandId, id, { scheduledAt = null } = {}) {
    const b = brands.get(brandId);
    const row = scenarioRow(b.id, id);
    const sd = parseJson(row.data, {});
    const content = workspace.createContent({ brandId: b.id, title: row.title, type: 'reels', status: row.status === 'paylasildi' ? 'yayinlandi' : 'hazirlaniyor', scheduledAt, notes: 'Reels senaryosundan oluşturuldu.', caption: String(sd.caption || '').slice(0, 2200), hashtags: sd.hashtags || [] });
    db.prepare('UPDATE contents SET reels_id = ? WHERE id = ?').run(row.id, content.id);
    return Object.assign(content, { reelsId: row.id });
  }

  return {
    meta: { formats: Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [k, v.label])), styles: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.label])),
      titleStyles: Object.fromEntries(Object.entries(TITLE_STYLES).map(([k, v]) => [k, v.label])), statuses: STATUSES, categories: IDEA_CATEGORIES, limits: LIMITS },
    settings, setSettings,
    listPool: brandId => db.prepare('SELECT * FROM reels_pool WHERE brand_id = ? ORDER BY created_at DESC, rowid DESC').all(brands.get(brandId).id).map(toPool),
    addPool,
    updatePool(brandId, id, body = {}) {
      const row = poolRow(brands.get(brandId).id, id);
      const rating = 'rating' in body ? Math.max(-1, Math.min(1, Math.round(Number(body.rating) || 0))) : row.rating;
      const category = 'category' in body ? oneOf(body.category, Object.keys(IDEA_CATEGORIES), 'Kategori') : row.category;
      const t = 'text' in body ? text(body.text, { field: 'Fikir', max: MAX_POOL_TEXT, required: true }) : row.text;
      db.prepare('UPDATE reels_pool SET rating = ?, category = ?, text = ? WHERE id = ?').run(rating, category, t, row.id);
      return toPool(Object.assign(row, { rating, category, text: t }));
    },
    removePool(brandId, id) { db.prepare('DELETE FROM reels_pool WHERE id = ?').run(poolRow(brands.get(brandId).id, id).id); },
    expandPool,
    list, create, regenerate, update, translate, restore, remove, schedule,
    get: (brandId, id) => detail(brands.get(brandId).id, scenarioRow(brands.get(brandId).id, id))
  };
}
