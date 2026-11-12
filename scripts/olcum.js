// 8.9 Büyük veride hız ölçümü (geliştirici aracı): geçici veritabanına çok sayıda kayıt yazar, sık kullanılan
// uç noktaların sürelerini ve yanıt boyutlarını ölçer. Kullanım: node scripts/olcum.js [içerik sayısı]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.js';

const N = Number(process.argv[2]) || 5000;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-olcum-'));
const { app, close } = createApp({ dataDir, restart: () => {} });
const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://localhost:${server.address().port}`;
const req = async (method, url, body) => {
  const t = performance.now();
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { ms: performance.now() - t, kb: Buffer.byteLength(text) / 1024, status: res.status, data: text ? JSON.parse(text) : null };
};

try {
  const brands = [];
  for (let i = 0; i < 5; i++) brands.push((await req('POST', '/api/brands', { name: `Marka ${i + 1}` })).data.brand);
  // Kayıtlar doğrudan veritabanına (API ile 5.000 istek ölçümü uzatırdı)
  const db = new DatabaseSync(path.join(dataDir, fs.readdirSync(dataDir).find(f => f.endsWith('.db'))));
  const owner = db.prepare('SELECT owner_id FROM brands LIMIT 1').get().owner_id;
  const types = ['post', 'reels', 'story', 'carousel'];
  const statuses = ['taslak', 'hazirlaniyor', 'onay', 'tamamlandi'];
  const day = 864e5;
  const start = Date.now() - 365 * day;
  db.exec('BEGIN');
  const ins = db.prepare('INSERT INTO contents (id, brand_id, idea_id, title, type, status, scheduled_at, notes, completed_at, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < N; i++) {
    const at = new Date(start + (i / N) * 455 * day).toISOString();
    const st = statuses[i % 4];
    ins.run(randomUUID(), brands[i % 5].id, `İçerik ${i}`, types[i % 4], st, i % 10 === 0 ? null : at, 'not '.repeat(20), st === 'tamamlandi' ? at : null, at, at);
  }
  const idea = db.prepare("INSERT INTO ideas (id, brand_id, title, description, category, created_at) VALUES (?, ?, ?, '', 'guncel', ?)");
  for (let i = 0; i < N; i++) idea.run(randomUUID(), brands[i % 5].id, `Fikir ${i}`, new Date(start + (i / N) * 365 * day).toISOString());
  const task = db.prepare("INSERT INTO tasks (id, owner_id, brand_id, title, priority, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, 'orta', ?, ?, ?, ?)");
  for (let i = 0; i < N / 5; i++) { const at = new Date(start + (i / N) * 5 * 365 * day).toISOString(); task.run(randomUUID(), owner, brands[i % 5].id, `Görev ${i}`, i % 3 ? 'yapilacak' : 'tamamlandi', at.slice(0, 10), at, at); }
  db.exec('COMMIT');
  db.close();

  const now = new Date();
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthTo = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const cases = [
    ['Yönetim Merkezi (bütün markalar)', '/api/dashboard'],
    ['Marka ana sayfası', `/api/dashboard?brandId=${brands[0].id}`],
    ['Takvim (bu ay)', `/api/contents?from=${encodeURIComponent(monthFrom)}&to=${encodeURIComponent(monthTo)}`],
    ['Takvim (marka, bu ay)', `/api/contents?brandId=${brands[0].id}&from=${encodeURIComponent(monthFrom)}&to=${encodeURIComponent(monthTo)}`],
    ['İçerik arşivi (hepsi)', '/api/contents'],
    ['Performans', '/api/performance'],
    ['Fikirler (marka)', `/api/brands/${brands[0].id}/ideas`]
  ];
  console.log(`${N} içerik, ${N} fikir, ${N / 5} görev, 5 marka\n`);
  for (const [label, url] of cases) {
    await req('GET', url); // ısınma
    const runs = [];
    let last;
    for (let i = 0; i < 5; i++) { last = await req('GET', url); runs.push(last.ms); }
    runs.sort((a, b) => a - b);
    console.log(`${label.padEnd(34)} ${String(Math.round(runs[2])).padStart(5)} ms  ${String(Math.round(last.kb)).padStart(6)} KB  (${last.status})`);
  }
  // Tarayıcıda sayfa çizim süresi (Playwright varsa)
  let chromium = null;
  try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* yoksa atlanır */ }
  if (chromium) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    await page.addInitScript(() => { localStorage.setItem('ium.tourDone', '1'); });
    const pages = [['Yönetim Merkezi', '/#/', '.page-head, h1'], ['Takvim (bütün markalar)', '/#/takvim', '.cal, .calendar, [data-cal]'], ['İçerik arşivi', '/#/arsiv', 'table, .archive, .pool-list'], ['Analiz', '/#/analiz', '.card']];
    console.log('');
    for (const [label, hash] of pages) {
      await page.goto('about:blank');
      const t = performance.now();
      await page.goto(base + hash);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      console.log(`${('Sayfa: ' + label).padEnd(34)} ${String(Math.round(performance.now() - t)).padStart(5)} ms`);
    }
    await browser.close();
  }
} finally {
  await new Promise(r => { server.close(r); server.closeAllConnections(); });
  close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
