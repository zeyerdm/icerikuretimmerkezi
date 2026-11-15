// Post stüdyosu (ilk sürüm): konudan carousel/post üretimi, katmanlı slaytlar, marka renk/font/logo/maskot.
// Slayt verisi: { format, slides: [{ bg, layers: [{ id, type: 'text'|'image'|'shape', ... }] }], caption, hashtags }
// Koordinatlar 1080 px genişlikli tuval üzerinde; çizim ve PNG dışa aktarma tarayıcıda aynı veriden yapılır.
import { newId, now, text, badRequest, notFound, oneOf, parseJson, HttpError, HEX } from '../lib/http.js';
import { polish } from './reels/rules.js';
import { markIdeaUsed, IDEA_FORMATS, IDEA_CATEGORIES } from './ideas.js';

export const POST_KINDS = { carousel: 'Carousel', post: 'Tek görsel post', story: 'Story', kapak: 'Reels kapağı', reklam: 'Reklam', grafik: 'Bilgi grafiği', youtube: 'YouTube kapağı' };
// Türün varsayılan boyutu ve takvimdeki içerik türü
export const KIND_DEFAULTS = { carousel: { format: '4:5', content: 'carousel' }, post: { format: '4:5', content: 'post' }, story: { format: '9:16', content: 'story' },
  kapak: { format: '9:16', content: 'reels' }, reklam: { format: '4:5', content: 'reklam' }, grafik: { format: '4:5', content: 'grafik' },
  youtube: { format: '16:9', content: 'youtube' } };
export const POST_FORMATS = { '4:5': { w: 1080, h: 1350, label: 'Dikey 4:5' }, '1:1': { w: 1080, h: 1080, label: 'Kare 1:1' }, '9:16': { w: 1080, h: 1920, label: 'Story 9:16' }, '16:9': { w: 1280, h: 720, label: 'YouTube 16:9' } };
const MAX_SLIDES = 10;
const MAX_LAYERS = 30;
const LAYER_TYPES = ['text', 'image', 'shape', 'qr'];
const ASSET_SRC = /^\/api\/brands\/[A-Za-z0-9-]+\/assets\/[A-Za-z0-9-]+\/file$/;

// Açık renk üzerinde koyu, koyu renk üzerinde beyaz yazı
function readableOn(hex) {
  const n = parseInt(String(hex || '#ffffff').slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#1b1f3b' : '#ffffff';
}

// Renk yardımcıları (kart düzeni)
const hexRgb = h => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hexRgb(a); const y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = h => { const [r, g, b] = hexRgb(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrastOf = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const foldTr = v => String(v || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');

// Kart düzeni (carousel varsayılanı): koyu marka zemini; üstte logo ve konu, "01 / 06" rozeti, *vurgulu* kelimeleri marka
// renginde iri başlık, alt metin; köşede slayta uygun maskot pozu ve konuşma balonu. Kapakta büyük harfli dev başlık.
// Her parça ayrı katman: düzenleyicide taşınır, değiştirilir, "tüm slaytlara uygula" ile eşlenir.
// Yapay zekânın önerdiği poz adına en yakın maskot görseli (yüklenen maskot görsellerinin etiketlerinden)
function pickPose(mascots, pose) {
  if (!mascots.length) return null;
  const p = foldTr(pose);
  return (p && mascots.find(m => foldTr(m.label) === p || (p.length > 2 && foldTr(m.label).includes(p)) || (foldTr(m.label).length > 2 && p.includes(foldTr(m.label))))) || null;
}

function cardLayout({ texts, brand, F, fonts, logoUrl, logoId, mascots, topic }) {
  const c = brand.colors || {};
  const primary = HEX.test(c.primary || '') ? c.primary : '#5b55e6';
  const given = HEX.test((c.backgrounds || [])[0] || '') ? c.backgrounds[0] : '';
  // Zemin: markanın koyu zemini varsa o, yoksa ana rengin çok koyu tonu
  const bg = given && lum(given) < 0.2 ? given : mix(primary, '#05070d', 0.86);
  const ink = readableOn(bg);
  const muted = mix(ink, bg, 0.3);
  // Vurgu rengi zeminde okunmuyorsa açılır
  let accent = primary;
  for (let i = 0; i < 6 && contrastOf(accent, bg) < 3; i++) accent = mix(accent, '#ffffff', 0.2);
  const id = () => newId().slice(0, 8);
  const total = texts.length;
  const P = 72;
  const est = (t, size, w) => { let n = 1; let cur = 0; String(t || '').replace(/\*/g, '').split(/\s+/).filter(Boolean).forEach(word => { const ww = word.length * size * 0.62; const add = cur ? size * 0.28 + ww : ww; if (cur && cur + add > w) { n++; cur = ww; } else cur += add; }); return n; };
  const pickMascot = pose => pickPose(mascots, pose);
  return texts.map((t, i) => {
    const cover = i === 0;
    const last = i === total - 1 && total > 1;
    const layers = [];
    if (logoUrl) layers.push({ id: id(), type: 'image', role: 'logo', assetId: logoId, src: logoUrl, x: P, y: 56, w: 300, h: 110, align: 'left' });
    if (!cover && topic) layers.push({ id: id(), type: 'text', role: 'topic', text: String(topic).slice(0, 60), x: F.w - P - 420, y: 74, w: 420, size: 28, color: muted, font: fonts.body, weight: 600, align: 'right' });
    let y = cover ? Math.round(F.h * 0.2) : 230;
    if (!cover && total > 1) {
      // "03 / 06" rozeti
      layers.push({ id: id(), type: 'shape', shape: 'rect', x: P, y, w: 214, h: 64, color: mix(bg, ink, 0.1), radius: 32 });
      layers.push({ id: id(), type: 'shape', shape: 'rect', x: P + 7, y: y + 7, w: 86, h: 50, color: accent, radius: 25 });
      layers.push({ id: id(), type: 'text', role: 'num', text: String(i + 1).padStart(2, '0'), x: P + 7, y: y + 13, w: 86, size: 32, color: readableOn(accent), font: fonts.heading, weight: 800, align: 'center' });
      layers.push({ id: id(), type: 'text', role: 'page', text: `/ ${String(total).padStart(2, '0')}`, x: P + 108, y: y + 13, w: 100, size: 32, color: muted, font: fonts.body, weight: 700, align: 'left' });
      y += 120;
    }
    const tSize = cover ? (String(t.title).length > 40 ? 92 : 108) : (String(t.title).length > 48 ? 66 : 76);
    const titleText = cover ? String(t.title).toLocaleUpperCase('tr-TR') : t.title;
    layers.push({ id: id(), type: 'text', role: 'title', text: titleText, x: P, y, w: F.w - P * 2, size: tSize, color: ink, highlight: accent, font: fonts.heading, weight: 900, align: 'left' });
    y += Math.round(est(titleText, tSize, F.w - P * 2) * tSize * 1.2) + (cover ? 44 : 36);
    // Kapakta alt metin maskotun yerine taşmasın
    const bodyW = cover ? (mascots.length ? 620 : F.w - P * 2 - 120) : F.w - P * 2;
    const bodySize = cover ? 44 : 40;
    if (t.body) { layers.push({ id: id(), type: 'text', role: 'body', text: t.body, x: P, y, w: bodyW, size: bodySize, color: muted, font: fonts.body, weight: 500, align: 'left' }); y += Math.round(est(t.body, bodySize * 0.82, bodyW) * bodySize * 1.2); }
    // Maskot ve konuşma balonu (sağ alt); maskot yoksa balon da yok
    const m = pickMascot(t.pose) || mascots[i % Math.max(1, mascots.length)] || null;
    if (m) {
      layers.push({ id: id(), type: 'image', role: 'mascot', assetId: m.id, src: m.url, x: F.w - 470, y: F.h - 540, w: 450, h: 520 });
      const speech = t.speech || (cover ? 'Kaydırarak incele 👀' : last ? 'Kaydet, lazım olur! 🚀' : '');
      if (speech) {
        const sw = Math.min(460, Math.max(240, speech.length * 17 + 64));
        const sl = Math.ceil((speech.length * 17) / (sw - 56));
        const sh = 40 + sl * 40;
        // Balon maskotun sol üstünde; metnin bittiği yerin altında kalır (yazının üstüne binmez)
        const bx = F.w - 470 - sw + 70;
        const by = Math.min(F.h - sh - 40, Math.max(y + 40, F.h - 440 - sh));
        layers.push({ id: id(), type: 'shape', shape: 'rect', role: 'bubble', x: bx, y: by, w: sw, h: sh, color: '#ffffff', radius: 34 });
        layers.push({ id: id(), type: 'text', role: 'speech', text: speech, x: bx + 28, y: by + 22, w: sw - 56, size: 32, color: '#0b132b', font: fonts.heading, weight: 800, align: 'left' });
      }
    }
    return { bg, layers };
  });
}

// Metinlerden marka şablonuyla slaytlar: kapak marka renginde, iç slaytlar marka zemininde; logo köşede, maskot kapakta
export function layoutSlides({ texts, brand, format = '4:5', kind = 'carousel', logoUrl = null, mascotUrl = null, logoId = null, mascotId = null, mascots = null, topic = '' }) {
  const F = POST_FORMATS[format] || POST_FORMATS['4:5'];
  if (kind === 'carousel' && texts.length > 1) {
    const fonts0 = { heading: (brand.fonts && brand.fonts.heading) || 'Poppins', body: (brand.fonts && brand.fonts.body) || 'Inter' };
    return cardLayout({ texts, brand, F, fonts: fonts0, logoUrl, logoId, mascots: mascots || (mascotUrl ? [{ id: mascotId, url: mascotUrl, label: '' }] : []), topic });
  }
  const c = brand.colors || {};
  const primary = HEX.test(c.primary || '') ? c.primary : '#5b55e6';
  const bg = HEX.test((c.backgrounds || [])[0] || '') ? c.backgrounds[0] : '#ffffff';
  const heading = HEX.test(c.heading || '') ? c.heading : readableOn(bg);
  const body = HEX.test(c.body || '') ? c.body : readableOn(bg);
  const fonts = { heading: (brand.fonts && brand.fonts.heading) || 'Poppins', body: (brand.fonts && brand.fonts.body) || 'Inter' };
  const id = () => newId().slice(0, 8);
  const total = texts.length;
  // Başlığın kaç satır tutacağı tahmini: kelime kelime satıra yerleştirilir (kalın yazıda harf ≈ 0,68 × yazı boyu; geniş fontlarda da yetsin);
  // alt metin başlığın altından başlar. Fazla tahmin yalnızca biraz boşluk bırakır, az tahmin yazıları çakıştırırdı.
  const lines = (t, size, w) => {
    let n = 1;
    let cur = 0;
    String(t || '').split(/\s+/).filter(Boolean).forEach(word => {
      const ww = word.length * size * 0.68;
      const add = cur ? size * 0.3 + ww : ww;
      if (cur && cur + add > w) { n++; cur = ww; } else cur += add;
    });
    return n;
  };
  // Tek slaytlık özel türler: Reels kapağı, reklam, bilgi grafiği, story
  // YouTube kapağı (16:9): sol yarıda çok büyük, en çok 4 kelimelik kapak yazısı; sağda yüz/maskot ya da açıkça işaretli görsel alanı.
  // Küçük önizlemede (≈ 168×94 px) okunabilsin diye yazı iri ve kalın, zemin tek renk; logo küçük köşede.
  if (kind === 'youtube') {
    const t = texts[0] || { title: '' };
    const onP = readableOn(primary);
    const layers = [];
    const wordList = String(t.title || '').split(/\s+/).filter(Boolean);
    const ix = Math.round(F.w * 0.6);
    const tw = ix - 60 - 36; // görsel alanına taşmasın
    // Kelime sayısına göre iri yazı; en uzun kelime tek satıra sığacak kadar küçültülür (kalın harf ≈ 0,7 × boy)
    const longest = Math.max(1, ...wordList.map(w => w.length));
    const size = Math.max(24, Math.min(wordList.length <= 2 ? 150 : wordList.length <= 4 ? 118 : 92, Math.floor(tw / (longest * 0.7))));
    const ty = Math.max(40, Math.round(F.h / 2 - (lines(t.title, size, tw) * size * 1.1) / 2) - (t.body ? 40 : 0));
    layers.push({ id: id(), type: 'text', role: 'title', text: t.title, x: 60, y: ty, w: tw, size, color: onP, font: fonts.heading, weight: 900, align: 'left' });
    if (t.body) layers.push({ id: id(), type: 'text', role: 'body', text: t.body, x: 64, y: ty + Math.round(lines(t.title, size, tw) * size * 1.15) + 18, w: tw, size: 44, color: onP, font: fonts.body, weight: 700, align: 'left' });
    const iw = F.w - ix - 30; const ih = F.h - 60;
    if (mascotUrl) layers.push({ id: id(), type: 'image', assetId: mascotId, src: mascotUrl, x: ix, y: 30, w: iw, h: ih });
    else {
      layers.push({ id: id(), type: 'shape', shape: 'rect', x: ix, y: 30, w: iw, h: ih, color: '#e5e7eb', radius: 24 });
      layers.push({ id: id(), type: 'text', role: 'label', text: 'Yüz / görsel alanı', x: ix, y: 30 + Math.round(ih / 2) - 20, w: iw, size: 34, color: '#6b7280', font: fonts.body, weight: 600, align: 'center' });
    }
    if (logoUrl) layers.push({ id: id(), type: 'image', assetId: logoId, src: logoUrl, x: 40, y: F.h - 130, w: 90, h: 90 });
    return [{ bg: primary, layers }];
  }
  if (['kapak', 'reklam', 'grafik', 'story'].includes(kind)) {
    const t = texts[0] || { title: '' };
    const layers = [];
    const onP = readableOn(primary);
    const tall = F.h > 1500;
    if (kind === 'kapak') {
      // Kapak: büyük, ortalanmış başlık üst bölümde; maskot altta büyük (profil ızgarasında ortadaki 1:1 alan okunur kalsın)
      const ty = Math.round(F.h * 0.28);
      layers.push({ id: id(), type: 'text', role: 'title', text: t.title, x: 80, y: ty, w: F.w - 160, size: 110, color: onP, font: fonts.heading, weight: 900, align: 'center' });
      if (t.body) layers.push({ id: id(), type: 'text', role: 'body', text: t.body, x: 120, y: ty + Math.round(lines(t.title, 110, F.w - 160) * 110 * 1.2) + 30, w: F.w - 240, size: 46, color: onP, font: fonts.body, weight: 600, align: 'center' });
      if (mascotUrl) layers.push({ id: id(), type: 'image', assetId: mascotId, src: mascotUrl, x: Math.round(F.w / 2 - 300), y: F.h - 760, w: 600, h: 600 });
      return [{ bg: primary, layers }];
    }
    if (kind === 'reklam') {
      const ty = Math.round(F.h * (tall ? 0.18 : 0.14));
      layers.push({ id: id(), type: 'text', role: 'title', text: t.title, x: 90, y: ty, w: 900, size: 96, color: onP, font: fonts.heading, weight: 900, align: 'left' });
      let y = ty + Math.round(lines(t.title, 96, 900) * 96 * 1.2) + 30;
      if (t.body) { layers.push({ id: id(), type: 'text', role: 'body', text: t.body, x: 90, y, w: 760, size: 42, color: onP, font: fonts.body, weight: 500, align: 'left' }); y += Math.round(lines(t.body, 42, 760) * 42 * 1.2) + 50; }
      const cta = t.cta || 'Hemen keşfet';
      const ctaBg = onP === '#ffffff' ? '#ffffff' : '#1b1f3b';
      const bw = Math.min(700, Math.round(cta.length * 40 * 0.62) + 120);
      layers.push({ id: id(), type: 'shape', shape: 'rect', x: 90, y, w: bw, h: 110, color: ctaBg, radius: 55 });
      layers.push({ id: id(), type: 'text', role: 'cta', text: cta, x: 90, y: y + 32, w: bw, size: 40, color: readableOn(ctaBg), font: fonts.heading, weight: 800, align: 'center' });
      if (mascotUrl) layers.push({ id: id(), type: 'image', assetId: mascotId, src: mascotUrl, x: F.w - 470, y: F.h - 500, w: 420, h: 420 });
      if (logoUrl) layers.push({ id: id(), type: 'image', assetId: logoId, src: logoUrl, x: F.w - 190, y: 70, w: 110, h: 110 });
      return [{ bg: primary, layers }];
    }
    if (kind === 'grafik') {
      // Bilgi grafiği: başlık şeridi + numaralı maddeler
      layers.push({ id: id(), type: 'shape', shape: 'rect', x: 0, y: 0, w: F.w, h: 300, color: primary, radius: 0 });
      layers.push({ id: id(), type: 'text', role: 'title', text: t.title, x: 90, y: 90, w: 760, size: 64, color: onP, font: fonts.heading, weight: 800, align: 'left' });
      const items = (t.items && t.items.length ? t.items : String(t.body || '').split(/\n+/)).filter(Boolean).slice(0, 6);
      const gap = Math.floor((F.h - 420) / Math.max(items.length, 1));
      items.forEach((it, k) => {
        const y = 360 + k * gap;
        layers.push({ id: id(), type: 'shape', shape: 'circle', x: 90, y, w: 84, h: 84, color: primary, radius: 0 });
        layers.push({ id: id(), type: 'text', role: 'num', text: String(k + 1), x: 90, y: y + 18, w: 84, size: 44, color: onP, font: fonts.heading, weight: 800, align: 'center' });
        layers.push({ id: id(), type: 'text', role: 'item', text: it, x: 210, y: y + 14, w: 780, size: Math.min(40, Math.max(28, Math.floor(gap / 3.2))), color: body, font: fonts.body, weight: 600, align: 'left' });
      });
      if (logoUrl) layers.push({ id: id(), type: 'image', assetId: logoId, src: logoUrl, x: F.w - 190, y: 95, w: 110, h: 110 });
      return [{ bg, layers }];
    }
    // story: dikey; başlık üstte, metin altında, maskot altta, logo üst köşede
    const ty = Math.round(F.h * 0.16);
    layers.push({ id: id(), type: 'text', role: 'title', text: t.title, x: 90, y: ty, w: 900, size: 88, color: onP, font: fonts.heading, weight: 800, align: 'left' });
    if (t.body) layers.push({ id: id(), type: 'text', role: 'body', text: t.body, x: 90, y: ty + Math.round(lines(t.title, 88, 900) * 88 * 1.2) + 36, w: 860, size: 44, color: onP, font: fonts.body, weight: 500, align: 'left' });
    if (mascotUrl) layers.push({ id: id(), type: 'image', assetId: mascotId, src: mascotUrl, x: F.w - 560, y: F.h - 700, w: 500, h: 500 });
    if (logoUrl) layers.push({ id: id(), type: 'image', assetId: logoId, src: logoUrl, x: F.w - 190, y: 70, w: 110, h: 110 });
    return [{ bg: primary, layers }];
  }
  return texts.map((t, i) => {
    const cover = i === 0;
    const slideBg = cover ? primary : bg;
    const onCover = readableOn(primary);
    const layers = [];
    if (cover) {
      const ty = Math.round(F.h * 0.2);
      layers.push({ id: id(), type: 'text', role: 'title', text: t.title, x: 90, y: ty, w: 900, size: 92, color: onCover, font: fonts.heading, weight: 800, align: 'left' });
      if (t.body) layers.push({ id: id(), type: 'text', role: 'body', text: t.body, x: 90, y: ty + Math.round(lines(t.title, 92, 900) * 92 * 1.2) + 36, w: 820, size: 40, color: onCover, font: fonts.body, weight: 500, align: 'left' });
      if (mascotUrl) layers.push({ id: id(), type: 'image', assetId: mascotId, src: mascotUrl, x: F.w - 470, y: F.h - 520, w: 420, h: 420 });
    } else {
      layers.push({ id: id(), type: 'shape', shape: 'rect', x: 90, y: 110, w: 120, h: 12, color: primary, radius: 6 });
      layers.push({ id: id(), type: 'text', role: 'title', text: t.title, x: 90, y: 160, w: 900, size: 66, color: heading, font: fonts.heading, weight: 800, align: 'left' });
      if (t.body) layers.push({ id: id(), type: 'text', role: 'body', text: t.body, x: 90, y: 160 + Math.round(lines(t.title, 66, 900) * 66 * 1.2) + 48, w: 900, size: 42, color: body, font: fonts.body, weight: 500, align: 'left' });
    }
    if (total > 1) layers.push({ id: id(), type: 'text', role: 'page', text: `${i + 1}/${total}`, x: 90, y: F.h - 110, w: 300, size: 30, color: cover ? onCover : body, font: fonts.body, weight: 700, align: 'left' });
    // Logo üst köşede: alttaki maskot ve sayfa numarasıyla çakışmaz
    if (logoUrl) layers.push({ id: id(), type: 'image', assetId: logoId, src: logoUrl, x: F.w - 190, y: 70, w: 110, h: 110 });
    return { bg: slideBg, layers };
  });
}

function cleanLayer(l) {
  if (!l || typeof l !== 'object' || !LAYER_TYPES.includes(l.type)) throw badRequest('Geçersiz katman.');
  const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d; };
  const out = { id: String(l.id || newId().slice(0, 8)).slice(0, 16), type: l.type, x: num(l.x, -2000, 4000, 0), y: num(l.y, -2000, 4000, 0) };
  if (l.opacity != null && Number(l.opacity) < 100) out.opacity = num(l.opacity, 0, 100, 100);
  // Katmanlar paneli: gizli, kilitli, özel ad
  if (l.hidden) out.hidden = true;
  if (l.locked) out.locked = true;
  if (polish(l.name)) out.name = polish(l.name).slice(0, 40);
  const fx = (k, min, max) => { if (l[k] != null && l[k] !== '' && Number.isFinite(Number(l[k]))) out[k] = Math.min(max, Math.max(min, Math.round(Number(l[k]) * 100) / 100)); };
  const col = k => { if (HEX.test(l[k] || '')) out[k] = l[k]; };
  if (l.type === 'text') {
    Object.assign(out, { role: String(l.role || 'text').slice(0, 12), text: String(l.text || '').slice(0, 1000), w: num(l.w, 40, 2000, 800), size: num(l.size, 10, 300, 40),
      color: HEX.test(l.color || '') ? l.color : '#1b1f3b', font: polish(l.font).slice(0, 40) || 'Inter', weight: [400, 500, 600, 700, 800, 900].includes(Number(l.weight)) ? Number(l.weight) : 700,
      align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'left' });
    if (HEX.test(l.highlight || '')) out.highlight = l.highlight; // *vurgulu* kelimelerin rengi
    // Şablon kutusu yüksekliği: uzun metin bu yüksekliğe sığana kadar küçültülür
    if (Number(l.maxH) > 0) out.maxH = num(l.maxH, 20, 4000, 200);
    // Yazı efektleri: satır/harf aralığı, büyük harf, gölge, dış çizgi, arka kutu
    fx('lineHeight', 0.7, 3); fx('letterSpacing', -10, 60);
    if (l.upper) out.upper = true;
    fx('shadow', 0, 80); col('shadowColor'); fx('shadowX', -60, 60); fx('shadowY', -60, 60);
    fx('strokeW', 0, 40); col('strokeColor');
    col('bgColor'); fx('bgPad', 0, 120); fx('bgRadius', 0, 200);
  } else if (l.type === 'image') {
    // Yalnızca bu uygulamadaki varlık dosyaları (dış adresten görsel çekilmez)
    if (!ASSET_SRC.test(String(l.src || ''))) throw badRequest('Görsel katmanı kütüphanedeki bir dosya olmalı.');
    Object.assign(out, { src: l.src, assetId: l.assetId ? String(l.assetId).slice(0, 40) : null, w: num(l.w, 10, 4000, 300), h: num(l.h, 10, 4000, 300) });
    if (l.align === 'left' || l.align === 'right') out.align = l.align; // kutu içinde sola/sağa yaslı (logo)
    if (['logo', 'mascot'].includes(l.role)) out.role = l.role; // şablonda "maskot yeri": her postta poza göre değişir
    // Görsel ayarları: kutuyu doldur (taşanı kırp), köşe, daire, ayna, filtreler, gölge
    if (l.fit === 'cover') out.fit = 'cover';
    fx('radius', 0, 2000); if (l.circle) out.circle = true; if (l.flipX) out.flipX = true;
    fx('brightness', 0, 200); fx('contrast', 0, 200); fx('saturate', 0, 200); fx('grayscale', 0, 100); fx('blur', 0, 30);
    fx('shadow', 0, 80); col('shadowColor');
  } else if (l.type === 'qr') {
    // QR kod: metin/link kare olarak çizilir (beyaz sessiz bölge her zaman eklenir, okunabilirlik için)
    const text = String(l.text || '').trim().slice(0, 200);
    if (!text) throw badRequest('QR kod için bir link ya da metin yaz.');
    const w = num(l.w, 80, 2000, 300);
    Object.assign(out, { text, w, h: w, color: HEX.test(l.color || '') ? l.color : '#000000' });
  } else {
    Object.assign(out, { shape: l.shape === 'circle' ? 'circle' : 'rect', w: num(l.w, 1, 4000, 100), h: num(l.h, 1, 4000, 100), color: HEX.test(l.color || '') ? l.color : '#5b55e6', radius: num(l.radius, 0, 1000, 0) });
    if (l.role === 'bubble') out.role = 'bubble'; // maskotun konuşma balonu: konuşma yoksa gizlenir
  }
  return out;
}

export function cleanData(data, brandId) {
  if (!data || typeof data !== 'object') throw badRequest('Geçersiz post verisi.');
  const format = POST_FORMATS[data.format] ? data.format : '4:5';
  const slides = Array.isArray(data.slides) ? data.slides : [];
  if (!slides.length || slides.length > MAX_SLIDES) throw badRequest(`Slayt sayısı 1 ile ${MAX_SLIDES} arasında olmalı.`);
  return {
    format,
    slides: slides.map(s => {
      const layers = Array.isArray(s && s.layers) ? s.layers : [];
      if (layers.length > MAX_LAYERS) throw badRequest(`Bir slaytta en fazla ${MAX_LAYERS} katman olabilir.`);
      const clean = layers.map(cleanLayer);
      // Başka markanın dosyası kullanılamaz
      const own = src => src.startsWith(`/api/brands/${brandId}/`);
      if (clean.some(l => l.type === 'image' && !own(l.src))) throw badRequest('Yalnızca bu markanın kütüphanesindeki görseller kullanılabilir.');
      const out = { bg: HEX.test((s && s.bg) || '') ? s.bg : '#ffffff', layers: clean };
      if (s && (s.frame === 'acilis' || s.frame === 'kapanis')) out.frame = s.frame; // 11.12 sabit açılış/kapanış
      // Zemin görseli (kütüphaneden): kaplar ya da sığar; üstüne isteğe bağlı karartma
      if (s && s.bgImage && s.bgImage.src) {
        if (!ASSET_SRC.test(String(s.bgImage.src)) || !own(String(s.bgImage.src))) throw badRequest('Zemin görseli bu markanın kütüphanesinden olmalı.');
        const dim = Math.max(0, Math.min(80, Math.round(Number(s.bgImage.dim) || 0)));
        out.bgImage = { src: s.bgImage.src, fit: s.bgImage.fit === 'contain' ? 'contain' : 'cover', dim };
      }
      return out;
    }),
    caption: String(data.caption || '').slice(0, 3000),
    hashtags: (Array.isArray(data.hashtags) ? data.hashtags : []).map(h => polish(h).replace(/^#?/, '#')).filter(h => h.length > 1).slice(0, 10)
  };
}

const KIND_TASK = {
  story: 'GÖREV: Tek ekranlık bir Instagram story metni yaz: kısa başlık (en fazla 6 kelime) ve 1-2 kısa cümle (en fazla 140 karakter). Samimi, anlık bir dil.',
  kapak: 'GÖREV: Bir Reels videosunun kapak görseli için metin yaz: profil ızgarasında okunacak çok kısa ve merak uyandıran başlık (en fazla 5 kelime); body isteğe bağlı en fazla 6 kelimelik alt başlık.',
  reklam: 'GÖREV: Tek görsellik bir Instagram reklamı metni yaz: güçlü başlık (en fazla 7 kelime), faydayı anlatan tek cümle (en fazla 120 karakter) ve "cta" alanına 2-3 kelimelik eylem çağrısı (ör. Hemen dene). Abartılı ya da yanıltıcı iddia kullanma.',
  youtube: 'GÖREV: Bir YouTube videosunun kapak (thumbnail) metnini yaz: videonun ana vaadini anlatan, küçük önizlemede okunacak çok kısa kapak yazısı (en fazla 4 kelime, başlığı tekrar etmesin, merak uyandırsın); body isteğe bağlı en fazla 3 kelime. caption alanına YouTube video açıklaması yaz.',
  grafik: 'GÖREV: Tek görsellik bir bilgi grafiği metni yaz: başlık (en fazla 6 kelime) ve "items" alanında 4-6 kısa madde (her biri en fazla 70 karakter, somut bilgi).'
};

function postPrompt({ brandName, memory, topic, kind, slideCount, rewriteOf, poses = [], mascot = false }) {
  return [
    kind === 'youtube' ? `Sen '${brandName}' markasının YouTube kapak ve içerik yazarısın.` : `Sen '${brandName}' markasının Instagram içerik yazarısın.`, '', 'MARKA HAFIZASI (dil ve kitle buna uysun):', memory, '',
    `KONU: ${topic}`, '',
    KIND_TASK[kind] ? KIND_TASK[kind] : kind === 'carousel'
      ? `GÖREV: ${slideCount} slaytlık bir Instagram carousel metni yaz. 1. slayt kapak: merak uyandıran kısa başlık (en fazla 7 kelime) ve isteğe bağlı tek cümle alt başlık. Diğer slaytlar: her birinde kısa başlık (en fazla 6 kelime) ve 1-3 kısa cümlelik açıklama (en fazla 220 karakter). Son slayt akılda kalan bir özet ya da sonuç olsun. Slaytlar birbirini tekrar etmesin.`
      : 'GÖREV: Tek görsellik bir Instagram postu metni yaz: kısa, vurucu başlık (en fazla 7 kelime) ve isteğe bağlı tek cümle alt metin.',
    kind !== 'carousel' && mascot && poses.length ? `MASKOT: "speech" (maskotun en çok 6 kelimelik kısa tepkisi) ve "pose" yaz. "pose" şu pozlardan en uygun olanı olsun: ${poses.join(', ')}.` : '',
    rewriteOf ? `\nÖNCEKİ METİN (farklı ve daha iyi yaz, kopyalama):\n${rewriteOf}` : '',
    // Kart düzeni (carousel): başlıkta *vurgu*, maskotun konuşma balonu ve slayta uygun poz
    kind === 'carousel' ? [
      'BAŞLIKLAR: Her başlıkta en önemli 1-2 kelimeyi *yıldız* içine al (ör. "En sık yapılan *3 hata*"); bunlar marka renginde basılır. Kapak başlığı vurucu olsun.',
      'Metin kuralları: günlük dil, kısa ve tam cümleler, alt metin 1-2 cümle. Gereksiz tırnak ve noktalı virgül kullanma.',
      poses.length ? `MASKOT: Her slayta "speech" (maskotun en çok 6 kelimelik kısa tepkisi, ör. "Kaydırarak incele 👀"; son slaytta kaydet/paylaş çağrısı) ve "pose" yaz. "pose" şu pozlardan slayta en uygun olanı olsun: ${poses.join(', ')}.` : ''
    ].filter(Boolean).join('\n') : '',
    kind === 'youtube'
      ? "Kapak yazısı kalın ve iri basılacak; kısa ve okunaklı olsun. Gerçek kişi, ünlü veya başka marka adı kullanma. 'caption' alanına YouTube video açıklaması (ilk iki satır videonun vaadini anlatsın, 400-1500 karakter), 'hashtags' alanına en fazla 3 hashtag yaz."
      : "Görsel üzerindeki metinler kısa ve okunaklı olsun. Gerçek kişi, ünlü veya başka marka adı kullanma. 'caption' alanına Instagram açıklaması (400-1000 karakter, merak uyandıran ilk satır, yorum sorusu), 'hashtags' alanına en fazla 5 hashtag yaz.",
    '', 'Sadece şu JSON biçiminde yanıt ver:',
    JSON.stringify({ title: 'İçeriğin kısa adı', slides: [Object.assign({ title: 'Slayt başlığı', body: 'Kısa açıklama' }, kind === 'grafik' ? { items: ['Madde 1', 'Madde 2'] } : {}, kind === 'reklam' ? { cta: 'Hemen dene' } : {}, (kind === 'carousel' || mascot) && poses.length ? { speech: 'Kısa tepki', pose: poses[0] } : {})], caption: 'Açıklama', hashtags: ['#ornek'] })
  ].filter(Boolean).join('\n');
}

export function createPostService({ db, ai, brands, assets, workspace }) {
  const toPost = r => {
    const data = parseJson(r.data, {});
    return { id: r.id, title: r.title, kind: r.kind, kindLabel: POST_KINDS[r.kind] || r.kind, data, model: r.model, modelLabel: r.model ? ai.labelOf(r.model) : '', createdAt: r.created_at, updatedAt: r.updated_at,
      content: (db.prepare('SELECT id, scheduled_at FROM contents WHERE post_id = ? ORDER BY created_at DESC LIMIT 1').get(r.id) || null) };
  };
  const row = (brandId, id) => {
    const r = db.prepare('SELECT * FROM posts WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Post bulunamadı.');
    return r;
  };
  const brandAssets = b => {
    const logo = assets.list(b.id, 'logo')[0];
    const mascot = assets.list(b.id, 'mascot')[0];
    return { logoUrl: logo ? logo.url : null, logoId: logo ? logo.id : null, mascotUrl: mascot ? mascot.url : null, mascotId: mascot ? mascot.id : null,
      mascots: assets.list(b.id, 'mascot').map(a => ({ id: a.id, url: a.url, label: a.label })) };
  };

  async function writeTexts(b, { topic, kind, slides, modelRef, rewriteOf, mascot = false }) {
    const count = kind === 'carousel' ? Math.min(MAX_SLIDES, Math.max(3, Number(slides) || 6)) : 1;
    // Post metni kısa ve kalıplı: modelin uzun düşünmesine gerek yok (düşük çaba = hızlı yanıt)
    const poses = assets.list(b.id, 'mascot').map(a => polish(a.label)).filter(Boolean).slice(0, 12);
    const r = await ai.run({ task: 'yazim', brandId: b.id, prompt: postPrompt({ brandName: b.name, memory: brands.memory(b.id), topic, kind, slideCount: count, rewriteOf, poses, mascot }), json: true, modelRef: modelRef || null, effort: 'low', temperature: 0.7 });
    const out = r.output || {};
    const texts = (Array.isArray(out.slides) ? out.slides : []).map(s => ({ title: polish(s && s.title).slice(0, 160), body: polish(s && s.body).slice(0, 500),
      items: (Array.isArray(s && s.items) ? s.items : []).map(x => polish(x).slice(0, 120)).filter(Boolean).slice(0, 6), cta: polish(s && s.cta).slice(0, 40),
      speech: polish(s && s.speech).replace(/["“”]/g, '').slice(0, 60), pose: polish(s && s.pose).slice(0, 60) })).filter(s => s.title).slice(0, count);
    if (!texts.length) throw new HttpError(502, 'AI_BAD_POST', 'Model kullanılabilir bir metin döndürmedi. Tekrar dene ya da başka bir model seç.');
    return { texts, title: polish(out.title).slice(0, 120) || texts[0].title, caption: String(out.caption || '').trim().slice(0, 3000),
      hashtags: (Array.isArray(out.hashtags) ? out.hashtags : []).map(h => polish(h).replace(/^#?/, '#')).filter(h => h.length > 1).slice(0, 8), r };
  }
  // Şablonlar: bir tasarımın yerleşimi (katmanlar, renkler, görseller, metinler) markaya kaydedilir; yeni tasarım ondan açılır
  const cleanMatch = m => ({
    formats: [...new Set((Array.isArray(m && m.formats) ? m.formats : []).map(String).filter(k => IDEA_FORMATS[k]))],
    categories: [...new Set((Array.isArray(m && m.categories) ? m.categories : []).map(String).filter(k => IDEA_CATEGORIES[k]))],
    // 11.12 sabit açılış / kapanış slaytı; autoTitle: başlık her postta konuya göre değişir
    frame: ['acilis', 'kapanis'].includes(m && m.frame) ? m.frame : '',
    autoTitle: Boolean(m && m.autoTitle)
  });
  // 11.12: carousel'e markanın sabit açılış ve kapanış slaytları eklenir (şablonun ilk slaytı; başlık istenirse konuya göre)
  const withFrames = (brandId, data, kind, { title = '', cta = '' } = {}) => {
    if (kind !== 'carousel') return data;
    const tpls = db.prepare('SELECT * FROM post_templates WHERE brand_id = ?').all(brandId).map(toTemplate);
    const frameSlide = (t, text) => {
      const sl = JSON.parse(JSON.stringify(((cleanData(t.data, brandId).slides) || [])[0] || null));
      if (!sl) return null;
      sl.frame = t.match.frame;
      if (t.match.autoTitle && text) { const tl = (sl.layers || []).find(l => l.type === 'text' && l.role === 'title'); if (tl) tl.text = text; }
      (sl.layers || []).forEach(l => { l.id = Math.random().toString(36).slice(2, 10); });
      return sl;
    };
    const open = tpls.find(t => t.match.frame === 'acilis');
    const close = tpls.find(t => t.match.frame === 'kapanis');
    const slides = [...(data.slides || [])];
    if (open) { const s0 = frameSlide(open, title); if (s0) slides.unshift(s0); }
    if (close) { const s1 = frameSlide(close, cta); if (s1) slides.push(s1); }
    // Slayt sınırı aşılmasın: fazlası kapanıştan önceki içerik slaytlarından düşer
    while (slides.length > MAX_SLIDES) slides.splice(slides.length - (close ? 2 : 1), 1);
    return Object.assign({}, data, { slides });
  };
  const toTemplate = r => ({ id: r.id, name: r.name, kind: r.kind, kindLabel: POST_KINDS[r.kind] || r.kind, data: parseJson(r.data, {}), match: cleanMatch(parseJson(r.match, {})), createdAt: r.created_at });
  // 10.8: fikre en uygun şablon: tür ve kategori eşleşmesi puanlanır (ikisi de tutarsa en iyi); hiçbiri tutmazsa yok
  const bestTemplate = (brandId, idea) => {
    let best = null;
    for (const t of db.prepare('SELECT * FROM post_templates WHERE brand_id = ? ORDER BY created_at DESC').all(brandId).map(toTemplate)) {
      if (t.match.frame) continue; // açılış/kapanış şablonu içerik şablonu değildir
      const f = t.match.formats.includes(idea.format) ? 2 : 0;
      const c = t.match.categories.includes(idea.category) ? 1 : 0;
      if (f + c > 0 && (!best || f + c > best.score)) best = { score: f + c, t };
    }
    return best ? best.t : null;
  };
  // Şablonun metin katmanlarına yeni metinler yerleşir; görseller, renkler ve yerleşim aynen kalır.
  // "Maskot yeri" işaretli görsel, yapay zekânın seçtiği poza uyan maskot görseliyle değişir (yer ve boyut aynı).
  const fillTemplate = (data, texts, { mascots = [], topic = '' } = {}) => Object.assign({}, data, {
    slides: (data.slides || []).map((sl, i, all) => {
      const t = texts[Math.min(i, texts.length - 1)] || { title: '', body: '', items: [], cta: '' };
      const speech = t.speech || '';
      let k = 0;
      const layers = (sl.layers || []).filter(l => speech || !(l.role === 'bubble' || (l.type === 'text' && l.role === 'speech'))).map(l => {
        if (l.type === 'image' && l.role === 'mascot' && mascots.length) {
          const m = pickPose(mascots, t.pose) || mascots[i % mascots.length];
          return Object.assign({}, l, { src: m.url, assetId: m.id });
        }
        if (l.type !== 'text') return l;
        if (l.role === 'title') return Object.assign({}, l, { text: t.title });
        if (l.role === 'body') return Object.assign({}, l, { text: t.body || '' });
        if (l.role === 'item') return Object.assign({}, l, { text: (t.items || [])[k++] || '' });
        if (l.role === 'cta' && t.cta) return Object.assign({}, l, { text: t.cta });
        if (l.role === 'speech') return Object.assign({}, l, { text: speech });
        if (l.role === 'topic' && topic) return Object.assign({}, l, { text: String(topic).slice(0, 60) });
        if (l.role === 'num') return Object.assign({}, l, { text: String(i + 1).padStart(2, '0') });
        if (l.role === 'page') return Object.assign({}, l, { text: `/ ${String(all.length).padStart(2, '0')}` });
        return l;
      });
      return Object.assign({}, sl, { layers });
    })
  });
  // Şablonun slaytları istenen sayıya uyarlanır: ilk slayt kapak, son slayt kapanış (3+ slaytlık şablonda), aradakiler sırayla tekrar eder
  const fitSlides = (slides, count) => {
    const n = slides.length;
    if (!n || n === count) return slides;
    const copy = s => { const c = JSON.parse(JSON.stringify(s)); (c.layers || []).forEach(l => { l.id = Math.random().toString(36).slice(2, 10); }); return c; };
    if (n === 1) return Array.from({ length: count }, () => copy(slides[0]));
    const hasEnd = n >= 3 && count >= 2;
    const middle = slides.slice(1, hasEnd ? -1 : undefined);
    const out = [copy(slides[0])];
    for (let i = 0; out.length < count - (hasEnd ? 1 : 0); i++) out.push(copy(middle[i % middle.length]));
    if (hasEnd) out.push(copy(slides[n - 1]));
    return out.slice(0, count);
  };
  function fromTemplate(b, templateId, title) {
    const tpl = db.prepare('SELECT * FROM post_templates WHERE id = ? AND brand_id = ?').get(String(templateId), b.id);
    if (!tpl) throw notFound('Şablon bulunamadı.');
    const t = text(title, { field: 'Ad', max: 120 }) || tpl.name;
    const data = Object.assign(cleanData(parseJson(tpl.data, {}), b.id), { caption: '', hashtags: [] });
    const r = { id: newId(), brand_id: b.id, title: t, kind: tpl.kind, data: JSON.stringify(data), created_at: now() };
    db.prepare('INSERT INTO posts (id, brand_id, title, kind, data, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'\', ?, ?)').run(r.id, r.brand_id, r.title, r.kind, r.data, r.created_at, r.created_at);
    return toPost(Object.assign(r, { model: '', updated_at: r.created_at }));
  }
  const meta = r => ({ model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) });
  // Konu/fikir metni marka diliyle yazılır, şablonun metin katmanlarına yerleşir (görsel, renk, yerleşim aynen); carousel'e açılış/kapanış eklenir
  async function fromTemplateTopic(b, tpl, topic, modelRef, slides = null) {
    const clean = cleanData(tpl.data, b.id);
    const tslides = clean.slides.filter(s => !s.frame);
    // Carousel'de istenen slayt sayısı (yoksa şablonun kendi sayısı; 3'ten azsa 6)
    const want = tpl.kind === 'carousel' ? Math.min(MAX_SLIDES, Math.max(3, Number(slides) || (tslides.length >= 3 ? tslides.length : 6))) : tslides.length || 1;
    const mascot = tslides.some(s => (s.layers || []).some(l => l.type === 'image' && l.role === 'mascot'));
    const w = await writeTexts(b, { topic, kind: tpl.kind, slides: want, modelRef, mascot });
    const fitted = tpl.kind === 'carousel' ? fitSlides(tslides, w.texts.length) : tslides;
    const filled = fillTemplate(Object.assign({}, clean, { slides: fitted }), w.texts, { mascots: brandAssets(b).mascots, topic: String(topic).split(' — ')[0] });
    const data = Object.assign(withFrames(b.id, filled, tpl.kind, { title: w.title, cta: (w.texts[w.texts.length - 1] || {}).cta }), { caption: w.caption, hashtags: w.hashtags, topic, template: { id: tpl.id, name: tpl.name } });
    const r = { id: newId(), brand_id: b.id, title: w.title, kind: tpl.kind, data: JSON.stringify(data), model: w.r.servedRef || w.r.ref, created_at: now() };
    db.prepare('INSERT INTO posts (id, brand_id, title, kind, data, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, r.brand_id, r.title, r.kind, r.data, r.model, r.created_at, r.created_at);
    brands.logActivity(b.id, 'post.created', `"${tpl.name}" şablonuyla hazırlandı: ${w.title}`);
    return Object.assign(toPost(Object.assign(r, { updated_at: r.created_at })), { ai: meta(w.r), template: { id: tpl.id, name: tpl.name } });
  }

  return {
    kinds: POST_KINDS,
    kindDefaults: KIND_DEFAULTS,
    formats: Object.fromEntries(Object.entries(POST_FORMATS).map(([k, v]) => [k, v])),
    list: brandId => db.prepare('SELECT * FROM posts WHERE brand_id = ? ORDER BY updated_at DESC').all(brands.get(brandId).id).map(toPost),
    get: (brandId, id) => toPost(row(brands.get(brandId).id, id)),

    async create(brandId, { topic, kind = 'carousel', format = null, slides = 6, modelRef = null, templateId = null } = {}) {
      const b = brands.get(brandId);
      // 11.10: konudan üretirken şablon seçildiyse metin o şablona yerleşir
      if (templateId) {
        const r0 = db.prepare('SELECT * FROM post_templates WHERE id = ? AND brand_id = ?').get(String(templateId), b.id);
        if (!r0) throw notFound('Şablon bulunamadı.');
        return fromTemplateTopic(b, toTemplate(r0), text(topic, { field: 'Konu', max: 1000, required: true }), modelRef, slides);
      }
      oneOf(kind, Object.keys(POST_KINDS), 'Tür');
      format = format || KIND_DEFAULTS[kind].format;
      if (!POST_FORMATS[format]) throw badRequest('Geçersiz boyut.');
      const t = text(topic, { field: 'Konu', max: 1000, required: true });
      const w = await writeTexts(b, { topic: t, kind, slides, modelRef });
      const data = withFrames(b.id, { format, slides: layoutSlides(Object.assign({ texts: w.texts, brand: b, format, kind, topic: String(t).split(' — ')[0] }, brandAssets(b))), caption: w.caption, hashtags: w.hashtags, topic: t }, kind, { title: w.title, cta: (w.texts[w.texts.length - 1] || {}).cta });
      const r = { id: newId(), brand_id: b.id, title: w.title, kind, data: JSON.stringify(data), model: w.r.servedRef || w.r.ref, created_at: now() };
      db.prepare('INSERT INTO posts (id, brand_id, title, kind, data, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, r.brand_id, r.title, r.kind, r.data, r.model, r.created_at, r.created_at);
      brands.logActivity(b.id, 'post.created', `${POST_KINDS[kind]} hazırlandı: ${w.title}`);
      return Object.assign(toPost(Object.assign(r, { updated_at: r.created_at })), { ai: meta(w.r) });
    },

    createBlank(brandId, { title = 'Yeni post', kind = 'post', format = null, templateId = null } = {}) {
      const b = brands.get(brandId);
      if (templateId) return fromTemplate(b, templateId, title);
      oneOf(kind, Object.keys(POST_KINDS), 'Tür');
      format = format || KIND_DEFAULTS[kind].format;
      if (!POST_FORMATS[format]) throw badRequest('Geçersiz boyut.');
      const t = text(title, { field: 'Ad', max: 120, required: true });
      const data = { format, slides: layoutSlides(Object.assign({ texts: [{ title: t, body: '', items: kind === 'grafik' ? ['Birinci madde', 'İkinci madde', 'Üçüncü madde'] : [] }], brand: b, format, kind }, brandAssets(b))), caption: '', hashtags: [] };
      const r = { id: newId(), brand_id: b.id, title: t, kind, data: JSON.stringify(data), created_at: now() };
      db.prepare('INSERT INTO posts (id, brand_id, title, kind, data, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'\', ?, ?)').run(r.id, r.brand_id, r.title, r.kind, r.data, r.created_at, r.created_at);
      return toPost(Object.assign(r, { model: '', updated_at: r.created_at }));
    },

    // Metinleri (seçilen modelle) yeniden yazdırır; yerleşim marka şablonuyla baştan kurulur
    async rewrite(brandId, id, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      const p = row(b.id, id);
      const data = parseJson(p.data, {});
      const prev = (data.slides || []).map(s => (s.layers || []).filter(l => l.type === 'text' && (l.role === 'title' || l.role === 'body')).map(l => l.text).join(' — ')).join('\n');
      // Şablonla hazırlanmış tasarımda yerleşim korunur: yalnızca metinler (ve maskot pozu) yenilenir
      if (data.template) {
        const content = (data.slides || []).map((s, i) => i).filter(i => !data.slides[i].frame);
        const w = await writeTexts(b, { topic: data.topic || p.title, kind: p.kind, slides: content.length, modelRef, rewriteOf: prev, mascot: true });
        const filled = fillTemplate({ slides: content.map(i => data.slides[i]) }, w.texts, { mascots: brandAssets(b).mascots, topic: String(data.topic || p.title).split(' — ')[0] }).slides;
        const slides = data.slides.map((s, i) => (content.includes(i) ? filled[content.indexOf(i)] : s));
        const next = Object.assign({}, data, { slides, caption: w.caption, hashtags: w.hashtags });
        db.prepare('UPDATE posts SET title = ?, data = ?, model = ?, updated_at = ? WHERE id = ?').run(w.title, JSON.stringify(next), w.r.servedRef || w.r.ref, now(), p.id);
        return Object.assign(toPost(row(b.id, p.id)), { ai: meta(w.r) });
      }
      const w = await writeTexts(b, { topic: data.topic || p.title, kind: p.kind, slides: (data.slides || []).length, modelRef, rewriteOf: prev });
      const next = Object.assign({}, data, { slides: layoutSlides(Object.assign({ texts: w.texts, brand: b, format: data.format, kind: p.kind, topic: String(data.topic || p.title).split(' — ')[0] }, brandAssets(b))), caption: w.caption, hashtags: w.hashtags });
      db.prepare('UPDATE posts SET title = ?, data = ?, model = ?, updated_at = ? WHERE id = ?').run(w.title, JSON.stringify(next), w.r.servedRef || w.r.ref, now(), p.id);
      return Object.assign(toPost(row(b.id, p.id)), { ai: meta(w.r) });
    },

    update(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const p = row(b.id, id);
      const title = 'title' in body ? text(body.title, { field: 'Ad', max: 120, required: true }) : p.title;
      const current = parseJson(p.data, {});
      const data = body.data ? Object.assign(cleanData(body.data, b.id), { topic: current.topic }, current.idea ? { idea: current.idea } : {}, current.template ? { template: current.template } : {}) : current;
      db.prepare('UPDATE posts SET title = ?, data = ?, updated_at = ? WHERE id = ?').run(title, JSON.stringify(data), now(), p.id);
      return toPost(row(b.id, p.id));
    },

    remove(brandId, id) { db.prepare('DELETE FROM posts WHERE id = ?').run(row(brands.get(brandId).id, id).id); },

    // 10.8 Fikirden tasarım: fikrin metni marka diliyle yazılır, eşleşen (ya da seçilen) şablona yerleşir; şablon yoksa
    // fikrin türüne uygun marka yerleşimiyle hazırlanır. Fikir "kullanıldı (Post stüdyosu)" olur.
    async fromIdea(brandId, { ideaId, templateId = null, slides = null, modelRef = null } = {}) {
      const b = brands.get(brandId);
      const ir = db.prepare('SELECT * FROM ideas WHERE id = ? AND brand_id = ?').get(String(ideaId || ''), b.id);
      if (!ir) throw notFound('Fikir bulunamadı.');
      const idea = { id: ir.id, title: ir.title, description: ir.description, format: ir.format || 'genel', category: ir.category };
      const topic = idea.title + (idea.description ? ` — ${idea.description}` : '');
      let tpl = null;
      if (templateId) {
        const r0 = db.prepare('SELECT * FROM post_templates WHERE id = ? AND brand_id = ?').get(String(templateId), b.id);
        if (!r0) throw notFound('Şablon bulunamadı.');
        tpl = toTemplate(r0);
      } else tpl = bestTemplate(b.id, idea);
      let post;
      if (tpl) post = await fromTemplateTopic(b, tpl, topic, modelRef, slides);
      else {
        const kind = idea.format === 'story' ? 'story' : 'post';
        post = await this.create(b.id, { topic, kind, modelRef });
      }
      const used = markIdeaUsed(db, b.id, idea.id, 'post');
      // Postun kaynağı: dışa aktarırken "bu fikri havuzdan sil" önerisi için
      const pd = parseJson(db.prepare('SELECT data FROM posts WHERE id = ?').get(post.id).data, {});
      pd.idea = { id: idea.id, title: idea.title };
      db.prepare('UPDATE posts SET data = ? WHERE id = ?').run(JSON.stringify(pd), post.id);
      post.data = pd;
      return { post, template: tpl ? { id: tpl.id, name: tpl.name } : null, warning: used && used.warning };
    },
    setTemplateMatch(brandId, templateId, body = {}) {
      const b = brands.get(brandId);
      const r = db.prepare('SELECT * FROM post_templates WHERE id = ? AND brand_id = ?').get(String(templateId), b.id);
      if (!r) throw notFound('Şablon bulunamadı.');
      const m = cleanMatch(body);
      if (m.frame) {
        for (const o of db.prepare('SELECT * FROM post_templates WHERE brand_id = ? AND id <> ?').all(b.id, r.id)) {
          const om = cleanMatch(parseJson(o.match, {}));
          if (om.frame === m.frame) { om.frame = ''; db.prepare('UPDATE post_templates SET match = ? WHERE id = ?').run(JSON.stringify(om), o.id); }
        }
      }
      db.prepare('UPDATE post_templates SET match = ? WHERE id = ?').run(JSON.stringify(m), r.id);
      return toTemplate(db.prepare('SELECT * FROM post_templates WHERE id = ?').get(r.id));
    },
    listTemplates: brandId => db.prepare('SELECT * FROM post_templates WHERE brand_id = ? ORDER BY created_at DESC').all(brands.get(brandId).id).map(toTemplate),
    saveTemplate(brandId, id, { name } = {}) {
      const b = brands.get(brandId);
      const p = row(b.id, id);
      const n = text(name, { field: 'Şablon adı', max: 80 }) || `Şablon ${db.prepare('SELECT COUNT(*) AS n FROM post_templates WHERE brand_id = ?').get(b.id).n + 1}`;
      const data = parseJson(p.data, {});
      delete data.topic;
      const r = { id: newId(), name: n, created_at: now() };
      db.prepare('INSERT INTO post_templates (id, brand_id, name, kind, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(r.id, b.id, n, p.kind, JSON.stringify(data), r.created_at);
      return toTemplate(db.prepare('SELECT * FROM post_templates WHERE id = ?').get(r.id));
    },
    // Şablona özel ad (ör. "Haftalık ipucu", "Bayram tasarımı")
    renameTemplate(brandId, templateId, { name } = {}) {
      const b = brands.get(brandId);
      const n = text(name, { field: 'Şablon adı', max: 80, required: true });
      const r = db.prepare('UPDATE post_templates SET name = ? WHERE id = ? AND brand_id = ?').run(n, String(templateId), b.id);
      if (!r.changes) throw notFound('Şablon bulunamadı.');
      return toTemplate(db.prepare('SELECT * FROM post_templates WHERE id = ?').get(String(templateId)));
    },
    removeTemplate(brandId, templateId) {
      const b = brands.get(brandId);
      const r = db.prepare('DELETE FROM post_templates WHERE id = ? AND brand_id = ?').run(String(templateId), b.id);
      if (!r.changes) throw notFound('Şablon bulunamadı.');
    },

    schedule(brandId, id, { scheduledAt = null } = {}) {
      const b = brands.get(brandId);
      const p = row(b.id, id);
      const content = workspace.createContent({ brandId: b.id, title: p.title, type: (KIND_DEFAULTS[p.kind] || KIND_DEFAULTS.post).content, status: 'hazirlaniyor', scheduledAt, notes: 'Post stüdyosundan oluşturuldu.', caption: String((parseJson(p.data, {}).caption) || '').slice(0, 2200), hashtags: parseJson(p.data, {}).hashtags || [] });
      db.prepare('UPDATE contents SET post_id = ? WHERE id = ?').run(p.id, content.id);
      return Object.assign(content, { postId: p.id });
    }
  };
}
