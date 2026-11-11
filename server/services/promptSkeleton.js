// 7.1 Sabit prompt kemiği: her prompt türü için model ne olursa olsun aynı kalan yapı.
// Her bölümün adı, modele talimatı ve çıktıda var olup olmadığını anlamak için kaba bir deseni vardır
// (desenler 7.6 kalite kontrolünde kullanılır). Marka kimliği (7.2) bu kemiğin içini doldurur; kemik değişmez.
export const NEGATIVE_TAIL = 'clean composition, no text, no letters, no words, no watermark, no logo, no subtitles, no UI elements';
export const NEGATIVE_TAIL_TR = 'temiz kompozisyon, yazı yok, harf yok, kelime yok, filigran yok, logo yok, altyazı yok, arayüz öğesi yok';

// test: İngilizce prompt'ta bölümün varlığını yoklayan desen (yoksa bölüm yalnız talimattır, denetlenmez)
const S = {
  subject: { label: 'Özne', ask: 'one tangible main subject (who/what, doing what)' },
  setting: { label: 'Mekân', ask: 'the setting / environment', test: /\b(in|at|on|inside|outdoor|indoor|garden|studio|street|room|cafe|caf[eé]|campus|kitchen|office|background|setting)\b/i, tr: /(içinde|bahçe|mutfak|kafe|stüdyo|sokak|oda|ofis|kampüs|arka ?plan|mekân|ortam|masa|tezgâh|tezgah|park|sahil|salon)/i },
  shot: { label: 'Çekim ve açı', ask: 'shot type and camera angle; convert camera moves (zoom, pan) into a static composition', test: /\b(close-up|close up|medium shot|wide shot|long shot|full shot|overhead|top-down|low angle|high angle|eye-level|eye level|macro|portrait shot|establishing)\b/i, tr: /(yakın plan|yakın çekim|orta plan|geniş plan|boy plan|tepeden|kuş bakışı|alt açı|üst açı|alçak açı|göz hizası|makro|detay çekim)/i },
  light: { label: 'Işık', ask: 'lighting (direction, quality, time of day)', test: /\b(light|lighting|lit|sunlight|golden hour|softbox|backlit|rim light|glow|shadows?)\b/i, tr: /(ışık|aydınlık|güneş|altın saat|gölge|parıltı|softbox|arka ışık|kenar ışığı)/i },
  lens: { label: 'Lens ve alan derinliği', ask: 'lens and depth of field (e.g. 35mm, f/1.8)', test: /\b(\d{2,3}\s?mm|f\/\d|depth of field|bokeh|shallow focus|macro lens)\b/i, tr: /(\d{2,3}\s?mm|f\/\d|alan derinliği|bokeh|sığ odak|lens)/i },
  palette: { label: 'Renk', ask: 'color palette (use the brand colors where natural)', test: /\b(colou?r|palette|tones?|hues?|warm|cool|pastel|vibrant|muted)\b/i, tr: /(renk|palet|ton|sıcak|soğuk|pastel|canlı|turuncu|mavi|yeşil|kırmızı|krem|kahverengi)/i },
  mood: { label: 'Atmosfer', ask: 'atmosphere and mood', test: /\b(atmosphere|mood|feel|vibe|cozy|cinematic|dramatic|serene|energetic|inviting|calm)\b/i, tr: /(atmosfer|his|hava|samimi|sinematik|dramatik|sakin|enerjik|huzurlu|davetkâr|davetkar|neşeli)/i },
  style: { label: 'Stil', ask: 'visual style (photorealistic by default unless the brief or brand says otherwise)', test: /\b(photorealistic|realistic|cinematic|film still|3d|illustration|render|animated|animation|watercolor|flat)\b/i, tr: /(gerçekçi|fotoğraf|sinematik|film karesi|3d|illüstrasyon|animasyon|çizim|render)/i },
  negative: { label: 'Yasaklar (kapanış)', ask: `end exactly with: "${NEGATIVE_TAIL}"`, test: /no text[\s\S]*no logo|no logo[\s\S]*no text/i, tr: /yazı yok[\s\S]*logo yok|logo yok[\s\S]*yazı yok/i },
  duration: { label: 'Süre', ask: 'duration (e.g. 8 seconds)', test: /\b\d+\s?(s|sec|secs|seconds|saniye|sn)\b/i, tr: /\b\d+\s?(saniye|sn)\b/i },
  beats: { label: 'Saniye saniye aksiyon', ask: 'action beats by time (0-3s, 3-6s, …)', test: /\b\d+\s?(?:-|–|to)\s?\d+\s?(?:s|sec|secs|seconds|saniye|sn)\b|\b\d+s\s?[-–:]/i, tr: /\b\d+\s?[-–]\s?\d+\s?(sn|saniye|s)\b|\b\d+\.\s?saniye/i },
  camera: { label: 'Kamera hareketi', ask: 'camera movement (dolly in, pan, tracking, handheld…)', test: /\b(dolly|pan|panning|tracking|handheld|crane|zoom|orbit|tilt|push[- ]in|pull[- ]back|static camera|camera (slowly )?(moves|glides|pushes|pulls))\b/i, tr: /(kamera|dolly|pan|takip çekimi|yaklaş|uzaklaş|el kamerası|sabit kamera|vinç|kaydır)/i },
  sound: { label: 'Ses', ask: 'sound: ambience, effects, music feel (no voice-over unless asked)', test: /\b(sound|audio|ambien(ce|t)|music|sfx|silence|footsteps|voice)\b/i, tr: /(ses|müzik|ambiyans|efekt|sessizlik)/i },
  character: { label: 'Karakter tutarlılığı', ask: 'keep the character exactly as defined (design, proportions, colors, face); describe expression and pose', test: /\b(same|consistent|exactly|identical|keep)\b[\s\S]{0,40}\b(character|mascot|design|face)\b|\b(character|mascot)\b[\s\S]{0,40}\b(same|consistent|unchanged)\b/i, tr: /(aynı|tutarlı|değiştirmeden|birebir)[\s\S]{0,40}(karakter|maskot|tasarım|yüz)|(karakter|maskot)[\s\S]{0,40}(aynı|tutarlı|değişmeden)/i },
  nosubs: { label: 'Ekranda yazı yok', ask: 'no on-screen text or subtitles', test: /\bno (on-screen )?(text|subtitles|captions)\b/i, tr: /(yazı|altyazı)[^.]{0,30}(yok|olmasın|olmayacak|olmaz|bulunmuyor|bulunmaz|bulunmasın|olmadan|içermez|yer almaz|görünmez)/i }
};

const STILL = ['subject', 'setting', 'shot', 'light', 'lens', 'palette', 'mood', 'style', 'negative'];
export const SKELETONS = {
  gorsel: { role: 'a Hollywood cinematographer and Midjourney/Flux prompt engineer', sections: STILL, minWords: 45 },
  urun: { role: 'a commercial product photographer', sections: ['subject', 'setting', 'light', 'shot', 'lens', 'palette', 'mood', 'negative'], minWords: 40 },
  reklam: { role: 'an advertising art director', sections: [...STILL.slice(0, -1), 'negative'], extra: 'Leave clean negative space for the headline; the product or benefit is the visual focus.', minWords: 45 },
  post: { role: 'a social media art director', sections: STILL, extra: 'Leave clean negative space where the post text will be placed.', minWords: 40 },
  video: { role: 'a film director writing for Veo / Flow', sections: ['duration', 'subject', 'setting', 'beats', 'camera', 'light', 'sound', 'style', 'nosubs'], minWords: 50 },
  maskot: { role: 'an animation director keeping a brand mascot on-model', sections: ['character', 'duration', 'setting', 'beats', 'camera', 'sound', 'style', 'nosubs'], minWords: 45 }
};

export const sectionsOf = kind => (SKELETONS[kind] ? SKELETONS[kind].sections.map(k => Object.assign({ key: k }, S[k])) : []);

// Modele giden tarif: rol + bölümlerin sırası; kemik bütün modellerde aynıdır
export function skeletonInstruction(kind, lang = 'en') {
  const sk = SKELETONS[kind];
  if (!sk) return '';
  const list = sectionsOf(kind).map((s, i) => `${i + 1}) ${s.key === 'negative' && lang === 'tr' ? `şu kapanışla bitir: "${NEGATIVE_TAIL_TR}"` : s.ask}`).join('; ');
  return [
    `KEMİK (her zaman aynı yapı): ${sk.role} gibi yaz (rol cümlesini prompt'a yazma). Prompt şu bölümleri bu sırayla, tek akıcı metin hâlinde içersin: ${list}.`,
    'Renkleri HEX kodu olarak değil adıyla tarif et (ör. burnt orange, deep navy). Bölüm başlığı (Lighting:, Sound: gibi) yazma.',
    lang === 'tr' ? 'DİL: Bölüm tarifleri İngilizce verildi ama prompt\'un TAMAMINI TÜRKÇE yaz; İngilizce cümle ya da terim kullanma (yakın plan, orta plan, alt açı, altın saat ışığı, sığ alan derinliği gibi). Oran istekte yoksa yazma.' : '',
    sk.extra || '',
    'Midjourney parametresi (--ar, --v gibi) ekleme; oran istekte geçiyorsa metnin başına yaz (ör. "Vertical 9:16").'
  ].filter(Boolean).join('\n');
}
