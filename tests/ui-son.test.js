// Toplu testler (arayüz): son aşama özellikleri.
// T.36 aylık hedef, T.37 takvimde sürükle-bırak, T.38 tanıtım turu, T.39 sesli not.
// Playwright kurulu değilse atlanır (uygulamanın kendisi Playwright'a ihtiyaç duymaz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './helpers.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }
const skip = !chromium && 'Playwright yok';

async function open(srv, { init = null, width = 1400, height = 950 } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) problems.push('console: ' + m.text()); });
  if (init) await page.addInitScript(init);
  return { browser, page, problems };
}
const localMidnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

test('T.38 tanıtım turu: ilk açılışta bir kez, ileri/geri/geç, Esc, Ayarlar ve paletten yeniden', { skip }, async () => {
  const srv = await startServer();
  await srv.request('POST', '/api/brands/demo');
  // Testler turu kendiliğinden açmaz (navigator.webdriver); burada gerçek kullanıcı gibi davranılır
  const { browser, page, problems } = await open(srv, { init: () => Object.defineProperty(navigator, 'webdriver', { get: () => false }) });
  try {
    await page.goto(srv.base + '/#/');
    const tip = page.locator('.tour-tip');
    await tip.waitFor();
    assert.match(await tip.innerText(), /1 \/ 6/);
    assert.equal(await tip.getByRole('button', { name: 'Geri' }).count(), 0);
    await tip.getByRole('button', { name: 'İleri' }).click();
    await page.locator('.tour-tip', { hasText: '2 / 6' }).waitFor();
    await tip.getByRole('button', { name: 'Geri' }).click();
    await page.locator('.tour-tip', { hasText: '1 / 6' }).waitFor();
    // Spot ışığı vurgulanan öğenin üstünde
    await page.waitForTimeout(400); // spot geçiş animasyonu
    const [spot, nav] = await Promise.all([page.locator('.tour-spot').boundingBox(), page.locator('.sidebar .nav').boundingBox()]);
    assert.ok(spot.x <= nav.x && spot.y <= nav.y && spot.x + spot.width >= nav.x + nav.width);
    for (let i = 0; i < 5; i++) await tip.getByRole('button', { name: 'İleri' }).click();
    await page.locator('.tour-tip', { hasText: '6 / 6' }).waitFor();
    await tip.getByRole('button', { name: 'Bitir' }).click();
    await page.locator('.tour').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('ium.tour.done')), '1');

    // Yeniden açılışta gelmez
    await page.reload();
    await page.locator('.ops .w-actions').waitFor();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.tour').count(), 0);

    // Ayarlar'dan yeniden başlat; Esc kapatır
    await page.goto(srv.base + '/#/ayarlar');
    await page.getByRole('button', { name: 'Tanıtım turunu yeniden başlat' }).click();
    await page.locator('.tour-tip', { hasText: '1 / 6' }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.tour').waitFor({ state: 'detached' });

    // Ctrl+K paletinden
    await page.keyboard.press('Control+k');
    await page.keyboard.type('tanitim turu');
    await page.keyboard.press('Enter');
    await page.locator('.tour-tip', { hasText: '1 / 6' }).waitFor();
    await page.getByRole('button', { name: 'Turu geç' }).click();
    await page.locator('.tour').waitFor({ state: 'detached' });
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.38 otomatik testte tur kendiliğinden açılmaz', { skip }, async () => {
  const srv = await startServer();
  await srv.request('POST', '/api/brands/demo');
  const { browser, page } = await open(srv);
  try {
    await page.goto(srv.base + '/#/');
    await page.locator('.ops .w-actions').waitFor();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.tour').count(), 0);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.37 takvimde sürükle-bırak: aylık ve Çalışma masası haftalık görünüm, saat korunur', { skip }, async () => {
  const srv = await startServer();
  const brand = (await srv.request('POST', '/api/brands', { name: 'Sürükle' })).data.brand;
  const now = new Date();
  const mid = new Date(now.getFullYear(), now.getMonth(), 15, 14, 30);
  const c = (await srv.request('POST', '/api/contents', { brandId: brand.id, title: 'Taşınacak içerik', type: 'post', scheduledAt: mid.toISOString() })).data.content;
  const { browser, page, problems } = await open(srv);
  const at = async () => new Date((await srv.request('GET', '/api/contents')).data.contents.find(x => x.id === c.id).scheduledAt);
  try {
    // Aylık görünüm: 15'inden 17'sine
    await page.goto(srv.base + `/#/m/${brand.id}/takvim`);
    await page.locator('[data-mode="ay"]').click();
    const item = page.locator(`.cal-item[data-item="${c.id}"]`);
    await item.waitFor();
    const target = new Date(now.getFullYear(), now.getMonth(), 17);
    await item.dragTo(page.locator(`.cal-cell[data-day="${localMidnight(target)}"]`));
    await page.locator('.toast', { hasText: 'tarihine taşındı' }).waitFor();
    await page.locator(`.cal-cell[data-day="${localMidnight(target)}"] .cal-item[data-item="${c.id}"]`).waitFor();
    let d = await at();
    assert.deepEqual([d.getDate(), d.getHours(), d.getMinutes()], [17, 14, 30]);

    // Aynı güne bırakmak bir şey değiştirmez (istek atılmaz)
    let patched = 0;
    page.on('request', r => { if (r.method() === 'PATCH' && r.url().includes('/api/contents/')) patched++; });
    await page.locator(`.cal-item[data-item="${c.id}"]`).dragTo(page.locator(`.cal-cell[data-day="${localMidnight(target)}"]`));
    await page.waitForTimeout(400);
    assert.equal(patched, 0);

    // Çalışma masası haftalık: içeriği bu haftaya al, başka bir güne sürükle
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15);
    await srv.request('PATCH', `/api/contents/${c.id}`, { scheduledAt: today.toISOString() });
    await page.goto(srv.base + '/#/masa');
    await page.locator('[data-mode="hafta"]').click();
    const wItem = page.locator(`.cw-item[data-item="${c.id}"]`);
    await wItem.waitFor();
    const other = await page.locator(`.cw-col[data-day]:not([data-day="${localMidnight(today)}"])`).first().getAttribute('data-day');
    await wItem.dragTo(page.locator(`.cw-col[data-day="${other}"]`));
    await page.locator(`.cw-col[data-day="${other}"] .cw-item[data-item="${c.id}"]`).waitFor();
    d = await at();
    assert.equal(localMidnight(d), Number(other));
    assert.deepEqual([d.getHours(), d.getMinutes()], [9, 15]);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.39 sesli not: tanıma varsa her alanda tek mikrofon, dikte metni yazar; yoksa düğme yok', { skip }, async () => {
  const srv = await startServer();
  // Sahte konuşma tanıma: başlatılınca bir sonuç verip biter
  const fake = () => {
    window.SpeechRecognition = class {
      start() { setTimeout(() => { this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'kurabiye siparişi' }], { isFinal: true })] }); this.onend(); }, 30); }
      stop() { if (this.onend) this.onend(); }
    };
  };
  let { browser, page, problems } = await open(srv, { init: fake });
  try {
    await page.goto(srv.base + '/#/notlar');
    const note = page.getByLabel('Not', { exact: true });
    await note.waitFor();
    const micOf = page.locator('#quick-note .mic-btn');
    await micOf.waitFor();
    assert.equal(await micOf.count(), 1);
    await note.fill('Liste:');
    await micOf.click();
    await page.waitForFunction(() => document.querySelector('#quick-note textarea').value.includes('kurabiye'));
    assert.equal((await note.inputValue()).trim(), 'Liste: kurabiye siparişi');
    // Not kaydedilince liste yeniden çizilir; düğme çoğalmaz
    await page.getByRole('button', { name: 'Notu kaydet' }).click();
    await page.locator('.note-card', { hasText: 'kurabiye' }).waitFor();
    assert.equal(await page.locator('#quick-note .mic-btn').count(), 1);
    // Görevler ve Çalışma masası alanları
    await page.goto(srv.base + '/#/gorevler');
    await page.getByLabel('Görev', { exact: true }).waitFor();
    assert.equal(await page.locator('.mic-btn').count(), 1);
    await page.goto(srv.base + '/#/masa');
    await page.locator('#wn-quick .mic-btn').waitFor();
    assert.equal(await page.locator('#wt-quick .mic-btn').count(), 1);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }

  ({ browser, page } = await open(srv, { init: () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; } }));
  try {
    await page.goto(srv.base + '/#/notlar');
    await page.getByLabel('Not', { exact: true }).waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.mic-btn').count(), 0);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.36 aylık hedef: marka ana sayfasında hedef koy, ilerleme ve rozetler', { skip }, async () => {
  const srv = await startServer();
  const brand = (await srv.request('POST', '/api/brands', { name: 'Hedefli' })).data.brand;
  const now = new Date();
  for (let i = 0; i < 3; i++) await srv.request('POST', '/api/contents', { brandId: brand.id, title: 'Plan ' + i, type: 'post', scheduledAt: new Date(now.getFullYear(), now.getMonth(), 10 + i, 12).toISOString() });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${brand.id}`);
    const card = page.locator('#goal-card');
    await card.waitFor();
    assert.match(await card.innerText(), /Hedef koyarsan/);
    assert.equal(await card.locator('.goal-bar').count(), 0);
    await card.getByLabel('Aylık içerik hedefi').fill('4');
    await card.getByRole('button', { name: 'Hedef koy' }).click();
    await page.locator('.goal-meta', { hasText: '3 / 4' }).waitFor();
    assert.equal(await page.locator('.goal-bar').getAttribute('aria-valuenow'), '3');
    assert.equal((await srv.request('GET', '/api/brands')).data.brands.find(b => b.id === brand.id).monthlyGoal, 4);
    // Hedefe ulaşınca tamam görünümü
    await page.locator('#goal-card').getByLabel('Aylık içerik hedefi').fill('3');
    await page.locator('#goal-card').getByRole('button', { name: 'Güncelle' }).click();
    await page.locator('.goal-bar.full').waitFor();
    assert.match(await page.locator('.goal-meta').innerText(), /Hedefe ulaşıldı/);
    // Yönetim Merkezi'nde seri rozeti (içerikler bugün oluşturuldu: 1 günlük seri rozet sayılmaz)
    await page.goto(srv.base + '/#/');
    await page.locator('.ops .w-side').waitFor();
    assert.equal(await page.locator('.w-side .bdg-fire').count(), 0);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('5.21 YouTube kapak stüdyosu: fikir al, tarifi kutuya al, tasarım aç, YouTube önizlemesi; ızgarada görünmez', { skip }, async () => {
  const { fakeProvider } = await import('./helpers.js');
  const provider = fakeProvider([p => (p.startsWith('YOUTUBE KAPAK') ? { summary: '', ideas: [
    { name: 'Şaşkın yüz', text: '3 MALZEME YETER Mİ?', promise: 'Evde kafe latte', emotion: 'şaşkın', composition: 'Yazı solda', imagePrompt: 'Surprised barista, 16:9', colors: ['#e11d48'] },
    { name: 'Karşılaştırma', text: 'KAFE vs EV', promise: 'Fark yok', emotion: '', composition: 'İkiye bölünmüş', imagePrompt: 'Split screen', colors: [] }] } : { reply: 'x' })]);
  const srv = await startServer({ aiProvider: provider });
  const brand = (await srv.request('POST', '/api/brands', { name: 'Kahve Kanalı' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${brand.id}/youtube`);
    await page.getByRole('heading', { name: 'YouTube kapağı', level: 1 }).waitFor();
    await page.getByLabel('Video başlığı').fill('Evde barista latte');
    await page.getByRole('button', { name: 'Kapak fikirleri' }).click();
    await page.locator('.yt-idea').nth(1).waitFor();
    assert.equal(await page.locator('.yt-idea').count(), 2);
    assert.match(await page.locator('.yt-idea-text').first().innerText(), /3 MALZEME YETER/i);
    // Görsel modeli bağlı değil: üretim kutusu açık uyarı verir (sahte görsel yok)
    assert.match(await page.locator('#yt-gen').innerText(), /Görsel üretimi bağlı değil/);
    await page.locator('[data-yt-design="0"]').click();
    await page.waitForURL(/\/post\/[A-Za-z0-9-]{8,}$/);
    const posts = (await srv.request('GET', `/api/brands/${brand.id}/posts`)).data.posts;
    assert.equal(posts[0].kind, 'youtube');
    assert.equal(posts[0].title, '3 MALZEME YETER Mİ?');
    await page.getByRole('button', { name: 'Paylaş' }).click();
    await page.getByRole('button', { name: 'YouTube önizlemesi' }).click();
    await page.locator('.yt-search .yt-thumb img').waitFor();
    await page.getByLabel('Süre').fill('8:05');
    assert.equal(await page.locator('.yt-phone .yt-dur').innerText(), '8:05');
    await page.keyboard.press('Escape');
    // Instagram ızgarasında YouTube kapağı görünmez (taslaklar açık olsa da)
    await page.goto(srv.base + `/#/m/${brand.id}/post/izgara`);
    await page.locator('#gr-drafts').check();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.ig-cell').count(), 0);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('7.2 Prompt kimliği sayfası: seçim, maskot soruları açılır, kaydedilir ve yeniden açılınca gelir', { skip }, async () => {
  const srv = await startServer();
  const brand = (await srv.request('POST', '/api/brands', { name: 'Kimlik' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${brand.id}/prompt-kimligi`);
    await page.getByRole('heading', { name: 'Prompt kimliği', level: 1 }).waitFor();
    await page.locator('.chip-check', { hasText: 'Gerçekçi fotoğraf' }).click();
    await page.locator('.chip-check', { hasText: 'Samimi' }).click();
    await page.locator('.chip-check', { hasText: 'Enerjik' }).click();
    assert.equal(await page.locator('[data-q="mascotName"]').isVisible(), false);
    await page.getByLabel('Markanın bir maskotu var mı?').check();
    await page.getByLabel('Maskotun adı').fill('Kahveci');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.locator('.toast', { hasText: 'Prompt kimliği kaydedildi' }).waitFor();
    const idt = (await srv.request('GET', `/api/brands/${brand.id}/prompt-identity`)).data.identity;
    assert.deepEqual([idt.visualStyle, idt.mood, idt.hasMascot, idt.mascotName], ['gercekci', ['samimi', 'enerjik'], true, 'Kahveci']);
    await page.reload();
    await page.getByLabel('Maskotun adı').waitFor();
    assert.equal(await page.getByLabel('Maskotun adı').inputValue(), 'Kahveci');
    assert.ok(await page.locator('.sidebar a[href$="/prompt-kimligi"]').count());
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});
