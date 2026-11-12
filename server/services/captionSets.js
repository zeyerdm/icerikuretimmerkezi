// 8.15 Hashtag ve açıklama setleri: markaya kayıtlı hashtag grupları ve imza kapanışları; içerik kartında tek tıkla eklenir.
// Kaydederken markanın yasaklı kelimeleri (Marka hafızası) denetlenir: geçen set kaydedilmez.
import { badRequest, newId, parseJson } from '../lib/http.js';

const fold = s => String(s || '').toLocaleLowerCase('tr-TR');
const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
export const LIMITS = { groups: 20, tags: 30, signatures: 10, signatureLen: 300 };

export function cleanTag(t) {
  const s = String(t || '').trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  return s ? '#' + s.slice(0, 40) : '';
}

export function createCaptionSetService({ db, brands }) {
  const read = id => Object.assign({ hashtagGroups: [], signatures: [] }, parseJson((db.prepare('SELECT caption_sets FROM brands WHERE id = ?').get(id) || {}).caption_sets, {}) || {});
  const banned = id => parseJson((db.prepare('SELECT banned_words FROM brands WHERE id = ?').get(id) || {}).banned_words, []) || [];
  return {
    get(brandId) { return read(brands.get(brandId).id); },
    set(brandId, body = {}) {
      const b = brands.get(brandId);
      const groups = (Array.isArray(body.hashtagGroups) ? body.hashtagGroups : []).slice(0, LIMITS.groups).map(g => ({
        id: clip(g && g.id, 40) || newId(),
        name: clip(g && g.name, 40),
        tags: [...new Set((Array.isArray(g && g.tags) ? g.tags : String((g && g.tags) || '').split(/[\s,]+/)).map(cleanTag).filter(Boolean))].slice(0, LIMITS.tags)
      })).filter(g => g.name && g.tags.length);
      const signatures = (Array.isArray(body.signatures) ? body.signatures : []).slice(0, LIMITS.signatures).map(x => ({
        id: clip(x && x.id, 40) || newId(),
        name: clip(x && x.name, 40),
        text: String((x && x.text) || '').trim().slice(0, LIMITS.signatureLen)
      })).filter(x => x.name && x.text);
      const words = banned(b.id).filter(Boolean);
      const hay = fold([...groups.flatMap(g => [g.name, ...g.tags]), ...signatures.flatMap(x => [x.name, x.text])].join(' '));
      const hits = words.filter(w => hay.includes(fold(w)));
      if (hits.length) throw badRequest(`Yasaklı kelime geçiyor: ${hits.join(', ')}. Marka hafızasındaki yasaklı kelimeler setlerde kullanılamaz.`);
      const out = { hashtagGroups: groups, signatures };
      db.prepare('UPDATE brands SET caption_sets = ? WHERE id = ?').run(JSON.stringify(out), b.id);
      brands.logActivity(b.id, 'caption.sets', 'Hashtag ve imza setleri güncellendi');
      return out;
    }
  };
}
