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

function analysisPrompt(brand, count = 1) {
  return [
    'TASARIM REFERANSI ANALİZİ',
    count > 1
      ? `Ekte ${count} görsel var: beğenilen sosyal medya tasarımı örnekleri (bazıları aynı carousel'in slaytları olabilir). '${brand.name}' markası için hepsine bakıp EN İYİ, en tutarlı tasarım dilini seç ve sentezle.`
      : `Ekteki görsel bir sosyal medya tasarımı örneği. '${brand.name}' markası için bu tasarımın görsel dilini ve yerleşimini çıkar.`,
    'Bir carousel için 3 slayt yerleşimi üret: "kapak" (büyük vurucu başlık, kısa alt başlık), "icerik" (bütün ara slaytlarda aynen tekrar edecek düzen: slayt numarası, başlık, açıklama) ve "kapanis" (özet ya da harekete çağrı). Üçü aynı zemini, renkleri, fontları ve logo yerini paylaşsın; görsel bir bütün olsun. Görselde yalnızca kapak varsa iç ve kapanış slaytlarını aynı dille sen tasarla.',
    'Maskot/karakter varsa image role "mascot" ver; yanına konuşma balonu (shape role "bubble", beyaz yuvarlak kutu) ve içine text role "speech" koy.',
    'Metin rolleri: title (başlık), body (açıklama), speech (maskot konuşması), num (slayt numarası, ör. "02"), page (ör. "/ 06"), topic (konu etiketi), cta (buton yazısı), text (her slaytta aynı kalan sabit yazı). Başlıkta vurgulanacak kelimeyi *yıldız* içine al ve "highlight" alanına vurgu rengini yaz.',
    'Görseldeki yazıları ve başka markaya ait logo/isimleri KOPYALAMA; metin bloklarına yalnızca rolünü anlatan kısa Türkçe yer tutucu yaz (ör. "Başlık buraya", "Kısa açıklama").',
    'Koordinatlar tasarımın genişliğine/yüksekliğine göre 0 ile 1 arasında oran olsun (x, y sol üst köşe; metinde h, yazının sığması gereken kutu yüksekliği). Yazı boyutu "size" tasarım genişliğinin oranı (ör. 0.08).',
    `Fontları şu listeden en yakın olanlarla eşle: ${FONT_OPTIONS.join(', ')}.`,
    'Her slaytta en fazla 14 blok; arka plandaki büyük renk alanlarını shape, fotoğraf/illüstrasyon/maskot/logo alanlarını image olarak ver.',
    '',
    'Sadece şu JSON biçiminde yanıt ver:',
    JSON.stringify({
      summary: 'Tasarımın 1-2 cümlelik Türkçe özeti', mood: 'Ruh hâli (ör. enerjik, sade, lüks)', format: '4:5',
      palette: [{ hex: '#ff6b35', role: 'vurgu' }], fonts: { heading: 'Poppins', body: 'Inter' },
      slides: [
        { part: 'kapak', background: '#0b1020', blocks: [
          { type: 'image', role: 'logo', x: 0.06, y: 0.05, w: 0.25, h: 0.07 },
          { type: 'text', role: 'title', text: '*Vurgulu* başlık buraya', x: 0.06, y: 0.15, w: 0.88, h: 0.38, size: 0.1, weight: 900, align: 'left', color: '#ffffff', highlight: '#ff6b00' },
          { type: 'text', role: 'body', text: 'Kısa alt başlık', x: 0.06, y: 0.58, w: 0.8, h: 0.08, size: 0.035, weight: 500, align: 'left', color: '#c7cbd6' },
          { type: 'shape', role: 'bubble', shape: 'rect', x: 0.2, y: 0.66, w: 0.38, h: 0.07, color: '#ffffff', radius: 0.03 },
          { type: 'text', role: 'speech', text: 'Kaydırarak incele', x: 0.23, y: 0.68, w: 0.33, h: 0.04, size: 0.03, weight: 800, align: 'left', color: '#0b132b' },
          { type: 'image', role: 'mascot', x: 0.6, y: 0.62, w: 0.4, h: 0.38 }
        ] },
        { part: 'icerik', background: '#0b1020', blocks: [{ type: 'text', role: 'num', text: '02', x: 0.06, y: 0.16, w: 0.08, size: 0.03, weight: 800, color: '#ffffff' }, { type: 'text', role: 'title', text: 'Başlık', x: 0.06, y: 0.25, w: 0.88, h: 0.12, size: 0.055, weight: 800, color: '#ffffff' }] },
        { part: 'kapanis', background: '#0b1020', blocks: [{ type: 'text', role: 'title', text: 'Kapanış başlığı', x: 0.06, y: 0.15, w: 0.88, h: 0.3, size: 0.09, weight: 900, color: '#ffffff' }] }
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
    const mascots = assets.list(b.id, 'mascot');
    const own = { logo: assets.list(b.id, 'logo')[0], mascot: mascots[0], photo: assets.list(b.id, 'brand_image')[0] || assets.list(b.id, 'product')[0] || assets.list(b.id, 'ai_image')[0] };
    const fonts = { heading: font(a.fonts && a.fonts.heading, b.fonts.heading || 'Poppins'), body: font(a.fonts && a.fonts.body, b.fonts.body || 'Inter') };
    let k = 0;
    const id = () => `r${(k++).toString(36)}${newId().slice(0, 5)}`;
    const TEXT_ROLES = ['title', 'body', 'cta', 'label', 'speech', 'num', 'page', 'topic', 'text'];
    const FILL = ['title', 'body', 'cta', 'speech'];
    const slideOf = (blocks, bg, mi) => {
      const layers = [];
      for (const bl of (Array.isArray(blocks) ? blocks : []).slice(0, 14)) {
        const x = Math.round(clamp(bl.x, -0.2, 1, 0) * F.w);
        const y = Math.round(clamp(bl.y, -0.2, 1, 0) * F.h);
        const w = Math.round(clamp(bl.w, 0.02, 1.2, 0.5) * F.w);
        const h = Math.round(clamp(bl.h, 0.02, 1.2, 0.2) * F.h);
        if (bl.type === 'text') {
          const role = TEXT_ROLES.includes(bl.role) ? bl.role : 'text';
          const size = Math.round(clamp(bl.size, 0.015, 0.2, 0.05) * F.w);
          const l = { id: id(), type: 'text', role, text: polish(bl.text).slice(0, 200) || 'Metin', x, y, w: Math.max(80, w), size,
            color: hex(bl.color, '#1b1f3b'), font: ['title', 'cta', 'speech', 'num'].includes(role) ? fonts.heading : fonts.body, weight: [400, 500, 600, 700, 800, 900].includes(Number(bl.weight)) ? Number(bl.weight) : (role === 'title' ? 800 : 500),
            align: ['left', 'center', 'right'].includes(bl.align) ? bl.align : 'left' };
          if (hex(bl.highlight, null)) l.highlight = hex(bl.highlight, null);
          // Doldurulacak kutular: uzun metin kutu yüksekliğine sığdırılır
          if (FILL.includes(role)) l.maxH = Math.max(Math.round(size * 1.3), bl.h != null ? h : Math.round(size * 2.4));
          layers.push(l);
        } else if (bl.type === 'shape') {
          const l = { id: id(), type: 'shape', shape: bl.shape === 'circle' ? 'circle' : 'rect', x, y, w, h, color: hex(bl.color, '#e5e7eb'), radius: Math.round(clamp(bl.radius, 0, 0.5, 0) * F.w) };
          if (bl.role === 'bubble') l.role = 'bubble';
          layers.push(l);
        } else if (bl.type === 'image') {
          const role = ['logo', 'mascot'].includes(bl.role) ? bl.role : 'photo';
          // Her slaytta farklı maskot pozu (varsa); post üretilirken yine konuya göre seçilir
          const asset = role === 'mascot' && mascots.length ? mascots[mi % mascots.length] : own[role];
          if (asset) layers.push(Object.assign({ id: id(), type: 'image', src: asset.url, assetId: asset.id, x, y, w, h }, role !== 'photo' ? { role } : {}));
          else {
            // Markada uygun görsel yok: alan açıkça "görsel alanı" olarak işaretlenir (sahte görsel konmaz)
            layers.push({ id: id(), type: 'shape', shape: 'rect', x, y, w, h, color: '#e5e7eb', radius: 16 });
            layers.push({ id: id(), type: 'text', role: 'label', text: role === 'logo' ? 'Logo alanı' : role === 'mascot' ? 'Maskot alanı' : 'Görsel alanı', x, y: y + Math.round(h / 2) - 20, w, size: 32, color: '#6b7280', font: fonts.body, weight: 600, align: 'center' });
          }
        }
      }
      return { bg: hex(bg, '#ffffff'), layers };
    };
    // Yeni biçim: kapak / içerik / kapanış; eski biçim (tek blok listesi) de okunur
    const order = { kapak: 0, icerik: 1, kapanis: 2 };
    const raw = Array.isArray(a.slides) && a.slides.length
      ? a.slides.slice(0, 3).sort((x, y) => (order[x && x.part] ?? 9) - (order[y && y.part] ?? 9))
      : [{ background: a.background, blocks: a.blocks }];
    const slides = raw.map((sl, i) => slideOf(sl && sl.blocks, (sl && sl.background) || a.background, i)).filter(sl => sl.layers.length);
    if (!slides.length) throw badRequest('Model yerleşim çıkaramadı; başka bir model ya da daha net bir görsel dene.');
    return { format, slides, caption: '', hashtags: [], fonts };
  }

  return {
    async analyze(brandId, { assetId, assetIds, modelRef = null, name = '' } = {}) {
      const b = brands.get(brandId);
      // Toplu referans: en fazla 6 görsel birlikte incelenir, en iyi tasarım dili seçilir
      const ids = [...new Set((Array.isArray(assetIds) && assetIds.length ? assetIds : [assetId]).filter(Boolean).map(String))].slice(0, 6);
      if (!ids.length) throw badRequest('Önce bir referans görsel seç.');
      const images = ids.map(x => {
        const f = assets.visionFile(b.id, x);
        if (!/^image\/(png|jpeg|webp|gif)$/.test(f.mime)) throw badRequest('Bu dosya türü okunamıyor.');
        return { mime: f.mime, data: fs.readFileSync(f.path) };
      });
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt: analysisPrompt(b, images.length), json: true, modelRef, temperature: 0.3, images });
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
      // 11.10: ad verilmezse sıradaki "Şablon N"
      const tplName = polish(name).slice(0, 80) || `Şablon ${db.prepare('SELECT COUNT(*) AS n FROM post_templates WHERE brand_id = ?').get(b.id).n + 1}`;
      // Kapak + içerik + kapanış → carousel şablonu (ara slayt istenen sayıda tekrar eder)
      const kind = data.slides.length > 1 ? 'carousel' : data.format === '9:16' ? 'story' : 'post';
      db.prepare('INSERT INTO post_templates (id, brand_id, name, kind, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(tplId, b.id, tplName, kind, JSON.stringify(Object.assign({ reference: { assetId: ids[0], assetIds: ids, analysis } }, data)), now());
      brands.logActivity(b.id, 'design.analyzed', `Tasarım referansı şablona çevrildi: ${tplName}`);
      return { analysis, template: { id: tplId, name: tplName, kind, kindLabel: POST_KINDS[kind], slides: data.slides.length }, ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) } };
    }
  };
}
