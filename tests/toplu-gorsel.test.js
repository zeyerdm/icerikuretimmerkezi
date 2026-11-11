// Toplu testler: T.4 görsel üretimi. Sağlayıcı sunucuları sahte fetch ile taklit edilir; istek biçimleri doğrulanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, PNG_1PX } from './helpers.js';

const KEYS = { openai: 'sk-TEST-openai-0123456789abcdefghij', openrouter: 'sk-or-TEST-0123456789abcdefghijklmn', gemini: 'AIzaTEST0123456789abcdefghijklmnop' };
const B64 = PNG_1PX.toString('base64');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeImageApis() {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ host: u.host, path: u.pathname, headers: new Headers(init.headers), body });
    if (u.host === 'generativelanguage.googleapis.com') {
      if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
      if (u.pathname.endsWith(':predict')) return json({ predictions: [{ bytesBase64Encoded: B64, mimeType: 'image/png' }] });
      return json({ candidates: [{ content: { parts: [{ text: 'işte' }, { inlineData: { mimeType: 'image/png', data: B64 } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1290 } });
    }
    if (u.host === 'api.openai.com') {
      if (u.pathname === '/v1/models') return json({ data: [{ id: 'gpt-5' }] });
      if (u.pathname === '/v1/images/generations') return json({ data: [{ b64_json: B64 }] });
    }
    if (u.host === 'openrouter.ai') {
      if (u.pathname === '/api/v1/models') return json({ data: [{ id: 'google/gemini-2.5-flash-image', name: 'x', pricing: { prompt: '0', completion: '0' } }] });
      return json({ model: body.model, choices: [{ message: { content: '', images: [{ image_url: { url: `data:image/png;base64,${B64}` } }] } }], usage: { cost: 0.0421 } });
    }
    return json({}, 404);
  };
  return { impl, calls };
}

async function setup() {
  const api = fakeImageApis();
  const s = await startServer({ fetchImpl: api.impl });
  const brand = (await s.request('POST', '/api/brands', { name: 'Görsel', colors: { primary: '#c2410c' } })).data.brand;
  return { s, api, brand, gen: body => s.request('POST', `/api/brands/${brand.id}/images`, body) };
}
const connect = async (s, id) => assert.equal((await s.request('PUT', `/api/ai/keys/${id}`, { apiKey: KEYS[id] })).status, 200);

test('T.4 görsel: anahtar yokken 409, sahte görsel üretilmez', async () => {
  const { s, gen, brand } = await setup();
  try {
    const r = await gen({ prompt: 'Kahve fincanı' });
    assert.equal(r.status, 409);
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/assets`)).data.assets.length, 0);
    assert.equal((await s.request('GET', '/api/ai/images')).data.configured, false);
  } finally { await s.stop(); }
});

test('T.4 görsel: Gemini (Nano Banana) istek biçimi, maskot referansı, kütüphane ve geçmiş kaydı, harcama', async () => {
  const { s, api, gen, brand } = await setup();
  try {
    await connect(s, 'gemini');
    assert.equal((await gen({ prompt: 'Maskot kampüste', useMascot: true })).status, 400, 'maskot yokken açık hata');
    await s.request('POST', `/api/brands/${brand.id}/assets?category=mascot&label=Poz`, PNG_1PX, { 'Content-Type': 'image/png' });

    const r = await gen({ prompt: 'Maskot kampüste koşuyor', aspect: '4:5', useMascot: true });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const call = api.calls.filter(c => c.path.endsWith(':generateContent')).at(-1);
    assert.match(call.path, /gemini-2\.5-flash-image:generateContent$/);
    const parts = call.body.contents[0].parts;
    assert.match(parts[0].text, /Maskot kampüste koşuyor/);
    assert.match(parts[0].text, /#c2410c/, 'marka rengi istemde');
    assert.match(parts[0].text, /mascot/);
    assert.match(parts[0].text, /Do not render any text/);
    assert.equal(parts[1].inline_data.mime_type, 'image/png', 'maskot referansı gönderilmeli');
    assert.deepEqual(call.body.generationConfig.imageConfig, { aspectRatio: '4:5' });
    assert.ok(call.body.generationConfig.responseModalities.includes('IMAGE'));
    assert.equal(r.data.ai.usedRefs, true);
    assert.equal(r.data.asset.category, 'ai_image');

    const hist = (await s.request('GET', `/api/brands/${brand.id}/images`)).data.images;
    assert.equal(hist.length, 1);
    assert.equal(hist[0].aspect, '4:5');
    assert.equal(hist[0].usedRefs, true);
    const usage = (await s.request('GET', '/api/ai/usage')).data;
    assert.ok(JSON.stringify(usage).includes('gorsel'), 'harcama kaydı görsel işiyle düşmeli');

    // Geçersiz oran ve boş tarif
    assert.equal((await gen({ prompt: 'x', aspect: '3:7' })).status, 400);
    assert.equal((await gen({ prompt: '  ' })).status, 400);
  } finally { await s.stop(); }
});

test('T.4 görsel: Imagen predict biçimi, 4:5 → 3:4, maskot referans almayan modele gitmez', async () => {
  const { s, api, gen, brand } = await setup();
  try {
    await connect(s, 'gemini');
    await s.request('POST', `/api/brands/${brand.id}/assets?category=mascot`, PNG_1PX, { 'Content-Type': 'image/png' });
    const r = await gen({ prompt: 'Ürün fotoğrafı', aspect: '4:5', model: 'gemini:imagen-4.0-generate-001', useMascot: true });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const call = api.calls.find(c => c.path.endsWith(':predict'));
    assert.match(call.path, /imagen-4\.0-generate-001:predict$/);
    assert.equal(call.body.parameters.aspectRatio, '3:4');
    assert.equal(call.body.instances.length, 1);
    assert.doesNotMatch(call.body.instances[0].prompt, /attached reference/, 'referans almayan modelde "ekteki görsel" denmemeli');
    assert.equal(r.data.ai.usedRefs, false);
    // Kütüphanede olmayan @etiket açık hata verir
    assert.equal((await gen({ prompt: '@yok etiketi', model: 'gemini:imagen-4.0-generate-001' })).status, 400);
  } finally { await s.stop(); }
});

test('T.4 görsel: OpenAI images API boyutları ve OpenRouter görsel kipi', async () => {
  const { s, api, gen } = await setup();
  try {
    await connect(s, 'openai');
    for (const [aspect, size] of [['1:1', '1024x1024'], ['16:9', '1536x1024'], ['9:16', '1024x1536']]) {
      const r = await gen({ prompt: 'Kafe içi', aspect, model: 'openai:gpt-image-1' });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      const call = api.calls.filter(c => c.path === '/v1/images/generations').at(-1);
      assert.equal(call.body.size, size);
      assert.equal(call.body.model, 'gpt-image-1');
      assert.equal(call.headers.get('authorization'), `Bearer ${KEYS.openai}`);
    }

    await connect(s, 'openrouter');
    const r = await gen({ prompt: 'Kahve çekirdeği', aspect: '9:16', model: 'openrouter:google/gemini-2.5-flash-image' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const call = api.calls.filter(c => c.host === 'openrouter.ai' && c.path.endsWith('/chat/completions')).at(-1);
    assert.deepEqual(call.body.modalities, ['image', 'text']);
    assert.deepEqual(call.body.image_config, { aspect_ratio: '9:16' });
    assert.equal(r.data.ai.cost, 0.0421, 'OpenRouter\'ın bildirdiği maliyet kullanılmalı');
  } finally { await s.stop(); }
});

test('T.4 görsel: asistanın create_image işlemi kütüphaneye kaydeder', async () => {
  const api = fakeImageApis();
  const { fakeProvider } = await import('./helpers.js');
  const provider = fakeProvider([{ reply: 'Ürettim.', actions: [{ type: 'create_image', prompt: 'Latte art', aspect: '16:9' }] }]);
  const s = await startServer({ fetchImpl: api.impl, aiProvider: provider });
  try {
    await connect(s, 'gemini');
    const brand = (await s.request('POST', '/api/brands', { name: 'Asistan görseli' })).data.brand;
    const r = await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'Bir görsel üret' });
    const act = r.data.assistantMessage.actions.find(a => a.type === 'create_image');
    assert.equal(act.ok, true, JSON.stringify(act));
    assert.ok(act.asset.url);
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/images`)).data.images[0].aspect, '16:9');
  } finally { await s.stop(); }
});
