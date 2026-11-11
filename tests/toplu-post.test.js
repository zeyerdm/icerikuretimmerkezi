// Toplu testler: T.3 post stüdyosu türleri, T.13 ortak şablonlar (sunucu tarafı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, PNG_1PX } from './helpers.js';

const png = { 'Content-Type': 'image/png' };
const brand = async (s, name, colors, fonts) => (await s.request('POST', '/api/brands', { name, colors, fonts })).data.brand;
const blank = async (s, brandId, body) => {
  const r = await s.request('POST', `/api/brands/${brandId}/posts`, Object.assign({ blank: true }, body));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.post;
};

test('T.3 post türleri: varsayılan boyutlar, grafik maddeleri, takvimde doğru içerik türü', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Tür', { primary: '#1d4ed8' });
    const expected = { carousel: ['4:5', 'carousel'], post: ['4:5', 'post'], story: ['9:16', 'story'], kapak: ['9:16', 'reels'], reklam: ['4:5', 'reklam'], grafik: ['4:5', 'grafik'] };
    for (const [kind, [format, contentType]] of Object.entries(expected)) {
      const p = await blank(s, a.id, { kind, title: `Boş ${kind}` });
      assert.equal(p.kind, kind);
      assert.equal(p.data.format, format, `${kind} varsayılan boyutu`);
      const content = (await s.request('POST', `/api/brands/${a.id}/posts/${p.id}/schedule`, { scheduledAt: null })).data.content;
      assert.equal(content.type, contentType, `${kind} takvimde ${contentType} olmalı`);
      assert.equal(content.postId, p.id);
      assert.equal(content.status, 'hazirlaniyor');
    }
    const g = await blank(s, a.id, { kind: 'grafik', title: 'Bilgi' });
    const texts = g.data.slides[0].layers.filter(l => l.type === 'text').map(l => l.text).join('\n');
    assert.match(texts, /Birinci madde/);
    // Boyut elle seçilebilir; geçersiz tür ve boyut reddedilir
    assert.equal((await blank(s, a.id, { kind: 'story', format: '1:1', title: 'Kare story' })).data.format, '1:1');
    assert.equal((await s.request('POST', `/api/brands/${a.id}/posts`, { blank: true, kind: 'afis' })).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${a.id}/posts`, { blank: true, kind: 'post', format: '2:3' })).status, 400);
  } finally { await s.stop(); }
});

test('T.3 katmanlar: zemin görseli doğrulaması, saydamlık, daire, şablon kaydet/başlat/sil', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Katman A', { primary: '#c2410c' });
    const b = await brand(s, 'Katman B');
    const own = (await s.request('POST', `/api/brands/${a.id}/assets?category=brand_image`, PNG_1PX, png)).data.asset;
    const foreign = (await s.request('POST', `/api/brands/${b.id}/assets?category=brand_image`, PNG_1PX, png)).data.asset;
    const p = await blank(s, a.id, { kind: 'post', title: 'Katmanlı' });
    const put = data => s.request('PUT', `/api/brands/${a.id}/posts/${p.id}`, { data });
    const slide = extra => ({ format: '1:1', slides: [Object.assign({ bg: '#ffffff', layers: [] }, extra)] });

    assert.equal((await put(slide({ bgImage: { src: foreign.url } }))).status, 400, 'başka markanın zemin görseli reddedilir');
    assert.equal((await put(slide({ bgImage: { src: 'https://disarisi.com/x.png' } }))).status, 400);
    const ok = (await put(slide({ bgImage: { src: own.url, fit: 'garip', dim: 150 }, layers: [
      { type: 'shape', shape: 'circle', x: 10, y: 10, w: 200, h: 200, color: '#00ff00', opacity: 40 },
      { type: 'shape', shape: 'yildiz', x: 0, y: 0, w: 5, h: 5, opacity: 100 },
      { type: 'text', text: 'Merhaba', weight: 333, align: 'justify', color: 'mavi' }
    ] }))).data.post.data.slides[0];
    assert.deepEqual(ok.bgImage, { src: own.url, fit: 'cover', dim: 80 });
    assert.equal(ok.layers[0].shape, 'circle');
    assert.equal(ok.layers[0].opacity, 40);
    assert.equal(ok.layers[1].shape, 'rect');
    assert.equal('opacity' in ok.layers[1], false, 'tam opaklık saklanmaz');
    assert.deepEqual([ok.layers[2].weight, ok.layers[2].align, ok.layers[2].color], [700, 'left', '#1b1f3b']);
    assert.equal((await put({ slides: [] })).status, 400);
    assert.equal((await put({ slides: Array.from({ length: 11 }, () => ({ layers: [] })) })).status, 400);

    // Şablon: kaydet → şablondan başlat (metin/açıklama temiz) → sil
    await s.request('PUT', `/api/brands/${a.id}/posts/${p.id}`, { data: Object.assign(slide({ layers: [{ type: 'text', text: 'Şablon başlığı' }] }), { caption: 'Eski açıklama', hashtags: ['#eski'] }) });
    const tpl = (await s.request('POST', `/api/brands/${a.id}/posts/${p.id}/template`, { name: 'Duyuru şablonu' })).data.template;
    assert.equal(tpl.name, 'Duyuru şablonu');
    const fromTpl = await blank(s, a.id, { templateId: tpl.id, title: 'Şablondan' });
    assert.equal(fromTpl.title, 'Şablondan');
    assert.equal(fromTpl.data.slides[0].layers[0].text, 'Şablon başlığı');
    assert.equal(fromTpl.data.caption, '');
    assert.deepEqual(fromTpl.data.hashtags, []);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, templateId: tpl.id })).status, 404, 'başka marka şablonu kullanamaz');
    assert.equal((await s.request('DELETE', `/api/brands/${b.id}/post-templates/${tpl.id}`)).status, 404);
    assert.equal((await s.request('DELETE', `/api/brands/${a.id}/post-templates/${tpl.id}`)).status, 204);
    assert.deepEqual((await s.request('GET', `/api/brands/${a.id}/post-templates`)).data.templates, []);
  } finally { await s.stop(); }
});

test('T.13 ortak şablonlar: roller hedef markaya çevrilir, dosyalar taşınmaz, yedek renk, okunurluk, kullan/sil', async () => {
  const s = await startServer();
  try {
    const src = await brand(s, 'Kaynak', { primary: '#c2410c', secondary: ['#fde68a'], backgrounds: ['#fff7ed'] }, { heading: 'Poppins', body: 'Inter' });
    const dst = await brand(s, 'Hedef', { primary: '#1d4ed8', backgrounds: [] }, { heading: 'Montserrat', body: 'Nunito' });
    const logo = (await s.request('POST', `/api/brands/${src.id}/assets?category=logo`, PNG_1PX, png)).data.asset;
    const photo = (await s.request('POST', `/api/brands/${src.id}/assets?category=brand_image`, PNG_1PX, png)).data.asset;
    const dstLogo = (await s.request('POST', `/api/brands/${dst.id}/assets?category=logo`, PNG_1PX, png)).data.asset;
    const p = await blank(s, src.id, { kind: 'post', title: 'Kaynak tasarım' });
    await s.request('PUT', `/api/brands/${src.id}/posts/${p.id}`, { data: { format: '1:1', slides: [{ bg: '#c2410c', layers: [
      { type: 'text', role: 'title', text: 'Başlık', font: 'Poppins', color: '#ffffff', x: 100, y: 100, w: 800, size: 80 },
      { type: 'shape', shape: 'rect', x: 0, y: 900, w: 1080, h: 180, color: '#fde68a' },
      { type: 'text', role: 'body', text: 'Gövde', font: 'Inter', color: '#1b1f3b', x: 100, y: 950, w: 800, size: 40 },
      { type: 'image', src: logo.url, assetId: logo.id, x: 900, y: 40, w: 120, h: 120 },
      { type: 'image', src: photo.url, assetId: photo.id, x: 100, y: 300, w: 400, h: 400 }
    ] }] } });

    const tpl = (await s.request('POST', `/api/brands/${src.id}/posts/${p.id}/share-template`, { name: 'Ortak duyuru' })).data.template;
    assert.ok(tpl.id);
    // Kaydederken yanıt kaynak markayla önizlenir; hedef markanın listesinde kaynak markanın dosyası görünmez
    const listed = (await s.request('GET', `/api/brands/${dst.id}/shared-templates`)).data.templates;
    assert.equal(listed.length, 1);
    assert.doesNotMatch(JSON.stringify(listed[0].data), new RegExp(`${logo.id}|${photo.id}|/api/brands/${src.id}/`), 'kaynak markanın dosyası taşınmaz');

    const usedRef = (await s.request('POST', `/api/brands/${dst.id}/shared-templates/${tpl.id}/use`, { title: 'Hedefte' })).data.post;
    assert.equal(usedRef.title, 'Hedefte');
    const used = (await s.request('GET', `/api/brands/${dst.id}/posts/${usedRef.id}`)).data.post;
    const sl = used.data.slides[0];
    assert.equal(sl.bg, '#1d4ed8', 'ana renk rolü hedefin ana rengine çevrilir');
    const title = sl.layers.find(l => l.text === 'Başlık');
    assert.equal(title.font, 'Montserrat');
    assert.equal(title.color, '#ffffff', 'koyu mavi zeminde beyaz yazı okunur kalır');
    const bar = sl.layers.find(l => l.type === 'shape' && l.y === 900);
    assert.equal(bar.color, '#1d4ed8', 'ikincil rengi olmayan markada ana renge düşer');
    const body = sl.layers.find(l => l.text === 'Gövde');
    assert.equal(body.font, 'Nunito');
    assert.equal(body.color, '#ffffff', 'koyu zemine düşen koyu yazı okunur renge çekilir');
    const img = sl.layers.filter(l => l.type === 'image');
    assert.deepEqual(img.map(l => l.assetId), [dstLogo.id], 'logo hedefin logosu olur');
    assert.ok(sl.layers.some(l => l.text === 'Görsel alanı'), 'karşılığı olmayan görsel "Görsel alanı" kutusuna döner');
    assert.ok(JSON.stringify(used).indexOf(src.id) === -1, 'kaynak markaya ait hiçbir dosya yolu kalmaz');

    // Liste hedef markayla önizlenir; silme
    assert.equal((await s.request('GET', `/api/brands/${dst.id}/shared-templates`)).data.templates.length, 1);
    assert.equal((await s.request('DELETE', `/api/shared-templates/${tpl.id}`)).status, 204);
    assert.equal((await s.request('POST', `/api/brands/${dst.id}/shared-templates/${tpl.id}/use`, {})).status, 404);
  } finally { await s.stop(); }
});
