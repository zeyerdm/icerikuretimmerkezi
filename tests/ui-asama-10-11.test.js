// Aşama 9.1, 10 ve 11 arayüz testleri: yazı koruması, karşılama sohbeti, kütüphane galerisi, içerik havuzu menüsü,
// Prompt Studio "havuzdan fikir çek", post düzenleyici (tüm slaytlara uygula, kısayollar, panodan görsel), menü sırası,
// YouTube kapağı (çekim seçimi), hazır seçenek çipleri, şeffaf logo. Playwright kurulu değilse atlanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, PNG_1PX } from './helpers.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }
const skip = !chromium && 'Playwright yok';
const png = { 'Content-Type': 'image/png' };

async function open(srv, { width = 1400, height = 950 } = {}) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|status of (400|404|409)/.test(m.text())) problems.push('console: ' + m.text()); });
  return { browser, page, problems };
}

test('9.1 yazı koruması: sayfa değişip dönünce yazı yerinde; kaydedince ve yenileyince silinir; markalar karışmaz', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Bir' })).data.brand;
  const b = (await srv.request('POST', '/api/brands', { name: 'İki' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${a.id}/fikirler`);
    const title = page.locator('#quick-idea [name="title"]');
    await title.fill('Yarım kalan fikir');
    await page.getByRole('link', { name: 'Takvim', exact: true }).click();
    await page.locator('.cal-card').waitFor();
    await page.getByRole('link', { name: 'İçerik fikirleri' }).click();
    await page.locator('#quick-idea').waitFor();
    await page.waitForFunction(() => document.querySelector('#quick-idea [name="title"]').value === 'Yarım kalan fikir');
    await page.locator('.toast', { hasText: 'Yarım kalan yazın geri getirildi' }).waitFor();
    // Başka markada aynı alan boş
    await page.goto(`${srv.base}/#/m/${b.id}/fikirler`);
    await page.locator('#quick-idea').waitFor();
    assert.equal(await page.locator('#quick-idea [name="title"]').inputValue(), '');
    // Kaydedince silinir
    await page.goto(`${srv.base}/#/m/${a.id}/fikirler`);
    await page.waitForFunction(() => document.querySelector('#quick-idea [name="title"]').value === 'Yarım kalan fikir');
    await page.locator('#quick-idea [type=submit]').click();
    await page.locator('.idea-card', { hasText: 'Yarım kalan fikir' }).waitFor();
    await page.getByRole('link', { name: 'Takvim', exact: true }).click();
    await page.getByRole('link', { name: 'İçerik fikirleri' }).click();
    await page.locator('#quick-idea').waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#quick-idea [name="title"]').inputValue(), '');
    // Yenileyince silinir
    await page.locator('#quick-idea [name="title"]').fill('Yenilemede gider');
    await page.reload();
    await page.locator('#quick-idea').waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#quick-idea [name="title"]').inputValue(), '');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('11.3 karşılama sohbeti arayüzü: ad → dosya at (tür tahmini) → yalnız eksik sorular (seçenekli) → bitiş', { skip }, async () => {
  const srv = await startServer();
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + '/#/marka/yeni');
    await page.locator('#ob-name input').fill('Sohbet Kafe');
    await page.locator('#ob-name [type=submit]').click();
    await page.waitForURL(/\/kur$/);
    await page.locator('#ob-send').waitFor();
    await page.locator('#ob-files').setInputFiles([{ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1PX }, { name: 'maskot-mutlu.png', mimeType: 'image/png', buffer: PNG_1PX }, { name: 'pinterest-ref.png', mimeType: 'image/png', buffer: PNG_1PX }]);
    const kinds = await page.locator('#ob-file-list select').evaluateAll(s => s.map(x => x.value));
    assert.deepEqual(kinds, ['logo', 'maskot', 'referans'], 'tür dosya adından tahmin edilir');
    await page.locator('#ob-ideas').fill('Barista ipucu Reels\nHaftanın menüsü post');
    await page.locator('#ob-send').click();
    await page.locator('.ob-bot', { hasText: 'Şunları aldım' }).waitFor();
    await page.locator('#ob-q').waitFor();
    // İlk soru: sektör (tek seçim, seçince hemen gider)
    await page.locator('.ob-bot', { hasText: 'Bu ne markası?' }).waitFor();
    await page.locator('#ob-q .chip-check', { hasText: 'Kafe / restoran' }).click();
    await page.locator('.ob-me', { hasText: 'Kafe / restoran' }).waitFor();
    // Logo ve maskot atıldı: bu sorular gelmez; geri kalanı geçerek bitişe
    const asked = [];
    for (let i = 0; i < 30; i++) {
      if (await page.locator('#ob-finish').count()) break;
      await page.locator('#ob-q').waitFor();
      asked.push(await page.locator('.ob-bot .ob-bubble b').last().innerText());
      await page.locator('#ob-q [data-skip]').click();
      await page.waitForTimeout(120);
    }
    assert.ok(!asked.some(q => /Logon var mı|maskotu var mı|maskotun görsellerini/i.test(q)), asked.join(' | ')); // 1 px saydam logodan renk çıkmaz; renk sorusu gelebilir
    await page.locator('#ob-finish').click();
    await page.locator('.ob-links').waitFor();
    assert.match(await page.locator('.ob-bot').last().innerText(), /Yapay zekâ bağlı olmadığı için/);
    const id = page.url().match(/#\/m\/([^/]+)\//)[1];
    const cats = (await srv.request('GET', `/api/brands/${id}/assets`)).data.assets.map(a => a.category).sort();
    assert.deepEqual(cats, ['logo', 'mascot', 'reference']);
    assert.equal((await srv.request('GET', `/api/brands/${id}`)).data.brand.sector, 'Kafe / restoran');
    // Yarıda bırakılan sohbet kaldığı yerden: bitmiş kurulum bunu söyler
    await page.reload(); // aynı adres: yeniden yükleyip açılış durumunu sına
    await page.locator('.ob-bot', { hasText: 'kurulumu tamamlanmış' }).waitFor();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('10.2 kütüphane: beş bölüm, sade kartlar, bölüme yükleme, Ayrıntı penceresinde ad; 11.7 logo arkasına renk konmaz', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Kütüp' })).data.brand;
  await srv.request('POST', `/api/brands/${b.id}/assets?category=logo&label=Ana`, PNG_1PX, png);
  await srv.request('POST', `/api/brands/${b.id}/assets?category=inspiration`, PNG_1PX, png);
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/kutuphane`);
    await page.locator('.lib-item').first().waitFor();
    assert.deepEqual((await page.locator('.lib-tabs button').allInnerTexts()).map(t => t.replace(/\s*\d+$/, '')), ['Logolar', 'Maskot', 'Tasarımlarım', 'Marka görselleri', 'Referanslar']);
    assert.equal(await page.locator('.lib-item input').count(), 0, 'kartlarda form alanı yok');
    await page.locator('[data-group="referanslar"]').click();
    await page.locator('#insp-notes').waitFor();
    assert.equal(await page.locator('.lib-item').count(), 1, 'ilham görseli Referanslarda');
    await page.locator('[data-group="gorseller"]').click();
    await page.locator('#lib-cat').selectOption('product');
    await page.locator('#asset-file').setInputFiles({ name: 'urun.png', mimeType: 'image/png', buffer: PNG_1PX });
    await page.locator('.lib-item', { hasText: 'urun' }).waitFor();
    await page.locator('.lib-item', { hasText: 'urun' }).locator('[data-detail]').click();
    await page.locator('#ld-label').fill('Latte fotoğrafı');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.lib-item', { hasText: 'Latte fotoğrafı' }).waitFor();
    const assets = (await srv.request('GET', `/api/brands/${b.id}/assets`)).data.assets;
    assert.equal(assets.find(a => a.label === 'Latte fotoğrafı').category, 'product');
    // Kenar menüsündeki marka simgesi: logo varken arka plan saydam
    const bg = await page.locator('.ws-brand .avatar').evaluate(e => getComputedStyle(e).backgroundColor);
    assert.match(bg, /rgba\(0, 0, 0, 0\)|transparent/);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('10.4–10.5 içerik havuzu arayüzü: tür sekmeleri, ⋯ menüsü (kullanıldı, arşiv, tür), durum filtresi, toplu arşiv', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Havuz UI' })).data.brand;
  const url = `/api/brands/${b.id}/ideas`;
  const r1 = (await srv.request('POST', url, { title: 'Reels fikri', category: 'egitici', format: 'reels' })).data.idea;
  await srv.request('POST', url, { title: 'Post fikri', category: 'egitici', format: 'post' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/fikirler`);
    await page.locator('.idea-card').nth(1).waitFor();
    await page.locator('#idea-formats [data-format="reels"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.idea-card').length === 1);
    assert.equal(await page.locator('#quick-idea [name="format"]').inputValue(), 'reels', 'yeni fikir seçili türle eklenir');
    await page.locator(`[data-more="${r1.id}"]`).click();
    await page.locator(`[data-used="${r1.id}"]`).click();
    await page.locator('.idea-card .pill', { hasText: 'Kullanıldı' }).waitFor();
    await page.locator('#idea-formats [data-format=""]').click();
    await page.locator('[data-status="kullanildi"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.idea-card').length === 1);
    page.once('dialog', d => d.accept());
    await page.locator('[data-bulk="arsivle"]').click();
    await page.locator('.toast', { hasText: '1 fikir arşivlendi' }).waitFor();
    await page.locator('[data-status="arsiv"]').click();
    await page.locator('.idea-card', { hasText: 'Reels fikri' }).waitFor();
    assert.equal((await srv.request('GET', `${url}?status=arsiv`)).data.ideas.length, 1);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('10.7 Prompt Studio: havuzdan fikir çek isteği doldurur, "Başka fikir" yenisini getirir, havuz bitince söyler', { skip }, async () => {
  const { fakeProvider } = await import('./helpers.js');
  const srv = await startServer({ aiProvider: fakeProvider([{ reply: 'x' }]) });
  const b = (await srv.request('POST', '/api/brands', { name: 'Prompt UI' })).data.brand;
  await srv.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Birinci post fikri', category: 'egitici', format: 'post' });
  await srv.request('POST', `/api/brands/${b.id}/ideas`, { title: 'İkinci post fikri', category: 'egitici', format: 'post' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/prompt`);
    await page.locator('[data-pick-idea]').click();
    await page.waitForFunction(() => /post fikri/.test(document.querySelector('#ps-brief').value));
    const first = await page.locator('#ps-brief').inputValue();
    await page.locator('#ps-picked [data-pick-idea]').click();
    await page.waitForFunction(f => document.querySelector('#ps-brief').value !== f, first);
    await page.locator('#ps-picked [data-pick-idea]').click();
    await page.locator('#ps-picked', { hasText: 'kullanılmamış fikir kalmadı' }).waitFor();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('11.8–11.9 post düzenleyici: tüm slaytlara uygula, Ctrl+Z / Ctrl+Y, Ctrl+C / Ctrl+V katman, panodan görsel', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Editör' })).data.brand;
  const post = (await srv.request('POST', `/api/brands/${b.id}/posts`, { blank: true, kind: 'carousel', title: 'İki slayt' })).data.post;
  const data = post.data; data.slides.push(JSON.parse(JSON.stringify(data.slides[0])));
  await srv.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/post/${post.id}`);
    await page.locator('#stage').waitFor();
    await page.waitForTimeout(400);
    const titleLayer = data.slides[0].layers.find(l => l.role === 'title');
    // Başlık katmanını seç (katman koordinatlarından tıklama noktası)
    const box = await page.locator('#stage').boundingBox();
    const F = { w: 1080, h: 1350 };
    await page.mouse.click(box.x + (titleLayer.x + 20) / F.w * box.width, box.y + (titleLayer.y + 20) / F.h * box.height);
    await page.locator('[data-apply-all]').waitFor();
    await page.locator('#lp-size').fill('150');
    await page.locator('#lp-size').dispatchEvent('input');
    await page.locator('[data-apply-all]').click();
    await page.locator('.toast', { hasText: '1 slaytta güncellendi' }).waitFor();
    // Katman kopyala / yapıştır (yazı alanı dışında)
    await page.locator('#stage').focus();
    const before = await page.evaluate(() => document.querySelectorAll('#slide-list .slide-thumb').length);
    assert.equal(before, 2);
    await page.keyboard.press('Control+c');
    await page.locator('.toast', { hasText: 'Katman kopyalandı' }).waitFor();
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    // Panodaki görsel tasarıma eklenir (ilham rafına değil)
    await page.evaluate(b64 => { const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bytes], 'kirp.png', { type: 'image/png' })); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, PNG_1PX.toString('base64'));
    await page.locator('.toast', { hasText: 'Görsel tasarıma eklendi' }).waitFor();
    const assets = (await srv.request('GET', `/api/brands/${b.id}/assets`)).data.assets;
    assert.deepEqual(assets.map(a => a.category), ['brand_image'], 'ilham rafına değil, marka görseline');
    // Kaydet: ikinci slaytın başlığı da 150 punto
    await page.locator('.ed-save').click();
    await page.locator('#ed-save-state', { hasText: /kayıtlı|Kaydedildi/i }).waitFor().catch(() => {});
    await page.waitForTimeout(500);
    const saved = (await srv.request('GET', `/api/brands/${b.id}/posts/${post.id}`)).data.post;
    assert.equal(saved.data.slides[1].layers.find(l => l.role === 'title').size, 150);
    // Paylaş menüsünde Drive seçenekleri her zaman var
    assert.ok(await page.locator('[data-drive="one"]').count());
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('10.3b menü sırası; 10.9 YouTube kapağı çekim seçimi (en çok 3); 11.6 hazır seçenek çipleri alana ekler', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Menü' })).data.brand;
  for (let i = 0; i < 4; i++) await srv.request('POST', `/api/brands/${b.id}/assets?category=brand_image&label=Kare${i}&pack=${encodeURIComponent('YouTube çekimleri')}`, PNG_1PX, png);
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/youtube`);
    await page.locator('[data-pick-shot]').first().waitFor();
    const labels = await page.locator('.sidebar [data-nav-group="uretim"] ~ * a, .sidebar a').allInnerTexts();
    const order = ['Takvim', 'İçerik fikirleri', 'Post stüdyosu', 'Prompt Studio', 'Reels', 'YouTube kapağı', 'Video ve altyazı', 'Kampanya kanvası', 'Arşiv'];
    const idx = order.map(o => labels.findIndex(l => l.trim() === o));
    assert.ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), `menü sırası: ${labels.join(', ')}`);
    const boxes = page.locator('[data-pick-shot]');
    for (let i = 0; i < 4; i++) await boxes.nth(i).check({ force: true }).catch(() => {});
    await page.locator('.toast', { hasText: 'En çok 3' }).waitFor();
    assert.equal(await page.locator('[data-pick-shot]:checked').count(), 3);
    assert.match(await page.locator('#yt-shot-n').innerText(), /3\/3/);
    // Hazır seçenek çipi: Profil'de sektöre eklenir
    await page.goto(`${srv.base}/#/m/${b.id}/kimlik/profil`);
    await page.locator('[data-suggest-for="f-sector"] [data-suggest="Kafe / restoran"]').click();
    assert.equal(await page.locator('#f-sector').inputValue(), 'Kafe / restoran');
    await page.locator('#dirty-note', { hasText: 'Kaydedilmemiş' }).waitFor();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('Markayı sil: Markalar kartından, ad yazılarak; yanlış ad silmez; ana sayfa ve kurulumda da düğme var', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Silinecek' })).data.brand;
  const b = (await srv.request('POST', '/api/brands', { name: 'Kalacak' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}`);
    await page.locator('[data-del-brand]').waitFor();
    await page.goto(`${srv.base}/#/m/${b.id}/kur`);
    await page.locator('[data-del-brand]', { hasText: 'Vazgeç, markayı sil' }).waitFor();
    await page.goto(`${srv.base}/#/markalar`);
    await page.locator(`[data-del-brand="${a.id}"]`).waitFor();
    page.once('dialog', d => d.accept('yanlış'));
    await page.locator(`[data-del-brand="${a.id}"]`).click();
    await page.locator('.toast', { hasText: 'Ad eşleşmedi' }).waitFor();
    assert.equal((await srv.request('GET', '/api/brands')).data.brands.length, 2);
    assert.match(page.url(), /#\/markalar$/, 'karttaki sil düğmesi markayı açmaz');
    page.once('dialog', d => d.accept('silinecek'));
    await page.locator(`[data-del-brand="${a.id}"]`).click();
    await page.locator('.toast', { hasText: 'Silinecek silindi' }).waitFor();
    await page.waitForFunction(id => !document.querySelector(`[data-del-brand="${id}"]`), a.id);
    assert.deepEqual((await srv.request('GET', '/api/brands')).data.brands.map(x => x.name), ['Kalacak']);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});
