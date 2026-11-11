// 7.1 Sabit prompt kemiği: her prompt türü için model ne olursa olsun aynı kalan yapı.
// Her bölümün adı, modele talimatı ve çıktıda var olup olmadığını anlamak için kaba bir deseni vardır
// (desenler 7.6 kalite kontrolünde kullanılır). Marka kimliği (7.2) bu kemiğin içini doldurur; kemik değişmez.
export const NEGATIVE_TAIL = 'clean composition, no text, no letters, no words, no watermark, no logo, no subtitles, no UI elements';

// test: İngilizce prompt'ta bölümün varlığını yoklayan desen (yoksa bölüm yalnız talimattır, denetlenmez)
const S = {
  subject: { label: 'Özne', ask: 'one tangible main subject (who/what, doing what)' },
  setting: { label: 'Mekân', ask: 'the setting / environment', test: /\b(in|at|on|inside|outdoor|indoor|garden|studio|street|room|cafe|caf[eé]|campus|kitchen|office|background|setting)\b/i },
  shot: { label: 'Çekim ve açı', ask: 'shot type and camera angle; convert camera moves (zoom, pan) into a static composition', test: /\b(close-up|close up|medium shot|wide shot|long shot|full shot|overhead|top-down|low angle|high angle|eye-level|eye level|macro|portrait shot|establishing)\b/i },
  light: { label: 'Işık', ask: 'lighting (direction, quality, time of day)', test: /\b(light|lighting|lit|sunlight|golden hour|softbox|backlit|rim light|glow|shadows?)\b/i },
  lens: { label: 'Lens ve alan derinliği', ask: 'lens and depth of field (e.g. 35mm, f/1.8)', test: /\b(\d{2,3}\s?mm|f\/\d|depth of field|bokeh|shallow focus|macro lens)\b/i },
  palette: { label: 'Renk', ask: 'color palette (use the brand colors where natural)', test: /\b(colou?r|palette|tones?|hues?|warm|cool|pastel|vibrant|muted)\b/i },
  mood: { label: 'Atmosfer', ask: 'atmosphere and mood', test: /\b(atmosphere|mood|feel|vibe|cozy|cinematic|dramatic|serene|energetic|inviting|calm)\b/i },
  style: { label: 'Stil', ask: 'visual style (photorealistic by default unless the brief or brand says otherwise)', test: /\b(photorealistic|realistic|cinematic|film still|3d|illustration|render|animated|animation|watercolor|flat)\b/i },
  negative: { label: 'Yasaklar (kapanış)', ask: `end exactly with: "${NEGATIVE_TAIL}"`, test: /no text[\s\S]*no logo|no logo[\s\S]*no text/i },
  duration: { label: 'Süre', ask: 'duration (e.g. 8 seconds)', test: /\b\d+\s?(s|sec|secs|seconds|saniye|sn)\b/i },
  beats: { label: 'Saniye saniye aksiyon', ask: 'action beats by time (0-3s, 3-6s, …)', test: /\b\d+\s?(?:-|–|to)\s?\d+\s?(?:s|sec|secs|seconds|saniye|sn)\b|\b\d+s\s?[-–:]/i },
  camera: { label: 'Kamera hareketi', ask: 'camera movement (dolly in, pan, tracking, handheld…)', test: /\b(dolly|pan|tracking|handheld|crane|zoom|orbit|tilt|push in|pull back|static camera)\b/i },
  sound: { label: 'Ses', ask: 'sound: ambience, effects, music feel (no voice-over unless asked)', test: /\b(sound|audio|ambien(ce|t)|music|sfx|silence|footsteps|voice)\b/i },
  character: { label: 'Karakter tutarlılığı', ask: 'keep the character exactly as defined (design, proportions, colors, face); describe expression and pose', test: /\b(same|consistent|exactly|identical|keep)\b[\s\S]{0,40}\b(character|mascot|design|face)\b|\b(character|mascot)\b[\s\S]{0,40}\b(same|consistent|unchanged)\b/i },
  nosubs: { label: 'Ekranda yazı yok', ask: 'no on-screen text or subtitles', test: /\bno (on-screen )?(text|subtitles|captions)\b/i }
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
export function skeletonInstruction(kind) {
  const sk = SKELETONS[kind];
  if (!sk) return '';
  const list = sectionsOf(kind).map((s, i) => `${i + 1}) ${s.ask}`).join('; ');
  return [
    `KEMİK (her zaman aynı yapı): ${sk.role} gibi yaz (rol cümlesini prompt'a yazma). Prompt şu bölümleri bu sırayla, tek akıcı metin hâlinde içersin: ${list}.`,
    'Renkleri HEX kodu olarak değil adıyla tarif et (ör. burnt orange, deep navy). Bölüm başlığı (Lighting:, Sound: gibi) yazma.',
    sk.extra || '',
    'Midjourney parametresi (--ar, --v gibi) ekleme; oran istekte geçiyorsa metnin başına yaz (ör. "Vertical 9:16").'
  ].filter(Boolean).join('\n');
}
