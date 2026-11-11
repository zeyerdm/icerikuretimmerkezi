// Aşama 5.19: Ortak tarifler. Beğenilen bir prompt ya da Reels kalıbı kullanıcı düzeyinde "tarif" olarak saklanır ve
// başka bir markaya kopyalanır (o markada yeni prompt / yeni kalıp oluşur; marka kimliği yeni üretimlerde kendiliğinden girer).
// Tarif, kaynak markanın logo/görsel gibi dosyalarını taşımaz; yalnız metin ve yapı.
import { newId, now, notFound, badRequest, parseJson } from '../lib/http.js';
import { IDENTITY_QUESTIONS, cleanIdentity } from './promptIdentity.js';

export const RECIPE_KINDS = { prompt: 'Prompt', pattern: 'Reels kalıbı', identity: 'Prompt kimliği' };
// 7.12: maskot markaya özeldir; istenmedikçe kimlik tarifine girmez
const MASCOT_KEYS = ['hasMascot', ...IDENTITY_QUESTIONS.filter(q => q.when === 'hasMascot').map(q => q.key)];
const LABEL = Object.fromEntries(IDENTITY_QUESTIONS.map(q => [q.key, q]));
function identityPreview(idt) {
  const parts = ['visualStyle', 'lighting', 'camera'].filter(k => idt[k]).map(k => LABEL[k].options[idt[k]]);
  if (idt.mood && idt.mood.length) parts.push(idt.mood.map(m => LABEL.mood.options[m]).join(', '));
  if (idt.hasMascot) parts.push('maskot cevaplarıyla');
  return `${Object.keys(idt).length} cevap${parts.length ? ': ' + parts.join(' · ') : ''}`;
}

export function createRecipeService({ db, ownerId, brands, prompts }) {
  const toRecipe = r => Object.assign({ id: r.id, kind: r.kind, kindLabel: RECIPE_KINDS[r.kind], title: r.title, sourceBrand: r.source_brand, uses: r.uses, createdAt: r.created_at }, (() => {
    const d = parseJson(r.data, {});
    if (r.kind === 'identity') return { preview: identityPreview(d.identity || {}).slice(0, 220) };
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
    // 7.12: markanın prompt kimliği tarif olur (dosya ve maskot görseli taşınmaz; maskot cevapları istenirse)
    fromIdentity(brandId, { withMascot = false } = {}) {
      const b = brands.get(brandId);
      const idt = parseJson((db.prepare('SELECT prompt_identity FROM brands WHERE id = ?').get(b.id) || {}).prompt_identity, {}) || {};
      const out = Object.fromEntries(Object.entries(idt).filter(([k]) => withMascot || !MASCOT_KEYS.includes(k)));
      if (!Object.keys(out).length) throw badRequest('Kaydedilecek prompt kimliği yok; önce soruları cevapla.');
      return insert('identity', `${b.name} prompt kimliği`, { identity: out }, b.name);
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
      } else if (r.kind === 'identity') {
        // Başlangıç olarak: hedef markada boş olan cevaplar doldurulur, mevcut cevaplar korunur
        const cur = parseJson((db.prepare('SELECT prompt_identity FROM brands WHERE id = ?').get(b.id) || {}).prompt_identity, {}) || {};
        const src = cleanIdentity(d.identity || {});
        const filled = Object.keys(src).filter(k => !(k in cur));
        const next = cleanIdentity(Object.assign({}, src, cur));
        db.prepare('UPDATE brands SET prompt_identity = ? WHERE id = ?').run(JSON.stringify(next), b.id);
        created = { identity: next, filled };
      } else throw badRequest('Bilinmeyen tarif türü.');
      db.prepare('UPDATE recipes SET uses = uses + 1 WHERE id = ?').run(r.id);
      brands.logActivity(b.id, 'recipe.applied', `Tariften eklendi: ${r.title}`);
      return created;
    },
    remove(recipeId) { const r = row(recipeId); db.prepare('DELETE FROM recipes WHERE id = ?').run(r.id); }
  };
}
