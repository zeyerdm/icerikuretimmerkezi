// Başlatıcı gözetmeni (Baslat.bat / Baslat.command bunu çalıştırır):
//   1. GitHub'daki son sürümü kontrol edip varsa kurar (internet yoksa mevcut sürümle devam eder)
//   2. Sunucuyu başlatır
//   3. Ayarlar'daki "Güncelle ve yeniden başlat" sunucuyu 75 koduyla kapatır; döngü başa döner
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyUpdate, readVersion } from './updater.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const RESTART_CODE = 75;

// Güncelleme anahtarı (yalnızca depo özelse gerekir): ortam değişkeni ya da Ayarlar'da kaydedilen değer
async function readToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const file = path.join(ROOT, 'data', 'app.db');
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

async function update() {
  if (process.env.SKIP_UPDATE === '1') return;
  process.stdout.write('  Güncellemeler kontrol ediliyor...\n');
  try {
    const r = await applyUpdate({ root: ROOT, token: await readToken(), log: m => console.log('  ' + m) });
    if (r.updated) console.log(`  Güncellendi (${r.sha.slice(0, 7)}).`);
    else console.log('  Uygulama güncel.');
  } catch (err) {
    // Güncelleme başarısız olsa da uygulama mevcut sürümle açılır
    console.log(`  Güncelleme yapılamadı: ${err.message}`);
    console.log(`  Mevcut sürümle devam ediliyor${readVersion(ROOT).sha ? ' (' + readVersion(ROOT).sha.slice(0, 7) + ')' : ''}.`);
  }
}

let first = true;
for (;;) {
  await update();
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: Object.assign({}, process.env, { SUPERVISED: '1', OPEN_BROWSER: first ? (process.env.OPEN_BROWSER || '') : '' })
    });
    child.on('exit', c => resolve(c == null ? 1 : c));
    child.on('error', () => resolve(1));
  });
  first = false;
  if (code !== RESTART_CODE) process.exit(code);
  console.log('\n  Uygulama yeniden başlatılıyor...\n');
}
