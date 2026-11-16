// Uygulamayla gelen hazır post tasarımları: her markaya açık, ortak şablon kütüphanesinde görünür.
// Biçim ortak şablonlarla aynı (rol işaretli): colorRole/fontRole markanın kimliğine çevrilir, imageRole logo/maskot
// markanın dosyasıyla dolar. Her tasarım kapak + içerik + kapanış slaytlıdır; yazı kutuları şablon rolüyle işaretli
// (başlık, açıklama, slayt no, maskot konuşması) olduğu için "Tasarım" seçilerek post üretilince yalnızca metin değişir.
let n = 0;
const id = () => `b${(n++).toString(36)}`;
const T = (role, text, x, y, w, size, color, font, extra = {}) => Object.assign({ id: id(), type: 'text', role, text, x, y, w, size, color, font, weight: 700, align: 'left' }, extra);
const R = (x, y, w, h, color, extra = {}) => Object.assign({ id: id(), type: 'shape', shape: 'rect', x, y, w, h, color, radius: 0 }, extra);
const IMG = (imageRole, x, y, w, h, extra = {}) => Object.assign({ id: id(), type: 'image', imageRole, x, y, w, h }, extra);

// Koyu kart: kapakta büyük vurgulu başlık, içerikte numara rozeti, maskot + konuşma balonu (marka renkleriyle)
function darkCard() {
  const bg = '#0b1020';
  const head = (extra = {}) => [IMG('logo', 72, 56, 300, 100, { align: 'left', role: 'logo' })];
  const bubble = (y, text) => [R(150, y, 420, 104, '#ffffff', { radius: 40, role: 'bubble' }), T('speech', text, 186, y + 30, 360, 34, '#0b132b', 'Poppins', { weight: 800, fontRole: 'heading', maxH: 50 })];
  return {
    id: 'hazir-koyu-kart', name: 'Koyu kart · maskotlu carousel', kind: 'carousel', data: { format: '4:5', slides: [
      { bg, bgRole: null, layers: [...head(), T('title', 'BAŞLIK BURAYA *VURGULU* KELİMEYLE', 72, 230, 936, 104, '#ffffff', 'Poppins', { weight: 900, highlight: '#ff6b00', highlightRole: 'primary', fontRole: 'heading', upper: true, maxH: 520, lineHeight: 1.05 }),
        T('body', 'Kısa alt başlık: neden kaydırmalı?', 72, 790, 820, 40, '#c7cbd6', 'Inter', { weight: 500, fontRole: 'body', maxH: 110 }), ...bubble(930, 'Kaydırarak incele 👀'), IMG('mascot', 610, 880, 450, 470, { role: 'mascot' })] },
      { bg, layers: [...head(), T('topic', 'Konu', 620, 74, 388, 28, '#8b93a7', 'Inter', { weight: 600, align: 'right', fontRole: 'body' }),
        R(72, 230, 230, 76, '#1c2337', { radius: 38 }), R(80, 238, 92, 60, '#ff6b00', { radius: 30, colorRole: 'primary' }), T('num', '02', 80, 249, 92, 34, '#ffffff', 'Poppins', { weight: 800, align: 'center' }), T('page', '/ 06', 186, 249, 100, 34, '#8b93a7', 'Inter', { weight: 700 }),
        T('title', 'Ara slayt başlığı', 72, 360, 936, 70, '#ffffff', 'Poppins', { weight: 900, fontRole: 'heading', maxH: 180 }),
        T('body', 'Bir iki cümlelik açıklama. Tek fikir, kısa ve net.', 72, 560, 900, 42, '#c7cbd6', 'Inter', { weight: 500, fontRole: 'body', maxH: 300, lineHeight: 1.35 }), ...bubble(940, 'Tam da bu!'), IMG('mascot', 640, 900, 420, 450, { role: 'mascot' })] },
      { bg, layers: [...head(), T('title', 'KAPANIŞ *MESAJI*', 72, 260, 936, 100, '#ffffff', 'Poppins', { weight: 900, highlight: '#ff6b00', highlightRole: 'primary', fontRole: 'heading', upper: true, maxH: 340, lineHeight: 1.05 }),
        T('body', 'Görüşlerini yorumlarda paylaş.', 72, 640, 860, 42, '#c7cbd6', 'Inter', { weight: 500, fontRole: 'body', maxH: 120 }), ...bubble(940, 'Kaydet, lazım olur! 🚀'), IMG('mascot', 620, 880, 450, 470, { role: 'mascot' })] }
    ] }
  };
}

// Pastel vurgu: pembe-lila, büyük başlık, script vurgu, yıldız süsleri
function pastel() {
  const bg = '#fbe4ee';
  const star = (x, y, s) => T('text', '✦', x, y, s, s, '#ec4899', 'Inter', { weight: 400 });
  return {
    id: 'hazir-pastel', name: 'Pastel vurgu · script başlık', kind: 'carousel', data: { format: '4:5', slides: [
      { bg, layers: [star(90, 120, 90), star(900, 260, 70), star(160, 1080, 60), T('title', 'Nasıl *kolayca*', 90, 380, 900, 120, '#3b2a3b', 'Poppins', { weight: 800, highlight: '#ec4899', align: 'center', maxH: 300, lineHeight: 1.05 }),
        T('body', 'yapılır?', 90, 700, 900, 110, '#c084fc', 'Pacifico', { weight: 400, align: 'center', maxH: 160 }), IMG('mascot', 380, 900, 320, 360, { role: 'mascot' })] },
      { bg: '#fff1e6', layers: [R(90, 110, 160, 64, '#f9c6d9', { radius: 32 }), T('num', '02', 90, 124, 160, 36, '#3b2a3b', 'Poppins', { weight: 800, align: 'center' }),
        T('title', 'Adım başlığı', 90, 260, 900, 80, '#3b2a3b', 'Poppins', { weight: 800, maxH: 200 }), T('body', 'Kısa ve samimi açıklama. Sohbet eder gibi yaz.', 90, 520, 880, 44, '#5b4a5b', 'Inter', { weight: 500, maxH: 380, lineHeight: 1.4 }), star(900, 1150, 80)] },
      { bg, layers: [T('title', 'Kaydet, *sonra dene*', 90, 420, 900, 110, '#3b2a3b', 'Poppins', { weight: 800, highlight: '#ec4899', align: 'center', maxH: 330 }),
        T('body', 'Daha fazlası için takip et ✦', 90, 860, 900, 44, '#c084fc', 'Poppins', { weight: 700, align: 'center', maxH: 100 }), star(120, 160, 70), star(880, 1100, 70)] }
    ] }
  };
}

// Yapışkan not: krem zemin, sarı not kartı, el yazısı başlık
function stickyNote() {
  const bg = '#e9dfd3';
  const note = (y, h) => [R(118, y + 14, 844, h, '#cbbba6', { radius: 10, opacity: 60 }), R(110, y, 844, h, '#fff3a3', { radius: 10, shadow: 18, shadowColor: '#00000033' })];
  return {
    id: 'hazir-yapiskan-not', name: 'Yapışkan not · el yazısı', kind: 'carousel', data: { format: '4:5', slides: [
      { bg, layers: [...note(300, 520), T('title', 'hello, bugün *şunu* öğren', 170, 380, 724, 110, '#2b2118', 'Caveat', { weight: 700, highlight: '#e11d48', maxH: 340, lineHeight: 1 }), T('body', 'kaydırarak oku →', 170, 740, 724, 44, '#5b4636', 'Caveat', { weight: 600, maxH: 60 }), IMG('logo', 760, 1180, 260, 100, { role: 'logo' })] },
      { bg, layers: [...note(160, 1000), T('num', '02', 170, 210, 200, 60, '#e11d48', 'Caveat', { weight: 700 }), T('title', 'not başlığı', 170, 300, 724, 90, '#2b2118', 'Caveat', { weight: 700, maxH: 200 }),
        T('body', 'Not defterine yazar gibi kısa, samimi bir açıklama.', 170, 520, 724, 48, '#3d2f24', 'Caveat', { weight: 600, maxH: 560, lineHeight: 1.25 })] },
      { bg, layers: [...note(380, 440), T('title', 'kaydet, *unutma!*', 170, 450, 724, 110, '#2b2118', 'Caveat', { weight: 700, highlight: '#e11d48', maxH: 240 }), T('body', 'takip et, yarın yeni not', 170, 700, 724, 44, '#5b4636', 'Caveat', { weight: 600, maxH: 80 })] }
    ] }
  };
}

// Kareli defter: kareli zemin, kalın yuvarlak başlık krem dış çizgili, pembe script alt satır
function gridPaper() {
  const bg = '#f7f8fb';
  const lines = [];
  for (let x = 120; x < 1080; x += 120) lines.push(R(x, 0, 2, 1350, '#c9d3e6'));
  for (let y = 120; y < 1350; y += 120) lines.push(R(0, y, 1080, 2, '#c9d3e6'));
  return {
    id: 'hazir-kareli-defter', name: 'Kareli defter · çıkartma başlık', kind: 'carousel', data: { format: '4:5', slides: [
      { bg, layers: [...lines, R(370, 120, 340, 70, '#f9c6d9', { radius: 35 }), T('text', 'Konu etiketi', 370, 138, 340, 32, '#3d2b25', 'Poppins', { weight: 700, align: 'center', role: 'topic' }),
        T('title', 'Büyük başlık', 60, 380, 960, 130, '#3d2b25', 'Fredoka', { weight: 700, align: 'center', strokeW: 10, strokeColor: '#fff3b8', maxH: 330, lineHeight: 1.05 }),
        T('body', 'kısa vurgu', 60, 730, 960, 90, '#ec4899', 'Pacifico', { weight: 400, align: 'center', maxH: 120 }), IMG('mascot', 380, 920, 320, 380, { role: 'mascot' })] },
      { bg, layers: [...lines.slice(0, 10), T('num', '02', 80, 100, 160, 80, '#ec4899', 'Fredoka', { weight: 700, strokeW: 6, strokeColor: '#fff3b8' }), T('title', 'Ara başlık', 80, 240, 920, 84, '#3d2b25', 'Fredoka', { weight: 700, strokeW: 8, strokeColor: '#fff3b8', maxH: 200 }),
        T('body', 'Açıklama metni; maddeler ya da kısa paragraf.', 80, 470, 900, 44, '#3d2b25', 'Inter', { weight: 600, maxH: 520, lineHeight: 1.4, bgColor: '#ffffff', bgPad: 24, bgRadius: 18 })] },
      { bg, layers: [...lines, T('title', 'Kaydet!', 60, 470, 960, 150, '#3d2b25', 'Fredoka', { weight: 700, align: 'center', strokeW: 12, strokeColor: '#fff3b8', maxH: 200 }), T('body', 've arkadaşına gönder', 60, 700, 960, 80, '#ec4899', 'Pacifico', { weight: 400, align: 'center', maxH: 110 })] }
    ] }
  };
}

// Zarif serif: adaçayı yeşili, dekoratif serif + geniş harfli ince alt satır
function elegant() {
  const bg = '#6d8a86';
  return {
    id: 'hazir-zarif-serif', name: 'Zarif serif · dergi kapağı', kind: 'carousel', data: { format: '4:5', slides: [
      { bg, layers: [T('title', 'Başlık', 60, 470, 960, 170, '#fff1e6', 'DM Serif Display', { weight: 400, align: 'center', maxH: 360, lineHeight: 1 }),
        T('body', 'ALT BAŞLIK', 60, 860, 960, 40, '#fff1e6', 'Montserrat', { weight: 400, align: 'center', letterSpacing: 10, upper: true, maxH: 60 }), IMG('logo', 390, 1180, 300, 90, { role: 'logo' })] },
      { bg: '#f3ece4', layers: [T('num', '02', 80, 110, 200, 44, '#6d8a86', 'Montserrat', { weight: 400, letterSpacing: 8 }), T('title', 'Bölüm başlığı', 80, 220, 920, 96, '#2f3e3c', 'DM Serif Display', { weight: 400, maxH: 240 }),
        R(80, 480, 120, 3, '#6d8a86'), T('body', 'Sakin, zarif ve kısa bir açıklama. İki üç cümle yeter.', 80, 540, 880, 42, '#2f3e3c', 'Montserrat', { weight: 400, maxH: 520, lineHeight: 1.5 })] },
      { bg, layers: [T('title', 'Teşekkürler', 60, 520, 960, 140, '#fff1e6', 'DM Serif Display', { weight: 400, align: 'center', maxH: 300 }), T('body', 'KAYDET · PAYLAŞ', 60, 820, 960, 36, '#fff1e6', 'Montserrat', { weight: 400, align: 'center', letterSpacing: 10, maxH: 60 })] }
    ] }
  };
}

// Kalın + el yazısı: gül kurusu zemin, krem kalın kelime, bordo script, hap etiket
function fontCombo() {
  const bg = '#d8a3b8';
  return {
    id: 'hazir-kalin-el-yazisi', name: 'Kalın + el yazısı · hap etiket', kind: 'carousel', data: { format: '4:5', slides: [
      { bg, layers: [T('title', 'BAŞLIK', 60, 380, 960, 230, '#fff1e6', 'Anton', { weight: 400, align: 'center', maxH: 330, lineHeight: 0.95, upper: true }),
        T('body', 'el yazısı', 60, 640, 960, 130, '#9b1c31', 'Dancing Script', { weight: 700, align: 'center', maxH: 170 }),
        R(300, 880, 480, 76, '#9b1c31', { radius: 38 }), T('topic', 'KISA AÇIKLAMA', 300, 902, 480, 30, '#fff1e6', 'Montserrat', { weight: 700, align: 'center', letterSpacing: 3 })] },
      { bg: '#fff1e6', layers: [T('num', '02', 80, 100, 200, 90, '#d8a3b8', 'Anton', { weight: 400 }), T('title', 'Ara başlık', 80, 240, 920, 90, '#9b1c31', 'Dancing Script', { weight: 700, maxH: 200 }),
        T('body', 'Açıklama metni burada. Kısa ve okunur.', 80, 470, 900, 44, '#4a1520', 'Montserrat', { weight: 500, maxH: 560, lineHeight: 1.45 })] },
      { bg, layers: [T('title', 'KAYDET', 60, 450, 960, 220, '#fff1e6', 'Anton', { weight: 400, align: 'center', maxH: 260 }), T('body', 've paylaş', 60, 700, 960, 120, '#9b1c31', 'Dancing Script', { weight: 700, align: 'center', maxH: 150 })] }
    ] }
  };
}

// Kutu vurgu: açık zemin, siyah kutularda beyaz büyük harf (haber/bilgi)
function boxNews() {
  const bg = '#f4f1ea';
  return {
    id: 'hazir-kutu-vurgu', name: 'Kutu vurgu · bilgi kartı', kind: 'carousel', data: { format: '4:5', slides: [
      { bg, layers: [IMG('logo', 72, 60, 280, 90, { role: 'logo' }), T('title', 'BİLMEN GEREKEN 5 ŞEY', 90, 400, 900, 96, '#ffffff', 'Archivo Black', { weight: 400, upper: true, bgColor: '#111111', bgPad: 26, bgRadius: 8, maxH: 330, lineHeight: 1.15 }),
        T('body', 'Kısa açıklama satırı', 90, 860, 860, 42, '#111111', 'Inter', { weight: 600, maxH: 110 }), IMG('mascot', 680, 940, 380, 400, { role: 'mascot' })] },
      { bg, layers: [R(72, 110, 110, 110, '#facc15', { radius: 55, colorRole: 'primary' }), T('num', '02', 72, 140, 110, 48, '#111111', 'Archivo Black', { weight: 400, align: 'center' }),
        T('title', 'MADDE BAŞLIĞI', 72, 290, 936, 64, '#ffffff', 'Archivo Black', { weight: 400, upper: true, bgColor: '#111111', bgPad: 18, bgRadius: 6, maxH: 170 }),
        T('body', 'Net, bilgi veren bir iki cümle.', 72, 520, 900, 44, '#111111', 'Inter', { weight: 500, maxH: 520, lineHeight: 1.4 })] },
      { bg, layers: [T('title', 'KAYDET VE PAYLAŞ', 90, 480, 900, 96, '#ffffff', 'Archivo Black', { weight: 400, upper: true, align: 'center', bgColor: '#111111', bgPad: 26, bgRadius: 8, maxH: 240 }), T('body', 'Daha fazlası için takip et', 90, 760, 900, 40, '#111111', 'Inter', { weight: 600, align: 'center', maxH: 80 })] }
    ] }
  };
}

export const BUILTIN_TEMPLATES = [darkCard(), pastel(), stickyNote(), gridPaper(), elegant(), fontCombo(), boxNews()];
export const isBuiltin = tid => String(tid || '').startsWith('hazir-');
