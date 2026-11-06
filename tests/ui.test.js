// Tarayıcı testi: gerçek arayüzde marka oluşturma → kimlik → logo → asistan → fikirler → marka ayrımı.
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

test('arayüz: uçtan uca marka ve asistan akışı', { skip: !chromium && 'Playwright yok' }, async () => {
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
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) problems.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  try {
    await page.goto(srv.base + '/');
    // İlk açılış: marka yokken karşılama formu
    await page.getByRole('heading', { name: 'İlk markanı oluştur' }).waitFor();
    await page.getByLabel('Marka adı').fill('Kahve Durağı');
    await page.getByLabel('Sektör').fill('Kafe');
    await page.getByRole('button', { name: 'Oluştur' }).click();

    // Marka profili düzenleyicisi
    await page.getByRole('heading', { name: 'Kahve Durağı' }).waitFor();
    await page.getByLabel('Hedef kitle').fill('Üniversite öğrencileri');
    await page.getByLabel('İletişim dili').fill('Samimi ve esprili, sen dili');
    await page.getByLabel('Marka sloganı').fill('Her yudum bir mola');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.getByText('Tüm değişiklikler kayıtlı').waitFor();

    // Görsel kimlik: renk ve font; canlı önizleme güncellenir
    await page.getByRole('tab', { name: 'Görsel kimlik' }).click();
    await page.locator('[data-hex="primary"]').fill('#aa3300');
    await page.getByLabel('Başlık fontu').selectOption('Poppins');
    assert.match(await page.locator('.pp-title').getAttribute('style'), /Poppins/);
    assert.equal(await page.locator('.pp-title').textContent(), 'Her yudum bir mola');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.getByText('Marka kimliği kaydedildi.').waitFor();

    // Varlık kütüphanesi: logo yükleme
    await page.getByRole('tab', { name: 'Varlık kütüphanesi' }).click();
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ium-ui-')), 'logo.png');
    fs.writeFileSync(tmp, PNG_1PX);
    await page.locator('#asset-file').setInputFiles(tmp);
    await page.getByText('1 dosya yüklendi.').waitFor();
    await page.locator('.asset').first().waitFor();
    assert.equal(await page.locator('.asset').count(), 1);
    assert.equal(await page.locator('[data-asset-label]').inputValue(), 'logo');

    // Ana ekran: asistan fikir üretir ve kaydeder
    await page.getByRole('link', { name: 'Ana ekran' }).click();
    await page.getByText('Bugün').first().waitFor();
    assert.match(await page.locator('.hero h1').textContent(), /Kahve Durağı/);
    await page.locator('#chat-input').fill('Bu hafta için fikir üret');
    await page.locator('#chat-input').press('Enter');
    await page.getByText('İki fikir kaydettim.').waitFor();
    await page.getByText('✓ 2 fikir fikir havuzuna kaydedildi').waitFor();
    assert.equal(await page.locator('#idea-list .idea').count(), 2);
    assert.ok(provider.calls[0].prompt.includes('Üniversite öğrencileri'), 'marka hafızası gönderilmedi');

    // Favori
    await page.locator('[data-fav]').first().click();
    await page.locator('.star.on').waitFor();

    // Kaldığı yerden devam: yenilemede sohbet ve fikirler duruyor
    await page.reload();
    await page.getByText('İki fikir kaydettim.').waitFor();
    assert.match(await page.locator('.hero h1').textContent(), /Tekrar hoş geldin/);

    // İkinci marka: kendi boş fikir listesi ve sohbeti
    await page.getByRole('link', { name: 'Yeni marka' }).click();
    await page.getByLabel('Marka adı *').fill('Finans Rehberi');
    await page.getByRole('button', { name: 'Markayı oluştur' }).click();
    await page.getByRole('tab', { name: 'Görsel kimlik' }).waitFor();
    await page.getByRole('link', { name: 'Ana ekran' }).click();
    await page.getByText('Henüz fikir yok').waitFor();
    assert.equal(await page.locator('.msg-user').count(), 0, 'diğer markanın sohbeti göründü');

    // Marka seçici ile geri dönüş
    await page.locator('#brand-switch').selectOption({ label: 'Kahve Durağı' });
    await page.getByText('İki fikir kaydettim.').waitFor();

    // Markalar sayfası ve dar ekran
    await page.getByRole('link', { name: 'Markalar' }).click();
    await page.getByRole('heading', { name: 'Markalar' }).waitFor();
    assert.equal(await page.locator('.brand-card').count(), 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: 'Ana ekran' }).click();
    await page.locator('#chat-input').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, 'dar ekranda yatay kaydırma var: ' + overflow);

    assert.deepEqual(problems, [], 'sayfada hata var');
  } finally {
    await browser.close();
    await srv.stop();
  }
});

test('arayüz: AI bağlı değilken asistan devre dışı ve ayarlara yönlendirir', { skip: !chromium && 'Playwright yok' }, async () => {
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await srv.request('POST', '/api/brands', { name: 'Anahtarsız' });
    await page.goto(srv.base + '/');
    await page.getByText('AI bağlı değil.').waitFor();
    assert.ok(await page.locator('#chat-input').isDisabled());
    assert.ok(await page.locator('[data-quick="0"]').isDisabled());
    await page.getByRole('link', { name: 'Ayarlara git' }).click();
    await page.getByLabel('Gemini API anahtarı').waitFor();
    assert.ok(await page.getByRole('button', { name: 'Bağlantıyı test et' }).isDisabled());
  } finally {
    await browser.close();
    await srv.stop();
  }
});

test('arayüz: örnek markayla keşfet', { skip: !chromium && 'Playwright yok' }, async () => {
  const provider = fakeProvider([{ reply: 'Üç fikir kaydettim.', actions: [{ type: 'save_ideas', ideas: [{ title: 'Gece kütüphanesi kahvesi', category: 'eglenceli' }] }] }]);
  const srv = await startServer({ aiProvider: provider });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  try {
    await page.goto(srv.base + '/');
    await page.getByRole('button', { name: '☕ Örnek markayla keşfet' }).click();
    await page.getByRole('heading', { name: '🧭 Örnek marka: nasıl kullanılır?' }).waitFor();
    assert.match(await page.locator('.hero h1').textContent(), /Kahve Durağı/);
    assert.equal(await page.locator('#idea-list .idea').count(), 6);
    assert.ok((await page.locator('.side-brand').textContent()).includes('%100'));
    assert.ok((await page.locator('#brand-switch option:checked').textContent()).includes('(örnek)'));

    // Rehber adımı: kütüphanede maskot pozları
    await page.getByRole('link', { name: 'Kütüphane' }).click();
    await page.getByRole('button', { name: 'Maskot pozu' }).click();
    await page.locator('.asset').nth(2).waitFor();
    assert.equal(await page.locator('.asset').count(), 3);

    // Rehber adımı: asistanı dene
    await page.getByRole('link', { name: 'Ana ekran' }).click();
    await page.getByRole('button', { name: 'Dene' }).click();
    await page.getByText('Üç fikir kaydettim.').waitFor();
    assert.ok(provider.calls[0].prompt.includes('Üniversite') || provider.calls[0].prompt.includes('üniversite'), 'örnek markanın hafızası gönderilmedi');

    // Markalar sayfasında rozet; tekrar ekleme butonu gizli
    await page.getByRole('link', { name: 'Markalar' }).click();
    await page.getByRole('heading', { name: 'Markalar' }).waitFor();
    assert.ok((await page.locator('.brand-card').first().textContent()).includes('Örnek'));
    assert.equal(await page.getByRole('button', { name: '☕ Örnek marka ekle' }).count(), 0);
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
    await srv.stop();
  }
});
