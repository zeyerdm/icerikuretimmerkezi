// Yedekleme ve geri yükleme testleri
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, PNG_1PX } from './helpers.js';
import { writeZip, readZip } from '../server/lib/zip.js';

const KEY = 'AIzaSyTEST_ANAHTAR_0123456789abcdef';

async function seed(s, name = 'Yedek Markası') {
  const { data: { brand } } = await s.request('POST', '/api/brands', { name, sector: 'Kafe' });
  const up = await s.request('POST', `/api/brands/${brand.id}/assets?category=logo&label=Logo`, PNG_1PX, { 'Content-Type': 'image/png' });
  assert.equal(up.status, 201);
  await s.request('POST', `/api/brands/${brand.id}/ideas`, { title: 'Fikir 1', category: 'egitici' });
  await s.request('POST', '/api/contents', { brandId: brand.id, title: 'İçerik 1', type: 'post', status: 'taslak' });
  await s.request('POST', '/api/tasks', { title: 'Görev 1' });
  await s.request('POST', '/api/notes', { body: 'Not 1' });
  return { brand, asset: up.data.asset };
}

test('zip: yazılan arşiv aynen okunur; bozuk arşiv reddedilir', () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('merhaba '.repeat(100)) },
    { name: 'klasör/ğüş.png', data: PNG_1PX },
    { name: 'bos.txt', data: Buffer.alloc(0) }
  ];
  const zip = writeZip(entries);
  const back = readZip(zip);
  assert.deepEqual(back.map(e => e.name), entries.map(e => e.name));
  back.forEach((e, i) => assert.ok(e.data.equals(entries[i].data)));
  const broken = Buffer.from(zip);
  broken[40] ^= 0xff;
  assert.throws(() => readZip(broken));
  assert.throws(() => readZip(Buffer.from('zip değil')));
});

test('yedek al: veriler ve dosyalar zip içinde; API anahtarı yedeğe girmez', async () => {
  const s = await startServer();
  try {
    await s.request('PUT', '/api/settings/ai', { apiKey: KEY });
    await seed(s);
    const r = await s.request('POST', '/api/backups');
    assert.equal(r.status, 201);
    assert.equal(r.data.backup.kind, 'elle');
    assert.match(r.data.backup.name, /^yedek-\d{4}-\d{2}-\d{2}-\d{6}-elle\.zip$/);
    assert.equal(r.data.backups.length, 1);

    const dl = await s.request('GET', '/api/backups/' + r.data.backup.name);
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get('content-disposition'), /attachment/);
    const entries = readZip(dl.data);
    const names = entries.map(e => e.name);
    assert.ok(names.includes('yedek.json') && names.includes('app.db'));
    assert.ok(names.some(n => /^uploads\/[^/]+\/[^/]+\.png$/.test(n)), 'logo yedekte yok');
    const meta = JSON.parse(entries.find(e => e.name === 'yedek.json').data);
    assert.equal(meta.counts.brands, 1);
    assert.equal(meta.counts.tasks, 1);
    const db = entries.find(e => e.name === 'app.db').data;
    assert.ok(!db.includes(Buffer.from(KEY)), 'API anahtarı yedeğe girdi');
  } finally { await s.stop(); }
});

test('geri yükle: sonradan yapılan değişiklikler geri alınır, anahtar korunur, öncesinin yedeği alınır', async () => {
  const s = await startServer();
  try {
    await s.request('PUT', '/api/settings/ai', { apiKey: KEY });
    const { brand } = await seed(s);
    const { data: { backup } } = await s.request('POST', '/api/backups');

    // Yedekten sonra: marka silinir, yeni marka ve görev eklenir
    await s.request('DELETE', `/api/brands/${brand.id}`);
    await s.request('POST', '/api/brands', { name: 'Sonradan Eklenen' });
    await s.request('POST', '/api/tasks', { title: 'Sonradan görev' });

    const r = await s.request('POST', `/api/backups/${backup.name}/restore`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.result.safetyBackup.endsWith('-geri-yukleme-oncesi.zip'));

    const brands = (await s.request('GET', '/api/brands')).data.brands;
    assert.deepEqual(brands.map(b => b.name), ['Yedek Markası']);
    const tasks = (await s.request('GET', '/api/tasks')).data.tasks;
    assert.deepEqual(tasks.map(t => t.title), ['Görev 1']);
    const assets = (await s.request('GET', `/api/brands/${brand.id}/assets`)).data.assets;
    assert.equal(assets.length, 1);
    const file = await s.request('GET', assets[0].url);
    assert.equal(file.status, 200, 'logo dosyası geri gelmedi');
    assert.ok(file.data.equals(PNG_1PX));
    assert.equal((await s.request('GET', '/api/settings')).data.ai.configured, true, 'API anahtarı kayboldu');

    // Geri yükleme öncesi yedekle geri yüklemenin kendisi de geri alınabilir
    await s.request('POST', `/api/backups/${r.data.result.safetyBackup}/restore`);
    const again = (await s.request('GET', '/api/brands')).data.brands.map(b => b.name);
    assert.deepEqual(again, ['Sonradan Eklenen']);
  } finally { await s.stop(); }
});

test('başka bilgisayardan yedek dosyası yüklenip geri yüklenebilir', async () => {
  const a = await startServer();
  const b = await startServer();
  try {
    await seed(a, 'Taşınan Marka');
    const { data: { backup } } = await a.request('POST', '/api/backups');
    const zip = (await a.request('GET', '/api/backups/' + backup.name)).data;

    const r = await b.request('POST', '/api/backups/restore-upload', zip, { 'Content-Type': 'application/zip' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const brands = (await b.request('GET', '/api/brands')).data.brands;
    assert.deepEqual(brands.map(x => x.name), ['Taşınan Marka']);
    // Kayıtlar yeni kurulumun sahibine bağlanır: görev ve not görünür, yeni kayıt eklenebilir
    assert.equal((await b.request('GET', '/api/tasks')).data.tasks.length, 1);
    assert.equal((await b.request('GET', '/api/notes')).data.notes.length, 1);
    assert.equal((await b.request('POST', '/api/tasks', { title: 'Yeni' })).status, 201);
    assert.equal((await b.request('PATCH', `/api/brands/${brands[0].id}`, { sector: 'Fırın' })).status, 200);
  } finally { await a.stop(); await b.stop(); }
});

test('geçersiz yedekler reddedilir ve mevcut veri bozulmaz', async () => {
  const s = await startServer();
  try {
    await seed(s);
    const bad = [
      Buffer.from('bu bir zip değil'),
      writeZip([{ name: 'yedek.json', data: Buffer.from('{"app":"baska-uygulama"}') }, { name: 'app.db', data: Buffer.from('x') }]),
      writeZip([{ name: 'yedek.json', data: Buffer.from('{"app":"icerik-uretim-merkezi"}') }, { name: 'app.db', data: Buffer.from('SQLite format 3\0bozuk') }])
    ];
    for (const body of bad) {
      const r = await s.request('POST', '/api/backups/restore-upload', body, { 'Content-Type': 'application/zip' });
      assert.equal(r.status, 400, JSON.stringify(r.data));
      assert.equal(r.data.error.code, 'BAD_BACKUP');
    }
    assert.equal((await s.request('GET', '/api/brands')).data.brands.length, 1);
    assert.equal((await s.request('POST', '/api/backups/..%2F..%2Fapp.db/restore')).status, 404);
    assert.equal((await s.request('GET', '/api/backups/yedek-yok.zip')).status, 404);
  } finally { await s.stop(); }
});

test('günlük otomatik yedek: veri yoksa alınmaz, günde bir kez alınır, eskiler silinir', async () => {
  const s = await startServer();
  const { createApp } = await import('../server/app.js');
  try {
    const { backups, close } = createApp({ dataDir: s.dataDir });
    try {
      assert.equal(backups.ensureDaily(), null, 'boş uygulamada yedek alındı');
      await seed(s);
      const first = backups.ensureDaily();
      assert.equal(first.kind, 'otomatik');
      assert.equal(backups.ensureDaily(), null, 'aynı gün ikinci otomatik yedek alındı');

      // 20 eski otomatik yedek: en yeni 14'ü kalır; elle alınanlar silinmez
      const dir = path.join(s.dataDir, 'backups');
      for (let i = 1; i <= 20; i++) fs.copyFileSync(path.join(dir, first.name), path.join(dir, `yedek-2020-01-${String(i).padStart(2, '0')}-120000-otomatik.zip`));
      fs.copyFileSync(path.join(dir, first.name), path.join(dir, 'yedek-2019-01-01-120000-elle.zip'));
      backups.create('elle');
      const list = backups.list();
      assert.equal(list.filter(b => b.kind === 'otomatik').length, 14);
      assert.ok(list.some(b => b.name === first.name), 'bugünkü yedek silindi');
      assert.ok(list.some(b => b.name === 'yedek-2019-01-01-120000-elle.zip'), 'elle alınan yedek silindi');
    } finally { close(); }
  } finally { await s.stop(); }
});

test('ek klasör (ör. Google Drive): yedekler oraya da kopyalanır; geçersiz klasör reddedilir', async () => {
  const s = await startServer();
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-drive-'));
  try {
    await seed(s);
    assert.equal((await s.request('PUT', '/api/settings/backup', { copyDir: 'goreli/klasor' })).status, 400);
    assert.equal((await s.request('PUT', '/api/settings/backup', { copyDir: path.join(extra, 'yok') })).status, 400);
    await s.request('POST', '/api/backups');
    const r = await s.request('PUT', '/api/settings/backup', { copyDir: extra });
    assert.equal(r.status, 200);
    assert.equal(r.data.copyDir, extra);
    assert.equal(fs.readdirSync(extra).filter(n => n.endsWith('.zip')).length, 1, 'mevcut son yedek kopyalanmadı');
    await s.request('POST', '/api/backups');
    assert.equal(fs.readdirSync(extra).filter(n => n.endsWith('.zip')).length, 2);
    // Klasör yolu yedeğe girmez (bu bilgisayara özel)
    const name = (await s.request('GET', '/api/backups')).data.backups[0].name;
    const db = readZip((await s.request('GET', '/api/backups/' + name)).data).find(e => e.name === 'app.db').data;
    assert.ok(!db.includes(Buffer.from(extra)));
    const off = await s.request('PUT', '/api/settings/backup', { copyDir: '' });
    assert.equal(off.data.copyDir, '');
  } finally { await s.stop(); fs.rmSync(extra, { recursive: true, force: true }); }
});

test('yedek silinebilir', async () => {
  const s = await startServer();
  try {
    await seed(s);
    const { data: { backup } } = await s.request('POST', '/api/backups');
    const r = await s.request('DELETE', '/api/backups/' + backup.name);
    assert.equal(r.status, 200);
    assert.equal(r.data.backups.length, 0);
  } finally { await s.stop(); }
});

test('önceki sürüme dön (API): başlatıcı yoksa ve önceki sürüm yoksa açık hata; varsa başlatıcıya geri alma kodu', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-root-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'icerik-uretim-merkezi', version: '0.1.0' }));
  const codes = [];
  const s = await startServer({ root, restart: code => codes.push(code) });
  const prevEnv = process.env.SUPERVISED;
  try {
    delete process.env.SUPERVISED;
    assert.equal((await s.request('POST', '/api/system/rollback')).data.error.code, 'NOT_SUPERVISED');
    process.env.SUPERVISED = '1';
    assert.equal((await s.request('POST', '/api/system/rollback')).data.error.code, 'NO_PREVIOUS');
    assert.equal((await s.request('GET', '/api/system')).data.previous, null);

    fs.mkdirSync(path.join(root, '.onceki-surum', 'server'), { recursive: true });
    fs.writeFileSync(path.join(root, '.onceki-surum', 'server', 'index.js'), '');
    fs.writeFileSync(path.join(root, '.onceki-surum', '.version'), JSON.stringify({ sha: 'c'.repeat(40) }));
    assert.equal((await s.request('GET', '/api/system')).data.previous.sha, 'c'.repeat(40));
    assert.equal((await s.request('POST', '/api/system/rollback')).status, 202);
    assert.equal((await s.request('POST', '/api/system/restart', { force: true })).status, 202);
    assert.equal((await s.request('POST', '/api/system/restart')).status, 202);
    await new Promise(r => setTimeout(r, 600));
    assert.deepEqual(codes, [76, 77, 75]);
  } finally {
    if (prevEnv === undefined) delete process.env.SUPERVISED; else process.env.SUPERVISED = prevEnv;
    await s.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
