// 7.10 Üretim aracına göre çıktı biçimi: aynı kemik (7.1), seçilen araca uygun biçimde yazılır ve verilir.
// Yazım ipucu (uzunluk, üslup) isteme girer; oran yazımı ve negatif prompt alanı ise kodla, kopyalanacak çıktıda ayarlanır.
import { NEGATIVE_TAIL } from './promptSkeleton.js';

// aspect: param (--ar), text (metnin sonunda cümle), setting (aracın ayarından seçilir)
// negative: param (--no), field (ayrı negatif prompt alanı), inline (metnin içinde kalır)
export const TOOLS = {
  midjourney: { label: 'Midjourney', media: 'image', maxWords: 60, aspect: 'param', negative: 'param', write: 'Midjourney için: kısa ve yoğun yaz (en çok ~60 kelime); özne ve stil en başta, virgülle ayrılmış öbekler olabilir.' },
  imagen: { label: 'Imagen', media: 'image', maxWords: 120, aspect: 'setting', negative: 'inline', write: 'Imagen için: doğal, betimleyici cümlelerle yaz (en çok ~120 kelime); fotoğraf terimlerini (lens, ışık) açıkça belirt.' },
  nanobanana: { label: 'Nano Banana (Gemini)', media: 'image', maxWords: 150, aspect: 'text', negative: 'inline', write: 'Nano Banana için: sahneyi bir fotoğrafçıya anlatır gibi tam cümlelerle yaz; anahtar kelime listesi yapma.' },
  gptimage: { label: 'GPT Image', media: 'image', maxWords: 150, aspect: 'setting', negative: 'inline', write: 'GPT Image için: ayrıntılı, açık cümlelerle yaz; öğelerin birbirine göre konumunu (önde, solda, arkada) belirt.' },
  veo: { label: 'Veo / Flow', media: 'video', maxWords: 150, aspect: 'setting', negative: 'inline', write: 'Veo / Flow için: zaman akışını (0-4 sn, 4-8 sn) ve sesi (ortam sesi, müzik, diyalog) açıkça yaz.' },
  kling: { label: 'Kling', media: 'video', maxWords: 80, aspect: 'setting', negative: 'field', write: 'Kling için: kısa ve net yaz (en çok ~80 kelime); tek ana hareket ve açık bir kamera hareketi; yasakları metne yazma, ayrı negatif prompt alanına gider.' }
};
export const KIND_MEDIA = { gorsel: 'image', urun: 'image', reklam: 'image', post: 'image', video: 'video', maskot: 'video' };
export const DEFAULT_ASPECT = { gorsel: '1:1', urun: '1:1', reklam: '4:5', post: '4:5', video: '16:9', maskot: '9:16' };
export const ASPECTS = ['1:1', '4:5', '9:16', '16:9', '3:2', '2:3'];

const NEG_IMAGE = 'text, letters, words, watermark, logo, subtitles, UI elements';
const NEG_VIDEO = 'on-screen text, subtitles, captions, watermark, logo, blur, distortion, flicker';

export const toolsFor = kind => Object.fromEntries(Object.entries(TOOLS).filter(([, t]) => t.media === KIND_MEDIA[kind]));
export const validTool = (kind, tool) => Boolean(tool && TOOLS[tool] && TOOLS[tool].media === KIND_MEDIA[kind]);

// Yazım isteğine giren satır (boşsa boş)
export function toolInstruction(kind, tool) {
  if (!validTool(kind, tool)) return '';
  return `HEDEF ARAÇ: ${TOOLS[tool].write} Oran ve yasak listesi araç biçimine sonradan kodla eklenir.`;
}

const words = t => String(t || '').split(/\s+/).filter(Boolean).length;
// Kemiğin yasak kapanışı (ve ayırıcıları) metinden çıkarılır; param/field araçlarında ayrı verilir
const stripTail = t => {
  const esc = NEGATIVE_TAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(t || '').replace(new RegExp(`[\\s,.;:]*${esc}[\\s.]*$`, 'i'), '').replace(/[\s,;]+$/, '').trim();
};

// Kopyalanacak çıktı: { main, negative, params, full, notes }
export function toolOutput(kind, tool, text, aspect) {
  if (!validTool(kind, tool)) return null;
  const t = TOOLS[tool];
  const ar = ASPECTS.includes(aspect) ? aspect : DEFAULT_ASPECT[kind];
  const negList = t.media === 'video' ? NEG_VIDEO : NEG_IMAGE;
  const notes = [];
  let main = String(text || '').trim();
  let negative = '';
  let params = '';
  if (t.negative === 'param' || t.negative === 'field') main = stripTail(main);
  if (t.negative === 'field') negative = negList;
  if (t.aspect === 'param') params = `--ar ${ar}`;
  if (t.negative === 'param') params = `${params} --no ${negList}`.trim();
  if (t.aspect === 'text') main = `${main.replace(/\s+$/, '')}${/[.!?]$/.test(main) ? '' : '.'} Aspect ratio ${ar}.`;
  if (t.aspect === 'setting') notes.push(`Oranı ${t.label} ayarlarından seç: ${ar}.`);
  if (t.negative === 'field') notes.push('Negatif prompt\'u aracın "Negative prompt" alanına yapıştır.');
  const n = words(main);
  if (n > t.maxWords * 1.25) notes.push(`${n} kelime; ${t.label} için uzun (önerilen en çok ~${t.maxWords}). "Kısalt" ile kısaltabilirsin.`);
  const full = [main, params].filter(Boolean).join(' ');
  return { tool, label: t.label, aspect: ar, main, negative, params, full, words: n, notes };
}
