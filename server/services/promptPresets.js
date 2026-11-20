// Prompt seçenek kütüphanesi: mecra, başlık stili, altyazı stili, renk paleti, ton ve diğer seçimler.
// Seçimlerden kural şablonu kurulur (composeRule): sabit bölümler hazır yazılır (yapay zekâ her seferinde yazmak
// zorunda kalmaz, üretim hızlanır), yalnızca içeriğe özel yerler [köşeli alan] olarak bırakılır.
// Hazır stiller bütün markalarda geçerlidir; kullanıcı kendi stillerini ekleyebilir (prompt_presets, markadan bağımsız).
import { newId, now, text, badRequest, notFound, oneOf, parseJson, HEX } from '../lib/http.js';

// Mecra: oran, süre sınırı ve o mecraya özel notlar
export const PLATFORMS = {
  reels: { label: 'Instagram Reels', aspect: '9:16', video: true, min: 5, max: 90, def: 15, note: 'Dikey video. Üst %14 ve alt %20 alan arayüzle kapanır; yazı ve önemli aksiyon bu alanlara konmaz. İlk 1-2 saniye kaydırmayı durduracak kadar güçlü olmalı.' },
  tiktok: { label: 'TikTok', aspect: '9:16', video: true, min: 5, max: 180, def: 20, note: 'Dikey video. Sağ kenar ve alt %25 arayüzle kapanır; yazı orta-üst bölgede durur. Hızlı kurgu, ilk saniyede hook.' },
  shorts: { label: 'YouTube Shorts', aspect: '9:16', video: true, min: 5, max: 60, def: 30, note: 'Dikey video. Alt %20 arayüzle kapanır. Döngüye uygun bitiş (son kare ilk kareye bağlanabilir).' },
  youtube: { label: 'YouTube video', aspect: '16:9', video: true, min: 15, max: 900, def: 60, note: 'Yatay video. Başlık ve önemli öğeler ortada; ilk 5 saniyede videonun vaadi söylenir.' },
  story: { label: 'Instagram Story', aspect: '9:16', video: true, min: 3, max: 60, def: 15, note: 'Dikey, tek ekranlık kısa anlatım. Üst %14 ve alt %18 boş kalır; etkileşim (anket/soru) alanına yer bırakılır.' },
  post: { label: 'Instagram post (görsel)', aspect: '4:5', video: false, note: 'Dikey 4:5 tek görsel. Akışta küçük görüneceği için ana öğe ve başlık iri ve okunur olmalı.' },
  carousel: { label: 'Instagram carousel', aspect: '4:5', video: false, slides: true, note: 'Dikey 4:5 kaydırmalı slaytlar: kapak merak uyandırır, ara slaytlar tek fikir anlatır, son slayt kaydetme/paylaşma çağrısı yapar.' },
  linkedin: { label: 'LinkedIn', aspect: '1:1', video: false, note: 'Kare görsel ya da belge (PDF) carousel. Profesyonel, sade ve bilgi odaklı.' },
  pinterest: { label: 'Pinterest', aspect: '2:3', video: false, note: 'Dikey 2:3 pin. Başlık üstte büyük, sakin ve estetik görsel dil.' }
};

// Başlık stilleri (önizleme: tasarım kartında aynen görünür; text: şablona giren tarif)
export const TITLE_STYLES = [
  { id: 'karisik-vurgu', name: 'Karışık tipografi + script vurgu', sample: ['Nasıl', '*gerçekçi*', 'doku'], preview: { bg: '#3a2a22', fonts: ['Poppins', 'Pacifico'], color: '#ffffff', accent: '#ec4899', weight: 800 },
    text: 'Başlık iki yazı karakteriyle yazılır: ana kelimeler kalın, modern, geometrik sans-serif ve beyaz; tek anahtar kelime iri, kalın, pembe renkte, altındaki kelime ise beyaz, el yazısı (script) ve hafif eğik. Kelimeler ortalanmış, birbirine sıkı yerleşir; harflerde ince yumuşak gölge vardır. Etrafa küçük pembe yıldız süsleri serpiştirilebilir.' },
  { id: 'yapiskan-not', name: 'Yapışkan not etiketi', sample: ['hello', 'my name is'], preview: { bg: '#d9c9b8', fonts: ['Caveat', 'Poppins'], color: '#2b2118', accent: '#fff3a3', weight: 700, box: true },
    text: 'Başlık açık sarı yapışkan not (post-it) ya da kâğıt etiket üzerinde yazılıdır; etiket hafif eğik, köşesinde yumuşak gölge. Yazı koyu kahverengi/siyah, el yazısına yakın kalın font. Etiket karakterin yanında, yüzü kapatmayacak şekilde durur.' },
  { id: 'kalin-cerceve', name: 'Kalın yazı + krem dış çizgi', sample: ['Combos', '*tipográficos*'], preview: { bg: '#eef2f7', fonts: ['Fredoka', 'Pacifico'], color: '#3d2b25', accent: '#f472b6', stroke: '#fff3b8', weight: 700 },
    text: 'Çok kalın, yuvarlak hatlı sans-serif başlık; koyu kahverengi harfler, etrafında kalın krem/açık sarı dış çizgi (çıkartma etkisi). Alt satırdaki kısa kelime pembe, kalın script. Zemin kareli defter kâğıdı dokusu; çevrede küçük yıldız ve parıltı süsleri.' },
  { id: 'zarif-serif', name: 'Zarif serif + ince geniş harf', sample: ['Giaza', 'MONTSERRAT'], preview: { bg: '#6d8a86', fonts: ['DM Serif Display', 'Montserrat'], color: '#fff1e6', accent: '#fff1e6', weight: 400, spaced: true },
    text: 'Büyük, yüksek kontrastlı, zarif dekoratif serif başlık (moda dergisi kapağı gibi); altında geniş harf aralıklı, ince, büyük harf sans-serif alt satır. Renk krem/kırık beyaz, ortalanmış, sade ve lüks bir hava.' },
  { id: 'kalin-el-yazisi', name: 'Kalın + el yazısı + hap etiket', sample: ['Font', '*Combos*'], preview: { bg: '#d8a3b8', fonts: ['Anton', 'Dancing Script'], color: '#fff1e6', accent: '#9b1c31', weight: 400, pill: true },
    text: 'Üstte krem renkte çok kalın, sıkışık, yoğun sans-serif kelime; hemen altında koyu kırmızı (bordo), akıcı el yazısı ikinci kelime üst kelimeye hafif biniyor. En altta bordo hap (yuvarlak köşeli) etiket içinde küçük, büyük harfli krem açıklama.' },
  { id: 'pastel-iri', name: 'Pastel iri başlık (fotoğraf üstü)', sample: ['day', 'in my', 'life'], preview: { bg: '#4b4b52', fonts: ['Poppins'], color: '#f5c2e7', accent: '#f5c2e7', weight: 600 },
    text: 'Fotoğrafın/videonun üzerinde büyük, orta kalınlıkta, pastel pembe/lila sans-serif başlık; kelimeler satır satır, sola yaslı ya da karakterin çevresine dağıtılmış. Okunabilirlik için çok hafif gölge. Estetik, yaşam tarzı içerik havası.' },
  { id: 'kutu-vurgu', name: 'Siyah kutuda beyaz yazı', sample: ['3 HATA'], preview: { bg: '#f4f1ea', fonts: ['Archivo Black'], color: '#ffffff', accent: '#111111', weight: 400, box: true },
    text: 'Başlık siyah (ya da koyu) dikdörtgen kutu içinde beyaz, kalın, büyük harfli sans-serif; kutu yazıya sıkı oturur, satır satır ayrı kutular olabilir. Haber/bilgi içeriği hissi.' },
  { id: 'neon-kalin', name: 'Kalın beyaz + renkli gölge', sample: ['BUNU', '*BİLİYOR*', 'MUSUN?'], preview: { bg: '#0b1020', fonts: ['Poppins'], color: '#ffffff', accent: '#ff6b00', weight: 900 },
    text: 'Çok kalın, büyük harfli beyaz sans-serif başlık; anahtar kelime marka vurgu renginde. Harflerin arkasında belirgin renkli gölge/ışıma. Koyu zemin üzerinde yüksek kontrast, enerjik.' },
  { id: 'minimal', name: 'Minimal beyaz', sample: ['sabah rutinim'], preview: { bg: '#8a7f73', fonts: ['Inter'], color: '#ffffff', accent: '#ffffff', weight: 500 },
    text: 'Küçük-orta boyda, ince/orta kalınlıkta beyaz sans-serif, küçük harf; sade, tek satır, üst ortada. Görselin önüne geçmez.' }
];

export const SUBTITLE_STYLES = [
  { id: 'yok', name: 'Altyazı yok', sample: '', preview: null, text: 'Kesinlikle altyazı oluşturulmayacak. Konuşulan metin ekranda gösterilmeyecek; otomatik yazı, rastgele harf ya da açıklama kutusu olmayacak.' },
  { id: 'klasik', name: 'Klasik (beyaz + siyah kenar)', sample: 'bunu bilmiyordum', preview: { color: '#ffffff', stroke: '#000000', font: 'Poppins', weight: 800 },
    text: 'Altyazı alt-ortada, güvenli alanın içinde; beyaz, kalın sans-serif, siyah belirgin dış kenarlı, en fazla 2 satır. Konuşmayla birebir senkron; metin aynen yazılır.' },
  { id: 'kelime-vurgu', name: 'Kelime kelime vurgulu', sample: 'şimdi *izle*', preview: { color: '#ffffff', accent: '#facc15', font: 'Poppins', weight: 900, upper: true },
    text: 'Altyazı ekranın orta-alt kısmında, kelime kelime belirir (2-3 kelimelik gruplar); o an söylenen kelime [vurgu rengi] renkte ve biraz büyür. Kalın, büyük harfli sans-serif, hafif gölge. Konuşmayla birebir senkron.' },
  { id: 'kutulu', name: 'Yarı saydam kutuda', sample: 'kısa ve net', preview: { color: '#ffffff', box: 'rgba(0,0,0,.6)', font: 'Inter', weight: 600 },
    text: 'Altyazı yarı saydam koyu kutu içinde beyaz, orta kalınlıkta sans-serif; alt-ortada, tek satır. Konuşmayla birebir senkron.' },
  { id: 'pastel', name: 'Pastel kalın (yaşam tarzı)', sample: 'bugün ne yaptım', preview: { color: '#f5c2e7', stroke: '#3b2a3b', font: 'Fredoka', weight: 700 },
    text: 'Altyazı pastel pembe/lila, yuvarlak hatlı kalın sans-serif, ince koyu kenarlı; ortada, sıcak ve samimi. Konuşmayla birebir senkron.' },
  { id: 'minimal', name: 'Minimal ince', sample: 'sakin bir sabah', preview: { color: '#ffffff', font: 'Inter', weight: 400 },
    text: 'Altyazı küçük, ince beyaz sans-serif; alt ortada tek satır, gölgesiz ve sade. Konuşmayla birebir senkron.' }
];

export const PALETTES = [
  { id: 'marka', name: 'Marka renkleri', colors: null },
  { id: 'pastel-pembe', name: 'Pastel pembe', colors: ['#f9c6d9', '#c084fc', '#fff1e6', '#2b2b2b'] },
  { id: 'krem-sari', name: 'Krem ve sarı not', colors: ['#fff3b0', '#f6c1d4', '#3d2b1f', '#ffffff'] },
  { id: 'gece-turuncu', name: 'Gece mavisi + turuncu', colors: ['#0b1020', '#ff6b00', '#ffffff', '#c7cbd6'] },
  { id: 'gul-bordo', name: 'Gül kurusu + bordo', colors: ['#e7a3b8', '#9b1c31', '#fff1e6', '#4a1520'] },
  { id: 'toprak', name: 'Toprak tonları', colors: ['#c8a27a', '#5b3a29', '#f3e9dc', '#8a9a5b'] },
  { id: 'deniz-krem', name: 'Deniz yeşili + krem', colors: ['#6d8a86', '#fff1e6', '#2f3e3c', '#d9c9b8'] },
  { id: 'neon', name: 'Neon gece', colors: ['#0f0f0f', '#39ff14', '#ff2bd6', '#ffffff'] },
  { id: 'kontrast', name: 'Siyah beyaz + tek vurgu', colors: ['#111111', '#ffffff', '#facc15'] }
];

export const TONES = {
  enerjik: 'Hızlı tempolu, enerjik ve heyecanlı anlatım.', mizahi: 'Mizahi, eğlenceli; küçük şaşırtıcı espriler.', merak: 'Merak uyandırıcı; izleyiciyi sonuna kadar tutan gizem.',
  estetik: 'Sakin, estetik, yumuşak geçişli yaşam tarzı anlatımı.', dramatik: 'Dramatik, sinematik, duygusal yükselişli.', samimi: 'Samimi, sohbet eder gibi, içten.', profesyonel: 'Profesyonel, net ve güven veren.', egitici: 'Öğretici, adım adım, anlaşılır.'
};
export const CTAS = { kaydet: 'Kaydet ve sonra tekrar bak', takip: 'Daha fazlası için takip et', yorum: 'Yorumlara düşünceni yaz', paylas: 'Bunu ihtiyacı olan biriyle paylaş', link: 'Profildeki linke tıkla', yok: '' };
export const CAMERAS = { hareketli: 'Akıcı, hareketli kamera; yavaş itme (push-in), takip ve yumuşak geçişler.', sabit: 'Sabit, dengeli kamera; az hareket, temiz kompozisyon.', pov: 'POV (birinci şahıs) ve el kamerası hissi, doğal titreşim.', sinematik: 'Sinematik plan çeşitliliği: geniş plan, yakın plan, detay; alan derinliği.' };
export const MUSIC = { trend: 'Ritmi kurguya oturan, güncel ve enerjik arka plan müziği; konuşmayı bastırmaz.', sakin: 'Sakin, yumuşak, düşük sesli arka plan müziği.', sinematik: 'Sinematik, yükselen arka plan müziği.', yok: 'Müzik yok; yalnızca ortam sesleri ve konuşma.' };
export const DETAILS = { detayli: 'Ayrıntılı', kisa: 'Kısa', yok: 'Betimleme yok' };

export const PRESET_TYPES = { title: 'Başlık stili', subtitle: 'Altyazı stili', palette: 'Renk paleti' };
const BUILTIN = { title: TITLE_STYLES, subtitle: SUBTITLE_STYLES, palette: PALETTES };

const hexName = list => list.join(', ');

// Seçimlerden kural şablonu: sabit bölümler hazır, içeriğe özel yerler [köşeli alan]
export function composeRule(spec, { brand = null, presets = {} } = {}) {
  const pf = PLATFORMS[spec.platform] || PLATFORMS.reels;
  const find = (type, id) => (presets[type] || BUILTIN[type]).find(x => x.id === id) || null;
  const title = find('title', spec.title);
  const sub = find('subtitle', spec.subtitle) || BUILTIN.subtitle[0];
  const pal = find('palette', spec.palette);
  const dur = pf.video ? Math.max(pf.min, Math.min(pf.max, Math.round(Number(spec.duration) || pf.def))) : 0;
  const hookEnd = pf.video ? Math.max(1, Math.min(3, Math.round(dur * 0.15))) : 0;
  const endStart = pf.video ? Math.max(hookEnd + 1, dur - Math.max(2, Math.round(dur * 0.2))) : 0;
  const brandColors = brand && brand.colors ? [brand.colors.primary, ...(brand.colors.secondary || []), ...(brand.colors.backgrounds || [])].filter(c => HEX.test(c || '')) : [];
  const colors = pal ? (pal.colors || brandColors) : [];
  const accent = colors[1] || colors[0] || '';
  const L = [];
  L.push(pf.video ? (spec.scenes ? 'SAHNE [NUMARASI] — [SAHNENİN AMACI]' : '[İÇERİĞİN ADI] — [İÇERİĞİN AMACI]') : '[TASARIMIN ADI] — [TASARIMIN AMACI]');
  L.push('Mecra ve format:');
  L.push(pf.video ? `${pf.label} için ${pf.aspect} video, ${dur} saniye. ${pf.note}` : `${pf.label} için ${pf.aspect} ${pf.slides ? 'carousel tasarımı' : 'görsel'}. ${pf.note}`);
  if (spec.tone && TONES[spec.tone]) { L.push('Anlatım tonu:'); L.push(TONES[spec.tone]); }
  L.push('Yapı (hook, olay, bitiş):');
  if (pf.video) {
    L.push(`* Hook (0–${hookEnd} saniye): [İzleyiciyi ilk saniyede durduran çarpıcı açılış: soru, şaşırtıcı bilgi ya da beklenmedik görüntü.]`);
    L.push(`* Olay (${hookEnd}–${endStart} saniye): [Konunun gelişmesi; asıl bilgi, hikâye ya da gösterim adım adım.]`);
    L.push(`* Bitiş (${endStart}–${dur} saniye): [Net sonuç ya da ders${CTAS[spec.cta] ? `; "${CTAS[spec.cta]}" çağrısı` : ''}.]`);
  } else if (pf.slides) {
    L.push('* Hook (kapak slaytı): [Merak uyandıran kapak başlığı ve görseli.]');
    L.push('* Olay (ara slaytlar): [Her slaytta tek fikir; kısa başlık ve açıklama.]');
    L.push(`* Bitiş (son slayt): [Özet ya da sonuç${CTAS[spec.cta] ? `; "${CTAS[spec.cta]}" çağrısı` : ''}.]`);
  } else {
    L.push('* Hook: [Görsele ilk bakışta dikkat çeken ana unsur.]');
    L.push('* Olay: [Görselin anlattığı ana mesaj ya da an.]');
    L.push(`* Bitiş: [Akılda kalan sonuç${CTAS[spec.cta] ? `; "${CTAS[spec.cta]}" çağrısı` : ''}.]`);
  }
  // Sabit kısımlar: kullanıcı bir kez yazar; köşeli alan içermediği için her üretimde kelimesi kelimesine aynen kalır
  // (yapay zekâya yazdırılmaz, kodla eklenir). Konuya özel ayrıntı ayrı bölümde doldurulur.
  const fixedText = v => String(v || '').replace(/[[\]]/g, '').replace(/\s+\n/g, '\n').trim().slice(0, 2000);
  const fPlace = fixedText(spec.fixedPlace); const fChar = fixedText(spec.fixedCharacter); const fStyle = fixedText(spec.fixedStyle);
  if (fStyle) { L.push('Görsel stil:'); L.push(fStyle); }
  if (fPlace) {
    L.push('Mekân ve ışık:');
    L.push(fPlace);
    if (spec.details !== 'yok') { L.push('Konuya özel ayrıntılar:'); L.push('[Bu konuya özgü sahnedeki nesneler, ekranlar ve etkileşimler; sabit mekânın içinde.]'); }
  } else if (spec.details !== 'yok') {
    L.push('Mekân ve görsel betimleme:');
    L.push(spec.details === 'kisa' ? '[Ortam, ışık ve ana nesnelerin 1-2 cümlelik kısa tarifi.]'
      : 'Ön planda [nesneler ve detaylar], orta planda [ana öznenin bulunduğu alan ve etkileşim nesneleri], arka planda [mekânın mimarisi, dekorasyon, ışık kaynakları ve atmosfer] bulunmalı. [Işığın yönü, renk sıcaklığı ve gölgeler.] Ortam boş ya da yapay görünmemeli.');
  } else if (!fPlace) {
    L.push('Görsel betimleme:');
    L.push('Ayrıntılı mekân betimlemesi yazılmaz; yalnızca aksiyon ve kurgu anlatılır.');
  }
  if (pf.video && spec.camera && CAMERAS[spec.camera]) { L.push('Kamera:'); L.push(CAMERAS[spec.camera]); }
  L.push('Karakter kullanımı:');
  L.push(spec.mascot === 'var' ? `Markanın kayıtlı maskotu/ana karakteri kullanılmalı. Karakterin görünümü yeniden tasarlanmamalı; yüz oranları, renkleri, dokusu ve karakteristik özellikleri baştan sona aynı kalmalı.${fChar ? ` ${fChar}` : ''}`
    : spec.mascot === 'insan' ? `Gerçekçi bir insan sunucu/karakter kullanılır; ${fChar || '[kişinin yaşı, görünümü ve kıyafeti]'}. Gerçek bir ünlü ya da tanınan kişi olmamalı.`
      : 'Maskot ya da karakter kullanılmaz; anlatım ürün, nesne, mekân ve yazılarla yapılır.');
  if (colors.length) { L.push('Renk paleti:'); L.push(`${pal.name}: ${hexName(colors)}. Bütün sahne/tasarım bu renk uyumunda kalır; vurgu rengi ${accent}.`); }
  L.push('Başlık yazısı:');
  if (title) {
    L.push('Tam olarak şu metin kullanılmalı:');
    L.push('"[Başlık metni]"');
    L.push(`${title.text}${accent ? ` Vurgu rengi ${accent}.` : ''} Yazı güvenli alanda kalır, kadraj dışına taşmaz, ${spec.mascot === 'yok' ? 'önemli öğeleri' : 'karakterin yüzünü'} kapatmaz; Türkçe karakterler eksiksiz ve doğru olmalı.${pf.video ? ' Başlık baştan sona aynı tasarımda ve sabit kalır.' : ''}`);
  } else L.push('Ekranda başlık yazısı olmayacak.');
  if (pf.video) {
    L.push('Konuşma ve seslendirme:');
    L.push('"[Seslendirme metni birebir buraya yazılır.]"');
    L.push('Ses tonu: [Tona uygun ses tonu.] Ağız hareketleri konuşmayla senkronize olmalı; metin değiştirilmemeli.');
    L.push('Altyazı:');
    L.push(sub.text.replace('[vurgu rengi]', accent || 'vurgu'));
    if (spec.music && MUSIC[spec.music]) { L.push('Müzik ve ses:'); L.push(MUSIC[spec.music]); }
  }
  L.push('Ekran ve isim kısıtları:');
  const bans = [];
  if (spec.noBrand) bans.push('Marka, kurum ya da ürün adı yazılmayacak ve söylenmeyecek; logo, filigran ya da marka işareti olmayacak.');
  bans.push('Gerçek kişi, ünlü ya da başka marka adı kullanılmayacak.');
  if (pf.video) bans.push('Sosyal medya arayüzü, beğeni, takip ya da bildirim butonları gösterilmeyecek.');
  L.push(bans.join(' '));
  if (spec.scenes && pf.video) { L.push('Sahne devamlılığı:'); L.push('[Önceki sahneyle bağlantı: başlangıç karesi, konum, ışık. Sonraki sahneye aktarılacak poz.]'); }
  if (spec.extra && String(spec.extra).trim()) { L.push('Ek kurallar:'); L.push(String(spec.extra).trim().slice(0, 2000)); }
  L.push('Son kontrol:');
  L.push(`Hook, olay ve bitiş net; ${title ? 'başlık yazısı doğru ve okunur; ' : ''}${pf.video ? (sub.id === 'yok' ? 'altyazısız; ' : 'altyazı senkron; ') : ''}${spec.mascot === 'var' ? 'karakter tasarımı sabit; ' : ''}renk paleti tutarlı.`);
  const name = `${pf.label}${dur ? ` · ${dur} sn` : ''}${title ? ` · ${title.name}` : ''}`.slice(0, 80);
  // Reels mecrası Prompt Studio'nun ana türüne (Reels) kaydedilir; diğer video mecraları maskot / video
  const kind = spec.platform === 'reels' ? 'reels' : pf.video ? (spec.mascot === 'var' ? 'maskot' : 'video') : pf.slides ? 'post' : 'gorsel';
  return { name, kind, body: L.join('\n') };
}

// Kullanıcının kendi stilleri (bütün markalarda görünür)
export function createPresetService({ db }) {
  const toPreset = r => ({ id: r.id, type: r.type, name: r.name, text: r.text, preview: parseJson(r.preview, {}) || {}, colors: (parseJson(r.preview, {}) || {}).colors || null, sample: (parseJson(r.preview, {}) || {}).sample || null, custom: true });
  const custom = type => db.prepare('SELECT * FROM prompt_presets WHERE type = ? ORDER BY created_at').all(type).map(toPreset);
  function all() {
    return {
      platforms: Object.fromEntries(Object.entries(PLATFORMS).map(([k, v]) => [k, { label: v.label, aspect: v.aspect, video: v.video, slides: Boolean(v.slides), min: v.min, max: v.max, def: v.def, note: v.note }])),
      title: [...TITLE_STYLES, ...custom('title')], subtitle: [...SUBTITLE_STYLES, ...custom('subtitle')], palette: [...PALETTES, ...custom('palette')],
      tones: TONES, ctas: CTAS, cameras: CAMERAS, music: MUSIC, details: DETAILS
    };
  }
  return {
    all,
    compose(spec, brand) { const a = all(); return composeRule(spec || {}, { brand, presets: { title: a.title, subtitle: a.subtitle, palette: a.palette } }); },
    save(id, body = {}) {
      const old = id ? db.prepare('SELECT * FROM prompt_presets WHERE id = ?').get(String(id)) : null;
      if (id && !old) throw notFound('Stil bulunamadı.');
      const type = oneOf(body.type != null ? body.type : old && old.type, Object.keys(PRESET_TYPES), 'Stil türü');
      const name = text(body.name != null ? body.name : old && old.name, { field: 'Ad', max: 60, required: true });
      const desc = type === 'palette' ? '' : text(body.text != null ? body.text : old && old.text, { field: 'Tarif', max: 1500, required: true });
      const prev = Object.assign({}, old ? parseJson(old.preview, {}) : {}, body.preview && typeof body.preview === 'object' ? body.preview : {});
      if (type === 'palette') {
        const cols = (Array.isArray(body.colors) ? body.colors : prev.colors || []).filter(c => HEX.test(c || '')).slice(0, 6);
        if (cols.length < 2) throw badRequest('Palet için en az 2 renk seç.');
        prev.colors = cols;
      }
      if (body.sample != null) prev.sample = Array.isArray(body.sample) ? body.sample.map(String).slice(0, 4) : String(body.sample).slice(0, 60);
      const clean = {};
      ['bg', 'color', 'accent', 'stroke', 'box', 'font'].forEach(k => { if (typeof prev[k] === 'string' && prev[k].length <= 40) clean[k] = prev[k]; });
      if (Array.isArray(prev.fonts)) clean.fonts = prev.fonts.map(String).slice(0, 2);
      ['weight'].forEach(k => { if (Number(prev[k])) clean[k] = Number(prev[k]); });
      ['upper', 'spaced', 'pill'].forEach(k => { if (prev[k]) clean[k] = true; });
      if (prev.colors) clean.colors = prev.colors;
      if (prev.sample) clean.sample = prev.sample;
      if (old) db.prepare('UPDATE prompt_presets SET type = ?, name = ?, text = ?, preview = ? WHERE id = ?').run(type, name, desc, JSON.stringify(clean), old.id);
      const nid = old ? old.id : newId();
      if (!old) db.prepare('INSERT INTO prompt_presets (id, type, name, text, preview, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(nid, type, name, desc, JSON.stringify(clean), now());
      return toPreset(db.prepare('SELECT * FROM prompt_presets WHERE id = ?').get(nid));
    },
    remove(id) {
      const r = db.prepare('DELETE FROM prompt_presets WHERE id = ?').run(String(id));
      if (!r.changes) throw notFound('Stil bulunamadı.');
    }
  };
}
