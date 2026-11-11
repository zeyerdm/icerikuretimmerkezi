// Toplu testler: T.5 tasarım referansı, T.21 görsel okuma / etiketleme, T.6 etiket temizleme (sunucu tarafı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';

const png = { 'Content-Type': 'image/png' };
const upload = async (s, brandId, q = 'category=brand_image') => (await s.request('POST', `/api/brands/${brandId}/assets?${q}`, PNG_1PX, png)).data.asset;

test('T.5 tasarım referansı: görsel modele gider, oran → piksel, font eşleme, marka dosyası/görsel alanı, şablondan tasarım', async () => {
  const analysis = {
    summary: 'Sade ve enerjik', mood: 'enerjik', format: '9:16', background: '#FFF7ED', palette: [{ hex: '#ff6b35', role: 'vurgu' }],
    fonts: { heading: 'montserrat', body: 'Comic Sans' },
    blocks: [
      { type: 'text', role: 'title', text: 'Başlık buraya', x: 0.1, y: 0.1, w: 0.8, size: 0.08, weight: 800, color: '#1B1F3B' },
      { type: 'shape', shape: 'circle', x: 0.5, y: 0.5, w: 0.25, h: 0.25, color: 'turuncu' },
      { type: 'image', role: 'logo', x: 0.8, y: 0.02, w: 0.15, h: 0.08 },
      { type: 'image', role: 'photo', x: 0.1, y: 0.4, w: 0.5, h: 0.3 },
      { type: 'text', role: 'garip', text: '', x: 5, y: -3, w: 9, size: 9 }
    ],
    tips: ['Turuncu vurguyu az kullan']
  };
  const provider = fakeProvider([analysis]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Referans', fonts: { heading: 'Poppins', body: 'Inter' } })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Başka' })).data.brand;
    const ref = await upload(s, a.id, 'category=inspiration');
    const logo = await upload(s, a.id, 'category=logo');
    const foreign = await upload(s, b.id);

    assert.equal((await s.request('POST', `/api/brands/${a.id}/design-ref`, {})).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${a.id}/design-ref`, { assetId: foreign.id })).status, 404, 'başka markanın görseli kullanılamaz');
    const r = await s.request('POST', `/api/brands/${a.id}/design-ref`, { assetId: ref.id, name: 'Turuncu story' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    // Görsel modele gönderildi
    const call = provider.calls.at(-1);
    assert.equal(call.opts.images.length, 1);
    assert.equal(call.opts.images[0].mime, 'image/png');
    assert.match(call.prompt, /TASARIM REFERANSI/);
    assert.equal(r.data.template.kind, 'story', '9:16 story şablonu olur');

    const tpl = (await s.request('GET', `/api/brands/${a.id}/post-templates`)).data.templates.find(t => t.id === r.data.template.id);
    const sl = tpl.data.slides[0];
    assert.equal(tpl.data.format, '9:16');
    assert.equal(sl.bg, '#fff7ed');
    const title = sl.layers.find(l => l.role === 'title');
    // Oran → piksel (1080 × 1920)
    assert.deepEqual([title.x, title.y, title.w, title.size], [108, 192, 864, 86]);
    assert.equal(title.font, 'Montserrat', 'listedeki fonta eşlenir');
    assert.equal(title.color, '#1b1f3b');
    const circle = sl.layers.find(l => l.shape === 'circle');
    assert.equal(circle.color, '#e5e7eb', 'geçersiz renk yedeğe düşer');
    assert.deepEqual([circle.w, circle.h], [270, 480]);
    // Logo alanına markanın logosu, uygun dosyası olmayan fotoğraf alanına "Görsel alanı" kutusu
    assert.ok(sl.layers.some(l => l.type === 'image' && l.assetId === logo.id));
    assert.ok(sl.layers.some(l => l.text === 'Görsel alanı'));
    const odd = sl.layers.find(l => l.role === 'text');
    assert.equal(odd.text, 'Metin', 'boş metne yer tutucu konur');
    assert.ok(odd.x <= 1080 && odd.y >= -384 && odd.w <= 1296, 'koordinatlar sınırlanır');
    const body = sl.layers.find(l => l.role === 'text');
    assert.equal(body.font, 'Inter', 'listede olmayan font markanın fontuna düşer');

    // Şablondan tasarım başlatılır
    const post = (await s.request('POST', `/api/brands/${a.id}/posts`, { blank: true, templateId: tpl.id, title: 'Referanstan' })).data.post;
    assert.equal(post.kind, 'story');
    assert.equal(post.data.slides[0].layers.length, sl.layers.length);

    // Yerleşim çıkmazsa açık hata
    const empty = fakeProvider([{ blocks: [] }]);
    const s2 = await startServer({ aiProvider: empty });
    try {
      const c = (await s2.request('POST', '/api/brands', { name: 'Boş' })).data.brand;
      const img = await upload(s2, c.id);
      assert.equal((await s2.request('POST', `/api/brands/${c.id}/design-ref`, { assetId: img.id })).status, 400);
    } finally { await s2.stop(); }
  } finally { await s.stop(); }
});

test('T.21 görsel okuma: görsel modele gider, yazı ve etiketler kaydedilir, dolu ad korunur, başka markaya erişim yok', async () => {
  const provider = fakeProvider([{ text: '  %20 İNDİRİM\nSadece bu hafta ', tags: ['Kahve', 'kampanya', '#Turuncu', '', 'kahve'], label: 'İndirim afişi' }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Okuma' })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    const unnamed = await upload(s, a.id, 'category=brand_image&tags=kahve,sabah');
    const named = await upload(s, a.id, 'category=brand_image&label=Benim%20adım');

    const r = await s.request('POST', `/api/brands/${a.id}/assets/${unnamed.id}/analyze`, {});
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(provider.calls.at(-1).opts.images.length, 1);
    const asset = r.data.asset;
    assert.equal(asset.ocrText, '%20 İNDİRİM\nSadece bu hafta');
    assert.deepEqual(asset.tags, ['kahve', 'sabah', 'kampanya', 'turuncu'], 'mevcut etiketlerle birleşir, küçük harf, tekrarsız');
    assert.equal(asset.label, 'İndirim afişi', 'boş ada öneri yazılır');
    assert.ok(asset.analyzedAt);

    const r2 = (await s.request('POST', `/api/brands/${a.id}/assets/${named.id}/analyze`, {})).data.asset;
    assert.equal(r2.label, 'Benim adım', 'dolu ad korunur');
    assert.equal((await s.request('POST', `/api/brands/${b.id}/assets/${unnamed.id}/analyze`, {})).status, 404);

    // Okunan yazı listede kalıcı
    const listed = (await s.request('GET', `/api/brands/${a.id}/assets`)).data.assets.find(x => x.id === unnamed.id);
    assert.match(listed.ocrText, /İNDİRİM/);
  } finally { await s.stop(); }
});

test('T.21 AI bağlı değilken görsel okuma açık hata verir', async () => {
  const s = await startServer();
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'AI yok' })).data.brand;
    const img = await upload(s, a.id);
    const r = await s.request('POST', `/api/brands/${a.id}/assets/${img.id}/analyze`, {});
    assert.equal(r.status, 409);
    assert.equal((await s.request('GET', `/api/brands/${a.id}/assets`)).data.assets[0].analyzedAt, null);
  } finally { await s.stop(); }
});

test('T.6 etiket temizleme: küçük harf, # atılır, 30 karakter, tekrarsız, en çok 12', async () => {
  const s = await startServer();
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Etiket' })).data.brand;
    const tags = ['#Kahve', 'KAHVE', ' Sabah ', 'x'.repeat(40), ...Array.from({ length: 15 }, (_, i) => 'e' + i)].join(',');
    const asset = await upload(s, a.id, `category=sticker&tags=${encodeURIComponent(tags)}`);
    assert.equal(asset.tags.length, 12);
    assert.deepEqual(asset.tags.slice(0, 3), ['kahve', 'sabah', 'x'.repeat(30)]);
  } finally { await s.stop(); }
});

test('T.5 tasarım referansı: görsel Claude, OpenAI ve Gemini istek biçimlerinde modele gider', async () => {
  const KEYS = { anthropic: 'sk-ant-TEST-0123456789abcdefghijklmn', openai: 'sk-TEST-openai-0123456789abcdefghij', gemini: 'AIzaTEST0123456789abcdefghijklmnop' };
  const out = JSON.stringify({ format: '1:1', background: '#ffffff', blocks: [{ type: 'text', role: 'title', text: 'Başlık', x: 0.1, y: 0.1, w: 0.8, size: 0.08 }] });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ host: u.host, path: u.pathname, body });
    if (u.host === 'api.anthropic.com') {
      if (u.pathname === '/v1/models') return json({ data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', type: 'model', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'a', last_id: 'a' });
      return json({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: out }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    }
    if (u.host === 'api.openai.com') {
      if (u.pathname === '/v1/models') return json({ data: [{ id: 'gpt-5' }] });
      return json({ model: body.model, choices: [{ message: { content: out } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }
    if (u.host === 'generativelanguage.googleapis.com') {
      if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
      return json({ candidates: [{ content: { parts: [{ text: out }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
    }
    return json({}, 404);
  };
  const s = await startServer({ fetchImpl });
  try {
    for (const id of Object.keys(KEYS)) assert.equal((await s.request('PUT', `/api/ai/keys/${id}`, { apiKey: KEYS[id] })).status, 200);
    const a = (await s.request('POST', '/api/brands', { name: 'Çoklu' })).data.brand;
    const img = await upload(s, a.id);
    const b64 = PNG_1PX.toString('base64');
    const run = async model => {
      const r = await s.request('POST', `/api/brands/${a.id}/design-ref`, { assetId: img.id, model });
      assert.equal(r.status, 201, `${model}: ${JSON.stringify(r.data)}`);
      return calls.filter(c => !/models\/?$/.test(c.path)).at(-1).body;
    };
    const claude = await run('anthropic:claude-sonnet-5-5');
    const cc = claude.messages[0].content;
    assert.deepEqual(cc[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } });
    assert.match(cc[1].text, /TASARIM REFERANSI/);

    const gpt = await run('openai:gpt-5');
    const oc = gpt.messages.at(-1).content;
    assert.ok(oc.some(p => p.type === 'image_url' && p.image_url.url === `data:image/png;base64,${b64}`));

    const gem = await run('gemini:gemini-flash-latest');
    const gp = gem.contents[0].parts;
    assert.deepEqual(gp[0], { inline_data: { mime_type: 'image/png', data: b64 } });
    assert.match(gp.at(-1).text, /TASARIM REFERANSI/);
  } finally { await s.stop(); }
});
