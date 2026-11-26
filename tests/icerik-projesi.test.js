// O2 · Takvim içeriği = proje: zaman çizelgesi (fikir → senaryo/prompt/tasarım → düzenleme → onay → yayın → performans),
// yayın bağlantısı, içerik bazında yapay zekâ çağrı/maliyet kaydı (içeriğin kendisi + bağlı senaryo/post/prompt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, fakeProvider } from './helpers.js';
import { scopeFromPath } from '../server/lib/usageCtx.js';

const scene = { duration: 6, start: 'Kafe', endFrame: 'Masa', beats: [{ from: 0, to: 6, action: 'Gülümser', camera: 'Yakın', sound: '' }], line: 'Kahve hazır, sakin ol ve nefes al biraz arkadaşım', lineFrom: 0, lineTo: 6, flowScene: 'smiles', flowSceneTr: 'gülümser' };
const REELS = { title: 'Senaryo', format: 'skec', topic: 'x', why: 'y', punchline: 'z', setting: 'Kafe', screenTitle: 'Başlık', titleKeyword: 'kahve', scenes: [scene], ending: { twist: 't', lastFrame: 'l' }, caption: 'c', hashtags: [], music: 'm' };
const CAPTION = { caption: 'Açıklama', hashtags: ['#kahve'], firstComment: 'İlk yorum' };
const dbOf = s => new DatabaseSync(path.join(s.dataDir, fs.readdirSync(s.dataDir).find(f => f.endsWith('.db'))));

test('Bağlam: istek yolundan içerik / kayıt kimliği', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.deepEqual(scopeFromPath(`/contents/${id}/write`), { contentId: id, ref: null, create: null });
  assert.deepEqual(scopeFromPath(`/brands/b/posts/${id}/rewrite`), { contentId: null, ref: `post:${id}`, create: null });
  assert.deepEqual(scopeFromPath(`/brands/b/prompts/${id}/improve`), { contentId: null, ref: `prompt:${id}`, create: null });
  assert.deepEqual(scopeFromPath('/brands/b/reels'), { contentId: null, ref: null, create: 'reels' });
  assert.deepEqual(scopeFromPath('/brands/b/images', { promptId: id }), { contentId: null, ref: `prompt:${id}`, create: null });
  assert.equal(scopeFromPath('/brands/b/ideas'), null);
  assert.equal(scopeFromPath('/contents/abc'), null, 'kimlik biçimi denetlenir');
});

test('İçerik projesi: zaman çizelgesi, yayın bağlantısı, içerik ve bağlı senaryo için yapay zekâ maliyeti', async () => {
  const provider = fakeProvider([p => (p.includes('Instagram içerik yazarısın') ? CAPTION : REELS)]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Projeli' })).data.brand;
    // Senaryo yapay zekâyla yazılır (oluşturma isteği: kullanım satırı yanıttaki senaryoya bağlanır), sonra takvime eklenir
    const r = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Kahve' })).data.reels;
    const c = (await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/schedule`, { scheduledAt: '2026-11-20T10:00:00.000Z' })).data.content;
    // İçeriğin kendi yapay zekâ işi
    assert.equal((await s.request('POST', `/api/contents/${c.id}/write`, {})).status, 200);
    // Düzenleme, onay, yayın bağlantısı, performans
    await s.request('PATCH', `/api/contents/${c.id}`, { caption: 'Yeni açıklama', hashtags: '#kahve' });
    await s.request('POST', `/api/contents/${c.id}/review`, { action: 'gonder', force: true });
    await s.request('POST', `/api/contents/${c.id}/review`, { action: 'onayla', force: true });
    assert.equal((await s.request('PATCH', `/api/contents/${c.id}`, { publishedUrl: 'instagram.com/p/x' })).status, 400, 'http(s) ile başlamalı');
    await s.request('PATCH', `/api/contents/${c.id}`, { status: 'yayinlandi', publishedUrl: 'https://www.instagram.com/p/abc/' });
    await s.request('PATCH', `/api/contents/${c.id}`, { metrics: { views: 100, likes: 5 } });
    // Aynı değerle tekrar kayıt yeni olay üretmez
    await s.request('PATCH', `/api/contents/${c.id}`, { publishedUrl: 'https://www.instagram.com/p/abc/' });

    const t = (await s.request('GET', `/api/contents/${c.id}/timeline`)).data;
    assert.equal(t.publishedUrl, 'https://www.instagram.com/p/abc/');
    const kinds = t.events.map(e => e.kind);
    for (const k of ['senaryo', 'olusturuldu', 'metin', 'onay', 'durum', 'yayin', 'performans']) assert.ok(kinds.includes(k), `${k} olayı var`);
    assert.equal(kinds.filter(k => k === 'yayin').length, 1, 'değişmeyen bağlantı tekrar yazılmaz');
    assert.equal(kinds[0], 'senaryo', 'zaman sırası: önce senaryo');
    assert.ok(t.events.find(e => e.kind === 'senaryo').link.endsWith(`/reels/${r.id}`));
    // Yapay zekâ: senaryo yazımı (bağlı kayıt) + açıklama yazımı (içerik) = 2 çağrı
    assert.equal(t.ai.calls, 2, JSON.stringify(t.ai));
    assert.ok(t.ai.byModel.length >= 1);
    assert.ok(t.revisions >= 1);
    assert.equal(typeof t.duration.days, 'number', 'yayınlanınca süre hesaplanır');
    // Kayıtta bağlam gerçekten yazıldı
    const db = dbOf(s);
    const rows = db.prepare('SELECT content_id, ref, task FROM ai_usage ORDER BY created_at').all();
    db.close();
    assert.deepEqual(rows.map(x => [x.content_id, x.ref]), [[null, `reels:${r.id}`], [c.id, null]]);
    // İçerik penceresindeki alan: publishedUrl içerikte döner
    assert.equal((await s.request('GET', `/api/contents/${c.id}`)).data.content.publishedUrl, 'https://www.instagram.com/p/abc/');
    // Çöpe atılıp geri alınınca zaman çizelgesi korunur
    assert.equal((await s.request('DELETE', `/api/contents/${c.id}`)).status < 300, true);
    const trash = (await s.request('GET', '/api/trash')).data;
    const item = (trash.items || trash.trash || []).find(x => x.kind === 'content');
    await s.request('POST', `/api/trash/${item.id}/restore`);
    const t2 = (await s.request('GET', `/api/contents/${c.id}/timeline`)).data;
    assert.equal(t2.events.filter(e => e.kind === 'yayin').length, 1);
    // Akışlı (stream=1) oluşturmada da kullanım satırı yeni senaryoya bağlanır
    const sres = await fetch(`${s.base}/api/brands/${b.id}/reels?stream=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'Çay' }) });
    const sse = await sres.text();
    const done = JSON.parse(sse.split('event: done\ndata: ')[1].split('\n')[0]);
    const db2 = dbOf(s);
    assert.equal(db2.prepare('SELECT ref FROM ai_usage ORDER BY created_at DESC, rowid DESC LIMIT 1').get().ref, `reels:${done.body.reels.id}`);
    db2.close();
    // Başka markanın / olmayan içeriğin geçmişi yok
    assert.equal((await s.request('GET', '/api/contents/0f8fad5b-d9cb-469f-a165-70867728950e/timeline')).status, 404);
  } finally { await s.stop(); }
});

// Arayüz: içerik penceresinde yayın bağlantısı ve Geçmiş bölümü
import { createRequire } from 'node:module';
let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('Arayüz: içerik penceresinde yayın bağlantısı kaydedilir, Geçmiş zaman çizelgesini ve maliyeti gösterir', { skip: !chromium && 'Playwright yok' }, async () => {
  const s = await startServer();
  const browser = await chromium.launch();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Geçmişli' })).data.brand;
    const d = new Date(); d.setDate(15); d.setHours(12, 0, 0, 0);
    await s.request('POST', '/api/contents', { brandId: b.id, title: 'Proje içeriği', type: 'post', scheduledAt: d.toISOString() });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    const problems = [];
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(`${s.base}/#/m/${b.id}/takvim`);
    await page.locator('[data-item]', { hasText: 'Proje içeriği' }).first().click();
    await page.locator('.modal summary', { hasText: 'Paylaşım sonucu' }).click();
    await page.locator('#c-url').fill('https://www.instagram.com/p/xyz/');
    await page.locator('.modal').getByRole('button', { name: 'Kaydet' }).click();
    await page.locator('.modal').waitFor({ state: 'detached' });
    await page.locator('[data-item]', { hasText: 'Proje içeriği' }).first().click();
    await page.locator('#c-history summary').click();
    const hist = page.locator('#c-history-body');
    await hist.locator('.review-list').waitFor();
    const txt = await hist.innerText();
    assert.match(txt, /Takvime eklendi/); assert.match(txt, /Yayın bağlantısı/); assert.match(txt, /yapay zekâ çağrısı/);
    assert.equal(await hist.getByRole('link', { name: 'Yayını aç' }).getAttribute('href'), 'https://www.instagram.com/p/xyz/');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});

test('Operasyon maliyeti: marka başına ay özeti (içerik, süre, revizyon, yapay zekâ çağrısı ve tutar)', async () => {
  const provider = fakeProvider([p => (p.includes('Instagram içerik yazarısın') ? CAPTION : REELS)]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Operasyonlu' })).data.brand;
    const c = (await s.request('POST', '/api/contents', { brandId: b.id, title: 'İş', type: 'post', scheduledAt: new Date().toISOString() })).data.content;
    await s.request('POST', `/api/contents/${c.id}/write`, {});
    await s.request('PATCH', `/api/contents/${c.id}`, { caption: 'Düzeltilmiş' });
    await s.request('POST', `/api/contents/${c.id}/review`, { action: 'gonder', force: true });
    await s.request('POST', `/api/contents/${c.id}/review`, { action: 'duzelt', note: 'Fiyat yanlış' });
    await s.request('PATCH', `/api/contents/${c.id}`, { status: 'yayinlandi' });
    const month = new Date().toISOString().slice(0, 7);
    const ops = (await s.request('GET', `/api/operations?month=${month}&brandId=${b.id}`)).data;
    const r = ops.brands[0];
    assert.equal(r.brandName, 'Operasyonlu'); assert.equal(r.created, 1); assert.equal(r.completed, 1);
    assert.equal(r.revisions, 2, 'metin düzenlemesi + düzeltme istendi');
    assert.equal(r.aiCalls, 1); assert.equal(typeof r.avgDays, 'number');
    assert.equal(r.aiRealUsd + r.aiEstimatedUsd, r.aiUsd);
    assert.equal((await s.request('GET', '/api/operations?month=2026-13')).status, 400);
  } finally { await s.stop(); }
});
