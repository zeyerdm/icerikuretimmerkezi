// Tasarım denetimi: marka kilidi (renk, font, font boyutu, kenar boşluğu), metin taşması ve okunurluk,
// çakışma, eksik görsel ve sayfalar arası tutarlılık (başlık fontu/boyutu, logo ve maskot konumu, sayfa numarası,
// zemin). Saf hesaplama: tuvale çizmez; düzenleyicinin Kontrol paneli ve dışa aktarma kapısı kullanır.
import { layerBox, textMetrics } from './postCanvas.js';
import { hexToRgb } from './colorPicker.js';

const HEX = /^#[0-9a-f]{6}$/i;
const dist = (a, b) => { const [r1, g1, b1] = hexToRgb(a); const [r2, g2, b2] = hexToRgb(b); return Math.hypot(r1 - r2, g1 - g2, b1 - b2); };
const lum = h => { const [r, g, b] = hexToRgb(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const nearest = (c, list) => list.reduce((best, x) => (dist(c, x) < dist(c, best) ? x : best), list[0]);
const overlap = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0; };
const isTitle = l => l.type === 'text' && (l.role === 'title' || l.field === 'MAIN_TITLE');

// Bir slaytın altındaki zemin rengi (yazının ortasındaki en üst şekil ya da slayt zemini)
function bgUnder(slide, l, ctx) {
  const b = layerBox(ctx, l); const cx = b.x + b.w / 2; const cy = b.y + Math.min(b.h, l.size || 40) / 2;
  const idx = slide.layers.indexOf(l);
  for (let i = idx - 1; i >= 0; i--) { const s = slide.layers[i]; if (s.type === 'shape' && !s.hidden && !s.gradient && HEX.test(s.color || '') && cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h) return s.color; }
  if (l.bgColor) return l.bgColor;
  if (slide.bgImage) return null; // görsel zemin: güvenilir ölçüm yok
  return slide.bgGradient ? slide.bgGradient.stops[0].c : (HEX.test(slide.bg || '') ? slide.bg : null);
}

// issues: { level: 'error'|'warn'|'info', slide, layer, code, msg, fix }
export function checkDesign(data, brand, F, lock = {}) {
  const ctx = document.createElement('canvas').getContext('2d');
  const out = [];
  const palette = [brand.colors.primary, ...(brand.colors.secondary || []), ...(brand.colors.backgrounds || []), brand.colors.heading, brand.colors.body, '#ffffff', '#000000', '#111111'].filter(c => HEX.test(c || ''));
  const fonts = [brand.fonts.heading, brand.fonts.body].filter(Boolean);
  const m = lock.margin || 0;
  data.slides.forEach((s, si) => {
    s.layers.forEach(l => {
      if (l.hidden) return;
      const b = layerBox(ctx, l);
      const add = (level, code, msg, fix) => out.push({ level, slide: si, layer: l.id, code, msg, fix });
      if (l.type === 'text') {
        const t = textMetrics(ctx, l);
        // Taşma: okunurluk sınırına kadar küçültüldüğü hâlde kutuya sığmıyor
        if (l.maxH > 0 && t.h > l.maxH + 2) add('error', 'overflow', `Metin kutuya sığmıyor (${t.lines} satır). Kısalt ya da kutuyu büyüt.`, { type: 'grow', h: Math.ceil(t.h) });
        else if (t.shrunk && t.size < l.size * 0.85) add('info', 'shrunk', `Metin sığmak için %${Math.round((1 - t.size / l.size) * 100)} küçüldü; kısaltmak okunurluğu artırır.`, null);
        if (b.y + Math.min(b.h, t.h) > F.h || b.x + b.w > F.w + 2 || b.x < -2 || b.y < -2) add('error', 'outside', 'Metin tuvalin dışına taşıyor.', { type: 'inside' });
        const under = bgUnder(s, l, ctx);
        if (under && HEX.test(l.color || '') && contrast(l.color, under) < 3) add('warn', 'contrast', `Yazı zeminde zor okunuyor (kontrast ${contrast(l.color, under).toFixed(1)}).`, { type: 'contrast', color: contrast('#ffffff', under) >= contrast('#111111', under) ? '#ffffff' : '#111111' });
        if (lock.fonts && fonts.length && l.font && !fonts.includes(l.font)) add('warn', 'font', `Marka dışı yazı tipi: ${l.font}.`, { type: 'font', font: isTitle(l) ? brand.fonts.heading || fonts[0] : brand.fonts.body || fonts[0] });
        if (isTitle(l) && ((lock.titleMin && l.size < lock.titleMin) || (lock.titleMax && l.size > lock.titleMax))) add('warn', 'size', `Başlık boyutu marka kuralının dışında (${l.size}px).`, { type: 'size', size: Math.min(lock.titleMax || l.size, Math.max(lock.titleMin || l.size, l.size)) });
        if (l.role === 'body' && ((lock.bodyMin && l.size < lock.bodyMin) || (lock.bodyMax && l.size > lock.bodyMax))) add('warn', 'size', `Açıklama boyutu marka kuralının dışında (${l.size}px).`, { type: 'size', size: Math.min(lock.bodyMax || l.size, Math.max(lock.bodyMin || l.size, l.size)) });
        if (l.role === 'label' && /alanı$/.test(l.text || '')) add('warn', 'missing', `Eksik görsel: "${l.text}". Kütüphaneden görsel ekle.`, null);
      }
      if (lock.colors && palette.length && ['text', 'shape'].includes(l.type) && HEX.test(l.color || '') && !l.gradient && dist(nearest(l.color, palette), l.color) > 40) add('warn', 'color', `Marka dışı renk: ${l.color}.`, { type: 'color', color: nearest(l.color, palette) });
      if (m && l.type !== 'shape' && (b.x < m || b.y < m || b.x + b.w > F.w - m || b.y + b.h > F.h - m) && !(l.type === 'image' && l.role === 'mascot')) add('info', 'margin', `Kenar boşluğu (${m}px) dışında.`, { type: 'inside' });
      if (l.type === 'image' && l.role === 'main') add('info', 'image', 'Ana görsel her içerikte değiştirilmeli (MAIN_IMAGE).', null);
    });
    // Çakışma: yazı ile maskot/ana görsel üst üste
    const texts = s.layers.filter(l => l.type === 'text' && !l.hidden && (l.text || '').trim());
    const imgs = s.layers.filter(l => l.type === 'image' && !l.hidden && ['mascot', 'main'].includes(l.role));
    texts.forEach(t => imgs.forEach(im => { if (overlap(layerBox(ctx, t), layerBox(ctx, im)) > 0.25) out.push({ level: 'info', slide: si, layer: t.id, code: 'overlap', msg: 'Yazı görselle çakışıyor.', fix: null }); }));
  });
  // Sayfalar arası tutarlılık (iç sayfalar: kapak ve kapanış hariç)
  const n = data.slides.length;
  if (n >= 3) {
    const inner = data.slides.map((s, i) => ({ s, i })).filter(x => x.i > 0 && x.i < n - 1);
    const most = arr => { const c = new Map(); arr.forEach(v => c.set(v, (c.get(v) || 0) + 1)); return [...c].sort((a, b) => b[1] - a[1])[0]; };
    const titles = inner.map(x => ({ i: x.i, l: x.s.layers.find(isTitle) })).filter(x => x.l);
    if (titles.length > 1) {
      const [font] = most(titles.map(x => x.l.font)); const [size] = most(titles.map(x => x.l.size)); const [y] = most(titles.map(x => x.l.y));
      titles.forEach(x => { if (x.l.font !== font || x.l.size !== size || Math.abs(x.l.y - y) > 8) out.push({ level: 'warn', slide: x.i, layer: x.l.id, code: 'consistency', msg: 'Başlık diğer iç sayfalardan farklı (font, boyut ya da konum).', fix: { type: 'unify', font, size, y } }); });
    }
    const [ref] = most(inner.map(x => x.s.layers.some(l => l.role === 'num' || l.field === 'PAGE_NUMBER')));
    if (ref) inner.forEach(x => { if (!x.s.layers.some(l => l.role === 'num' || l.field === 'PAGE_NUMBER')) out.push({ level: 'info', slide: x.i, layer: null, code: 'pagenum', msg: 'Bu iç sayfada sayfa numarası yok.', fix: null }); });
    const [bg] = most(inner.map(x => x.s.bg));
    inner.forEach(x => { if (x.s.bg !== bg && !x.s.bgImage && !x.s.bgGradient) out.push({ level: 'info', slide: x.i, layer: null, code: 'bg', msg: 'Zemin rengi diğer iç sayfalardan farklı.', fix: { type: 'bg', bg } }); });
  }
  if (n >= 2) {
    ['logo', 'mascot'].forEach(role => {
      const list = data.slides.map((s, i) => ({ i, l: s.layers.find(l => l.type === 'image' && l.role === role) })).filter(x => x.l);
      if (list.length < 2) return;
      const key = l => `${Math.round(l.x / 10)}:${Math.round(l.y / 10)}:${Math.round(l.w / 10)}`;
      const c = new Map(); list.forEach(x => c.set(key(x.l), (c.get(key(x.l)) || 0) + 1));
      const top = [...c].sort((a, b) => b[1] - a[1])[0][0];
      const refL = list.find(x => key(x.l) === top).l;
      list.forEach(x => { if (key(x.l) !== top && !(role === 'mascot' && (x.i === 0 || x.i === n - 1))) out.push({ level: (role === 'logo' && lock.logo) || (role === 'mascot' && lock.mascot) ? 'warn' : 'info', slide: x.i, layer: x.l.id, code: role, msg: `${role === 'logo' ? 'Logo' : 'Maskot'} konumu diğer sayfalardan farklı.`, fix: { type: 'pos', x: refL.x, y: refL.y, w: refL.w, h: refL.h } }); });
    });
  }
  return out;
}

// Bir düzeltmeyi uygular (true: değişiklik oldu)
export function applyFix(data, issue, F) {
  const s = data.slides[issue.slide]; const f = issue.fix; if (!s || !f) return false;
  const l = issue.layer ? s.layers.find(x => x.id === issue.layer) : null;
  if (f.type === 'bg') { s.bg = f.bg; return true; }
  if (!l) return false;
  if (f.type === 'grow') l.maxH = f.h;
  else if (f.type === 'contrast' || f.type === 'color') l.color = f.color;
  else if (f.type === 'font') l.font = f.font;
  else if (f.type === 'size') l.size = f.size;
  else if (f.type === 'unify') Object.assign(l, { font: f.font, size: f.size, y: f.y });
  else if (f.type === 'pos') Object.assign(l, { x: f.x, y: f.y, w: f.w, h: f.h });
  else if (f.type === 'inside') { const ctx = document.createElement('canvas').getContext('2d'); const b = layerBox(ctx, l); l.x = Math.round(Math.min(Math.max(l.x, 40), F.w - b.w - 40)); l.y = Math.round(Math.min(Math.max(l.y, 40), F.h - b.h - 40)); }
  else return false;
  return true;
}
