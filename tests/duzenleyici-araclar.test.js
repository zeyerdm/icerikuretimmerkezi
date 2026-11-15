// Post düzenleyici araçları: tutamaçla boyutlandırma, mıknatıslı hizalama, katmanlar paneli (gizle, kilitle, sırala,
// adlandır), yazı efektleri ve görsel ayarları (kayıtta korunur), hazır çıkartma/emoji/ikon paketleri, çok sayfalı PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { startServer, PNG_1PX } from './helpers.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }
const skip = !chromium && 'Playwright yok';
const png = { 'Content-Type': 'image/png' };
const T = (text, x, y, extra = {}) => Object.assign({ id: 't' + text.slice(0, 3), type: 'text', role: 'text', text, x, y, w: 400, size: 60, color: '#111111', font: 'Inter', weight: 700, align: 'left' }, extra);

test('Katman alanları kayıtta korunur ve sınırlanır; geçersizler atılır', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Alan' })).data.brand;
    const a = (await s.request('POST', `/api/brands/${b.id}/assets?category=brand_image&label=f`, PNG_1PX, png)).data.asset;
    const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'A', kind: 'post' })).data.post;
    const r = await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#ffffff', layers: [
      T('Yazı', 10, 10, { hidden: true, locked: true, name: '  Başlık katmanı  ', lineHeight: 9, letterSpacing: 4, upper: true, shadow: 20, shadowColor: '#ff0000', strokeW: 3, strokeColor: 'kırmızı', bgColor: '#ffd166', bgPad: 500, bgRadius: 12 }),
      { type: 'image', src: a.url, assetId: a.id, x: 0, y: 0, w: 300, h: 200, fit: 'cover', radius: 40, circle: true, flipX: true, brightness: 120, contrast: 300, saturate: 50, grayscale: 100, blur: 2, shadow: 10, evil: 'x' }
    ] }] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const [t, im] = r.data.post.data.slides[0].layers;
    assert.equal(t.hidden, true); assert.equal(t.locked, true); assert.equal(t.name, 'Başlık katmanı');
    assert.equal(t.lineHeight, 3, 'üst sınır'); assert.equal(t.letterSpacing, 4); assert.equal(t.upper, true);
    assert.equal(t.shadow, 20); assert.equal(t.shadowColor, '#ff0000'); assert.equal(t.strokeW, 3);
    assert.equal(t.strokeColor, undefined, 'geçersiz renk atılır');
    assert.equal(t.bgColor, '#ffd166'); assert.equal(t.bgPad, 120); assert.equal(t.bgRadius, 12);
    assert.equal(im.fit, 'cover'); assert.equal(im.radius, 40); assert.equal(im.circle, true); assert.equal(im.flipX, true);
    assert.equal(im.brightness, 120); assert.equal(im.contrast, 200); assert.equal(im.saturate, 50); assert.equal(im.grayscale, 100); assert.equal(im.blur, 2); assert.equal(im.shadow, 10);
    assert.equal(im.evil, undefined);
  } finally { await s.stop(); }
});

test('Hazır paket dosyaları: çıkartma, emoji ve ikon paketleri geçerli ve güvenli SVG içerir', () => {
  const read = n => JSON.parse(fs.readFileSync(new URL(`../public/vendor/packs/${n}.json`, import.meta.url), 'utf8'));
  const st = read('stickers'); const em = read('emoji'); const ic = read('icons');
  assert.ok(st.packs.length >= 10 && st.packs.reduce((n, p) => n + p.items.length, 0) >= 120);
  assert.ok(em.packs.length >= 8 && em.packs.reduce((n, p) => n + p.items.length, 0) >= 1000);
  assert.ok(ic.packs[0].items.length >= 4000);
  const bodies = [...st.packs.flatMap(p => p.items.map(i => i.svg)), ...em.packs.flatMap(p => p.items.map(i => i[1])), ...ic.packs[0].items.map(i => i[1])];
  for (const b of bodies) assert.ok(!/<script|javascript:|on[a-z]+=|<foreignObject|href="http/i.test(b), 'betik ya da dış bağlantı yok');
  assert.ok(st.packs.every(p => /[a-zçğıöşü]/i.test(p.name)) && st.packs.some(p => p.name === 'Kalpler'), 'Türkçe paket adları');
  assert.ok(fs.existsSync(new URL('../public/vendor/packs/LICENSES.txt', import.meta.url)));
});

test('Düzenleyici: tutamaçla boyutlandırma, mıknatıs, katmanlar paneli, efekt paneli, hazır paket ekleme, PDF', { skip }, async () => {
  const s = await startServer();
  const b = (await s.request('POST', '/api/brands', { name: 'Araç' })).data.brand;
  const a = (await s.request('POST', `/api/brands/${b.id}/assets?category=brand_image&label=f`, PNG_1PX, png)).data.asset;
  const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Araçlar', kind: 'carousel' })).data.post;
  await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [
    { bg: '#ffffff', layers: [{ id: 'img1', type: 'image', src: a.url, assetId: a.id, x: 100, y: 100, w: 200, h: 200 }, T('Arka', 600, 900)] },
    { bg: '#000000', layers: [] }
  ] } });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  const saved = async () => (await s.request('GET', `/api/brands/${b.id}/posts/${post.id}`)).data.post.data;
  const save = async () => { await page.locator('.ed-save').click(); await page.waitForFunction(() => document.querySelector('.ed-save').textContent.trim() === 'Kaydet'); };
  try {
    await page.goto(`${s.base}/#/m/${b.id}/post/${post.id}`);
    const stage = page.locator('#stage');
    await stage.waitFor();
    await page.waitForTimeout(300);
    let box = await stage.boundingBox();
    let k = box.width / 1080;
    const at = (x, y) => [box.x + x * k, box.y + y * k];
    // Görseli seç, sağ alt tutamaçtan büyüt (oran korunur). Panel açılınca tuval yeniden sığar: konum yeniden ölçülür
    await page.mouse.click(...at(200, 200));
    await page.locator('#lp-iw').waitFor();
    await page.waitForTimeout(300);
    box = await stage.boundingBox(); k = box.width / 1080;
    await page.mouse.move(...at(308, 308)); await page.mouse.down(); await page.mouse.move(...at(408, 358), { steps: 5 }); await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('#lp-iw').value) > 250);
    let l = (await page.evaluate(() => [document.querySelector('#lp-iw').value, document.querySelector('#lp-ih').value])).map(Number);
    assert.equal(l[0], l[1], 'oran korundu');
    // Mıknatıs: sayfanın ortasına yakın bırakınca tam ortalanır
    const w = l[0];
    await page.mouse.move(...at(100 + w / 2, 100 + w / 2)); await page.mouse.down(); await page.mouse.move(...at(540 + 4, 600), { steps: 8 }); await page.mouse.up();
    await save();
    let img = (await saved()).slides[0].layers.find(x => x.id === 'img1');
    assert.equal(img.x + img.w / 2, 540, 'yatayda tam ortada (mıknatıs)');
    // Katmanlar paneli: yazıyı arkaya al, gizle, kilitle, adlandır
    await page.locator('[data-rail="katmanlar"]').click();
    await page.locator('.ly-row').nth(1).waitFor();
    assert.match(await page.locator('.ly-row').first().textContent(), /Arka/, 'üstte en öndeki katman');
    await page.locator('.ly-row').first().locator('[data-ly-move="-1"]').click();
    await page.locator('.ly-row').last().locator('[data-ly-vis]').click();
    await page.locator('.ly-row').last().locator('[data-ly-lock]').click();
    page.once('dialog', d => d.accept('Alt yazı'));
    await page.locator('.ly-row').last().locator('[data-ly-pick]').dblclick();
    await page.locator('.ly-row', { hasText: 'Alt yazı' }).waitFor();
    await save();
    let sl = (await saved()).slides[0].layers;
    assert.equal(sl[0].text, 'Arka', 'arkaya alındı');
    assert.equal(sl[0].hidden, true); assert.equal(sl[0].locked, true); assert.equal(sl[0].name, 'Alt yazı');
    // Kilitli katmana tuvalde tıklanmaz
    await page.mouse.click(...at(700, 920));
    assert.equal(await page.locator('#lp-text').count(), 0, 'kilitli katman seçilmedi');
    // Görsel ayarları: daire + siyah-beyaz
    await page.locator('.ly-row', { hasText: 'Görsel' }).locator('[data-ly-pick]').click();
    await page.locator('[data-flag="circle"]').check();
    await page.locator('#lp-grayscale').fill('100');
    await page.locator('#lp-grayscale').dispatchEvent('input');
    await save();
    img = (await saved()).slides[0].layers.find(x => x.id === 'img1');
    assert.equal(img.circle, true); assert.equal(img.grayscale, 100);
    // Hazır paket: emoji ara ve ekle → kütüphaneye sticker olarak kaydedilir
    await page.locator('[data-rail="ogeler"]').click();
    await page.locator('[data-stock-kind="emoji"]').click();
    await page.locator('#ed-stock-q').fill('kalp');
    await page.waitForFunction(() => document.querySelectorAll('.ed-stock-item').length > 3 && [...document.querySelectorAll('.ed-stock-item')].every(b => /heart/.test(b.title)));
    const before = (await saved()).slides[0].layers.length;
    await page.locator('.ed-stock-item').first().click();
    let st = [];
    for (let i = 0; i < 50 && !st.length; i++) { await page.waitForTimeout(100); st = (await s.request('GET', `/api/brands/${b.id}/assets?category=sticker`)).data.assets; }
    assert.equal(st.length, 1); assert.match(st[0].pack, /^Hazır · /);
    // İkinci kez aynı öğe: kütüphanedeki kopya kullanılır
    await page.locator('.ed-stock-item').first().click();
    await page.waitForTimeout(400);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/assets?category=sticker`)).data.assets.length, 1);
    await save();
    assert.equal((await saved()).slides[0].layers.length, before + 2, 'iki kez eklendi');
    // PDF: iki sayfa
    await page.locator('[data-menu="paylas"]').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-pdf]').click()]);
    const buf = fs.readFileSync(await dl.path());
    const txt = buf.toString('latin1');
    assert.ok(txt.startsWith('%PDF-1.4'));
    assert.match(txt, /\/Type \/Pages \/Count 2 /);
    assert.equal((txt.match(/\/Subtype \/Image/g) || []).length, 2);
    assert.match(txt, /\/MediaBox \[0 0 810 1012\.5\]/);
    // xref ofsetleri nesnelere işaret eder
    const xref = Number(/startxref\n(\d+)/.exec(txt)[1]);
    const rows = txt.slice(xref).split('\n').slice(3).filter(r => / n $/.test(r));
    rows.forEach((r, i) => assert.ok(txt.startsWith(`${i + 1} 0 obj`, Number(r.slice(0, 10))), `nesne ${i + 1}`));
    assert.match(dl.suggestedFilename(), /\.pdf$/);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});

test('Düzenleyici: Shift+tık ile seçilen katmanlar birlikte taşınır', { skip }, async () => {
  const s = await startServer();
  const b = (await s.request('POST', '/api/brands', { name: 'Grup' })).data.brand;
  const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'G', kind: 'post' })).data.post;
  await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#ffffff', layers: [T('Bir', 100, 100), T('İki', 100, 400), T('Üç', 100, 800)] }] } });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  try {
    await page.goto(`${s.base}/#/m/${b.id}/post/${post.id}`);
    const stage = page.locator('#stage');
    await stage.waitFor(); await page.waitForTimeout(300);
    const box = await stage.boundingBox(); const k = box.width / 1080;
    const at = (x, y) => [box.x + x * k, box.y + y * k];
    await page.keyboard.down('Shift');
    await page.mouse.click(...at(150, 130));
    await page.mouse.click(...at(150, 430));
    await page.keyboard.up('Shift');
    const box2 = await stage.boundingBox(); const k2 = box2.width / 1080;
    const at2 = (x, y) => [box2.x + x * k2, box2.y + y * k2];
    await page.mouse.move(...at2(150, 130)); await page.mouse.down(); await page.mouse.move(...at2(350, 130), { steps: 6 }); await page.mouse.up();
    await page.locator('.ed-save').click();
    await page.waitForFunction(() => document.querySelector('.ed-save').textContent.trim() === 'Kaydet');
    const l = (await s.request('GET', `/api/brands/${b.id}/posts/${post.id}`)).data.post.data.slides[0].layers;
    assert.ok(l[0].x > 250 && l[1].x > 250, 'ikisi birlikte taşındı');
    assert.equal(l[0].x, l[1].x);
    assert.equal(l[2].x, 100, 'seçilmeyen yerinde');
  } finally { await browser.close(); await s.stop(); }
});
