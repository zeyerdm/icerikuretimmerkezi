// Tarayıcı testleri: yönetim merkezi → marka çalışma alanı mimarisi, gerçek arayüzde uçtan uca.
// Playwright kurulu değilse atlanır (uygulamanın kendisi Playwright'a ihtiyaç duymaz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }
const skip = !chromium && 'Playwright yok';
const CENTER_COLOR = '#5b55e6';

async function open(srv, { width = 1400, height = 950 } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) problems.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  const cssVar = name => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  return { browser, page, problems, cssVar };
}
const isoDay = (days, hour = 12) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

test('ilk açılış: yönetim merkezi → marka oluştur → kimlik → kütüphane → asistan → fikirler', { skip }, async () => {
  const provider = fakeProvider([
    prompt => ({
      reply: prompt.includes('Kahve Durağı') ? 'İki fikir kaydettim.' : 'Yanlış marka!',
      actions: [{ type: 'save_ideas', ideas: [
        { title: 'Barista ipuçları', description: 'Evde süt köpürtme', category: 'egitici' },
        { title: 'Sabah kahvesi anketi', description: 'Takipçilere soru', category: 'eglenceli' }
      ] }]
    })
  ]);
  const srv = await startServer({ aiProvider: provider });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + '/');
    // Uygulama marka sayfasıyla değil yönetim merkeziyle açılır
    await page.getByRole('heading', { name: 'İlk markanı oluştur' }).waitFor();
    assert.ok(await page.getByRole('link', { name: 'İçerik Takvimi' }).isVisible());
    await page.getByLabel('Marka adı').fill('Kahve Durağı');
    await page.getByLabel('Sektör').fill('Kafe');
    await page.getByRole('button', { name: 'Oluştur' }).click();

    // Marka çalışma alanında dijital kimlik
    await page.getByRole('heading', { name: 'Kahve Durağı' }).waitFor();
    assert.match(page.url(), /#\/m\/[^/]+\/kimlik$/);
    assert.ok(await page.getByRole('link', { name: 'Yönetim Merkezine dön' }).isVisible());
    await page.getByLabel('Hedef kitle').fill('Üniversite öğrencileri');
    await page.getByLabel('Marka sloganı').fill('Her yudum bir mola');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.getByText('Tüm değişiklikler kayıtlı').waitFor();

    await page.getByRole('tab', { name: 'Görsel kimlik' }).click();
    assert.match(page.url(), /\/kimlik\/gorsel$/);
    await page.locator('[data-hex="primary"]').fill('#aa3300');
    await page.getByLabel('Başlık fontu').selectOption('Poppins');
    assert.equal(await page.locator('.pp-title').textContent(), 'Her yudum bir mola');
    // İlk kaydın bildirimi hâlâ ekranda olabilir: yeni bir bildirimin gelmesi beklenir
    const savedToasts = () => page.getByText('Marka kimliği kaydedildi.').count();
    const before = await savedToasts();
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.waitForFunction(n => [...document.querySelectorAll('.toast')].filter(t => t.textContent === 'Marka kimliği kaydedildi.').length > n, before);

    // Kütüphane (alt menüden)
    await page.getByRole('link', { name: 'Kütüphane' }).click();
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ium-ui-')), 'logo.png');
    fs.writeFileSync(tmp, PNG_1PX);
    await page.locator('#asset-file').setInputFiles(tmp);
    await page.getByText('1 dosya yüklendi.').waitFor();
    await page.locator('.asset').first().waitFor();

    // Marka ana sayfası: asistan fikirleri kaydeder
    await page.getByRole('link', { name: 'Marka ana sayfası' }).click();
    await page.locator('.hero h1').waitFor();
    assert.match(await page.locator('.hero h1').textContent(), /Kahve Durağı/);
    await page.locator('#chat-input').fill('Bu hafta için fikir üret');
    await page.locator('#chat-input').press('Enter');
    await page.getByText('İki fikir kaydettim.').waitFor();
    await page.getByText('✓ 2 fikir fikir havuzuna kaydedildi').waitFor();
    assert.ok(provider.calls[0].prompt.includes('Üniversite öğrencileri'), 'marka hafızası gönderilmedi');

    // Fikir havuzu sayfasında görünür, favorilenir
    await page.getByRole('link', { name: 'İçerik fikirleri' }).click();
    await page.locator('.idea-card').nth(1).waitFor();
    assert.equal(await page.locator('.idea-card').count(), 2);
    await page.locator('[data-fav]').first().click();
    await page.locator('.star.on').waitFor();

    // Yönetim merkezine dönüş: sayaçlar ve son çalışılan marka
    await page.getByRole('link', { name: 'Yönetim Merkezine dön' }).click();
    await page.locator('.kpi').first().waitFor();
    assert.equal((await page.locator('.kpi.k1 .kpi-num').textContent()).trim(), '1');
    assert.ok((await page.locator('.side-last').textContent()).includes('Kahve Durağı'));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('iki tasarım katmanı: yönetim merkezi sabit renkte, marka alanı kendi renginde; marka değiştirici', { skip }, async () => {
  const srv = await startServer();
  const { browser, page, problems, cssVar } = await open(srv);
  try {
    const dark = (await srv.request('POST', '/api/brands', { name: 'Koyu Marka', colors: { primary: '#1e3a8a' } })).data.brand;
    const light = (await srv.request('POST', '/api/brands', { name: 'Açık Marka', colors: { primary: '#fbbf24' } })).data.brand;
    await page.goto(srv.base + '/');
    await page.locator('.kpi').first().waitFor();
    assert.equal(await cssVar('--brand'), CENTER_COLOR, 'yönetim merkezi marka rengini aldı');

    await page.locator('#brand-switch').selectOption({ label: 'Koyu Marka' });
    await page.waitForFunction(() => location.hash.startsWith('#/m/'));
    await page.locator('.hero').waitFor();
    assert.equal(await cssVar('--brand'), '#1e3a8a');
    assert.equal(await cssVar('--on-brand'), '#ffffff');
    assert.ok((await page.locator('.crumbs').textContent()).includes('Koyu Marka'), 'konum çubuğunda marka yok');
    assert.ok(await page.locator('.nav-soon').first().isVisible(), 'yakında modülleri görünmüyor');

    // Takvimdeyken başka markaya geçince takvimde kalınır
    await page.getByRole('link', { name: 'Takvim' }).click();
    await page.locator('.cal-month').waitFor();
    await page.locator('#brand-switch').selectOption({ label: 'Açık Marka' });
    await page.waitForFunction(id => location.hash === `#/m/${id}/takvim`, light.id);
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() === '#fbbf24');
    assert.equal(await cssVar('--on-brand'), '#1b1f3b', 'açık markada yazı koyulaşmadı');

    // Yönetim merkezine dönünce tema sıfırlanır
    await page.locator('#brand-switch').selectOption('__center');
    await page.locator('.kpi').first().waitFor();
    assert.equal(await cssVar('--brand'), CENTER_COLOR);
    assert.ok(dark.id);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('içerik takvimi: boş güne tıklayıp planlama, düzenleme, haftalık görünüm, marka filtresi', { skip }, async () => {
  const srv = await startServer();
  const { browser, page, problems } = await open(srv);
  try {
    const a = (await srv.request('POST', '/api/brands', { name: 'Marka A', colors: { primary: '#aa0000' } })).data.brand;
    const b = (await srv.request('POST', '/api/brands', { name: 'Marka B' })).data.brand;
    await srv.request('POST', '/api/contents', { brandId: b.id, title: 'B içeriği', type: 'story', scheduledAt: isoDay(0, 9) });
    await page.goto(srv.base + '/#/takvim');
    await page.locator('.cal-month').waitFor();
    assert.equal(await page.locator('.cal-item').count(), 1);

    // Bugünün hücresine tıkla → pencere açılır, gün dolu gelir
    await page.locator('.cal-cell.today').click({ position: { x: 60, y: 90 } });
    await page.getByRole('dialog').waitFor();
    await page.getByLabel('Başlık *').fill('Kampanya postu');
    await page.locator('#c-brand').selectOption(a.id);
    await page.locator('#c-type').selectOption('post');
    await page.locator('#c-time').fill('15:30');
    await page.getByRole('button', { name: 'Planla', exact: true }).click();
    await page.locator('.cal-item', { hasText: 'Kampanya postu' }).waitFor();
    assert.match(await page.locator('.cal-item', { hasText: 'Kampanya postu' }).textContent(), /15:30/);

    // Düzenle: durum tamamlandı
    await page.locator('.cal-item', { hasText: 'Kampanya postu' }).click();
    await page.locator('#c-status').selectOption('tamamlandi');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.locator('.cal-item.status-tamamlandi').waitFor();

    // Marka filtresi
    await page.locator('#cal-brand').selectOption(b.id);
    await page.waitForFunction(() => document.querySelectorAll('.cal-item').length === 1);
    assert.ok((await page.locator('.cal-item').textContent()).includes('B içeriği'));

    // Haftalık görünüm
    await page.getByRole('tab', { name: 'Haftalık' }).click();
    await page.locator('.cal-week').waitFor();
    assert.equal(await page.locator('.cw-item').count(), 1);

    // Marka çalışma alanı takviminde yalnızca o marka; marka seçimi kilitli
    await page.goto(srv.base + `/#/m/${a.id}/takvim`);
    await page.locator('.cw-item, .cal-item').first().waitFor();
    assert.ok(!(await page.locator('#view').textContent()).includes('B içeriği'), 'başka markanın içeriği göründü');
    await page.locator('[data-new]').click();
    assert.ok(await page.locator('#c-brand').isDisabled());
    await page.getByRole('button', { name: 'Vazgeç' }).click();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('görevler ve notlar: hızlı ekleme, tamamlama, gecikme, sabitleme, arama', { skip }, async () => {
  const srv = await startServer();
  const { browser, page, problems } = await open(srv);
  try {
    await srv.request('POST', '/api/brands', { name: 'Marka A' });
    const yesterday = new Date(Date.now() - 86400000);
    const ymd = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    await srv.request('POST', '/api/tasks', { title: 'Geciken iş', dueDate: ymd, priority: 'yuksek' });

    await page.goto(srv.base + '/#/gorevler');
    await page.locator('.tg-title.gecikmis').waitFor();
    await page.getByLabel('Görev', { exact: true }).fill('Yeni görev');
    await page.getByLabel('Görev', { exact: true }).press('Enter');
    await page.locator('.task-row', { hasText: 'Yeni görev' }).waitFor();
    await page.locator('.task-row', { hasText: 'Geciken iş' }).locator('[data-toggle]').click();
    await page.getByRole('button', { name: /Tamamlanan görevler \(1\)/ }).waitFor();
    assert.equal(await page.locator('.tg-title.gecikmis').count(), 0);

    await page.goto(srv.base + '/#/notlar');
    await page.locator('#quick-note').waitFor();
    await page.getByLabel('Not', { exact: true }).fill('Kampanya renkleri turuncu olsun');
    await page.getByLabel('Kategori').first().fill('Marka');
    await page.getByRole('button', { name: 'Notu kaydet' }).click();
    await page.locator('.note-card', { hasText: 'turuncu' }).waitFor();
    await page.getByLabel('Not', { exact: true }).fill('Toplantı Salı 10:00');
    await page.getByRole('button', { name: 'Notu kaydet' }).click();
    await page.locator('.note-card', { hasText: 'Toplantı' }).waitFor();
    await page.locator('.note-card', { hasText: 'Toplantı' }).locator('[data-pin]').click();
    await page.locator('.note-card.pinned').waitFor();
    assert.ok((await page.locator('.note-card').first().textContent()).includes('Toplantı'), 'sabitlenen not üstte değil');
    await page.getByLabel('Notlarda ara').fill('turuncu');
    await page.waitForFunction(() => document.querySelectorAll('.note-card').length === 1);
    await page.getByLabel('Notlarda ara').fill('');
    await page.locator('[data-cat="Marka"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.note-card').length === 1);

    // Yönetim merkezinde sabit not ve açık görev görünür
    await page.goto(srv.base + '/');
    await page.locator('.note-chip', { hasText: 'Toplantı' }).waitFor();
    assert.ok((await page.locator('.task-mini').textContent()).includes('Yeni görev'));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('fikirden takvime ve arşive; analizler gerçek veriyle', { skip }, async () => {
  const srv = await startServer();
  const { browser, page, problems } = await open(srv);
  try {
    const brand = (await srv.request('POST', '/api/brands', { name: 'Marka A' })).data.brand;
    await page.goto(srv.base + `/#/m/${brand.id}/fikirler`);
    await page.getByLabel('Fikir başlığı').fill('Kampüs anketi');
    await page.getByRole('button', { name: 'Ekle' }).click();
    await page.locator('.idea-card', { hasText: 'Kampüs anketi' }).waitFor();
    await page.locator('[data-plan]').click();
    assert.equal(await page.getByLabel('Başlık *').inputValue(), 'Kampüs anketi');
    await page.getByRole('button', { name: 'Planla', exact: true }).click();
    await page.getByText('Takvime eklendi.').waitFor();

    await page.getByRole('link', { name: 'Arşiv' }).click();
    await page.locator('.table tbody tr').first().waitFor();
    assert.ok((await page.locator('.table').textContent()).includes('Kampüs anketi'));

    await page.getByRole('link', { name: 'Analizler' }).click();
    await page.locator('.metric').first().waitFor();
    assert.ok((await page.locator('.metric').nth(4).textContent()).includes('1'), 'fikir sayısı yanlış');
    assert.equal(await page.locator('.col-chart').count(), 2, 'grafikler çizilmedi');

    // Yönetim merkezi sayaçları
    await page.goto(srv.base + '/');
    await page.locator('.kpi').first().waitFor();
    assert.equal((await page.locator('.kpi.k2 .kpi-num').textContent()).trim(), '1');
    assert.equal((await page.locator('.kpi.k5 .kpi-num').textContent()).trim(), '1');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('örnek markayla keşfet: rehber, takvim içerikleri, görevler, asistan', { skip }, async () => {
  const provider = fakeProvider([{ reply: 'Üç fikir kaydettim.', actions: [{ type: 'save_ideas', ideas: [{ title: 'Gece kütüphanesi kahvesi', category: 'eglenceli' }] }] }]);
  const srv = await startServer({ aiProvider: provider });
  const { browser, page, problems } = await open(srv);
  try {
    await page.goto(srv.base + '/');
    await page.getByRole('button', { name: '☕ Örnek markayla keşfet' }).click();
    await page.getByRole('heading', { name: '🧭 Örnek marka: nasıl kullanılır?' }).waitFor();
    assert.ok((await page.locator('.side-brand').textContent()).includes('%100'));
    await page.getByRole('link', { name: 'Kütüphane', exact: true }).first().click();
    await page.getByRole('button', { name: 'Maskot pozu' }).click();
    await page.locator('.asset').nth(2).waitFor();
    await page.getByRole('link', { name: 'Marka ana sayfası' }).click();
    await page.getByRole('button', { name: 'Dene' }).click();
    await page.getByText('Üç fikir kaydettim.').waitFor();

    await page.getByRole('link', { name: 'Yönetim Merkezine dön' }).click();
    await page.locator('.ag-item').first().waitFor();
    assert.ok(await page.locator('.ag-item').count() >= 2, 'yaklaşan içerikler boş');
    assert.equal((await page.locator('.kpi.k2 .kpi-num').textContent()).trim(), '7');
    assert.ok((await page.locator('.brand-card').textContent()).includes('Örnek'));
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('AI bağlı değilken asistan kapalı; ayarlarda güncelleme kartı', { skip }, async () => {
  const sha = 'd'.repeat(40);
  const srv = await startServer({ updateFetch: async () => new Response(sha, { status: 200 }) });
  const { browser, page, problems } = await open(srv);
  try {
    const brand = (await srv.request('POST', '/api/brands', { name: 'Anahtarsız' })).data.brand;
    await page.goto(srv.base + '/#/m/' + brand.id);
    await page.getByText('AI bağlı değil.').waitFor();
    assert.ok(await page.locator('#chat-input').isDisabled());
    await page.getByRole('link', { name: 'Ayarlara git' }).click();
    await page.getByLabel('Gemini API anahtarı').waitFor();
    assert.match(await page.locator('#app-version').textContent(), /^Sürüm 0\.1\.0/);
    await page.getByRole('button', { name: 'Güncellemeleri kontrol et' }).click();
    await page.getByText('Yeni sürüm var').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Güncelle ve yeniden başlat' }).isVisible(), false, 'başlatıcı yokken güncelle düğmesi göründü');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('ayarlar → yedekler: yedek al, listede gör, değişikliği geri yükleyerek geri al, dosyadan geri yükle', { skip }, async () => {
  const srv = await startServer();
  const { browser, page, problems } = await open(srv);
  try {
    await srv.request('POST', '/api/brands', { name: 'Yedeklenen Marka' });
    await page.goto(srv.base + '/#/ayarlar');
    await page.getByRole('heading', { name: 'Yedekler' }).waitFor();
    await page.getByText('Henüz yedek yok').waitFor();
    await page.getByRole('button', { name: 'Şimdi yedek al' }).click();
    await page.locator('#backup-table tbody tr').first().waitFor();
    assert.equal(await page.locator('#backup-table tbody tr').count(), 1);
    assert.match(await page.locator('#backup-table').textContent(), /Elle alınan/);

    // Yedekten sonra marka silinir; geri yüklenince geri gelir
    const id = (await srv.request('GET', '/api/brands')).data.brands[0].id;
    await srv.request('DELETE', '/api/brands/' + id);
    await page.getByRole('button', { name: 'Geri yükle' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Geri yükle' }).click();
    await page.getByText('Geri yükleme tamamlandı.').waitFor();
    assert.match(await page.locator('#backup-result').textContent(), /1 marka/);
    assert.deepEqual((await srv.request('GET', '/api/brands')).data.brands.map(b => b.name), ['Yedeklenen Marka']);
    assert.match(await page.locator('#backup-table').textContent(), /Geri yükleme öncesi/);

    // İndirilen yedek dosyası, dosya seçiciyle geri yüklenebilir
    const name = (await srv.request('GET', '/api/backups')).data.backups.find(b => b.kind === 'elle').name;
    const zip = (await srv.request('GET', '/api/backups/' + name)).data;
    await srv.request('POST', '/api/brands', { name: 'Fazladan' });
    await page.locator('#backup-file').setInputFiles({ name: 'yedek.zip', mimeType: 'application/zip', buffer: zip });
    await page.getByRole('dialog').getByText('yedek.zip').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Geri yükle' }).click();
    await page.getByText('Geri yükleme tamamlandı.').waitFor();
    assert.deepEqual((await srv.request('GET', '/api/brands')).data.brands.map(b => b.name), ['Yedeklenen Marka']);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('telefon genişliği: yönetim merkezi, takvim ve marka alanında yatay taşma yok', { skip }, async () => {
  const srv = await startServer();
  await srv.request('POST', '/api/brands/demo');
  const { browser, page, problems } = await open(srv, { width: 390, height: 844 });
  try {
    const id = (await srv.request('GET', '/api/settings')).data.activeBrandId;
    for (const [hash, sel] of [['#/', '.kpi'], ['#/takvim', '.cal-month'], ['#/gorevler', '.task-row'], ['#/analizler', '.metric'], [`#/m/${id}`, '#chat-input'], [`#/m/${id}/arsiv`, '.table']]) {
      await page.goto(srv.base + '/' + hash);
      await page.locator(sel).first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${hash} dar ekranda yatay kaydırma var: ${overflow}`);
    }
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});
