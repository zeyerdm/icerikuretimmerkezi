// Tasarım referansı analizi: yüklenen örnek tasarımı görseli okuyabilen bir modelle inceler; renk paleti, font önerisi,
// ruh hâli ve yerleşimi (metin blokları, şekiller, görsel alanları) çıkarır ve Post stüdyosunda düzenlenebilir bir
// şablona çevirir. Referanstaki metinler kopyalanmaz; yer tutucu yazılar konur. Görsel alanlarına markanın kendi logosu,
// maskotu ya da görseli yerleştirilir; uygun dosya yoksa alan açık renkli bir kutu olarak bırakılır.
import fs from 'node:fs';
import { newId, now, badRequest, HEX } from '../lib/http.js';
import { FONT_OPTIONS } from './brands.js';
import { POST_FORMATS, POST_KINDS } from './posts.js';
import { polish } from './reels/rules.js';

const clamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const hex = (v, d) => (HEX.test(String(v || '')) ? String(v).toLowerCase() : d);
const font = (v, d) => FONT_OPTIONS.find(f => f.toLowerCase() === String(v || '').toLowerCase()) || d;

function analysisPrompt(brand) {
  return [
    'TASARIM REFERANSI ANALİZİ',
    `Ekteki görsel bir sosyal medya tasarımı örneği. '${brand.name}' markası için bu tasarımın görsel dilini ve yerleşimini çıkar.`,
    'Görseldeki yazıları ve başka markaya ait logo/isimleri KOPYALAMA; metin bloklarına yalnızca rolünü anlatan kısa Türkçe yer tutucu yaz (ör. "Başlık buraya", "Kısa açıklama").',
    'Koordinatlar tasarımın genişliğine/yüksekliğine göre 0 ile 1 arasında oran olsun (x, y sol üst köşe). Yazı boyutu "size" tasarım genişliğinin oranı (ör. 0.08).',
    `Fontları şu listeden en yakın olanlarla eşle: ${FONT_OPTIONS.join(', ')}.`,
    'En fazla 14 blok çıkar; arka plandaki büyük renk alanlarını shape, fotoğraf/illüstrasyon/maskot/logo alanlarını image olarak ver.',
    '',
    'Sadece şu JSON biçiminde yanıt ver:',
    JSON.stringify({
      summary: 'Tasarımın 1-2 cümlelik Türkçe özeti', mood: 'Ruh hâli (ör. enerjik, sade, lüks)', format: '4:5',
      background: '#ffffff', palette: [{ hex: '#ff6b35', role: 'vurgu' }],
      fonts: { heading: 'Poppins', body: 'Inter' },
      blocks: [
        { type: 'text', role: 'title', text: 'Başlık buraya', x: 0.08, y: 0.1, w: 0.8, size: 0.08, weight: 800, align: 'left', color: '#1b1f3b' },
        { type: 'shape', shape: 'rect', x: 0, y: 0.7, w: 1, h: 0.3, color: '#ff6b35', radius: 0 },
        { type: 'image', role: 'photo', x: 0.5, y: 0.3, w: 0.4, h: 0.4 }
      ],
      tips: ['Bu tasarım dilini markaya uygularken dikkat edilecek 2-3 öneri']
    })
  ].join('\n');
}

export function createDesignRefService({ db, ai, brands, assets }) {
  // Analiz çıktısını 1080 px tuval katmanlarına çevirir
  function toPostData(a, b) {
    const format = POST_FORMATS[a.format] ? a.format : '4:5';
    const F = POST_FORMATS[format];
    const own = { logo: assets.list(b.id, 'logo')[0], mascot: assets.list(b.id, 'mascot')[0], photo: assets.list(b.id, 'brand_image')[0] || assets.list(b.id, 'product')[0] || assets.list(b.id, 'ai_image')[0] };
    const fonts = { heading: font(a.fonts && a.fonts.heading, b.fonts.heading || 'Poppins'), body: font(a.fonts && a.fonts.body, b.fonts.body || 'Inter') };
    const layers = [];
    let k = 0;
    const id = () => `r${(k++).toString(36)}${newId().slice(0, 5)}`;
    for (const bl of (Array.isArray(a.blocks) ? a.blocks : []).slice(0, 14)) {
      const x = Math.round(clamp(bl.x, -0.2, 1, 0) * F.w);
      const y = Math.round(clamp(bl.y, -0.2, 1, 0) * F.h);
      const w = Math.round(clamp(bl.w, 0.02, 1.2, 0.5) * F.w);
      const h = Math.round(clamp(bl.h, 0.02, 1.2, 0.2) * F.h);
      if (bl.type === 'text') {
        const role = ['title', 'body', 'cta', 'label'].includes(bl.role) ? bl.role : 'text';
        layers.push({ id: id(), type: 'text', role, text: polish(bl.text).slice(0, 200) || 'Metin', x, y, w: Math.max(80, w), size: Math.round(clamp(bl.size, 0.015, 0.2, 0.05) * F.w),
          color: hex(bl.color, '#1b1f3b'), font: role === 'title' || role === 'cta' ? fonts.heading : fonts.body, weight: [400, 500, 600, 700, 800, 900].includes(Number(bl.weight)) ? Number(bl.weight) : (role === 'title' ? 800 : 500),
          align: ['left', 'center', 'right'].includes(bl.align) ? bl.align : 'left' });
      } else if (bl.type === 'shape') {
        layers.push({ id: id(), type: 'shape', shape: bl.shape === 'circle' ? 'circle' : 'rect', x, y, w, h, color: hex(bl.color, '#e5e7eb'), radius: Math.round(clamp(bl.radius, 0, 0.5, 0) * F.w) });
      } else if (bl.type === 'image') {
        const role = ['logo', 'mascot'].includes(bl.role) ? bl.role : 'photo';
        const asset = own[role];
        if (asset) layers.push({ id: id(), type: 'image', src: asset.url, assetId: asset.id, x, y, w, h });
        else {
          // Markada uygun görsel yok: alan açıkça "görsel alanı" olarak işaretlenir (sahte görsel konmaz)
          layers.push({ id: id(), type: 'shape', shape: 'rect', x, y, w, h, color: '#e5e7eb', radius: 16 });
          layers.push({ id: id(), type: 'text', role: 'label', text: role === 'logo' ? 'Logo alanı' : role === 'mascot' ? 'Maskot alanı' : 'Görsel alanı', x, y: y + Math.round(h / 2) - 20, w, size: 32, color: '#6b7280', font: fonts.body, weight: 600, align: 'center' });
        }
      }
    }
    if (!layers.length) throw badRequest('Model yerleşim çıkaramadı; başka bir model ya da daha net bir görsel dene.');
    return { format, slides: [{ bg: hex(a.background, '#ffffff'), layers }], caption: '', hashtags: [], fonts };
  }

  return {
    async analyze(brandId, { assetId, modelRef = null, name = '' } = {}) {
      const b = brands.get(brandId);
      if (!assetId) throw badRequest('Önce bir referans görsel seç.');
      const f = assets.file(b.id, String(assetId));
      if (!/^image\/(png|jpeg|webp|gif)$/.test(f.mime)) throw badRequest('Bu dosya türü okunamıyor.');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt: analysisPrompt(b), json: true, modelRef, temperature: 0.3, images: [{ mime: f.mime, data: fs.readFileSync(f.path) }] });
      const o = r.output || {};
      const data = toPostData(o, b);
      const analysis = {
        summary: polish(o.summary).slice(0, 400), mood: polish(o.mood).slice(0, 80),
        palette: (Array.isArray(o.palette) ? o.palette : []).map(p => ({ hex: hex(p && p.hex, null), role: polish(p && p.role).slice(0, 20) })).filter(p => p.hex).slice(0, 8),
        fonts: data.fonts, format: data.format, background: data.slides[0].bg,
        tips: (Array.isArray(o.tips) ? o.tips : []).map(t => polish(t).slice(0, 240)).filter(Boolean).slice(0, 4)
      };
      delete data.fonts;
      // Şablon olarak kaydedilir; Post stüdyosunda "Bu şablonla başla" ile düzenlenir
      const tplId = newId();
      const tplName = polish(name).slice(0, 80) || `Referans: ${analysis.mood || 'tasarım'} (${new Date().toLocaleDateString('tr-TR')})`;
      const kind = data.format === '9:16' ? 'story' : 'post';
      db.prepare('INSERT INTO post_templates (id, brand_id, name, kind, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(tplId, b.id, tplName, kind, JSON.stringify(Object.assign({ reference: { assetId: String(assetId), analysis } }, data)), now());
      brands.logActivity(b.id, 'design.analyzed', `Tasarım referansı şablona çevrildi: ${tplName}`);
      return { analysis, template: { id: tplId, name: tplName, kind, kindLabel: POST_KINDS[kind] }, ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) } };
    }
  };
}
