// LinkedIn yazısı: marka hafızasıyla (web sitesinden gelen bilgiler dahil) LinkedIn'e özgü metin postu yazar ya da hazır bir
// içeriği (post tasarımı, Reels senaryosu, takvim içeriği, fikir, serbest metin) LinkedIn diline uyarlar.
// Kurallar kodla denetlenir: ilk satır kanca ("…daha fazla"dan önce görünen kısım), uzunluk, 3-5 hashtag.
// Kaydedilen yazı takvimde "LinkedIn yazısı" içeriği olur (açıklama = metin); tarih verilmezse taslak kalır.
import { badRequest, parseJson, text } from '../lib/http.js';
import { polish } from './reels/rules.js';
import { markIdeaUsed } from './ideas.js';

export const LINKEDIN_VOICES = { sirket: 'Şirket sayfası', kisisel: 'Kurucu / yönetici adına' };
export const LINKEDIN_LIMITS = { fold: 210, min: 900, target: [1300, 2000], max: 2200, hashtags: [3, 5] };

// Kaynak içerikten okunacak metin
function sourceText(db, { posts, prompts, workspace, ideas }, brandId, kind, id) {
  if (kind === 'post') {
    const p = db.prepare('SELECT title, data FROM posts WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!p) throw badRequest('Uyarlanacak tasarım bulunamadı.');
    const d = parseJson(p.data, {});
    const lines = (d.slides || []).map((s, i) => `${i + 1}. sayfa: ${(s.layers || []).filter(l => l.type === 'text' && String(l.text || '').trim()).map(l => String(l.text).trim()).join(' — ')}`);
    return { title: p.title, text: `POST TASARIMI "${p.title}":\n${lines.join('\n')}${d.caption ? `\nAÇIKLAMA: ${d.caption}` : ''}` };
  }
  if (kind === 'prompt') {
    const p = prompts.get(brandId, id);
    const plan = p.plan || {};
    const lines = (plan.scenes || []).map((s, i) => `${i + 1}. sahne: ${s.line || ''}`).join('\n');
    return { title: p.title, text: `REELS SENARYOSU "${p.title}":${plan.punchline ? `\nAsıl fikir: ${plan.punchline}` : ''}\n${lines}${plan.caption ? `\nINSTAGRAM AÇIKLAMASI: ${plan.caption}` : ''}`.slice(0, 5000) };
  }
  if (kind === 'content') {
    const c = workspace.getContent(id);
    if (c.brandId !== brandId) throw badRequest('İçerik bu markaya ait değil.');
    return { title: c.title, text: `TAKVİM İÇERİĞİ "${c.title}" (${c.typeLabel})${c.notes ? `\nNot: ${c.notes}` : ''}${c.caption ? `\nAÇIKLAMA: ${c.caption}` : ''}` };
  }
  if (kind === 'idea') {
    const i = db.prepare('SELECT title, description FROM ideas WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!i) throw badRequest('Fikir bulunamadı.');
    return { title: i.title, text: `FİKİR: ${i.title}${i.description ? `\n${i.description}` : ''}` };
  }
  throw badRequest('Geçersiz kaynak.');
}

export function checkLinkedin(t, hashtags) {
  const s = String(t || '');
  const issues = [];
  const first = s.split('\n').find(l => l.trim()) || '';
  if (first.length > LINKEDIN_LIMITS.fold) issues.push(`İlk satır ${first.length} karakter: "…daha fazla"dan önce görünen kısım kabaca ${LINKEDIN_LIMITS.fold} karakter; kancayı kısalt.`);
  if (s.length < LINKEDIN_LIMITS.min) issues.push(`Metin ${s.length} karakter; LinkedIn'de ${LINKEDIN_LIMITS.target[0]}-${LINKEDIN_LIMITS.target[1]} karakter daha iyi çalışır.`);
  if (s.length > LINKEDIN_LIMITS.max) issues.push(`Metin ${s.length} karakter; ${LINKEDIN_LIMITS.max} sınırını aşıyor.`);
  if (/\n[^\n]{450,}/.test('\n' + s)) issues.push('Çok uzun paragraf var; LinkedIn\'de 1-3 cümlelik kısa paragraflar okunur.');
  const n = (hashtags || []).length;
  if (n < LINKEDIN_LIMITS.hashtags[0] || n > LINKEDIN_LIMITS.hashtags[1]) issues.push(`Hashtag sayısı ${n}; ${LINKEDIN_LIMITS.hashtags.join('-')} arası önerilir.`);
  return issues;
}

const cleanTags = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,]+/)).map(h => polish(String(h)).replace(/^#*/, '').replace(/\s+/g, '')).filter(h => h.length > 1).map(h => '#' + h.slice(0, 40)))];

export function createLinkedinService({ db, ai, brands, posts, prompts, workspace, ideas }) {
  return {
    voices: LINKEDIN_VOICES,
    limits: LINKEDIN_LIMITS,

    async write(brandId, { brief = '', voice = 'sirket', person = '', source = null, modelRef = null } = {}) {
      const b = brands.get(brandId);
      if (!LINKEDIN_VOICES[voice]) throw badRequest('Geçersiz ses seçimi.');
      const topic = String(brief || '').trim().slice(0, 2000);
      let src = null;
      if (source && source.kind) src = sourceText(db, { posts, prompts, workspace, ideas }, b.id, String(source.kind), String(source.id || ''));
      if (!topic && !src) throw badRequest('Bir konu yaz ya da uyarlanacak bir içerik seç.');
      const who = String(person || '').trim().slice(0, 120);
      const prompt = [
        `Sen '${b.name}' markasının LinkedIn içerik yazarısın.`, '', 'MARKA HAFIZASI:', brands.memory(b.id), '',
        voice === 'kisisel'
          ? `SES: ${who ? `${who} adına` : 'Markanın kurucusu/yöneticisi adına'}, birinci tekil şahıs ("ben", "ekibimizle"). Kişisel deneyim, öğrenilen ders, sektör gözlemi; samimi ama profesyonel. Satış dili kullanma.`
          : 'SES: Şirket sayfası, birinci çoğul şahıs ("biz"). Uzmanlık, değer ve güven veren; kurumsal ama soğuk olmayan bir dil. Doğrudan satış yapma; bilgi ve içgörü ver.',
        '',
        src ? `UYARLANACAK İÇERİK (aynı fikri LinkedIn'e göre baştan yaz; Instagram dilini, emoji yığınını ve "link bio'da" gibi ifadeleri kullanma):\n${src.text}` : '',
        topic ? `KONU / NOT: ${topic}` : '',
        '',
        'LINKEDIN KURALLARI:',
        `- İlk satır kanca: en fazla ${LINKEDIN_LIMITS.fold - 60} karakter; merak uyandıran bir gözlem, rakam ya da karşı görüş. "…daha fazla"ya tıklatmalı.`,
        '- Hemen ardından boş satır. Sonra 1-3 cümlelik kısa paragraflar, aralarında boş satır.',
        `- Toplam ${LINKEDIN_LIMITS.target[0]}-${LINKEDIN_LIMITS.target[1]} karakter. Gerekirse 3-5 maddelik kısa bir liste (• ya da 1., 2.).`,
        '- Somut ol: markanın gerçek ürün/hizmet, rakam ve hikâyelerini kullan (marka hafızasındaki bilgilere sadık kal; olmayanı uydurma).',
        '- Sonda tartışma açan tek bir soru ya da net bir sonraki adım.',
        '- Emoji en fazla 2-3 tane ya da hiç. Hashtag\'leri metne koyma.',
        `- 'hashtags': ${LINKEDIN_LIMITS.hashtags[0]}-${LINKEDIN_LIMITS.hashtags[1]} hashtag; sektöre ve konuya özgü, Türkçe ve gerekiyorsa İngilizce profesyonel etiketler.`,
        "- 'title': takvimde görünecek kısa başlık (en fazla 80 karakter).",
        'Gerçek kişi adı (verilen kişi dışında), ünlü ya da başka marka adı kullanma.', '',
        'Sadece şu JSON biçiminde yanıt ver:',
        JSON.stringify({ title: 'Kısa başlık', text: 'Kanca satırı\n\nParagraf...\n\nSoru?', hashtags: ['#ornek'] })
      ].filter(x => x !== '').join('\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.7 });
      const o = r.output || {};
      const body = String(o.text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').replace(/(\n\s*#[\p{L}\p{N}_]+(?:[ \t]+#[\p{L}\p{N}_]+)*\s*)+$/u, '').trim().slice(0, LINKEDIN_LIMITS.max);
      if (!body) throw badRequest('Yapay zekâ boş metin döndürdü. Tekrar dene.');
      const hashtags = cleanTags(o.hashtags).slice(0, LINKEDIN_LIMITS.hashtags[1]);
      const title = polish(String(o.title || '').trim() || (src && src.title) || topic).slice(0, 80) || 'LinkedIn yazısı';
      if (source && source.kind === 'idea') { try { markIdeaUsed(db, b.id, String(source.id), 'linkedin'); } catch { /* fikir silinmiş olabilir */ } }
      return { title, text: body, hashtags, issues: checkLinkedin(body, hashtags), source: src ? { kind: source.kind, id: String(source.id), title: src.title } : null, voice,
        ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) } };
    },

    // Takvime / taslağa kaydet: yeni içerik ya da var olanı güncelle (contentId)
    save(brandId, { contentId = null, title, text: body, hashtags = [], scheduledAt, voice = 'sirket', type = 'linkedin' } = {}) {
      const b = brands.get(brandId);
      const t = text(body, { field: 'Metin', max: LINKEDIN_LIMITS.max, required: true });
      if (!['linkedin', 'linkedin_belge'].includes(type)) throw badRequest('Geçersiz içerik türü.');
      const tags = cleanTags(hashtags).slice(0, 10);
      const note = `LinkedIn · ${LINKEDIN_VOICES[voice] || LINKEDIN_VOICES.sirket}`;
      let c;
      if (contentId) {
        c = workspace.getContent(contentId);
        if (c.brandId !== b.id) throw badRequest('İçerik bu markaya ait değil.');
        c = workspace.updateContent(c.id, Object.assign({ caption: t, hashtags: tags }, title ? { title } : {}, scheduledAt !== undefined ? { scheduledAt } : {}));
      } else {
        c = workspace.createContent({ brandId: b.id, title: String(title || '').trim() || 'LinkedIn yazısı', type, scheduledAt: scheduledAt || null, notes: note });
        c = workspace.updateContent(c.id, { caption: t, hashtags: tags });
      }
      return { content: c, issues: checkLinkedin(t, tags) };
    }
  };
}
