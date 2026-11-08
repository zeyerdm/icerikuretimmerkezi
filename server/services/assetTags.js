// Aşama 5.11: Görselde yazı okuma (OCR) ve etiket önerisi. Görsel, görsel girdisi destekleyen seçili AI modeline gönderilir;
// okunan yazı kütüphane aramasına katılır, etiketler mevcut etiketlere eklenir. AI bağlı değilse ai.run açıklayıcı hata verir.
import fs from 'node:fs';
import { badRequest } from '../lib/http.js';
import { polish } from './reels/rules.js';

function ocrPrompt(brandName) {
  return [
    `"${brandName}" markasının görsel kütüphanesindeki bir görseli inceliyorsun.`,
    '1) Görselde okunabilen BÜTÜN yazıları olduğu gibi, satır satır çıkar (yazı yoksa boş bırak). Uydurma, tahmin etme.',
    '2) Görseli kütüphanede bulmayı kolaylaştıracak 3–8 kısa Türkçe etiket öner (konu, nesne, renk, duygu, kullanım; tek ya da iki kelime, küçük harf).',
    '3) Görsel için en fazla 6 kelimelik kısa bir Türkçe ad öner.',
    'YALNIZCA şu JSON ile yanıt ver: {"text": "...", "tags": ["..."], "label": "..."}'
  ].join('\n');
}

export function createAssetTagService({ ai, brands, assets }) {
  return {
    async analyze(brandId, assetId, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      const f = assets.file(b.id, String(assetId));
      if (!/^image\/(png|jpeg|webp|gif)$/.test(f.mime)) throw badRequest('Bu dosya türü okunamıyor.');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt: ocrPrompt(b.name), json: true, modelRef, temperature: 0.1, images: [{ mime: f.mime, data: fs.readFileSync(f.path) }] });
      const o = r.output || {};
      const tags = (Array.isArray(o.tags) ? o.tags : []).map(t => polish(t)).filter(Boolean).slice(0, 8);
      const asset = assets.saveAnalysis(b.id, String(assetId), { ocrText: String(o.text || '').trim(), tags, label: polish(o.label).slice(0, 80) });
      return { asset, ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) } };
    }
  };
}
