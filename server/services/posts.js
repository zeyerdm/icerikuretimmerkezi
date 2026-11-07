// Post stüdyosu (ilk sürüm): konudan carousel/post üretimi, katmanlı slaytlar, marka renk/font/logo/maskot.
// Slayt verisi: { format, slides: [{ bg, layers: [{ id, type: 'text'|'image'|'shape', ... }] }], caption, hashtags }
// Koordinatlar 1080 px genişlikli tuval üzerinde; çizim ve PNG dışa aktarma tarayıcıda aynı veriden yapılır.
import { newId, now, text, badRequest, notFound, oneOf, parseJson, HttpError, HEX } from '../lib/http.js';
import { polish } from './reels/rules.js';

export const POST_KINDS = { carousel: 'Carousel', post: 'Tek görsel post' };
export const POST_FORMATS = { '4:5': { w: 1080, h: 1350, label: 'Dikey 4:5' }, '1:1': { w: 1080, h: 1080, label: 'Kare 1:1' }, '9:16': { w: 1080, h: 1920, label: 'Story 9:16' } };
const MAX_SLIDES = 10;
const MAX_LAYERS = 30;
const LAYER_TYPES = ['text', 'image', 'shape'];

// Açık renk üzerinde koyu, koyu renk üzerinde beyaz yazı
function readableOn(hex) {
  const n = parseInt(String(hex || '#ffffff').slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#1b1f3b' : '#ffffff';
}

// Metinlerden marka şablonuyla slaytlar: kapak marka renginde, iç slaytlar marka zemininde; logo köşede, maskot kapakta
export function layoutSlides({ texts, brand, format = '4:5', logoUrl = null, mascotUrl = null, logoId = null, mascotId = null }) {
  const F = POST_FORMATS[format] || POST_FORMATS['4:5'];
  const c = brand.colors || {};
  const primary = HEX.test(c.primary || '') ? c.primary : '#5b55e6';
  const bg = HEX.test((c.backgrounds || [])[0] || '') ? c.backgrounds[0] : '#ffffff';
  const heading = HEX.test(c.heading || '') ? c.heading : readableOn(bg);
  const body = HEX.test(c.body || '') ? c.body : readableOn(bg);
  const fonts = { heading: (brand.fonts && brand.fonts.heading) || 'Poppins', body: (brand.fonts && brand.fonts.body) || 'Inter' };
  const id = () => newId().slice(0, 8);
  const total = texts.length;
  // Başlığın kaç satır tutacağı tahmini: kelime kelime satıra yerleştirilir (kalın yazıda harf ≈ 0,62 × yazı boyu);
  // alt metin başlığın altından başlar. Fazla tahmin yalnızca biraz boşluk bırakır, az tahmin yazıları çakıştırırdı.
  const lines = (t, size, w) => {
    let n = 1;
    let cur = 0;
    String(t || '').split(/\s+/).filter(Boolean).forEach(word => {
      const ww = word.length * size * 0.62;
      const add = cur ? size * 0.3 + ww : ww;
      if (cur && cur + add > w) { n++; cur = ww; } else cur += add;
    });
    return n;
  };
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
  if (l.type === 'text') {
    Object.assign(out, { role: String(l.role || 'text').slice(0, 12), text: String(l.text || '').slice(0, 1000), w: num(l.w, 40, 2000, 800), size: num(l.size, 10, 300, 40),
      color: HEX.test(l.color || '') ? l.color : '#1b1f3b', font: polish(l.font).slice(0, 40) || 'Inter', weight: [400, 500, 600, 700, 800, 900].includes(Number(l.weight)) ? Number(l.weight) : 700,
      align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'left' });
  } else if (l.type === 'image') {
    // Yalnızca bu uygulamadaki varlık dosyaları (dış adresten görsel çekilmez)
    if (!/^\/api\/brands\/[A-Za-z0-9-]+\/assets\/[A-Za-z0-9-]+\/file$/.test(String(l.src || ''))) throw badRequest('Görsel katmanı kütüphanedeki bir dosya olmalı.');
    Object.assign(out, { src: l.src, assetId: l.assetId ? String(l.assetId).slice(0, 40) : null, w: num(l.w, 10, 4000, 300), h: num(l.h, 10, 4000, 300) });
  } else {
    Object.assign(out, { shape: 'rect', w: num(l.w, 1, 4000, 100), h: num(l.h, 1, 4000, 100), color: HEX.test(l.color || '') ? l.color : '#5b55e6', radius: num(l.radius, 0, 1000, 0) });
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
      if (clean.some(l => l.type === 'image' && !l.src.startsWith(`/api/brands/${brandId}/`))) throw badRequest('Yalnızca bu markanın kütüphanesindeki görseller kullanılabilir.');
      return { bg: HEX.test((s && s.bg) || '') ? s.bg : '#ffffff', layers: clean };
    }),
    caption: String(data.caption || '').slice(0, 3000),
    hashtags: (Array.isArray(data.hashtags) ? data.hashtags : []).map(h => polish(h).replace(/^#?/, '#')).filter(h => h.length > 1).slice(0, 10)
  };
}

function postPrompt({ brandName, memory, topic, kind, slideCount, rewriteOf }) {
  return [
    `Sen '${brandName}' markasının Instagram içerik yazarısın.`, '', 'MARKA HAFIZASI (dil ve kitle buna uysun):', memory, '',
    `KONU: ${topic}`, '',
    kind === 'carousel'
      ? `GÖREV: ${slideCount} slaytlık bir Instagram carousel metni yaz. 1. slayt kapak: merak uyandıran kısa başlık (en fazla 7 kelime) ve isteğe bağlı tek cümle alt başlık. Diğer slaytlar: her birinde kısa başlık (en fazla 6 kelime) ve 1-3 kısa cümlelik açıklama (en fazla 220 karakter). Son slayt akılda kalan bir özet ya da sonuç olsun. Slaytlar birbirini tekrar etmesin.`
      : 'GÖREV: Tek görsellik bir Instagram postu metni yaz: kısa, vurucu başlık (en fazla 7 kelime) ve isteğe bağlı tek cümle alt metin.',
    rewriteOf ? `\nÖNCEKİ METİN (farklı ve daha iyi yaz, kopyalama):\n${rewriteOf}` : '',
    "Görsel üzerindeki metinler kısa ve okunaklı olsun. Gerçek kişi, ünlü veya başka marka adı kullanma. 'caption' alanına Instagram açıklaması (400-1000 karakter, merak uyandıran ilk satır, yorum sorusu), 'hashtags' alanına en fazla 5 hashtag yaz.",
    '', 'Sadece şu JSON biçiminde yanıt ver:',
    JSON.stringify({ title: 'İçeriğin kısa adı', slides: [{ title: 'Slayt başlığı', body: 'Kısa açıklama' }], caption: 'Açıklama', hashtags: ['#ornek'] })
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
    const texts = (Array.isArray(out.slides) ? out.slides : []).map(s => ({ title: polish(s && s.title).slice(0, 160), body: polish(s && s.body).slice(0, 500) })).filter(s => s.title).slice(0, count);
    if (!texts.length) throw new HttpError(502, 'AI_BAD_POST', 'Model kullanılabilir bir metin döndürmedi. Tekrar dene ya da başka bir model seç.');
    return { texts, title: polish(out.title).slice(0, 120) || texts[0].title, caption: String(out.caption || '').trim().slice(0, 3000),
      hashtags: (Array.isArray(out.hashtags) ? out.hashtags : []).map(h => polish(h).replace(/^#?/, '#')).filter(h => h.length > 1).slice(0, 8), r };
  }
  const meta = r => ({ model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) });

  return {
    kinds: POST_KINDS,
    formats: Object.fromEntries(Object.entries(POST_FORMATS).map(([k, v]) => [k, v])),
    list: brandId => db.prepare('SELECT * FROM posts WHERE brand_id = ? ORDER BY updated_at DESC').all(brands.get(brandId).id).map(toPost),
    get: (brandId, id) => toPost(row(brands.get(brandId).id, id)),

    async create(brandId, { topic, kind = 'carousel', format = '4:5', slides = 6, modelRef = null } = {}) {
      const b = brands.get(brandId);
      oneOf(kind, Object.keys(POST_KINDS), 'Tür');
      if (!POST_FORMATS[format]) throw badRequest('Geçersiz boyut.');
      const t = text(topic, { field: 'Konu', max: 1000, required: true });
      const w = await writeTexts(b, { topic: t, kind, slides, modelRef });
      const data = { format, slides: layoutSlides(Object.assign({ texts: w.texts, brand: b, format }, brandAssets(b))), caption: w.caption, hashtags: w.hashtags, topic: t };
      const r = { id: newId(), brand_id: b.id, title: w.title, kind, data: JSON.stringify(data), model: w.r.servedRef || w.r.ref, created_at: now() };
      db.prepare('INSERT INTO posts (id, brand_id, title, kind, data, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, r.brand_id, r.title, r.kind, r.data, r.model, r.created_at, r.created_at);
      brands.logActivity(b.id, 'post.created', `${POST_KINDS[kind]} hazırlandı: ${w.title}`);
      return Object.assign(toPost(Object.assign(r, { updated_at: r.created_at })), { ai: meta(w.r) });
    },

    createBlank(brandId, { title = 'Yeni post', kind = 'post', format = '4:5' } = {}) {
      const b = brands.get(brandId);
      oneOf(kind, Object.keys(POST_KINDS), 'Tür');
      if (!POST_FORMATS[format]) throw badRequest('Geçersiz boyut.');
      const t = text(title, { field: 'Ad', max: 120, required: true });
      const data = { format, slides: layoutSlides(Object.assign({ texts: [{ title: t, body: '' }], brand: b, format }, brandAssets(b))), caption: '', hashtags: [] };
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
      const next = Object.assign({}, data, { slides: layoutSlides(Object.assign({ texts: w.texts, brand: b, format: data.format }, brandAssets(b))), caption: w.caption, hashtags: w.hashtags });
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

    schedule(brandId, id, { scheduledAt = null } = {}) {
      const b = brands.get(brandId);
      const p = row(b.id, id);
      const content = workspace.createContent({ brandId: b.id, title: p.title, type: p.kind === 'carousel' ? 'carousel' : 'post', status: 'hazirlaniyor', scheduledAt, notes: 'Post stüdyosundan oluşturuldu.' });
      db.prepare('UPDATE contents SET post_id = ? WHERE id = ?').run(p.id, content.id);
      return Object.assign(content, { postId: p.id });
    }
  };
}
