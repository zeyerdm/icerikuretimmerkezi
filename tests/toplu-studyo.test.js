// Toplu testler: T.16 beyin fırtınası, geliştir, @ referanslar; T.17 alan düzenleme ve üretim geçmişi (sunucu tarafı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';
import { mentionOf } from '../server/services/assets.js';

const png = { 'Content-Type': 'image/png' };
const GEMINI = 'AIzaTEST0123456789abcdefghijklmnop';
const OPENAI = 'sk-TEST-openai-0123456789abcdefghij';
const B64 = PNG_1PX.toString('base64');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function imageApis() {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ host: u.host, path: u.pathname, body });
    if (u.host === 'generativelanguage.googleapis.com') {
      if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
      return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }], usageMetadata: {} });
    }
    if (u.host === 'api.openai.com') {
      if (u.pathname === '/v1/models') return json({ data: [{ id: 'gpt-5' }] });
      return json({ data: [{ b64_json: B64 }] });
    }
    return json({}, 404);
  };
  return { impl, calls };
}

test('T.16 beyin fırtınası ve geliştir: sınırlar, temizleme, kaydedilmeme', async () => {
  const provider = fakeProvider([p => {
    if (p.startsWith('PROMPT BEYİN FIRTINASI')) return { concepts: Array.from({ length: 7 }, (_, i) => ({ name: i === 1 ? '' : `Konsept ${i}`, idea: 'Fikir', variations: [{ prompt: `p${i}a`, promptTr: 'tr' }, { prompt: '' }, { prompt: `p${i}b` }, { prompt: `p${i}c` }, { prompt: `p${i}d` }] })) };
    if (p.startsWith('PROMPT GELİŞTİRME')) return { title: 'Gelişmiş', prompt: 'A detailed cinematic coffee shot, 50mm lens, warm light', promptTr: 'Ayrıntılı sinematik kahve çekimi' };
    return {};
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Stüdyo' })).data.brand;
    const url = `/api/brands/${a.id}/prompts`;
    // Konsept 2–5, varyasyon 1–3 aralığına sıkıştırılır
    const big = (await s.request('POST', `${url}/brainstorm`, { kind: 'gorsel', brief: 'Kahve', concepts: 99, variations: 99 })).data;
    assert.equal(big.concepts.length, 5);
    assert.ok(big.concepts.every(c => c.variations.length === 3), 'boş varyasyon atlanır, en çok 3');
    assert.equal(big.concepts[1].name, 'Konsept', 'boş ad yer tutucuya döner');
    assert.equal(big.concepts[0].variations[0].promptTr, 'tr', 'İngilizce türde Türkçesi gelir');
    const small = (await s.request('POST', `${url}/brainstorm`, { kind: 'reels', brief: 'Kahve', concepts: 1, variations: -4 })).data;
    assert.equal(small.concepts.length, 2);
    assert.ok(small.concepts.every(c => c.variations.length === 1 && c.variations[0].promptTr === ''), 'Türkçe türde promptTr boş');
    assert.match(provider.calls.at(-1).prompt, /2 konsept öner[\s\S]*1 varyasyon/);
    // 0 / boş değer varsayılana (3 konsept × 2 varyasyon) döner
    const def = (await s.request('POST', `${url}/brainstorm`, { kind: 'gorsel', brief: 'Kahve', concepts: 0, variations: 0 })).data;
    assert.deepEqual(def.concepts.map(c => c.variations.length), [2, 2, 2]);
    assert.equal((await s.request('POST', `${url}/brainstorm`, { kind: 'yok', brief: 'x' })).status, 400);
    // Beyin fırtınası kaydedilmez
    assert.deepEqual((await s.request('GET', url)).data.prompts, []);

    const en = (await s.request('POST', `${url}/enhance`, { kind: 'gorsel', text: 'kahve fotoğrafı' })).data;
    assert.match(en.prompt, /50mm lens/);
    assert.equal(en.promptTr, 'Ayrıntılı sinematik kahve çekimi');
    assert.match(provider.calls.at(-1).prompt, /KISA TASLAK:\nkahve fotoğrafı/);
    assert.equal((await s.request('POST', `${url}/enhance`, { kind: 'gorsel', text: '' })).status, 400);
    assert.deepEqual((await s.request('GET', url)).data.prompts, [], 'geliştir de kaydetmez');
  } finally { await s.stop(); }
});

test('T.16 @ referanslar: Türkçe sadeleştirme, rol talimatları, en çok 3 görsel, desteklemeyen model ve olmayan etiket', async () => {
  assert.equal(mentionOf('Çay Bardağı Şık', 'x'), 'cay-bardagi-sik');
  assert.equal(mentionOf('  İğne  ', 'x'), 'igne');
  assert.equal(mentionOf('', 'abcdef123'), 'gorsel-abcdef');

  const api = imageApis();
  const s = await startServer({ fetchImpl: api.impl });
  try {
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: GEMINI })).status, 200);
    const a = (await s.request('POST', '/api/brands', { name: 'Anma' })).data.brand;
    const up = async (label, category, refRole) => {
      const asset = (await s.request('POST', `/api/brands/${a.id}/assets?category=${category}&label=${encodeURIComponent(label)}`, PNG_1PX, png)).data.asset;
      if (refRole) await s.request('PATCH', `/api/brands/${a.id}/assets/${asset.id}`, { refRole });
      return asset;
    };
    await up('Maskot Kahveci', 'mascot');
    await up('Çay Bardağı', 'product', 'nesne');
    await up('Pastel Stil', 'brand_image', 'stil');
    await up('Dördüncü', 'product');

    const r = await s.request('POST', `/api/brands/${a.id}/images`, { prompt: '@maskot-kahveci elinde @cay-bardagi tutuyor, @pastel-stil havasında', model: 'gemini:gemini-2.5-flash-image' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const parts = api.calls.filter(c => c.path.endsWith(':generateContent')).at(-1).body.contents[0].parts;
    assert.equal(parts.filter(p => p.inline_data).length, 3);
    const text = parts[0].text;
    assert.match(text, /Reference image 1 \(@maskot-kahveci\) is an identity reference/, 'maskot kategorisi kimlik rolü alır');
    assert.match(text, /Reference image 2 \(@cay-bardagi\) is an object reference/);
    assert.match(text, /Reference image 3 \(@pastel-stil\) is a style reference/);

    // En çok 3 görsel modele gider
    await s.request('POST', `/api/brands/${a.id}/images`, { prompt: '@maskot-kahveci @cay-bardagi @pastel-stil @dorduncu', model: 'gemini:gemini-2.5-flash-image' });
    assert.equal(api.calls.filter(c => c.path.endsWith(':generateContent')).at(-1).body.contents[0].parts.filter(p => p.inline_data).length, 3);
    // Olmayan etiket ve referans almayan model açık hata
    const missing = await s.request('POST', `/api/brands/${a.id}/images`, { prompt: '@olmayan-gorsel', model: 'gemini:gemini-2.5-flash-image' });
    assert.equal(missing.status, 400);
    assert.match(missing.data.error.message, /@olmayan-gorsel/);
    const noRef = await s.request('POST', `/api/brands/${a.id}/images`, { prompt: '@maskot-kahveci koşuyor', model: 'gemini:imagen-4.0-generate-001' });
    assert.equal(noRef.status, 400);
    assert.match(noRef.data.error.message, /referans görsel almıyor/);
  } finally { await s.stop(); }
});

test('T.17 alan düzenleme: işaretli görsel doğrulaması, iki görsel modele, oran gönderilmez, geçmişte kayıt', async () => {
  const api = imageApis();
  const s = await startServer({ fetchImpl: api.impl });
  try {
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: GEMINI })).status, 200);
    const a = (await s.request('POST', '/api/brands', { name: 'Düzenleme' })).data.brand;
    const orig = (await s.request('POST', `/api/brands/${a.id}/assets?category=ai_image&label=Asıl`, PNG_1PX, png)).data.asset;
    const url = q => `/api/brands/${a.id}/images/edit?assetId=${orig.id}&instruction=${encodeURIComponent('Fincanı mavi yap')}${q || ''}`;

    assert.equal((await s.request('POST', url(), Buffer.from('görsel değil'), png)).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${a.id}/images/edit?assetId=${orig.id}&instruction=`, PNG_1PX, png)).status, 400);
    const r = await s.request('POST', url('&model=gemini:gemini-2.5-flash-image'), PNG_1PX, png);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const body = api.calls.filter(c => c.path.endsWith(':generateContent')).at(-1).body;
    assert.equal(body.contents[0].parts.filter(p => p.inline_data).length, 2, 'asıl ve işaretli görsel gider');
    assert.match(body.contents[0].parts[0].text, /Change: Fincanı mavi yap/);
    assert.equal(body.generationConfig.imageConfig, undefined, 'oran yapılandırması gönderilmez (asıl oran korunur)');
    assert.notEqual(r.data.asset.id, orig.id, 'asıl görsel korunur, yeni görsel kaydedilir');
    assert.match(r.data.asset.label, /^Düzenlendi: /);

    const hist = (await s.request('GET', `/api/brands/${a.id}/images`)).data.images;
    assert.equal(hist[0].aspect, 'kaynak');
    assert.equal(hist[0].usedRefs, true);
    assert.match(hist[0].prompt, /Alan düzenleme: Fincanı mavi yap/);

    // Referans almayan modelde açık hata
    assert.equal((await s.request('PUT', '/api/ai/keys/openai', { apiKey: OPENAI })).status, 200);
    const bad = await s.request('POST', url('&model=openai:gpt-image-1'), PNG_1PX, png);
    assert.equal(bad.status, 400);
    assert.match(bad.data.error.message, /referansı alan bir model/);
  } finally { await s.stop(); }
});
