// Reels kuralları: senaryo isteği, yanıtı düzenleme, süre/konuşma hızı, kalite kontrolü, Flow/Veo prompt'ları,
// altyazı (.srt) ve senaryo metni. Saf işlevler: veritabanı ve AI çağrısı yok (testlenebilir).
// Eski sistemdeki kuralların markadan bağımsız hâli: karakter, kitle ve dil markanın kimliğinden gelir.

export const LIMITS = { maxScene: 8, minScene: 3, targetMax: 30, maxTotal: 45, maxScenes: 6, speechRate: 2.4 };

export const FORMATS = {
  vlog: { label: 'Vlog / POV', desc: "Karakter kameraya konuşur, günlük hayatından veya işinden tanıdık bir anı hızlıca paylaşır. İzleyici 'bu benim hayatım' demeli." },
  skec: { label: 'Skeç', desc: "Kısa komik skeç: hedef kitlenin 'bu tam ben' deyip arkadaşını etiketleyeceği, cuk oturan tanıdık bir an. Tek ve net espri, hızlı tepki." },
  hikaye: { label: 'Hikâye', desc: "Konunun az bilinen, gerçek ve şaşırtıcı bir hikâyesi. Kişiler isimle değil unvanla anılır. Sonunda bugünle bağlanır; izleyici 'bunu bilmiyordum' deyip kaydeder." },
  bilgi: { label: 'Bilgi / ipucu', desc: 'Önce herkesin yaşadığı tanıdık bir sorun, hemen ardından tek ve net, kaydedilecek bir bilgi veya ipucu.' },
  tanitim: { label: 'Doğal tanıtım', desc: 'Ürünü veya hizmeti reklam gibi değil, bir hikâyenin içinde doğal biçimde gösteren kısa video.' }
};

export const STYLES = {
  '3d': {
    label: 'Sinematik 3D animasyon',
    en: 'High-end cinematic 3D animated film look: realistic textures, cinematic lighting, shallow depth of field, polished professional visual effects; not toy-like, not plastic, not LEGO.',
    tr: 'Sinematik, yüksek kaliteli 3D animasyon filmi görünümü: gerçekçi dokular, sinematik ışık, alan derinliği, profesyonel ve şık görsel efektler; oyuncak, plastik veya LEGO görünümü yok.'
  },
  gercekci: {
    label: 'Gerçekçi çekim',
    en: 'Photorealistic live-action look shot on a modern cinema camera: natural skin and materials, cinematic lighting, shallow depth of field.',
    tr: 'Modern sinema kamerasıyla çekilmiş gibi gerçekçi görüntü: doğal ten ve malzemeler, sinematik ışık, alan derinliği.'
  },
  '2d': {
    label: '2D çizgi animasyon',
    en: 'Polished 2D animated illustration style: clean lines, flat vibrant colors, smooth character animation, professional motion graphics.',
    tr: 'Özenli 2D çizgi animasyon: temiz çizgiler, canlı düz renkler, akıcı karakter animasyonu, profesyonel hareketli grafik.'
  }
};

export const STATUSES = { taslak: 'Taslak', hazir: 'Çekime hazır', cekildi: 'Çekildi', paylasildi: 'Paylaşıldı' };

// Başlık stilleri: önizleme (CSS), çizim (PNG) ve ilk sahne prompt'u için tarif. "marka" markanın renklerini kullanır.
export const TITLE_STYLES = {
  pop: { label: 'Pembe Pop', en: k => `playful pop-style title in the top third of the frame: chunky rounded bold white letters, the word "${k}" much bigger in bright hot pink bold letters, a few small pink stars around the title`, tr: k => `karenin üst üçte birinde eğlenceli pop başlık: kalın yuvarlak beyaz harfler, "${k}" kelimesi çok daha büyük ve parlak pembe, etrafta birkaç küçük pembe yıldız` },
  editoryal: { label: 'Editoryal', en: k => `elegant editorial magazine-cover title in the top third of the frame: large white high-contrast serif letters, the word "${k}" in a big flowing pink handwritten script`, tr: k => `karenin üst üçte birinde dergi kapağı gibi zarif başlık: büyük beyaz serif harfler, "${k}" kelimesi büyük ve akıcı pembe el yazısıyla` },
  retro: { label: 'Krem Retro', en: k => `cute retro title in the top third of the frame: soft chunky rounded cream and white letters with a subtle warm drop shadow, the word "${k}" slightly larger, tiny yellow doodle flowers around the title`, tr: k => `karenin üst üçte birinde sevimli retro başlık: hafif gölgeli tombul krem-beyaz harfler, "${k}" biraz daha büyük, etrafta küçük sarı çizgi çiçekler` },
  vlog: { label: 'Vlog Kalın', en: k => `bold trendy vlog-cover title in the top third of the frame: huge heavy condensed uppercase letters in hot pink with a thin white outline, the word "${k}" the biggest`, tr: k => `karenin üst üçte birinde vlog kapağı gibi başlık: dev, kalın, dar büyük harfler, ince beyaz kenarlı pembe, "${k}" en büyük` },
  marka: { label: 'Marka renkleri', en: (k, c) => `bold title in the top third of the frame: chunky rounded white letters with a soft dark shadow, the word "${k}" much bigger in the brand color ${c.primary || 'orange'}`, tr: (k, c) => `karenin üst üçte birinde kalın başlık: hafif koyu gölgeli yuvarlak beyaz harfler, "${k}" kelimesi çok daha büyük ve marka renginde (${c.primary || 'turuncu'})` },
  sade: { label: 'Sade Klasik', en: () => 'title at the top of the frame in bold white text with a dark outline', tr: () => 'karenin üstünde koyu kenarlı kalın beyaz başlık' }
};

// Flow/Veo gerçek kişi, kurum ve marka adı geçen prompt'ları reddediyor: yanıtta yakalanıp uyarılır
const REAL_NAME_TERMS = [
  'chatgpt', 'openai', 'gemini', 'copilot', 'claude', 'google', 'microsoft', 'excel', 'powerpoint', 'apple', 'iphone', 'ipad', 'macbook',
  'android', 'samsung', 'xiaomi', 'huawei', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'youtube', 'twitter', 'linkedin', 'telegram',
  'discord', 'amazon', 'netflix', 'spotify', 'tesla', 'spacex', 'nvidia', 'intel', 'github', 'windows', 'playstation', 'xbox', 'nintendo',
  'starbucks', 'mcdonald', 'burger king', 'coca-cola', 'coca cola', 'pepsi', 'nike', 'adidas', 'zara', 'ikea', 'disney', 'marvel',
  'elon musk', 'bill gates', 'steve jobs', 'zuckerberg', 'einstein', 'newton', 'edison', 'nikola tesla', 'turing', 'nasa',
  'turkcell', 'türk telekom', 'vodafone', 'trendyol', 'hepsiburada', 'getir', 'yemeksepeti', 'migros', 'bim', 'a101', 'şok market',
  'bakanlığı', 'üniversitesi', 'a.ş.', 'holding'
];
const CTA = /\b(kaydet|beğen|paylaş|takip et|yorum yaz|etiketle|abone ol|linke tıkla)\w*/i;
const SLOW_TERMS = ['smooth', 'smoothly', 'slow', 'slowly', 'gentle', 'gently', 'yavaş', 'yavaşça'];
const TEXT_TERMS = /\b(text|texts|message|messages|words|writing|letters|caption|label that reads|sign that reads)\b/i;

// Türkçe harfleri sadeleştirip küçültür: İngilizce prompt'ta "Cekirdek" yazılması "Çekirdek" sayılır
const FOLD = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u' };
const fold = v => String(v || '').toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, c => FOLD[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
export const polish = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const seconds = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : null);
const wordCount = t => polish(t).split(' ').filter(Boolean).length;

export function formatTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const whole = Math.floor(s);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}${s - whole >= 0.5 ? '.5' : ''}`;
}

export const totalSeconds = data => (data.scenes || []).reduce((n, sc) => n + sc.duration, 0);

// Başlığın vurgulanacak kelimesi: modelin verdiği kelime başlıkta birebir yoksa en uzun kelime
export function titleKeyword(title, wanted) {
  const words = polish(title).split(' ').filter(Boolean);
  const clean = w => w.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');
  const hit = wanted && words.find(w => clean(w) === clean(wanted));
  if (hit) return hit.replace(/[^\p{L}\p{N}%]/gu, '');
  return (words.slice().sort((a, b) => clean(b).length - clean(a).length)[0] || '').replace(/[^\p{L}\p{N}%]/gu, '');
}

// --- Yanıtı düzenleme ---
function normalizeBeats(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(b => b && typeof b === 'object' && b.action)
    .map(b => ({ from: seconds(b.from) ?? 0, to: seconds(b.to) ?? 0, action: polish(b.action), camera: polish(b.camera), sound: polish(b.sound) }))
    .filter(b => b.to > b.from)
    .sort((a, b) => a.from - b.from);
}

// Sahne 3-8 sn, en fazla 6 sahne, toplam en fazla 45 sn; süresi değişen sahnenin zamanlaması orantılı ölçeklenir
export function fitDurations(scenes) {
  const fitted = scenes.slice(0, LIMITS.maxScenes).map(sc => Object.assign({}, sc, {
    _orig: Number(sc.duration) || 0,
    duration: Math.min(LIMITS.maxScene, Math.max(LIMITS.minScene, Math.round(Number(sc.duration) || 6)))
  }));
  const total = () => fitted.reduce((n, sc) => n + sc.duration, 0);
  while (total() > LIMITS.maxTotal) {
    const longest = fitted.reduce((a, b) => (b.duration > a.duration ? b : a));
    if (longest.duration <= LIMITS.minScene) break;
    longest.duration--;
  }
  return fitted.map(sc => {
    const { _orig, ...scene } = sc;
    const span = (scene.beats || []).reduce((m, b) => Math.max(m, b.to), 0) || _orig || scene.duration;
    if (span === scene.duration) return scene;
    const k = scene.duration / span;
    const at = t => Math.min(scene.duration, Math.round(t * k * 2) / 2);
    if (scene.beats) scene.beats = scene.beats.map(b => Object.assign({}, b, { from: at(b.from), to: at(b.to) })).filter(b => b.to > b.from);
    if (scene.lineFrom != null) scene.lineFrom = at(scene.lineFrom);
    if (scene.lineTo != null) scene.lineTo = at(scene.lineTo);
    return scene;
  });
}

// Replik doğal konuşma hızına (≈2,4 kelime/sn) sığmıyorsa sahne en fazla 8 saniyeye uzatılır; toplam sınır aşılmaz
export function stretchForSpeech(scenes) {
  let budget = LIMITS.maxTotal - scenes.reduce((n, sc) => n + sc.duration, 0);
  return scenes.map(sc => {
    if (!sc.line || budget <= 0) return sc;
    const from = sc.lineFrom != null ? sc.lineFrom : 0;
    const needed = Math.ceil((wordCount(sc.line) / LIMITS.speechRate) * 2) / 2;
    if (sc.lineTo != null && sc.lineTo - from >= needed) return sc;
    const target = Math.min(LIMITS.maxScene, sc.duration + budget, Math.ceil(from + needed + 0.5));
    if (target <= sc.duration && sc.lineTo != null && sc.lineTo >= sc.duration - 0.5) return sc;
    const duration = Math.max(sc.duration, target);
    budget -= duration - sc.duration;
    const scene = Object.assign({}, sc, { duration });
    if (scene.beats && scene.beats.length) scene.beats = scene.beats.map((b, i, all) => (i === all.length - 1 ? Object.assign({}, b, { to: duration }) : b));
    if (scene.lineFrom == null) scene.lineFrom = 0;
    scene.lineTo = Math.min(duration, from + needed);
    return scene;
  });
}

// Modelin JSON yanıtını kayıt biçimine çevirir; kullanılamazsa null
export function normalizeScenario(raw, { titleStyle = 'pop' } = {}) {
  const r = raw && Array.isArray(raw.ideas) ? raw.ideas[0] : raw;
  if (!r || typeof r !== 'object' || !polish(r.title)) return null;
  const scenes = fitDurations((Array.isArray(r.scenes) ? r.scenes : [])
    .filter(s => s && typeof s === 'object' && (s.flowScene || s.flowSceneTr || (Array.isArray(s.beats) && s.beats.length)))
    .map(s => {
      const scene = { duration: s.duration, beats: normalizeBeats(s.beats), line: polish(s.line), flowScene: String(s.flowScene || '').trim(), flowSceneTr: String(s.flowSceneTr || '').trim() };
      if (s.start) scene.start = polish(s.start);
      if (s.endFrame) scene.endFrame = polish(s.endFrame);
      if (scene.line && seconds(s.lineFrom) != null && seconds(s.lineTo) != null) { scene.lineFrom = seconds(s.lineFrom); scene.lineTo = seconds(s.lineTo); }
      return scene;
    }));
  if (!scenes.length) return null;
  const screenTitle = polish(r.screenTitle || r.title);
  const data = {
    title: polish(r.title),
    format: FORMATS[r.format] ? r.format : 'skec',
    topic: polish(r.topic),
    why: polish(r.why),
    punchline: polish(r.punchline),
    setting: polish(r.setting),
    screenTitle,
    titleKeyword: titleKeyword(screenTitle, r.titleKeyword),
    titleStyle: TITLE_STYLES[r.titleStyle] ? r.titleStyle : titleStyle,
    scenes: stretchForSpeech(scenes),
    ending: {},
    caption: String(r.caption || '').trim(),
    hashtags: Array.isArray(r.hashtags) ? r.hashtags.map(h => polish(h).replace(/^#?/, '#')).filter(h => h.length > 1).slice(0, 8) : [],
    music: polish(r.music)
  };
  if (r.ending && typeof r.ending === 'object') {
    ['resolution', 'finalLine', 'twist', 'lastFrame', 'loop'].forEach(k => { if (r.ending[k]) data.ending[k] = polish(r.ending[k]); });
  }
  return data;
}

// --- Kalite kontrolü (kodla doğrulanabilen kurallar). Uyarı listesi; boşsa sorun yok ---
export function findRealNames(data, { allow = [] } = {}) {
  const fields = [data.screenTitle, data.topic, data.setting];
  (data.scenes || []).forEach(sc => { fields.push(sc.line, sc.flowScene, sc.flowSceneTr, sc.start, sc.endFrame); (sc.beats || []).forEach(b => fields.push(b.action, b.camera)); });
  if (data.ending) fields.push(...Object.values(data.ending));
  const text = fields.filter(Boolean).join(' \n ').toLocaleLowerCase('tr-TR');
  const allowed = allow.map(a => String(a || '').toLocaleLowerCase('tr-TR')).filter(Boolean);
  return REAL_NAME_TERMS.filter(term => !allowed.some(a => a.includes(term)) &&
    new RegExp('(^|[^\\p{L}\\p{N}])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'u').test(text));
}

export function checkQuality(data, { character = '', allow = [] } = {}) {
  const issues = [];
  const scenes = data.scenes || [];
  scenes.forEach((sc, i) => {
    const n = `Sahne ${i + 1}`;
    const beats = sc.beats || [];
    if (!beats.length) issues.push(`${n}: saniye saniye aksiyon yok.`);
    else {
      if (beats[0].from > 0) issues.push(`${n}: ilk ${beats[0].from} saniye boş.`);
      for (let k = 1; k < beats.length; k++) {
        const gap = beats[k].from - beats[k - 1].to;
        if (gap > 0.25) issues.push(`${n}: ${formatTime(beats[k - 1].to)}–${formatTime(beats[k].from)} arası boş.`);
        if (gap < -0.25) issues.push(`${n}: ${formatTime(beats[k].from)} civarında aksiyonlar çakışıyor.`);
      }
      const end = beats[beats.length - 1].to;
      if (Math.abs(end - sc.duration) > 0.25) issues.push(`${n}: aksiyonlar ${end}. saniyede bitiyor, sahne ${sc.duration} sn.`);
    }
    if (!sc.line) issues.push(`${n}: konuşma yok; her sahnede konuşma olmalı.`);
    else {
      if (CTA.test(sc.line)) issues.push(`${n}: "kaydet/takip et" gibi çağrı var; video çağrıyla değil asıl espriyle bitmeli.`);
      if (sc.lineFrom == null || sc.lineTo == null) issues.push(`${n}: konuşmanın başlangıç ve bitiş saniyesi yok.`);
      else {
        const span = sc.lineTo - sc.lineFrom;
        const w = wordCount(sc.line);
        if (span <= 0 || sc.lineTo > sc.duration + 0.25) issues.push(`${n}: konuşma zamanı sahne süresinin dışında.`);
        else if (w / span > 2.7) issues.push(`${n}: replik ${span} saniyeye sığmıyor (${w} kelime).`);
        else if (span < sc.duration * 0.6) issues.push(`${n}: konuşma ${sc.duration} saniyelik sahnenin yalnızca ${span} saniyesi.`);
        else if (w < span * 1.5) issues.push(`${n}: replik ${span} saniyelik konuşma için kısa (${w} kelime).`);
      }
    }
    if (i > 0 && !sc.start) issues.push(`${n}: önceki sahneyle bağlantı yazılmamış.`);
    if (!sc.endFrame) issues.push(`${n}: bitiş karesi yazılmamış.`);
    if (sc.flowScene) {
      if (!/\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?\s*(?:s\b|sec|sn)/i.test(sc.flowScene)) issues.push(`${n}: İngilizce prompt'ta saniye aralıkları (0-2s gibi) yok.`);
      if (character && !fold(sc.flowScene).includes(fold(character))) issues.push(`${n}: İngilizce prompt'ta karakterin adı ("${character}") geçmiyor; video aracı başka bir karakter çizebilir.`);
      const t = sc.flowScene.match(TEXT_TERMS);
      if (t) issues.push(`${n}: İngilizce prompt'ta karede yazı tarif edilmiş ("${t[0]}"); video aracı yazıyı bozar, görsel anlat.`);
    }
    const slow = SLOW_TERMS.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(`${sc.flowScene} ${sc.flowSceneTr || ''}`));
    if (slow.length) issues.push(`${n}: tempoyu düşüren kamera ifadesi var (${slow.join(', ')}).`);
    if (sc.enOutdated) issues.push(`${n}: Türkçe tarif düzeltildi ama İngilizce prompt henüz güncellenmedi.`);
  });
  if (!data.punchline) issues.push('Asıl espri (punchline) yazılmamış.');
  const tw = wordCount(data.screenTitle);
  if (tw > 5) issues.push(`Başlık ${tw} kelime: en fazla 5 olmalı.`);
  const total = totalSeconds(data);
  if (total > LIMITS.targetMax) issues.push(`Video ${total} saniye: ${LIMITS.targetMax} saniyeyi aşıyor, kısaltılabilecek sahne var mı?`);
  if (!data.setting) issues.push('Görsel ortam (sahneler boyunca korunacak mekân) yazılmamış.');
  if (!data.ending || !data.ending.twist) issues.push('Final için şaşırtıcı veya komik bir kapanış yazılmamış.');
  const names = findRealNames(data, { allow });
  if (names.length) issues.push(`Gerçek isim geçiyor (${names.join(', ')}): video araçları bu prompt'u reddedebilir.`);
  return issues;
}

// --- Flow / Veo prompt'ları ---
function lineTiming(scene, character, tr) {
  if (scene.lineFrom != null && scene.lineTo != null) {
    return tr ? `${scene.lineFrom}. saniyede başlayıp ${scene.lineTo}. saniyede biten konuşmada ${character} Türkçe olarak şunu söylüyor: "${scene.line}"`
      : `From second ${scene.lineFrom} to second ${scene.lineTo}, ${character} says in Turkish: "${scene.line}"`;
  }
  return tr ? `${character} Türkçe olarak şunu söylüyor: "${scene.line}"` : `${character} says in Turkish: "${scene.line}"`;
}

// Flow prompt'u: başlık yalnızca ilk sahnede (her sahnede yeniden çizilen başlık farklı ve hatalı çıkıyor)
export function flowPrompt(data, index, { lang = 'en', character, style = '3d', colors = {} } = {}) {
  const tr = lang === 'tr';
  const scene = data.scenes[index];
  const st = STYLES[style] || STYLES['3d'];
  const ts = TITLE_STYLES[data.titleStyle] || TITLE_STYLES.pop;
  const parts = [tr
    ? `Dikey 9:16 video, ${scene.duration} saniye. Hızlı tempolu ve enerjik, komik zamanlamalı; ağır çekim veya yavaş kamera hareketi yok.`
    : `Vertical 9:16 video, ${scene.duration} seconds. Fast-paced and energetic with snappy comedic timing, quick camera moves and instant reactions, no slow motion and no slow pans.`];
  parts.push(tr ? st.tr : st.en);
  const sceneText = tr ? scene.flowSceneTr : scene.flowScene;
  if (sceneText) parts.push(sceneText.replace(/\.?$/, '.'));
  if (scene.line) parts.push(lineTiming(scene, character, tr));
  if (index === 0 && data.screenTitle) {
    const k = data.titleKeyword || titleKeyword(data.screenTitle);
    parts.push(tr ? `Baştan sona görünen ${ts.tr(k, colors)}. Başlık metni harfi harfine, her kelime bir kez: "${data.screenTitle}".`
      : `On-screen title visible the whole time: ${ts.en(k, colors)}. The title text reads exactly, letter for letter, each word only once: "${data.screenTitle}".`);
  }
  parts.push(tr
    ? `${index === 0 ? 'Başlık dışında yazı olmasın, altyazı yok' : 'Bu sahnede başlık ve altyazı yok, karede hiç yazı olmasın'}; ekranlar ve tabelalarda okunabilir kelime değil sade şekiller görünsün. Arayüz katmanı, ikon, filigran veya logo olmasın.`
    : `${index === 0 ? 'No other text besides the title, no subtitles' : 'No title and no subtitles in this scene, no text in the frame at all'}; screens and signs show simple shapes, not readable words. No interface overlays, icons, watermark or logos.`);
  return parts.join(' ');
}

// Temiz video prompt'u (Veo, Kling, Runway…): hiç yazı yok; replik yalnızca ses olarak
export function cleanVideoPrompt(data, index, { lang = 'en', character, style = '3d' } = {}) {
  const tr = lang === 'tr';
  const scene = data.scenes[index];
  const st = STYLES[style] || STYLES['3d'];
  const parts = [tr ? `Dikey 9:16 video, ${scene.duration} saniye. Hızlı tempolu, yüksek enerjili; ağır çekim ve yavaş kamera hareketi yok.`
    : `Vertical 9:16 video, ${scene.duration} seconds. Fast-paced and high energy, no slow motion and no slow pans.`];
  parts.push(tr ? st.tr : st.en);
  const sceneText = tr ? scene.flowSceneTr : scene.flowScene;
  if (sceneText) parts.push(sceneText.replace(/\.?$/, '.'));
  if (scene.line) {
    const at = scene.lineFrom != null ? (tr ? `${scene.lineFrom}-${scene.lineTo}. saniyeler arasında ` : `From second ${scene.lineFrom} to second ${scene.lineTo}, `) : '';
    parts.push(tr ? `${at}${character} kameraya dudak senkronuyla, net ve enerjik bir sesle Türkçe konuşur (yalnızca ses, ekranda yazı yok): "${scene.line}"`
      : `${at}${character} speaks to the camera in Turkish with clear lip sync and an energetic voice (spoken audio only, not on-screen text): "${scene.line}"`);
  }
  parts.push(tr ? 'Saf video sahnesi. Ekranda hiçbir yazı, altyazı, başlık, harf, filigran, logo veya katman olmasın.'
    : 'Pure video footage. Clean frame, absolutely no text, no subtitles, no on-screen words, no gibberish letters, no watermark, no logos, no overlays.');
  return parts.join(' ');
}

// --- Altyazı (.srt): replik cümlelere bölünür, konuşma süresi kelime sayısına göre paylaştırılır ---
export function buildSrt(data) {
  const stamp = sec => {
    const ms = Math.round(sec * 1000);
    const p = (n, l) => String(n).padStart(l, '0');
    return `${p(Math.floor(ms / 3600000), 2)}:${p(Math.floor(ms / 60000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)},${p(ms % 1000, 3)}`;
  };
  const cues = [];
  let offset = 0;
  (data.scenes || []).forEach(sc => {
    if (sc.line) {
      const from = offset + (sc.lineFrom != null ? sc.lineFrom : 0);
      const to = offset + (sc.lineTo != null ? sc.lineTo : sc.duration);
      const parts = (sc.line.match(/[^.!?…]+[.!?…]*/g) || [sc.line]).map(s => s.trim()).filter(Boolean);
      const total = parts.reduce((n, s) => n + wordCount(s), 0) || 1;
      let at = from;
      parts.forEach(s => { const end = at + ((to - from) * wordCount(s)) / total; cues.push({ from: at, to: end, text: s }); at = end; });
    }
    offset += sc.duration;
  });
  return cues.length ? cues.map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}`).join('\n\n') + '\n' : '';
}

// --- Senaryo metni (kopyalama / .txt / arşiv) ---
export function scriptText(data, { character = 'Karakter', style = '3d', colors = {}, issues = [] } = {}) {
  const NAME = character.toLocaleUpperCase('tr-TR');
  const range = (a, b) => `${formatTime(a)}–${formatTime(b)}`;
  const L = [
    `VİDEO ADI: ${data.title}`, `TOPLAM SÜRE: ${totalSeconds(data)} saniye`, `FORMAT: ${(FORMATS[data.format] || {}).label || data.format}`,
    `KONU: ${data.topic || data.why || data.title}`, `ASIL ESPRİ: ${data.punchline || '-'}`, `GÖRSEL ORTAM: ${data.setting || '-'}`,
    `EKRAN BAŞLIĞI: ${data.screenTitle || '-'}`, ''
  ];
  let offset = 0;
  data.scenes.forEach((sc, i) => {
    L.push(`SAHNE ${i + 1} – [${range(offset, offset + sc.duration)}]`);
    L.push(`* ${i === 0 ? 'Başlangıç' : 'Önceki sahneyle bağlantı'}: ${sc.start || '-'}`);
    L.push('* Saniye saniye aksiyon:');
    (sc.beats || []).forEach(b => L.push(`  - ${range(offset + b.from, offset + b.to)} ${b.action}${b.camera ? ` (kamera: ${b.camera})` : ''}${b.sound ? ` [ses: ${b.sound}]` : ''}`));
    L.push(`* ${NAME}: ${sc.line ? `${sc.lineFrom != null ? `[${range(offset + sc.lineFrom, offset + sc.lineTo)}] ` : ''}"${sc.line}"` : 'Konuşmuyor'}`);
    L.push(`* Bitiş karesi: ${sc.endFrame || '-'}`, '');
    offset += sc.duration;
  });
  const e = data.ending || {};
  L.push('FİNAL', `* Tamamlanma: ${e.resolution || '-'}`, `* Kapanış: ${e.twist || '-'}`, `* Son kare: ${e.lastFrame || '-'}${e.loop ? ` · Döngü: ${e.loop}` : ''}`, '');
  L.push("FLOW PROMPT'LARI (İNGİLİZCE)");
  data.scenes.forEach((_, i) => L.push(`Sahne ${i + 1}: ${flowPrompt(data, i, { lang: 'en', character, style, colors })}`));
  L.push('', "TEMİZ VİDEO PROMPT'LARI (YAZISIZ, VEO)");
  data.scenes.forEach((_, i) => L.push(`Sahne ${i + 1}: ${cleanVideoPrompt(data, i, { lang: 'en', character, style })}`));
  if (data.music) L.push('', `SES / MÜZİK: ${data.music}`);
  L.push('', `KALİTE KONTROLÜ: ${issues.length ? '' : 'Sorun bulunmadı.'}`, ...issues.map(t => `- ${t}`));
  L.push('', 'AÇIKLAMA:', data.caption || '-', (data.hashtags || []).join(' '));
  return L.join('\n');
}

// --- AI istekleri ---
export function scenarioPrompt({ brandName, memory, settings, topic, format, liked = [], disliked = [], existing = [], rewrite = null }) {
  const name = settings.character;
  const style = STYLES[settings.style] || STYLES['3d'];
  const formats = format && FORMATS[format] ? { [format]: FORMATS[format] } : FORMATS;
  return [
    `Sen '${brandName}' markasının Instagram Reels senaristisin. Videolarda ${name} adlı karakter kameraya konuşuyor.`,
    `Videolar yapay zekâ video aracıyla (Google Flow/Veo) "${style.label}" tarzında, her sahne ayrı bir klip olarak üretilip birleştirilecek. Sen fikir ve senaryo yazıyorsun.`,
    '', 'MARKA HAFIZASI (karakter, kitle ve dil buna sadık kalmalı):', memory, '',
    'FORMATLAR (fikre en uygun olanı seç):', ...Object.entries(formats).map(([k, f]) => `- ${k}: ${f.desc}`), '',
    `KONU: ${topic}`, 'Senaryoyu bu konuya sadık kalarak yaz; konunun espri veya bilgi özünü koru, hikâyeleştir.', '',
    disliked.length ? `BEĞENİLMEYEN FİKİRLER (bunları ve aynı espri tarzını tekrar önerme):\n${disliked.map(t => `- ${t}`).join('\n')}\n` : '',
    liked.length ? `BEĞENİLEN FİKİRLER (bu tarzı ve kaliteyi örnek al ama kopyalama):\n${liked.map(t => `- ${t}`).join('\n')}\n` : '',
    existing.length ? `DAHA ÖNCE YAZILAN SENARYOLAR (bunları tekrar etme):\n${existing.map(t => `- ${t}`).join('\n')}\n` : '',
    rewrite || 'GÖREV: Bu konu için 1 adet Reels senaryosu yaz (saniye saniye).', '',
    `GERÇEK İSİM YASAĞI: Hiçbir alanda gerçek kişi, ünlü, şirket, kurum, okul, marka, ürün, uygulama veya web sitesi adı kullanma; rol veya unvan kullan (bir bilim insanı, büyük bir teknoloji şirketi, bir mesajlaşma uygulaması). Tek istisna kendi markamız ${brandName} ve karakterimiz ${name}.`, '',
    `EN ÖNEMLİ KURAL - KONUŞMA ÖNCE GELİR: ${name} HER SAHNEDE konuşur ve konuşma sahnenin en az %70'ini kaplar (8 saniyelik sahnede ≈6 saniye, 12-16 kelime). Sessiz veya yalnızca mimikten oluşan sahne yok. Mimik ve aksiyon söyleneni görselleştirir. ANLATILAN OLAY EKRANDA GÖSTERİLİR: konuşmada geçen nesne veya olay görüntüde somut olarak yer alır; jestler olay sayılmaz. Bilgi anlatan fikirlerde en çarpıcı somut bilgi (rakam, süre, sonuç) söylenir; emin olmadığın bilgiyi uydurma.`, '',
    "'BU BEN' ETKİSİ: Her fikir, hedef kitlenin 'bu tam ben' deyip arkadaşını etiketleyeceği tanıdık ve gerçek bir ana dayansın.", '',
    `KARAKTER: ${name}'in görünümü video aracında tanımlıdır; hiçbir alanda görünüm, kıyafet veya renk tarifi YAZMA. Kişiliği marka hafızasındaki karaktere uysun.`, '',
    `SÜRE: Konuyu eksiksiz anlatan en kısa süreyi seç. Genelde ${LIMITS.targetMax} saniyeyi geçme; kesin üst sınır ${LIMITS.maxTotal} saniye. Her sahne en fazla ${LIMITS.maxScene} saniye (tek klip sınırı), en fazla ${LIMITS.maxScenes} sahne.`, '',
    "SANİYE SANİYE: Her sahneyi 'beats' listesiyle yaz: her aralıkta aksiyon (action), kamera (camera) ve varsa ses (sound). Beat'ler 0'dan başlar, boşluksuz ve çakışmasız ilerler, son beat sahne süresinde biter. Konuşmanın başlayıp bittiği saniyeyi 'lineFrom' ve 'lineTo' ile ver. Türkçe konuşma hızı saniyede 2-2,5 kelimedir; replik bu süreyi doldurmalı ama aşmamalı.", '',
    "SÜREKLİLİK: Ana mekânı ve ışığı 'setting' alanında bir kez tanımla ve koru. Her sahnenin 'start' alanı başlangıcını, 'endFrame' alanı son karesini anlatır; 2. sahneden itibaren 'start' önceki 'endFrame'den birebir devam eder. Mekân değişiyorsa geçişi açıkça yaz.", '',
    "HİKÂYE: İlk 1-2 saniyede dikkat çekici bir olay; giriş ve tanıtım yok. Hızlı kurgu, anında tepkiler. ASIL ESPRİ: Yazmadan önce konunun asıl esprisini veya en çarpıcı bilgisini bul, 'punchline' alanına tek ve somut cümleyle yaz; son sahnenin repliği bunu açıkça söyleyerek biter. Mümkünse son kare ilk sahneye bağlansın (döngü).", '',
    'KAMERA: Sahne içinde 2-3 saniyede bir plan değişsin (yakın, detay, geniş). Her hareketin sebebi olsun.', '',
    "EKRAN YAZILARI: 'screenTitle' en fazla 5 kelime, en vurucu kelimesi 'titleKeyword' alanında birebir. Repliklerin dışında karede yazı, tabela veya arayüz kurgulama.", '',
    'ÇAĞRI YOK: Repliklerde kaydet, beğen, paylaş, takip et, yorum yaz gibi çağrılar kullanma. Video asıl espriyle biter.', '',
    `FLOW PROMPT: Her sahne için iki dilde birebir aynı içerikte video tarifi yaz: 'flowScene' İngilizce, 'flowSceneTr' Türkçe. Saniye aralıklarıyla yaz ('0-2s:' / '0-2 sn:'), son saniyeye kadar. Karakterden her zaman '${name}' adıyla bahset. Karede yazı tarif etme; durumu görsel anlat. 'smooth', 'slow', 'yavaş' gibi tempoyu düşüren kamera ifadeleri kullanma. Görünüm, başlık, replik metni ve altyazı yazma; sistem ekleyecek.`, '',
    "AÇIKLAMA: 'caption' alanına Instagram açıklaması yaz (600-1200 karakter): merak uyandıran ilk satır, 2-4 kısa paragraf, yorum sorusu; hashtag'leri ayrıca 'hashtags' listesine yaz (en fazla 5).", '',
    'KALİTE KONTROLÜ: Yanıtı vermeden önce kontrol et: her sahnede konuşma var ve sahnenin çoğunu dolduruyor mu, zamanlama boşluksuz mu, replikler süreye sığıyor mu, sahneler birbirine bağlanıyor mu, asıl espri son sahnede söyleniyor mu, çağrı var mı?', '',
    'Sadece şu JSON biçiminde yanıt ver:',
    JSON.stringify({ title: 'Kısa video adı', format: Object.keys(formats)[0], topic: 'Tek cümle konu', why: "İzleyici neden 'bu ben' der?", punchline: 'Asıl espri, somut tek cümle', setting: 'Korunacak mekân ve ışık', screenTitle: 'En fazla 5 kelime', titleKeyword: 'başlıktaki tek kelime',
      scenes: [{ duration: 7, start: 'Başlangıç durumu', beats: [{ from: 0, to: 2, action: '...', camera: '...', sound: '' }, { from: 2, to: 7, action: '...', camera: '...', sound: '' }], line: 'Türkçe konuşma', lineFrom: 0.5, lineTo: 7, endFrame: 'Son kare', flowScene: 'English, 0-2s: ...', flowSceneTr: 'Türkçe, 0-2 sn: ...' }],
      ending: { resolution: '...', finalLine: '...', twist: '...', lastFrame: '...', loop: '' }, caption: 'Açıklama', hashtags: ['#ornek'], music: 'Müzik önerisi' })
  ].filter(s => s !== '').join('\n');
}

// Senaryonun tamamını ya da tek sahnesini yeniden yazma görevi
export function rewriteTask(data, sceneIndex) {
  const json = JSON.stringify(data);
  if (sceneIndex == null) {
    return `GÖREV: Aşağıdaki Reels senaryosunu YENİDEN YAZ. Aynı konu ve ana espri kalsın ama senaryoyu farklı ve daha iyi kur: yeni aksiyonlar, daha güçlü ilk saniyeler, daha akılda kalıcı final. Önceki versiyonu kopyalama.\nÖNCEKİ VERSİYON:\n${json}`;
  }
  const sc = data.scenes[sceneIndex];
  const prev = data.scenes[sceneIndex - 1];
  const next = data.scenes[sceneIndex + 1];
  return `GÖREV: Aşağıdaki senaryoda YALNIZCA SAHNE ${sceneIndex + 1}'İ yeniden yaz, diğer sahneleri aynen geri döndür. Yeni sahne aynı süreyi (${sc.duration} sn) korusun; aksiyon, kamera ve replik farklı ve daha iyi olsun. ` +
    (prev ? `Başlangıcı önceki sahnenin bitiş karesine bağlansın: ${prev.endFrame || ''}. ` : 'İlk saniyelerde dikkat çekici bir olay başlasın. ') +
    (next ? `Bitiş karesi sonraki sahnenin başlangıcına bağlansın: ${next.start || ''}. ` : 'Final güçlü olsun. ') + `\nMEVCUT SENARYO:\n${json}`;
}

export function poolPrompt({ brandName, memory, character, categories, examples = [], existing = [], disliked = [], count = 5, category = null, similarTo = null }) {
  return [
    'REELS FİKİR HAVUZU GÖREVİ',
    `Sen '${brandName}' markasının Reels fikir yazarısın. Videolarda ${character} kameraya konuşuyor.`, '',
    'MARKA HAFIZASI:', memory, '',
    'KATEGORİLER:', ...Object.entries(categories).map(([k, v]) => `- ${k}: ${v}`), '',
    similarTo ? `BU FİKRE BENZER, AYNI RUHTA AMA FARKLI ${count} FİKİR İSTENİYOR:\n- ${similarTo}\n` : '',
    examples.length ? `ÖRNEK FİKİRLER (bu tarzda ve kalitede):\n${examples.map(t => `- ${t}`).join('\n')}\n` : '',
    existing.length ? `HAVUZDA ZATEN OLANLAR (tekrar etme):\n${existing.map(t => `- ${t}`).join('\n')}\n` : '',
    disliked.length ? `BEĞENİLMEYENLER (bu tarzda önerme):\n${disliked.map(t => `- ${t}`).join('\n')}\n` : '',
    `GÖREV: ${count} yeni Reels fikri yaz. ${category ? `Hepsi '${category}' kategorisinde olsun.` : 'Her fikre listeden en uygun kategori kimliğini ver.'} Her fikir tek cümle, kısa ve somut: hedef kitlenin 'bu ben' diyeceği tanıdık bir an, şaşırtıcı bir bilgi ya da karakterin başına gelen komik bir olay.`, '',
    `Sadece şu JSON biçiminde yanıt ver: {"ideas": [{"text": "Fikir", "category": "${category || Object.keys(categories)[0]}"}]}`
  ].filter(Boolean).join('\n');
}

export function translatePrompt(text, to, character) {
  return `ÇEVİRİ GÖREVİ\n${to === 'en'
    ? "Aşağıdaki Türkçe video sahne tarifini Google Flow / Veo için doğal ve akıcı İngilizceye çevir. Saniye aralıklarını '0-2s' biçiminde yaz."
    : "Aşağıdaki İngilizce video sahne tarifini doğal ve akıcı Türkçeye çevir. Saniye aralıklarını '0-2 sn' biçiminde yaz."} Sırayı, kamera hareketlerini ve ayrıntıları aynen koru; ekleme veya çıkarma yapma, karakterin görünümünü tarif etme. '${character}' adını aynen kullan. Yalnızca çeviriyi döndür.\n\n${to === 'en' ? 'TÜRKÇE' : 'İNGİLİZCE'}:\n${text}`;
}
