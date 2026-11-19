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
    assert.deepEqual(p.data.template, { id: tpl.id, name: 'Haftalık tema', version: 1 });
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
    // Yazı en fazla %30 küçülür (okunurluk sınırı); yine sığmazsa Kontrol paneli taşma uyarısı verir
    assert.ok(h.size < 90 && (h.h <= l.maxH || h.size >= Math.floor(l.size * 0.7)), `yazı küçüldü (${h.size}px, ${Math.round(h.h)}px)`);
    const tpl = (await s.request('POST', `/api/brands/${b.id}/posts/${post.id}/template`, { name: 'Benim temam' })).data.template;

    await page.goto(`${s.base}/#/m/${b.id}/post`);
    await page.locator('.tpl-card [title*="Dolan alanlar: Ana başlık"]').waitFor();
    await page.locator('#qp-tpl').selectOption(tpl.id);
    await page.locator('#quick-post [name="slides"]').selectOption('4');
    await page.locator('#quick-post [name="topic"]').fill('Kahve demleme');
    await page.locator('#quick-post [type=submit]').click();
    await page.locator('.pv-card').nth(3).waitFor(); // üretim sonrası önizleme: 4 sayfa
    await page.getByRole('button', { name: 'Bütün tasarımı düzenle' }).click();
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

test('Kısayollar: referans silinir; fikirlerde Ctrl+A seç, Delete sil, Ctrl+Z geri al; düzenleyicide Ctrl+A ile tüm katmanlar kopyalanır/kesilir', { skip: !chromium && 'Playwright yok' }, async () => {
  const s = await startServer({ aiProvider: fakeProvider([{}]) });
  const b = (await s.request('POST', '/api/brands', { name: 'Kısayol' })).data.brand;
  const ref = await upload(s, b.id, 'reference', 'Eski referans');
  for (const t of ['Bir', 'İki', 'Üç']) await s.request('POST', `/api/brands/${b.id}/ideas`, { title: `Fikir ${t}`, category: 'egitici', format: 'post' });
  const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'K', kind: 'post' })).data.post;
  const T = (text, y) => ({ type: 'text', role: 'text', text, x: 100, y, w: 600, size: 60, color: '#111111', font: 'Inter', weight: 700, align: 'left' });
  await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#ffffff', layers: [T('A', 200), T('B', 500)] }, { bg: '#eeeeee', layers: [] }] } });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('dialog', d => d.accept());
  try {
    // Referans silme
    await page.goto(`${s.base}/#/m/${b.id}/post`);
    await page.locator('.menu-dd > summary').first().click(); // Diğer menüsü
    await page.locator('[data-ref]').first().click();
    await page.locator(`[data-ref-del="${ref.id}"]`).click();
    await page.waitForFunction(() => !document.querySelector('[data-ref-pick]'));
    assert.equal((await s.request('GET', `/api/brands/${b.id}/assets?category=reference`)).data.assets.length, 0);
    await page.keyboard.press('Escape');

    // Fikirler: Ctrl+A, Delete, Ctrl+Z
    await page.goto(`${s.base}/#/m/${b.id}/fikirler`);
    await page.locator('.idea-card').nth(2).waitFor();
    await page.locator('h1, .page-head').first().click();
    await page.keyboard.press('Control+a');
    await page.locator('#idea-selbar', { hasText: '3 fikir seçili' }).waitFor();
    await page.keyboard.press('Delete');
    await page.waitForFunction(() => !document.querySelector('.idea-card'));
    assert.equal((await s.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas.length, 0);
    await page.locator('h1, .page-head').first().click();
    await page.keyboard.press('Control+z');
    await page.locator('.toast', { hasText: '3 kayıt geri alındı' }).waitFor();
    await page.locator('.idea-card').nth(2).waitFor();
    assert.equal((await s.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas.length, 3);
    // Tek seçim: kutucuk
    await page.locator('.idea-sel').first().check();
    await page.locator('#idea-selbar', { hasText: '1 fikir seçili' }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#idea-selbar').hidden);

    // Düzenleyici: Ctrl+A, Ctrl+C, 2. slayta Ctrl+V; Ctrl+A + Ctrl+X boşaltır
    await page.goto(`${s.base}/#/m/${b.id}/post/${post.id}`);
    await page.locator('#stage').waitFor();
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');
    await page.locator('.toast', { hasText: '2 katman seçildi' }).waitFor();
    await page.keyboard.press('Control+c');
    await page.locator('.slide-thumb').nth(1).click();
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Control+s').catch(() => {});
    await page.locator('.ed-save').click();
    await page.locator('.toast', { hasText: 'kaydedildi' }).waitFor();
    let saved = (await s.request('GET', `/api/brands/${b.id}/posts/${post.id}`)).data.post;
    assert.deepEqual(saved.data.slides[1].layers.map(l => l.text), ['A', 'B'], 'iki katman ikinci slayta yapıştı');
    await page.locator('.slide-thumb').nth(0).click();
    await page.locator('#stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+x');
    await page.locator('.ed-save').click();
    await page.locator('.toast', { hasText: 'kaydedildi' }).last().waitFor();
    saved = (await s.request('GET', `/api/brands/${b.id}/posts/${post.id}`)).data.post;
    assert.equal(saved.data.slides[0].layers.length, 0, 'Ctrl+X hepsini kesti');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});

test('Toplu referans: görseller birlikte incelenir, kapak + içerik + kapanış carousel şablonu çıkar (maskot yeri, balon, kutu yüksekliği); şablon yeniden adlandırılır', async () => {
  const blocks = extra => [{ type: 'image', role: 'logo', x: 0.06, y: 0.05, w: 0.25, h: 0.07 }, { type: 'text', role: 'title', text: '*Vurgu* başlık', x: 0.06, y: 0.15, w: 0.88, h: 0.3, size: 0.1, weight: 900, color: '#ffffff', highlight: '#ff6b00' }, ...extra];
  const provider = fakeProvider([{ summary: 'Koyu zemin', mood: 'enerjik', format: '4:5', palette: [{ hex: '#ff6b00', role: 'vurgu' }], fonts: { heading: 'Poppins', body: 'Inter' }, slides: [
    { part: 'kapanis', background: '#0b1020', blocks: blocks([]) },
    { part: 'kapak', background: '#0b1020', blocks: blocks([{ type: 'shape', role: 'bubble', shape: 'rect', x: 0.2, y: 0.66, w: 0.38, h: 0.07, color: '#ffffff', radius: 0.03 }, { type: 'text', role: 'speech', text: 'Kaydır', x: 0.23, y: 0.68, w: 0.33, h: 0.04, size: 0.03, color: '#0b132b' }, { type: 'image', role: 'mascot', x: 0.6, y: 0.62, w: 0.4, h: 0.38 }]) },
    { part: 'icerik', background: '#0b1020', blocks: blocks([{ type: 'text', role: 'num', text: '02', x: 0.06, y: 0.1, w: 0.08, size: 0.03 }, { type: 'image', role: 'mascot', x: 0.6, y: 0.62, w: 0.4, h: 0.38 }]) }
  ] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Toplu' })).data.brand;
    const logo = await upload(s, b.id, 'logo', 'logo');
    const m1 = await upload(s, b.id, 'mascot', 'mutlu');
    const m2 = await upload(s, b.id, 'mascot', 'rahat');
    const refs = [await upload(s, b.id, 'reference', 'r1'), await upload(s, b.id, 'reference', 'r2'), await upload(s, b.id, 'reference', 'r3')];
    const r = await s.request('POST', `/api/brands/${b.id}/design-ref`, { assetIds: refs.map(x => x.id), name: '' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(provider.calls[0].opts.images.length, 3, 'üç görsel birlikte gitti');
    assert.match(provider.calls[0].prompt, /ORTAK tasarım dilini/);
    assert.equal(r.data.template.kind, 'carousel');
    assert.equal(r.data.template.slides, 3);
    const tpl = (await s.request('GET', `/api/brands/${b.id}/post-templates`)).data.templates.find(t => t.id === r.data.template.id);
    const [cover, mid, end] = tpl.data.slides;
    assert.ok(cover.layers.some(l => l.role === 'bubble') && cover.layers.some(l => l.role === 'speech'), 'kapakta konuşma balonu (sıra düzeltildi)');
    assert.ok(mid.layers.some(l => l.role === 'num'), 'içerik slaytı ortada');
    assert.ok(!end.layers.some(l => l.role === 'num' || l.role === 'bubble'), 'kapanış sonda');
    assert.equal(cover.layers.find(l => l.role === 'logo').src, logo.url);
    const ms = [cover, mid].map(sl => sl.layers.find(l => l.role === 'mascot').src);
    assert.ok(ms.every(u => [m1.url, m2.url].includes(u)) && ms[0] !== ms[1], 'slaytlarda farklı poz');
    const title = cover.layers.find(l => l.role === 'title');
    assert.equal(title.highlight, '#ff6b00');
    assert.equal(title.maxH, Math.round(0.3 * 1350));
    assert.deepEqual(tpl.data.reference.assetIds, refs.map(x => x.id));
    // Yeniden adlandır
    assert.equal((await s.request('PUT', `/api/brands/${b.id}/post-templates/${tpl.id}`, { name: '' })).status, 400);
    const rn = await s.request('PUT', `/api/brands/${b.id}/post-templates/${tpl.id}`, { name: 'Haftalık ipucu' });
    assert.equal(rn.data.template.name, 'Haftalık ipucu');
    assert.equal((await s.request('PUT', `/api/brands/${b.id}/post-templates/yok`, { name: 'x' })).status, 404);
  } finally { await s.stop(); }
});

test('Arayüz: referanslar çoklu seçilir ve birlikte gönderilir; şablonun adı değişir; maskot konuşma balonu eklenir', { skip: !chromium && 'Playwright yok' }, async () => {
  const provider = fakeProvider([{ format: '4:5', slides: [{ part: 'kapak', background: '#111111', blocks: [{ type: 'text', role: 'title', text: 'Başlık', x: 0.1, y: 0.1, w: 0.8, size: 0.08 }] }, { part: 'icerik', blocks: [{ type: 'text', role: 'title', text: 'B', x: 0.1, y: 0.1, w: 0.8, size: 0.05 }] }, { part: 'kapanis', blocks: [{ type: 'text', role: 'title', text: 'Son', x: 0.1, y: 0.1, w: 0.8, size: 0.08 }] }] }]);
  const s = await startServer({ aiProvider: provider });
  const b = (await s.request('POST', '/api/brands', { name: 'Ref UI' })).data.brand;
  const r1 = await upload(s, b.id, 'reference', 'Bir');
  const r2 = await upload(s, b.id, 'reference', 'İki');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  try {
    await page.goto(`${s.base}/#/m/${b.id}/post`);
    await page.locator('.menu-dd > summary').first().click(); // Diğer menüsü
    await page.locator('[data-ref]').first().click();
    await page.locator('#ref-count', { hasText: '1 referans seçili' }).waitFor();
    const other = (await page.locator('[data-ref-pick].is-picked').getAttribute('data-ref-pick')) === r1.id ? r2.id : r1.id;
    await page.locator(`[data-ref-pick="${other}"]`).click();
    await page.locator('#ref-count', { hasText: '2 referans seçili' }).waitFor();
    await page.locator('#ref-name').fill('Koyu carousel');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.modal', { hasText: 'Kapak + içerik' }).waitFor();
    assert.equal(provider.calls[0].opts.images.length, 2);
    await page.keyboard.press('Escape');
    await page.goto(`${s.base}/#/m/${b.id}/post`);
    const card = page.locator('.post-card-wrap', { hasText: 'Koyu carousel' });
    await card.locator('[data-tpl-menu]').click();
    await card.locator('[data-rename-tpl]').click();
    await page.locator('#tpl-name').fill('Haftalık ipucu');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.tpl-card', { hasText: 'Haftalık ipucu' }).waitFor();
    assert.match(await page.locator('.tpl-card', { hasText: 'Haftalık ipucu' }).textContent(), /3 slayt/);
    // Düzenleyici: konuşma balonu
    await page.locator('.tpl-card', { hasText: 'Haftalık ipucu' }).locator('[data-use-tpl]').click();
    await page.locator('#stage').waitFor();
    if (!(await page.locator('[data-add="speech"]').isVisible())) await page.locator('[data-rail="metin"]').click();
    await page.locator('[data-add="speech"]').click();
    await page.locator('#lp-role').waitFor();
    assert.equal(await page.locator('#lp-role').inputValue(), 'speech');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
