// 5.21 YouTube kapak stüdyosu: kapak türü ve yerleşimi, kapak fikirleri, YouTube bağlantısının yalnız Gemini'ye gitmesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';
import { layoutSlides } from '../server/services/posts.js';

test('YouTube kapağı türü: 1280×720, takvimde YouTube videosu, yazı görsel alanına taşmaz', async () => {
  const brand = { colors: { primary: '#c2410c' }, fonts: { heading: 'Poppins', body: 'Inter' } };
  for (const title of ['KISA', '3 MALZEME YETER Mİ?', 'Çokuzunbirkelimeyleyazılmışbaşlık burada']) {
    const [s] = layoutSlides({ texts: [{ title, body: '' }], brand, format: '16:9', kind: 'youtube' });
    const t = s.layers.find(l => l.role === 'title');
    const area = s.layers.find(l => l.type === 'shape' || l.type === 'image');
    assert.ok(t.x + t.w <= area.x, `${title}: yazı kutusu görsel alanına taşmamalı`);
    const longest = Math.max(...title.split(' ').map(w => w.length));
    assert.ok(longest * t.size * 0.7 <= t.w + 1, `${title}: en uzun kelime tek satıra sığmalı`);
    assert.equal(t.weight, 900);
  }
  const withMascot = layoutSlides({ texts: [{ title: 'Kapak' }], brand, format: '16:9', kind: 'youtube', mascotUrl: '/api/brands/b/assets/m/file', mascotId: 'm' })[0];
  assert.ok(withMascot.layers.some(l => l.type === 'image' && l.assetId === 'm'));
  assert.ok(!withMascot.layers.some(l => l.role === 'label'), 'maskot varken yer tutucu yok');

  const s = await startServer();
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kanal' })).data.brand;
    const meta = (await s.request('GET', '/api/meta')).data;
    assert.equal(meta.posts.kinds.youtube, 'YouTube kapağı');
    assert.deepEqual(meta.posts.formats['16:9'], { w: 1280, h: 720, label: 'YouTube 16:9' });
    assert.equal(meta.contentTypes.youtube, 'YouTube videosu');
    const p = (await s.request('POST', `/api/brands/${a.id}/posts`, { blank: true, kind: 'youtube', title: 'Kapak' })).data.post;
    assert.equal(p.data.format, '16:9');
    const c = (await s.request('POST', `/api/brands/${a.id}/posts/${p.id}/schedule`, {})).data.content;
    assert.equal(c.type, 'youtube');
    assert.deepEqual(c.checklist.map(i => i.label), ['Senaryo', 'Çekim', 'Kurgu', 'Kapak', 'Başlık ve açıklama']);
  } finally { await s.stop(); }
});

test('kapak fikirleri: doğrulama, 4 kelime sınırı, eksik fikirlerin atılması, istemde marka ve konu', async () => {
  const provider = fakeProvider([{ summary: '', ideas: [
    { name: 'Uzun', text: 'BU KAPAK YAZISI ÇOK UZUN OLDU', promise: 'p', emotion: 'şaşkın', composition: 'c', imagePrompt: 'Surprised face, 16:9', colors: ['#E11D48', 'kırmızı', '#fff', '#000000', '#111111'] },
    { name: 'Tarifsiz', text: 'YAZI', imagePrompt: '' },
    { name: '', text: 'İKİ KELİME', imagePrompt: 'Latte close-up' }
  ] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kahve Kanalı' })).data.brand;
    const url = `/api/brands/${a.id}/youtube/ideas`;
    assert.equal((await s.request('POST', url, {})).status, 400, 'konu, başlık ya da bağlantı gerekli');
    assert.equal((await s.request('POST', url, { url: 'https://vimeo.com/123' })).status, 400);
    const r = await s.request('POST', url, { title: 'Evde latte', topic: 'Üç malzemeyle latte', count: 99 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.ideas.length, 2, 'görsel tarifi olmayan fikir atılır');
    assert.equal(r.data.ideas[0].text, 'BU KAPAK YAZISI ÇOK', 'en çok 4 kelime');
    assert.deepEqual(r.data.ideas[0].colors, ['#e11d48', '#000000', '#111111']);
    assert.equal(r.data.ideas[1].name, 'Kapak fikri');
    const prompt = provider.calls.at(-1).prompt;
    assert.match(prompt, /YOUTUBE KAPAK FİKİRLERİ/);
    assert.match(prompt, /Kahve Kanalı/);
    assert.match(prompt, /VİDEO BAŞLIĞI: Evde latte/);
    assert.match(prompt, /6 kapak fikri/, 'fikir sayısı 2–6 aralığına sıkıştırılır');
    // Bağlantı Gemini dışındaki modele gönderilmez
    const link = await s.request('POST', url, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert.equal(link.status, 400);
    assert.match(link.data.error.message, /Gemini/);
  } finally { await s.stop(); }
});

test('kapak fikirleri: YouTube bağlantısı Gemini\'ye video girdisi (file_data) olarak gider', async () => {
  const KEY = 'AIzaTEST0123456789abcdefghijklmnop';
  const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const out = JSON.stringify({ summary: 'Evde latte yapımı', ideas: [{ name: 'A', text: 'EVDE LATTE', promise: 'p', emotion: '', composition: 'c', imagePrompt: 'latte', colors: [] }] });
  const fetchImpl = async (u, init = {}) => {
    const url = new URL(String(u));
    calls.push({ path: url.pathname, body: init.body ? JSON.parse(init.body) : null });
    if (url.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
    return json({ candidates: [{ content: { parts: [{ text: out }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
  };
  const s = await startServer({ fetchImpl });
  try {
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: KEY })).status, 200);
    const a = (await s.request('POST', '/api/brands', { name: 'Video' })).data.brand;
    const link = 'https://youtu.be/dQw4w9WgXcQ';
    const r = await s.request('POST', `/api/brands/${a.id}/youtube/ideas`, { url: link });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.summary, 'Evde latte yapımı');
    const body = calls.filter(c => c.path.endsWith(':generateContent')).at(-1).body;
    assert.deepEqual(body.contents[0].parts[0], { file_data: { file_uri: link } });
    assert.match(body.contents[0].parts.at(-1).text, /Ekteki YouTube videosunu izle/);
  } finally { await s.stop(); }
});

test('YouTube kapağı: markanın maskotu görsel alanına yerleşir', async () => {
  const s = await startServer();
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Izgara' })).data.brand;
    await s.request('POST', `/api/brands/${a.id}/assets?category=mascot`, PNG_1PX, { 'Content-Type': 'image/png' });
    const p = (await s.request('POST', `/api/brands/${a.id}/posts`, { blank: true, kind: 'youtube', title: 'Maskotlu kapak' })).data.post;
    assert.ok(p.data.slides[0].layers.some(l => l.type === 'image'), 'maskot görsel alanına yerleşir');
    assert.equal(p.kind, 'youtube');
  } finally { await s.stop(); }
});
