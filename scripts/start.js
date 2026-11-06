// Başlatıcı gözetmeni (Baslat.bat / Baslat.command bunu çalıştırır):
//   1. GitHub'daki son sürümü kontrol edip varsa kurar (önce verilerin yedeğini alır; internet yoksa mevcut sürümle devam eder)
//   2. Sunucuyu başlatır
//   3. Yeni sürüm açılamazsa kendiliğinden önceki sürüme döner
//   4. Ayarlar'daki düğmeler sunucuyu özel kodlarla kapatır: yeniden başlat / önceki sürüme dön / yine de güncelle
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyUpdate, rollback, readVersion, RESTART_CODES } from './updater.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const PORTS_BUSY = 3; // server/index.js: bütün portlar dolu (sürümün hatası değil)

// Güncelleme anahtarı (yalnızca depo özelse gerekir): ortam değişkeni ya da Ayarlar'da kaydedilen değer
async function readToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const file = path.join(DATA_DIR, 'app.db');
  if (!fs.existsSync(file)) return '';
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'update.githubToken'").get();
    db.close();
    return row ? row.value : '';
  } catch {
    return '';
  }
}

// Güncellemeden hemen önce verilerin yedeği (yeni sürüm veritabanını dönüştürebilir)
async function backupBeforeUpdate() {
  const file = path.join(DATA_DIR, 'app.db');
  if (!fs.existsSync(file)) return;
  const { openDb } = await import('../server/db.js');
  const { createBackupService } = await import('../server/services/backup.js');
  const db = openDb(file);
  try {
    const settings = {
      get: key => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) || {}).value,
      set: () => {}, remove: () => {}
    };
    const b = createBackupService({ db, dataDir: DATA_DIR, settings }).create('guncelleme-oncesi');
    console.log(`  Verilerin yedeği alındı (${b.name}).`);
  } catch (err) {
    throw new Error('Verilerin yedeği alınamadığı için güncelleme yapılmadı: ' + err.message);
  } finally {
    db.close();
  }
}

// Güncellendiyse true döner
async function update(force) {
  if (process.env.SKIP_UPDATE === '1') return false;
  process.stdout.write('  Güncellemeler kontrol ediliyor...\n');
  try {
    const r = await applyUpdate({ root: ROOT, token: await readToken(), force, beforeSwap: backupBeforeUpdate, log: m => console.log('  ' + m) });
    if (r.updated) console.log(`  Güncellendi (${r.sha.slice(0, 7)}).`);
    else if (r.skipped) console.log('  GitHub\'daki sürüm daha önce geri alınmıştı; daha yeni bir sürüm gelene kadar kurulmayacak.');
    else console.log('  Uygulama güncel.');
    return r.updated;
  } catch (err) {
    // Güncelleme başarısız olsa da uygulama mevcut sürümle açılır
    const sha = readVersion(ROOT).sha;
    console.log(`  Güncelleme yapılamadı: ${err.message}`);
    console.log(`  Mevcut sürümle devam ediliyor${sha ? ' (' + sha.slice(0, 7) + ')' : ''}.`);
    return false;
  }
}

function goBack(reason) {
  console.log(`\n  ${reason}`);
  try {
    const r = rollback({ root: ROOT, log: m => console.log('  ' + m) });
    console.log(`  Önceki sürüme dönüldü${r.sha ? ' (' + r.sha.slice(0, 7) + ')' : ''}. Geri alınan sürüm, daha yenisi çıkana kadar kurulmayacak.\n`);
    return true;
  } catch (err) {
    console.log(`  Önceki sürüme dönülemedi: ${err.message}\n`);
    return false;
  }
}

// Sunucuyu çalıştırır; sunucu dinlemeye başlayınca "ready" mesajı gönderir
function runServer(openBrowser) {
  return new Promise(resolve => {
    let ready = false;
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: Object.assign({}, process.env, { SUPERVISED: '1', OPEN_BROWSER: openBrowser ? (process.env.OPEN_BROWSER || '') : '' })
    });
    child.on('message', m => { if (m && m.type === 'ready') ready = true; });
    child.on('exit', (code, signal) => resolve({ code: code == null ? 1 : code, signal, ready }));
    child.on('error', () => resolve({ code: 1, signal: null, ready }));
  });
}

let first = true;
let force = false;
let skipUpdate = false;
for (;;) {
  const updated = skipUpdate ? false : await update(force);
  force = false;
  skipUpdate = false;
  const { code, signal, ready } = await runServer(first);
  first = false;
  if (signal) process.exit(0); // pencere kapatıldı / Ctrl+C
  if (code === RESTART_CODES.restart) { console.log('\n  Uygulama yeniden başlatılıyor...\n'); continue; }
  if (code === RESTART_CODES.forceUpdate) { console.log('\n  Uygulama güncellenip yeniden başlatılıyor...\n'); force = true; continue; }
  if (code === RESTART_CODES.rollback) {
    goBack('Önceki sürüme dönülüyor (Ayarlar\'dan istendi)...');
    skipUpdate = true;
    continue;
  }
  // Yeni kurulan sürüm hiç açılamadıysa: kendiliğinden önceki sürüme dön
  if (updated && !ready && code !== 0 && code !== PORTS_BUSY) {
    if (goBack('Yeni sürüm açılamadı. Önceki sürüme dönülüyor...')) { skipUpdate = true; continue; }
  }
  process.exit(code);
}
