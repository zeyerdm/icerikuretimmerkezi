#!/bin/bash
# macOS / Linux: çift tıkla (macOS'ta ilk seferde sağ tık → Aç)
cd "$(dirname "$0")"
echo
echo "  İçerik Üretim Merkezi başlatılıyor..."
echo
if ! command -v node >/dev/null 2>&1 || ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "  Node.js 22.13 veya üstü gerekli. Açılan sayfadan 'LTS' sürümünü kurup bu dosyayı tekrar çalıştır."
  (open https://nodejs.org/tr/download 2>/dev/null || xdg-open https://nodejs.org/tr/download 2>/dev/null) &
  read -p "  Kapatmak için Enter'a bas..."
  exit 1
fi
if [ ! -d node_modules/express ]; then
  echo "  İlk kurulum yapılıyor, bir dakika sürebilir..."
  npm install --no-audit --no-fund || { read -p "  Kurulum başarısız. Enter..."; exit 1; }
fi
echo "  Hazır. Tarayıcı birazdan açılacak: http://localhost:3000"
echo "  Uygulama çalıştığı sürece bu pencereyi kapatma."
OPEN_BROWSER=1 node scripts/start.js
