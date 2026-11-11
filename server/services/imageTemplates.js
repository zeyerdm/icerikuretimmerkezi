// 7.4 Hazır görsel şablonları: iki kısa soruyla markanın kemiği (7.1), prompt kimliği (7.2) ve karakter kitabıyla (7.3)
// önce prompt yazılır (Prompt Studio'ya kaydedilir), sonra o prompt'la görsel üretilir. "Tek tıkla maskotlu görsel".
import { badRequest, text } from '../lib/http.js';

export const IMAGE_TEMPLATES = {
  maskot: { label: 'Maskotlu sahne', kind: 'gorsel', aspect: '4:5', useMascot: true, questions: ['Maskot ne yapıyor?', 'Nerede?'], brief: (a, b) => `Markanın maskotu ${a}. Mekân: ${b || 'markaya uygun bir yer'}. Maskot sahnenin odağında.` },
  urun: { label: 'Ürün çekimi', kind: 'urun', aspect: '1:1', useMascot: false, questions: ['Hangi ürün?', 'Zemin / ortam'], brief: (a, b) => `Ürün: ${a}. Zemin ve ortam: ${b || 'sade stüdyo zemini'}.` },
  kampanya: { label: 'Kampanya görseli', kind: 'reklam', aspect: '4:5', useMascot: false, questions: ['Kampanya ne?', 'Görselde ne öne çıksın?'], brief: (a, b) => `Kampanya: ${a}. Öne çıkacak: ${b || 'ürün ve fayda'}. Başlık için boş alan bırak.` },
  youtube: { label: 'YouTube kapağı görseli', kind: 'gorsel', aspect: '16:9', useMascot: false, questions: ['Video konusu', 'Yüz ifadesi / ana nesne'], brief: (a, b) => `YouTube kapağı arka planı: ${a}. Ana öğe: ${b || 'şaşkın bir yüz ifadesi'}. Yüksek kontrast, tek odak, sol tarafta yazı için boş alan.` }
};

export function createImageTemplateService({ prompts, images }) {
  return {
    list: () => Object.fromEntries(Object.entries(IMAGE_TEMPLATES).map(([k, t]) => [k, { label: t.label, aspect: t.aspect, useMascot: t.useMascot, questions: t.questions }])),
    async run(brandId, { template, answers = [], model = null, textModel = null } = {}) {
      const t = IMAGE_TEMPLATES[template];
      if (!t) throw badRequest('Geçersiz şablon.');
      const a = text(answers[0], { field: t.questions[0], max: 300, required: true });
      const b = text(answers[1], { field: t.questions[1], max: 300 });
      // Türkçe yazılır (7.5), görsel modeline İngilizcesi gider
      const tr = await prompts.create(brandId, { kind: t.kind, brief: t.brief(a, b), modelRef: textModel, lang: 'tr' });
      const p = await prompts.translate(brandId, tr.id, {});
      const img = await images.generate(brandId, { prompt: p.text, aspect: t.aspect, useMascot: t.useMascot, promptId: p.id, model });
      return { prompt: { id: p.id, title: p.title, text: p.text }, asset: img.asset, ai: img.ai };
    }
  };
}
