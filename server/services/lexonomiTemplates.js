// Lexonomi örnek afiş serilerinden uyarlanan 12 çok markalı A4 afiş şablonu.
// Her şablon rol işaretlidir: colorRole / bgRole / strokeColorRole / bgColorRole / fontRole hedef markanın kimliğine,
// imageRole (logo / image) markanın dosyalarına, field + role alanları ise yalnızca konu/fikir yazılarak AI metnine dönüşür.

let lxN = 0;
const lid = () => `lx${(lxN++).toString(36)}`;
const T = (role, text, x, y, w, size, color, font, extra = {}) =>
  Object.assign({ id: lid(), type: 'text', role, text, x, y, w, size, color, font, weight: 700, align: 'left' }, extra);
const F = (field, name, text, x, y, w, size, color, font, extra = {}) =>
  T('text', text, x, y, w, size, color, font, Object.assign({ field, name }, extra));
const R = (x, y, w, h, color, extra = {}) =>
  Object.assign({ id: lid(), type: 'shape', shape: 'rect', x, y, w, h, color, radius: 0 }, extra);
const C = (x, y, w, h, color, extra = {}) =>
  Object.assign({ id: lid(), type: 'shape', shape: 'circle', x, y, w, h, color, radius: 0 }, extra);
const V = (svg, x, y, w, h, color, extra = {}) =>
  Object.assign({ id: lid(), type: 'vector', svg, x, y, w, h, color, recolor: true }, extra);
const IMG = (imageRole, x, y, w, h, extra = {}) =>
  Object.assign({ id: lid(), type: 'image', imageRole, x, y, w, h }, extra);

// Minimal çizgisel SVG ikonları (recolor ile marka rengine boyanır)
const IC_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const IC_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/></svg>';
const IC_SCALE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M5 7h14M7 7l-3 7h6zM17 7l-3 7h6zM8 21h8"/></svg>';
const IC_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/></svg>';
const IC_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';
const IC_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.6 0l2.8-2.8a4 4 0 0 0-5.6-5.6L11 7"/><path d="M14 10a4 4 0 0 0-5.6 0L5.6 12.8a4 4 0 0 0 5.6 5.6L13 17"/></svg>';
const IC_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 16h12l-1.5-2.5V10a4.5 4.5 0 1 0-9 0v3.5z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';
const IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>';
const IC_SCALES_BIG = '<svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="60" cy="14" r="6"/><path d="M60 20v100M22 36c20-6 56-6 76 0M24 36l-14 42h28zM96 36l-14 42h28zM28 122h64M38 130h44"/></svg>';

const brandHead = (x = 76, y = 64, darkBg = false) => [
  IMG('logo', x, y, 76, 56, { align: 'left', role: 'logo' }),
  T('text', '{{BRAND}}', x + 90, y + 14, 340, 26, darkBg ? '#ffffff' : '#142d3a', 'Inter', {
    weight: 700, letterSpacing: 5, upper: true, fixed: true, colorRole: darkBg ? null : 'primary'
  })
];

// 1. Lexonomi Nedir 1 — Vurgu Paneli & Görsel
function tokmakPaneli() {
  return {
    id: 'hazir-afis-tokmak',
    name: 'Afiş · Vurgu paneli ve istatistik',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f7f6f2', bgRole: 'bg:0',
        layers: [
          ...brandHead(76, 60, false),
          T('title', 'Markan ile *fark yarat?*', 76, 154, 920, 108, '#142d3a', 'DM Serif Display', {
            weight: 400, highlight: '#2b7a8a', highlightRole: 'secondary:0', fontRole: 'heading', maxH: 250, lineHeight: 1.02
          }),
          T('body', 'Hedef kitlen için geliştirdiğin çözümü sade ve güven veren bir dille anlat. Ana faydayı iki cümlede netleştir.', 76, 430, 500, 28, '#5f6d75', 'Inter', {
            weight: 500, fontRole: 'body', maxH: 220, lineHeight: 1.45
          }),
          R(76, 690, 380, 74, '#142d3a', { radius: 37, colorRole: 'primary' }),
          T('cta', 'Hemen keşfedin →', 76, 710, 380, 26, '#ffffff', 'Inter', { weight: 700, align: 'center', maxH: 40 }),
          R(610, 410, 400, 960, '#142d3a', { radius: 28, colorRole: 'primary' }),
          F('STAT_1', '1. büyük istatistik (kısa, ör. 10M+)', '11M+', 640, 460, 340, 72, '#c4a879', 'DM Serif Display', {
            weight: 400, align: 'right', colorRole: 'secondary:1', fontRole: 'heading', maxH: 90
          }),
          F('STAT_1_LABEL', '1. istatistik açıklaması (kısa)', 'gerçek veri, tek merkezde', 640, 540, 340, 22, '#d5dde0', 'Inter', {
            weight: 400, align: 'right', maxH: 50
          }),
          F('STAT_2', '2. büyük istatistik (kısa, ör. 36)', '36', 640, 620, 340, 72, '#c4a879', 'DM Serif Display', {
            weight: 400, align: 'right', colorRole: 'secondary:1', fontRole: 'heading', maxH: 90
          }),
          F('STAT_2_LABEL', '2. istatistik açıklaması (kısa)', 'kaynak, tek aramada', 640, 700, 340, 22, '#d5dde0', 'Inter', {
            weight: 400, align: 'right', maxH: 50
          }),
          R(54, 930, 956, 456, '#142d3a', { radius: 28, colorRole: 'primary' }),
          IMG('image', 100, 810, 880, 550, { fit: 'cover', radius: 22 }),
          R(340, 1418, 400, 110, '#142d3a', { radius: 32, colorRole: 'primary' }),
          F('FOOTER_NOTE', 'Alt bant kısa adres veya çağrı', 'markan.com', 340, 1458, 400, 28, '#ffffff', 'Inter', {
            weight: 700, align: 'center', maxH: 40
          })
        ]
      }]
    }
  };
}

// 2. Lexonomi Nedir 2 — Modül Listesi & Dalga
function modulListesi() {
  const row = (idx, svg, y) => [
    C(76, y, 64, 64, '#142d3a', { colorRole: 'primary' }),
    V(svg, 92, y + 16, 32, 32, '#ffffff'),
    F(`ITEM_${idx}`, `${idx}. modül/özellik başlığı (2-3 kelime)`, `Özellik ${idx}`, 164, y + 4, 440, 26, '#142d3a', 'Inter', {
      weight: 700, colorRole: 'heading', fontRole: 'heading', maxH: 36
    }),
    F(`ITEM_${idx}_DESC`, `${idx}. modül kısa açıklaması (en fazla 6 kelime)`, 'Kısa ve net özellik açıklaması', 164, y + 36, 440, 20, '#5f6d75', 'Inter', {
      weight: 400, fontRole: 'body', maxH: 36
    }),
    R(76, y + 82, 520, 1, '#dce2e5')
  ];
  return {
    id: 'hazir-afis-modul-listesi',
    name: 'Afiş · Modül listesi ve rozetler',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f7f6f2', bgRole: 'bg:0',
        layers: [
          ...brandHead(76, 60, false),
          T('title', '*MARKA* NEDİR?', 76, 150, 560, 92, '#142d3a', 'Outfit', {
            weight: 800, upper: true, highlight: '#2b7a8a', highlightRole: 'secondary:0', colorRole: 'primary', fontRole: 'heading', maxH: 200, lineHeight: 0.98
          }),
          R(76, 380, 110, 4, '#c4a879', { colorRole: 'secondary:1' }),
          T('body', 'Tüm iş akışını tek merkezde toplayan, hız ve güven sunan akıllı çözüm.', 76, 412, 520, 26, '#5f6d75', 'Inter', {
            weight: 500, fontRole: 'body', maxH: 130, lineHeight: 1.45
          }),
          ...row(1, IC_SEARCH, 580),
          ...row(2, IC_BOOK, 686),
          ...row(3, IC_SCALE, 792),
          ...row(4, IC_DOC, 898),
          R(76, 1020, 510, 92, '#142d3a', { radius: 22, colorRole: 'primary' }),
          T('cta', 'Ücretsiz deneyin', 108, 1050, 360, 28, '#ffffff', 'Inter', { weight: 700, maxH: 40 }),
          C(510, 1038, 56, 56, '#c4a879', { colorRole: 'secondary:1' }),
          T('text', '→', 510, 1046, 56, 32, '#142d3a', 'Inter', { weight: 700, align: 'center', fixed: true }),
          V(IC_SHIELD, 134, 1168, 34, 34, '#2b7a8a', { colorRole: 'secondary:0' }),
          F('BADGE_1', '1. alt güven rozeti (2-3 kelime)', 'Güvenli altyapı', 76, 1212, 150, 20, '#142d3a', 'Inter', { weight: 600, align: 'center', maxH: 52 }),
          V(IC_LINK, 304, 1168, 34, 34, '#2b7a8a', { colorRole: 'secondary:0' }),
          F('BADGE_2', '2. alt güven rozeti (2-3 kelime)', 'Kaynaklı sonuç', 246, 1212, 150, 20, '#142d3a', 'Inter', { weight: 600, align: 'center', maxH: 52 }),
          V(IC_BELL, 474, 1168, 34, 34, '#2b7a8a', { colorRole: 'secondary:0' }),
          F('BADGE_3', '3. alt güven rozeti (2-3 kelime)', 'Anlık bildirim', 416, 1212, 150, 20, '#142d3a', 'Inter', { weight: 600, align: 'center', maxH: 52 }),
          R(76, 1390, 520, 1, '#dce2e5'),
          F('FOOTER_NOTE', 'Alt bilgi (site / iletişim)', 'markan.com', 76, 1425, 520, 24, '#142d3a', 'Inter', { weight: 600, maxH: 40 }),
          R(660, 0, 18, 1528, '#c4a879', { colorRole: 'secondary:1' }),
          IMG('image', 678, 0, 402, 1528, { fit: 'cover' }),
          T('text', '{{BRAND}}', 690, 64, 350, 22, '#ffffff', 'Inter', { weight: 700, align: 'right', letterSpacing: 4, upper: true, fixed: true })
        ]
      }]
    }
  };
}

// 3. Lexonomi Nedir 3 — Dikey Şerit & Sembol
function teraziSerit() {
  return {
    id: 'hazir-afis-terazi',
    name: 'Afiş · Dikey şerit ve sembol',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f2f0ea', bgRole: 'bg:0',
        layers: [
          R(636, 0, 290, 1528, '#142d3a', { colorRole: 'primary' }),
          ...brandHead(76, 68, false),
          T('title', 'Markan\n*nedir?*', 76, 186, 510, 96, '#142d3a', 'Outfit', {
            weight: 800, highlight: '#2b7a8a', highlightRole: 'secondary:0', colorRole: 'primary', fontRole: 'heading', maxH: 220, lineHeight: 1.05
          }),
          F('ITEM_1', '1. vurgulu vaat (en fazla 6 kelime)', 'Tek arama, net sonuç.', 76, 520, 470, 30, '#142d3a', 'Inter', { weight: 700, colorRole: 'heading', maxH: 48 }),
          F('ITEM_2', '2. vurgulu vaat (en fazla 6 kelime)', 'Zaman kazandıran akıllı yapı.', 76, 594, 470, 30, '#142d3a', 'Inter', { weight: 700, colorRole: 'heading', maxH: 48 }),
          F('ITEM_3', '3. vurgulu vaat (en fazla 6 kelime)', 'Her adımda güvenilir destek.', 76, 668, 470, 30, '#142d3a', 'Inter', { weight: 700, colorRole: 'heading', maxH: 48 }),
          V(IC_SCALES_BIG, 520, 460, 480, 560, '#c4a879', { colorRole: 'secondary:1' }),
          R(76, 880, 270, 66, '#f2f0ea', { radius: 14, strokeW: 3, strokeColor: '#142d3a', strokeColorRole: 'primary', bgRole: 'bg:0' }),
          T('cta', 'keşfet  ↗', 76, 898, 270, 26, '#142d3a', 'Inter', { weight: 700, align: 'center', colorRole: 'primary', maxH: 36 }),
          T('body', 'Tüm sektör profesyonelleri için tasarlanan modern ve hızlı iş ortağı.', 76, 1020, 480, 24, '#5f6d75', 'Inter', {
            weight: 500, fontRole: 'body', maxH: 140, lineHeight: 1.5
          }),
          F('AUDIENCE', 'Alt sol kurumsal bilgi', 'Kurumsal çözüm · Her ölçekten ekip için', 76, 1410, 490, 20, '#5f6d75', 'Inter', { weight: 500, maxH: 60 }),
          F('FOOTER_NOTE', 'Alt sağ iletişim', 'info@markan.com', 656, 1410, 250, 22, '#ffffff', 'Inter', { weight: 600, align: 'right', maxH: 50 })
        ]
      }]
    }
  };
}

// 4. Kurumsal 1 — Dizüstü & Koyu Bant
function koyuBant() {
  const feat = (idx, svg, y) => [
    V(svg, 94, y + 6, 30, 30, '#142d3a', { colorRole: 'primary' }),
    F(`ITEM_${idx}`, `${idx}. özellik (2-3 kelime)`, `Modül ${idx}`, 144, y + 6, 320, 26, '#142d3a', 'Inter', { weight: 600, colorRole: 'heading', maxH: 40 })
  ];
  return {
    id: 'hazir-afis-koyu-bant',
    name: 'Afiş · Koyu bant ve özellik listesi',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f7f6f2', bgRole: 'bg:0',
        layers: [
          ...brandHead(76, 64, false),
          R(76, 160, 120, 2, '#c4a879', { colorRole: 'secondary:1' }),
          T('title', 'Çalışma biçiminde *yeni bir yaklaşım.*', 76, 200, 920, 74, '#142d3a', 'Outfit', {
            weight: 700, highlight: '#2b7a8a', highlightRole: 'secondary:0', colorRole: 'primary', fontRole: 'heading', maxH: 190, lineHeight: 1.12
          }),
          T('body', 'Ekibinizle daha hızlı, düzenli ve verimli çalışın.', 76, 405, 620, 28, '#5f6d75', 'Inter', {
            weight: 400, fontRole: 'body', maxH: 90, lineHeight: 1.4
          }),
          C(610, 240, 560, 560, '#142d3a', { colorRole: 'primary' }),
          R(76, 540, 3, 270, '#c4a879', { colorRole: 'secondary:1' }),
          ...feat(1, IC_SEARCH, 544),
          ...feat(2, IC_BOOK, 614),
          ...feat(3, IC_SCALE, 684),
          ...feat(4, IC_DOC, 754),
          IMG('image', 460, 500, 620, 480, { fit: 'cover', radius: 22 }),
          R(0, 1080, 1080, 448, '#142d3a', { colorRole: 'primary' }),
          V(IC_SHIELD, 90, 1170, 38, 38, '#d5dde0'),
          F('BADGE_1', '1. alt bant değeri (3-4 kelime)', 'Güvenli ve gizli işlem', 146, 1168, 220, 22, '#ffffff', 'Inter', { weight: 600, maxH: 70 }),
          V(IC_LINK, 400, 1170, 38, 38, '#d5dde0'),
          F('BADGE_2', '2. alt bant değeri (3-4 kelime)', 'Akıllı otomasyon desteği', 456, 1168, 220, 22, '#ffffff', 'Inter', { weight: 600, maxH: 70 }),
          V(IC_SCALE, 710, 1170, 38, 38, '#d5dde0'),
          F('BADGE_3', '3. alt bant değeri (3-4 kelime)', 'Sektöre özel çözümler', 766, 1168, 220, 22, '#ffffff', 'Inter', { weight: 600, maxH: 70 }),
          R(76, 1340, 340, 74, '#142d3a', { radius: 37, strokeW: 2, strokeColor: '#c4a879', strokeColorRole: 'secondary:1', colorRole: 'primary' }),
          T('cta', 'markan.com  →', 76, 1360, 340, 26, '#ffffff', 'Inter', { weight: 600, align: 'center', maxH: 40 }),
          F('FOOTER_NOTE', 'Sağ alt davet yazısı', 'Daha fazlası için web sitemizi ziyaret edin.', 680, 1350, 320, 22, '#d5dde0', 'Inter', {
            weight: 400, align: 'right', maxH: 60
          })
        ]
      }]
    }
  };
}

// 5. Kurumsal 2 — Önden Ekran & 4 Sütun
function ondenEkran() {
  const col = (idx, svg, x) => [
    V(svg, x, 1020, 44, 44, '#142d3a', { colorRole: 'primary' }),
    F(`ITEM_${idx}`, `${idx}. sütun başlığı (2 kelime)`, `Özellik ${idx}`, x, 1084, 190, 24, '#142d3a', 'Inter', { weight: 700, colorRole: 'heading', maxH: 70 }),
    ...(idx < 4 ? [R(x + 216, 1018, 1, 130, '#cbd5e1')] : [])
  ];
  return {
    id: 'hazir-afis-onden-ekran',
    name: 'Afiş · Önden ekran ve 4 sütun',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#eef4f5', bgRole: 'bg:0',
        layers: [
          ...brandHead(76, 64, false),
          T('title', 'İşinde daha güçlü ve *yeni bir yaklaşım.*', 76, 184, 920, 76, '#142d3a', 'Outfit', {
            weight: 800, highlight: '#2b7a8a', highlightRole: 'secondary:0', colorRole: 'primary', fontRole: 'heading', maxH: 185, lineHeight: 1.08
          }),
          T('body', 'İhtiyacınız olan tüm araçlara tek noktadan erişin.', 76, 390, 740, 28, '#5f6d75', 'Inter', {
            weight: 500, fontRole: 'body', maxH: 80, lineHeight: 1.4
          }),
          R(86, 510, 908, 430, '#142d3a', { radius: 22, colorRole: 'primary', shadow: 24, shadowColor: '#142d3a33' }),
          IMG('image', 102, 526, 876, 398, { fit: 'cover', radius: 14 }),
          ...col(1, IC_SCALE, 90),
          ...col(2, IC_BOOK, 330),
          ...col(3, IC_DOC, 570),
          ...col(4, IC_CHECK, 810),
          R(88, 1236, 4, 72, '#142d3a', { colorRole: 'primary' }),
          F('AUDIENCE', 'Hedef kitle cümlesi', 'Profesyoneller, ekipler ve kurumlar için tek platform.', 114, 1242, 860, 24, '#142d3a', 'Inter', {
            weight: 600, maxH: 70, lineHeight: 1.4
          }),
          F('FOOTER_NOTE', 'Alt bilgi', '↗  markan.com', 88, 1416, 400, 24, '#142d3a', 'Inter', { weight: 600, maxH: 40 }),
          C(820, 1340, 320, 320, '#142d3a', { colorRole: 'primary' })
        ]
      }]
    }
  };
}

// 6. Kurumsal 3 — Uygulama Ekranı Mockup
function uygulamaEkrani() {
  const col = (idx, svg, x) => [
    V(svg, x, 1110, 42, 42, '#142d3a', { colorRole: 'primary' }),
    F(`ITEM_${idx}`, `${idx}. sütun başlığı (2 kelime)`, `Modül ${idx}`, x, 1170, 190, 24, '#142d3a', 'Inter', { weight: 700, colorRole: 'heading', maxH: 64 }),
    ...(idx < 4 ? [R(x + 216, 1106, 1, 120, '#cbd5e1')] : [])
  ];
  return {
    id: 'hazir-afis-uygulama-karti',
    name: 'Afiş · Uygulama kartı ve 4 sütun',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f7f6f2', bgRole: 'bg:0',
        layers: [
          ...brandHead(76, 64, false),
          T('title', 'Tüm kaynaklara *daha güçlü* erişim.', 76, 174, 920, 82, '#142d3a', 'Outfit', {
            weight: 800, highlight: '#2b7a8a', highlightRole: 'secondary:0', colorRole: 'primary', fontRole: 'heading', maxH: 190, lineHeight: 1.08
          }),
          T('body', 'Arama, analiz ve raporlama tek platformda.', 76, 386, 860, 28, '#5f6d75', 'Inter', {
            weight: 500, fontRole: 'body', maxH: 70
          }),
          R(82, 510, 916, 510, '#ffffff', { radius: 22, shadow: 28, shadowColor: '#142d3a22', strokeW: 1, strokeColor: '#e2e8f0' }),
          R(82, 510, 240, 510, '#142d3a', { radius: 22, colorRole: 'primary' }),
          T('text', '{{BRAND}}', 110, 550, 184, 20, '#ffffff', 'Inter', { weight: 700, letterSpacing: 3, upper: true, fixed: true }),
          R(100, 626, 204, 48, '#234252', { radius: 10 }),
          T('text', '●  Genel Bakış', 116, 640, 176, 18, '#ffffff', 'Inter', { weight: 600, fixed: true }),
          T('text', '○  Modüller\n○  Raporlar\n○  Ayarlar', 116, 696, 176, 18, '#9fb3bd', 'Inter', { weight: 500, lineHeight: 2.1, fixed: true }),
          IMG('image', 348, 536, 622, 458, { fit: 'cover', radius: 14 }),
          ...col(1, IC_DOC, 90),
          ...col(2, IC_BOOK, 330),
          ...col(3, IC_SCALE, 570),
          ...col(4, IC_CHECK, 810),
          R(76, 1300, 928, 1, '#cbd5e1'),
          F('AUDIENCE', 'Hedef kitle alt satırı', 'Ekipler · Uzmanlar · Yöneticiler · Kurumlar', 76, 1330, 928, 22, '#5f6d75', 'Inter', { weight: 500, align: 'center', maxH: 48 }),
          F('FOOTER_NOTE', 'Alt adres', 'markan.com', 76, 1424, 400, 24, '#142d3a', 'Inter', { weight: 600, maxH: 40 }),
          C(840, 1340, 320, 320, '#142d3a', { colorRole: 'primary' })
        ]
      }]
    }
  };
}

// 7. Yaratıcı 1 — Önce / Sonra
function onceSonra() {
  return {
    id: 'hazir-afis-once-sonra',
    name: 'Afiş · Önce / Sonra karşılaştırma',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f7f6f2', bgRole: 'bg:0',
        layers: [
          R(0, 0, 540, 1140, '#e3edf0'),
          ...brandHead(76, 60, false),
          T('text', 'ÖNCE', 76, 168, 400, 72, '#142d3a', 'Outfit', { weight: 800, colorRole: 'primary', fontRole: 'heading', fixed: true }),
          F('BEFORE_SUB', 'Önce alt etiketi (2-3 kelime)', 'DAĞINIK SÜREÇ', 76, 250, 400, 22, '#2b7a8a', 'Inter', { weight: 700, letterSpacing: 2, colorRole: 'secondary:0', maxH: 36 }),
          R(76, 326, 220, 120, '#ffffff', { radius: 12, rot: -6, shadow: 14, shadowColor: '#142d3a1a' }),
          F('BEFORE_1', 'Önce 1. sorun kartı (3-4 kelime)', 'Dağınık dosyalar', 92, 368, 190, 20, '#5f6d75', 'Inter', { weight: 600, rot: -6, maxH: 60 }),
          R(290, 360, 210, 110, '#fff3cd', { radius: 12, rot: 4, shadow: 14, shadowColor: '#142d3a1a' }),
          F('BEFORE_2', 'Önce 2. sorun kartı (3-4 kelime)', 'Zaman kaybı', 306, 398, 180, 20, '#664d03', 'Inter', { weight: 600, rot: 4, maxH: 60 }),
          R(120, 494, 260, 110, '#ffffff', { radius: 12, rot: -3, shadow: 14, shadowColor: '#142d3a1a' }),
          F('BEFORE_3', 'Önce 3. sorun kartı (3-4 kelime)', 'Tekrarlayan işler', 138, 534, 224, 20, '#5f6d75', 'Inter', { weight: 600, rot: -3, maxH: 60 }),
          T('text', 'SONRA', 600, 168, 400, 72, '#142d3a', 'Outfit', { weight: 800, colorRole: 'primary', fontRole: 'heading', fixed: true }),
          F('AFTER_SUB', 'Sonra alt etiketi (2-3 kelime)', 'TEK PLATFORM İLE', 600, 250, 400, 22, '#2b7a8a', 'Inter', { weight: 700, letterSpacing: 2, colorRole: 'secondary:0', maxH: 36 }),
          R(600, 326, 404, 150, '#ffffff', { radius: 16, shadow: 20, shadowColor: '#142d3a22' }),
          C(972, 310, 46, 46, '#2b7a8a', { colorRole: 'secondary:0' }),
          V(IC_CHECK, 982, 320, 26, 26, '#ffffff'),
          F('AFTER_1', 'Sonra 1. kazanım (4-6 kelime)', 'İlgili sonuca tek tıkla net erişim', 626, 356, 340, 24, '#142d3a', 'Inter', { weight: 700, maxH: 90 }),
          R(600, 504, 404, 120, '#ffffff', { radius: 16, shadow: 16, shadowColor: '#142d3a1a' }),
          F('AFTER_2', 'Sonra 2. kazanım (4-6 kelime)', 'Düzenli raporlama ve tam kontrol', 626, 536, 340, 22, '#142d3a', 'Inter', { weight: 600, maxH: 70 }),
          R(220, 680, 640, 410, '#142d3a', { radius: 22, colorRole: 'primary', shadow: 24, shadowColor: '#142d3a33' }),
          IMG('image', 236, 696, 608, 378, { fit: 'cover', radius: 14 }),
          R(0, 1140, 1080, 388, '#142d3a', { colorRole: 'primary' }),
          T('title', 'Dağınıklıktan *NET SONUCA.*', 76, 1190, 920, 64, '#ffffff', 'Outfit', {
            weight: 800, highlight: '#c4a879', highlightRole: 'secondary:1', fontRole: 'heading', maxH: 150, lineHeight: 1.05
          }),
          T('body', 'Tüm süreçleriniz tek merkezde, hızlı ve düzenli.', 76, 1346, 620, 24, '#d5dde0', 'Inter', { weight: 400, fontRole: 'body', maxH: 50 }),
          R(730, 1368, 274, 72, '#ffffff', { radius: 36 }),
          T('cta', 'markan.com →', 730, 1390, 274, 24, '#142d3a', 'Inter', { weight: 700, align: 'center', colorRole: 'primary', maxH: 36 })
        ]
      }]
    }
  };
}

// 8. Yaratıcı 2 — Kavisli Fotoğraf & 4 Modül
function kavisliFoto() {
  const mod = (idx, svg, x, y) => [
    C(x + 40, y, 100, 100, '#ffffff'),
    V(svg, x + 68, y + 28, 44, 44, '#2b7a8a', { colorRole: 'secondary:0' }),
    F(`ITEM_${idx}`, `${idx}. modül adı (2 kelime)`, `Modül ${idx}`, x, y + 114, 180, 20, '#ffffff', 'Inter', { weight: 600, align: 'center', maxH: 48 })
  ];
  return {
    id: 'hazir-afis-kavisli',
    name: 'Afiş · Kavisli fotoğraf ve 4 modül',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f7f6f2', bgRole: 'bg:0',
        layers: [
          R(0, 0, 1080, 1120, '#2b7a8a', { colorRole: 'secondary:0' }),
          ...brandHead(76, 60, true),
          R(560, 74, 76, 2, '#c4a879', { colorRole: 'secondary:1' }),
          T('subtitle', 'PROFESYONEL ÇÖZÜM', 654, 62, 350, 22, '#ffffff', 'Inter', { weight: 600, letterSpacing: 2, upper: true, maxH: 36 }),
          T('title', 'Aradığınız çözüm, *ELİNİZDE.*', 260, 160, 740, 72, '#ffffff', 'Outfit', {
            weight: 800, align: 'right', highlight: '#c4a879', highlightRole: 'secondary:1', fontRole: 'heading', maxH: 230, lineHeight: 1.05
          }),
          C(-140, 340, 620, 620, '#ffffff'),
          IMG('image', -120, 360, 580, 580, { circle: true, fit: 'cover' }),
          T('body', 'Sorunlarınızı hızlıca çözün; tüm adımları tek ekrandan güvenle yönetin.', 530, 440, 470, 24, '#e6f1f3', 'Inter', {
            weight: 400, align: 'right', fontRole: 'body', maxH: 130, lineHeight: 1.45
          }),
          ...mod(1, IC_SEARCH, 540, 670),
          ...mod(2, IC_BOOK, 790, 670),
          ...mod(3, IC_SCALE, 540, 880),
          ...mod(4, IC_DOC, 790, 880),
          R(0, 1120, 1080, 240, '#ffffff'),
          F('STAT_1', '1. istatistik', '11M+', 76, 1184, 180, 48, '#142d3a', 'Outfit', { weight: 800, colorRole: 'primary', maxH: 60 }),
          F('STAT_1_LABEL', '1. istatistik etiketi', 'gerçek veri', 76, 1244, 180, 20, '#5f6d75', 'Inter', { weight: 500, maxH: 40 }),
          F('STAT_2', '2. istatistik', '36', 280, 1184, 140, 48, '#142d3a', 'Outfit', { weight: 800, colorRole: 'primary', maxH: 60 }),
          F('STAT_2_LABEL', '2. istatistik etiketi', 'kaynak', 280, 1244, 140, 20, '#5f6d75', 'Inter', { weight: 500, maxH: 40 }),
          F('STAT_3', '3. istatistik', '30 gün', 440, 1184, 220, 48, '#142d3a', 'Outfit', { weight: 800, colorRole: 'primary', maxH: 60 }),
          F('STAT_3_LABEL', '3. istatistik etiketi', 'ücretsiz deneme', 440, 1244, 220, 20, '#5f6d75', 'Inter', { weight: 500, maxH: 40 }),
          R(0, 1360, 1080, 168, '#e3edf0'),
          T('text', '{{BRAND}}', 76, 1428, 300, 24, '#142d3a', 'Inter', { weight: 700, letterSpacing: 4, upper: true, fixed: true, colorRole: 'primary' }),
          R(740, 1408, 264, 68, '#142d3a', { radius: 34, colorRole: 'primary' }),
          T('cta', 'markan.com →', 740, 1428, 264, 24, '#ffffff', 'Inter', { weight: 700, align: 'center', maxH: 36 })
        ]
      }]
    }
  };
}

// 9. Yaratıcı 3 — Gece & Yay Üzerinde Modüller
function yayModuller() {
  const arcItem = (idx, svg, x, y) => [
    F(`ITEM_${idx}`, `${idx}. modül başlığı (2 kelime)`, `MODÜL ${idx}`, x - 200, y + 6, 180, 22, '#ffffff', 'Inter', { weight: 700, align: 'right', upper: true, maxH: 48 }),
    F(`ITEM_${idx}_DESC`, `${idx}. modül kısa açıklaması`, 'Hızlı erişim', x - 200, y + 58, 180, 16, '#9fb3bd', 'Inter', { weight: 400, align: 'right', maxH: 32 }),
    C(x, y, 88, 88, '#ffffff', { shadow: 16, shadowColor: '#00000044' }),
    V(svg, x + 22, y + 22, 44, 44, '#2b7a8a', { colorRole: 'secondary:0' })
  ];
  return {
    id: 'hazir-afis-yay',
    name: 'Afiş · Gece teması ve yay modüller',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#0f242f',
        bgGradient: { type: 'radial', angle: 0, stops: [{ c: '#1b4152', colorRole: 'secondary:0', p: 0 }, { c: '#0d1f29', colorRole: 'primary', p: 100 }] },
        layers: [
          ...brandHead(390, 64, true),
          T('subtitle', 'AKILLI PLATFORMUN', 76, 174, 928, 30, '#e2e8f0', 'Inter', { weight: 500, align: 'center', letterSpacing: 4, upper: true, maxH: 44 }),
          T('title', 'GÜCÜ', 76, 214, 928, 136, '#ffffff', 'Outfit', { weight: 800, align: 'center', upper: true, fontRole: 'heading', maxH: 155, lineHeight: 0.95 }),
          F('SUB_2', 'Alt başlık (2-3 kelime)', 'TEK PLATFORMDA', 76, 376, 928, 28, '#e2e8f0', 'Inter', { weight: 500, align: 'center', letterSpacing: 4, upper: true, maxH: 42 }),
          C(250, 490, 640, 640, '#142d3a', { strokeW: 36, strokeColor: '#c4a879', strokeColorRole: 'secondary:1', colorRole: 'primary' }),
          ...arcItem(1, IC_SEARCH, 260, 500),
          ...arcItem(2, IC_BOOK, 200, 680),
          ...arcItem(3, IC_SCALE, 200, 860),
          ...arcItem(4, IC_DOC, 260, 1040),
          R(516, 516, 434, 690, '#0a141a', { radius: 46, strokeW: 6, strokeColor: '#334e5c' }),
          IMG('image', 534, 534, 398, 654, { fit: 'cover', radius: 34 }),
          F('FOOTER_STATS', 'Alt özet satırı', '11M+ veri  ·  36 kaynak  ·  30 gün ücretsiz deneme', 76, 1300, 928, 22, '#c4a879', 'Inter', { weight: 600, align: 'center', colorRole: 'secondary:1', maxH: 40 }),
          R(380, 1366, 320, 74, '#ffffff', { radius: 37 }),
          T('cta', 'markan.com', 380, 1388, 320, 26, '#142d3a', 'Inter', { weight: 700, align: 'center', colorRole: 'primary', maxH: 36 })
        ]
      }]
    }
  };
}

// 10. Sade 1 — Editoryal
function sadeEditoryal() {
  const col = (idx, svg, x) => [
    V(svg, x, 1010, 34, 34, '#2b7a8a', { colorRole: 'secondary:0' }),
    F(`ITEM_${idx}`, `${idx}. özellik başlığı`, `Özellik ${idx}`, x, 1058, 194, 22, '#142d3a', 'Inter', { weight: 700, colorRole: 'heading', maxH: 36 }),
    F(`ITEM_${idx}_DESC`, `${idx}. özellik 1 cümle`, 'Hızlı ve anlaşılır sonuçlar alın.', x, 1096, 194, 18, '#5f6d75', 'Inter', { weight: 400, maxH: 76, lineHeight: 1.35 }),
    ...(idx < 4 ? [R(x + 216, 1010, 1, 160, '#dce2e5')] : [])
  ];
  const stat = (idx, x) => [
    F(`STAT_${idx}`, `${idx}. istatistik`, idx === 1 ? '11M+' : idx === 2 ? '36' : idx === 3 ? '4' : '30 gün', x, 1270, 200, 52, '#c4a879', 'DM Serif Display', {
      weight: 400, colorRole: 'secondary:1', fontRole: 'heading', maxH: 64
    }),
    F(`STAT_${idx}_LABEL`, `${idx}. istatistik etiketi`, 'temel metrik', x, 1334, 200, 20, '#d5dde0', 'Inter', { weight: 400, maxH: 36 })
  ];
  return {
    id: 'hazir-afis-editoryal',
    name: 'Afiş · Editoryal ve istatistik bandı',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f7f6f2', bgRole: 'bg:0',
        layers: [
          ...brandHead(76, 60, false),
          T('subtitle', 'AKILLI ÇÖZÜM PLATFORMU', 540, 74, 464, 20, '#c4a879', 'Inter', { weight: 700, align: 'right', letterSpacing: 2, upper: true, colorRole: 'secondary:1', maxH: 34 }),
          R(76, 148, 110, 2, '#c4a879', { colorRole: 'secondary:1' }),
          T('title', 'Çalışma sürecinde *yeni bir yaklaşım.*', 76, 184, 920, 86, '#142d3a', 'DM Serif Display', {
            weight: 400, highlight: '#2b7a8a', highlightRole: 'secondary:0', colorRole: 'primary', fontRole: 'heading', maxH: 200, lineHeight: 1.05
          }),
          T('body', 'Sorununuzu yazın; sistem en doğru çözümü saniyeler içinde karşınıza getirsin.', 76, 400, 760, 26, '#5f6d75', 'Inter', {
            weight: 500, fontRole: 'body', maxH: 85, lineHeight: 1.4
          }),
          C(540, 260, 520, 520, '#e3edf0'),
          R(76, 540, 928, 410, '#ffffff', { radius: 22, shadow: 24, shadowColor: '#142d3a1c' }),
          R(76, 540, 230, 410, '#142d3a', { radius: 22, colorRole: 'primary' }),
          T('text', '{{BRAND}}', 100, 580, 180, 18, '#ffffff', 'Inter', { weight: 700, letterSpacing: 3, upper: true, fixed: true }),
          R(94, 650, 194, 44, '#234252', { radius: 8 }),
          T('text', 'Ana Modül\nKaynaklar\nRaporlama\nBelgeler', 112, 660, 160, 18, '#d5dde0', 'Inter', { weight: 500, lineHeight: 2.2, fixed: true }),
          IMG('image', 330, 566, 648, 358, { fit: 'cover', radius: 14 }),
          ...col(1, IC_SEARCH, 82),
          ...col(2, IC_BOOK, 322),
          ...col(3, IC_SCALE, 562),
          ...col(4, IC_DOC, 802),
          R(0, 1230, 1080, 298, '#142d3a', { colorRole: 'primary' }),
          ...stat(1, 76),
          ...stat(2, 290),
          ...stat(3, 470),
          ...stat(4, 690),
          R(76, 1410, 280, 66, '#142d3a', { radius: 33, strokeW: 2, strokeColor: '#c4a879', strokeColorRole: 'secondary:1', colorRole: 'primary' }),
          T('cta', 'markan.com  →', 76, 1428, 280, 24, '#ffffff', 'Inter', { weight: 600, align: 'center', maxH: 36 }),
          F('FOOTER_NOTE', 'Sağ alt not', 'Daha fazlası için web sitemizi ziyaret edin.', 680, 1420, 324, 20, '#d5dde0', 'Inter', { weight: 400, align: 'right', maxH: 52 })
        ]
      }]
    }
  };
}

// 11. Sade 2 — Gece & 2x2 Kartlar
function sadeGece() {
  const card = (idx, svg, x, y) => [
    R(x, y, 448, 148, '#1b3847', { radius: 16, strokeW: 1, strokeColor: '#2d5266' }),
    V(svg, x + 28, y + 32, 32, 32, '#c4a879', { colorRole: 'secondary:1' }),
    F(`ITEM_${idx}`, `${idx}. kart başlığı (2-3 kelime)`, `Modül ${idx}`, x + 78, y + 28, 340, 24, '#ffffff', 'Inter', { weight: 700, maxH: 36 }),
    F(`ITEM_${idx}_DESC`, `${idx}. kart açıklaması (en fazla 8 kelime)`, 'Tek adımda güvenilir ve hızlı sonuç.', x + 78, y + 66, 340, 20, '#b8c9d1', 'Inter', { weight: 400, maxH: 60, lineHeight: 1.35 })
  ];
  return {
    id: 'hazir-afis-gece',
    name: 'Afiş · Gece teması ve 2×2 modül kartı',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#102531',
        bgGradient: { type: 'linear', angle: 135, stops: [{ c: '#142d3a', colorRole: 'primary', p: 0 }, { c: '#0b1a22', p: 100 }] },
        layers: [
          ...brandHead(76, 68, true),
          T('subtitle', 'PROFESYONEL ANALİTİK PLATFORMU', 76, 206, 928, 22, '#c4a879', 'Inter', { weight: 700, letterSpacing: 3, upper: true, colorRole: 'secondary:1', maxH: 36 }),
          T('title', 'Aradığınız çözüm, *gerekçesiyle* elinizde.', 76, 250, 928, 88, '#ffffff', 'DM Serif Display', {
            weight: 400, highlight: '#c4a879', highlightRole: 'secondary:1', fontRole: 'heading', maxH: 210, lineHeight: 1.08
          }),
          T('body', 'Tüm kaynaklar ve araçlar tek aramada. Her sonuç doğrulanmış ve kullanıma hazır.', 76, 480, 820, 26, '#c7d4da', 'Inter', {
            weight: 400, fontRole: 'body', maxH: 100, lineHeight: 1.5
          }),
          R(76, 636, 928, 1, '#264556'),
          F('STAT_1', '1. istatistik', '11M+', 76, 676, 280, 68, '#ffffff', 'DM Serif Display', { weight: 400, fontRole: 'heading', maxH: 84 }),
          F('STAT_1_LABEL', '1. istatistik etiketi', 'gerçek kayıt', 76, 760, 280, 22, '#9fb3bd', 'Inter', { weight: 400, maxH: 52 }),
          R(384, 656, 1, 180, '#264556'),
          F('STAT_2', '2. istatistik', '36', 416, 676, 260, 68, '#ffffff', 'DM Serif Display', { weight: 400, fontRole: 'heading', maxH: 84 }),
          F('STAT_2_LABEL', '2. istatistik etiketi', 'kaynak tek yerde', 416, 760, 260, 22, '#9fb3bd', 'Inter', { weight: 400, maxH: 52 }),
          R(696, 656, 1, 180, '#264556'),
          F('STAT_3', '3. istatistik', '4', 728, 676, 260, 68, '#ffffff', 'DM Serif Display', { weight: 400, fontRole: 'heading', maxH: 84 }),
          F('STAT_3_LABEL', '3. istatistik etiketi', 'ana modül', 728, 760, 260, 22, '#9fb3bd', 'Inter', { weight: 400, maxH: 52 }),
          ...card(1, IC_SEARCH, 76, 890),
          ...card(2, IC_BOOK, 556, 890),
          ...card(3, IC_SCALE, 76, 1064),
          ...card(4, IC_DOC, 556, 1064),
          F('AUDIENCE', 'Hedef kitle satırı', 'Uzmanlar · Ekipler · Kurumlar · Yöneticiler', 76, 1280, 928, 22, '#c4a879', 'Inter', { weight: 600, colorRole: 'secondary:1', maxH: 40 }),
          R(76, 1380, 290, 74, '#102531', { radius: 37, strokeW: 2, strokeColor: '#c4a879', strokeColorRole: 'secondary:1' }),
          T('cta', 'markan.com  →', 76, 1402, 290, 24, '#ffffff', 'Inter', { weight: 600, align: 'center', maxH: 36 }),
          F('FOOTER_NOTE', 'Sağ alt deneme bilgisi', '30 gün ücretsiz deneyin', 680, 1396, 324, 22, '#9fb3bd', 'Inter', { weight: 400, align: 'right', maxH: 50 })
        ]
      }]
    }
  };
}

// 12. Sade 3 — Ürün Vitrini
function sadeUrun() {
  const col = (idx, svg, x) => [
    V(svg, x, 1044, 38, 38, '#2b7a8a', { colorRole: 'secondary:0' }),
    F(`ITEM_${idx}`, `${idx}. özellik (2 kelime)`, `Özellik ${idx}`, x, 1098, 200, 22, '#142d3a', 'Inter', { weight: 700, colorRole: 'heading', maxH: 54 }),
    ...(idx < 4 ? [R(x + 216, 1044, 1, 90, '#dce2e5')] : [])
  ];
  return {
    id: 'hazir-afis-urun',
    name: 'Afiş · Ürün vitrini ve vurgu rozeti',
    kind: 'afis',
    data: {
      format: 'A4',
      slides: [{
        bg: '#f2f5f6', bgRole: 'bg:0',
        layers: [
          ...brandHead(76, 60, false),
          R(640, 68, 364, 46, '#e1ecee', { radius: 23 }),
          T('subtitle', 'GÜVENİLİR ÇÖZÜM', 640, 80, 364, 20, '#2b7a8a', 'Inter', { weight: 700, align: 'center', letterSpacing: 2, upper: true, colorRole: 'secondary:0', maxH: 30 }),
          T('title', 'Kaynaklara *daha güçlü* erişim.', 76, 174, 920, 88, '#142d3a', 'Outfit', {
            weight: 800, highlight: '#2b7a8a', highlightRole: 'secondary:0', colorRole: 'primary', fontRole: 'heading', maxH: 200, lineHeight: 1.05
          }),
          T('body', 'Tüm süreçleriniz ve raporlarınız tek platformda.', 76, 396, 760, 26, '#5f6d75', 'Inter', {
            weight: 500, fontRole: 'body', maxH: 80
          }),
          R(76, 514, 928, 460, '#ffffff', { radius: 24, shadow: 28, shadowColor: '#142d3a1a' }),
          IMG('image', 100, 538, 880, 412, { fit: 'cover', radius: 16 }),
          ...col(1, IC_SEARCH, 82),
          ...col(2, IC_BOOK, 322),
          ...col(3, IC_SCALE, 562),
          ...col(4, IC_DOC, 802),
          R(76, 1236, 560, 1, '#cbd5e1'),
          F('AUDIENCE', 'Hedef kitle özeti', 'Ekipler ve kurumlar için tek çalışma düzeni.', 76, 1266, 560, 22, '#5f6d75', 'Inter', { weight: 500, maxH: 70, lineHeight: 1.45 }),
          T('cta', '↗  markan.com', 76, 1412, 340, 24, '#142d3a', 'Inter', { weight: 700, colorRole: 'primary', maxH: 38 }),
          C(740, 1230, 420, 420, '#2b7a8a', { colorRole: 'secondary:0' }),
          F('STAT_1', 'Köşe rozetindeki büyük sayı', '11M+', 780, 1340, 260, 62, '#ffffff', 'DM Serif Display', { weight: 400, align: 'center', fontRole: 'heading', maxH: 74 }),
          F('STAT_1_LABEL', 'Rozet alt açıklaması', 'gerçek veri', 780, 1414, 260, 22, '#e1ecee', 'Inter', { weight: 500, align: 'center', maxH: 40 })
        ]
      }]
    }
  };
}

export const LEXONOMI_POSTER_TEMPLATES = [
  tokmakPaneli(),
  modulListesi(),
  teraziSerit(),
  koyuBant(),
  ondenEkran(),
  uygulamaEkrani(),
  onceSonra(),
  kavisliFoto(),
  yayModuller(),
  sadeEditoryal(),
  sadeGece(),
  sadeUrun()
];
