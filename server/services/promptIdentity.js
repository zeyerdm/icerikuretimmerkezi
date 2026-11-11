// 7.2 Marka prompt kişiliği: marka bir kez sorulara ve işaretlemelere cevap verir; cevaplar her prompt üretimine
// "MARKA PROMPT KİMLİĞİ" olarak girer (7.1 kemiğinin içini doldurur). Sorular sabittir, cevaplar markaya özeldir.
import { badRequest, parseJson } from '../lib/http.js';

// type: one (tek seçim), many (çoklu seçim), text (kısa metin), list (virgülle ayrılmış liste), bool
export const IDENTITY_QUESTIONS = [
  { key: 'visualStyle', group: 'Görsel dil', label: 'Görsellerin stili ne olsun?', type: 'one', options: { gercekci: 'Gerçekçi fotoğraf', sinematik: 'Sinematik film karesi', '3d': '3D animasyon', '2d': '2D çizim / illüstrasyon', minimal: 'Minimal / sade grafik' }, en: { gercekci: 'photorealistic photography', sinematik: 'cinematic film still', '3d': '3D animation, soft shading', '2d': '2D illustration', minimal: 'minimal clean graphic style' } },
  { key: 'lighting', group: 'Görsel dil', label: 'Işık tercihi', type: 'one', options: { dogal: 'Aydınlık, doğal gün ışığı', altin: 'Sıcak, altın saat', dramatik: 'Sinematik, dramatik kontrast', studyo: 'Stüdyo ışığı, temiz', neon: 'Gece, neon' }, en: { dogal: 'bright natural daylight', altin: 'warm golden hour light', dramatik: 'cinematic high-contrast lighting', studyo: 'clean studio lighting', neon: 'night-time neon lighting' } },
  { key: 'camera', group: 'Görsel dil', label: 'Kamera dili', type: 'one', options: { yakin: 'Yakın plan ağırlıklı', orta: 'Orta plan, insan odaklı', genis: 'Geniş plan, mekân odaklı', karisik: 'Karışık' }, en: { yakin: 'mostly close-up shots', orta: 'medium shots focused on people', genis: 'wide establishing shots', karisik: 'a mix of shot sizes' } },
  { key: 'colors', group: 'Görsel dil', label: 'Marka renkleri görsellerde nasıl kullanılsın?', type: 'one', options: { vurgu: 'Küçük vurgular olarak', baskin: 'Baskın renk olarak', yok: 'Kullanılmasın, doğal renkler' } },
  { key: 'mood', group: 'His', label: 'Görseller nasıl hissettirsin? (birden çok seçilebilir)', type: 'many', options: { samimi: 'Samimi', enerjik: 'Enerjik', sakin: 'Sakin', luks: 'Lüks', eglenceli: 'Eğlenceli', profesyonel: 'Profesyonel', nostaljik: 'Nostaljik' }, en: { samimi: 'warm and friendly', enerjik: 'energetic', sakin: 'calm', luks: 'premium and luxurious', eglenceli: 'playful', profesyonel: 'professional', nostaljik: 'nostalgic' } },
  { key: 'places', group: 'His', label: 'Sık kullanılan mekânlar', type: 'list', hint: 'Virgülle ayır: ör. kafe içi, kampüs bahçesi, mutfak' },
  { key: 'people', group: 'His', label: 'Görsellerde insanlar kimler olsun?', type: 'text', hint: 'Ör. 20\'li yaşlarda üniversite öğrencileri, gündelik giyim' },
  { key: 'avoid', group: 'His', label: 'Görsellerde asla olmasın', type: 'list', hint: 'Ör. alkol, karanlık mekân, kalabalık' },
  { key: 'hasMascot', group: 'Maskot', label: 'Markanın bir maskotu var mı?', type: 'bool' },
  { key: 'mascotName', group: 'Maskot', label: 'Maskotun adı', type: 'text', when: 'hasMascot' },
  { key: 'mascotLook', group: 'Maskot', label: 'Maskot nasıl görünüyor?', type: 'text', when: 'hasMascot', hint: 'Ör. kahve çekirdeği şeklinde, turuncu, kocaman gözlü, kırmızı atkılı' },
  { key: 'mascotVoice', group: 'Maskot', label: 'Maskot nasıl konuşur?', type: 'text', when: 'hasMascot', hint: 'Ör. kısa cümleler, esprili, "kanka" diye hitap eder' },
  { key: 'mascotMoves', group: 'Maskot', label: 'Maskot nasıl hareket eder?', type: 'text', when: 'hasMascot', hint: 'Ör. zıplayarak yürür, el sallar' },
  { key: 'mascotNever', group: 'Maskot', label: 'Maskot asla ne yapmaz?', type: 'text', when: 'hasMascot', hint: 'Ör. kötü söz söylemez, üzgün görünmez' }
];
const Q = Object.fromEntries(IDENTITY_QUESTIONS.map(q => [q.key, q]));
const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export function cleanIdentity(body = {}) {
  const out = {};
  for (const q of IDENTITY_QUESTIONS) {
    const v = body[q.key];
    if (v == null || v === '') continue;
    if (q.type === 'one') { if (!q.options[v]) throw badRequest(`"${q.label}" için geçersiz seçim.`); out[q.key] = v; }
    else if (q.type === 'many') { const list = (Array.isArray(v) ? v : [v]).filter(x => q.options[x]); if (list.length) out[q.key] = [...new Set(list)]; }
    else if (q.type === 'list') { const list = (Array.isArray(v) ? v : String(v).split(',')).map(x => clip(x, 60)).filter(Boolean).slice(0, 12); if (list.length) out[q.key] = list; }
    else if (q.type === 'bool') out[q.key] = v === true || v === 'true' || v === 1;
    else { const t = clip(v, 300); if (t) out[q.key] = t; }
  }
  if (!out.hasMascot) for (const q of IDENTITY_QUESTIONS) if (q.when === 'hasMascot') delete out[q.key];
  return out;
}

// Prompt istemine giren metin (boşsa boş): seçimlerin İngilizce karşılıkları + serbest cevaplar
export function identityBlock(idt, kind = 'gorsel') {
  if (!idt || !Object.keys(idt).length) return '';
  const en = (k, v) => (Q[k].en && Q[k].en[v]) || Q[k].options[v];
  const lines = [];
  if (idt.visualStyle) lines.push(`Görsel stil (varsayılan stilin yerine geçer): ${en('visualStyle', idt.visualStyle)}`);
  if (idt.lighting) lines.push(`Işık: ${en('lighting', idt.lighting)}`);
  if (idt.camera) lines.push(`Kamera dili: ${en('camera', idt.camera)}`);
  if (idt.colors) lines.push(`Marka renkleri: ${Q.colors.options[idt.colors]}`);
  if (idt.mood) lines.push(`His: ${idt.mood.map(m => en('mood', m)).join(', ')}`);
  if (idt.places) lines.push(`Tercih edilen mekânlar: ${idt.places.join(', ')}`);
  if (idt.people) lines.push(`İnsanlar: ${idt.people}`);
  if (idt.avoid) lines.push(`Görselde asla olmasın: ${idt.avoid.join(', ')}`);
  if (idt.hasMascot && ['maskot', 'video', 'reels', 'gorsel', 'post', 'reklam'].includes(kind)) {
    const m = [idt.mascotName && `adı ${idt.mascotName}`, idt.mascotLook && `görünüş: ${idt.mascotLook}`, idt.mascotVoice && `konuşma: ${idt.mascotVoice}`, idt.mascotMoves && `hareket: ${idt.mascotMoves}`, idt.mascotNever && `asla: ${idt.mascotNever}`].filter(Boolean);
    if (m.length) lines.push(`Maskot (yalnız sahnede maskot varsa ya da istekte geçiyorsa kullan; tasarımını değiştirme): ${m.join('; ')}`);
  }
  return lines.length ? 'MARKA PROMPT KİMLİĞİ (markanın kalıcı tercihleri; istek aksini söylemedikçe uygula):\n- ' + lines.join('\n- ') : '';
}

export function createPromptIdentityService({ db, brands }) {
  return {
    questions: IDENTITY_QUESTIONS,
    get(brandId) {
      const b = brands.get(brandId);
      return parseJson((db.prepare('SELECT prompt_identity FROM brands WHERE id = ?').get(b.id) || {}).prompt_identity, {}) || {};
    },
    set(brandId, body) {
      const b = brands.get(brandId);
      const idt = cleanIdentity(body);
      db.prepare('UPDATE brands SET prompt_identity = ? WHERE id = ?').run(JSON.stringify(idt), b.id);
      brands.logActivity(b.id, 'prompt.identity', 'Prompt kimliği güncellendi');
      return idt;
    },
    block(brandId, kind) { return identityBlock(this.get(brandId), kind); }
  };
}
