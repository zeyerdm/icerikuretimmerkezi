// Kimliği AI ile doldurma: web sitesi metni, Instagram biyografisi ya da tanıtım yazısından marka kimliği taslağı çıkarır.
// Kaydetmez; taslak arayüzde forma doldurulur, kullanıcı kontrol edip kaydeder. Metinde olmayan bilgi uydurulmaz (boş kalır).
import { text, badRequest, HEX } from '../lib/http.js';
import { PROFILE_FIELDS, FONT_OPTIONS } from './brands.js';
import { polish } from './reels/rules.js';

// WCAG göreli parlaklık ve karşıtlık oranı
const lum = hex => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

export function createIdentityService({ ai }) {
  const aiInfo = r => ({ model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) });
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
      return { profile, colors, fonts, notes: polish(o.notes).slice(0, 400), ai: aiInfo(r) };
    },

    // Renk paleti önerisi: kişinin elindeki en az 1 renk sabit kalır, AI 4 ana rengi (ana, ikincil, vurgu, zemin) tamamlar.
    // Yazı renkleri zemine göre okunaklılık (WCAG 4,5:1) ölçülerek kodla düzeltilir; AI'nın seçtiği okunmaz renk kalmaz.
    async palette({ colors: given, brand = {}, modelRef = null, brandId = null } = {}) {
      const fixed = [...new Set((Array.isArray(given) ? given : []).map(c => String(c || '').trim().toLowerCase()).filter(c => HEX.test(c)))].slice(0, 3);
      if (!fixed.length) throw badRequest('Öneri için en az 1 renk seç (ör. logodaki ana renk).');
      const about = [['Marka', brand.name], ['Sektör', brand.sector], ['Karakter', brand.character], ['Kitle', brand.audience]]
        .map(([k, v]) => [k, String(v || '').trim().slice(0, 300)]).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
      const prompt = [
        'MARKA RENK PALETİ ÖNERİSİ',
        `Markanın elindeki renk(ler): ${fixed.join(', ')}. Bu renkler DEĞİŞMEZ; her palette aynen yer alır (ilki ana renk olarak).`,
        'Bu renklerle uyumlu, sosyal medya tasarımlarında kullanılacak 3 farklı palet öner. Her palet 4 ana renkten oluşur:',
        '- primary: ana renk (markanın elindeki ilk renk)', '- secondary: ikincil renk (ana rengi destekler)', '- accent: vurgu rengi (buton, etiket, dikkat çeken yerler)', '- background: zemin rengi (tasarımların arka planı; çoğunlukla açık ve sade)',
        'Ayrıca heading (başlık yazısı) ve body (gövde yazısı) renklerini zemin üzerinde okunacak şekilde seç.',
        'Paletler birbirinden belirgin farklı olsun (ör. biri sakin ve kurumsal, biri canlı, biri sıcak/doğal). Her renge kısa Türkçe ad ver; "why" alanında paletin markaya neden uyduğunu 1 cümleyle anlat.',
        about ? `\nMARKA:\n${about}` : '', '',
        'Sadece şu JSON biçiminde yanıt ver (HEX kodları #RRGGBB):',
        JSON.stringify({ palettes: [{ name: 'Palet adı', why: '', primary: { hex: '', name: '' }, secondary: { hex: '', name: '' }, accent: { hex: '', name: '' }, background: { hex: '', name: '' }, heading: '', body: '' }] })
      ].join('\n');
      const r = await ai.run({ task: 'yazim', brandId, prompt, json: true, modelRef, temperature: 0.7 });
      const out = [];
      for (const p of (r.output && Array.isArray(r.output.palettes) ? r.output.palettes : []).slice(0, 4)) {
        const c = k => { const v = p && p[k]; const hex = String((v && typeof v === 'object' ? v.hex : v) || '').trim().toLowerCase(); return HEX.test(hex) ? { hex, name: polish(v && v.name || '').slice(0, 40) } : null; };
        const pal = { name: polish(p.name || '').slice(0, 60) || `Palet ${out.length + 1}`, why: polish(p.why || '').slice(0, 300), primary: c('primary'), secondary: c('secondary'), accent: c('accent'), background: c('background') };
        if (!pal.secondary || !pal.accent) continue;
        // Kişinin renkleri sabit: ilki ana renk, diğerleri ikincil/vurgu yerine geçer
        pal.primary = { hex: fixed[0], name: pal.primary && pal.primary.hex === fixed[0] ? pal.primary.name : 'Marka rengi' };
        if (fixed[1] && ![pal.secondary.hex, pal.accent.hex].includes(fixed[1])) pal.secondary = { hex: fixed[1], name: 'Marka rengi 2' };
        if (fixed[2] && ![pal.secondary.hex, pal.accent.hex].includes(fixed[2])) pal.accent = { hex: fixed[2], name: 'Marka rengi 3' };
        if (!pal.background) pal.background = { hex: '#ffffff', name: 'Beyaz' };
        const bg = pal.background.hex;
        const text = (v, fb) => { const h = String(v || '').trim().toLowerCase(); return HEX.test(h) && contrast(h, bg) >= 4.5 ? h : fb; };
        const dark = contrast('#1b1f3b', bg) >= contrast('#ffffff', bg);
        pal.heading = text(typeof p.heading === 'object' ? p.heading && p.heading.hex : p.heading, dark ? '#1b1f3b' : '#ffffff');
        pal.body = text(typeof p.body === 'object' ? p.body && p.body.hex : p.body, dark ? '#3a3f63' : '#f1f2f8');
        out.push(pal);
      }
      if (!out.length) throw badRequest('Yapay zekâ geçerli bir palet döndürmedi. Tekrar dene.');
      return { palettes: out.slice(0, 3), fixed, ai: aiInfo(r) };
    }
  };
}
