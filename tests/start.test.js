// Başlatma testleri: port başka bir uygulamayla doluyken (örn. kapatılmamış eski sürüm) doğru davranış
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const listen = (server, port = 0) => new Promise(r => server.listen(port, '127.0.0.1', () => r(server.address().port)));

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
  const old = http.createServer((req, res) => { res.writeHead(404); res.end('{}'); });
  const base = await listen(old);
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
  const probe = http.createServer();
  const free = await listen(probe);
  probe.close();
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
