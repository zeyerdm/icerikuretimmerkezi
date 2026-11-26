// Yerel sunucuyu başlatır: http://localhost:3000
// Yalnızca bu bilgisayardan erişilebilir (127.0.0.1'e bağlanır).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Yerleşik SQLite Node 22.13'te bayraksız kullanılabilir; eski sürümde anlaşılır mesaj verilir
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`\n  Node.js ${process.versions.node} eski. 22.13 veya üstü gerekli: https://nodejs.org adresinden "LTS" sürümünü kur.\n`);
  process.exit(1);
}

const { createApp } = await import('./app.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const START_PORT = Number(process.env.PORT) || 3000;
const MAX_TRIES = 10;
const { app, backups, remote, ai } = createApp();
const PORTS_BUSY = 3; // scripts/start.js bu kodu sürüm hatası saymaz

// Başlat dosyasıyla açıldığında tarayıcı kendiliğinden açılır
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  // Tarayıcı açılamazsa uygulama çalışmaya devam eder; adres zaten ekranda yazılı
  try {
    const child = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`  Tarayıcı açılamadı; adresi elle aç: ${url}\n`));
    child.unref();
  } catch { /* yukarıdaki mesaj yeterli */ }
}

// O portta çalışan şey bu klasörün uygulaması mı? (Eski sürümlerde /api/system yoktur: yabancı sayılır)
async function isThisApp(port) {
  try {
    const res = await fetch(`http://localhost:${port}/api/system`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    return (await res.json()).instance === ROOT;
  } catch {
    return false;
  }
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

// Port doluysa: bu uygulamanın kendisiyse yalnızca tarayıcıyı aç; başka bir uygulamaysa
// (örneğin kapatılmamış eski sürüm) sıradaki boş portta aç ve nedenini açıkça söyle.
async function start() {
  for (let i = 0; i < MAX_TRIES; i++) {
    const port = START_PORT + i;
    const url = `http://localhost:${port}`;
    try {
      await listen(port);
      if (i > 0) {
        console.log(`\n  UYARI: ${START_PORT} numaralı portu başka bir uygulama kullanıyor. Büyük ihtimalle önceden açık kalmış eski bir siyah pencere.`);
        console.log('  O pencereyi kapat; yoksa tarayıcıda yanlış uygulamayı görebilirsin.');
      }
      console.log(`\n  KREATİFHANE çalışıyor: ${url}\n  Durdurmak için Ctrl+C\n`);
      if (process.env.OPEN_BROWSER === '1') openBrowser(url);
      // Başlatıcıya "açıldım" bilgisi: yeni sürüm açılamazsa başlatıcı önceki sürüme döner
      if (process.send) process.send({ type: 'ready' });
      startDailyBackups();
      // Günde bir model listesi kontrolü (ücretsiz; kapanan modeller yedek zincirinde atlanır)
      setTimeout(() => { ai.dailyModelCheck().then(r => { if (r && r.missing.length) console.log(`  Kullanılamayan modeller işaretlendi: ${r.missing.join(', ')}`); }).catch(() => {}); }, 5000).unref();
      // Telefondan erişim açık ve "uygulama açılınca tüneli başlat" seçiliyse tünel kendiliğinden kurulur
      try { if (remote.available && remote.status().enabled && remote.status().autoTunnel) { remote.startTunnel(port); waitTunnel(); } } catch { /* ayarlardan başlatılabilir */ }
      return;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') { console.error(err); process.exit(1); }
      if (await isThisApp(port)) {
        console.log(`\n  Uygulama zaten açık: ${url}\n`);
        if (process.env.OPEN_BROWSER === '1') openBrowser(url);
        process.exit(0);
      }
    }
  }
  console.error(`\n  ${START_PORT}-${START_PORT + MAX_TRIES - 1} arası bütün portlar dolu. Açık kalmış siyah pencereleri kapatıp tekrar dene.\n`);
  process.exit(PORTS_BUSY);
}

function waitTunnel(n = 0) {
  const t = remote.status().tunnel;
  if (t.status === 'acik') return console.log(`  Telefondan erişim adresi: ${t.url}\n`);
  if (t.status === 'baslatiliyor' && n < 60) setTimeout(() => waitTunnel(n + 1), 1000).unref();
  else if (t.status !== 'baslatiliyor') console.log(`  Telefondan erişim tüneli açılamadı: ${t.error || t.status}\n`);
}

// Günlük otomatik yedek: açılışta ve uygulama açık kaldıkça saatte bir kontrol edilir (günde bir yedek)
function startDailyBackups() {
  const run = () => {
    try {
      const b = backups.ensureDaily();
      if (b) console.log(`  Günlük yedek alındı: ${b.name}`);
    } catch (err) {
      console.log(`  Günlük yedek alınamadı: ${err.message}`);
    }
  };
  setTimeout(run, 3000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
}

start();
