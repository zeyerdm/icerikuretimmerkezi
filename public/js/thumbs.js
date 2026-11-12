// 8.10 Küçük resimler: büyük görsellerin ~400 px önizlemesi tarayıcıda bir kez üretilip sunucuya kaydedilir.
// Izgaralar bundan sonra küçük dosyayı yükler. Kütüphanede yer açıldıkça arka planda, ikişer ikişer yapılır.
import { api } from './api.js';

export const THUMB_PX = 400;
const done = new Set();

export async function makeThumb(src, max = THUMB_PX) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.82));
  // WebP desteklemeyen tarayıcıda JPEG
  return blob && blob.type === 'image/webp' ? blob : new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}

// Küçük resmi olmayan büyük görseller için arka planda üretir; bitince onThumb(asset) çağrılır
export function ensureThumbs(brandId, assets, onThumb = () => {}) {
  const queue = assets.filter(a => a.needsThumb && !done.has(a.id));
  queue.forEach(a => done.add(a.id));
  let active = 0;
  const next = () => {
    while (active < 2 && queue.length) {
      const a = queue.shift();
      active++;
      makeThumb(a.url)
        .then(blob => api.saveThumb(brandId, a.id, blob))
        .then(r => onThumb(r.asset))
        .catch(() => done.delete(a.id)) // bir dahaki açılışta yeniden denenir
        .finally(() => { active--; next(); });
    }
  };
  next();
}
