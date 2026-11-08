// Kimliği AI ile doldurma: web sitesi metni, Instagram biyografisi ya da tanıtım yazısından marka kimliği taslağı çıkarır.
// Kaydetmez; taslak arayüzde forma doldurulur, kullanıcı kontrol edip kaydeder. Metinde olmayan bilgi uydurulmaz (boş kalır).
import { text, badRequest, HEX } from '../lib/http.js';
import { PROFILE_FIELDS, FONT_OPTIONS } from './brands.js';
import { polish } from './reels/rules.js';

export function createIdentityService({ ai }) {
  return {
    async draft({ text: raw, modelRef = null, brandId = null } = {}) {
      const source = text(raw, { field: 'Metin', max: 20000, required: true });
      if (source.length < 40) throw badRequest('Biraz daha uzun bir metin yapıştır (en az birkaç cümle): web sitesindeki "Hakkımızda" yazısı ya da Instagram biyografisi gibi.');
      const fields = Object.entries(PROFILE_FIELDS).map(([k, f]) => `- ${k}: ${f.label} (en fazla ${f.max} karakter)`).join('\n');
      const prompt = [
        'MARKA KİMLİĞİ ÇIKARMA',
        'Aşağıdaki metin bir markanın web sitesinden, Instagram biyografisinden ya da tanıtım yazısından alındı. Bu metinden markanın dijital kimlik taslağını çıkar.',
        'Kurallar: Yalnızca metinden çıkarılabilen ya da açıkça sezilebilen bilgileri yaz; emin olmadığın alanı boş bırak ("" yaz), uydurma. Türkçe yaz.',
        '"character" markanın kişiliğini (ör. samimi, esprili, güven veren), "tone" iletişim dilini (hitap biçimi, emoji kullanımı, cümle uzunluğu), "goals" içerik üretim hedeflerini (ör. bilinirlik, öğrenci müşteri çekmek) anlatsın; "audience" hedef kitleyi somut tarif etsin.',
        `Renkler yalnızca metinde HEX kodu olarak geçiyorsa yaz. Font yalnızca metinde adı geçiyorsa ve şu listede varsa yaz: ${FONT_OPTIONS.join(', ')}.`,
        '', 'ALANLAR:', fields, '',
        `METİN:\n"""\n${source}\n"""`, '',
        'Sadece şu JSON biçiminde yanıt ver:',
        JSON.stringify({ profile: Object.fromEntries(Object.keys(PROFILE_FIELDS).map(k => [k, ''])), colors: { primary: '', secondary: [] }, fonts: { heading: '', body: '' }, notes: 'Hangi bilgilerin metinde olmadığı, kısaca' })
      ].join('\n');
      const r = await ai.run({ task: 'yazim', brandId, prompt, json: true, modelRef, temperature: 0.3 });
      const o = r.output || {};
      const profile = {};
      for (const [k, f] of Object.entries(PROFILE_FIELDS)) {
        const v = String((o.profile && o.profile[k]) || '').trim().slice(0, f.max);
        if (v) profile[k] = k === 'name' || k === 'slogan' || k === 'sector' ? polish(v) : v;
      }
      const colors = {};
      if (o.colors && HEX.test(String(o.colors.primary || ''))) colors.primary = o.colors.primary.toLowerCase();
      const sec = (Array.isArray(o.colors && o.colors.secondary) ? o.colors.secondary : []).filter(c => HEX.test(String(c))).map(c => c.toLowerCase()).slice(0, 6);
      if (sec.length) colors.secondary = sec;
      const pick = v => FONT_OPTIONS.find(f => f.toLowerCase() === String(v || '').toLowerCase());
      const fonts = {};
      if (pick(o.fonts && o.fonts.heading)) fonts.heading = pick(o.fonts.heading);
      if (pick(o.fonts && o.fonts.body)) fonts.body = pick(o.fonts.body);
      return { profile, colors, fonts, notes: polish(o.notes).slice(0, 400), ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) } };
    }
  };
}
