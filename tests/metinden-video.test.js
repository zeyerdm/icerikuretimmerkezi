// 8.14 Metinden video (Veo): bağlı değilse kapalı; uzun süren işlem başlatılır, sorgulanır, bitince indirilir.
import { test } from 'node:test';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { startServer, fakeGeminiReels as baseGemini } from './helpers.js';

const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const MP4 = Buffer.from('00000018667479706d703432', 'hex');

function veo({ fail = false } = {}) {
  const base = baseGemini();
  const calls = [];
  let polls = 0;
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ path: u.pathname, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, key: new Headers(init.headers).get('x-goog-api-key') });
    if (u.pathname.endsWith(':predictLongRunning')) return json({ name: `models/${decodeURIComponent(u.pathname.split('/').pop().split(':')[0])}/operations/op${calls.length}` });
    if (u.pathname.includes('/operations/')) {
      polls++;
      if (polls < 2) return json({ name: 'x', done: false });
      if (fail) return json({ name: 'x', done: true, error: { code: 3, message: 'Prompt güvenlik filtresine takıldı' } });
      return json({ name: 'x', done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media' } }] } } });
    }
    if (u.pathname.includes('/files/')) return new Response(MP4, { status: 200, headers: { 'Content-Type': 'video/mp4' } });
    return base.impl(url, init);
  };
  return { impl, calls };
}

test('8.14 video üretimi: anahtar yokken kapalı; başlat → sorgula → indir, tutar yazılır; hata işi; başka marka', async () => {
  const v = veo();
  const s = await startServer({ fetchImpl: v.impl, videoPollMs: 0 });
  try {
    assert.equal((await s.request('GET', '/api/video-gen')).data.configured, false, 'anahtar yokken düğme gösterilmez');
    await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' });
    const ov = (await s.request('GET', '/api/video-gen')).data;
    assert.equal(ov.configured, true);
    assert.equal(ov.models[0].cost, 1.2);
    const b = (await s.request('POST', '/api/brands', { name: 'Videolu' })).data.brand;
    const r = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Vize' })).data.reels;
    assert.equal((await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/video`, { sceneIndex: 9 })).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/video`, { sceneIndex: 0, aspect: '4:3' })).status, 400);

    const job = (await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/video`, { sceneIndex: 1, aspect: '9:16' })).data.job;
    assert.equal(job.status, 'bekliyor');
    const start = v.calls.find(c => c.path.endsWith(':predictLongRunning'));
    assert.match(start.path, /veo-3\.0-fast-generate-001:predictLongRunning$/);
    assert.equal(start.body.parameters.aspectRatio, '9:16');
    assert.equal(start.body.instances[0].prompt, r.prompts[1].cleanEn, 'sahnenin yazısız İngilizce prompt\'u');
    assert.equal(start.key, 'AIzaTEST0123456789abcdefghijklmnop');

    let list = (await s.request('GET', `/api/brands/${b.id}/video-jobs?reelsId=${r.id}`)).data.jobs;
    assert.equal(list[0].status, 'bekliyor', 'ilk sorguda hâlâ üretiliyor');
    list = (await s.request('GET', `/api/brands/${b.id}/video-jobs?reelsId=${r.id}`)).data.jobs;
    assert.equal(list[0].status, 'hazir');
    assert.equal(list[0].cost, 1.2);
    const f = await fetch(s.base + list[0].url);
    assert.equal(f.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await f.arrayBuffer()), MP4);
    const usage = JSON.stringify((await s.request('GET', '/api/ai/usage')).data);
    assert.ok(usage.includes('Video üretimi'));
    // Başka marka göremez; silinince dosya da gider
    const o = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    assert.equal((await fetch(`${s.base}/api/brands/${o.id}/video-jobs/${list[0].id}/file`)).status, 404);
    assert.equal((await s.request('DELETE', `/api/brands/${b.id}/video-jobs/${list[0].id}`)).status, 204);
    assert.equal((await fetch(s.base + list[0].url)).status, 404);
  } finally { await s.stop(); }
});

test('8.14 sağlayıcı hata döndürünce iş "Hata" olur ve tutar yazılmaz', async () => {
  const v = veo({ fail: true });
  const s = await startServer({ fetchImpl: v.impl, videoPollMs: 0 });
  try {
    await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' });
    const b = (await s.request('POST', '/api/brands', { name: 'Hatalı' })).data.brand;
    const r = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Vize' })).data.reels;
    await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/video`, { sceneIndex: 0 });
    await s.request('GET', `/api/brands/${b.id}/video-jobs`);
    const j = (await s.request('GET', `/api/brands/${b.id}/video-jobs`)).data.jobs[0];
    assert.equal(j.status, 'hata');
    assert.match(j.error, /güvenlik filtresine/);
    assert.equal(j.cost, 0);
    assert.equal(j.url, null);
  } finally { await s.stop(); }
});

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('8.14 arayüz: anahtar yokken panel yok; varken sahne videosu başlatılır, hazır olunca oynatıcı görünür', { skip: !chromium && 'Playwright yok' }, async () => {
  const v = veo();
  const s = await startServer({ fetchImpl: v.impl, videoPollMs: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    const problems = [];
    page.on('pageerror', e => problems.push(e.message));
    page.on('dialog', d => d.accept());
    await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' });
    const b = (await s.request('POST', '/api/brands', { name: 'Video UI' })).data.brand;
    const r = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Vize' })).data.reels;
    await page.goto(`${s.base}/#/m/${b.id}/reels/${r.id}`);
    await page.locator('.ed-rail [data-rail="video"]').click();
    await page.locator('[data-vg-scene="0"]').click();
    await page.locator('#vg-jobs .vg-job', { hasText: 'Üretiliyor' }).waitFor();
    for (let i = 0; i < 2; i++) { await page.reload(); await page.locator('.ed-rail [data-rail="video"]').waitFor(); }
    await page.locator('.ed-rail [data-rail="video"]').click();
    await page.locator('#vg-jobs video.vg-video').waitFor();
    // Anahtar kaldırılınca panel görünmez
    await s.request('DELETE', '/api/ai/keys/gemini');
    await page.reload();
    await page.locator('.ed-rail [data-rail="ses"]').waitFor();
    assert.equal(await page.locator('.ed-rail [data-rail="video"]').count(), 0);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
