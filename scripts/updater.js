// Kendini güncelleyen uygulama: GitHub'daki son sürümü kontrol eder, indirir ve yerine koyar.
// Kullanıcı verisine (data/), kurulu paketlere (node_modules/) ve başlatıcı dosyalarına dokunulmaz.
// Bu dosya yalnızca Node'un yerleşik modüllerini kullanır; paketler kurulmadan da çalışır.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const PACKAGE = 'icerik-uretim-merkezi';
// Güncellemede korunanlar: kullanıcı verisi, kurulu paketler, sürüm kaydı ve başlatıcılar
// (çalışan bir .bat dosyası değiştirilirse Windows komutları karışık okuyabilir)
export const PRESERVED = ['data', 'node_modules', '.version', '.env', '.git', 'Baslat.bat', 'Baslat.command'];

export class UpdateError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function readConfig(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const u = pkg.updates || {};
  return {
    repo: process.env.UPDATE_REPO || u.repo,
    branch: process.env.UPDATE_BRANCH || u.branch || 'main',
    apiBase: process.env.UPDATE_API_BASE || 'https://api.github.com',
    version: pkg.version
  };
}

export function readVersion(root) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(root, '.version'), 'utf8'));
    return { sha: String(v.sha || ''), updatedAt: v.updatedAt || null };
  } catch {
    return { sha: '', updatedAt: null };
  }
}

function headers(token, extra = {}) {
  const h = Object.assign({ 'User-Agent': 'icerik-uretim-merkezi', 'X-GitHub-Api-Version': '2022-11-28' }, extra);
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function explain(status, hasToken) {
  if (status === 401 || status === 403 || status === 404) {
    return hasToken
      ? 'GitHub erişim anahtarı bu depoya erişemiyor. Anahtarın "Contents: Read-only" iznini ve doğru depoyu kontrol et.'
      : 'Güncelleme indirilemedi: depo özel olabilir. Depoyu herkese açık yap ya da Ayarlar\'dan bir GitHub erişim anahtarı ekle.';
  }
  if (status === 429) return 'GitHub çok sık istek yapıldığı için bekletiyor. Biraz sonra tekrar dene.';
  return `GitHub yanıt vermedi (${status}).`;
}

// GitHub'daki son sürümün kimliğini (commit) öğrenir
export async function fetchLatest({ root, token = '', fetchImpl = fetch }) {
  const cfg = readConfig(root);
  if (!cfg.repo) throw new UpdateError('NO_REPO', 'Güncelleme deposu tanımlı değil.');
  let res;
  try {
    res = await fetchImpl(`${cfg.apiBase}/repos/${cfg.repo}/commits/${encodeURIComponent(cfg.branch)}`, {
      headers: headers(token, { Accept: 'application/vnd.github.sha' }),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new UpdateError('OFFLINE', 'GitHub\'a ulaşılamadı. İnternet bağlantını kontrol et.');
  }
  if (!res.ok) throw new UpdateError(res.status === 429 ? 'RATE_LIMIT' : 'ACCESS', explain(res.status, Boolean(token)));
  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new UpdateError('BAD_RESPONSE', 'GitHub beklenmeyen bir yanıt verdi.');
  return sha;
}

export async function checkForUpdate({ root, token, fetchImpl }) {
  const current = readVersion(root);
  const latest = await fetchLatest({ root, token, fetchImpl });
  return { current: current.sha, latest, available: current.sha !== latest, updatedAt: current.updatedAt };
}

function sha256(file) {
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '';
}

function extract(archive, dest) {
  const r = spawnSync('tar', ['-xzf', archive, '-C', dest], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new UpdateError('EXTRACT', 'İndirilen dosya açılamadı (bu bilgisayarda "tar" komutu çalışmıyor olabilir).');
  }
}

function installPackages(root) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['install', '--no-audit', '--no-fund', '--omit=dev'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new UpdateError('NPM', 'Paketler kurulamadı. İnternet bağlantını kontrol edip tekrar dene.');
}

// Son sürümü indirip yerine koyar. Hata olursa eski dosyalar geri yüklenir.
export async function applyUpdate({ root, token = '', fetchImpl = fetch, log = () => {}, skipInstall = false }) {
  const cfg = readConfig(root);
  const latest = await fetchLatest({ root, token, fetchImpl });
  const current = readVersion(root);
  if (current.sha === latest) return { updated: false, sha: latest };

  log('Yeni sürüm indiriliyor...');
  let res;
  try {
    res = await fetchImpl(`${cfg.apiBase}/repos/${cfg.repo}/tarball/${encodeURIComponent(latest)}`, { headers: headers(token), signal: AbortSignal.timeout(120000) });
  } catch {
    throw new UpdateError('OFFLINE', 'İndirme sırasında bağlantı koptu. Tekrar dene.');
  }
  if (!res.ok) throw new UpdateError('ACCESS', explain(res.status, Boolean(token)));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-update-'));
  try {
    const archive = path.join(tmp, 'update.tar.gz');
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    const out = path.join(tmp, 'out');
    fs.mkdirSync(out);
    extract(archive, out);

    // Arşivin tek bir üst klasörü vardır (kullanici-depo-sha)
    const tops = fs.readdirSync(out).filter(n => fs.statSync(path.join(out, n)).isDirectory());
    if (tops.length !== 1) throw new UpdateError('BAD_ARCHIVE', 'İndirilen sürüm beklenen biçimde değil.');
    const src = path.join(out, tops[0]);
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')); } catch { pkg = null; }
    if (!pkg || pkg.name !== PACKAGE || !fs.existsSync(path.join(src, 'server', 'index.js'))) {
      throw new UpdateError('BAD_ARCHIVE', 'İndirilen dosyalar bu uygulamaya ait görünmüyor; güncelleme iptal edildi.');
    }

    const lockBefore = sha256(path.join(root, 'package-lock.json'));
    const backup = path.join(tmp, 'backup');
    fs.mkdirSync(backup);
    const moved = [];
    try {
      for (const name of fs.readdirSync(root)) {
        if (PRESERVED.includes(name)) continue;
        fs.renameSync(path.join(root, name), path.join(backup, name));
        moved.push(name);
      }
      for (const name of fs.readdirSync(src)) {
        if (PRESERVED.includes(name)) continue;
        fs.cpSync(path.join(src, name), path.join(root, name), { recursive: true });
      }
    } catch (err) {
      // Yarım kalan güncellemede eski dosyalar geri konur
      for (const name of fs.readdirSync(root)) if (!PRESERVED.includes(name)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
      for (const name of moved) fs.renameSync(path.join(backup, name), path.join(root, name));
      throw new UpdateError('WRITE', 'Dosyalar yazılamadı, eski sürüm geri yüklendi: ' + err.message);
    }

    const needInstall = !skipInstall && (sha256(path.join(root, 'package-lock.json')) !== lockBefore || !fs.existsSync(path.join(root, 'node_modules', 'express')));
    if (needInstall) {
      log('Gerekli paketler kuruluyor...');
      installPackages(root);
    }
    fs.writeFileSync(path.join(root, '.version'), JSON.stringify({ sha: latest, updatedAt: new Date().toISOString() }));
    return { updated: true, sha: latest, previous: current.sha, installed: needInstall };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
