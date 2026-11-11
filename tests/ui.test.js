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
    assert.ok(await page.getByRole('link', { name: 'Çalışma masası', exact: true }).isVisible());
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
    assert.equal((await page.locator('.w-side .kpi.k1 .kpi-num').textContent()).trim(), '1');
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
    assert.ok(await page.getByRole('link', { name: 'Prompt Studio' }).isVisible(), 'Prompt Studio menüde yok');

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
    // Adres değişince önceki sayfa bir an ekranda kalır: önce yeni sayfanın başlığı beklenir
    await page.getByRole('heading', { name: 'Takvim', exact: true }).waitFor();
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
    // Ana sayfada istatistik barı kalktı; karşılamadaki "Bu hafta" kutusunda aktif marka sayısı görünür
    assert.equal((await page.locator('.w-side .kpi.k1 .kpi-num').textContent()).trim(), '1');
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
    await page.getByRole('heading', { name: 'Örnek marka: nasıl kullanılır?' }).waitFor();
    assert.ok((await page.locator('.identity').textContent()).includes('100'), 'kimlik oranı ana sayfada yok');
    await page.getByRole('link', { name: 'Kütüphane', exact: true }).first().click();
    await page.getByRole('button', { name: 'Maskot pozu' }).click();
    await page.locator('.asset').nth(2).waitFor();
    await page.getByRole('link', { name: 'Marka ana sayfası' }).click();
    await page.getByRole('button', { name: 'Dene' }).click();
    await page.getByText('Üç fikir kaydettim.').waitFor();

    await page.getByRole('link', { name: 'Yönetim Merkezine dön' }).click();
    await page.locator('.ops .ag-item').first().waitFor();
    assert.ok(await page.locator('.ops .ag-item').count() >= 2, 'yaklaşan içerikler boş');
    assert.equal((await page.locator('.w-side .kpi.k1 .kpi-num').textContent()).trim(), '1');
    // Markalar ana sayfadan kalktı; Markalar sayfasında görünür
    await page.goto(srv.base + '/#/markalar');
    await page.locator('.brand-card').first().waitFor();
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
    await page.getByRole('link', { name: 'AI bağla' }).click();
    await page.locator('#key-anthropic').waitFor();
    assert.match(page.url(), /#\/ai\/modeller$/);
    await page.goto(srv.base + '/#/ayarlar');
    await page.getByRole('heading', { name: 'Güncelleme' }).waitFor();
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
    await page.locator('#backup-table').getByRole('button', { name: 'Geri yükle' }).first().click();
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

test('Google Drive: ayarlardan bağlan, markaya klasör linki ekle, test et, kütüphaneden gönder', { skip }, async () => {
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbUI_TEST_0123456789abcdef/exec';
  const FOLDER = '1UiTestKlasor0123456789abc';
  let key = null;
  const driveFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const ok = body.anahtar === key;
    const out = !ok ? { ok: false, hata: 'anahtar' }
      : body.islem === 'ping' ? { ok: true, surum: 1, klasorAdi: body.klasor ? 'Marka Postları' : 'Drive\'ım' }
      : { ok: true, surum: 1, id: 'f1', url: 'https://drive.google.com/file/d/f1/view' };
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  };
  const srv = await startServer({ driveFetch });
  const { browser, page, problems } = await open(srv);
  try {
    const brand = (await srv.request('POST', '/api/brands', { name: 'Drive Markası' })).data.brand;
    await srv.request('POST', `/api/brands/${brand.id}/assets?category=logo&label=Logo`, PNG_1PX, { 'Content-Type': 'image/png' });

    await page.goto(srv.base + '/#/ayarlar');
    await page.getByRole('heading', { name: 'Google Drive' }).waitFor();
    const script = await page.locator('#drive-script').textContent();
    key = script.match(/const ANAHTAR = '([0-9a-f]+)'/)[1];
    await page.getByLabel('Web uygulaması adresi').fill(SCRIPT_URL);
    await page.getByRole('button', { name: 'Bağlan', exact: true }).click();
    await page.getByText('Google Drive bağlandı.').waitFor();
    assert.match(await page.locator('#drive-card').textContent(), /Bağlı/);

    // Kütüphanede klasör yokken gönder düğmesi görünmez (işlevsiz düğme yok)
    await page.goto(srv.base + `/#/m/${brand.id}/kutuphane`);
    await page.locator('.asset').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Drive\'a gönder' }).count(), 0);

    await page.goto(srv.base + `/#/m/${brand.id}/kimlik`);
    await page.getByLabel('Google Drive klasörü').fill(`https://drive.google.com/drive/folders/${FOLDER}?usp=sharing`);
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.getByText('Tüm değişiklikler kayıtlı').waitFor();
    assert.equal(await page.getByLabel('Google Drive klasörü').inputValue(), `https://drive.google.com/drive/folders/${FOLDER}`);
    await page.getByRole('button', { name: 'Bağlantıyı test et' }).click();
    await page.getByText('Drive klasörüne erişildi: Marka Postları.').waitFor();

    await page.getByRole('link', { name: 'Kütüphane' }).click();
    await page.getByRole('button', { name: 'Drive\'a gönder' }).click();
    await page.getByRole('link', { name: '✓ Drive\'da' }).waitFor();
    assert.equal(await page.getByRole('link', { name: '✓ Drive\'da' }).getAttribute('href'), 'https://drive.google.com/file/d/f1/view');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('tasarım kuralları: düğme boyları, her sayfada aynı başlık yapısı, klavyeyle kullanım, pencere içi uyarılar', { skip }, async () => {
  const srv = await startServer();
  const { browser, page, problems } = await open(srv);
  try {
    const brand = (await srv.request('POST', '/api/brands/demo')).data.brand;
    const pages = ['#/markalar', '#/takvim', '#/gorevler', '#/notlar', '#/analizler', '#/ayarlar',
      `#/m/${brand.id}/kimlik`, `#/m/${brand.id}/fikirler`, `#/m/${brand.id}/takvim`, `#/m/${brand.id}/arsiv`, `#/m/${brand.id}/analiz`];
    for (const hash of pages) {
      await page.goto(srv.base + '/' + hash);
      await page.locator('.page-head h1').waitFor();
      // Her sayfada tek başlık yapısı: başlık + açıklama (+ işlemler)
      assert.equal(await page.locator('.page-head').count(), 1, hash + ': sayfa başlığı yok ya da birden fazla');
      assert.equal(await page.locator('.page-head .ph-text > p').count(), 1, hash + ': açıklama yok');
      // Düğmeler yalnızca iki boyda: 40 (normal) ve 32 (küçük)
      const heights = await page.locator('#view .btn:visible').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
      const odd = [...new Set(heights)].filter(h => h !== 40 && h !== 32);
      assert.deepEqual(odd, [], `${hash}: beklenmeyen düğme yüksekliği ${odd}`);
      // Sayfa başlığındaki birincil düğme sayısı en fazla bir
      assert.ok(await page.locator('.page-head .btn-primary').count() <= 1, hash + ': birden fazla birincil düğme');
    }

    // Takvim: gün hücresine klavyeyle gelip Enter ile içerik planlanır
    await page.goto(srv.base + '/#/takvim');
    const cell = page.locator('.cal-cell').nth(15);
    await cell.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    // Zorunlu alan boşken kaydedilmez; uyarı alanın altında görünür
    await page.getByLabel('Başlık *').fill('');
    await page.getByRole('dialog').getByRole('button', { name: 'Planla' }).click();
    await page.getByRole('dialog').getByText('Bu alan zorunlu.').waitFor();
    assert.equal(await page.getByLabel('Başlık *').getAttribute('aria-invalid'), 'true');
    // Tab odağı pencerenin içinde tutar
    for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => Boolean(document.activeElement.closest('.modal'))), 'odak pencereden çıktı');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);

    // Yüklenemeyen sayfa: anlaşılır hata ve "Tekrar dene"
    await page.route('**/api/tasks*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"Deneme hatası"}}' }), { times: 1 });
    await page.goto(srv.base + '/#/gorevler');
    await page.getByText('Deneme hatası').waitFor();
    await page.getByRole('button', { name: 'Tekrar dene' }).click();
    await page.getByRole('heading', { name: 'Görevler' }).waitFor();
    assert.deepEqual(problems.filter(p => !p.includes('500')), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('tablet genişliği: kenar çubuğu ikonlara iner, menü ögeleri erişilebilir adlıdır', { skip }, async () => {
  const srv = await startServer();
  const { browser, page, problems } = await open(srv, { width: 900, height: 1000 });
  try {
    await srv.request('POST', '/api/brands', { name: 'Tablet Markası' });
    await page.goto(srv.base + '/#/');
    await page.locator('.ops .welcome').waitFor();
    const w = await page.locator('.sidebar').evaluate(e => e.getBoundingClientRect().width);
    assert.ok(w < 100, 'kenar çubuğu daralmadı: ' + w);
    assert.ok(await page.getByRole('link', { name: 'Çalışma masası', exact: true }).isVisible());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, 'yatay taşma: ' + overflow);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('yapay zekâ: sağlayıcı bağla, işe model ata, iki modeli karşılaştır, kazananı seç, harcamayı gör', { skip }, async () => {
  const KEY_A = 'sk-ant-UI-0123456789abcdefghijklmnop';
  const KEY_O = 'sk-or-UI-0123456789abcdefghijklmnopq';
  const js = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    const h = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    if (u.host === 'api.anthropic.com') {
      if (h.get('authorization') !== `Bearer ${KEY_A}` && h.get('x-api-key') !== KEY_A) return js({ type: 'error', error: { type: 'authentication_error', message: 'x' } }, 401);
      if (u.pathname === '/v1/models') return js({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }, { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }], has_more: false });
      return js({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'Sahne 1 (0-3 sn): Kahve fincanı yakın plan.' }], stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 1500 } });
    }
    if (u.host === 'openrouter.ai') {
      if (h.get('authorization') !== `Bearer ${KEY_O}`) return js({ error: { message: 'x' } }, 401);
      if (u.pathname === '/api/v1/models') return js({ data: [{ id: 'meta-llama/llama-5', name: 'Llama 5', pricing: { prompt: '0.0000003', completion: '0.0000006' } }] });
      return js({ model: body.model, choices: [{ message: { content: 'Llama senaryosu' } }], usage: { prompt_tokens: 100, completion_tokens: 100, cost: 0.002 } });
    }
    return js({}, 404);
  };
  const srv = await startServer({ fetchImpl });
  const { browser, page, problems } = await open(srv);
  try {
    await srv.request('POST', '/api/brands', { name: 'Kahve Evi' });
    await page.goto(srv.base + '/#/ai');
    await page.getByRole('heading', { name: 'Önce bir yapay zekâ sağlayıcısı bağla' }).waitFor();
    await page.getByRole('link', { name: 'Sağlayıcı bağla' }).click();

    // Yanlış anahtar kaydedilmez; doğru anahtarla bağlanır
    await page.locator('#key-anthropic').fill('sk-ant-YANLIS-0123456789abcdefghijk');
    await page.locator('[data-provider="anthropic"]').getByRole('button', { name: 'Bağlan' }).click();
    await page.getByText('Claude anahtarı reddedildi').waitFor();
    await page.locator('#key-anthropic').fill(KEY_A);
    await page.locator('[data-provider="anthropic"]').getByRole('button', { name: 'Bağlan' }).click();
    await page.locator('[data-provider="anthropic"]').getByText('Bağlı', { exact: true }).waitFor();
    await page.locator('#key-openrouter').fill(KEY_O);
    await page.locator('[data-provider="openrouter"]').getByRole('button', { name: 'Bağlan' }).click();
    await page.locator('[data-provider="openrouter"]').getByText('Bağlı', { exact: true }).waitFor();
    assert.match(await page.locator('.topbar').textContent(), /AI bağlı/);

    // İşe model ata: metin yazımına Opus, yedek OpenRouter Llama
    await page.locator('#tp-yazim').selectOption('anthropic:claude-opus-5-5');
    await page.locator('#tf-yazim').selectOption('openrouter:meta-llama/llama-5');
    await page.getByRole('button', { name: 'Atamaları kaydet' }).click();
    await page.getByText('Atamalar kaydedildi.').waitFor();
    const ov = (await srv.request('GET', '/api/ai')).data;
    const yazim = ov.tasks.find(t => t.id === 'yazim');
    assert.equal(yazim.primary, 'anthropic:claude-opus-5-5');
    assert.equal(yazim.fallback, 'openrouter:meta-llama/llama-5');

    // Karşılaştır: Claude Sonnet + OpenRouter Llama
    await page.getByRole('tab', { name: 'Karşılaştır' }).click();
    await page.locator('#cmp-brief').waitFor();
    await page.locator('#cmp-brief').fill('Sabah kahvesi kampanyası');
    // Varsayılan seçili iki Claude modelinden birini bırak, OpenRouter modelini ekle
    await page.locator('[data-pick="anthropic:claude-opus-5-5"]').click();
    await page.getByRole('button', { name: 'Başka model ekle' }).click();
    await page.locator('#cmp-extra').selectOption('openrouter:meta-llama/llama-5');
    await page.getByRole('button', { name: 'Karşılaştır', exact: true }).click();
    await page.getByText('Llama senaryosu').waitFor();
    await page.getByText('Sahne 1 (0-3 sn)').waitFor();
    await page.getByRole('button', { name: 'Bunu seçtim' }).first().click();
    await page.getByText('Seçtiğin', { exact: true }).first().waitFor();
    await page.locator('#cmp-history').getByText('Sabah kahvesi kampanyası').waitFor();

    // Harcama: karşılaştırmanın tutarı işlendi; sınır kaydedilir
    await page.getByRole('tab', { name: 'Harcama' }).click();
    await page.getByRole('heading', { name: 'Aylık sınır' }).waitFor();
    assert.match(await page.locator('.kpis').textContent(), /2 *AI çağrısı/);
    await page.locator('#b-limit').fill('5');
    await page.locator('#budget-form').getByRole('button', { name: 'Kaydet' }).click();
    await page.getByText('Sınır kaydedildi.').waitFor();
    assert.equal((await srv.request('GET', '/api/ai')).data.budget.monthlyUsd, 5);
    // Yanlış anahtar denemesinin 502 yanıtı beklenen bir durum
    assert.deepEqual(problems.filter(p => !p.includes('502')), []);
  } finally { await browser.close(); await srv.stop(); }
});

// Aşama 3 için sahte model: istemin türüne göre yanıt
function stage3Provider() {
  const sc = (o = {}) => Object.assign({ duration: 6, start: 'Kafede', endFrame: 'Fincan masada', beats: [{ from: 0, to: 3, action: 'Fincanı kaldırır', camera: 'Yakın', sound: '' }, { from: 3, to: 6, action: 'Güler', camera: 'Geniş', sound: '' }],
    line: 'Vize haftası geldi ama kahven hazır, sakin ol ve nefes al biraz', lineFrom: 0.5, lineTo: 6, flowScene: '0-3s: Kahveci lifts the cup. 3-6s: Kahveci laughs.', flowSceneTr: '0-3 sn: Kahveci fincanı kaldırır. 3-6 sn: Kahveci güler.' }, o);
  const RAW = { title: 'Vize kahvesi', format: 'skec', topic: 'Vize haftası', why: 'Herkes yaşar', punchline: 'Kahve her derdin ilacı', setting: 'Sıcak kafe', screenTitle: 'Vize haftası kahve molası', titleKeyword: 'kahve',
    scenes: [sc(), sc({ start: 'Devam' })], ending: { twist: 'Fincan göz kırpar', lastFrame: 'Logo' }, caption: 'Vize haftası açıklaması', hashtags: ['#vize'], music: 'Neşeli' };
  return fakeProvider([prompt => {
    if (prompt.startsWith('REELS FİKİR HAVUZU')) return { ideas: [{ text: 'AI fikri: kütüphane kahvesi', category: 'eglenceli' }] };
    if (prompt.startsWith('ÇEVİRİ GÖREVİ')) return '0-3s: Kahveci grabs the cup fast. 3-6s: Kahveci laughs.';
    if (prompt.startsWith('PROMPT STUDIO')) return prompt.includes('Prompt TÜRKÇE yazılır')
      ? { title: 'Kampüs koşusu', prompt: 'Neşeli kahve çekirdeği maskot gün doğumunda kampüste koşuyor' }
      : { title: 'Kampüs koşusu', prompt: 'A cheerful coffee bean mascot runs across campus at sunrise', promptTr: 'Neşeli kahve çekirdeği maskot gün doğumunda kampüste koşuyor' };
    if (prompt.startsWith('PROMPT ÇEVİRİSİ')) return { prompt: 'A cheerful coffee bean mascot runs across campus at sunrise' };
    if (prompt.startsWith('PROMPT GELİŞTİRME')) return prompt.includes('YALNIZCA şu bölümünü')
      ? { title: 'Kampüs koşusu', prompt: 'A cheerful coffee bean mascot runs across campus under neon lights at night', promptTr: 'Gece neon ışıklar altında' }
      : { title: 'Kampüs koşusu', prompt: 'Low angle drone shot: a cheerful coffee bean mascot runs across campus at sunrise', promptTr: 'Alt açıdan drone çekimi' };
    if (prompt.startsWith('İÇERİK DENETİMİ')) return { score: 80, summary: 'İyi', issues: [{ severity: 'düşük', problem: 'Emoji yok', suggestion: 'Bir emoji ekle' }], improved: 'Düzeltilmiş açıklama' };
    if (prompt.includes('Instagram içerik yazarısın')) return { title: 'Sınav ipuçları', slides: [{ title: 'Sınav haftası', body: 'Kahveyle odaklan' }, { title: 'Su iç', body: 'Beyin suyu sever' }, { title: 'Mola ver', body: '50 dakikada bir' }], caption: 'Açıklama', hashtags: ['#sinav'] };
    if (prompt.includes('YALNIZCA SAHNE 2')) return { ...RAW, scenes: [sc(), sc({ start: 'Yeni', line: 'İkinci sahne yepyeni bir replikle yeniden yazıldı ve akıcı biçimde söyleniyor' })] };
    return RAW;
  }]);
}

test('Reels: havuza fikir ekle, genişlet, senaryo yaz, tek sahneyi yeniden yaz, Türkçeyi düzeltip çevir, sürüme dön, telepromter, takvim', { skip }, async () => {
  const srv = await startServer({ aiProvider: stage3Provider() });
  const { browser, page, problems } = await open(srv);
  try {
    const brand = (await srv.request('POST', '/api/brands', { name: 'Kahve Evi' })).data.brand;
    await page.goto(srv.base + `/#/m/${brand.id}/reels`);
    await page.getByRole('heading', { name: 'Reels', exact: true }).waitFor();
    assert.ok(await page.getByRole('link', { name: 'Reels', exact: true }).isVisible(), 'menüde Reels yok');

    await page.getByRole('button', { name: 'Reels ayarları' }).click();
    await page.getByLabel('Konuşan karakterin adı *').fill('Kahveci');
    await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
    await page.getByText('Reels ayarları kaydedildi.').waitFor();

    await page.getByLabel('Fikir', { exact: true }).fill('Vize haftası kahve kuyruğu');
    await page.locator('#pool-add').getByRole('button', { name: 'Ekle' }).click();
    await page.locator('.pool-item').filter({ hasText: 'Vize haftası kahve kuyruğu' }).waitFor();
    await page.getByRole('button', { name: /Havuzu genişlet/ }).click();
    await page.getByText('AI fikri: kütüphane kahvesi').waitFor();
    await page.locator('.pool-item').filter({ hasText: 'AI fikri' }).getByRole('button', { name: 'Beğenme' }).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.pool-item').filter({ hasText: 'AI fikri' }).count(), 0, 'beğenilmeyen gizlenmedi');

    await page.locator('.pool-item').filter({ hasText: 'Vize haftası kahve kuyruğu' }).getByRole('button', { name: 'Senaryo yaz' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Senaryoyu yaz' }).click();
    await page.getByRole('heading', { name: 'Vize kahvesi' }).waitFor();
    assert.match(page.url(), /\/reels\/[0-9a-f-]{36}$/);
    await page.getByRole('heading', { name: /Sahne 2/ }).waitFor();
    assert.match(await page.locator('.reels-side').textContent(), /Sorun yok/);

    // Tek sahneyi yeniden yaz
    await page.locator('[data-scene="1"]').getByRole('button', { name: 'Bu sahneyi yeniden yaz' }).click();
    // Sürüm notu Sürümler panelinde; yeniden yazılan replik sahnede görünür
    await page.waitForFunction(() => document.querySelector('#line-1') && document.querySelector('#line-1').value.includes('yepyeni'));
    assert.equal(await page.locator('.version-list li').first().locator('.strong').textContent(), 'Sahne 2 yeniden yazıldı');
    assert.match(await page.locator('#line-1').inputValue(), /yepyeni/);

    // Türkçe tarifi düzelt → İngilizceye çevir
    await page.locator('[data-scene="0"] summary').filter({ hasText: 'Sahne tarifi' }).click();
    await page.locator('#tr-0').fill('0-3 sn: Kahveci fincanı hızla kapar. 3-6 sn: Kahveci güler.');
    await page.locator('[data-scene="0"]').getByRole('button', { name: 'Kaydet ve İngilizceye çevir' }).click();
    await page.getByText('Sahne tarifi kaydedildi.').waitFor();
    assert.match(await page.locator('[data-scene="0"]').textContent(), /grabs the cup fast/);

    // İlk sürüme dön
    await page.locator('.ed-rail').getByRole('button', { name: 'Sürümler' }).click();
    await page.locator('.version-list li').last().getByRole('button', { name: 'Geri dön' }).click();
    await page.getByText('Önceki sürüme dönüldü.').waitFor();
    assert.doesNotMatch(await page.locator('#line-1').inputValue(), /yepyeni/);

    // Açıklamayı denetle ve önerilen metni kullan
    await page.locator('.ed-rail').getByRole('button', { name: 'Açıklama' }).click();
    await page.locator('#rs-review').getByRole('button', { name: 'Denetle' }).click();
    await page.getByText('Puan: 80/100').waitFor();

    // Telepromter
    await page.getByRole('button', { name: 'Dışa aktar' }).click();
    await page.getByRole('button', { name: 'Telepromter' }).click();
    await page.getByRole('dialog', { name: 'Telepromter' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.prompter').count(), 0);

    // Altyazı indir
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Dışa aktar' }).click();
    await page.getByRole('button', { name: 'Altyazı indir (.srt)' }).click();
    assert.match((await dl).suggestedFilename(), /_altyazi\.srt$/);

    await page.getByRole('button', { name: 'Takvime ekle' }).click();
    await page.getByRole('link', { name: 'Takvimde' }).waitFor();
    const contents = (await srv.request('GET', `/api/contents?brandId=${brand.id}`)).data.contents;
    assert.equal(contents[0].type, 'reels');
    assert.ok(contents[0].reelsId);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('Post stüdyosu: konudan carousel üret, katman seç ve düzenle, slayt ekle, kaydet, PNG indir', { skip }, async () => {
  const srv = await startServer({ aiProvider: stage3Provider() });
  const { browser, page, problems } = await open(srv);
  try {
    const brand = (await srv.request('POST', '/api/brands', { name: 'Kahve Evi', colors: { primary: '#c2410c', secondary: [], backgrounds: ['#ffffff'], heading: '#1b1f3b', body: '#3a3f63' } })).data.brand;
    await srv.request('POST', `/api/brands/${brand.id}/assets?category=logo`, PNG_1PX, { 'Content-Type': 'image/png' });
    await page.goto(srv.base + `/#/m/${brand.id}/post`);
    await page.getByRole('heading', { name: 'Post stüdyosu' }).waitFor();
    await page.getByRole('button', { name: 'Konudan üret' }).first().click();
    await page.getByLabel('Konu *').fill('Sınav haftası ipuçları');
    await page.getByLabel('Slayt sayısı (carousel)').fill('3');
    await page.getByRole('dialog').getByRole('button', { name: 'Üret' }).click();
    await page.getByRole('heading', { name: 'Sınav ipuçları' }).waitFor();
    await page.locator('.slide-thumb').nth(2).waitFor();
    assert.equal(await page.locator('.slide-thumb').count(), 3);

    // Kapakta başlığa tıkla: başlık metni katmanı seçilir
    const stage = page.locator('#stage');
    const box = await stage.boundingBox();
    const k = box.width / 1080;
    await page.mouse.click(box.x + 200 * k, box.y + (1350 * 0.22 + 40) * k);
    await page.locator('#lp-text').waitFor();
    assert.equal(await page.locator('#lp-text').inputValue(), 'Sınav haftası');
    await page.locator('#lp-text').fill('Sınav haftası rehberi');
    // Sürükle: katman yer değiştirir
    await page.mouse.move(box.x + 200 * k, box.y + (1350 * 0.22 + 40) * k);
    await page.mouse.down();
    await page.mouse.move(box.x + 260 * k, box.y + (1350 * 0.22 + 100) * k, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#lp-x') && document.querySelector('#lp-x').value !== '90', null, { timeout: 5000 });

    await page.getByRole('button', { name: 'Slayt ekle' }).click();
    await page.locator('.slide-thumb').nth(3).waitFor();
    await page.getByRole('button', { name: 'Gövde metni ekle' }).click();
    await page.locator('#lp-text').fill('Son söz');
    await page.getByRole('button', { name: 'Kaydet •' }).click();
    await page.getByText('Tasarım kaydedildi.').waitFor();
    const saved = (await srv.request('GET', `/api/brands/${brand.id}/posts`)).data.posts[0];
    assert.equal(saved.data.slides.length, 4);
    assert.ok(saved.data.slides[0].layers.some(l => l.text === 'Sınav haftası rehberi'));
    assert.ok(saved.data.slides[1].layers.some(l => l.text === 'Son söz'));

    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Paylaş' }).click();
    await page.getByRole('button', { name: 'Bu slaytı PNG indir' }).click();
    const file = await dl;
    assert.match(file.suggestedFilename(), /\.png$/);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('telefon genişliği: yönetim merkezi, takvim ve marka alanında yatay taşma yok', { skip }, async () => {
  const srv = await startServer();
  await srv.request('POST', '/api/brands/demo');
  const { browser, page, problems } = await open(srv, { width: 390, height: 844 });
  try {
    const id = (await srv.request('GET', '/api/settings')).data.activeBrandId;
    for (const [hash, sel] of [['#/', '.kpi'], ['#/takvim', '.cal-month'], ['#/gorevler', '.task-row'], ['#/analizler', '.metric'], [`#/m/${id}`, '.bhome .hero'], [`#/m/${id}/arsiv`, '.table']]) {
      await page.goto(srv.base + '/' + hash);
      await page.locator(sel).first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${hash} dar ekranda yatay kaydırma var: ${overflow}`);
    }
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('Prompt Studio: tür seç, üret, kopyala, geliştir, seçili bölümü yeniden yaz, sürüme dön, sil', { skip }, async () => {
  const srv = await startServer({ aiProvider: stage3Provider() });
  const { browser, page, problems } = await open(srv);
  try {
    const brand = (await srv.request('POST', '/api/brands', { name: 'Kahve Evi' })).data.brand;
    await page.goto(srv.base + `/#/m/${brand.id}`);
    await page.getByRole('link', { name: 'Prompt Studio' }).click();
    await page.getByRole('heading', { name: 'Prompt Studio' }).waitFor();
    await page.getByRole('radio', { name: 'Maskot animasyonu' }).click();
    assert.match(await page.locator('#ps-hint').textContent(), /önce Türkçe[\s\S]*İngilizceye/);
    await page.locator('#ps-brief').fill('Maskot sabah kampüste koşuyor');
    await page.getByRole('button', { name: 'Prompt üret' }).click();
    await page.getByRole('heading', { name: 'Kampüs koşusu' }).waitFor();
    // 7.5: önce Türkçe; tek tıkla İngilizceye çevrilir, Türkçesi saklanır
    assert.match(await page.locator('#pp-text').inputValue(), /kampüste koşuyor/);
    assert.equal(await page.locator('#pp-tr').count(), 0);
    await page.getByRole('button', { name: 'İngilizceye çevir' }).click();
    await page.locator('#pp-tr').waitFor();
    assert.match(await page.locator('#pp-text').inputValue(), /runs across campus at sunrise/);
    assert.match(await page.locator('#pp-tr').inputValue(), /kampüste koşuyor/);

    // Hazır geliştirme işlemi yeni sürüm oluşturur
    await page.getByRole('button', { name: 'Kamera açısını değiştir' }).click();
    await page.waitForFunction(() => document.querySelector('#pp-text') && document.querySelector('#pp-text').value.startsWith('Low angle'));
    assert.equal(await page.locator('.version-list li').count(), 3);

    // Seçili bölümü yeniden yaz
    await page.locator('#pp-text').evaluate(ta => { const i = ta.value.indexOf('at sunrise'); ta.focus(); ta.setSelectionRange(i, i + 'at sunrise'.length); });
    await page.locator('#pp-instr').fill('gece olsun');
    await page.getByRole('button', { name: 'Seçili bölümü yaz' }).click();
    await page.waitForFunction(() => document.querySelector('#pp-text') && document.querySelector('#pp-text').value.includes('neon'));
    assert.equal(await page.locator('.version-list li').count(), 4);

    // İlk sürüme dön (Sürümler panelinden)
    await page.locator('.ed-rail').getByRole('button', { name: 'Sürümler' }).click();
    await page.locator('.version-list li').last().getByRole('button', { name: 'Geri dön' }).click();
    // Seçili bölüm sonrası metin de "A cheerful" ile başlıyor: geri dönüşü sürüm sayısıyla ve "neon"un gitmesiyle bekle
    await page.waitForFunction(() => document.querySelectorAll('.version-list li').length === 5);
    // İlk sürüm Türkçeydi: metin ve dil birlikte döner
    assert.equal(await page.locator('#pp-text').inputValue(), 'Neşeli kahve çekirdeği maskot gün doğumunda kampüste koşuyor');
    assert.equal(await page.locator('#pp-tr').count(), 0);

    // Elle düzenleyip kaydet, listede görün, sil
    await page.locator('#pp-text').fill('Elle düzeltilmiş prompt');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.version-list li').length === 6);
    await page.getByRole('link', { name: "Prompt'lar" }).click();
    await page.locator('#ps-list .pool-item').first().waitFor();
    assert.match(await page.locator('#ps-list').textContent(), /Elle düzeltilmiş prompt/);
    await page.locator('#ps-list a').first().click();
    await page.getByRole('button', { name: 'Dosya' }).click();
    await page.getByRole('button', { name: "Prompt'u sil" }).click();
    await page.getByText('Henüz prompt yok').waitFor();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});
