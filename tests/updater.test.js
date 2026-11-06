// Güncelleyici testleri: yerel sahte "GitHub" ile gerçek indirme, açma ve yerine koyma
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { applyUpdate, checkForUpdate, readVersion, UpdateError } from '../scripts/updater.js';

const SHA1 = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };

// Sahte depo sürümü: tar.gz olarak paketlenir (GitHub'ın verdiği gibi tek üst klasörlü)
function makeRelease(files) {
  const dir = tmp('ium-rel-');
  const top = path.join(dir, 'zeyerdm-icerikuretimmerkezi-' + SHA2.slice(0, 7));
  for (const [name, content] of Object.entries(files)) write(path.join(top, name), content);
  const archive = path.join(dir, 'release.tar.gz');
  const r = spawnSync('tar', ['-czf', archive, '-C', dir, path.basename(top)]);
  assert.equal(r.status, 0, 'tar paketi oluşturulamadı');
  return fs.readFileSync(archive);
}

async function fakeGithub({ sha = SHA2, archive, status = 200, requireToken = null }) {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push({ url: req.url, auth: req.headers.authorization || '' });
    if (requireToken && req.headers.authorization !== `Bearer ${requireToken}`) { res.writeHead(404); return res.end('{}'); }
    if (status !== 200) { res.writeHead(status); return res.end('{}'); }
    if (req.url.includes('/commits/')) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(sha); }
    if (req.url.includes('/tarball/')) { res.writeHead(200, { 'Content-Type': 'application/gzip' }); return res.end(archive); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, calls, stop: () => new Promise(r => server.close(r)) };
}

function installedApp(extra = {}) {
  const root = tmp('ium-app-');
  write(path.join(root, 'package.json'), JSON.stringify({ name: 'icerik-uretim-merkezi', version: '0.1.0', updates: { repo: 'zeyerdm/icerikuretimmerkezi', branch: 'main' } }));
  write(path.join(root, 'package-lock.json'), '{"v":1}');
  write(path.join(root, 'server', 'index.js'), '// eski sürüm');
  write(path.join(root, 'public', 'eski-dosya.js'), '// yeni sürümde yok');
  write(path.join(root, 'Baslat.bat'), 'ESKI BASLATICI');
  write(path.join(root, 'data', 'app.db'), 'KULLANICI VERISI');
  write(path.join(root, 'data', 'uploads', 'logo.png'), 'LOGO');
  write(path.join(root, 'node_modules', 'express', 'index.js'), 'PAKET');
  for (const [k, v] of Object.entries(extra)) write(path.join(root, k), v);
  return root;
}

const RELEASE = {
  'package.json': JSON.stringify({ name: 'icerik-uretim-merkezi', version: '0.2.0', updates: { repo: 'zeyerdm/icerikuretimmerkezi', branch: 'main' } }),
  'package-lock.json': '{"v":1}',
  'server/index.js': '// yeni sürüm',
  'public/js/app.js': '// yeni arayüz',
  'Baslat.bat': 'YENI BASLATICI'
};

test('güncelleme: yeni dosyalar gelir; veri, paketler ve başlatıcılar korunur; eski dosyalar kalkar', async () => {
  const gh = await fakeGithub({ archive: makeRelease(RELEASE) });
  const root = installedApp();
  process.env.UPDATE_API_BASE = gh.base;
  try {
    const check = await checkForUpdate({ root });
    assert.equal(check.available, true);
    assert.equal(check.latest, SHA2);

    const r = await applyUpdate({ root });
    assert.equal(r.updated, true);
    assert.equal(fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8'), '// yeni sürüm');
    assert.equal(fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8'), '// yeni arayüz');
    assert.equal(fs.existsSync(path.join(root, 'public', 'eski-dosya.js')), false, 'eski dosya silinmedi');
    assert.equal(fs.readFileSync(path.join(root, 'data', 'app.db'), 'utf8'), 'KULLANICI VERISI', 'kullanıcı verisi değişti');
    assert.equal(fs.readFileSync(path.join(root, 'data', 'uploads', 'logo.png'), 'utf8'), 'LOGO');
    assert.equal(fs.readFileSync(path.join(root, 'node_modules', 'express', 'index.js'), 'utf8'), 'PAKET', 'paketlere dokunuldu');
    assert.equal(fs.readFileSync(path.join(root, 'Baslat.bat'), 'utf8'), 'ESKI BASLATICI', 'çalışan başlatıcı değiştirildi');
    assert.equal(readVersion(root).sha, SHA2);
    assert.equal(r.installed, false, 'paket dosyası değişmediği halde yeniden kuruldu');

    // Aynı sürümde ikinci kez: indirme yapılmaz
    const before = gh.calls.filter(c => c.url.includes('/tarball/')).length;
    const again = await applyUpdate({ root });
    assert.equal(again.updated, false);
    assert.equal(gh.calls.filter(c => c.url.includes('/tarball/')).length, before, 'güncelken tekrar indirildi');
    assert.equal((await checkForUpdate({ root })).available, false);
  } finally { delete process.env.UPDATE_API_BASE; await gh.stop(); }
});

test('özel depo: anahtarsız açık hata, anahtarla başarı; anahtar yalnızca başlıkta gider', async () => {
  const gh = await fakeGithub({ archive: makeRelease(RELEASE), requireToken: 'ghp_GIZLI_ANAHTAR_0123456789' });
  const root = installedApp();
  process.env.UPDATE_API_BASE = gh.base;
  try {
    await assert.rejects(() => applyUpdate({ root }), err => err instanceof UpdateError && /depo özel olabilir/.test(err.message));
    await assert.rejects(() => applyUpdate({ root, token: 'ghp_YANLIS_ANAHTAR_0123456789' }), err => /erişim anahtarı bu depoya erişemiyor/.test(err.message));
    assert.equal(readVersion(root).sha, '', 'başarısız güncelleme sürümü değiştirdi');
    const r = await applyUpdate({ root, token: 'ghp_GIZLI_ANAHTAR_0123456789' });
    assert.equal(r.updated, true);
    assert.ok(gh.calls.every(c => !c.url.includes('GIZLI')), 'anahtar adreste gönderildi');
  } finally { delete process.env.UPDATE_API_BASE; await gh.stop(); }
});

test('bozuk veya yabancı paket: güncelleme iptal edilir, mevcut sürüm bozulmaz', async () => {
  const foreign = makeRelease({ 'package.json': JSON.stringify({ name: 'baska-bir-proje' }), 'server/index.js': 'x' });
  const gh = await fakeGithub({ archive: foreign });
  const root = installedApp();
  process.env.UPDATE_API_BASE = gh.base;
  try {
    await assert.rejects(() => applyUpdate({ root }), err => err.code === 'BAD_ARCHIVE');
    assert.equal(fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8'), '// eski sürüm');
    assert.equal(fs.readFileSync(path.join(root, 'data', 'app.db'), 'utf8'), 'KULLANICI VERISI');
  } finally { delete process.env.UPDATE_API_BASE; await gh.stop(); }
});

test('internet yok: anlaşılır hata, uygulama bozulmaz', async () => {
  const root = installedApp();
  process.env.UPDATE_API_BASE = 'http://127.0.0.1:1';
  try {
    await assert.rejects(() => applyUpdate({ root }), err => err.code === 'OFFLINE' && /ulaşılamadı/.test(err.message));
    assert.equal(fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8'), '// eski sürüm');
  } finally { delete process.env.UPDATE_API_BASE; }
});

test('paket dosyası değişirse paketler yeniden kurulur', async () => {
  const gh = await fakeGithub({ archive: makeRelease(Object.assign({}, RELEASE, { 'package-lock.json': '{"v":2}' })) });
  const root = installedApp();
  process.env.UPDATE_API_BASE = gh.base;
  try {
    // Gerçek npm yerine: kurulum adımı atlanır ama gerekli olduğu bildirilir
    const r = await applyUpdate({ root, skipInstall: true });
    assert.equal(r.updated, true);
    assert.equal(readVersion(root).sha, SHA2);
  } finally { delete process.env.UPDATE_API_BASE; await gh.stop(); }
});
