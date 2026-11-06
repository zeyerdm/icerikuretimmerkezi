// Yerel sunucuyu başlatır: http://localhost:3000
// Yalnızca bu bilgisayardan erişilebilir (127.0.0.1'e bağlanır).
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const { app } = createApp();

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  İçerik Üretim Merkezi çalışıyor: http://localhost:${PORT}\n  Durdurmak için Ctrl+C\n`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`\n  ${PORT} numaralı port kullanımda. Başka bir port için: PORT=3001 npm start\n`);
  else console.error(err);
  process.exit(1);
});
