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

test('5.21/10.9 YouTube kapak stüdyosu: yazı öner, yazıyı kullan, tasarım aç, YouTube önizlemesi; ızgarada görünmez', { skip }, async () => {
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
    await page.getByRole('button', { name: 'Kapak yazısı öner' }).click();
    await page.locator('.yt-idea').nth(1).waitFor();
    assert.equal(await page.locator('.yt-idea').count(), 2);
    assert.match(await page.locator('.yt-idea-text').first().innerText(), /3 MALZEME YETER/i);
    // 10.9: kapak kendi çekiminden; görsel modeli yoksa oluştur düğmesi kapalı (sahte görsel yok)
    assert.ok(await page.getByRole('button', { name: 'Kapağı oluştur' }).isDisabled());
    await page.locator('[data-yt-use="0"]').click();
    assert.equal(await page.locator('#yt-text').inputValue(), '3 MALZEME YETER Mİ?');
    await page.locator('#yt-blank').click();
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

test('7.2 Prompt kimliği sekmesi (Marka kimliği içinde): seçim kaydedilir, maskot cevapları korunur, yeniden açılınca gelir', { skip }, async () => {
  const srv = await startServer();
  const brand = (await srv.request('POST', '/api/brands', { name: 'Kimlik' })).data.brand;
  await srv.request('PUT', `/api/brands/${brand.id}/prompt-identity`, { hasMascot: true, mascotName: 'Kahveci' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${brand.id}/kimlik/prompt`);
    await page.getByRole('heading', { name: 'Marka kimliği', level: 1 }).waitFor();
    assert.equal(await page.locator('.id-tabs a.active').innerText(), 'Prompt kimliği');
    await page.locator('.chip-check', { hasText: 'Gerçekçi fotoğraf' }).click();
    await page.locator('.chip-check', { hasText: 'Samimi' }).click();
    await page.locator('.chip-check', { hasText: 'Enerjik' }).click();
    assert.equal(await page.locator('[data-q="mascotName"]').count(), 0, 'maskot soruları Maskot sekmesinde');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await page.locator('.toast', { hasText: 'Prompt kimliği kaydedildi' }).waitFor();
    const idt = (await srv.request('GET', `/api/brands/${brand.id}/prompt-identity`)).data.identity;
    assert.deepEqual([idt.visualStyle, idt.mood, idt.hasMascot, idt.mascotName], ['gercekci', ['samimi', 'enerjik'], true, 'Kahveci']);
    await page.reload();
    await page.locator('#pi-form input[name="visualStyle"][value="gercekci"]:checked').waitFor();
    assert.ok(await page.locator('.sidebar a[href$="/kimlik"]').count());
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('7.3 karakter kitabı kartı: poz seç, alanları doldur, kaydet, yeniden açılınca gelir', { skip }, async () => {
  const { PNG_1PX } = await import('./helpers.js');
  const srv = await startServer();
  const brand = (await srv.request('POST', '/api/brands', { name: 'Kitap' })).data.brand;
  const pose = (await srv.request('POST', `/api/brands/${brand.id}/assets?category=mascot&label=Poz`, PNG_1PX, { 'Content-Type': 'image/png' })).data.asset;
  await srv.request('PUT', `/api/brands/${brand.id}/prompt-identity`, { hasMascot: true });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${brand.id}/kimlik/maskot`);
    const card = page.locator('#cb-card');
    await card.getByRole('heading', { name: 'Maskot karakter kitabı' }).waitFor();
    await card.locator(`[name="pose"][value="${pose.id}"]`).check();
    await card.getByLabel('Adı').fill('Kahveci');
    await card.getByLabel('Görünüş tarifi (İngilizce, sabit)').fill('A round coffee bean with big eyes');
    await card.getByLabel('Asla (her satıra bir)').fill('Siyah çizilmez\nÜzgün olmaz');
    await card.getByRole('button', { name: 'Kitabı kaydet' }).click();
    await page.locator('.toast', { hasText: 'Karakter kitabı kaydedildi' }).waitFor();
    const book = (await srv.request('GET', `/api/brands/${brand.id}/character-book`)).data.book;
    assert.deepEqual([book.name, book.poseAssetIds, book.never], ['Kahveci', [pose.id], ['Siyah çizilmez', 'Üzgün olmaz']]);
    await page.reload();
    await card.getByLabel('Adı').waitFor();
    assert.equal(await card.getByLabel('Adı').inputValue(), 'Kahveci');
    assert.ok(await card.locator(`[name="pose"][value="${pose.id}"]`).isChecked());
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('7.8 sahneli prompt ekranı: sahne kartları, bir sahne daha, elle düzenleyip kaydet', { skip }, async () => {
  const { fakeProvider } = await import('./helpers.js');
  const long = n => `8 saniye; sahne ${n}; 0-4 saniye süt dökülür, 4-8 saniye desen tamamlanır; yakın plan; kamera yavaşça yaklaşır; altın saat ışığı; kafe sesi; gerçekçi; ekranda yazı yok`;
  const provider = fakeProvider([p => (p.startsWith('PROMPT STUDIO · SAHNELİ') ? { title: 'Latte', scenes: [1, 2, 3].map(n => ({ title: `S${n}`, prompt: long(n) })) } : { title: 'S4', prompt: long(4) })]);
  const srv = await startServer({ aiProvider: provider });
  const brand = (await srv.request('POST', '/api/brands', { name: 'Sahne' })).data.brand;
  const p = (await srv.request('POST', `/api/brands/${brand.id}/prompts`, { kind: 'video', brief: 'Latte art', scenes: 3 })).data.prompt;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${brand.id}/prompt/${p.id}`);
    await page.locator('.scene-card').nth(2).waitFor();
    assert.equal(await page.locator('.scene-card').count(), 3);
    await page.getByRole('button', { name: /Bir sahne daha üret/ }).click();
    await page.locator('.scene-card').nth(3).waitFor();
    await page.getByLabel('Sahne 2 metni').fill('Elle düzeltilmiş ikinci sahne');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).first().click();
    await page.locator('.toast', { hasText: 'Kaydedildi' }).waitFor();
    const saved = (await srv.request('GET', `/api/brands/${brand.id}/prompts/${p.id}`)).data.prompt;
    assert.equal(saved.scenes.length, 4);
    assert.equal(saved.scenes[1].text, 'Elle düzeltilmiş ikinci sahne');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('7.9/7.10 arayüz: marka örneği yap, hedef araç seç ve araç çıktısını gör', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Araç UI' })).data.brand;
  const text = 'A barista pours latte art in a cozy cafe, close-up shot, warm light, photorealistic, clean composition, no text, no letters, no words, no watermark, no logo, no subtitles, no UI elements';
  const p = (await srv.request('POST', `/api/brands/${b.id}/prompts`, { manual: true, kind: 'gorsel', title: 'Latte', text })).data.prompt;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/prompt/${p.id}`);
    await page.getByRole('button', { name: 'Dosya' }).click();
    await page.getByRole('button', { name: /Marka örneği yap/ }).click();
    await page.locator('.ed-bottom', { hasText: 'Marka örneği' }).waitFor();
    await page.locator('.ed-rail [data-rail="arac"]').click();
    await page.selectOption('#pp-tool', 'midjourney');
    const out = page.locator('[data-tool-out="full"]');
    await out.waitFor();
    assert.match(await out.inputValue(), /photorealistic --ar 1:1 --no text/);
    await page.selectOption('#pp-aspect', '9:16');
    await page.waitForFunction(() => /--ar 9:16/.test((document.querySelector('[data-tool-out="full"]') || {}).value || ''));
    const saved = (await srv.request('GET', `/api/brands/${b.id}/prompts/${p.id}`)).data.prompt;
    assert.equal(saved.example, true);
    assert.equal(saved.tool, 'midjourney');
    assert.equal(saved.aspect, '9:16');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('7.11 arayüz: 👍/👎 ve neden; tekrar eden neden Prompt kimliğinde öneri olur ve uygulanır', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Oy UI' })).data.brand;
  const mk = async n => (await srv.request('POST', `/api/brands/${b.id}/prompts`, { manual: true, kind: 'gorsel', title: `P${n}`, text: `Prompt ${n}` })).data.prompt;
  const ps = [await mk(1), await mk(2), await mk(3)];
  for (const p of ps.slice(0, 2)) await srv.request('PUT', `/api/brands/${b.id}/feedback`, { targetType: 'prompt', targetId: p.id, vote: -1, reasons: ['karanlik'] });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/prompt/${ps[2].id}`);
    await page.locator('#pp-text').fill('Prompt 3 elle değişti');
    await page.locator('.ed-bottom [data-fb="1"]').click();
    await page.locator('.ed-bottom [data-fb="1"][aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('#pp-text').inputValue(), 'Prompt 3 elle değişti', 'oy kaydedilmemiş düzenlemeyi silmez');
    await page.locator('.ed-bottom [data-fb="-1"]').click();
    await page.locator('.modal label', { hasText: 'Çok karanlık' }).click();
    await page.locator('#fb-note').fill('gece gibi');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.ed-bottom [data-fb="-1"][aria-pressed="true"]').waitFor();
    await page.locator('.toast', { hasText: 'öneri çıktı' }).waitFor();
    const fb = (await srv.request('GET', `/api/brands/${b.id}/prompts/${ps[2].id}`)).data.prompt.feedback;
    assert.deepEqual(fb, { vote: -1, reasons: ['karanlik'], note: 'gece gibi' });

    await page.goto(`${srv.base}/#/m/${b.id}/kimlik/prompt`);
    const card = page.locator('#fb-suggest');
    await card.waitFor();
    assert.match(await card.innerText(), /Çok karanlık[\s\S]*3 kez/);
    await card.getByRole('button', { name: 'Uygula' }).click();
    await page.locator('#pi-form input[name="lighting"][value="dogal"]:checked').waitFor();
    assert.equal(await page.locator('#fb-suggest').isHidden(), true);
    assert.equal((await srv.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity.lighting, 'dogal');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('7.12 arayüz: prompt kimliğini tarif olarak kaydet, başka markada tariften başlat', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Kaynak UI' })).data.brand;
  const b = (await srv.request('POST', '/api/brands', { name: 'Hedef UI' })).data.brand;
  await srv.request('PUT', `/api/brands/${a.id}/prompt-identity`, { visualStyle: '3d', hasMascot: true, mascotName: 'Fıstık' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${a.id}/kimlik/prompt`);
    await page.locator('[data-pi-save-recipe]').click();
    await page.locator('.modal [type=submit]').click();
    await page.locator('.toast', { hasText: 'tariflere kaydedildi' }).waitFor();
    await page.goto(`${srv.base}/#/m/${b.id}/kimlik/prompt`);
    await page.locator('[data-pi-recipes]').click();
    await page.locator('.rc-item', { hasText: 'Kaynak UI prompt kimliği' }).getByRole('button', { name: 'Ekle' }).click();
    await page.locator('.toast', { hasText: '1 boş cevap tariften dolduruldu' }).waitFor();
    await page.locator('#pi-form input[name="visualStyle"][value="3d"]:checked').waitFor();
    assert.equal(await page.locator('.modal-backdrop').count(), 0);
    assert.ok(!(await srv.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity.hasMascot, 'maskot taşınmadı');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('7.13 arayüz: prompt karşılaştırması kalite puanıyla gösterilir ve Prompt Studio\'ya kaydedilir', { skip }, async () => {
  const good = 'Barista kafede latte art yapıyor, yakın plan çekim, sıcak altın saat ışığı, 50mm lens, sığ alan derinliği, krem ve kahve tonları, samimi his, gerçekçi fotoğraf stili, arka planda bulanık ahşap raflar ve yükselen buhar, tezgâhta seramik fincanlar ve taze kahve çekirdekleri, temiz kompozisyon, yazı yok, harf yok, kelime yok, filigran yok, logo yok, altyazı yok, arayüz öğesi yok';
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: ['gemini-flash-latest', 'gemini-flash-lite-latest'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    const model = decodeURIComponent(u.pathname.split('/').pop().split(':')[0]);
    const out = model === 'gemini-flash-latest' ? { title: 'Latte', prompt: good } : { title: 'Zayıf', prompt: 'Kafede kahve' };
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }], usageMetadata: {} });
  };
  const srv = await startServer({ fetchImpl });
  await srv.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' });
  const b = (await srv.request('POST', '/api/brands', { name: 'Kıyas UI' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/ai`);
    await page.locator('[data-kind="prompt"]').click();
    await page.locator('#cmp-pkind').waitFor();
    await page.selectOption('#cmp-pkind', 'gorsel');
    await page.selectOption('#cmp-brand', b.id);
    await page.locator('#cmp-brief').fill('Latte');
    for (const ref of await page.locator('[data-pick][aria-pressed="true"]').evaluateAll(els => els.map(e => e.dataset.pick))) {
      if (!/^gemini:gemini-flash(-lite)?-latest$/.test(ref)) await page.locator(`[data-pick="${ref}"]`).click();
    }
    for (const id of ['gemini-flash-latest', 'gemini-flash-lite-latest']) {
      const chip = page.locator(`[data-pick="gemini:${id}"]`);
      if (await chip.getAttribute('aria-pressed') !== 'true') await chip.click();
    }
    await page.locator('#cmp-form [type=submit]').click();
    const cols = page.locator('#cmp-results .cmp-col');
    await cols.first().waitFor();
    assert.equal(await cols.count(), 2);
    assert.match(await cols.first().innerText(), /%100/);
    assert.match(await cols.nth(1).innerText(), /Eksik:/);
    await cols.first().getByRole('button', { name: "Prompt Studio'ya kaydet" }).click();
    await page.waitForURL(/\/prompt\//);
    await page.locator('#pp-text').waitFor();
    assert.equal(await page.locator('#pp-text').inputValue(), good);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('8.4 arayüz: prompt üretirken metin canlı akar; İptal üretimi keser ve kayıt açılmaz', { skip }, async () => {
  const out = { title: 'Canlı', prompt: 'Barista kafede latte art yapıyor, yakın plan, sıcak ışık' };
  let gate = null;
  const provider = { label: 'Akış', async generate(prompt, opts) {
    const txt = JSON.stringify(out);
    for (let i = 0; i < txt.length; i += 12) { opts.onDelta && opts.onDelta(txt.slice(i, i + 12)); await new Promise(r => setTimeout(r, 30)); }
    if (gate) await new Promise((resolve, reject) => { gate = resolve; opts.signal.addEventListener('abort', () => reject(new Error('iptal'))); });
    return out;
  }, async test() { return { ok: true, modelCount: 1, modelAvailable: true }; } };
  const srv = await startServer({ aiProvider: provider });
  const b = (await srv.request('POST', '/api/brands', { name: 'Akış UI' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/prompt`);
    await page.locator('#ps-brief').fill('Latte');
    gate = true; // ilk üretim bitmeden bekler (iptal denemesi)
    await page.locator('[data-create]').click();
    const box = page.locator('.stream-box');
    await page.waitForFunction(() => /latte art/.test((document.querySelector('.stream-text') || {}).textContent || ''));
    assert.doesNotMatch(await box.locator('.stream-text').innerText(), /"prompt"|[{}]/, 'JSON okunur hâlde gösterilir');
    await box.getByRole('button', { name: 'İptal' }).click();
    await page.locator('.toast', { hasText: 'iptal edildi' }).waitFor();
    assert.equal(await page.locator('.stream-box').count(), 0);
    assert.equal(await page.locator('[data-create]').isDisabled(), false);
    assert.equal((await srv.request('GET', `/api/brands/${b.id}/prompts`)).data.prompts.length, 0);
    // İkinci deneme tamamlanır ve editöre gider
    gate = null;
    await page.locator('[data-create]').click();
    await page.waitForURL(/\/prompt\/[^/]+$/);
    await page.locator('#pp-text').waitFor();
    assert.equal(await page.locator('#pp-text').inputValue(), out.prompt);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('8.5 arayüz: üretim öncesi tahmini tutar, sahne sayısıyla değişir; bütçe yetmeyecekse uyarı', { skip }, async () => {
  const srv = await startServer({ aiProvider: { label: 'T', async generate() { return { title: 'x', prompt: 'x' }; }, async test() { return { ok: true, modelCount: 1, modelAvailable: true }; } } });
  const b = (await srv.request('POST', '/api/brands', { name: 'Tutar UI' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/prompt`);
    const hint = page.locator('#ps-cost');
    await hint.waitFor();
    assert.match(await hint.innerText(), /Tahmini tutar bilinmiyor/, 'fiyatı olmayan model');
    assert.equal((await srv.request('PUT', '/api/ai/prices', { ref: 'fake:test', price: { input: 3, output: 15 } })).status, 200);
    await page.evaluate(() => location.reload());
    await hint.waitFor();
    // 2.500 × 3 + 700 × 15 = 18.000 / 1e6 = 0,018 $
    assert.match(await hint.innerText(), /Tahmini tutar ~0,018 \$ \(eksik çıkarsa bir kez daha yazılır\)/);
    await page.selectOption('#ps-scenes', '3');
    assert.match(await hint.innerText(), /~0,054 \$ \(3 sahne\)/);
    assert.equal(await hint.evaluate(el => el.classList.contains('cost-warn')), false);
    await srv.request('PUT', '/api/ai/budget', { monthlyUsd: 0.01 });
    await page.evaluate(() => location.reload());
    await hint.waitFor();
    await page.waitForFunction(() => /yetmeyebilir/.test(document.querySelector('#ps-cost').textContent));
    assert.equal(await hint.evaluate(el => el.classList.contains('cost-warn')), true);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('8.9 arayüz: büyük arşiv 200\'er satır çizilir, "Daha fazla göster" ve filtre ilk sayfaya döner', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Arşiv UI' })).data.brand;
  const { DatabaseSync } = await import('node:sqlite');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const db = new DatabaseSync(path.join(srv.dataDir, fs.readdirSync(srv.dataDir).find(f => f.endsWith('.db'))));
  db.exec('BEGIN');
  const ins = db.prepare("INSERT INTO contents (id, brand_id, title, type, status, scheduled_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'taslak', ?, '', ?, ?)");
  for (let i = 0; i < 450; i++) { const at = new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString(); ins.run(`c${i}`, b.id, `İçerik ${i}`, i % 2 ? 'post' : 'reels', at, at, at); }
  db.exec('COMMIT');
  db.close();
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/arsiv`);
    const rows = page.locator('#arch-list tbody tr');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 200);
    assert.match(await page.locator('#arch-count').innerText(), /450 içerik/);
    await page.getByRole('button', { name: 'Daha fazla göster (250 kaldı)' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#arch-list tbody tr').length === 400);
    await page.selectOption('#arch-type', 'reels');
    await page.waitForFunction(() => document.querySelectorAll('#arch-list tbody tr').length === 200);
    assert.match(await page.locator('#arch-count').innerText(), /225 içerik/);
    assert.equal(await page.getByRole('button', { name: 'Daha fazla göster (25 kaldı)' }).count(), 1);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('8.11 arayüz: içerik kartında onaya gönder, düzeltme iste, açık adım sorusu ve onay; Kaydet durumu geri almaz', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Onay UI' })).data.brand;
  const c = (await srv.request('POST', '/api/contents', { brandId: b.id, title: 'Afiş', type: 'post' })).data.content;
  const { browser, page, problems } = await open(srv);
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/arsiv`);
    await page.locator(`[data-edit="${c.id}"]`).click();
    await page.locator('#c-review summary').click();
    await page.locator('#c-rv-list', { hasText: 'Henüz onay geçmişi yok' }).waitFor();
    await page.locator('[data-rv="gonder"]').click();
    await page.locator('[data-rv="onayla"]').waitFor();
    assert.equal(await page.locator('#c-status').inputValue(), 'onay');
    await page.locator('[data-rv="duzelt"]').click();
    await page.locator('.toast', { hasText: 'Neyin düzeltilmesi' }).waitFor();
    await page.locator('#c-rv-note').fill('Logo küçük');
    await page.locator('[data-rv="duzelt"]').click();
    await page.locator('#c-rv-list', { hasText: 'Logo küçük' }).waitFor();
    await page.locator('[data-rv="gonder"]').click();
    await page.locator('[data-rv="onayla"]').click();
    await page.locator('#c-rv-list li', { hasText: 'Onaylandı' }).waitFor();
    assert.match(dialogs[0], /adım açık/, 'açık yapılacaklar için sorulur');
    assert.equal(await page.locator('#c-status').inputValue(), 'tamamlandi');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.modal-backdrop').waitFor({ state: 'detached' });
    assert.equal((await srv.request('GET', `/api/contents/${c.id}`)).data.content.status, 'tamamlandi');
    assert.equal((await srv.request('GET', `/api/contents/${c.id}/reviews`)).data.reviews.length, 4);
    // Bilerek tetiklenen doğrulama yanıtları (400 boş not, 409 açık adım) dışında hata yok
    assert.deepEqual(problems.filter(p => !/status of (400|409)/.test(p)), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('8.12 arayüz: arşivde Instagram CSV\'si yüklenir, eşleşmeler gösterilir, kaydedilince sonuçlar içeriğe yazılır', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'IG UI' })).data.brand;
  const c = (await srv.request('POST', '/api/contents', { brandId: b.id, title: 'Latte', type: 'reels', scheduledAt: new Date(2026, 10, 3, 10, 0).toISOString() })).data.content;
  const csv = 'Description,Publish time,Views,Likes,Comments,Saves,Shares\nLatte günü,11/03/2026 10:15,2000,100,10,20,5\nBaşka,10/01/2026 09:00,5,1,0,0,0\n';
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/arsiv`);
    await page.locator('[data-ig]').click();
    await page.locator('#ig-file').setInputFiles({ name: 'instagram.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.locator('#ig-preview', { hasText: '1 / 2 satır eşleşti' }).waitFor();
    assert.equal(await page.locator('[data-ig-row="0"]').inputValue(), c.id);
    assert.equal(await page.locator('[data-ig-row="1"]').inputValue(), '');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.toast', { hasText: '1 içeriğe paylaşım sonuçları yazıldı' }).waitFor();
    const g = (await srv.request('GET', `/api/contents/${c.id}`)).data.content;
    assert.equal(g.metrics.views, 2000);
    await page.locator('#arch-list', { hasText: 'etkileşim %' }).waitFor();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('8.15 arayüz: içerik kartında set düzenle, grup ve imzayı tek tıkla ekle (tekrarsız)', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Set UI' })).data.brand;
  const c = (await srv.request('POST', '/api/contents', { brandId: b.id, title: 'Post', type: 'post' })).data.content;
  await srv.request('PATCH', `/api/contents/${c.id}`, { hashtags: '#kahve', caption: 'Yeni menü geldi.' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/arsiv`);
    await page.locator(`[data-edit="${c.id}"]`).click();
    await page.locator('[data-sets-edit]').click();
    await page.locator('[data-g-name]').fill('Kampüs');
    await page.locator('[data-g-tags]').fill('#kahve #kampus #vize');
    await page.locator('[data-s-name]').fill('Kapanış');
    await page.locator('[data-s-text]').fill('Bio\'daki linkten menüye bak ☕');
    await page.locator('.modal:has(#se-groups) [type=submit]').click();
    await page.locator('[data-tag-group]').waitFor();
    await page.locator('[data-tag-group]').click();
    assert.equal(await page.locator('#c-tags').inputValue(), '#kahve #kampus #vize', 'var olan etiket tekrarlanmaz');
    await page.locator('[data-sig]').click();
    await page.locator('[data-sig]').click();
    assert.equal(await page.locator('#c-caption').inputValue(), 'Yeni menü geldi.\n\nBio\'daki linkten menüye bak ☕', 'imza bir kez eklenir');
    await page.locator('.modal [type=submit]').last().click();
    await page.locator('.modal-backdrop').waitFor({ state: 'detached' });
    const g = (await srv.request('GET', `/api/contents/${c.id}`)).data.content;
    assert.deepEqual(g.hashtags, ['#kahve', '#kampus', '#vize']);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('8.16 arayüz: takvimde Haftalık plan; taslak, satır düzenleme/çıkarma, takvime yazma', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Plan UI' })).data.brand;
  await srv.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Latte günü', category: 'guncel' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}/takvim`);
    await page.locator('[data-week-plan]').click();
    await page.locator('#wp-count').fill('3');
    await page.locator('[data-wp-draft]').click();
    const rows = page.locator('[data-wp-row]');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 3);
    assert.ok(await page.locator('[data-wp-title]').evaluateAll(els => els.some(e => e.value === 'Latte günü')));
    await rows.nth(2).locator('[data-wp-on]').uncheck();
    await rows.nth(1).locator('[data-wp-title]').fill('Elle değişen başlık');
    await page.locator('.modal [type=submit]').click();
    await page.locator('.toast', { hasText: '2 içerik takvime yazıldı' }).waitFor();
    const list = (await srv.request('GET', `/api/contents?brandId=${b.id}`)).data.contents;
    assert.equal(list.length, 2);
    assert.ok(list.some(c => c.title === 'Elle değişen başlık'));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('8.20 dairesel hızlı menü: Alt+Q imleçte açılır, ok/Enter ve 1–8, düzenleme ve sıralama kalıcı, orta tuş, ◎ düğmesi', { skip }, async () => {
  const srv = await startServer();
  const b = (await srv.request('POST', '/api/brands', { name: 'Menü UI' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(`${srv.base}/#/m/${b.id}`);
    await page.locator('.radial-fab').waitFor();
    await page.mouse.move(600, 400);
    await page.keyboard.press('Alt+q');
    const items = page.locator('.radial-item');
    await items.first().waitFor();
    assert.equal(await items.count(), 7, 'varsayılan kısa yollar');
    const box = await page.locator('.radial').boundingBox();
    assert.ok(Math.abs(box.x - 600) < 2 && Math.abs(box.y - 400) < 2, 'imlecin olduğu yerde');
    // Ok tuşu odağı gezdirir; Esc kapatır
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.i), '1');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.radial-backdrop').count(), 0);
    // 3: Not al → not penceresi
    await page.keyboard.press('Alt+q');
    await page.keyboard.press('3');
    await page.locator('.modal', { hasText: 'Not' }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.modal-backdrop').waitFor({ state: 'detached' });
    // Düzenle: hepsini kaldır, Prompt Studio ve Görevler'i seç, sırayı değiştir
    await page.locator('.radial-fab').click();
    await page.locator('.radial-center').click();
    while (await page.locator('#rd-all input:checked').count()) await page.locator('#rd-all input:checked').first().uncheck();
    await page.locator('#rd-all label', { hasText: 'Prompt Studio' }).locator('input').check();
    await page.locator('#rd-all label', { hasText: /^ ?Görevler$/ }).first().locator('input').check();
    await page.locator('#rd-order [data-down="0"]').click();
    await page.locator('.modal [type=submit]').click();
    await page.locator('.modal-backdrop').waitFor({ state: 'detached' });
    await page.reload();
    await page.locator('.radial-fab').waitFor();
    await page.mouse.click(700, 300, { button: 'middle' });
    await items.first().waitFor();
    assert.deepEqual(await items.locator('span').allInnerTexts(), ['Görevler', 'Prompt Studio'], 'seçim ve sıra kalıcı');
    await page.keyboard.press('2');
    await page.waitForURL(/\/prompt$/);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});
