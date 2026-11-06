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
// .onceki-surum: bir önceki sürümün dosyaları ("önceki sürüme dön" ve açılmayan sürümü geri alma için)
export const PREVIOUS_DIR = '.onceki-surum';
const STAGING_DIR = '.guncelleme-gecici';
export const PRESERVED = ['data', 'node_modules', '.version', '.env', '.git', 'Baslat.bat', 'Baslat.command', PREVIOUS_DIR, STAGING_DIR];

// Sunucunun başlatıcıya çıkış koduyla verdiği komutlar
export const RESTART_CODES = { restart: 75, rollback: 76, forceUpdate: 77 };

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
    return { sha: String(v.sha || ''), updatedAt: v.updatedAt || null, skipSha: v.skipSha || null, rolledBackAt: v.rolledBackAt || null };
  } catch {
    return { sha: '', updatedAt: null, skipSha: null, rolledBackAt: null };
  }
}

const writeVersion = (root, v) => fs.writeFileSync(path.join(root, '.version'), JSON.stringify(v));

// Dönülebilecek önceki sürüm (yoksa null)
export function previousVersion(root) {
  const dir = path.join(root, PREVIOUS_DIR);
  if (!fs.existsSync(path.join(dir, 'server', 'index.js'))) return null;
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dir, '.version'), 'utf8'));
    return { sha: String(v.sha || ''), updatedAt: v.updatedAt || null };
  } catch {
    return { sha: '', updatedAt: null };
  }
}

// Kökteki uygulama dosyalarını (korunanlar hariç) target klasörüne taşır
function moveCode(root, target) {
  fs.mkdirSync(target, { recursive: true });
  const moved = [];
  for (const name of fs.readdirSync(root)) {
    if (PRESERVED.includes(name)) continue;
    fs.renameSync(path.join(root, name), path.join(target, name));
    moved.push(name);
  }
  return moved;
}

function copyCode(src, root) {
  for (const name of fs.readdirSync(src)) {
    if (PRESERVED.includes(name)) continue;
    fs.cpSync(path.join(src, name), path.join(root, name), { recursive: true });
  }
}

// Yarım kalan değişiklikte kökü saved klasöründeki dosyalarla eski hâline getirir
function restoreCode(root, saved, moved) {
  for (const name of fs.readdirSync(root)) if (!PRESERVED.includes(name)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
  for (const name of moved) fs.renameSync(path.join(saved, name), path.join(root, name));
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
  const skipped = current.skipSha === latest;
  return { current: current.sha, latest, available: current.sha !== latest && !skipped, skipped, updatedAt: current.updatedAt };
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
// Eski sürüm .onceki-surum klasöründe saklanır; yeni sürüm açılmazsa rollback() ile geri dönülür.
// force: daha önce geri alınmış (atlanan) sürümü yine de kur. beforeSwap: dosyalar değişmeden hemen önce çağrılır (ör. veri yedeği).
export async function applyUpdate({ root, token = '', fetchImpl = fetch, log = () => {}, skipInstall = false, force = false, beforeSwap = null }) {
  const cfg = readConfig(root);
  const latest = await fetchLatest({ root, token, fetchImpl });
  const current = readVersion(root);
  if (current.sha === latest) return { updated: false, sha: latest };
  if (current.skipSha === latest && !force) return { updated: false, skipped: true, sha: latest };

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

    if (beforeSwap) await beforeSwap();

    const lockBefore = sha256(path.join(root, 'package-lock.json'));
    // Eski dosyalar uygulama klasörünün içinde bir kenara alınır (aynı diskte: taşıma anlık ve güvenli)
    const staging = path.join(root, STAGING_DIR);
    fs.rmSync(staging, { recursive: true, force: true });
    let moved = [];
    try {
      moved = moveCode(root, staging);
      copyCode(src, root);
    } catch (err) {
      restoreCode(root, staging, moved);
      fs.rmSync(staging, { recursive: true, force: true });
      throw new UpdateError('WRITE', 'Dosyalar yazılamadı, eski sürüm geri yüklendi: ' + err.message);
    }
    // Eski sürüm saklanır (bir önceki saklanan sürümün yerine)
    fs.writeFileSync(path.join(staging, '.version'), JSON.stringify({ sha: current.sha, updatedAt: current.updatedAt }));
    const prevDir = path.join(root, PREVIOUS_DIR);
    fs.rmSync(prevDir, { recursive: true, force: true });
    fs.renameSync(staging, prevDir);

    const needInstall = !skipInstall && (sha256(path.join(root, 'package-lock.json')) !== lockBefore || !fs.existsSync(path.join(root, 'node_modules', 'express')));
    if (needInstall) {
      log('Gerekli paketler kuruluyor...');
      installPackages(root);
    }
    writeVersion(root, { sha: latest, updatedAt: new Date().toISOString() });
    return { updated: true, sha: latest, previous: current.sha, installed: needInstall };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Önceki sürüme döner. Geri alınan sürüm "atlanır": GitHub'da daha yeni bir sürüm çıkana kadar
// açılışta yeniden kurulmaz (Ayarlar'dan "yine de güncelle" ile kurulabilir).
export function rollback({ root, log = () => {}, skipInstall = false }) {
  const prev = previousVersion(root);
  if (!prev) throw new UpdateError('NO_PREVIOUS', 'Dönülebilecek önceki bir sürüm yok.');
  const current = readVersion(root);
  const prevDir = path.join(root, PREVIOUS_DIR);
  const staging = path.join(root, STAGING_DIR);
  fs.rmSync(staging, { recursive: true, force: true });
  const lockBefore = sha256(path.join(root, 'package-lock.json'));
  let moved = [];
  try {
    moved = moveCode(root, staging);
    copyCode(prevDir, root);
  } catch (err) {
    restoreCode(root, staging, moved);
    fs.rmSync(staging, { recursive: true, force: true });
    throw new UpdateError('WRITE', 'Önceki sürüme dönülemedi, mevcut sürüm korunuyor: ' + err.message);
  }
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(prevDir, { recursive: true, force: true });
  const needInstall = !skipInstall && sha256(path.join(root, 'package-lock.json')) !== lockBefore;
  if (needInstall) {
    log('Önceki sürümün paketleri kuruluyor...');
    installPackages(root);
  }
  writeVersion(root, { sha: prev.sha, updatedAt: prev.updatedAt, skipSha: current.sha || null, rolledBackAt: new Date().toISOString() });
  return { rolledBack: true, sha: prev.sha, skipped: current.sha };
}
