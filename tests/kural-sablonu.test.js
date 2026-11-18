// Prompt Studio kural şablonları: kullanıcının kendi prompt yapısı kaydedilir; üretimde şablon birebir istemde,
// başlıklar korunur, [köşeli] alanlar doldurulur. Eksik bölüm ya da doldurulmamış alan varsa bir kez daha yazılır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, fakeProvider } from './helpers.js';
import { ruleHeadings, ruleCheck } from '../server/services/prompts.js';

const BODY = `SAHNE [NUMARASI] — [SAHNENİN AMACI]
Video formatı ve süre:
Dikey 9:16 video, [X] saniye. [Hızlı / mizahi] anlatım.
Karakter kullanımı:
Flow'da kayıtlı ana karakter kullanılmalı.
Konuşma ve seslendirme:
"[Seslendirme metni]"
Son kontrol:
Altyazısız olmalı.`;
const filled = n => `SAHNE ${n} — Kahve molası
Video formatı ve süre:
Dikey 9:16 video, 8 saniye. Mizahi anlatım.
Karakter kullanımı:
Flow'da kayıtlı ana karakter kullanılmalı.
Konuşma ve seslendirme:
"Kahvesiz kod olmaz!"
Son kontrol:
Altyazısız olmalı.`;

test('Kural şablonu denetimi: başlıklar bulunur, eksik bölüm ve doldurulmamış alan yakalanır', () => {
  assert.deepEqual(ruleHeadings(BODY), ['Video formatı ve süre', 'Karakter kullanımı', 'Konuşma ve seslendirme', 'Son kontrol']);
  assert.equal(ruleCheck(BODY, filled(1)).ok, true);
  const bad = ruleCheck(BODY, filled(1).replace('Son kontrol:', '').replace('8 saniye', '[X] saniye'));
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.some(m => /Son kontrol/.test(m)));
  assert.ok(bad.missing.some(m => /\[X\]/.test(m)));
});

test('Kural şablonları: kayıt, varsayılan, üretimde birebir kullanım, yeniden deneme, sahneli üretim, şablonsuz seçim', async () => {
  const provider = fakeProvider([
    { title: 'Eksik', prompt: filled(1).replace('Son kontrol:\nAltyazısız olmalı.', '') },
    { title: 'Kahve sahnesi', prompt: filled(1) },
    { title: 'İki sahne', scenes: [{ title: 'Giriş', prompt: filled(1) }, { title: 'Son', prompt: filled(2) }] },
    { title: 'Şablonsuz', prompt: 'A cozy cafe, warm light' }
  ]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kural' })).data.brand;
    const url = `/api/brands/${b.id}/prompt-rules`;
    assert.equal((await s.request('POST', url, { kind: 'video', name: 'x', body: 'kısa' })).status, 400);
    assert.equal((await s.request('POST', url, { kind: 'yok', name: 'x', body: BODY })).status, 400);
    const r1 = (await s.request('POST', url, { kind: 'video', name: 'Sahne şablonu', body: BODY, lang: 'tr' })).data.rule;
    assert.equal(r1.isDefault, true, 'türdeki ilk şablon varsayılan');
    assert.equal(r1.fields, 5); assert.equal(r1.headings.length, 4);
    const r2 = (await s.request('POST', url, { kind: 'video', name: 'İkinci', body: BODY + '\nEk:\nek' })).data.rule;
    assert.equal(r2.isDefault, false);
    // Varsayılanı değiştir
    await s.request('PUT', `${url}/${r2.id}`, { isDefault: true });
    let list = (await s.request('GET', url + '?kind=video')).data.rules;
    assert.deepEqual(list.map(r => [r.name, r.isDefault]), [['İkinci', true], ['Sahne şablonu', false]]);
    await s.request('PUT', `${url}/${r1.id}`, { isDefault: true });

    // Üretim: varsayılan şablon (ruleId boş) → şablon istemde birebir; eksik çıkınca bir kez daha yazılır
    const p = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'video', brief: 'Maskot kahve içiyor', lang: 'en' })).data.prompt;
    assert.ok(provider.calls[0].prompt.includes(BODY), 'şablon birebir istemde');
    assert.match(provider.calls[0].prompt, /KELİMESİ KELİMESİNE/);
    assert.ok(!/ekranda yazı, logo metni, altyazı isteme/.test(provider.calls[0].prompt), 'genel "yazı isteme" kuralı şablonu ezmez');
    assert.match(provider.calls[1].prompt, /KALİTE KONTROLÜ/);
    assert.equal(p.text, filled(1));
    assert.equal(p.lang, 'tr', 'şablonun dili');
    assert.deepEqual(p.rule, { id: r1.id, name: 'Sahne şablonu' });
    assert.equal(p.quality.ok, true); assert.equal(p.quality.rule, true);
    assert.equal(p.ai.qualityRetried, true);

    // Sahneli: her sahne şablonun kopyası; başlık iki kez eklenmez
    const ps = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'video', brief: 'İki sahne', scenes: 2, ruleId: r1.id })).data.prompt;
    assert.match(provider.calls[2].prompt, /2 sahnenin HER BİRİ/);
    assert.equal(ps.scenes.length, 2);
    assert.equal(ps.text, `${filled(1)}\n\n${filled(2)}`);
    assert.equal(ps.quality.scenes.length, 2);

    // Şablonsuz seçim
    const pn = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'video', brief: 'Kafe', ruleId: 'none', lang: 'en' })).data.prompt;
    assert.ok(!provider.calls[3].prompt.includes('KURAL ŞABLONU'));
    assert.equal(pn.rule, null);
    // Başka türün şablonu seçilemez; olmayan şablon 404
    assert.equal((await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'x', ruleId: r1.id })).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'video', brief: 'x', ruleId: 'yok' })).status, 404);
    // Silme: prompt kalır, şablon bilgisi düşer
    assert.equal((await s.request('DELETE', `${url}/${r1.id}`)).status, 204);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/prompts/${p.id}`)).data.prompt.rule, null);
  } finally { await s.stop(); }
});

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('Arayüz: hazır örnekle kural şablonu kaydedilir, üretimde seçili gelir ve gönderilir', { skip: !chromium && 'Playwright yok' }, async () => {
  const provider = fakeProvider([{ title: 'Sahne', prompt: 'SAHNE 1 — Deneme\nVideo formatı ve süre:\nDikey' }]);
  const s = await startServer({ aiProvider: provider });
  const b = (await s.request('POST', '/api/brands', { name: 'Kural UI' })).data.brand;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  try {
    await page.goto(`${s.base}/#/m/${b.id}/prompt`);
    await page.locator('.menu-dd > summary').click(); // Kütüphanem menüsü
    await page.locator('[data-rules]').click();
    await page.locator('[data-rl-example]').click();
    await page.locator('#rl-stat', { hasText: 'bölüm başlığı' }).waitFor();
    assert.match(await page.locator('#rl-stat').textContent(), /1[0-9] bölüm başlığı/);
    await page.locator('.modal [type=submit]').last().click();
    await page.locator('#rl-list', { hasText: 'Dikey video sahnesi' }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
    await page.locator('[data-kind="video"]').click();
    await page.waitForFunction(() => !document.querySelector('#ps-rule').hidden);
    assert.match(await page.locator('#ps-rule option:checked').textContent(), /Dikey video sahnesi/);
    await page.locator('#ps-brief').fill('Maskot kahve içiyor');
    await page.locator('[data-create]').click();
    await page.waitForURL(/\/prompt\/[^/]+$/);
    assert.match(provider.calls[0].prompt, /Flow'da kayıtlı ana karakter kullanılmalı/);
    await page.locator('.ed-bottom', { hasText: 'Kural şablonu: Dikey video sahnesi' }).waitFor();
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
