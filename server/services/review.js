// AI içerik denetçisi: üretilen metni marka diline, uzunluğa ve kurallara göre kontrol eder.
// İki katman: kodla kesin kontroller (uzunluk, hashtag sayısı, çağrı, gerçek isim) + seçilen modelle marka dili değerlendirmesi.
import { text, badRequest } from '../lib/http.js';
import { polish } from './reels/rules.js';

export const REVIEW_KINDS = {
  caption: { label: 'Gönderi açıklaması', min: 150, max: 2200 },
  reels: { label: 'Reels senaryosu', min: 80, max: 6000 },
  carousel: { label: 'Carousel / post metni', min: 20, max: 3000 },
  serbest: { label: 'Serbest metin', min: 1, max: 6000 }
};
const SEVERITIES = ['yüksek', 'orta', 'düşük'];
const CTA = /\b(kaydet|beğen|paylaş|takip et|abone ol|linke tıkla)\w*/i;

function ruleChecks(t, kind) {
  const k = REVIEW_KINDS[kind];
  const out = [];
  if (t.length < k.min) out.push({ severity: 'orta', problem: `Metin kısa (${t.length} karakter); ${k.label.toLocaleLowerCase('tr-TR')} için en az ${k.min} karakter önerilir.`, suggestion: 'Bir iki cümleyle konuyu açıklayan ayrıntı ekle.', source: 'kural' });
  if (t.length > k.max) out.push({ severity: 'yüksek', problem: `Metin uzun (${t.length} karakter); en fazla ${k.max} karakter olmalı.`, suggestion: 'Tekrar eden cümleleri çıkar.', source: 'kural' });
  const tags = t.match(/#[\p{L}\p{N}_]+/gu) || [];
  if (tags.length > 5) out.push({ severity: 'düşük', problem: `${tags.length} hashtag var; 3-5 hashtag daha etkili.`, suggestion: 'En ilgili 5 hashtag kalsın.', source: 'kural' });
  if (kind === 'reels' && CTA.test(t)) out.push({ severity: 'orta', problem: 'Senaryoda "kaydet/takip et" gibi çağrı var.', suggestion: 'Video asıl espriyle bitsin; çağrıyı açıklamaya taşı.', source: 'kural' });
  return out;
}

export function createReviewService({ ai, brands }) {
  return {
    kinds: Object.fromEntries(Object.entries(REVIEW_KINDS).map(([k, v]) => [k, v.label])),
    async review(brandId, { text: raw, kind = 'serbest', modelRef = null } = {}) {
      const b = brands.get(brandId);
      if (!REVIEW_KINDS[kind]) throw badRequest('Geçersiz metin türü.');
      const t = text(raw, { field: 'Metin', max: 12000, required: true });
      const prompt = [
        'İÇERİK DENETİMİ', `Sen '${b.name}' markasının içerik editörüsün. Aşağıdaki ${REVIEW_KINDS[kind].label.toLocaleLowerCase('tr-TR')} metnini marka kimliğine göre değerlendir.`, '',
        'MARKA HAFIZASI:', brands.memory(b.id), '',
        'KONTROL ET: marka diline ve hitap biçimine uygunluk, hedef kitleye uygunluk, anlaşılırlık ve akıcılık, Türkçe yazım ve noktalama, gereksiz tekrar, abartılı veya yanıltıcı iddia, gerçek kişi/başka marka adı, ilk cümlenin dikkat çekiciliği.',
        'Yalnızca gerçek sorunları yaz; sorun yoksa issues boş olsun. Her sorun için somut bir düzeltme önerisi ver.', '',
        `METİN:\n${t}`, '',
        'Sadece şu JSON biçiminde yanıt ver:',
        JSON.stringify({ score: 85, summary: 'Tek cümle genel değerlendirme', issues: [{ severity: 'orta', problem: 'Sorun', suggestion: 'Öneri' }], improved: 'İstersen düzeltilmiş tam metin (gerek yoksa boş)' })
      ].join('\n');
      const r = await ai.run({ task: 'denetim', brandId: b.id, prompt, json: true, modelRef: modelRef || null, temperature: 0.3 });
      const o = r.output || {};
      const aiIssues = (Array.isArray(o.issues) ? o.issues : []).map(i => ({
        severity: SEVERITIES.includes(String(i && i.severity).toLocaleLowerCase('tr-TR')) ? String(i.severity).toLocaleLowerCase('tr-TR') : 'orta',
        problem: polish(i && i.problem).slice(0, 400), suggestion: polish(i && i.suggestion).slice(0, 600), source: 'ai'
      })).filter(i => i.problem).slice(0, 12);
      const score = Number.isFinite(Number(o.score)) ? Math.max(0, Math.min(100, Math.round(Number(o.score)))) : null;
      return {
        score, summary: polish(o.summary).slice(0, 400), improved: String(o.improved || '').trim().slice(0, 12000),
        issues: [...ruleChecks(t, kind), ...aiIssues],
        ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) }
      };
    }
  };
}
