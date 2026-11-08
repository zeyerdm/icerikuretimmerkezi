// Post stüdyosu çizimi: aynı slayt verisinden hem editör önizlemesi hem PNG dışa aktarma.
// Metin kutuları genişliğe göre satırlara bölünür; görseller oranı korunarak kutuya sığdırılır.
import { loadFonts } from './ui.js';

const imageCache = new Map();
export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

export async function prepareSlide(slide) {
  const fonts = [...new Set(slide.layers.filter(l => l.type === 'text').map(l => l.font))];
  loadFonts(fonts);
  try { await Promise.all(fonts.map(f => document.fonts.load(`700 40px "${f}"`))); } catch { /* yedek yazı tipi */ }
  await Promise.all([...slide.layers.filter(l => l.type === 'image').map(l => loadImage(l.src)), slide.bgImage ? loadImage(slide.bgImage.src) : null]);
}

export function wrapLines(ctx, text, width) {
  const out = [];
  String(text || '').split('\n').forEach(par => {
    const words = par.split(/\s+/).filter(Boolean);
    let line = '';
    words.forEach(w => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > width && line) { out.push(line); line = w; } else line = test;
    });
    out.push(line);
  });
  return out;
}

const fontOf = l => `${l.weight || 700} ${l.size}px "${l.font}", system-ui, sans-serif`;

// Katmanın kapladığı alan (seçim ve sürükleme için)
export function layerBox(ctx, l) {
  if (l.type === 'text') {
    ctx.font = fontOf(l);
    const lines = wrapLines(ctx, l.text, l.w);
    return { x: l.x, y: l.y, w: l.w, h: Math.max(l.size, lines.length * l.size * 1.2) };
  }
  return { x: l.x, y: l.y, w: l.w, h: l.h };
}

export function drawSlide(canvas, slide, format, { selectedId = null } = {}) {
  canvas.width = format.w;
  canvas.height = format.h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = slide.bg || '#ffffff';
  ctx.fillRect(0, 0, format.w, format.h);
  // Zemin görseli: kapla (taşan kırpılır) ya da sığdır; üstüne isteğe bağlı karartma
  if (slide.bgImage) {
    const p = imageCache.get(slide.bgImage.src);
    const img = p && p.resolved;
    if (img) {
      const k = (slide.bgImage.fit === 'contain' ? Math.min : Math.max)(format.w / img.naturalWidth, format.h / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      ctx.drawImage(img, (format.w - w) / 2, (format.h - h) / 2, w, h);
    }
    if (slide.bgImage.dim) { ctx.fillStyle = `rgba(0,0,0,${slide.bgImage.dim / 100})`; ctx.fillRect(0, 0, format.w, format.h); }
  }
  for (const l of slide.layers) {
    ctx.globalAlpha = l.opacity != null ? Math.max(0, Math.min(1, l.opacity / 100)) : 1;
    if (l.type === 'shape') {
      ctx.fillStyle = l.color;
      const r = Math.min(l.radius || 0, l.w / 2, l.h / 2);
      ctx.beginPath();
      if (l.shape === 'circle') ctx.ellipse(l.x + l.w / 2, l.y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
      else if (ctx.roundRect) ctx.roundRect(l.x, l.y, l.w, l.h, r);
      else ctx.rect(l.x, l.y, l.w, l.h);
      ctx.fill();
    } else if (l.type === 'image') {
      const p = imageCache.get(l.src);
      const img = p && p.resolved;
      if (img) {
        const k = Math.min(l.w / img.naturalWidth, l.h / img.naturalHeight);
        const w = img.naturalWidth * k;
        const h = img.naturalHeight * k;
        ctx.drawImage(img, l.x + (l.w - w) / 2, l.y + (l.h - h) / 2, w, h);
      }
    } else if (l.type === 'text') {
      ctx.font = fontOf(l);
      ctx.fillStyle = l.color;
      ctx.textBaseline = 'top';
      ctx.textAlign = l.align || 'left';
      const x = l.align === 'center' ? l.x + l.w / 2 : l.align === 'right' ? l.x + l.w : l.x;
      wrapLines(ctx, l.text, l.w).forEach((line, i) => ctx.fillText(line, x, l.y + i * l.size * 1.2));
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
    if (l.id === selectedId) {
      const b = layerBox(ctx, l);
      ctx.save();
      ctx.strokeStyle = '#5b55e6';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
      ctx.restore();
    }
  }
  return canvas;
}

// Görseller yüklendikten sonra eşzamanlı çizim için önbelleğe "resolved" yazılır
export async function resolveImages(slide) {
  await prepareSlide(slide);
  const srcs = [...slide.layers.filter(l => l.type === 'image').map(l => l.src), ...(slide.bgImage ? [slide.bgImage.src] : [])];
  await Promise.all(srcs.map(async src => { const p = imageCache.get(src); if (p) p.resolved = await p; }));
}

export async function slideBlob(slide, format) {
  await resolveImages(slide);
  const c = drawSlide(document.createElement('canvas'), slide, format);
  return new Promise(resolve => c.toBlob(resolve, 'image/png'));
}

// Tıklanan noktadaki en üstteki katman
export function hitTest(canvas, slide, x, y) {
  const ctx = canvas.getContext('2d');
  for (let i = slide.layers.length - 1; i >= 0; i--) {
    const b = layerBox(ctx, slide.layers[i]);
    if (x >= b.x - 10 && x <= b.x + b.w + 10 && y >= b.y - 10 && y <= b.y + b.h + 10) return slide.layers[i];
  }
  return null;
}
