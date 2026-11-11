// 7.4 Görsel üretiminde aynı kemik: prompt kimliği görsel istemine girer; hazır şablonlar prompt + görsel üretir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, PNG_1PX } from './helpers.js';
import { identityImageLine } from '../server/services/promptIdentity.js';

const B64 = PNG_1PX.toString('base64');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const png = { 'Content-Type': 'image/png' };

function gemini() {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash-image'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    const model = decodeURIComponent(u.pathname.split('/').pop().split(':')[0]);
    const body = JSON.parse(init.body);
    calls.push({ model, body });
    if (model.includes('image')) return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }], usageMetadata: {} });
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Maskot sahnesi', prompt: 'The mascot waves in a sunny campus garden, medium shot, golden light, 35mm f/1.8, warm palette, cozy mood, photorealistic, clean composition, no text, no logo', promptTr: 'x' }) }] } }], usageMetadata: {} });
  };
  return { impl, calls };
}

test('7.4 kimlik satırı', () => {
  assert.equal(identityImageLine({}), '');
  assert.equal(identityImageLine({ visualStyle: 'gercekci', lighting: 'altin', mood: ['samimi'], avoid: ['alkol'] }), 'Style: photorealistic photography. Lighting: warm golden hour light. Mood: warm and friendly. Avoid: alkol.');
});

test('7.4 görsel üretimi: prompt kimliği isteğe girer, istenirse kapatılır; şablon prompt yazar, kaydeder ve maskotla görsel üretir', async () => {
  const g = gemini();
  const s = await startServer({ fetchImpl: g.impl });
  try {
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' })).status, 200);
    const a = (await s.request('POST', '/api/brands', { name: 'Şablonlu' })).data.brand;
    await s.request('PUT', `/api/brands/${a.id}/prompt-identity`, { visualStyle: 'sinematik', lighting: 'dramatik' });
    const imgModel = 'gemini:gemini-2.5-flash-image';
    await s.request('POST', `/api/brands/${a.id}/images`, { prompt: 'Kafe', model: imgModel });
    assert.match(g.calls.at(-1).body.contents[0].parts[0].text, /Brand visual identity: Style: cinematic film still\. Lighting: cinematic high-contrast lighting\./);
    await s.request('POST', `/api/brands/${a.id}/images`, { prompt: 'Kafe', model: imgModel, useIdentity: false });
    assert.doesNotMatch(g.calls.at(-1).body.contents[0].parts[0].text, /Brand visual identity/);

    const list = (await s.request('GET', '/api/image-templates')).data.templates;
    assert.deepEqual(Object.keys(list), ['maskot', 'urun', 'kampanya', 'youtube']);
    assert.equal((await s.request('POST', `/api/brands/${a.id}/images/template`, { template: 'yok', answers: ['x'] })).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${a.id}/images/template`, { template: 'urun', answers: [''] })).status, 400);

    // Maskotlu sahne: kitap pozu referans, 4:5, prompt Prompt Studio'ya kaydedilir ve görsel ona bağlanır
    const pose = (await s.request('POST', `/api/brands/${a.id}/assets?category=mascot`, PNG_1PX, png)).data.asset;
    await s.request('PUT', `/api/brands/${a.id}/character-book`, { name: 'Kahveci', lookEn: 'A round coffee bean', poseAssetIds: [pose.id] });
    const r = await s.request('POST', `/api/brands/${a.id}/images/template`, { template: 'maskot', answers: ['el sallıyor', 'kampüs bahçesi'], model: imgModel });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const textCall = g.calls.filter(c => !c.model.includes('image')).at(-1);
    assert.match(textCall.body.contents[0].parts.at(-1).text, /MARKA PROMPT KİMLİĞİ[\s\S]*KEMİK[\s\S]*Markanın maskotu el sallıyor\. Mekân: kampüs bahçesi/);
    const imgCall = g.calls.at(-1);
    assert.equal(imgCall.body.generationConfig.imageConfig.aspectRatio, '4:5');
    assert.equal(imgCall.body.contents[0].parts.filter(p => p.inline_data).length, 1, 'kitap pozu referans');
    assert.match(imgCall.body.contents[0].parts[0].text, /^The mascot waves[\s\S]*mascot "Kahveci" must look exactly like this: A round coffee bean/);
    const saved = (await s.request('GET', `/api/brands/${a.id}/prompts`)).data.prompts;
    assert.ok(saved.some(p => p.id === r.data.prompt.id));
    const hist = (await s.request('GET', `/api/brands/${a.id}/images?promptId=${r.data.prompt.id}`)).data.images;
    assert.equal(hist.length, 1, 'görsel prompt\'a bağlı');
  } finally { await s.stop(); }
});
