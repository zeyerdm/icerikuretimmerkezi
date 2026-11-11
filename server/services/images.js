// Görsel üretimi: seçilen görsel modeliyle marka renkleri ve (destekleyen modellerde) maskot referansıyla üretim.
// Üretilen görsel markanın kütüphanesine "AI görseli" olarak kaydedilir; üretim ayrıntıları (prompt, model) etikette ve
// üretim kaydında tutulur. Görsel servisi bağlı değilse açık hata döner: sahte ya da yer tutucu görsel üretilmez.
import fs from 'node:fs';
import { detectImage } from './assets.js';
import { newId, now, text, badRequest, notFound, oneOf, parseJson } from '../lib/http.js';
import { bookImageLine } from './characterBook.js';
import { identityImageLine } from './promptIdentity.js';

const MAX_REFS = 3;

export function createImageService({ db, ai, brands, assets }) {
  const bookOf = id => parseJson((db.prepare('SELECT character_book FROM brands WHERE id = ?').get(id) || {}).character_book, {}) || {};
  function brandHint(b, { useColors, useMascot, character, book, allowText = false }) {
    const c = b.colors || {};
    const colors = [c.primary, ...(c.secondary || [])].filter(Boolean).slice(0, 4);
    const lines = [];
    if (useColors && colors.length) lines.push(`Brand color palette to feature: ${colors.join(', ')}.`);
    if (useMascot) lines.push(`The attached reference image(s) show the brand mascot${character ? ` "${character}"` : ''}: keep its exact design, proportions, colors and face consistent.`);
    // 7.3: karakter kitabındaki sabit görünüş tarifi
    if (useMascot && book && book.lookEn) lines.push(bookImageLine(book));
    // 7.7: marka görselde yazıya izin verdiyse yalnız logo/filigran yasağı kalır
    lines.push(allowText ? 'Do not render logos or watermarks; only render text that the prompt explicitly quotes.' : 'Do not render any text, letters, logos or watermarks in the image.');
    return lines.join(' ');
  }

  function refsFor(brandId, assetIds) {
    // 7.3: seçim yoksa önce karakter kitabının pozları, o da yoksa kütüphanedeki maskot pozları
    const bookPoses = bookOf(brandId).poseAssetIds || [];
    const ids = assetIds && assetIds.length ? assetIds : bookPoses;
    const list = (ids.length ? ids.map(id => assets.list(brandId).find(a => a.id === id)).filter(Boolean) : assets.list(brandId, 'mascot')).slice(0, MAX_REFS);
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
      // @etiket ile anılan kütüphane görselleri rolleriyle referans olur (en çok 3); anma varsa maskot seçeneğinin yerine geçer
      const mentioned = [...new Set((prompt.match(/@([a-z0-9-]{2,32})/gi) || []).map(m => m.slice(1).toLowerCase()))];
      let mentionRefs = [];
      if (mentioned.length) {
        const all = assets.list(b.id);
        mentionRefs = mentioned.map(m => all.find(a => a.mention === m)).filter(Boolean).slice(0, MAX_REFS + 1);
        const missing = mentioned.filter(m => !all.some(a => a.mention === m));
        if (missing.length) throw badRequest(`Kütüphanede şu etiketle görsel yok: ${missing.map(m => '@' + m).join(', ')}`);
        if (chosen && !chosen.refs) throw badRequest('Seçilen görsel modeli referans görsel almıyor; @ ile anma için Gemini Flash Image (Nano Banana) seç.');
      }
      const useMascot = !mentionRefs.length && Boolean(body.useMascot) && (!chosen || chosen.refs);
      let refs = useMascot ? refsFor(b.id, Array.isArray(body.refAssetIds) ? body.refAssetIds.map(String) : null) : [];
      if (useMascot && !refs.length) throw badRequest('Kütüphanede maskot pozu yok; önce bir maskot görseli yükle ya da "maskotu referans al" seçeneğini kapat.');
      let mentionText = '';
      if (mentionRefs.length) {
        refs = refsFor(b.id, mentionRefs.map(a => a.id));
        const roleText = { kimlik: 'an identity reference: keep this exact character (design, proportions, colors, face)', nesne: 'an object reference: include this exact object/product unchanged', stil: 'a style reference: match its visual style, palette, lighting and texture (do not copy its content)' };
        mentionText = mentionRefs.map((a, i) => `Reference image ${i + 1} (@${a.mention}) is ${roleText[a.refRole] || (a.category === 'mascot' ? roleText.kimlik : roleText.nesne)}.`).join(' ');
      }
      const book = bookOf(b.id);
      // 7.4: markanın prompt kimliği (stil, ışık, his, kaçınılacaklar) görsel istemine de girer
      const idt = parseJson((db.prepare('SELECT prompt_identity FROM brands WHERE id = ?').get(b.id) || {}).prompt_identity, {}) || {};
      const idLine = body.useIdentity === false ? '' : identityImageLine(idt);
      const character = book.name || (parseJson((db.prepare('SELECT reels_settings FROM brands WHERE id = ?').get(b.id) || {}).reels_settings, {}) || {}).character || '';
      const full = `${prompt}${mentionText ? `\n\n${mentionText}` : ''}${idLine ? `\n\nBrand visual identity: ${idLine}` : ''}\n\n${brandHint(b, { useColors, useMascot, character, book, allowText: Boolean(idt.allowText) })}`;
      const r = await ai.image({ brandId: b.id, prompt: full, modelRef: body.model ? String(body.model) : null, aspect, refs });
      const label = `AI: ${prompt.replace(/\s+/g, ' ').slice(0, 70)}`;
      const asset = assets.create(b.id, { buffer: r.buffer, category: 'ai_image', label });
      db.prepare('INSERT INTO image_generations (id, brand_id, asset_id, prompt_id, prompt, model, aspect, used_refs, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(newId(), b.id, asset.id, body.promptId ? String(body.promptId).slice(0, 40) : null, prompt, r.ref, aspect, r.usedRefs ? 1 : 0, r.cost || 0, now());
      brands.logActivity(b.id, 'image.generated', `${r.label} ile görsel üretildi`);
      return { asset, ai: { model: r.ref, modelLabel: r.label, cost: r.cost, ms: r.ms, usedRefs: r.usedRefs } };
    },

    // Alan düzenleme: asıl görsel + düzenlenecek alanların kırmızıyla işaretlendiği kopya modele gider;
    // yalnızca işaretli alan değişir, sonuç yeni "AI görseli" olarak kaydedilir (asıl görsel korunur)
    async editRegion(brandId, { assetId, marked, instruction, modelRef = null } = {}) {
      const b = brands.get(brandId);
      const ins = text(instruction, { field: 'Talimat', max: 1000, required: true });
      if (!Buffer.isBuffer(marked) || !detectImage(marked)) throw badRequest('İşaretli görsel okunamadı.');
      const ov = ai.imageOverview();
      const chosen = ov.models.find(m => m.ref === (modelRef || ov.default));
      if (chosen && !chosen.refs) throw badRequest('Alan düzenleme için görsel referansı alan bir model seç (ör. Gemini Flash Image / Nano Banana).');
      const f = assets.file(b.id, String(assetId));
      const original = { mime: f.mime, data: fs.readFileSync(f.path) };
      const prompt = `Edit the image. Image 1 is the original. Image 2 is the same image where the area(s) to change are highlighted with red semi-transparent rectangles. Apply the following change ONLY inside the highlighted area(s); keep everything else pixel-identical (composition, characters, colors, lighting). Output the full edited image without any red marks or rectangles.\n\nChange: ${ins}\n\nDo not render any text, letters or watermarks.`;
      const r = await ai.image({ brandId: b.id, prompt, modelRef: modelRef || null, aspect: '1:1', refs: [original, { mime: detectImage(marked).mime, data: marked }], keepAspect: true });
      const asset = assets.create(b.id, { buffer: r.buffer, category: 'ai_image', label: `Düzenlendi: ${ins.replace(/\s+/g, ' ').slice(0, 60)}` });
      db.prepare('INSERT INTO image_generations (id, brand_id, asset_id, prompt_id, prompt, model, aspect, used_refs, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(newId(), b.id, asset.id, null, `Alan düzenleme: ${ins}`, r.ref, 'kaynak', 1, r.cost || 0, now());
      brands.logActivity(b.id, 'image.edited', `${r.label} ile görselde alan düzenlendi`);
      return { asset, ai: { model: r.ref, modelLabel: r.label, cost: r.cost, ms: r.ms, usedRefs: true } };
    },

    // 7.9: beğenilen görseli marka örneği yap (tarifi sonraki prompt üretimlerine örnek olarak girer; en çok 3)
    setExample(brandId, genId, on) {
      const b = brands.get(brandId);
      const r = db.prepare('SELECT * FROM image_generations WHERE id = ? AND brand_id = ?').get(String(genId), b.id);
      if (!r) throw notFound('Görsel bulunamadı.');
      if (on && !r.is_example && db.prepare('SELECT COUNT(*) AS n FROM image_generations WHERE brand_id = ? AND is_example = 1').get(b.id).n >= 3) throw badRequest('En çok 3 görsel marka örneği olabilir; önce birini örneklikten çıkar.');
      db.prepare('UPDATE image_generations SET is_example = ? WHERE id = ?').run(on ? 1 : 0, r.id);
      return { id: r.id, example: Boolean(on) };
    },

    // Bir markanın (isteğe bağlı: bir prompt'un) üretim geçmişi; silinmiş görseller listelenmez
    history(brandId, { promptId = null } = {}) {
      const b = brands.get(brandId);
      const rows = promptId
        ? db.prepare('SELECT * FROM image_generations WHERE brand_id = ? AND prompt_id = ? ORDER BY created_at DESC LIMIT 60').all(b.id, String(promptId))
        : db.prepare('SELECT * FROM image_generations WHERE brand_id = ? ORDER BY created_at DESC LIMIT 60').all(b.id);
      const byId = new Map(assets.list(b.id).map(a => [a.id, a]));
      // 7.11: oylar
      const fb = new Map(db.prepare("SELECT target_id, vote, reasons, note FROM feedback WHERE brand_id = ? AND target_type = 'image'").all(b.id).map(f => [f.target_id, { vote: f.vote, reasons: parseJson(f.reasons, []) || [], note: f.note }]));
      return rows.filter(r => byId.has(r.asset_id)).map(r => ({ id: r.id, asset: byId.get(r.asset_id), prompt: r.prompt, model: r.model, modelLabel: ai.labelOf(r.model), aspect: r.aspect, usedRefs: Boolean(r.used_refs), example: Boolean(r.is_example), feedback: fb.get(r.id) || null, cost: r.cost_usd, createdAt: r.created_at }));
    }
  };
}
