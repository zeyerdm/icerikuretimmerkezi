// Başlatma testleri: port başka bir uygulamayla doluyken (örn. kapatılmamış eski sürüm) doğru davranış
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const listen = (server, port = 0) => new Promise(r => server.listen(port, '127.0.0.1', () => r(server.address().port)));

const isFree = port => new Promise(resolve => {
  const probe = http.createServer();
  probe.once('error', () => resolve(false));
  probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});
// Ardışık iki boş port (20000-40000 arası)
async function freePair() {
  for (;;) {
    const port = 20000 + Math.floor(Math.random() * 20000);
    if (await isFree(port) && await isFree(port + 1)) return port;
  }
}

function runServer(env) {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const waitFor = (re, ms = 8000) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (re.test(out)) return resolve(out);
      if (Date.now() - t0 > ms) return reject(new Error('Beklenen çıktı gelmedi:\n' + out));
      setTimeout(tick, 50);
    };
    tick();
  });
  const exited = new Promise(r => child.on('exit', code => r(code)));
  return { child, waitFor, exited, output: () => out };
}

test('port yabancı bir uygulamayla doluysa: sıradaki portta açılır ve eski pencere uyarısı verilir', async () => {
  // 3000 gibi bir portu eski sürüm tutuyor: /api/system yok (404)
  // Port, işletim sisteminin rastgele dağıttığı aralığın dışından seçilir: Windows boş portları sırayla
  // dağıttığı için aynı anda çalışan başka bir test sunucusu yoksa base+1'e düşebilir
  const old = http.createServer((req, res) => { res.writeHead(404); res.end('{}'); });
  const base = await freePair();
  await listen(old, base);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-start-'));
  const a = runServer({ PORT: String(base), DATA_DIR: dataDir });
  let b;
  try {
    await a.waitFor(/çalışıyor: http:\/\/localhost:\d+/);
    assert.match(a.output(), new RegExp(`UYARI: ${base} numaralı portu başka bir uygulama`), 'uyarı yok');
    assert.match(a.output(), /eski bir siyah pencere/);
    assert.ok(a.output().includes(`http://localhost:${base + 1}`), 'sıradaki portta açılmadı: ' + a.output());
    const health = await (await fetch(`http://localhost:${base + 1}/api/health`)).json();
    assert.equal(health.ok, true);

    // Aynı klasörden ikinci kez açılırsa yeni sunucu başlatılmaz: "zaten açık" der ve çıkar
    b = runServer({ PORT: String(base), DATA_DIR: dataDir });
    const code = await b.exited;
    assert.equal(code, 0);
    assert.match(b.output(), new RegExp(`Uygulama zaten açık: http://localhost:${base + 1}`));
  } finally {
    a.child.kill();
    if (b) b.child.kill();
    old.close();
    await a.exited;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('port boşsa doğrudan o portta açılır, uyarı çıkmaz; arayüz önbelleğe alınmaz', async () => {
  const free = await freePair();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-start-'));
  const a = runServer({ PORT: String(free), DATA_DIR: dataDir });
  try {
    await a.waitFor(/çalışıyor/);
    assert.ok(a.output().includes(`http://localhost:${free}`));
    assert.ok(!a.output().includes('UYARI'));
    const res = await fetch(`http://localhost:${free}/js/app.js`);
    assert.equal(res.headers.get('cache-control'), 'no-cache', 'arayüz dosyaları önbelleğe alınabiliyor');
    const info = await (await fetch(`http://localhost:${free}/api/system`)).json();
    assert.equal(info.instance, ROOT);
  } finally {
    a.child.kill();
    await a.exited;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

// Başlatıcı (scripts/start.js) uçtan uca: GitHub'dan gelen yeni sürüm açılamazsa önceki sürüme döner
test('başlatıcı: açılamayan yeni sürüm kendiliğinden geri alınır ve bir daha kurulmaz', async () => {
  const OLD = 'a'.repeat(40);
  const NEW = 'b'.repeat(40);
  const pkg = JSON.stringify({ name: 'icerik-uretim-merkezi', version: '0.1.0', updates: { repo: 'x/y', branch: 'main' } });
  const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-sup-'));
  const root = path.join(work, 'app');
  // Kurulu sürüm: sunucu açılır ("ready") ve kapanır
  write(path.join(root, 'package.json'), pkg);
  write(path.join(root, 'package-lock.json'), '{}');
  write(path.join(root, '.version'), JSON.stringify({ sha: OLD }));
  write(path.join(root, 'node_modules', 'express', 'index.js'), '');
  for (const f of ['start.js', 'updater.js']) write(path.join(root, 'scripts', f), fs.readFileSync(path.join(ROOT, 'scripts', f)));
  write(path.join(root, 'server', 'index.js'), "console.log('ESKI SURUM ACILDI'); process.send({ type: 'ready' }); setTimeout(() => process.exit(0), 50);");
  // GitHub'daki yeni sürüm: açılırken çöker
  const top = path.join(work, 'rel', 'x-y-' + NEW.slice(0, 7));
  write(path.join(top, 'package.json'), pkg);
  write(path.join(top, 'package-lock.json'), '{}');
  write(path.join(top, 'server', 'index.js'), "console.log('YENI SURUM'); process.exit(1);");
  for (const f of ['start.js', 'updater.js']) write(path.join(top, 'scripts', f), fs.readFileSync(path.join(ROOT, 'scripts', f)));
  const archive = path.join(work, 'rel.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', archive, '-C', path.join(work, 'rel'), path.basename(top)]).status, 0);
  const gh = http.createServer((req, res) => {
    if (req.url.includes('/commits/')) { res.writeHead(200); return res.end(NEW); }
    if (req.url.includes('/tarball/')) { res.writeHead(200); return res.end(fs.readFileSync(archive)); }
    res.writeHead(404); res.end();
  });
  const ghPort = await listen(gh);
  const run = () => new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'start.js')], {
      cwd: root, env: Object.assign({}, process.env, { UPDATE_API_BASE: `http://127.0.0.1:${ghPort}`, GITHUB_TOKEN: '', SKIP_UPDATE: '', DATA_DIR: path.join(root, 'data') })
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => child.kill(), 20000);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, out }); });
  });
  try {
    const first = await run();
    assert.equal(first.code, 0, first.out);
    assert.match(first.out, /YENI SURUM/);
    assert.match(first.out, /Yeni sürüm açılamadı/);
    assert.match(first.out, /ESKI SURUM ACILDI/);
    assert.match(fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8'), /ESKI SURUM/);
    const v = JSON.parse(fs.readFileSync(path.join(root, '.version'), 'utf8'));
    assert.equal(v.sha, OLD);
    assert.equal(v.skipSha, NEW);

    // Sonraki açılışta aynı bozuk sürüm yeniden kurulmaz
    const second = await run();
    assert.equal(second.code, 0, second.out);
    assert.doesNotMatch(second.out, /YENI SURUM/);
    assert.match(second.out, /daha önce geri alınmıştı/);
  } finally {
    gh.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
});
