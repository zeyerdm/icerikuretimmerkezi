// 7.3 Maskot karakter kitabı: maskotun sabit tanımı (İngilizce görünüş tarifi, renkler, oranlar, kıyafet, kişilik,
// konuşma örnekleri, yapmaz listesi) ve referans pozları. Kütüphanedeki maskot görsellerinden AI ile taslak çıkarılabilir
// (kaydedilmez; kullanıcı düzeltip kaydeder). Kitap, maskotlu görsel üretiminde ve maskot/Reels prompt'larında otomatik kullanılır.
import fs from 'node:fs';
import { badRequest, parseJson, HEX } from '../lib/http.js';
import { polish } from './reels/rules.js';

const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (v, n, len) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => clip(x, len)).filter(Boolean).slice(0, n);

export function cleanBook(b = {}) {
  const out = {
    name: clip(b.name, 60),
    lookEn: clip(b.lookEn, 700),
    colors: (Array.isArray(b.colors) ? b.colors : String(b.colors || '').split(/[\s,]+/)).filter(c => HEX.test(String(c))).map(c => String(c).toLowerCase()).slice(0, 6),
    proportions: clip(b.proportions, 200),
    outfit: clip(b.outfit, 200),
    personality: clip(b.personality, 300),
    speech: list(b.speech, 6, 160),
    never: list(b.never, 8, 120),
    poseAssetIds: (Array.isArray(b.poseAssetIds) ? b.poseAssetIds : []).map(String).slice(0, 6)
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => (Array.isArray(v) ? v.length : v)));
}

// Görsel üretim istemine giren sabit tarif (İngilizce)
export function bookImageLine(book) {
  if (!book || !book.lookEn) return '';
  return [`The mascot${book.name ? ` "${book.name}"` : ''} must look exactly like this: ${book.lookEn}`,
    book.proportions ? `Proportions: ${book.proportions}.` : '', book.outfit ? `Outfit: ${book.outfit}.` : '',
    book.never && book.never.length ? `Never: ${book.never.join('; ')}.` : ''].filter(Boolean).join(' ');
}

// Prompt Studio / Reels istemine giren Türkçe özet
export function bookBlock(book) {
  if (!book || !Object.keys(book).length) return '';
  const l = [];
  if (book.lookEn) l.push(`Görünüş (sabit İngilizce tarif, prompt'a aynen koy): ${book.lookEn}`);
  if (book.proportions) l.push(`Oranlar: ${book.proportions}`);
  if (book.outfit) l.push(`Kıyafet: ${book.outfit}`);
  if (book.colors && book.colors.length) l.push(`Renkler: ${book.colors.join(', ')} (prompt'ta adıyla tarif et)`);
  if (book.personality) l.push(`Kişilik: ${book.personality}`);
  if (book.speech && book.speech.length) l.push(`Konuşma örnekleri: ${book.speech.map(s => `"${s}"`).join(' / ')}`);
  if (book.never && book.never.length) l.push(`Asla: ${book.never.join('; ')}`);
  return `MASKOT KARAKTER KİTABI${book.name ? ` (${book.name})` : ''}:\n- ${l.join('\n- ')}`;
}

export function createCharacterBookService({ db, ai, brands, assets }) {
  const read = id => parseJson((db.prepare('SELECT character_book FROM brands WHERE id = ?').get(id) || {}).character_book, {}) || {};
  return {
    get(brandId) { return read(brands.get(brandId).id); },
    set(brandId, body) {
      const b = brands.get(brandId);
      const book = cleanBook(body);
      const mine = new Set(assets.list(b.id).map(a => a.id));
      if ((book.poseAssetIds || []).some(id => !mine.has(id))) throw badRequest('Pozlar yalnız bu markanın kütüphanesinden seçilebilir.');
      db.prepare('UPDATE brands SET character_book = ? WHERE id = ?').run(JSON.stringify(book), b.id);
      brands.logActivity(b.id, 'mascot.book', 'Maskot karakter kitabı güncellendi');
      return book;
    },
    // Kütüphanedeki maskot görsellerinden (en çok 3) taslak; kaydedilmez
    async draft(brandId, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      const book = read(b.id);
      const pics = (book.poseAssetIds && book.poseAssetIds.length ? book.poseAssetIds.map(id => assets.list(b.id).find(a => a.id === id)).filter(Boolean) : assets.list(b.id, 'mascot')).slice(0, 3);
      if (!pics.length) throw badRequest('Önce Kütüphane\'ye maskot pozu yükle (kategori: Maskot pozu).');
      const images = pics.map(a => { const f = assets.file(b.id, a.id); return { mime: f.mime, data: fs.readFileSync(f.path) }; }).filter(i => /^image\/(png|jpeg|webp)$/.test(i.mime));
      const prompt = [
        'MASKOT KARAKTER KİTABI TASLAĞI',
        `Ekteki görseller '${b.name}' markasının maskotunun pozları. Görsel üretim modellerinin maskotu her seferinde aynı çizmesi için karakter kitabı taslağı çıkar.`,
        '"lookEn": tek paragraf, İNGİLİZCE, yalnız görünen özellikler: vücut şekli, yüz ve gözler, renkler (adıyla), malzeme/doku, ayırt edici detaylar. Uydurma.',
        '"proportions" ve "outfit" kısa İngilizce; "personality" Türkçe 1-2 cümle (duruş ve ifadeden sezilebilen); "speech" 3 kısa Türkçe örnek replik; "never" 3-5 madde (tasarımı bozacak şeyler, ör. renk değiştirme).',
        '"colors": görsellerde gördüğün ana renklerin HEX kodları (en çok 5).',
        'Sadece şu JSON biçiminde yanıt ver:',
        JSON.stringify({ name: '', lookEn: '', proportions: '', outfit: '', colors: ['#000000'], personality: '', speech: [''], never: [''] })
      ].join('\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.3, images });
      const o = r.output || {};
      const d = cleanBook(Object.assign({}, o, { name: polish(o.name) || book.name, poseAssetIds: pics.map(a => a.id) }));
      return { draft: d, ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms } };
    }
  };
}
