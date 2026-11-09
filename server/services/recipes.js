// Aşama 5.19: Ortak tarifler. Beğenilen bir prompt ya da Reels kalıbı kullanıcı düzeyinde "tarif" olarak saklanır ve
// başka bir markaya kopyalanır (o markada yeni prompt / yeni kalıp oluşur; marka kimliği yeni üretimlerde kendiliğinden girer).
// Tarif, kaynak markanın logo/görsel gibi dosyalarını taşımaz; yalnız metin ve yapı.
import { newId, now, notFound, badRequest, parseJson } from '../lib/http.js';

export const RECIPE_KINDS = { prompt: 'Prompt', pattern: 'Reels kalıbı' };

export function createRecipeService({ db, ownerId, brands, prompts }) {
  const toRecipe = r => Object.assign({ id: r.id, kind: r.kind, kindLabel: RECIPE_KINDS[r.kind], title: r.title, sourceBrand: r.source_brand, uses: r.uses, createdAt: r.created_at }, (() => {
    const d = parseJson(r.data, {});
    return r.kind === 'prompt' ? { promptKind: d.kind, preview: String(d.text || '').slice(0, 220) } : { preview: [d.data && d.data.hook, d.title].filter(Boolean).join(' · ').slice(0, 220) };
  })());
  const row = id => { const r = db.prepare('SELECT * FROM recipes WHERE id = ? AND owner_id = ?').get(String(id), ownerId); if (!r) throw notFound('Tarif bulunamadı.'); return r; };
  const insert = (kind, title, data, sourceBrand) => {
    const r = { id: newId(), owner_id: ownerId, kind, title: String(title).slice(0, 100) || RECIPE_KINDS[kind], data: JSON.stringify(data), source_brand: sourceBrand, uses: 0, created_at: now() };
    db.prepare('INSERT INTO recipes (id, owner_id, kind, title, data, source_brand, uses, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, r.owner_id, r.kind, r.title, r.data, r.source_brand, r.uses, r.created_at);
    return toRecipe(r);
  };
  return {
    list(kind) {
      const rows = kind ? db.prepare('SELECT * FROM recipes WHERE owner_id = ? AND kind = ? ORDER BY uses DESC, created_at DESC').all(ownerId, String(kind))
        : db.prepare('SELECT * FROM recipes WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId);
      return rows.map(toRecipe);
    },
    fromPrompt(brandId, promptId) {
      const b = brands.get(brandId);
      const p = db.prepare('SELECT * FROM prompts WHERE id = ? AND brand_id = ?').get(String(promptId), b.id);
      if (!p) throw notFound('Prompt bulunamadı.');
      return insert('prompt', p.title, { kind: p.kind, text: p.text, textTr: p.text_tr, title: p.title }, b.name);
    },
    fromPattern(brandId, patternId) {
      const b = brands.get(brandId);
      const p = db.prepare('SELECT * FROM patterns WHERE id = ? AND brand_id = ?').get(String(patternId), b.id);
      if (!p) throw notFound('Kalıp bulunamadı.');
      return insert('pattern', p.title, { title: p.title, source_type: p.source_type, source_note: p.source_note, raw_text: p.raw_text, data: parseJson(p.data, {}), model: p.model }, b.name);
    },
    apply(recipeId, brandId) {
      const r = row(recipeId);
      const b = brands.get(brandId);
      const d = parseJson(r.data, {});
      let created;
      if (r.kind === 'prompt') created = { prompt: prompts.createManual(b.id, { kind: d.kind, text: d.text, textTr: d.textTr, title: d.title }) };
      else if (r.kind === 'pattern') {
        const id = newId();
        db.prepare('INSERT INTO patterns (id, brand_id, source_type, source_note, raw_text, title, data, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, b.id, d.source_type || 'diger', d.source_note || `Tarif: ${r.source_brand}`, d.raw_text || '', d.title || r.title, JSON.stringify(d.data || {}), d.model || '', now());
        created = { patternId: id };
      } else throw badRequest('Bilinmeyen tarif türü.');
      db.prepare('UPDATE recipes SET uses = uses + 1 WHERE id = ?').run(r.id);
      brands.logActivity(b.id, 'recipe.applied', `Tariften eklendi: ${r.title}`);
      return created;
    },
    remove(recipeId) { const r = row(recipeId); db.prepare('DELETE FROM recipes WHERE id = ?').run(r.id); }
  };
}
