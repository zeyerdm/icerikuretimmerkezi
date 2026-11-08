// Görsel üretimi: seçilen görsel modeliyle marka renkleri ve (destekleyen modellerde) maskot referansıyla üretim.
// Üretilen görsel markanın kütüphanesine "AI görseli" olarak kaydedilir; üretim ayrıntıları (prompt, model) etikette ve
// üretim kaydında tutulur. Görsel servisi bağlı değilse açık hata döner: sahte ya da yer tutucu görsel üretilmez.
import fs from 'node:fs';
import { newId, now, text, badRequest, oneOf, parseJson } from '../lib/http.js';

const MAX_REFS = 2;

export function createImageService({ db, ai, brands, assets }) {
  function brandHint(b, { useColors, useMascot, character }) {
    const c = b.colors || {};
    const colors = [c.primary, ...(c.secondary || [])].filter(Boolean).slice(0, 4);
    const lines = [];
    if (useColors && colors.length) lines.push(`Brand color palette to feature: ${colors.join(', ')}.`);
    if (useMascot) lines.push(`The attached reference image(s) show the brand mascot${character ? ` "${character}"` : ''}: keep its exact design, proportions, colors and face consistent.`);
    lines.push('Do not render any text, letters, logos or watermarks in the image.');
    return lines.join(' ');
  }

  function refsFor(brandId, assetIds) {
    const list = (assetIds && assetIds.length ? assetIds.map(id => assets.list(brandId).find(a => a.id === id)).filter(Boolean) : assets.list(brandId, 'mascot')).slice(0, MAX_REFS);
    return list.map(a => {
      const f = assets.file(brandId, a.id);
      return { mime: f.mime, data: fs.readFileSync(f.path) };
    }).filter(r => /^image\/(png|jpeg|webp)$/.test(r.mime));
  }

  return {
    overview: () => ai.imageOverview(),

    async generate(brandId, body = {}) {
      const b = brands.get(brandId);
      const prompt = text(body.prompt, { field: 'Görsel tarifi', max: 4000, required: true });
      const aspect = oneOf(body.aspect || '1:1', Object.keys(ai.imageOverview().aspects), 'Oran');
      const useColors = body.useColors !== false;
      // Referans almayan modelde (Imagen, GPT Image) maskot isteği yok sayılır; istemde de "ekteki görsel" denmez
      const ov = ai.imageOverview();
      const chosen = ov.models.find(m => m.ref === (body.model ? String(body.model) : ov.default));
      const useMascot = Boolean(body.useMascot) && (!chosen || chosen.refs);
      const refs = useMascot ? refsFor(b.id, Array.isArray(body.refAssetIds) ? body.refAssetIds.map(String) : null) : [];
      if (useMascot && !refs.length) throw badRequest('Kütüphanede maskot pozu yok; önce bir maskot görseli yükle ya da "maskotu referans al" seçeneğini kapat.');
      const character = (parseJson((db.prepare('SELECT reels_settings FROM brands WHERE id = ?').get(b.id) || {}).reels_settings, {}) || {}).character || '';
      const full = `${prompt}\n\n${brandHint(b, { useColors, useMascot, character })}`;
      const r = await ai.image({ brandId: b.id, prompt: full, modelRef: body.model ? String(body.model) : null, aspect, refs });
      const label = `AI: ${prompt.replace(/\s+/g, ' ').slice(0, 70)}`;
      const asset = assets.create(b.id, { buffer: r.buffer, category: 'ai_image', label });
      db.prepare('INSERT INTO image_generations (id, brand_id, asset_id, prompt_id, prompt, model, aspect, used_refs, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(newId(), b.id, asset.id, body.promptId ? String(body.promptId).slice(0, 40) : null, prompt, r.ref, aspect, r.usedRefs ? 1 : 0, r.cost || 0, now());
      brands.logActivity(b.id, 'image.generated', `${r.label} ile görsel üretildi`);
      return { asset, ai: { model: r.ref, modelLabel: r.label, cost: r.cost, ms: r.ms, usedRefs: r.usedRefs } };
    },

    // Bir markanın (isteğe bağlı: bir prompt'un) üretim geçmişi; silinmiş görseller listelenmez
    history(brandId, { promptId = null } = {}) {
      const b = brands.get(brandId);
      const rows = promptId
        ? db.prepare('SELECT * FROM image_generations WHERE brand_id = ? AND prompt_id = ? ORDER BY created_at DESC LIMIT 60').all(b.id, String(promptId))
        : db.prepare('SELECT * FROM image_generations WHERE brand_id = ? ORDER BY created_at DESC LIMIT 60').all(b.id);
      const byId = new Map(assets.list(b.id).map(a => [a.id, a]));
      return rows.filter(r => byId.has(r.asset_id)).map(r => ({ id: r.id, asset: byId.get(r.asset_id), prompt: r.prompt, model: r.model, modelLabel: ai.labelOf(r.model), aspect: r.aspect, usedRefs: Boolean(r.used_refs), cost: r.cost_usd, createdAt: r.created_at }));
    }
  };
}
