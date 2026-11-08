// İçerik kartı yazımı: bir takvim içeriği için Instagram açıklaması, hashtag'ler ve ilk yorumu seçilen modelle yazar.
// Bağlı Reels senaryosu ya da post tasarımı varsa onların metni, yoksa başlık/not/giriş cümlesi kullanılır.
// Sonuç kaydedilmez; arayüzde alanlara doldurulur, kullanıcı düzenleyip kaydeder.
import { parseJson } from '../lib/http.js';
import { polish } from './reels/rules.js';

export function createCaptionService({ db, ai, brands, workspace, reels }) {
  return {
    async write(contentId, { modelRef = null } = {}) {
      const c = workspace.getContent(contentId);
      const b = brands.get(c.brandId);
      const source = [];
      if (c.reelsId && reels) {
        try { source.push(`BAĞLI REELS SENARYOSU:\n${String(reels.get(b.id, c.reelsId).script || '').slice(0, 3000)}`); } catch { /* senaryo silinmiş olabilir */ }
      }
      if (c.postId) {
        const p = db.prepare('SELECT data FROM posts WHERE id = ? AND brand_id = ?').get(c.postId, b.id);
        if (p) {
          const d = parseJson(p.data, {});
          const texts = (d.slides || []).map((s, i) => `${i + 1}. ${(s.layers || []).filter(l => l.type === 'text' && ['title', 'body', 'cta', 'item'].includes(l.role)).map(l => l.text).join(' — ')}`).join('\n');
          source.push(`BAĞLI TASARIMDAKİ METİNLER:\n${texts.slice(0, 3000)}`);
        }
      }
      const prompt = [
        `Sen '${b.name}' markasının Instagram içerik yazarısın.`, '', 'MARKA HAFIZASI:', brands.memory(b.id), '',
        `İÇERİK: ${c.title} (${c.typeLabel})`,
        c.notes ? `NOT: ${c.notes}` : '',
        c.hook ? `GİRİŞ CÜMLESİ: ${c.hook}` : '',
        c.caption ? `MEVCUT AÇIKLAMA (daha iyisini yaz, kopyalama):\n${c.caption}` : '',
        ...source, '',
        'GÖREV:',
        "- 'caption': Instagram açıklaması (400-1200 karakter): ilk satır merak uyandırsın (feed'de görünen kısım), 2-4 kısa paragraf, sonda yorum yapmaya davet eden bir soru. Marka diline uy. Hashtag'leri açıklamaya koyma.",
        "- 'hashtags': 3-5 hashtag (markaya ve konuya özgü, Türkçe ağırlıklı; çok genel etiketlerden kaçın).",
        "- 'firstComment': markanın kendi gönderisine yazacağı ilk yorum (1-2 cümle: ek bilgi, soru ya da yönlendirme; hashtag yok).",
        'Gerçek kişi, ünlü veya başka marka adı kullanma.', '',
        'Sadece şu JSON biçiminde yanıt ver:',
        JSON.stringify({ caption: 'Açıklama', hashtags: ['#ornek'], firstComment: 'İlk yorum' })
      ].filter(Boolean).join('\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef });
      const o = r.output || {};
      return {
        caption: String(o.caption || '').trim().slice(0, 2200),
        hashtags: (Array.isArray(o.hashtags) ? o.hashtags : []).map(h => polish(h).replace(/^#*/, '#')).filter(h => h.length > 1).slice(0, 8),
        firstComment: String(o.firstComment || '').trim().slice(0, 1000),
        ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) }
      };
    }
  };
}
