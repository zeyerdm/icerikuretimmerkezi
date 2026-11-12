// 8.19 Hata günlüğü: beklenmeyen sunucu hataları, başarısız AI istekleri ve arayüz hataları tek listede; gizli bilgiler silinir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './helpers.js';
import { redact } from '../server/services/errorLog.js';

test('8.19 gizleme: anahtar, belirteç, e-posta ve uzun dizgiler', () => {
  assert.equal(redact('anahtar sk-ant-abcdefgh12345678 reddedildi'), 'anahtar [gizlendi] reddedildi');
  assert.equal(redact('AIzaSyA1234567890abcdefghijklmnop hatalı'), '[gizlendi] hatalı');
  assert.equal(redact('Authorization: Bearer abcdefghijklmnop123'), 'Authorization: Bearer [gizlendi]');
  assert.equal(redact('kullanıcı ali@ornek.com'), 'kullanıcı [e-posta]');
  assert.equal(redact('Model bulunamadı'), 'Model bulunamadı');
});

test('8.19 günlük: sunucu + AI hatası bir istekten, arayüz hatası, sınır, temizleme', async () => {
  const s = await startServer({ aiProvider: { label: 'Bozuk', async generate() { throw new Error('beklenmedik patlama sk-ant-abcdefgh12345678'); }, async test() { return { ok: true, modelCount: 1, modelAvailable: true }; } } });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Hatalı' })).data.brand;
    assert.deepEqual((await s.request('GET', '/api/errors')).data.errors, []);
    const r = await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'x' });
    assert.equal(r.status, 500);
    assert.doesNotMatch(JSON.stringify(r.data), /patlama/, 'kullanıcıya iç ayrıntı gösterilmez');
    const { errors, system } = (await s.request('GET', '/api/errors')).data;
    const srv = errors.find(e => e.kind === 'sunucu');
    assert.equal(srv.source, `POST /api/brands/${b.id}/prompts`);
    assert.equal(srv.message, 'beklenmedik patlama [gizlendi]');
    assert.match(srv.detail, /Error: beklenmedik patlama \[gizlendi\]/);
    const ai = errors.find(e => e.kind === 'ai');
    assert.equal(ai.source, 'yazim');
    assert.match(ai.message, /\[gizlendi\]/);
    assert.ok(system.version !== undefined && !('instance' in system), 'klasör yolu raporlanmaz');
    // Arayüz hatası
    assert.equal((await s.request('POST', '/api/errors/client', { message: 'TypeError: x is undefined', source: '#/takvim · calendar.js:12' })).status, 201);
    assert.equal((await s.request('POST', '/api/errors/client', {})).status, 400);
    const ui = (await s.request('GET', '/api/errors')).data.errors.find(e => e.kind === 'arayuz');
    assert.equal(ui.source, '#/takvim · calendar.js:12');
    // Dakikada en çok 20 arayüz kaydı
    for (let i = 0; i < 25; i++) await s.request('POST', '/api/errors/client', { message: `e${i}` });
    assert.equal((await s.request('GET', '/api/errors?limit=300')).data.errors.filter(e => e.kind === 'arayuz').length, 20);
    // Temizle: AI hataları da listeden çıkar (kayıtları harcamada kalır)
    assert.equal((await s.request('DELETE', '/api/errors')).status, 204);
    assert.deepEqual((await s.request('GET', '/api/errors')).data.errors, []);
  } finally { await s.stop(); }
});

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('8.19 arayüz: Ayarlar → Hata günlüğü; tarayıcı hatası kaydedilir, destek metni kopyalanır', { skip: !chromium && 'Playwright yok' }, async () => {
  const s = await startServer();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    await page.goto(`${s.base}/#/ayarlar`);
    await page.locator('a[href="#/ayarlar/hatalar"]').click();
    await page.locator('.card', { hasText: 'Hata yok' }).waitFor();
    // Yakalanmayan tarayıcı hatası sunucuya bildirilir
    await page.evaluate(() => setTimeout(() => { throw new Error('deneme hatası'); }, 0));
    await page.waitForFunction(async () => (await (await fetch('/api/errors')).json()).errors.length > 0);
    await page.reload();
    await page.locator('td', { hasText: 'deneme hatası' }).waitFor();
    await page.locator('[data-copy-errors]').click();
    await page.locator('.toast', { hasText: 'kopyalandı' }).waitFor();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /^İçerik Üretim Merkezi/);
    assert.match(clip, /Arayüz · #\/ayarlar\/hatalar/);
    assert.match(clip, /deneme hatası/);
  } finally { await browser.close(); await s.stop(); }
});
