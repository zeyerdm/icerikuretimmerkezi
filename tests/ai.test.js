// Yapay zekâ katmanı testleri: çoklu sağlayıcı, işe göre model, yedek modele geçiş, harcama ve sınır, karşılaştırma.
// Gerçek API'lere gidilmez: her sağlayıcının HTTP biçimi sahte fetch ile taklit edilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { readZip } from '../server/lib/zip.js';

const KEYS = {
  anthropic: 'sk-ant-TEST-0123456789abcdefghijklmn',
  openai: 'sk-TEST-openai-0123456789abcdefghij',
  openrouter: 'sk-or-TEST-0123456789abcdefghijklmn',
  gemini: 'AIzaTEST0123456789abcdefghijklmnop'
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Sahte sağlayıcı sunucuları; fail: { anthropic: 500 } gibi hata durumları
function fakeApis({ fail = {}, reply = 'Merhaba' } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ host: u.host, path: u.pathname, headers, body });
    if (u.host === 'api.anthropic.com') {
      if (headers.get('x-api-key') !== KEYS.anthropic && headers.get('authorization') !== `Bearer ${KEYS.anthropic}`) return json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);
      if (fail.anthropic && u.pathname === '/v1/messages') return json({ type: 'error', error: { type: 'api_error', message: 'boom' } }, fail.anthropic);
      if (u.pathname === '/v1/models') return json({ data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', type: 'model', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'a', last_id: 'a' });
      const text = body.system && /JSON/.test(body.system) ? JSON.stringify({ reply: 'Claude yanıtı', actions: [] }) : `Claude: ${reply}`;
      return json({ id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 500 } });
    }
    if (u.host === 'api.openai.com') {
      if (headers.get('authorization') !== `Bearer ${KEYS.openai}`) return json({ error: { message: 'bad key' } }, 401);
      if (fail.openai && u.pathname.endsWith('/chat/completions')) return json({ error: { message: 'down' } }, fail.openai);
      if (u.pathname === '/v1/models') return json({ data: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }, { id: 'text-embedding-3-small' }, { id: 'gpt-4o-realtime-preview' }] });
      return json({ model: body.model, choices: [{ message: { content: body.response_format ? '{"reply":"GPT yanıtı","actions":[]}' : `GPT: ${reply}` } }], usage: { prompt_tokens: 2000, completion_tokens: 1000 } });
    }
    if (u.host === 'openrouter.ai') {
      if (headers.get('authorization') !== `Bearer ${KEYS.openrouter}`) return json({ error: { message: 'bad key' } }, 401);
      if (u.pathname === '/api/v1/models') return json({ data: [{ id: 'meta-llama/llama-5', name: 'Llama 5', pricing: { prompt: '0.0000003', completion: '0.0000006' } }] });
      return json({ model: body.model, choices: [{ message: { content: `OR: ${reply}` } }], usage: { prompt_tokens: 100, completion_tokens: 100, cost: 0.0123 } });
    }
    if (u.host === 'generativelanguage.googleapis.com') {
      if (headers.get('x-goog-api-key') !== KEYS.gemini) return json({ error: { message: 'API key not valid' } }, 400);
      if (fail.gemini && u.pathname.includes(':generateContent')) return json({ error: { message: 'x' } }, fail.gemini);
      if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
      return json({ candidates: [{ content: { parts: [{ text: body.generationConfig.responseMimeType ? '{"reply":"Gemini yanıtı","actions":[]}' : `Gemini: ${reply}` }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } });
    }
    return json({}, 404);
  };
  return { impl, calls };
}

async function connect(s, id) {
  const r = await s.request('PUT', `/api/ai/keys/${id}`, { apiKey: KEYS[id] });
  assert.equal(r.status, 200, `${id} bağlanamadı: ${JSON.stringify(r.data)}`);
  return r;
}

test('sağlayıcı bağlama: anahtar denenir, çalışmayan kaydedilmez; anahtar hiçbir yanıtta ve yedekte görünmez', async () => {
  const api = fakeApis();
  const s = await startServer({ fetchImpl: api.impl });
  try {
    const bad = await s.request('PUT', '/api/ai/keys/anthropic', { apiKey: 'sk-ant-YANLIS-0123456789abcdefghijk' });
    assert.equal(bad.status, 502);
    assert.match(bad.data.error.message, /anahtarı reddedildi/);
    assert.equal((await s.request('GET', '/api/ai')).data.providers.find(p => p.id === 'anthropic').configured, false);

    for (const id of Object.keys(KEYS)) await connect(s, id);
    const ov = (await s.request('GET', '/api/ai')).data;
    assert.ok(ov.providers.every(p => p.configured));
    const all = JSON.stringify(ov) + JSON.stringify((await s.request('GET', '/api/settings')).data);
    for (const k of Object.values(KEYS)) assert.ok(!all.includes(k), 'anahtar yanıtta görünüyor');
    // Varsayılan atama: Claude önce gelir
    assert.equal(ov.tasks.find(t => t.id === 'fikir').primary, 'anthropic:claude-sonnet-5-5');
    assert.equal(ov.tasks.find(t => t.id === 'ceviri').primary, 'anthropic:claude-haiku-5-5');

    await s.request('POST', '/api/brands', { name: 'A' });
    const { data: { backup } } = await s.request('POST', '/api/backups');
    const db = readZip((await s.request('GET', '/api/backups/' + backup.name)).data).find(e => e.name === 'app.db').data;
    for (const k of Object.values(KEYS)) assert.ok(!db.includes(Buffer.from(k)), 'anahtar yedeğe girdi');

    // Model listeleri: OpenAI'da yalnızca sohbet modelleri, OpenRouter'da canlı fiyat
    const oa = (await s.request('GET', '/api/ai/models/openai')).data.models.map(m => m.id);
    assert.deepEqual(oa, ['gpt-5', 'gpt-5-mini']);
    const or = (await s.request('GET', '/api/ai/models/openrouter')).data.models[0];
    assert.equal(or.ref, 'openrouter:meta-llama/llama-5');
    assert.ok(Math.abs(or.price.input - 0.3) < 1e-9 && Math.abs(or.price.output - 0.6) < 1e-9);
  } finally { await s.stop(); }
});

test('asistan atanan modelle çalışır; Claude isteği doğru biçimde gider, harcama kaydedilir', async () => {
  const api = fakeApis();
  const s = await startServer({ fetchImpl: api.impl });
  try {
    await connect(s, 'anthropic');
    const brand = (await s.request('POST', '/api/brands', { name: 'Kahve' })).data.brand;
    const r = await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'Fikir ver' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.assistantMessage.content, 'Claude yanıtı');
    const call = api.calls.filter(c => c.host === 'api.anthropic.com' && c.path === '/v1/messages').at(-1);
    assert.equal(call.body.model, 'claude-sonnet-5-5');
    assert.equal(call.body.fallbacks, 'default', 'sunucu tarafı yedek açık değil');
    assert.match(call.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
    assert.equal(call.body.output_config.effort, 'medium');
    assert.equal(call.body.temperature, undefined, 'Claude 5.5 sıcaklık parametresini kabul etmez');

    const usage = (await s.request('GET', '/api/ai/usage')).data;
    // Sonnet 5.5: 1000 girdi × 2 $ + 500 çıktı × 10 $ (milyon token başına) = 0,007 $
    assert.ok(Math.abs(usage.total.cost - 0.007) < 1e-9, 'tutar: ' + usage.total.cost);
    assert.equal(usage.byBrand[0].k, 'Kahve');
    assert.equal(usage.byTask[0].k, 'fikir');
    assert.equal(usage.byModel[0].label, 'Claude Sonnet 5.5');
  } finally { await s.stop(); }
});

test('işe göre model ataması ve yedek modele geçiş', async () => {
  const api = fakeApis({ fail: { openai: 503 } });
  const s = await startServer({ fetchImpl: api.impl });
  try {
    await connect(s, 'openai');
    await connect(s, 'gemini');
    assert.equal((await s.request('PUT', '/api/ai/tasks', { tasks: { fikir: { primary: 'olmayan' } } })).status, 400);
    await s.request('PUT', '/api/ai/tasks', { tasks: { fikir: { primary: 'openai:gpt-5', fallback: 'gemini:gemini-flash-latest' } } });
    const ov = (await s.request('GET', '/api/ai')).data;
    assert.equal(ov.tasks.find(t => t.id === 'fikir').fallback, 'gemini:gemini-flash-latest');

    const brand = (await s.request('POST', '/api/brands', { name: 'B' })).data.brand;
    const r = await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'merhaba' });
    // OpenAI 503 verdi → yedek Gemini yanıtladı
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.assistantMessage.content, 'Gemini yanıtı');
    const usage = (await s.request('GET', '/api/ai/usage')).data;
    assert.ok(usage.byModel.some(m => m.k === 'openai:gpt-5' && m.failed === 3), 'birincil model 1 + 2 yeniden denemeyle 3 kez denenip hatası kaydedilmeli');
    assert.ok(usage.byModel.some(m => m.k.startsWith('gemini:')), 'yedek model denenmedi');

    // Yedek yoksa: anlaşılır hata
    await s.request('PUT', '/api/ai/tasks', { tasks: { fikir: { primary: 'openai:gpt-5', fallback: '' } } });
    const e = await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'merhaba' });
    assert.equal(e.status, 502);
    assert.match(e.data.error.message, /OpenAI şu an yanıt vermiyor/);
  } finally { await s.stop(); }
});

test('aylık harcama sınırı: yaklaşınca uyarı, aşılınca çağrı yapılmaz; fiyat elle düzeltilebilir', async () => {
  const api = fakeApis();
  const s = await startServer({ fetchImpl: api.impl });
  try {
    await connect(s, 'anthropic');
    assert.equal((await s.request('PUT', '/api/ai/budget', { monthlyUsd: -1 })).status, 400);
    await s.request('PUT', '/api/ai/budget', { monthlyUsd: 0.01, warnPercent: 50 });
    const brand = (await s.request('POST', '/api/brands', { name: 'C' })).data.brand;
    await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'bir' });
    let b = (await s.request('GET', '/api/settings')).data.ai.budget;
    assert.equal(b.warning, true, 'uyarı yok');
    assert.equal(b.blocked, false);
    await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'iki' });
    b = (await s.request('GET', '/api/ai')).data.budget;
    assert.equal(b.blocked, true);
    const before = api.calls.length;
    const r = await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'üç' });
    assert.equal(r.status, 402);
    assert.equal(r.data.error.code, 'AI_BUDGET');
    assert.equal(api.calls.length, before, 'sınır aşıldığı halde istek gönderildi');

    // Fiyat düzeltme: sonraki hesaplar yeni fiyatla
    await s.request('PUT', '/api/ai/budget', { monthlyUsd: 0 });
    await s.request('PUT', '/api/ai/prices', { ref: 'anthropic:claude-sonnet-5-5', price: { input: 0, output: 0 } });
    const ov = (await s.request('GET', '/api/ai')).data;
    assert.equal(ov.models.find(m => m.ref === 'anthropic:claude-sonnet-5-5').price.source, 'elle');
    const spentBefore = ov.budget.spent;
    await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'dört' });
    assert.equal((await s.request('GET', '/api/ai')).data.budget.spent, spentBefore);
    assert.equal((await s.request('PUT', '/api/ai/prices', { ref: 'x', price: { input: 1, output: 1 } })).status, 400);
  } finally { await s.stop(); }
});

test('model karşılaştırma: aynı brief iki modele gider, sonuçlar yan yana saklanır, kazanan seçilir', async () => {
  const api = fakeApis({ reply: 'senaryo' });
  const s = await startServer({ fetchImpl: api.impl });
  try {
    await connect(s, 'anthropic');
    await connect(s, 'openrouter');
    const brand = (await s.request('POST', '/api/brands', { name: 'Marka X', tone: 'Samimi' })).data.brand;
    assert.equal((await s.request('POST', '/api/ai/compare', { brief: 'x', models: ['anthropic:claude-opus-5-5'] })).status, 400);
    const r = await s.request('POST', '/api/ai/compare', { brief: 'Sabah kahvesi', kind: 'reels', brandId: brand.id, models: ['anthropic:claude-opus-5-5', 'openrouter:meta-llama/llama-5'] });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const c = r.data.comparison;
    assert.equal(c.results.length, 2);
    assert.ok(c.results.every(x => x.ok));
    assert.equal(c.results[0].text, 'Claude: senaryo');
    assert.equal(c.results[1].cost, 0.0123, 'OpenRouter tutarı kullanılmadı');
    // İstemde marka hafızası ve Reels şablonu var
    const sent = api.calls.find(x => x.host === 'api.anthropic.com' && x.path === '/v1/messages').body.messages[0].content;
    assert.match(sent, /Marka X/);
    assert.match(sent, /Reels senaryosu/);
    assert.match(sent, /Sabah kahvesi/);

    assert.equal((await s.request('PUT', `/api/ai/comparisons/${c.id}/winner`, { ref: 'openai:gpt-5' })).status, 400);
    await s.request('PUT', `/api/ai/comparisons/${c.id}/winner`, { ref: 'anthropic:claude-opus-5-5' });
    const list = (await s.request('GET', '/api/ai/comparisons')).data;
    assert.equal(list.comparisons[0].winner, 'anthropic:claude-opus-5-5');
    assert.deepEqual(list.scoreboard, [{ ref: 'anthropic:claude-opus-5-5', label: 'Claude Opus 5.5', wins: 1 }]);
    assert.ok((await s.request('GET', '/api/ai/usage')).data.byTask.some(t => t.k === 'karsilastirma'));
  } finally { await s.stop(); }
});

test('8.1 geçici hata: aynı modelle yeniden denenir; hep başarısızsa aynı sağlayıcının hafif modeline geçilir; anahtar hatası denenmez', async () => {
  let mode = 'twice'; let busy = 2;
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
    const model = decodeURIComponent(u.pathname.split('/').pop().split(':')[0]);
    calls.push(model);
    if (model === 'gemini-flash-latest') {
      if (mode === 'twice' && busy-- > 0) return json({ error: { message: 'This model is currently experiencing high demand.' } }, 503);
      if (mode === 'always') return json({ error: { message: 'high demand' } }, 503);
      if (mode === 'badkey') return json({ error: { message: 'API key not valid' } }, 400);
    }
    return json({ candidates: [{ content: { parts: [{ text: '{"reply":"Tamam","actions":[]}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
  };
  const s = await startServer({ fetchImpl });
  try {
    await connect(s, 'gemini');
    const b = (await s.request('POST', '/api/brands', { name: 'Yeniden' })).data.brand;
    // İki kez 503, üçüncüde başarılı: aynı modelle, yedeğe geçmeden
    const r1 = await s.request('POST', `/api/brands/${b.id}/chat`, { message: 'selam' });
    assert.equal(r1.status, 200, JSON.stringify(r1.data));
    assert.deepEqual(calls, ['gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-latest']);
    // Hep 503: 3 deneme sonra hafif modele (Flash Lite) geçer
    calls.length = 0; mode = 'always';
    const r2 = await s.request('POST', `/api/brands/${b.id}/chat`, { message: 'selam' });
    assert.equal(r2.status, 200, JSON.stringify(r2.data));
    assert.deepEqual(calls, ['gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
    // Kalıcı hata (anahtar geçersiz): yeniden denenmez, yedeğe geçilmez
    calls.length = 0; mode = 'badkey';
    const r3 = await s.request('POST', `/api/brands/${b.id}/chat`, { message: 'selam' });
    assert.notEqual(r3.status, 200);
    assert.deepEqual(calls, ['gemini-flash-latest']);
  } finally { await s.stop(); }
});

test('8.2 / 8.3 model listesi sağlığı ve bağlantı denemesi: erişilemeyen model işaretlenir, seçilemez, deneme tablosu', async () => {
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash-image'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    const model = decodeURIComponent(u.pathname.split('/').pop().split(':')[0]);
    if (model === 'gemini-flash-lite-latest') return json({ error: { message: 'This model is no longer available to new users.' } }, 404);
    return json({ candidates: [{ content: { parts: [{ text: 'tamam' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } });
  };
  const s = await startServer({ fetchImpl });
  try {
    await connect(s, 'gemini'); // anahtar kaydında model kontrolü arka planda çalışır
    const check = (await s.request('POST', '/api/ai/check-models')).data;
    assert.deepEqual(check.missing, ['gemini:gemini-pro-latest'], 'canlı listede olmayan önerilen model');
    const ov = (await s.request('GET', '/api/ai')).data;
    assert.equal(ov.models.find(m => m.ref === 'gemini:gemini-pro-latest').unavailable, true);
    assert.equal(ov.models.find(m => m.ref === 'gemini:gemini-flash-latest').unavailable, false);

    const smoke = (await s.request('POST', '/api/ai/smoke')).data;
    const byTask = Object.fromEntries(smoke.rows.map(r => [r.task, r]));
    assert.equal(byTask.fikir.ok, true);
    assert.ok(byTask.fikir.ms >= 0);
    assert.equal(byTask.ceviri.ok, false, 'çeviri işi Flash Lite: listede var ama kapatılmış');
    assert.match(byTask.ceviri.error, /bulunamadı/);
    assert.ok(smoke.unavailable.includes('gemini:gemini-flash-lite-latest'), 'denemede kapatıldığı anlaşılan model işaretlenir');
    const ov2 = (await s.request('GET', '/api/ai')).data;
    assert.equal(ov2.tasks.find(t => t.id === 'ceviri').primaryUnavailable, true);
    assert.equal(ov2.tasks.find(t => t.id === 'fikir').primaryUnavailable, false);
    // Deneme harcaması kaydedilir
    assert.ok((await s.request('GET', '/api/ai/usage')).data.total.calls >= 4);
  } finally { await s.stop(); }
});
