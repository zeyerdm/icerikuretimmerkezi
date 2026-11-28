// Adım adım tasarım akışı: afiş türü (A4), türe ayrılmış şablonlar, kullanıcının yazdığı bilgilerden yapay zekâsız tasarım.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

const brief = { title: 'Kampüs Şubemiz Açıldı', subtitle: 'İlk hafta 2. kahve hediye', date: '2 Aralık · 08.00', place: 'Merkez Kampüs', contact: '@kahveduragi', cta: 'Bekliyoruz!' };
const texts = post => post.data.slides.flatMap(s => s.layers.filter(l => l.type === 'text').map(l => l.text));

test('Bilgilerden tasarım: afiş (A4) şablonsuz ve hazır afiş şablonuyla; yapay zekâ çağrılmaz; başlık zorunlu', async () => {
  const provider = fakeProvider([new Error('yapay zekâ çağrılmamalı')]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Afişli', colors: { primary: '#123456', secondary: [], backgrounds: [] } })).data.brand;
    const meta = (await s.request('GET', '/api/meta')).data.posts;
    assert.equal(meta.kinds.afis, 'Afiş'); assert.equal(meta.formats.A4.h, 1754);
    // Şablonsuz: türün marka yerleşimi
    let r = await s.request('POST', `/api/brands/${b.id}/posts/from-brief`, { kind: 'afis', brief });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.post.kind, 'afis'); assert.equal(r.data.post.data.format, 'A4');
    let all = texts(r.data.post).join(' | ');
    assert.match(all, /Kampüs Şubemiz Açıldı/); assert.match(all, /İlk hafta 2\. kahve hediye/); assert.match(all, /2 Aralık · 08\.00 · Merkez Kampüs/); assert.match(all, /Bekliyoruz!/);
    // Hazır afiş şablonu: ortak kütüphanede türüyle listelenir, markanın rengine çevrilir, bilgiler kutulara yerleşir
    const shared = (await s.request('GET', `/api/brands/${b.id}/shared-templates`)).data.templates.filter(t => t.kind === 'afis');
    assert.equal(shared.length, 3);
    r = await s.request('POST', `/api/brands/${b.id}/posts/from-brief`, { kind: 'afis', brief, sharedId: 'hazir-afis-buyuk' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const p = r.data.post;
    assert.equal(p.kind, 'afis'); assert.equal(p.data.format, 'A4'); assert.equal(p.data.slides[0].bg, '#123456', 'zemin marka rengi');
    all = texts(p).join(' | ');
    assert.match(all, /Kampüs Şubemiz Açıldı/); assert.match(all, /Merkez Kampüs/); assert.match(all, /Bekliyoruz!/);
    assert.doesNotMatch(all, /BÜYÜK BAŞLIK BURAYA/, 'şablon örnek metni kalmaz');
    // Başlık zorunlu; geçersiz tür
    assert.equal((await s.request('POST', `/api/brands/${b.id}/posts/from-brief`, { kind: 'afis', brief: { subtitle: 'x' } })).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/posts/from-brief`, { kind: 'yok', brief })).status, 400);
    // Markanın kendi şablonu (türüyle) da kullanılabilir
    const saved = (await s.request('POST', `/api/brands/${b.id}/posts/${p.id}/template`, { name: 'Bizim afiş' })).data;
    const tid = (saved.template || saved).id;
    r = await s.request('POST', `/api/brands/${b.id}/posts/from-brief`, { brief: { title: 'Yeni menü' }, templateId: tid });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.post.kind, 'afis'); assert.match(texts(r.data.post).join(' '), /Yeni menü/);
    assert.equal(provider.calls.length, 0, 'yapay zekâ çağrılmadı');
  } finally { await s.stop(); }
});

// Arayüz: Post stüdyosu → Yeni tasarım → Afiş → Bilgileri ben yazacağım → alanlar → hazır afiş şablonu → düzenleyici
import { createRequire } from 'node:module';
let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('Arayüz: adım adım tasarım (her adım ayrı ekran, geri dönünce yazılanlar kalır), hızlı başla ve fikirden', { skip: !chromium && 'Playwright yok' }, async () => {
  const s = await startServer();
  const browser = await chromium.launch();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Akışlı', slogan: 'Her yudum bir mola', website: 'https://ornek.com' })).data.brand;
    await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Vize haftası gece açık', description: 'Sınav haftasında 24 saat açığız.', category: 'satis' });
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    const problems = [];
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(`${s.base}/#/m/${b.id}/post`);
    await page.getByRole('link', { name: 'Yeni tasarım' }).click();
    await page.waitForURL(/\/post\/yeni$/);
    // 1: tür
    await page.getByRole('heading', { name: 'Bugün ne tasarlıyoruz?' }).waitFor();
    await page.locator('[data-wz-kind="afis"]').click();
    // 2: içerik yolu (yalnız bu ekran)
    await page.getByRole('heading', { name: 'Afiş içeriği nereden gelsin?' }).waitFor();
    assert.equal(await page.locator('[data-wz-kind]').count(), 0, 'önceki adım ekranda değil');
    await page.locator('[data-wz-src="yaz"]').click();
    // 3: alanlar
    await page.getByLabel('Başlık *').fill('Kampüs Şubemiz Açıldı');
    await page.getByLabel('Tarih / saat').fill('2 Aralık · 08.00');
    // Geri → ileri: yazılanlar kalır
    await page.locator('[data-wz-back]').click();
    await page.locator('[data-wz-src="yaz"]').waitFor();
    await page.locator('[data-wz-src="yaz"]').click();
    assert.equal(await page.getByLabel('Tarih / saat').inputValue(), '2 Aralık · 08.00', 'aynı yol yeniden seçilince yazılanlar kalır');
    await page.getByLabel('Yer').fill('Merkez Kampüs');
    await page.locator('[data-wz-next]').click();
    // 4: yalnız afiş şablonları
    await page.getByRole('heading', { name: 'Bir afiş şablonu seç' }).waitFor();
    assert.equal(await page.locator('[data-wz-shared]').count(), 3);
    await page.locator('[data-wz-back]').click();
    assert.equal(await page.getByLabel('Başlık *').inputValue(), 'Kampüs Şubemiz Açıldı', 'geri dönünce yazılanlar kalır');
    await page.locator('[data-wz-next]').click();
    await page.locator('[data-wz-shared="hazir-afis-etkinlik"]').click();
    await page.waitForURL(/\/post\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop();
    const post = (await s.request('GET', `/api/brands/${b.id}/posts/${id}`)).data.post;
    assert.equal(post.kind, 'afis'); assert.equal(post.data.format, 'A4');
    assert.match(JSON.stringify(post.data.slides), /Kampüs Şubemiz Açıldı/); assert.match(JSON.stringify(post.data.slides), /2 Aralık · 08\.00 · Merkez Kampüs/);
    assert.doesNotMatch(JSON.stringify(post.data.slides), /Kayıt ol/, 'boş bırakılan buton tasarıma girmez');
    assert.ok(!post.data.slides[0].layers.some(l => l.role === 'cta'));
    // Hızlı başla: marka bilgisinden dolar; şablonsuz
    await page.goto(`${s.base}/#/m/${b.id}/post/yeni`);
    await page.locator('[data-wz-kind="post"]').click();
    await page.locator('[data-wz-src="hizli"]').click();
    await page.locator('[data-wz-preset="tanitim"]').click();
    assert.equal(await page.getByLabel('Başlık *').inputValue(), 'Her yudum bir mola');
    await page.locator('[data-wz-next]').click();
    await page.locator('[data-wz-none]').click();
    await page.waitForURL(/\/post\/[0-9a-f-]{36}$/);
    // Fikirden
    await page.goto(`${s.base}/#/m/${b.id}/post/yeni`);
    await page.locator('[data-wz-kind="story"]').click();
    await page.locator('[data-wz-src="fikir"]').click();
    await page.locator('.wz-idea', { hasText: 'Vize haftası gece açık' }).click();
    assert.equal(await page.getByLabel('Başlık *').inputValue(), 'Vize haftası gece açık');
    assert.equal(await page.getByLabel('Alt başlık').inputValue(), 'Sınav haftasında 24 saat açığız.');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
