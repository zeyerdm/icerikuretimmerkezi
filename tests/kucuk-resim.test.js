// 8.10 Küçük resimler: büyük görselin ~400 px önizlemesi tarayıcıda üretilir, sunucu denetleyip saklar; ızgaralar onu yükler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { startServer, PNG_1PX } from './helpers.js';

// Sıkışmayan (rastgele) piksellerle büyük PNG
export function bigPng(w = 600, h = 400) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), randomBytes(w * 3)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const png = { 'Content-Type': 'image/png' };

test('8.10 küçük resim uç noktaları: gerekip gerekmediği, kayıt, denetim, yoksa asıl dosya', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Küçük' })).data.brand;
    const url = `/api/brands/${b.id}/assets`;
    const small = (await s.request('POST', `${url}?category=mascot`, PNG_1PX, png)).data.asset;
    assert.equal(small.needsThumb, false, 'küçük dosyaya gerek yok');
    assert.equal(small.thumbUrl, small.url);
    const big = (await s.request('POST', `${url}?category=mascot`, bigPng(), png)).data.asset;
    assert.ok(big.size > 150 * 1024);
    assert.equal(big.needsThumb, true);
    // Küçük resim yokken asıl dosya döner
    const fb = await fetch(`${s.base}${url}/${big.id}/thumb`);
    assert.equal(fb.headers.get('x-thumb'), 'missing');
    assert.equal(Number(fb.headers.get('content-length')), big.size);
    // Denetim: görsel değil, GIF, çok büyük
    assert.equal((await s.request('PUT', `${url}/${big.id}/thumb`, Buffer.from('resim değil'), { 'Content-Type': 'image/webp' })).status, 400);
    assert.equal((await s.request('PUT', `${url}/${big.id}/thumb`, Buffer.from('GIF89a' + 'x'.repeat(20)), { 'Content-Type': 'image/gif' })).status, 400);
    assert.equal((await s.request('PUT', `${url}/${big.id}/thumb`, bigPng(), png)).status, 413, 'sunucu sınırı');
    const saved = (await s.request('PUT', `${url}/${big.id}/thumb`, PNG_1PX, png)).data.asset;
    assert.equal(saved.needsThumb, false);
    assert.match(saved.thumbUrl, /\/thumb$/);
    const t = await fetch(`${s.base}${saved.thumbUrl}`);
    assert.equal(t.headers.get('x-thumb'), null);
    assert.deepEqual(Buffer.from(await t.arrayBuffer()), PNG_1PX);
    assert.equal((await s.request('GET', url)).data.assets.find(a => a.id === big.id).thumbUrl, saved.thumbUrl);
    // Silip geri alınca küçük resim yeniden üretilmeyi bekler
    const del = await fetch(`${s.base}${url}/${big.id}`, { method: 'DELETE' });
    await s.request('POST', `/api/trash/${del.headers.get('x-trash-id')}/restore`);
    assert.equal((await s.request('GET', url)).data.assets.find(a => a.id === big.id).needsThumb, true);
    // Başka marka yazamaz
    const o = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    assert.equal((await s.request('PUT', `/api/brands/${o.id}/assets/${big.id}/thumb`, PNG_1PX, png)).status, 404);
  } finally { await s.stop(); }
});

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('8.10 arayüz: kütüphane büyük görselin küçük resmini tarayıcıda üretir ve ızgarada onu kullanır', { skip: !chromium && 'Playwright yok' }, async () => {
  const s = await startServer();
  const browser = await chromium.launch();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Izgara' })).data.brand;
    const big = (await s.request('POST', `/api/brands/${b.id}/assets?category=logo`, bigPng(800, 500), png)).data.asset;
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    const problems = [];
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(`${s.base}/#/m/${b.id}/kutuphane`);
    await page.waitForFunction(id => { const i = document.querySelector(`[data-asset-id="${id}"] img`); return i && /\/thumb$/.test(i.getAttribute('src')); }, big.id, { timeout: 8000 });
    const a = (await s.request('GET', `/api/brands/${b.id}/assets`)).data.assets.find(x => x.id === big.id);
    assert.equal(a.needsThumb, false);
    const t = await fetch(`${s.base}${a.thumbUrl}`);
    const buf = Buffer.from(await t.arrayBuffer());
    assert.ok(buf.length < big.size / 3, `küçük resim belirgin biçimde küçük (${buf.length} / ${big.size})`);
    // WebP genişliği (VP8/VP8L/VP8X) yerine en/boy oranını kontrol etmek için görseli tarayıcıda açıp boyutuna bak
    const dims = await page.evaluate(async src => { const i = new Image(); i.src = src; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }, a.thumbUrl);
    assert.deepEqual(dims, [400, 250]);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
