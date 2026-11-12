// 7.13 Model karşılaştırma: aynı kemik + aynı marka kimliğiyle iki modelin prompt'u yan yana; kalite puanıyla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const GOOD = 'Barista kafede latte art yapıyor, yakın plan çekim, sıcak altın saat ışığı, 50mm lens, sığ alan derinliği, krem ve kahve tonları, samimi his, gerçekçi fotoğraf stili, arka planda bulanık ahşap raflar ve buhar, temiz kompozisyon, yazı yok, harf yok, kelime yok, filigran yok, logo yok, altyazı yok, arayüz öğesi yok';

function gemini() {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: ['gemini-flash-latest', 'gemini-flash-lite-latest'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    const model = decodeURIComponent(u.pathname.split('/').pop().split(':')[0]);
    const body = JSON.parse(init.body);
    calls.push({ model, text: body.contents[0].parts.map(p => p.text || '').join('\n') });
    const out = model === 'gemini-flash-latest' ? { title: 'İyi', prompt: GOOD } : { title: 'Zayıf', prompt: 'Kafede kahve, Örnek Kafe logosu' };
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }], usageMetadata: {} });
  };
  return { impl, calls };
}

test('7.13 prompt karşılaştırması: aynı istem iki modele, kalite puanı, kayıt ve Prompt Studio\'ya kaydetme', async () => {
  const g = gemini();
  const s = await startServer({ fetchImpl: g.impl });
  try {
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' })).status, 200);
    const b = (await s.request('POST', '/api/brands', { name: 'Örnek Kafe' })).data.brand;
    await s.request('PUT', `/api/brands/${b.id}/prompt-identity`, { lighting: 'altin', noBrandName: true });
    assert.equal((await s.request('GET', '/api/ai')).data.kinds.prompt, 'Prompt (kemik + kimlik)');
    const models = ['gemini:gemini-flash-latest', 'gemini:gemini-flash-lite-latest'];
    assert.equal((await s.request('POST', '/api/ai/compare', { kind: 'prompt', promptKind: 'gorsel', brief: 'Latte', models })).status, 400, 'marka zorunlu');
    assert.equal((await s.request('POST', '/api/ai/compare', { kind: 'prompt', promptKind: 'yok', brief: 'Latte', brandId: b.id, models })).status, 400);

    const c = (await s.request('POST', '/api/ai/compare', { kind: 'prompt', promptKind: 'gorsel', brief: 'Latte', brandId: b.id, models })).data.comparison;
    assert.equal(c.kind, 'prompt:gorsel');
    assert.equal(c.kindLabel, 'Prompt · Görsel');
    const sent = g.calls.slice(-2);
    assert.equal(sent[0].text, sent[1].text, 'iki modele aynı istem gider');
    assert.match(sent[0].text, /MARKA PROMPT KİMLİĞİ[\s\S]*Işık: warm golden hour light[\s\S]*KEMİK/);
    const [good, weak] = c.results;
    assert.equal(good.text, GOOD);
    assert.equal(good.quality.ok, true, JSON.stringify(good.quality.missing));
    assert.equal(good.quality.score, 100);
    assert.equal(weak.quality.ok, false);
    assert.ok(weak.quality.score < good.quality.score);
    assert.ok(weak.quality.missing.some(m => /Örnek Kafe/.test(m)), 'marka adı denetlenir');
    assert.equal((await s.request('GET', '/api/ai/comparisons')).data.comparisons[0].results[0].quality.score, 100);

    // Kazanan Prompt Studio'ya Türkçe prompt olarak kaydedilir
    const saved = (await s.request('POST', `/api/brands/${b.id}/prompts`, { manual: true, kind: 'gorsel', title: good.title, text: good.text, lang: 'tr', brief: 'Latte' })).data.prompt;
    assert.equal(saved.lang, 'tr');
    assert.equal(saved.brief, 'Latte');
    assert.equal(saved.quality.score, 100);
  } finally { await s.stop(); }
});
