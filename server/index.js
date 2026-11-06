// Yerel sunucuyu başlatır: http://localhost:3000
// Yalnızca bu bilgisayardan erişilebilir (127.0.0.1'e bağlanır).
import { spawn } from 'node:child_process';

// Yerleşik SQLite Node 22.13'te bayraksız kullanılabilir; eski sürümde anlaşılır mesaj verilir
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`\n  Node.js ${process.versions.node} eski. 22.13 veya üstü gerekli: https://nodejs.org adresinden "LTS" sürümünü kur.\n`);
  process.exit(1);
}

const { createApp } = await import('./app.js');
const PORT = Number(process.env.PORT) || 3000;
const URL = `http://localhost:${PORT}`;
const { app } = createApp();

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

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  İçerik Üretim Merkezi çalışıyor: ${URL}\n  Durdurmak için Ctrl+C\n`);
  if (process.env.OPEN_BROWSER === '1') openBrowser(URL);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    // Uygulama zaten açıksa (ör. Başlat'a iki kez tıklandıysa) yalnızca tarayıcı açılır
    console.error(`\n  ${PORT} numaralı port kullanımda; uygulama zaten açık olabilir: ${URL}\n`);
    if (process.env.OPEN_BROWSER === '1') openBrowser(URL);
  } else console.error(err);
  process.exitCode = 1;
});
