// Post stüdyosu (ilk sürüm): konudan carousel/post üretimi, katmanlı slaytlar, marka renk/font/logo/maskot.
// Slayt verisi: { format, slides: [{ bg, layers: [{ id, type: 'text'|'image'|'shape', ... }] }], caption, hashtags }
// Koordinatlar 1080 px genişlikli tuval üzerinde; çizim ve PNG dışa aktarma tarayıcıda aynı veriden yapılır.
import { newId, now, text, badRequest, notFound, oneOf, parseJson, HttpError, HEX } from '../lib/http.js';
import { polish } from './reels/rules.js';

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

// Metinlerden marka şablonuyla slaytlar: kapak marka renginde, iç slaytlar marka zemininde; logo köşede, maskot kapakta
export function layoutSlides({ texts, brand, format = '4:5', kind = 'carousel', logoUrl = null, mascotUrl = null, logoId = null, mascotId = null }) {
  const F = POST_FORMATS[format] || POST_FORMATS['4:5'];
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
  if (l.type === 'text') {
    Object.assign(out, { role: String(l.role || 'text').slice(0, 12), text: String(l.text || '').slice(0, 1000), w: num(l.w, 40, 2000, 800), size: num(l.size, 10, 300, 40),
      color: HEX.test(l.color || '') ? l.color : '#1b1f3b', font: polish(l.font).slice(0, 40) || 'Inter', weight: [400, 500, 600, 700, 800, 900].includes(Number(l.weight)) ? Number(l.weight) : 700,
      align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'left' });
  } else if (l.type === 'image') {
    // Yalnızca bu uygulamadaki varlık dosyaları (dış adresten görsel çekilmez)
    if (!ASSET_SRC.test(String(l.src || ''))) throw badRequest('Görsel katmanı kütüphanedeki bir dosya olmalı.');
    Object.assign(out, { src: l.src, assetId: l.assetId ? String(l.assetId).slice(0, 40) : null, w: num(l.w, 10, 4000, 300), h: num(l.h, 10, 4000, 300) });
  } else if (l.type === 'qr') {
    // QR kod: metin/link kare olarak çizilir (beyaz sessiz bölge her zaman eklenir, okunabilirlik için)
    const text = String(l.text || '').trim().slice(0, 200);
    if (!text) throw badRequest('QR kod için bir link ya da metin yaz.');
    const w = num(l.w, 80, 2000, 300);
    Object.assign(out, { text, w, h: w, color: HEX.test(l.color || '') ? l.color : '#000000' });
  } else {
    Object.assign(out, { shape: l.shape === 'circle' ? 'circle' : 'rect', w: num(l.w, 1, 4000, 100), h: num(l.h, 1, 4000, 100), color: HEX.test(l.color || '') ? l.color : '#5b55e6', radius: num(l.radius, 0, 1000, 0) });
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

function postPrompt({ brandName, memory, topic, kind, slideCount, rewriteOf }) {
  return [
    kind === 'youtube' ? `Sen '${brandName}' markasının YouTube kapak ve içerik yazarısın.` : `Sen '${brandName}' markasının Instagram içerik yazarısın.`, '', 'MARKA HAFIZASI (dil ve kitle buna uysun):', memory, '',
    `KONU: ${topic}`, '',
    KIND_TASK[kind] ? KIND_TASK[kind] : kind === 'carousel'
      ? `GÖREV: ${slideCount} slaytlık bir Instagram carousel metni yaz. 1. slayt kapak: merak uyandıran kısa başlık (en fazla 7 kelime) ve isteğe bağlı tek cümle alt başlık. Diğer slaytlar: her birinde kısa başlık (en fazla 6 kelime) ve 1-3 kısa cümlelik açıklama (en fazla 220 karakter). Son slayt akılda kalan bir özet ya da sonuç olsun. Slaytlar birbirini tekrar etmesin.`
      : 'GÖREV: Tek görsellik bir Instagram postu metni yaz: kısa, vurucu başlık (en fazla 7 kelime) ve isteğe bağlı tek cümle alt metin.',
    rewriteOf ? `\nÖNCEKİ METİN (farklı ve daha iyi yaz, kopyalama):\n${rewriteOf}` : '',
    kind === 'youtube'
      ? "Kapak yazısı kalın ve iri basılacak; kısa ve okunaklı olsun. Gerçek kişi, ünlü veya başka marka adı kullanma. 'caption' alanına YouTube video açıklaması (ilk iki satır videonun vaadini anlatsın, 400-1500 karakter), 'hashtags' alanına en fazla 3 hashtag yaz."
      : "Görsel üzerindeki metinler kısa ve okunaklı olsun. Gerçek kişi, ünlü veya başka marka adı kullanma. 'caption' alanına Instagram açıklaması (400-1000 karakter, merak uyandıran ilk satır, yorum sorusu), 'hashtags' alanına en fazla 5 hashtag yaz.",
    '', 'Sadece şu JSON biçiminde yanıt ver:',
    JSON.stringify({ title: 'İçeriğin kısa adı', slides: [Object.assign({ title: 'Slayt başlığı', body: 'Kısa açıklama' }, kind === 'grafik' ? { items: ['Madde 1', 'Madde 2'] } : {}, kind === 'reklam' ? { cta: 'Hemen dene' } : {})], caption: 'Açıklama', hashtags: ['#ornek'] })
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
    return { logoUrl: logo ? logo.url : null, logoId: logo ? logo.id : null, mascotUrl: mascot ? mascot.url : null, mascotId: mascot ? mascot.id : null };
  };

  async function writeTexts(b, { topic, kind, slides, modelRef, rewriteOf }) {
    const count = kind === 'carousel' ? Math.min(MAX_SLIDES, Math.max(3, Number(slides) || 6)) : 1;
    const r = await ai.run({ task: 'yazim', brandId: b.id, prompt: postPrompt({ brandName: b.name, memory: brands.memory(b.id), topic, kind, slideCount: count, rewriteOf }), json: true, modelRef: modelRef || null });
    const out = r.output || {};
    const texts = (Array.isArray(out.slides) ? out.slides : []).map(s => ({ title: polish(s && s.title).slice(0, 160), body: polish(s && s.body).slice(0, 500),
      items: (Array.isArray(s && s.items) ? s.items : []).map(x => polish(x).slice(0, 120)).filter(Boolean).slice(0, 6), cta: polish(s && s.cta).slice(0, 40) })).filter(s => s.title).slice(0, count);
    if (!texts.length) throw new HttpError(502, 'AI_BAD_POST', 'Model kullanılabilir bir metin döndürmedi. Tekrar dene ya da başka bir model seç.');
    return { texts, title: polish(out.title).slice(0, 120) || texts[0].title, caption: String(out.caption || '').trim().slice(0, 3000),
      hashtags: (Array.isArray(out.hashtags) ? out.hashtags : []).map(h => polish(h).replace(/^#?/, '#')).filter(h => h.length > 1).slice(0, 8), r };
  }
  // Şablonlar: bir tasarımın yerleşimi (katmanlar, renkler, görseller, metinler) markaya kaydedilir; yeni tasarım ondan açılır
  const toTemplate = r => ({ id: r.id, name: r.name, kind: r.kind, kindLabel: POST_KINDS[r.kind] || r.kind, data: parseJson(r.data, {}), createdAt: r.created_at });
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

  return {
    kinds: POST_KINDS,
    kindDefaults: KIND_DEFAULTS,
    formats: Object.fromEntries(Object.entries(POST_FORMATS).map(([k, v]) => [k, v])),
    list: brandId => db.prepare('SELECT * FROM posts WHERE brand_id = ? ORDER BY updated_at DESC').all(brands.get(brandId).id).map(toPost),
    get: (brandId, id) => toPost(row(brands.get(brandId).id, id)),

    async create(brandId, { topic, kind = 'carousel', format = null, slides = 6, modelRef = null } = {}) {
      const b = brands.get(brandId);
      oneOf(kind, Object.keys(POST_KINDS), 'Tür');
      format = format || KIND_DEFAULTS[kind].format;
      if (!POST_FORMATS[format]) throw badRequest('Geçersiz boyut.');
      const t = text(topic, { field: 'Konu', max: 1000, required: true });
      const w = await writeTexts(b, { topic: t, kind, slides, modelRef });
      const data = { format, slides: layoutSlides(Object.assign({ texts: w.texts, brand: b, format, kind }, brandAssets(b))), caption: w.caption, hashtags: w.hashtags, topic: t };
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
      const w = await writeTexts(b, { topic: data.topic || p.title, kind: p.kind, slides: (data.slides || []).length, modelRef, rewriteOf: prev });
      const next = Object.assign({}, data, { slides: layoutSlides(Object.assign({ texts: w.texts, brand: b, format: data.format, kind: p.kind }, brandAssets(b))), caption: w.caption, hashtags: w.hashtags });
      db.prepare('UPDATE posts SET title = ?, data = ?, model = ?, updated_at = ? WHERE id = ?').run(w.title, JSON.stringify(next), w.r.servedRef || w.r.ref, now(), p.id);
      return Object.assign(toPost(row(b.id, p.id)), { ai: meta(w.r) });
    },

    update(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const p = row(b.id, id);
      const title = 'title' in body ? text(body.title, { field: 'Ad', max: 120, required: true }) : p.title;
      const current = parseJson(p.data, {});
      const data = body.data ? Object.assign(cleanData(body.data, b.id), { topic: current.topic }) : current;
      db.prepare('UPDATE posts SET title = ?, data = ?, updated_at = ? WHERE id = ?').run(title, JSON.stringify(data), now(), p.id);
      return toPost(row(b.id, p.id));
    },

    remove(brandId, id) { db.prepare('DELETE FROM posts WHERE id = ?').run(row(brands.get(brandId).id, id).id); },

    listTemplates: brandId => db.prepare('SELECT * FROM post_templates WHERE brand_id = ? ORDER BY created_at DESC').all(brands.get(brandId).id).map(toTemplate),
    saveTemplate(brandId, id, { name } = {}) {
      const b = brands.get(brandId);
      const p = row(b.id, id);
      const n = text(name, { field: 'Şablon adı', max: 80 }) || p.title;
      const data = parseJson(p.data, {});
      delete data.topic;
      const r = { id: newId(), name: n, created_at: now() };
      db.prepare('INSERT INTO post_templates (id, brand_id, name, kind, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(r.id, b.id, n, p.kind, JSON.stringify(data), r.created_at);
      return toTemplate(db.prepare('SELECT * FROM post_templates WHERE id = ?').get(r.id));
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
