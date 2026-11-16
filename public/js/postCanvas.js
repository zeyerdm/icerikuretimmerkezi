// Post stüdyosu çizimi: aynı slayt verisinden hem editör önizlemesi hem PNG dışa aktarma.
// Metin kutuları genişliğe göre satırlara bölünür; görseller oranı korunarak kutuya sığdırılır.
import { loadFonts } from './ui.js';
import { qrMatrix, drawQr } from './qr.js';

const qrCache = new Map();
function qrOf(text) { if (!qrCache.has(text)) { try { qrCache.set(text, qrMatrix(text)); } catch { qrCache.set(text, null); } } return qrCache.get(text); }

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
  await loadFonts(fonts);
  try { await Promise.all(fonts.flatMap(f => [400, 700].map(w => document.fonts.load(`${w} 40px "${f}"`, 'AaZz ğüşıöç ĞÜŞİÖÇ 0123')))); } catch { /* yedek yazı tipi */ }
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
// *vurgulu* kelimeler: yıldızlar basılmaz, vurgu rengi verildiyse o renkte çizilir
const shown = l => (l.upper ? String(l.text || '').toLocaleUpperCase('tr') : String(l.text || ''));
const plain = t => String(t || '').replace(/\*/g, '');
const lh = l => (l.lineHeight > 0 ? l.lineHeight : 1.2);
// Yazı tipi + harf aralığı (tarayıcı destekliyorsa) birlikte ayarlanır; ölçüm de buna göre olur
function setFont(ctx, l) {
  ctx.font = fontOf(l);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${l.letterSpacing || 0}px`;
}
// Dış çizgi önce, dolgu sonra (çizgi harfin dışında kalsın)
function textRun(ctx, l, t, x, y, color) {
  if (l.strokeW > 0) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.lineJoin = 'round'; ctx.lineWidth = l.strokeW * 2; ctx.strokeStyle = l.strokeColor || '#000000'; ctx.strokeText(t, x, y); ctx.restore(); }
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
}

// Vurgulu metni satırlara böler ve çizer: her kelime kendi rengini taşır
function drawRich(ctx, l, x0) {
  const words = [];
  let on = false;
  shown(l).split('\n').forEach((par, pi) => {
    if (pi) words.push({ br: true });
    par.split(/(\s+)/).forEach(tok => {
      if (!tok || /^\s+$/.test(tok)) return;
      // Kelimenin içindeki yıldızlar vurguyu açıp kapatır
      let out = ''; const segs = [];
      for (const ch of tok) { if (ch === '*') { if (out) segs.push({ t: out, hl: on }); out = ''; on = !on; } else out += ch; }
      if (out) segs.push({ t: out, hl: on });
      if (segs.length) words.push({ segs });
    });
  });
  const space = ctx.measureText(' ').width;
  const lines = [[]];
  let w = 0;
  for (const wd of words) {
    if (wd.br) { lines.push([]); w = 0; continue; }
    const ww = wd.segs.reduce((a, sg) => a + ctx.measureText(sg.t).width, 0);
    if (w && w + space + ww > l.w) { lines.push([]); w = 0; }
    w += (w ? space : 0) + ww;
    lines[lines.length - 1].push(wd);
  }
  lines.forEach((line, i) => {
    const lw = line.reduce((a, wd, j) => a + (j ? space : 0) + wd.segs.reduce((b, sg) => b + ctx.measureText(sg.t).width, 0), 0);
    let x = l.align === 'center' ? x0 - lw / 2 : l.align === 'right' ? x0 - lw : x0;
    line.forEach((wd, j) => {
      if (j) x += space;
      wd.segs.forEach(sg => { textRun(ctx, l, sg.t, x, l.y + i * l.size * lh(l), sg.hl ? l.highlight : l.color); x += ctx.measureText(sg.t).width; });
    });
  });
}

// Şablon kutusu (maxH): uzun metin kutuya sığana kadar yazı küçültülür (en fazla %45'ine kadar)
export function fitText(ctx, l) {
  if (l.type !== 'text' || !(l.maxH > 0)) return l;
  let size = l.size;
  const min = Math.max(12, Math.round(l.size * 0.45));
  for (;;) {
    setFont(ctx, Object.assign({}, l, { size }));
    const n = wrapLines(ctx, plain(shown(l)), l.w).length;
    if (n * size * lh(l) <= l.maxH || size <= min) break;
    size = Math.max(min, size - 2);
  }
  return size === l.size ? l : Object.assign({}, l, { size });
}

// Katmanın kapladığı alan (seçim ve sürükleme için)
export function layerBox(ctx, l) {
  if (l.type === 'text' && l.maxH > 0) { setFont(ctx, fitText(ctx, l)); return { x: l.x, y: l.y, w: l.w, h: l.maxH }; }
  if (l.type === 'text') {
    setFont(ctx, l);
    const lines = wrapLines(ctx, plain(shown(l)), l.w);
    return { x: l.x, y: l.y, w: l.w, h: Math.max(l.size, lines.length * l.size * lh(l)) };
  }
  if (l.type === 'qr') return { x: l.x, y: l.y, w: l.w, h: l.w };
  return { x: l.x, y: l.y, w: l.w, h: l.h };
}

// Seçili tek katmanın tutamaçları (köşeler; yazıda sağ/sol kenar da): editörde boyutlandırma için
export function handlesOf(ctx, l) {
  const b = layerBox(ctx, l);
  const P = 8;
  const pts = { nw: [b.x - P, b.y - P], ne: [b.x + b.w + P, b.y - P], sw: [b.x - P, b.y + b.h + P], se: [b.x + b.w + P, b.y + b.h + P] };
  if (l.type === 'text') { pts.w = [b.x - P, b.y + b.h / 2]; pts.e = [b.x + b.w + P, b.y + b.h / 2]; }
  else if (l.type !== 'qr') { pts.n = [b.x + b.w / 2, b.y - P]; pts.s = [b.x + b.w / 2, b.y + b.h + P]; pts.w = [b.x - P, b.y + b.h / 2]; pts.e = [b.x + b.w + P, b.y + b.h / 2]; }
  return pts;
}

export function drawSlide(canvas, slide, format, { selectedId = null, handles = false, guides = [], showHidden = false } = {}) {
  const selSet = new Set([].concat(selectedId || [])); // tek katman ya da Ctrl+A ile çoklu seçim
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
  for (const l0 of slide.layers) {
    if (l0.hidden && !showHidden) continue; // gizli katman: çizilmez, dışa aktarılmaz
    const l = fitText(ctx, l0);
    ctx.save();
    ctx.globalAlpha = (l.opacity != null ? Math.max(0, Math.min(1, l.opacity / 100)) : 1) * (l0.hidden ? 0.25 : 1);
    if (l.shadow > 0) { ctx.shadowColor = l.shadowColor || 'rgba(0,0,0,0.45)'; ctx.shadowBlur = l.shadow; ctx.shadowOffsetX = l.shadowX != null ? l.shadowX : 0; ctx.shadowOffsetY = l.shadowY != null ? l.shadowY : Math.round(l.shadow / 3); }
    if (l.type === 'shape') {
      ctx.fillStyle = l.color;
      const r = Math.min(l.radius || 0, l.w / 2, l.h / 2);
      ctx.beginPath();
      if (l.shape === 'circle') ctx.ellipse(l.x + l.w / 2, l.y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
      else if (ctx.roundRect) ctx.roundRect(l.x, l.y, l.w, l.h, r);
      else ctx.rect(l.x, l.y, l.w, l.h);
      ctx.fill();
    } else if (l.type === 'qr') {
      const mx = qrOf(l.text || '');
      if (mx) drawQr(ctx, mx, l.x, l.y, l.w, l.color || '#000000', '#ffffff');
    } else if (l.type === 'image') {
      const p = imageCache.get(l.src);
      const img = p && p.resolved;
      if (img) {
        // Doldur (cover): kutu tamamen kaplanır, taşan kırpılır; yoksa oran korunarak sığdırılır
        const cover = l.fit === 'cover' || l.circle || l.radius > 0;
        const k = (cover ? Math.max : Math.min)(l.w / img.naturalWidth, l.h / img.naturalHeight);
        const w = img.naturalWidth * k;
        const h = img.naturalHeight * k;
        const ix = cover ? l.x + (l.w - w) / 2 : l.align === 'left' ? l.x : l.align === 'right' ? l.x + l.w - w : l.x + (l.w - w) / 2;
        const iy = l.y + (l.h - h) / 2;
        const f = [];
        if (l.brightness != null && l.brightness !== 100) f.push(`brightness(${l.brightness}%)`);
        if (l.contrast != null && l.contrast !== 100) f.push(`contrast(${l.contrast}%)`);
        if (l.saturate != null && l.saturate !== 100) f.push(`saturate(${l.saturate}%)`);
        if (l.grayscale > 0) f.push(`grayscale(${l.grayscale}%)`);
        if (l.blur > 0) f.push(`blur(${l.blur}px)`);
        if (f.length && 'filter' in ctx) ctx.filter = f.join(' ');
        if (cover) {
          // Gölge kırpma maskesinin dışında kalsın diye önce şekil gölgeyle doldurulur
          const clip = () => { ctx.beginPath(); if (l.circle) ctx.ellipse(l.x + l.w / 2, l.y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2); else if (ctx.roundRect) ctx.roundRect(l.x, l.y, l.w, l.h, Math.min(l.radius || 0, l.w / 2, l.h / 2)); else ctx.rect(l.x, l.y, l.w, l.h); };
          if (l.shadow > 0) { ctx.save(); ctx.filter = 'none'; ctx.fillStyle = '#ffffff'; clip(); ctx.fill(); ctx.restore(); }
          ctx.shadowColor = 'transparent';
          clip(); ctx.clip();
        }
        if (l.flipX) { ctx.translate(l.x * 2 + l.w, 0); ctx.scale(-1, 1); }
        ctx.drawImage(img, ix, iy, w, h);
      }
    } else if (l.type === 'text') {
      // Arka kutu: yazının kapladığı alanın çevresine dolgulu renkli kutu
      if (l.bgColor) {
        const b = layerBox(ctx, l); const pad = l.bgPad != null ? l.bgPad : 20;
        ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = l.bgColor; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, l.bgRadius || 0); else ctx.rect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
        ctx.fill(); ctx.restore();
      }
      setFont(ctx, l);
      ctx.textBaseline = 'top';
      ctx.textAlign = l.align || 'left';
      const x = l.align === 'center' ? l.x + l.w / 2 : l.align === 'right' ? l.x + l.w : l.x;
      if (l.highlight && shown(l).includes('*')) { ctx.textAlign = 'left'; drawRich(ctx, l, x); }
      else wrapLines(ctx, plain(shown(l)), l.w).forEach((line, i) => textRun(ctx, l, line, x, l.y + i * l.size * lh(l), l.color));
      ctx.textAlign = 'left';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.restore();
    if (selSet.has(l.id)) {
      const b = layerBox(ctx, l);
      ctx.save();
      ctx.strokeStyle = '#5b55e6';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
      if (handles && selSet.size === 1) {
        ctx.setLineDash([]);
        const s = Math.max(16, Math.round(format.w / 60));
        for (const [hx, hy] of Object.values(handlesOf(ctx, l))) { ctx.fillStyle = '#ffffff'; ctx.lineWidth = 3; ctx.fillRect(hx - s / 2, hy - s / 2, s, s); ctx.strokeRect(hx - s / 2, hy - s / 2, s, s); }
      }
      ctx.restore();
    }
  }
  // Hizalama çizgileri (sürüklerken mıknatısın tuttuğu yer)
  if (guides.length) {
    ctx.save(); ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 3; ctx.setLineDash([]);
    for (const g of guides) { ctx.beginPath(); if (g.x != null) { ctx.moveTo(g.x, 0); ctx.lineTo(g.x, format.h); } else { ctx.moveTo(0, g.y); ctx.lineTo(format.w, g.y); } ctx.stroke(); }
    ctx.restore();
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
    if (slide.layers[i].hidden || slide.layers[i].locked) continue; // gizli ve kilitli katmana tıklanmaz (katmanlar panelinden seçilir)
    const b = layerBox(ctx, slide.layers[i]);
    if (x >= b.x - 10 && x <= b.x + b.w + 10 && y >= b.y - 10 && y <= b.y + b.h + 10) return slide.layers[i];
  }
  return null;
}
