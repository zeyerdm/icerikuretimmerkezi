// 7.11 Beğen/beğenme ile öğrenme: her prompt ve görsele 👍/👎 ve kısa neden. Aynı 👎 nedeni tekrar edince
// (son 90 günde en az 3 kez) prompt kimliğine (7.2) öneri olarak düşer; kullanıcı uygular ya da geçer.
// Kimlik kendiliğinden değişmez.
import { newId, now, badRequest, notFound, oneOf, parseJson } from '../lib/http.js';

export const THRESHOLD = 3;
const WINDOW_DAYS = 90;

// patch: kimliğe uygulanacak değişiklik (fn: mevcut kimlik → yeni alanlar); patch yoksa yalnız yol gösterir
export const REASONS = {
  karanlik: { label: 'Çok karanlık', text: 'Işık tercihini "Aydınlık, doğal gün ışığı" yapalım mı?', patch: () => ({ lighting: 'dogal' }), done: i => i.lighting === 'dogal' },
  soluk: { label: 'Soluk / cansız', text: 'Işık tercihini "Sinematik, dramatik kontrast" yapalım mı?', patch: () => ({ lighting: 'dramatik' }), done: i => i.lighting === 'dramatik' },
  yapay: { label: 'Yapay / plastik görünüyor', text: 'Görsel stili "Gerçekçi fotoğraf" yapalım mı?', patch: () => ({ visualStyle: 'gercekci' }), done: i => i.visualStyle === 'gercekci' },
  kalabalik: { label: 'Fazla kalabalık', text: '"Görselde asla olmasın" listesine "kalabalık" ekleyelim mi?', patch: i => ({ avoid: [...new Set([...(i.avoid || []), 'kalabalık'])] }), done: i => (i.avoid || []).some(a => /kalabal/i.test(a)) },
  renk: { label: 'Renkler markaya uymuyor', text: 'Marka renkleri "Küçük vurgular olarak" kullanılsın mı?', patch: () => ({ colors: 'vurgu' }), done: i => i.colors === 'vurgu' },
  yazi: { label: 'Görselde yazı / harf var', text: 'Görselde yazıya izin kapatılsın mı? (Varsayılan: yazı yok)', patch: () => ({ allowText: false }), done: i => !i.allowText },
  sikici: { label: 'Sıradan / sıkıcı', text: 'Hisse "Enerjik" ekleyelim mi?', patch: i => ({ mood: [...new Set([...(i.mood || []), 'enerjik'])] }), done: i => (i.mood || []).includes('enerjik') },
  maskot: { label: 'Maskot farklı görünüyor', text: 'Maskot karakter kitabındaki görünüş tarifini ve referans pozları kontrol et; maskot her üretimde bunlarla çizilir.', patch: null, done: () => false }
};

export function createFeedbackService({ db, brands, identity }) {
  const targetExists = (brandId, type, id) => (type === 'prompt'
    ? db.prepare('SELECT 1 FROM prompts WHERE id = ? AND brand_id = ?').get(id, brandId)
    : db.prepare('SELECT 1 FROM image_generations WHERE id = ? AND brand_id = ?').get(id, brandId));
  const toFb = r => (r ? { vote: r.vote, reasons: parseJson(r.reasons, []) || [], note: r.note, updatedAt: r.updated_at } : null);
  const dismissed = brandId => parseJson((db.prepare('SELECT feedback_dismissed FROM brands WHERE id = ?').get(brandId) || {}).feedback_dismissed, {}) || {};

  function counts(brandId) {
    const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
    const out = {};
    for (const r of db.prepare('SELECT reasons FROM feedback WHERE brand_id = ? AND vote = -1 AND updated_at >= ?').all(brandId, since)) {
      for (const k of parseJson(r.reasons, []) || []) if (REASONS[k]) out[k] = (out[k] || 0) + 1;
    }
    return out;
  }

  return {
    reasons: Object.fromEntries(Object.entries(REASONS).map(([k, v]) => [k, v.label])),
    get(brandId, type, id) { return toFb(db.prepare('SELECT * FROM feedback WHERE brand_id = ? AND target_type = ? AND target_id = ?').get(brandId, type, String(id))); },
    // Aynı hedefe tek oy: yeniden oylanınca güncellenir; vote 0 oyu kaldırır
    set(brandId, body = {}) {
      const b = brands.get(brandId);
      const type = oneOf(body.targetType, ['prompt', 'image'], 'Hedef türü');
      const id = String(body.targetId || '');
      if (!targetExists(b.id, type, id)) throw notFound(type === 'prompt' ? 'Prompt bulunamadı.' : 'Görsel bulunamadı.');
      const vote = Number(body.vote);
      if (![1, -1, 0].includes(vote)) throw badRequest('Oy 👍 ya da 👎 olmalı.');
      if (vote === 0) {
        db.prepare('DELETE FROM feedback WHERE brand_id = ? AND target_type = ? AND target_id = ?').run(b.id, type, id);
        return { feedback: null, suggestions: this.suggestions(b.id) };
      }
      const reasons = vote === -1 ? [...new Set((Array.isArray(body.reasons) ? body.reasons : []).map(String).filter(k => REASONS[k]))] : [];
      const note = String(body.note || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const t = now();
      db.prepare(`INSERT INTO feedback (id, brand_id, target_type, target_id, vote, reasons, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(brand_id, target_type, target_id) DO UPDATE SET vote = excluded.vote, reasons = excluded.reasons, note = excluded.note, updated_at = excluded.updated_at`)
        .run(newId(), b.id, type, id, vote, JSON.stringify(reasons), note, t, t);
      return { feedback: this.get(b.id, type, id), suggestions: this.suggestions(b.id) };
    },
    // Eşiği geçen, kimlikte zaten uygulanmamış ve geçilmemiş (ya da geçildikten sonra 3 kez daha tekrarlanmış) nedenler
    suggestions(brandId) {
      const b = brands.get(brandId);
      const c = counts(b.id);
      const idt = identity.get(b.id);
      const dis = dismissed(b.id);
      return Object.entries(c)
        .filter(([k, n]) => n >= THRESHOLD && !REASONS[k].done(idt) && n >= (dis[k] || 0) + THRESHOLD)
        .sort((a, z) => z[1] - a[1])
        .map(([k, n]) => ({ reason: k, label: REASONS[k].label, count: n, text: REASONS[k].text, canApply: Boolean(REASONS[k].patch) }));
    },
    apply(brandId, reason) {
      const b = brands.get(brandId);
      const r = REASONS[reason];
      if (!r) throw notFound('Öneri bulunamadı.');
      if (!r.patch) throw badRequest('Bu öneri kimlikte bir ayar değiştirmez; karakter kitabını düzenle.');
      const idt = identity.get(b.id);
      const next = identity.set(b.id, Object.assign({}, idt, r.patch(idt)));
      brands.logActivity(b.id, 'prompt.feedback', `Geri bildirim önerisi uygulandı: ${r.label}`);
      return { identity: next, suggestions: this.suggestions(b.id) };
    },
    dismiss(brandId, reason) {
      const b = brands.get(brandId);
      if (!REASONS[reason]) throw notFound('Öneri bulunamadı.');
      const dis = dismissed(b.id);
      dis[reason] = counts(b.id)[reason] || 0;
      db.prepare('UPDATE brands SET feedback_dismissed = ? WHERE id = ?').run(JSON.stringify(dis), b.id);
      return { suggestions: this.suggestions(b.id) };
    }
  };
}
