// 8.18 Kısmi toplu testlerin tamamlanması (arayüz): T.10, T.17–T.21, T.23–T.26, T.28–T.31'de kalan kısımlar.
// Playwright kurulu değilse atlanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }
const skip = !chromium && 'Playwright yok';
const png = { 'Content-Type': 'image/png' };

async function open(srv, { width = 1400, height = 950, ctx = {} } = {}) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext(Object.assign({ viewport: { width, height } }, ctx))).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|status of (400|404|409)/.test(m.text())) problems.push('console: ' + m.text()); });
  return { browser, page, problems };
}

test('T.10 kalan: "AI ile doldur" yalnız boş alanları doldurur; işaret kaldırılınca hepsini', { skip }, async () => {
  const provider = fakeProvider([{ profile: { sector: 'Kafe', description: 'Kampüs yanında kahve', tone: 'Samimi' }, colors: { primary: '#c2410c', secondary: [] }, fonts: {}, notes: '' }]);
  const srv = await startServer({ aiProvider: provider });
  const b = (await srv.request('POST', '/api/brands', { name: 'Doldur', sector: 'Elle yazılan sektör' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/kimlik/profil`);
    await page.locator('[data-action="ai-fill"]').click();
    await page.locator('#af-text').fill('Doldur, kampüsün yanında öğrencilere uygun fiyatlı kahve sunan samimi bir kafedir.');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.toast', { hasText: 'alan dolduruldu' }).waitFor();
    assert.equal(await page.locator('#f-sector').inputValue(), 'Elle yazılan sektör', 'dolu alan korunur');
    assert.equal(await page.locator('#f-description').inputValue(), 'Kampüs yanında kahve');
    assert.ok(await page.locator('#f-description').evaluate(e => e.classList.contains('ai-filled')));
    await page.locator('[data-action="ai-fill"]').click();
    await page.locator('#af-text').fill('Doldur, kampüsün yanında öğrencilere uygun fiyatlı kahve sunan samimi bir kafedir.');
    await page.locator('.modal [name="onlyEmpty"]').uncheck();
    await page.locator('.modal [type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#f-sector').value === 'Kafe');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.19 kalan: paletten not, görev ve içerik kaydı açık markaya bağlı', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Paletli' })).data.brand;
  const { browser, page, problems } = await open(srv);
  const run = async q => { await page.keyboard.press('Control+k'); await page.locator('#palette-q').fill(q); await page.keyboard.press('Enter'); await page.locator('.modal').waitFor(); };
  try {
    await page.goto(`${srv.base}/#/m/${b.id}`);
    await page.locator('.radial-fab').waitFor();
    await run('not al');
    await page.locator('#n-body').fill('Paletten not');
    assert.equal(await page.locator('#n-brand').inputValue(), b.id);
    await page.locator('.modal [type=submit]').click();
    await page.locator('.modal-backdrop').waitFor({ state: 'detached' });
    await run('görev ekle');
    await page.locator('#t-title').fill('Paletten görev');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.modal-backdrop').waitFor({ state: 'detached' });
    await run('içerik planla');
    await page.locator('#c-title').fill('Paletten içerik');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.modal-backdrop').waitFor({ state: 'detached' });
    const notes = (await srv.request('GET', '/api/notes')).data.notes;
    const tasks = (await srv.request('GET', '/api/tasks')).data.tasks;
    const contents = (await srv.request('GET', `/api/contents?brandId=${b.id}`)).data.contents;
    assert.equal(notes.find(n => n.body === 'Paletten not').brandId, b.id);
    assert.equal(tasks.find(t => t.title === 'Paletten görev').brandId, b.id);
    assert.ok(contents.some(c => c.title === 'Paletten içerik'));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.25 kalan: Yönetim Merkezi özetinde onay bekleyen içerik sayısı', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Onaylı merkez' })).data.brand;
  for (const t of ['A', 'B']) await srv.request('POST', '/api/contents', { brandId: b.id, title: t, type: 'post', status: 'onay' });
  await srv.request('POST', '/api/contents', { brandId: b.id, title: 'C', type: 'post', status: 'tamamlandi' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/`);
    const sum = page.locator('#w-summary');
    await sum.waitFor();
    assert.match(await sum.innerText(), /2 içerik onay bekliyor/);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('T.24 kalan: Ayarlar sekmeleri; kısa ekranda yalnız menü kayar; 1920×1080 ve telefonda yatay taşma yok', { skip }, async () => {
  const srv = await startServer();
  await srv.request('POST', '/api/brands/demo');
  const b = (await srv.request('GET', '/api/brands')).data.brands[0];
  const { browser, page, problems } = await open(srv, { width: 1400, height: 520 });
  try {
    await page.goto(`${srv.base}/#/ayarlar`);
    for (const [label, hash] of [['Yapay zekâ', '#/ai/modeller'], ['Hata günlüğü', '#/ayarlar/hatalar'], ['Genel', '#/ayarlar']]) {
      await page.locator('.tabs [role="tab"]', { hasText: label }).click();
      await page.waitForFunction(h => location.hash === h, hash);
      await page.locator(`.tabs a[role="tab"].active[href="${hash}"]`).waitFor();
    }
    // Kısa ekran: menü kendi içinde kayar, sayfa kayınca menü yerinde kalır
    await page.goto(`${srv.base}/#/m/${b.id}`);
    await page.locator('.sidebar .nav').waitFor();
    const nav = await page.locator('.sidebar .nav').evaluate(n => ({ scrolls: n.scrollHeight > n.clientHeight, overflow: getComputedStyle(n).overflowY }));
    assert.equal(nav.overflow, 'auto');
    assert.equal(nav.scrolls, true, '520 px yükseklikte menü kendi içinde kayar');
    const top1 = await page.locator('.sidebar').evaluate(n => n.getBoundingClientRect().top);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.sidebar').evaluate(n => n.getBoundingClientRect().top), top1, 'sayfa kayınca menü yerinde');
    for (const [w, h] of [[1920, 1080], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const hash of ['#/', '#/masa', `#/m/${b.id}`, `#/m/${b.id}/fikirler`, '#/ayarlar']) {
        await page.goto(`${srv.base}/${hash}`);
        await page.waitForLoadState('networkidle');
        assert.ok(await noHScroll(page), `${w}×${h} ${hash} yatay taşma`);
      }
    }
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.28 kalan: menüden Çalışma masası haftalık açılır; telefonda kartlar alt alta ve taşma yok', { skip }, async () => {
  const srv = await startServer();
  await srv.request('POST', '/api/brands/demo');
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/`);
    await page.locator('.sidebar a[href="#/masa"]').click();
    await page.locator('#desk-cal .cal-week').waitFor();
    assert.equal(await page.locator('#desk-cal [data-mode="hafta"]').getAttribute('aria-selected'), 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.locator('#desk-tasks').waitFor();
    const boxes = await Promise.all(['#desk-tasks', '#desk-cal', '#desk-notes'].map(s => page.locator(s).boundingBox()));
    // Telefonda takvim üstte, görevler ve notlar altında; hepsi tam genişlik ve üst üste binmeden
    const sorted = boxes.slice().sort((a, z) => a.y - z.y);
    assert.ok(sorted.every((x, i) => i === 0 || x.y >= sorted[i - 1].y + sorted[i - 1].height - 1), 'alt alta');
    assert.ok(boxes.every(x => x.width >= 340), 'tam genişlik');
    assert.ok(await noHScroll(page));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.29 kalan: asistan fikir kaydedince ana sayfa yenilenir; telefonda kendiliğinden açılmaz; editörde gizli; örnek marka rehberi kapanır', { skip }, async () => {
  const provider = fakeProvider([{ reply: 'Kaydettim.', actions: [{ type: 'save_ideas', ideas: [{ title: 'Asistandan gelen fikir', description: 'x', category: 'guncel' }] }] }]);
  const srv = await startServer({ aiProvider: provider });
  await srv.request('POST', '/api/brands/demo');
  const b = (await srv.request('GET', '/api/brands')).data.brands[0];
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}`);
    await page.locator('.ai-widget.is-open #chat-input').waitFor();
    await page.locator('#chat-input').fill('Bir fikir kaydet');
    await page.locator('#composer [type=submit]').click();
    await page.locator('#idea-list', { hasText: 'Asistandan gelen fikir' }).waitFor();
    // Örnek marka rehberi kapanınca yeniden gösterilmez
    await page.locator('[data-guide-close]').click();
    await page.reload();
    await page.locator('.ai-widget').waitFor();
    assert.equal(await page.locator('.demo-guide').count(), 0);
    // Düzenleyici ekranda asistan gizli
    const p = (await srv.request('POST', `/api/brands/${b.id}/prompts`, { manual: true, kind: 'metin', title: 'P', text: 'Metin' })).data.prompt;
    await page.goto(`${srv.base}/#/m/${b.id}/prompt/${p.id}`);
    await page.locator('#pp-text').waitFor();
    assert.equal(await page.locator('.ai-widget').isVisible(), false);
    // Telefonda: ana sayfada pencere sayfanın içine gömülü (ekranı kaplamaz); diğer sayfalarda yüzen pencere kendiliğinden açılmaz
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await phone.goto(`${srv.base}/#/m/${b.id}`);
    await phone.locator('#ai-dock .ai-widget.docked').waitFor();
    assert.notEqual(await phone.locator('.ai-widget').evaluate(w => getComputedStyle(w).position), 'fixed', 'ekranı kaplayan yüzen pencere değil');
    await phone.goto(`${srv.base}/#/m/${b.id}/fikirler`);
    await phone.waitForLoadState('networkidle');
    await phone.locator('.ai-widget:not(.docked) .ai-panel').waitFor({ state: 'attached' });
    assert.equal(await phone.locator('.ai-widget .ai-panel').isVisible(), false);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.30 kalan: AI düğmesinde geçen süre ("Yazıyor… N sn") ve uzun işlerde süre rozeti', { skip }, async () => {
  const slow = { label: 'Yavaş', async generate(prompt) {
    await new Promise(r => setTimeout(r, 2600));
    if (/KARAKTER KİTABI TASLAĞI/.test(prompt)) return { name: 'Fıstık', lookEn: 'A peanut', colors: [], never: [] };
    return { title: 'P', prompt: 'Uzun süren prompt' };
  }, async test() { return { ok: true, modelCount: 1, modelAvailable: true }; } };
  const srv = await startServer({ aiProvider: slow });
  const b = (await srv.request('POST', '/api/brands', { name: 'Süreli' })).data.brand;
  await srv.request('POST', `/api/brands/${b.id}/assets?category=mascot`, PNG_1PX, png);
  await srv.request('PUT', `/api/brands/${b.id}/prompt-identity`, { hasMascot: true });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/prompt`);
    await page.locator('#ps-brief').fill('Uzun iş');
    const btn = page.locator('[data-create]');
    await btn.click();
    await page.waitForFunction(() => /Yazıyor… [1-9]\d* sn/.test(document.querySelector('[data-create]').textContent));
    await page.waitForURL(/\/prompt\/[^/]+$/);
    // busy(): 2 sn'yi geçen işte düğmede "N sn" rozeti
    await page.goto(`${srv.base}/#/m/${b.id}/kimlik/maskot`);
    await page.locator('#cb-draft').click();
    await page.locator('#cb-draft .bt-time').waitFor({ timeout: 5000 });
    assert.match(await page.locator('#cb-draft .bt-time').innerText(), /^\d+ sn$/);
    await page.locator('#cb-note', { hasText: 'taslak çıkarıldı' }).waitFor();
    assert.equal(await page.locator('.bt-time').count(), 0, 'iş bitince rozet kalkar');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

const B64 = PNG_1PX.toString('base64');
const gjson = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
function geminiImages() {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return gjson({ models: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash-image'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    const body = JSON.parse(init.body);
    calls.push(body);
    return gjson({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }], usageMetadata: {} });
  };
  return { impl, calls };
}

test('T.17 kalan: üretim geçmişinde varyasyon ve yan yana karşılaştırma', { skip }, async () => {
  const g = geminiImages();
  const srv = await startServer({ fetchImpl: g.impl });
  await srv.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' });
  const b = (await srv.request('POST', '/api/brands', { name: 'Görsel geçmiş' })).data.brand;
  const p = (await srv.request('POST', `/api/brands/${b.id}/prompts`, { manual: true, kind: 'gorsel', title: 'Latte', text: 'A latte on a wooden table' })).data.prompt;
  for (const t of ['Birinci', 'İkinci']) await srv.request('POST', `/api/brands/${b.id}/images`, { prompt: t, model: 'gemini:gemini-2.5-flash-image', promptId: p.id });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/prompt/${p.id}`);
    await page.locator('.ed-rail [data-rail="gorsel"]').click();
    const cards = page.locator('.gen-card[data-gen]');
    await cards.nth(1).waitFor();
    assert.equal(await cards.count(), 2);
    await cards.first().locator('[data-variant]').click();
    await page.locator('.toast', { hasText: 'Varyasyon üretildi' }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.gen-card[data-gen]').length === 3);
    assert.match(g.calls.at(-1).contents[0].parts[0].text, /Create a fresh variation: same subject and intent/);
    await cards.nth(0).locator('[data-cmp]').check();
    await cards.nth(1).locator('[data-cmp]').check();
    await page.locator('.cmp-bar', { hasText: '2 görsel seçildi' }).waitFor();
    await page.locator('[data-compare-open]').click();
    await page.locator('.modal .cmp-grid figure').nth(1).waitFor();
    assert.equal(await page.locator('.modal .cmp-grid figure').count(), 2);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.21 kalan: AI bağlı değilken okuma düğmeleri yok; bağlıyken toplu okuma hepsini etiketler', { skip }, async () => {
  const off = await startServer();
  const b0 = (await off.request('POST', '/api/brands', { name: 'AI yok' })).data.brand;
  await off.request('POST', `/api/brands/${b0.id}/assets?category=logo`, PNG_1PX, png);
  const t = await open(off);
  try {
    await t.page.goto(`${off.base}/#/m/${b0.id}/kutuphane`);
    await t.page.locator('.asset[data-asset-id]').waitFor();
    assert.equal(await t.page.locator('[data-ocr], [data-ocr-bulk]').count(), 0);
  } finally { await t.browser.close(); await off.stop(); }

  const provider = fakeProvider([{ text: 'KAHVE %20', tags: ['kahve', 'indirim'], label: 'Kampanya afişi' }]);
  const srv = await startServer({ aiProvider: provider });
  const b = (await srv.request('POST', '/api/brands', { name: 'AI var' })).data.brand;
  for (let i = 0; i < 2; i++) await srv.request('POST', `/api/brands/${b.id}/assets?category=logo`, PNG_1PX, png);
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/kutuphane`);
    await page.locator('[data-ocr-bulk]', { hasText: '(2)' }).click();
    await page.locator('.toast', { hasText: '2 görsel okundu ve etiketlendi' }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-ocr-bulk]'));
    const assets = (await srv.request('GET', `/api/brands/${b.id}/assets`)).data.assets;
    assert.ok(assets.every(a => a.analyzedAt && a.ocrText === 'KAHVE %20' && a.tags.includes('kahve')));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.20 kalan: görsel yapıştırma ilham rafına gider; 10 MB üstü reddedilir; İlham rafı sekmesinde liste ve silme', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'İlhamlı' })).data.brand;
  const { browser, page, problems } = await open(srv);
  const pasteFile = (bytes, size) => page.evaluate(({ bytes, size }) => {
    const data = size ? new Uint8Array(size) : new Uint8Array(bytes);
    if (size) data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dt = new DataTransfer();
    dt.items.add(new File([data], 'ekran.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { bytes: [...PNG_1PX], size });
  try {
    await page.goto(`${srv.base}/#/m/${b.id}`);
    await page.locator('.radial-fab').waitFor();
    await pasteFile(null, 11 * 1024 * 1024);
    await page.locator('.toast', { hasText: "MB'tan büyük" }).waitFor();
    assert.equal((await srv.request('GET', `/api/brands/${b.id}/assets?category=inspiration`)).data.assets.length, 0);
    await pasteFile();
    const t = page.locator('.toast', { hasText: 'Görsel ilham rafına eklendi' });
    await t.waitFor();
    await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'https://ornek.com/kampanya'); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    await page.locator('.toast', { hasText: 'Link ilham rafına eklendi' }).waitFor();
    await t.getByRole('button', { name: 'İlham rafına git' }).click();
    await page.locator('#insp-notes', { hasText: 'ornek.com/kampanya' }).waitFor();
    assert.equal(await page.locator('.asset[data-asset-id]').count(), 1, 'yapıştırılan görsel İlham rafı kategorisinde');
    await page.locator('[data-insp-del]').click();
    await page.waitForFunction(() => !document.querySelector('[data-insp-del]'));
    assert.deepEqual(problems.filter(p => !/status of 413/.test(p)), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.18 kalan: ızgara önizlemesinde Reels hücresi film rozetiyle görünür ve senaryoya gider', { skip }, async () => {
  const scene = { duration: 6, start: 'Kafe', endFrame: 'Masa', beats: [{ from: 0, to: 6, action: 'Gülümser', camera: 'Yakın', sound: '' }], line: 'Kahve hazır, sakin ol ve nefes al biraz arkadaşım', lineFrom: 0, lineTo: 6, flowScene: 'smiles', flowSceneTr: 'gülümser' };
  const provider = fakeProvider([{ title: 'Kahve molası', format: 'skec', topic: 'x', why: 'y', punchline: 'z', setting: 'Kafe', screenTitle: 'Kahve molası', titleKeyword: 'kahve', scenes: [scene], ending: { twist: 't', lastFrame: 'l' }, caption: 'c', hashtags: [], music: 'm' }]);
  const srv = await startServer({ aiProvider: provider });
  const b = (await srv.request('POST', '/api/brands', { name: 'Izgaralı' })).data.brand;
  const r = (await srv.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Kahve' })).data.reels;
  await srv.request('POST', `/api/brands/${b.id}/reels/${r.id}/schedule`, { scheduledAt: new Date(Date.now() + 864e5).toISOString() });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/post/izgara`);
    const cell = page.locator(`.ig-cell[href$="/reels/${r.id}"]`);
    await cell.waitFor();
    assert.equal(await cell.locator('.ig-badge').count(), 1, 'film rozeti');
    await cell.click();
    await page.waitForURL(new RegExp(`/reels/${r.id}$`));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.23 kalan: tasarımın bütün slaytları eklenir; EXIF\'li JPEG çıktısında meta veri kalmaz', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Dışa aktar 2' })).data.brand;
  const p = (await srv.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'İki slayt', kind: 'carousel' })).data.post;
  const slide = t => ({ bg: '#ffffff', layers: [{ type: 'text', role: 'title', text: t, x: 100, y: 100, w: 800, size: 60, color: '#000000', font: 'Inter' }] });
  await srv.request('PUT', `/api/brands/${b.id}/posts/${p.id}`, { data: { format: '1:1', slides: [slide('Bir'), slide('İki')] } });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/disa-aktar`);
    await page.getByRole('button', { name: 'Post tasarımları' }).click();
    await page.locator(`[data-post="${p.id}"]`).click();
    await page.waitForFunction(() => document.querySelectorAll('.exp-row').length === 2);
    // EXIF'li JPEG: tarayıcıda JPEG üret, SOI'den sonra APP1 "Exif" bölümü ekle
    const jpg = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 200; c.height = 200; c.getContext('2d').fillRect(0, 0, 50, 50);
      const buf = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
      const exif = new TextEncoder().encode('Exif\0\0GPS konum Kamera modeli XYZ');
      const len = exif.length + 2;
      const app1 = new Uint8Array([0xff, 0xe1, len >> 8, len & 255, ...exif]);
      return [...buf.slice(0, 2), ...app1, ...buf.slice(2)];
    });
    assert.ok(Buffer.from(jpg).includes('Exif'), 'kaynakta EXIF var');
    await page.getByRole('button', { name: 'Bilgisayardan' }).click();
    await page.locator('#exp-file').setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
    await page.waitForFunction(() => document.querySelectorAll('.exp-row [data-dl]').length === 3);
    // Çıktı indirilip baytlarına bakılır (CSP blob adresine fetch'e izin vermez)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.exp-row').last().locator('[data-dl]').click()]);
    const s = (await (await import('node:fs')).promises.readFile(await dl.path())).toString('latin1');
    assert.ok(s.charCodeAt(0) === 0xff && s.charCodeAt(1) === 0xd8, 'çıktı JPEG');
    assert.ok(!s.includes('Exif') && !s.includes('GPS konum'), 'çıktıda EXIF yok');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.26 kalan: editörde QR kod ekleme/düzenleme, kayıt ve PNG çıktısında görünmesi', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'QR marka' })).data.brand;
  const p = (await srv.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'QR tasarım', kind: 'post' })).data.post;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/post/${p.id}`);
    await page.locator('.ed-rail [data-rail="ogeler"]').click();
    await page.locator('[data-add="qr"]').click();
    await page.locator('.toast', { hasText: 'QR kod için bir link' }).waitFor();
    await page.locator('#ed-qr-text').fill('https://ornek.com/menu');
    await page.locator('[data-add="qr"]').click();
    await page.locator('.ed-props-head h3', { hasText: 'QR kod' }).waitFor();
    await page.locator('#lp-qr').fill('https://ornek.com/kampanya');
    await page.locator('#lp-qr').dispatchEvent('input');
    await page.locator('.ed-save[data-act="save"]').click();
    await page.waitForFunction(() => document.querySelector('.ed-save').textContent.trim() === 'Kaydet');
    const saved = (await srv.request('GET', `/api/brands/${b.id}/posts/${p.id}`)).data.post;
    const qr = saved.data.slides[0].layers.find(l => l.type === 'qr');
    assert.equal(qr.text, 'https://ornek.com/kampanya');
    assert.equal(qr.w, qr.h, 'kare');
    // PNG çıktısında QR alanında hem koyu hem açık modüller var
    await page.locator('[data-menu="paylas"]').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-png="one"]').click()]);
    const buf = await (await import('node:fs')).promises.readFile(await dl.path());
    assert.equal(buf.subarray(1, 4).toString(), 'PNG');
    const stats = await page.evaluate(async ({ b64, q }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(q.x, q.y, q.w, q.h).data;
      let dark = 0; let light = 0;
      for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < 150) dark++; else if (v > 600) light++; }
      return { dark, light, total: d.length / 4 };
    }, { b64: buf.toString('base64'), q: { x: qr.x, y: qr.y, w: qr.w, h: qr.h } });
    assert.ok(stats.dark > stats.total * 0.2 && stats.light > stats.total * 0.2, `QR modülleri: ${JSON.stringify(stats)}`);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.31 kalan: kampanya kanvasında sürükle-bırak konumu kaydeder; bağlama modunda iki kart bağlanır ve tekrar tıklayınca ayrılır', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Kanvaslı' })).data.brand;
  const c = (await srv.request('POST', `/api/brands/${b.id}/campaigns`, { name: 'Bahar kampanyası' })).data.campaign;
  const n1 = (await srv.request('POST', `/api/brands/${b.id}/campaigns/${c.id}/items`, { kind: 'note', text: 'Birinci not', x: 40, y: 40 })).data.item;
  const n2 = (await srv.request('POST', `/api/brands/${b.id}/campaigns/${c.id}/items`, { kind: 'note', text: 'İkinci not', x: 400, y: 40 })).data.item;
  const { browser, page, problems } = await open(srv);
  const get = async () => (await srv.request('GET', `/api/brands/${b.id}/campaigns/${c.id}`)).data.campaign;
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/kampanya/${c.id}`);
    const card = page.locator(`[data-item="${n1.id}"]`);
    await card.waitFor();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 240, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(async ({ bid, cid, id }) => { const r = await (await fetch(`/api/brands/${bid}/campaigns/${cid}`)).json(); const it = r.campaign.items.find(i => i.id === id); return it.x === 140 && it.y === 240; }, { bid: b.id, cid: c.id, id: n1.id });
    // Bağlama
    await page.locator('[data-link-mode]').click();
    await page.locator(`[data-item="${n1.id}"] .cv-note`).click();
    await page.locator(`[data-item="${n2.id}"] .cv-note`).click();
    await page.waitForFunction(() => document.querySelectorAll('.cv-lines line, .cv-lines path').length === 1);
    assert.deepEqual((await get()).links, [[n1.id, n2.id]]);
    await page.locator(`[data-item="${n2.id}"] .cv-note`).click();
    await page.locator(`[data-item="${n1.id}"] .cv-note`).click();
    await page.waitForFunction(() => document.querySelectorAll('.cv-lines line, .cv-lines path').length === 0);
    assert.deepEqual((await get()).links, []);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});
