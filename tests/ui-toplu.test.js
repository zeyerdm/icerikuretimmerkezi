// Toplu testler (arayüz): T.19 komut paleti, T.27 palette arama, T.32 aylık rapor, T.20 ilham rafı, T.18 ızgara önizlemesi.
// Playwright kurulu değilse atlanır (uygulamanın kendisi Playwright'a ihtiyaç duymaz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, PNG_1PX } from './helpers.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }
const skip = !chromium && 'Playwright yok';

async function open(srv, { width = 1400, height = 950 } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) problems.push('console: ' + m.text()); });
  return { browser, page, problems };
}
const paste = (page, textValue) => page.evaluate(t => {
  const dt = new DataTransfer();
  dt.setData('text/plain', t);
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, textValue);

test('T.19 / T.27 komut paleti: Ctrl+K ve Esc, Türkçe karaktersiz arama, Enter ile gitme, genel arama sonuçları, form açıkken açılmaz', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Şekerci Dükkânı' })).data.brand;
  await srv.request('POST', '/api/brands', { name: 'Kahve Evi' });
  await srv.request('POST', `/api/brands/${a.id}/ideas`, { title: 'Bayram çikolatası kampanyası', category: 'guncel' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + '/#/');
    await page.locator('.ops .welcome').waitFor();
    await page.keyboard.press('Control+k');
    const q = page.locator('#palette-q');
    await q.waitFor();
    assert.ok(await q.evaluate(el => el === document.activeElement), 'arama kutusu odakta');
    await page.keyboard.press('Escape');
    await page.locator('.palette').waitFor({ state: 'detached' });

    // Türkçe karaktersiz yazımla markaya geçiş
    await page.keyboard.press('Control+k');
    await q.fill('sekerci dukkani');
    await page.locator('.palette-item', { hasText: 'Şekerci Dükkânı' }).first().waitFor();
    await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp(`#/m/${a.id}$`));
    await page.locator('.bhome').waitFor(); // sayfa değişimi açık pencereleri kapatır; çizim bitmeden palet açılmasın

    // Açık markanın sayfası
    await page.keyboard.press('Control+k');
    await q.fill('kampanya kanvasi');
    await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp(`#/m/${a.id}/kampanya$`));
    await page.getByRole('heading', { name: 'Kampanya kanvası', level: 1 }).waitFor();

    // Genel arama: 2+ karakterde kayıtlar gelir, tıklayınca ilgili sayfa açılır
    await page.keyboard.press('Control+k');
    await q.fill('cikolata');
    const hit = page.locator('.palette-item', { hasText: 'Bayram çikolatası kampanyası' });
    await hit.waitFor();
    await hit.click();
    await page.waitForURL(new RegExp(`#/m/${a.id}/fikirler$`));

    // Açık bir form varken palet açılmaz
    await page.goto(srv.base + '/#/notlar');
    await page.locator('#quick-note').waitFor();
    await page.evaluate(async () => { const { openModal } = await import('/js/ui.js'); openModal({ title: 'Deneme', body: '<p>x</p>', onSubmit: async () => {} }); });
    await page.locator('.modal-backdrop').waitFor();
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.palette').count(), 0);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.32 aylık rapor: sayılar seçili aya göre, gelecek aya geçilmez, boş ay, yazdırmada menüler gizli', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Rapor' })).data.brand;
  const now = new Date();
  const at = d => new Date(now.getFullYear(), now.getMonth(), d, 12).toISOString();
  const mk = async (title, d, status, type = 'post') => (await srv.request('POST', '/api/contents', { brandId: a.id, title, type, status, scheduledAt: at(d) })).data.content;
  await mk('Yayınlanan 1', 2, 'yayinlandi');
  const pub2 = await mk('Yayınlanan 2', 3, 'yayinlandi', 'reels');
  await mk('Taslak', 4, 'taslak');
  await srv.request('PATCH', `/api/contents/${pub2.id}`, { metrics: { views: 1000, likes: 100 } });
  await srv.request('POST', `/api/brands/${a.id}/ideas`, { title: 'Bu ayın fikri', category: 'guncel' });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${a.id}/rapor`);
    const kpis = page.locator('.rep-kpis');
    await kpis.waitFor();
    const kv = async () => Object.fromEntries((await kpis.locator('div').evaluateAll(els => els.map(e => [e.querySelector('span').textContent, e.querySelector('b').textContent]))));
    const k = await kv();
    assert.equal(k['Planlanan'], '3');
    assert.equal(k['Yayınlanan'], '2');
    assert.equal(k['Yeni fikir'], '1');
    assert.equal(k['Ort. etkileşim'], '%10');
    assert.match(await page.locator('.rep-list').innerText(), /2 içerik yayınlandı/);
    assert.ok(await page.getByRole('button', { name: 'Sonraki ay' }).isDisabled(), 'gelecek aya geçilmez');
    // Önceki ay boş
    await page.getByRole('button', { name: 'Önceki ay' }).click();
    await page.locator('.rep-list', { hasText: 'Bu ay yayınlanan içerik yok' }).waitFor();
    assert.equal((await kv())['Planlanan'], '0');
    // Yazdırma görünümünde menüler gizlenir
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.sidebar').isVisible(), false);
    assert.equal(await page.locator('.rep-tools').isVisible(), false);
    assert.equal(await page.locator('.report').isVisible(), true);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.20 ilham rafı: yapıştırılan link/metin markaya kaydedilir, yazı alanında etkilenmez, marka dışında uyarı', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'İlham' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    // Marka dışında: kayıt yok, uyarı
    await page.goto(srv.base + '/#/');
    await page.locator('.ops .welcome').waitFor();
    await paste(page, 'https://ornek.com/x');
    await page.locator('.toast', { hasText: 'önce bir markanın çalışma alanına gir' }).waitFor();
    assert.equal((await srv.request('GET', '/api/notes')).data.notes.length, 0);

    await page.goto(srv.base + `/#/m/${a.id}`);
    await page.locator('.bhome').waitFor();
    await paste(page, 'https://www.ornek.com/ilham/sayfa');
    await page.locator('.toast', { hasText: 'Link ilham rafına eklendi' }).waitFor();
    await paste(page, 'Pastel tonlu sabah kahvesi fikri');
    await page.locator('.toast', { hasText: 'Metin ilham rafına eklendi' }).waitFor();
    let notes = (await srv.request('GET', '/api/notes')).data.notes;
    assert.equal(notes.length, 2);
    assert.ok(notes.every(n => n.category === 'İlham' && n.brandId === a.id));
    assert.ok(notes.some(n => n.title === 'ornek.com/ilham/sayfa'));

    // Yazı alanında yapıştırma ilham rafına gitmez
    await page.goto(srv.base + '/#/notlar');
    await page.getByLabel('Not', { exact: true }).focus();
    await page.evaluate(() => {
      const dt = new DataTransfer(); dt.setData('text/plain', 'yazı alanına');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    notes = (await srv.request('GET', '/api/notes')).data.notes;
    assert.equal(notes.length, 2);
    // API inspiration kategorisini kabul eder
    assert.equal((await srv.request('POST', `/api/brands/${a.id}/assets?category=inspiration`, PNG_1PX, { 'Content-Type': 'image/png' })).status, 201);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.18 ızgara önizlemesi: en yeni sol üstte, taslak kutusu ve tercihin hatırlanması, boş durum, hücreden tasarıma', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Izgara' })).data.brand;
  const b = (await srv.request('POST', '/api/brands', { name: 'Başka' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${a.id}/post/izgara`);
    await page.locator('.ig-phone').waitFor();
    assert.match(await page.locator('.ig-phone').innerText(), /Izgarada gösterilecek gönderi yok/);

    const day = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString(); };
    const p1 = (await srv.request('POST', `/api/brands/${a.id}/posts`, { blank: true, kind: 'post', title: 'Eski post' })).data.post;
    const p2 = (await srv.request('POST', `/api/brands/${a.id}/posts`, { blank: true, kind: 'post', title: 'Yeni post' })).data.post;
    await srv.request('POST', `/api/brands/${a.id}/posts`, { blank: true, kind: 'post', title: 'Takvimsiz taslak' });
    await srv.request('POST', `/api/brands/${a.id}/posts/${p1.id}/schedule`, { scheduledAt: day(1) });
    await srv.request('POST', `/api/brands/${a.id}/posts/${p2.id}/schedule`, { scheduledAt: day(5) });
    const bp = (await srv.request('POST', `/api/brands/${b.id}/posts`, { blank: true, kind: 'post', title: 'B postu' })).data.post;
    await srv.request('POST', `/api/brands/${b.id}/posts/${bp.id}/schedule`, { scheduledAt: day(2) });

    await page.reload();
    await page.locator('.ig-cell').nth(1).waitFor();
    const titles = async () => page.locator('.ig-cell').evaluateAll(els => els.map(e => e.getAttribute('title').split(' · ')[0]));
    assert.deepEqual(await titles(), ['Yeni post', 'Eski post'], 'en yeni sol üstte; başka markanın içeriği yok');
    await page.locator('#gr-drafts').check();
    await page.locator('.ig-cell.is-draft').waitFor();
    assert.deepEqual(await titles(), ['Takvimsiz taslak', 'Yeni post', 'Eski post']);
    await page.reload();
    await page.locator('.ig-cell.is-draft').waitFor();
    assert.ok(await page.locator('#gr-drafts').isChecked(), 'taslak tercihi hatırlanır');
    await page.locator('.ig-cell', { hasText: '' }).first().click();
    await page.waitForURL(/\/post\/[A-Za-z0-9-]{8,}$/);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.2 asistan arayüzü: işlem kartları ve bağlantıları, başarısız işlemin görünümü', { skip }, async () => {
  const { fakeProvider } = await import('./helpers.js');
  const provider = fakeProvider([{ reply: 'Üçünü de denedim.', actions: [
    { type: 'add_task', title: 'Çekim günü planla', dueDate: '2026-12-01' },
    { type: 'plan_content', items: [{ title: 'Kış menüsü reels', type: 'reels', date: '2026-12-05', time: '18:30' }] },
    { type: 'update_idea', id: 'olmayan-fikir', title: 'x' }
  ] }]);
  const srv = await startServer({ aiProvider: provider });
  const a = (await srv.request('POST', '/api/brands', { name: 'Asistanlı' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${a.id}`);
    const input = page.locator('#chat-input');
    await input.waitFor();
    await input.fill('Görev ekle, takvime koy ve fikri güncelle');
    await input.press('Enter');
    const msg = page.locator('.msg-assistant', { hasText: 'Üçünü de denedim.' });
    await msg.waitFor();
    const cards = msg.locator('.msg-actions');
    assert.equal(await cards.count(), 3);
    assert.match(await cards.nth(0).innerText(), /Görev eklendi: Çekim günü planla[\s\S]*son tarih 2026-12-01/);
    assert.equal(await cards.nth(0).locator('a').getAttribute('href'), '#/gorevler');
    assert.match(await cards.nth(1).innerText(), /1 içerik takvime eklendi[\s\S]*Kış menüsü reels/);
    assert.equal(await cards.nth(1).locator('a').getAttribute('href'), `#/m/${a.id}/takvim`);
    // Başarısız işlem açıkça hata olarak görünür, nedeniyle
    assert.equal(await cards.nth(2).locator('.act-fail').count(), 1);
    assert.match(await cards.nth(2).innerText(), /Fikir güncellenemedi/);
    assert.ok((await cards.nth(2).locator('.small').innerText()).length > 0, 'hata nedeni yazılmalı');
    // Kartlar sohbet geçmişinde kalır
    await page.reload();
    await page.locator('.msg-assistant .act-fail').waitFor();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.11 hatırlatmalar: özet sayıları ve zil rozeti, şerit günde bir kez, bildirim içerik başına bir kez, görev hatırlatması', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Hatırlatma' })).data.brand;
  const now = new Date(); now.setHours(10, 0, 0, 0);
  const at = (h, m = 0, dayOffset = 0) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await srv.request('POST', '/api/contents', { brandId: a.id, title: 'Bugünkü post', type: 'post', scheduledAt: at(10, 10) });
  await srv.request('POST', '/api/contents', { brandId: a.id, title: 'Biten post', type: 'post', status: 'yayinlandi', scheduledAt: at(9, 0) });
  await srv.request('POST', '/api/contents', { brandId: a.id, title: 'Geciken post', type: 'post', scheduledAt: at(12, 0, -3) });
  await srv.request('POST', '/api/tasks', { title: 'Bugün biten görev', dueDate: iso(now) });
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  await srv.request('POST', '/api/tasks', { title: 'Geciken görev', dueDate: iso(yesterday) });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.grantPermissions(['notifications'], { origin: srv.base });
  await ctx.addInitScript(() => {
    window.__notes = JSON.parse(sessionStorage.getItem('__notes') || '[]');
    const N = function (title, opts) { window.__notes.push(title); sessionStorage.setItem('__notes', JSON.stringify(window.__notes)); this.close = () => {}; };
    N.permission = 'granted'; N.requestPermission = async () => 'granted';
    window.Notification = N;
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(now);
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  try {
    await page.goto(srv.base + '/#/');
    await page.evaluate(() => localStorage.setItem('ium.reminders', JSON.stringify({ summary: true, notify: true, tasks: true, sound: false })));
    await page.reload();
    // Zil: bugün bekleyen 1 + geciken içerik 1 + bugün biten görev 1 + geciken görev 1 = 4 (yayınlanan sayılmaz)
    await page.locator('.bell-badge').waitFor();
    assert.equal(await page.locator('.bell-badge').innerText(), '4');
    const strip = page.locator('.daily');
    await strip.waitFor();
    assert.match(await strip.innerText(), /1 içeriğin tarihi geçti/);
    assert.match(await strip.innerText(), /1 görevin son günü bugün/);
    // Bildirimler: 30 dk içindeki içerik ve iki görev, her biri bir kez
    await page.waitForFunction(() => window.__notes.length >= 3);
    let notes = await page.evaluate(() => window.__notes);
    assert.ok(notes.some(n => /Bugünkü post/.test(n)));
    assert.ok(notes.some(n => /Bugün son gün: Bugün biten görev/.test(n)));
    assert.ok(notes.some(n => /Geciken görev: Geciken görev/.test(n)));
    // Şerit kapatılınca aynı gün yeniden gelmez; bildirimler tekrarlanmaz
    await strip.locator('[data-daily-close]').click();
    await page.reload();
    await page.locator('.bell-badge').waitFor();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.daily').count(), 0);
    notes = await page.evaluate(() => window.__notes);
    assert.equal(notes.length, 3, 'bildirimler tekrar gönderilmemeli');
    // Özet penceresi
    await page.locator('#bell').click();
    await page.locator('.modal', { hasText: 'Bugünkü post' }).waitFor();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.29 marka sayfaları: akordeon gruplar ve tercihin hatırlanması, açık sayfanın grubu açık, asistan aç/kapat/Esc/tam ekran, marka değişince doğru sohbet', { skip }, async () => {
  const { fakeProvider } = await import('./helpers.js');
  const srv = await startServer({ aiProvider: fakeProvider([prompt => ({ reply: prompt.includes('Birinci') ? 'Birinci markanın yanıtı' : 'İkinci markanın yanıtı', actions: [] })]) });
  const a = (await srv.request('POST', '/api/brands', { name: 'Birinci' })).data.brand;
  const b = (await srv.request('POST', '/api/brands', { name: 'İkinci' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${a.id}/rakipler`);
    const group = g => page.locator(`[data-nav-group="${g}"]`);
    await group('arastirma').waitFor();
    assert.equal(await group('arastirma').getAttribute('aria-expanded'), 'true', 'açık sayfanın grubu açık');
    // Başka bir grubu kapat: tercih hatırlanır
    await group('varlik').click();
    assert.equal(await group('varlik').getAttribute('aria-expanded'), 'false');
    await page.reload();
    await group('varlik').waitFor();
    assert.equal(await group('varlik').getAttribute('aria-expanded'), 'false');
    // Kapalı gruptaki sayfaya gidilince o grup açılır
    await page.goto(srv.base + `/#/m/${a.id}/kutuphane`);
    await page.waitForFunction(() => document.querySelector('[data-nav-group="varlik"]').getAttribute('aria-expanded') === 'true');
    // Bütün modüllere menüden erişilir
    for (const href of ['', '/kimlik', '/fikirler', '/reels', '/post', '/prompt', '/takvim', '/arsiv', '/kampanya', '/youtube', '/rakipler', '/analiz', '/rapor', '/kutuphane', '/disa-aktar', '/video']) {
      assert.equal(await page.locator(`.sidebar a[href="#/m/${a.id}${href}"]`).count(), 1, `menüde ${href || 'ana sayfa'} yok`);
    }

    // Asistan: ana sayfa dışında sağ altta; aç, mesaj, Esc ile kapanır; tam ekran
    const fab = page.locator('.ai-fab');
    const panel = page.locator('.ai-panel');
    await page.goto(srv.base + `/#/m/${a.id}/fikirler`);
    await fab.waitFor();
    if (await panel.isVisible()) await fab.click();
    await fab.click();
    await panel.waitFor();
    await page.locator('#chat-input').fill('Merhaba');
    await page.locator('#chat-input').press('Enter');
    await page.locator('.msg-assistant', { hasText: 'Birinci markanın yanıtı' }).waitFor();
    await page.locator('[data-ai-full]').click();
    assert.ok(await page.locator('.ai-full').count(), 'tam ekran');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ai-full').count(), 0);
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    // Marka değişince o markanın sohbeti
    await page.goto(srv.base + `/#/m/${b.id}/fikirler`);
    await fab.waitFor();
    if (!(await panel.isVisible())) await fab.click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.msg-assistant', { hasText: 'Birinci markanın yanıtı' }).count(), 0, 'diğer markanın sohbeti görünmemeli');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.22 çöp kutusu arayüzü: silince "Geri al" bildirimi, geri alınca kayıt döner; Çöp kutusu sayfasında geri al ve kalıcı sil', { skip }, async () => {
  const srv = await startServer();
  const task = (await srv.request('POST', '/api/tasks', { title: 'Silinip dönecek görev' })).data.task;
  const note = (await srv.request('POST', '/api/notes', { title: 'Çöpe gidecek not', body: 'x' })).data.note;
  const note2 = (await srv.request('POST', '/api/notes', { title: 'Kalıcı silinecek not', body: 'y' })).data.note;
  const { browser, page, problems } = await open(srv);
  page.on('dialog', d => d.accept());
  try {
    await page.goto(srv.base + '/#/gorevler');
    await page.locator('.task-row', { hasText: 'Silinip dönecek görev' }).waitFor();
    await page.evaluate(async id => { const { api } = await import('/js/api.js'); await api.deleteTask(id); }, task.id);
    const undo = page.locator('.toast', { hasText: 'Çöp kutusuna taşındı' }).getByRole('button', { name: 'Geri al' });
    await undo.click();
    await page.locator('.toast', { hasText: 'Geri alındı' }).waitFor();
    await page.locator('.task-row', { hasText: 'Silinip dönecek görev' }).waitFor();

    await page.evaluate(async ids => { const { api } = await import('/js/api.js'); for (const id of ids) await api.deleteNote(id); }, [note.id, note2.id]);
    await page.goto(srv.base + '/#/cop');
    await page.getByText('Çöpe gidecek not').waitFor();
    // Geri al
    const items = (await srv.request('GET', '/api/trash')).data.items;
    const tNote = items.find(i => i.title === 'Çöpe gidecek not');
    await page.locator(`[data-restore="${tNote.id}"]`).click();
    await page.locator('.toast', { hasText: 'Geri alındı: Çöpe gidecek not' }).waitFor();
    assert.ok((await srv.request('GET', '/api/notes')).data.notes.some(n => n.id === note.id));
    // Kalıcı sil
    const tNote2 = items.find(i => i.title === 'Kalıcı silinecek not');
    await page.locator(`[data-purge="${tNote2.id}"]`).click();
    await page.waitForFunction(() => !document.body.innerText.includes('Kalıcı silinecek not'));
    assert.equal((await srv.request('GET', '/api/trash')).data.items.length, 0);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.30 efektler: görev tamamlamada konfeti ve ses, geri almada yok, ses kapalıyken ses yok, hareketi azalt tercihinde konfeti yok', { skip }, async () => {
  const srv = await startServer();
  for (const t of ['Bir', 'İki', 'Üç']) await srv.request('POST', '/api/tasks', { title: 'Görev ' + t });
  const browser = await chromium.launch();
  try {
    for (const reduced of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await ctx.addInitScript(() => {
        window.__osc = 0;
        const node = () => ({ connect: x => x, start() {}, stop() {}, type: '', frequency: { value: 0 }, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } });
        window.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {}; } createOscillator() { window.__osc++; return node(); } createGain() { return node(); } };
      });
      const page = await ctx.newPage();
      await page.goto(srv.base + '/#/gorevler');
      const toggle = t => page.locator('.task-row', { hasText: t }).locator('[data-toggle]');
      await toggle('Görev Bir').waitFor();
      await page.evaluate(() => { new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(n => { if (n.classList && n.classList.contains('fx-confetti')) window.__confetti = (window.__confetti || 0) + 1; }))).observe(document.body, { childList: true, subtree: true }); });
      await toggle('Görev Bir').click();
      await page.waitForTimeout(200);
      const c1 = await page.evaluate(() => window.__confetti || 0);
      const o1 = await page.evaluate(() => window.__osc);
      if (reduced) assert.equal(c1, 0, 'hareketi azalt tercihinde konfeti yok');
      else { assert.equal(c1, 1, 'tamamlamada konfeti'); assert.ok(o1 > 0, 'tamamlamada ses'); }
      if (!reduced) {
        // Geri alma (tamamlanmadı yapma) kutlanmaz
        await page.getByRole('button', { name: /Tamamlanan görevler/ }).click();
        const undo = page.locator('.task-row', { hasText: 'Görev Bir' }).locator('[data-toggle].on');
        await undo.click();
        await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => window.__confetti || 0), 1, 'geri almada konfeti yok');
        // Ses kapalı: tamamlamada ses çalmaz
        await page.evaluate(() => localStorage.setItem('ium.reminders', JSON.stringify({ sound: false })));
        const before = await page.evaluate(() => window.__osc);
        await toggle('Görev İki').click();
        await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => window.__osc), before, 'ses kapalıyken ses çalmamalı');
        assert.equal(await page.evaluate(() => window.__confetti || 0), 2, 'konfeti ses tercihinden bağımsız');
      }
      await ctx.close();
    }
  } finally { await browser.close(); await srv.stop(); }
});

test('T.28 Çalışma masası düzeni: 30 görev/not ile sayfa uzamaz, üç kart üst/alt hizalı (haftalık ve aylık), #/takvim aylık açar, tablette alt alta', { skip }, async () => {
  const srv = await startServer();
  await srv.request('POST', '/api/brands/demo');
  for (let i = 0; i < 30; i++) { await srv.request('POST', '/api/tasks', { title: 'Görev ' + i }); await srv.request('POST', '/api/notes', { title: 'Not ' + i, body: 'Not gövdesi ' + i }); }
  const { browser, page, problems } = await open(srv, { width: 1440, height: 900 });
  try {
    const edges = () => page.evaluate(() => ['#desk-tasks', '.desk-cal-card', '#desk-notes'].map(s => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; }));
    // Günün özeti şeridi geç gelebilir ve sayfayı uzatır; bu testte kapalı (şerit T.11'de test ediliyor)
    await page.goto(srv.base + '/#/masa');
    await page.evaluate(() => localStorage.setItem('ium.reminders', JSON.stringify({ summary: false })));
    await page.reload();
    await page.locator('#desk-notes .w-scroll').waitFor();
    await page.locator('[data-mode="hafta"]').click();
    await page.waitForTimeout(400);
    for (const mode of ['hafta', 'ay']) {
      await page.locator(`[data-mode="${mode}"]`).click();
      await page.waitForTimeout(500);
      const e = await edges();
      assert.ok(Math.abs(e[0][0] - e[1][0]) <= 1 && Math.abs(e[1][0] - e[2][0]) <= 1, `${mode}: üst hizalar ${JSON.stringify(e)}`);
      assert.ok(Math.abs(e[0][1] - e[1][1]) <= 1 && Math.abs(e[1][1] - e[2][1]) <= 1, `${mode}: alt hizalar ${JSON.stringify(e)}`);
      const h = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);
      assert.ok(h[0] <= h[1] + 2, `${mode}: 30 görev/notla sayfa uzamamalı ${h}`);
    }
    // Kolonlar bağımsız kayar; not ekleme alanı görünür kalır
    await page.locator('#desk-notes .w-scroll').evaluate(e => { e.scrollTop = 5000; });
    assert.ok(await page.locator('#wn-quick').isVisible());
    assert.ok(await page.locator('#desk-tasks .w-scroll').evaluate(e => e.scrollHeight > e.clientHeight), 'görev kolonu kendi içinde kayar');
    // #/takvim aylık görünümle açılır
    await page.goto(srv.base + '/#/takvim');
    await page.locator('.cal-cell').first().waitFor();
    // Tablet: kartlar alt alta
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.goto(srv.base + '/#/masa');
    await page.locator('#desk-notes').waitFor();
    await page.waitForTimeout(400);
    const e = await edges();
    assert.ok(e[1][0] >= e[0][1] - 1 || e[0][0] >= e[1][1] - 1, `tablette alt alta ${JSON.stringify(e)}`);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.23 dışa aktarma: kırpma ve boyut, JPEG\'de saydam zemin beyaz, ayar değişince yeniden işleme, PNG\'de kalite kapalı, ZIP geçerli ve aynı adlar numaralı', { skip }, async () => {
  const fs = await import('node:fs');
  const { readZip } = await import('../server/lib/zip.js');
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Dışa' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + `/#/m/${a.id}/disa-aktar`);
    await page.getByRole('button', { name: 'Bilgisayardan' }).click();
    // Tarayıcıda iki saydam PNG üret (300×200 ve 600×400, aynı ad)
    const pngs = await page.evaluate(() => [[300, 200], [600, 400]].map(([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = 'rgba(255,0,0,1)'; x.fillRect(0, 0, 10, 10); return c.toDataURL('image/png').split(',')[1]; }));
    await page.locator('#exp-file').setInputFiles(pngs.map(b => ({ name: 'kapak.png', mimeType: 'image/png', buffer: Buffer.from(b, 'base64') })));
    const rows = page.locator('.exp-row');
    await page.waitForFunction(() => document.querySelectorAll('.exp-row [data-dl]').length === 2);
    // Varsayılan: 4:5, en fazla 1080, JPEG
    assert.match(await rows.nth(0).innerText(), /160×200/);
    assert.match(await rows.nth(1).innerText(), /320×400/);
    // JPEG'de saydam alan beyaz olur (sol üst kırmızı kare kırpılan bölgede değil; orta piksel)
    const px = await page.evaluate(async () => {
      const img = document.querySelector('.exp-row .exp-prev img');
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      return [...x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data];
    });
    assert.ok(px[0] > 245 && px[1] > 245 && px[2] > 245 && px[3] === 255, `saydam zemin beyaz olmalı: ${px}`);
    // Ayar değişince yeniden işlenir: 16:9 ve en fazla 720
    await page.locator('#ex-ratio').selectOption('16:9');
    await page.waitForFunction(() => /300×169/.test(document.querySelector('.exp-row').innerText));
    await page.locator('#ex-width').selectOption('720');
    await page.locator('#ex-type').selectOption('image/png');
    await page.waitForFunction(() => /600×338/.test(document.querySelectorAll('.exp-row')[1].innerText) && document.querySelectorAll('.exp-row [data-dl]').length === 2);
    assert.ok(await page.locator('#ex-q').isDisabled(), 'PNG kayıpsız: kalite kapalı');
    // ZIP: çıktılar güncel ayarla hazır değilse indirme başlamaz ("hâlâ hazırlanıyor"); hazır olana kadar yeniden dene
    let download = null;
    for (let k = 0; k < 20 && !download; k++) {
      const wait = page.waitForEvent('download', { timeout: 1000 }).catch(() => null);
      await page.locator('[data-zip]').click();
      download = await wait;
    }
    assert.ok(download, 'ZIP indirilemedi');
    const file = await download.path();
    const entries = readZip(fs.readFileSync(file));
    assert.deepEqual(entries.map(e => e.name).sort(), ['kapak_16x9.png', 'kapak_16x9_2.png']);
    assert.ok(entries.every(e => Buffer.from(e.data).subarray(1, 4).toString() === 'PNG'), 'arşivdeki dosyalar PNG');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('T.24 sol menü ve Yönetim Merkezi: kaydırınca menü yerinde ve tam boy, alt kart en altta, haftalık sayılar, eski adresler yönlenir', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Menü' })).data.brand;
  for (let i = 0; i < 12; i++) await srv.request('POST', '/api/contents', { brandId: a.id, title: 'İçerik ' + i, type: 'post', scheduledAt: new Date(Date.now() + i * 3600e3).toISOString() });
  for (let i = 0; i < 25; i++) await srv.request('POST', '/api/notes', { title: 'Uzun not ' + i, body: 'x '.repeat(200) });
  const { browser, page, problems } = await open(srv, { width: 1440, height: 700 });
  try {
    // Uzun bir sayfa (Notlar) kaydırılınca menü yerinde kalır ve ekran boyundadır
    await page.goto(srv.base + '/#/notlar');
    await page.locator('.note-card').nth(20).waitFor();
    const box = () => page.locator('.sidebar').boundingBox();
    const before = await box();
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => scrollY > 500), 'sayfa kaydı');
    const after = await box();
    assert.ok(Math.abs(after.y - before.y) <= 1, `menü yerinde kalmalı (${before.y} → ${after.y})`);
    assert.ok(after.y + after.height <= 700 + 1 && after.height >= 700 - 2 * 40, 'menü ekran boyunda');
    const foot = await page.locator('.sidebar-foot').boundingBox();
    assert.ok(foot.y + foot.height <= after.y + after.height + 1 && foot.y + foot.height >= after.y + after.height - 60, 'alt kart menünün en altında');

    // Yönetim Merkezi: Bu hafta çipleri gerçek sayılarla
    await page.goto(srv.base + '/#/');
    await page.locator('.w-side .wc.c1').waitFor();
    assert.equal(await page.locator('.w-side .wc.c1 b').innerText(), '12', 'bu hafta 12 içerik üretildi');
    assert.equal(await page.locator('.w-bars .wb').count(), 7, 'haftalık şeritte 7 gün');

    // Eski adresler yeni çalışma alanına yönlenir
    await page.goto(srv.base + `/#/marka/${a.id}`);
    await page.waitForURL(new RegExp(`#/m/${a.id}/kimlik$`));
    await page.goto(srv.base + `/#/marka/${a.id}/varliklar`);
    await page.waitForURL(new RegExp(`#/m/${a.id}/kutuphane$`));
    await page.goto(srv.base + `/#/marka/${a.id}/gorsel`);
    await page.waitForURL(new RegExp(`#/m/${a.id}/kimlik/gorsel$`));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('hızlı sayfa geçişi: önceki sayfanın geç biten çizimi yeni sayfanın üstüne yazmaz', { skip }, async () => {
  const srv = await startServer();
  const a = (await srv.request('POST', '/api/brands', { name: 'Yavaş' })).data.brand;
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + '/#/');
    await page.locator('.ops .welcome').waitFor();
    // Fikirler sayfasının verisi 1,5 sn gecikir; bu sırada Notlar'a geçilir
    await page.route(`**/api/brands/${a.id}/ideas*`, async r => { await new Promise(x => setTimeout(x, 1500)); await r.continue(); });
    await page.evaluate(id => { location.hash = `#/m/${id}/fikirler`; }, a.id);
    await page.waitForTimeout(200);
    await page.evaluate(() => { location.hash = '#/notlar'; });
    await page.locator('#quick-note').waitFor();
    await page.waitForTimeout(2000);
    assert.ok(await page.locator('#quick-note').isVisible(), 'Notlar sayfası yerinde kalmalı');
    assert.equal(await page.getByRole('heading', { name: 'İçerik fikirleri', level: 1 }).count(), 0);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});
