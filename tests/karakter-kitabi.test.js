// 7.3 Maskot karakter kitabı: kayıt/doğrulama, görsellerden taslak, görsel üretiminde ve maskot prompt'unda kullanım.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';
import { cleanBook, bookImageLine, bookBlock } from '../server/services/characterBook.js';

const png = { 'Content-Type': 'image/png' };
const B64 = PNG_1PX.toString('base64');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('7.3 temizleme ve metinler', () => {
  const b = cleanBook({ name: ' Kahveci ', lookEn: 'A round coffee bean with big eyes', colors: '#C2410C, kırmızı, #fff', speech: 'Selam kanka\n\nKahve hazır', never: ['Renk değiştirmez'], poseAssetIds: ['a1'] });
  assert.deepEqual(b, { name: 'Kahveci', lookEn: 'A round coffee bean with big eyes', colors: ['#c2410c'], speech: ['Selam kanka', 'Kahve hazır'], never: ['Renk değiştirmez'], poseAssetIds: ['a1'] });
  assert.match(bookImageLine(b), /The mascot "Kahveci" must look exactly like this: A round coffee bean[\s\S]*Never: Renk değiştirmez/);
  assert.equal(bookImageLine({ name: 'x' }), '', 'görünüş tarifi yoksa görsel istemine bir şey eklenmez');
  assert.match(bookBlock(b), /MASKOT KARAKTER KİTABI \(Kahveci\)[\s\S]*Selam kanka/);
});

test('7.3 API: kayıt, başka markanın pozu reddi, taslak görselleri modele gönderir ve kaydetmez', async () => {
  const provider = fakeProvider([{ name: 'Kahveci', lookEn: 'A small round coffee bean character with glossy eyes', proportions: 'big head', outfit: 'red scarf', colors: ['#6b3e1f'], personality: 'Neşeli', speech: ['Günaydın!'], never: ['Siyah çizilmez'] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Maskotlu' })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    assert.equal((await s.request('POST', `/api/brands/${a.id}/character-book/draft`, {})).status, 400, 'maskot pozu yokken açık hata');
    const pose = (await s.request('POST', `/api/brands/${a.id}/assets?category=mascot`, PNG_1PX, png)).data.asset;
    const foreign = (await s.request('POST', `/api/brands/${b.id}/assets?category=mascot`, PNG_1PX, png)).data.asset;
    assert.equal((await s.request('PUT', `/api/brands/${a.id}/character-book`, { poseAssetIds: [foreign.id] })).status, 400);

    const d = (await s.request('POST', `/api/brands/${a.id}/character-book/draft`, {})).data;
    assert.equal(provider.calls.at(-1).opts.images.length, 1);
    assert.match(provider.calls.at(-1).prompt, /MASKOT KARAKTER KİTABI TASLAĞI/);
    assert.equal(d.draft.lookEn, 'A small round coffee bean character with glossy eyes');
    assert.deepEqual(d.draft.poseAssetIds, [pose.id]);
    assert.deepEqual((await s.request('GET', `/api/brands/${a.id}/character-book`)).data.book, {}, 'taslak kaydedilmez');

    const saved = (await s.request('PUT', `/api/brands/${a.id}/character-book`, d.draft)).data.book;
    assert.equal(saved.name, 'Kahveci');
    assert.deepEqual((await s.request('GET', `/api/brands/${b.id}/character-book`)).data.book, {});

  } finally { await s.stop(); }
});

test('7.3 görsel üretimi: maskot referansında kitabın pozları ve sabit görünüş tarifi gider', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }] });
    calls.push(JSON.parse(init.body));
    return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }], usageMetadata: {} });
  };
  const s = await startServer({ fetchImpl });
  try {
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' })).status, 200);
    const a = (await s.request('POST', '/api/brands', { name: 'Görselli' })).data.brand;
    const p1 = (await s.request('POST', `/api/brands/${a.id}/assets?category=mascot&label=Poz1`, PNG_1PX, png)).data.asset;
    const p2 = (await s.request('POST', `/api/brands/${a.id}/assets?category=mascot&label=Poz2`, PNG_1PX, png)).data.asset;
    await s.request('POST', `/api/brands/${a.id}/assets?category=mascot&label=Poz3`, PNG_1PX, png);
    await s.request('PUT', `/api/brands/${a.id}/character-book`, { name: 'Kahveci', lookEn: 'A round coffee bean with glossy eyes and a red scarf', poseAssetIds: [p1.id, p2.id], never: ['never black'] });
    const r = await s.request('POST', `/api/brands/${a.id}/images`, { prompt: 'Maskot kampüste', useMascot: true, model: 'gemini:gemini-2.5-flash-image' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const parts = calls.at(-1).contents[0].parts;
    assert.equal(parts.filter(p => p.inline_data).length, 2, 'kitapta seçili 2 poz referans olur (3. değil)');
    assert.match(parts[0].text, /mascot "Kahveci" must look exactly like this: A round coffee bean with glossy eyes and a red scarf/);
  } finally { await s.stop(); }
});

test('7.3 Prompt Studio: maskot türünde kitap istemde, görsel türünde değil', async () => {
  const provider = fakeProvider([{ title: 'T', prompt: 'Kahveci waves, same character design, no text', promptTr: 'x' }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kitaplı' })).data.brand;
    await s.request('PUT', `/api/brands/${a.id}/character-book`, { name: 'Kahveci', lookEn: 'A round coffee bean', speech: 'Selam kanka' });
    await s.request('POST', `/api/brands/${a.id}/prompts`, { kind: 'maskot', brief: 'Maskot el sallıyor' });
    assert.match(provider.calls.at(-1).prompt, /MASKOT KARAKTER KİTABI \(Kahveci\)[\s\S]*A round coffee bean[\s\S]*Selam kanka/);
    await s.request('POST', `/api/brands/${a.id}/prompts`, { kind: 'gorsel', brief: 'Kafe' });
    assert.doesNotMatch(provider.calls.at(-1).prompt, /MASKOT KARAKTER KİTABI/);
  } finally { await s.stop(); }
});
