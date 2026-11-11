// Aşama 5.21: YouTube kapak stüdyosu (Banana Studio'dan ilham). Videonun konusundan ya da herkese açık YouTube
// bağlantısından (yalnızca Gemini; video doğrudan modele girdi olarak verilir) kapak fikirleri üretir: ana vaat, en çok
// 4 kelimelik kapak yazısı, yüz ifadesi, kompozisyon ve görsel üretimi için İngilizce, yazısız bir tarif.
// Fikirler kaydedilmez; arayüzde fikirden görsel üretilir (16:9) ya da Post stüdyosunda düzenlenebilir kapak açılır.
import { text, badRequest } from '../lib/http.js';
import { polish } from './reels/rules.js';

export const YOUTUBE_URL = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}/i;
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_WORDS = 4;

export function createThumbnailService({ ai, brands }) {
  return {
    async ideas(brandId, { topic = '', title = '', url = '', count = 4, modelRef = null } = {}) {
      const b = brands.get(brandId);
      const t = text(topic, { field: 'Video konusu', max: 2000 });
      const vt = text(title, { field: 'Video başlığı', max: 120 });
      const link = String(url || '').trim();
      if (link && !YOUTUBE_URL.test(link)) throw badRequest('Geçerli bir YouTube video bağlantısı yapıştır (youtube.com/watch?v=… ya da youtu.be/…).');
      if (!t && !vt && !link) throw badRequest('Videonun konusunu ya da başlığını yaz (ya da YouTube bağlantısını yapıştır).');
      const n = Math.max(2, Math.min(6, Number(count) || 4));
      const prompt = [
        'YOUTUBE KAPAK FİKİRLERİ',
        `Sen '${b.name}' markasının YouTube kanalı için kapak (thumbnail) tasarımcısısın. Amaç: küçük önizlemede bile okunan, tıklamayı artıran ama yanıltmayan kapaklar.`,
        '', 'MARKA HAFIZASI:', brands.memory(b.id), '',
        link ? 'Ekteki YouTube videosunu izle: videonun asıl vaadini, en çarpıcı anlarını ve öne çıkan kişileri/nesneleri çıkar; fikirleri bu içeriğe dayandır, videoda olmayan bir şey vaat etme.' : '',
        vt ? `VİDEO BAŞLIĞI: ${vt}` : '', t ? `VİDEO KONUSU: ${t}` : '', '',
        `GÖREV: Birbirinden belirgin biçimde farklı ${n} kapak fikri öner. Her fikirde:`,
        `- "text": kapakta yazacak en fazla ${MAX_WORDS} kelime (başlığı tekrar etmesin; merak ya da sonuç vaadi; Türkçe)`,
        '- "promise": kapağın izleyiciye verdiği tek cümlelik vaat',
        '- "emotion": kapaktaki kişinin yüz ifadesi (ör. şaşkın, gururlu, kararlı; kişi yoksa boş)',
        '- "composition": yerleşim (yazı hangi tarafta, ana nesne/kişi nerede, arka plan sade mi)',
        '- "imagePrompt": görsel modeli için İNGİLİZCE tarif; 16:9, yüksek kontrast, tek odak; görselde HİÇBİR yazı/harf/logo olmasın (yazı sonradan eklenecek); gerçek ünlü kullanma',
        '- "colors": en fazla 3 HEX renk (yazı ve vurgu için)',
        '', 'Sadece şu JSON biçiminde yanıt ver:',
        JSON.stringify({ summary: link ? 'Videonun ana vaadi ve öne çıkan anlar (2-3 cümle)' : '', ideas: [{ name: 'Fikrin kısa adı', text: 'KAPAK YAZISI', promise: '...', emotion: '...', composition: '...', imagePrompt: '...', colors: ['#ff3b30'] }] })
      ].filter(x => x !== '').join('\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.9, videoUrl: link || null });
      const o = r.output || {};
      const clip = s => polish(s).split(/\s+/).filter(Boolean).slice(0, MAX_WORDS).join(' ');
      const ideas = (Array.isArray(o.ideas) ? o.ideas : []).map(i => ({
        name: polish(i && i.name).slice(0, 60) || 'Kapak fikri',
        text: clip(i && i.text).slice(0, 60),
        promise: polish(i && i.promise).slice(0, 240),
        emotion: polish(i && i.emotion).slice(0, 80),
        composition: polish(i && i.composition).slice(0, 300),
        imagePrompt: String((i && i.imagePrompt) || '').trim().slice(0, 1500),
        colors: (Array.isArray(i && i.colors) ? i.colors : []).filter(c => HEX.test(String(c))).map(c => c.toLowerCase()).slice(0, 3)
      })).filter(i => i.text && i.imagePrompt).slice(0, n);
      if (!ideas.length) throw badRequest('Model kullanılabilir kapak fikri döndürmedi; tekrar dene ya da başka model seç.');
      return { summary: polish(o.summary).slice(0, 600), ideas, ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) } };
    }
  };
}
