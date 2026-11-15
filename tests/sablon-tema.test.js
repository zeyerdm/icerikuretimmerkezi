// Tema / şablonla post: tasarım bir kez hazırlanır; post üretilirken yalnızca işaretli kutular metinle dolar,
// maskot yeri yapay zekânın seçtiği poza uyan maskot görseliyle değişir, yerleşim aynen kalır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';

const png = { 'Content-Type': 'image/png' };
const upload = async (s, brandId, category, label) => (await s.request('POST', `/api/brands/${brandId}/assets?category=${category}&label=${encodeURIComponent(label)}`, PNG_1PX, png)).data.asset;

test('Tema: şablon slaytları istenen sayıya uyar, alanlar dolar, maskot poza göre seçilir, yeniden yazınca yerleşim korunur', async () => {
  const slidesOut = n => ({ title: 'Kahve rehberi', caption: 'Açıklama', hashtags: ['#kahve'], slides: Array.from({ length: n }, (_, i) => ({ title: `Başlık ${i + 1}`, body: `Gövde ${i + 1}`, speech: i === 2 ? '' : `Konuşma ${i + 1}`, pose: i === 1 ? 'düşünen' : 'mutlu' })) });
  const provider = fakeProvider([slidesOut(5), slidesOut(5)]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Tema' })).data.brand;
    const mutlu = await upload(s, b.id, 'mascot', 'mutlu');
    const dusunen = await upload(s, b.id, 'mascot', 'düşünen');
    const zemin = await upload(s, b.id, 'other', 'özel gün zemini');
    const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Tasarım', kind: 'carousel' })).data.post;
    const T = (role, text, extra = {}) => Object.assign({ type: 'text', role, text, x: 80, y: 100, w: 800, size: 80, color: '#111111', font: 'Inter', weight: 800, align: 'left' }, extra);
    const data = { format: '4:5', slides: [
      { bg: '#fafafa', layers: [{ type: 'image', src: zemin.url, assetId: zemin.id, x: 0, y: 0, w: 1080, h: 1350 }, T('title', 'Kapak başlığı', { maxH: 300 })] },
      { bg: '#ffffff', layers: [T('title', 'İçerik başlığı', { y: 200, maxH: 200 }), T('body', 'Gövde', { y: 450, size: 40 }), T('num', '01', { x: 900, y: 60, w: 100 }),
        { type: 'image', role: 'mascot', src: mutlu.url, assetId: mutlu.id, x: 640, y: 860, w: 400, h: 460 },
        { type: 'shape', shape: 'rect', role: 'bubble', x: 300, y: 800, w: 340, h: 120, color: '#ffffff', radius: 30 }, T('speech', 'Konuşma', { x: 320, y: 820, w: 300, size: 30 })] },
      { bg: '#000000', layers: [T('text', 'Takip et!', { color: '#ffffff' })] }
    ] };
    assert.equal((await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data })).status, 200);
    const tpl = (await s.request('POST', `/api/brands/${b.id}/posts/${post.id}/template`, { name: 'Haftalık tema' })).data.template;
    // Roller ve kutu yüksekliği şablonda korunur
    const tl = tpl.data.slides[1].layers;
    assert.equal(tl.find(l => l.type === 'image').role, 'mascot');
    assert.equal(tl.find(l => l.type === 'shape').role, 'bubble');
    assert.equal(tl.find(l => l.role === 'title').maxH, 200);

    const res = await s.request('POST', `/api/brands/${b.id}/posts`, { topic: 'Kahve demleme', kind: 'carousel', slides: 5, templateId: tpl.id });
    assert.equal(res.status, 201);
    const p = res.data.post;
    assert.match(provider.calls[0].prompt, /5 slaytlık/);
    assert.match(provider.calls[0].prompt, /düşünen/, 'pozlar modele verilir');
    assert.equal(p.data.slides.length, 5);
    assert.deepEqual(p.data.template, { id: tpl.id, name: 'Haftalık tema' });
    // Kapak: zemin görseli aynen, başlık dolu
    assert.equal(p.data.slides[0].layers[0].src, zemin.url);
    assert.equal(p.data.slides[0].layers.find(l => l.role === 'title').text, 'Başlık 1');
    // İçerik slaytları: aynı yerleşim, yeni metin, slayt no, maskot poza göre
    const s2 = p.data.slides[1].layers;
    assert.equal(s2.find(l => l.role === 'title').text, 'Başlık 2');
    assert.equal(s2.find(l => l.role === 'title').y, 200);
    assert.equal(s2.find(l => l.role === 'body').text, 'Gövde 2');
    assert.equal(s2.find(l => l.role === 'num').text, '02');
    const m2 = s2.find(l => l.role === 'mascot');
    assert.equal(m2.src, dusunen.url, '"düşünen" pozu seçildi');
    assert.deepEqual([m2.x, m2.y, m2.w, m2.h], [640, 860, 400, 460], 'maskot yeri ve boyutu aynı');
    assert.equal(p.data.slides[3].layers.find(l => l.role === 'mascot').src, mutlu.url);
    assert.equal(s2.find(l => l.role === 'speech').text, 'Konuşma 2');
    // Konuşma boşsa balon ve konuşma kutusu gizlenir
    assert.ok(!p.data.slides[2].layers.some(l => l.role === 'bubble' || l.role === 'speech'));
    // Kapanış slaytı: sabit yazı değişmez
    assert.equal(p.data.slides[4].layers[0].text, 'Takip et!');
    assert.equal(p.data.slides[4].bg, '#000000');

    // Yeniden yaz: yerleşim korunur (marka yerleşimine dönmez), yalnızca metinler yenilenir
    const rw = (await s.request('POST', `/api/brands/${b.id}/posts/${p.id}/rewrite`, {})).data.post;
    assert.equal(rw.data.slides.length, 5);
    assert.equal(rw.data.slides[0].layers[0].src, zemin.url);
    assert.equal(rw.data.slides[1].layers.find(l => l.role === 'title').y, 200);
    assert.equal(rw.data.slides[4].layers[0].text, 'Takip et!');
    // Düzenleyip kaydedince şablon bilgisi kaybolmaz
    const sv = (await s.request('PUT', `/api/brands/${b.id}/posts/${p.id}`, { data: rw.data })).data.post;
    assert.equal(sv.data.template.id, tpl.id);
  } finally { await s.stop(); }
});

import { createRequire } from 'node:module';
let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('Tema arayüzü: kutuya rol verilir (yükseklik otomatik), uzun yazı küçülür; şablon kartında alanlar; hızlı üretimde tasarım seçilir ve hatırlanır', { skip: !chromium && 'Playwright yok' }, async () => {
  const provider = fakeProvider([{ title: 'Kahve', caption: 'c', hashtags: [], slides: [1, 2, 3, 4].map(i => ({ title: `Başlık ${i}`, body: `Gövde ${i}` })) }]);
  const s = await startServer({ aiProvider: provider });
  const b = (await s.request('POST', '/api/brands', { name: 'Tema UI' })).data.brand;
  const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Tasarımım', kind: 'carousel' })).data.post;
  await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#ffffff', layers: [{ type: 'text', role: 'text', text: 'Yer tutucu', x: 100, y: 300, w: 800, size: 90, color: '#111111', font: 'Inter', weight: 800, align: 'left' }] }] } });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  try {
    await page.goto(`${s.base}/#/m/${b.id}/post/${post.id}`);
    const stage = page.locator('#stage');
    await stage.waitFor();
    await page.waitForTimeout(300);
    const box = await stage.boundingBox();
    const k = box.width / 1080;
    await page.mouse.click(box.x + 200 * k, box.y + 330 * k);
    await page.locator('#lp-role').waitFor();
    await page.locator('#lp-role').selectOption('title');
    await page.waitForFunction(() => Number(document.querySelector('#lp-maxh').value) >= 216);
    // Çok uzun yazı: kutu yüksekliğini aşmaz (yazı küçülür)
    await page.locator('#lp-text').fill('Bu çok uzun bir başlık denemesidir ve kutuya sığması için yazı boyutu kendiliğinden küçülmelidir yoksa taşar');
    await page.locator('.ed-save').click();
    await page.locator('.toast', { hasText: 'kaydedildi' }).waitFor();
    const saved = (await s.request('GET', `/api/brands/${b.id}/posts/${post.id}`)).data.post;
    const l = saved.data.slides[0].layers[0];
    assert.equal(l.role, 'title');
    assert.ok(l.maxH >= 216);
    const h = await page.evaluate(async ({ layer }) => {
      const m = await import('/js/postCanvas.js');
      const ctx = document.createElement('canvas').getContext('2d');
      const f = m.fitText(ctx, layer);
      ctx.font = `${f.weight} ${f.size}px "${f.font}"`;
      return { size: f.size, h: m.wrapLines(ctx, layer.text, layer.w).length * f.size * 1.2 };
    }, { layer: l });
    assert.ok(h.size < 90 && h.h <= l.maxH, `yazı küçüldü (${h.size}px, ${Math.round(h.h)}px)`);
    const tpl = (await s.request('POST', `/api/brands/${b.id}/posts/${post.id}/template`, { name: 'Benim temam' })).data.template;

    await page.goto(`${s.base}/#/m/${b.id}/post`);
    await page.locator('.tpl-card', { hasText: 'Dolan alanlar: Başlık' }).waitFor();
    await page.locator('#qp-tpl').selectOption(tpl.id);
    await page.locator('#quick-post [name="slides"]').selectOption('4');
    await page.locator('#quick-post [name="topic"]').fill('Kahve demleme');
    await page.locator('#quick-post [type=submit]').click();
    await page.locator('.slide-thumb').nth(3).waitFor();
    const posts = (await s.request('GET', `/api/brands/${b.id}/posts`)).data.posts;
    const made = posts.find(p => p.id !== post.id);
    assert.equal(made.data.template.id, tpl.id);
    assert.equal(made.data.slides.length, 4);
    assert.equal(made.data.slides[2].layers[0].text, 'Başlık 3');
    // Seçilen tasarım hatırlanır
    await page.goto(`${s.base}/#/m/${b.id}/post`);
    await page.locator('#qp-tpl').waitFor();
    assert.equal(await page.locator('#qp-tpl').inputValue(), tpl.id);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
