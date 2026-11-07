// Reels başlık PNG'si: 1080x1920 şeffaf kare, başlık üst bölgede seçili stilde.
// Video aracı başlığı her sahnede farklı ya da hatalı yazabildiği için kurguda videonun üstüne bu görsel konur.
import { loadFonts } from './ui.js';

const STYLES = {
  pop: { base: { font: '800 {s}px Poppins', color: '#ffffff', shadow: 'rgba(0,0,0,0.45)' }, key: { font: '900 {s}px Poppins', color: '#ec4899', scale: 1.5 }, deco: { char: '★', color: '#f472b6' } },
  editoryal: { base: { font: 'italic 700 {s}px "Playfair Display"', color: '#ffffff', shadow: 'rgba(0,0,0,0.4)' }, key: { font: '{s}px Pacifico', color: '#f9a8d4', scale: 1.35 } },
  retro: { base: { font: '800 {s}px Outfit', color: '#fef3c7', shadow: '#92400e' }, key: { font: '800 {s}px Outfit', color: '#fef3c7', scale: 1.3 }, deco: { char: '✿', color: '#fde047' } },
  vlog: { base: { font: '{s}px Anton', color: '#f472b6', stroke: '#ffffff', upper: true }, key: { font: '{s}px Anton', color: '#f472b6', scale: 1.35 }, deco: { char: '✦', color: '#ffffff' } },
  marka: { base: { font: '800 {s}px Poppins', color: '#ffffff', shadow: 'rgba(0,0,0,0.55)' }, key: { font: '900 {s}px Poppins', color: null, scale: 1.5 }, deco: { char: '✦', color: '#ffffff' } },
  sade: { base: { font: '800 {s}px Poppins', color: '#ffffff', stroke: '#000000' }, key: { font: '800 {s}px Poppins', color: '#ffffff', scale: 1 } }
};
const FAMILIES = ['Poppins', 'Playfair Display', 'Pacifico', 'Outfit', 'Anton'];

export async function ensureTitleFonts() {
  loadFonts(FAMILIES);
  try { await Promise.all(FAMILIES.map(f => document.fonts.load(`700 40px "${f}"`))); await document.fonts.ready; } catch { /* yazı tipi gelmezse yedek yazı tipiyle çizilir */ }
}

export function drawTitle(canvas, { title, keyword, style = 'pop', colors = {} }) {
  const W = 1080, H = 1920, maxW = 920, size = 92;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const st = STYLES[style] || STYLES.pop;
  const keyColor = st.key.color || colors.primary || '#fb923c';
  const clean = w => w.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}%]/gu, '');
  const words = String(title || '').trim().split(/\s+/).filter(Boolean).map(w => ({ text: st.base.upper ? w.toLocaleUpperCase('tr-TR') : w, key: keyword && clean(w) === clean(keyword) }));
  const fontOf = w => (w.key ? st.key.font.replace('{s}', Math.round(size * st.key.scale)) : st.base.font.replace('{s}', size));
  const widthOf = w => { ctx.font = fontOf(w); return ctx.measureText(w.text).width; };
  const space = size * 0.28;
  // Satırlara böl (vurgulu kelime büyük olduğu için ölçü kendi yazı tipiyle alınır)
  const lines = [];
  let line = [];
  let lw = 0;
  words.forEach(w => {
    const ww = widthOf(w);
    if (line.length && lw + space + ww > maxW) { lines.push(line); line = []; lw = 0; }
    line.push(Object.assign(w, { w: ww }));
    lw += (line.length > 1 ? space : 0) + ww;
  });
  if (line.length) lines.push(line);
  let y = 300;
  ctx.textBaseline = 'alphabetic';
  lines.forEach(ln => {
    const lineH = Math.max(...ln.map(w => (w.key ? size * st.key.scale : size))) * 1.12;
    const total = ln.reduce((n, w, i) => n + w.w + (i ? space : 0), 0);
    let x = (W - total) / 2;
    y += lineH;
    ln.forEach(w => {
      ctx.font = fontOf(w);
      if (st.base.shadow) { ctx.shadowColor = st.base.shadow; ctx.shadowOffsetY = 6; ctx.shadowBlur = 14; }
      if (st.base.stroke) { ctx.lineWidth = 10; ctx.strokeStyle = st.base.stroke; ctx.lineJoin = 'round'; ctx.strokeText(w.text, x, y); }
      ctx.fillStyle = w.key ? keyColor : st.base.color;
      ctx.fillText(w.text, x, y);
      ctx.shadowColor = 'transparent';
      x += w.w + space;
    });
  });
  if (st.deco) {
    ctx.font = `${Math.round(size * 0.5)}px Poppins`;
    ctx.fillStyle = st.deco.color;
    ctx.fillText(st.deco.char, 110, 300 + size * 0.6);
    ctx.fillText(st.deco.char, W - 150, y + size * 0.3);
  }
  return canvas;
}

export async function titleBlob(opts) {
  await ensureTitleFonts();
  const c = drawTitle(document.createElement('canvas'), opts);
  return new Promise(resolve => c.toBlob(resolve, 'image/png'));
}

// Dosya indirme (yerel uygulama: tarayıcının indirme klasörüne)
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 200);
}
// Dosya adı: Türkçe harfler sadeleştirilir (bazı tarayıcılar ASCII dışı indirme adını yok sayıp "download" yazıyor)
const TR = { ç: 'c', ğ: 'g', ı: 'i', İ: 'I', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', Ö: 'O', Ş: 'S', Ü: 'U' };
export const safeName = s => String(s || 'dosya').replace(/[çğıİöşüÇĞÖŞÜ]/g, c => TR[c]).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'dosya';
