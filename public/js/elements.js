// Öğe kütüphanesi: merkezi kayıt (public/vendor/packs/registry.json), paketlerin tembel yüklenmesi, Türkçe eş
// anlamlı arama, son kullanılanlar, favoriler ve kullanım sayısı (bu tarayıcıda). Öğeler düzenleyiciye SVG vektör
// katmanı olarak eklenir; tek renkli paketlerde renk değiştirilebilir. Yönetim panelinden yüklenen öğeler
// /api/elements'tan gelir (SVG ise vektör, PNG/WebP/GIF ise görsel katmanı).
import { TR_EN } from './stockPacks.js';

let registry = null;
const packCache = new Map();
let customCache = null;

export async function loadRegistry() {
  if (!registry) registry = fetch('/vendor/packs/registry.json').then(r => { if (!r.ok) throw new Error('Öğe kaydı yüklenemedi.'); return r.json(); }).catch(err => { registry = null; throw err; });
  return registry;
}

const fold = s => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]);
// Ek Türkçe eş anlamlılar (paket adları İngilizce olabilir; kelimenin hem kendisi hem karşılığı aranır)
const SYN = {
  sekil: 'shape', daire: 'circle', yuvarlak: 'circle', kare: 'square', ucgen: 'triangle', cizgi: 'line', cerceve: 'frame', balon: 'bubble', konusma: 'speech',
  etiket: 'tag', rozet: 'badge', desen: 'pattern', doku: 'texture', sus: 'decor', parilti: 'sparkle', isik: 'light', yildirim: 'lightning', simsek: 'lightning',
  sosyal: 'social', logo: 'logo', insan: 'people', kadin: 'woman', erkek: 'man', cocuk: 'child', aile: 'family', doktor: 'doctor', hastane: 'hospital', ilac: 'medicine',
  okul: 'school', ders: 'book', egitim: 'education', kalem: 'pen', defter: 'notebook', hesap: 'calculator', banka: 'bank', kart: 'card', cuzdan: 'wallet', indirim: 'discount',
  satis: 'sale', magaza: 'shop', kargo: 'truck', teslimat: 'delivery', paket: 'package', kutu: 'box', spor: 'sport', top: 'ball', futbol: 'football', kosu: 'run',
  yemek: 'food', icecek: 'drink', su: 'water', ekmek: 'bread', tatli: 'dessert', dondurma: 'ice-cream', seyahat: 'travel', bavul: 'luggage', otel: 'hotel', plaj: 'beach',
  hava: 'weather', firtina: 'storm', sicaklik: 'temperature', zaman: 'time', kronometre: 'stopwatch', grafik: 'chart', veri: 'data', bulut: 'cloud', guvenlik: 'safe',
  kalkan: 'shield', anahtar: 'key', muzik: 'music', nota: 'music', oyun: 'game', hediye: 'gift', yildiz: 'star', kalp: 'heart', begen: 'like', yorum: 'comment', paylas: 'share',
  mockup: 'mockup', telefon: 'phone', dizustu: 'laptop', tablet: 'tablet', monitor: 'monitor', ekran: 'ekran', arayuz: 'arayuz', pencere: 'browser',
  dalga: 'wave', yay: 'arc', blob: 'blob', izgara: 'grid', puan: 'rating', kampanya: 'kampanya', vurgu: 'vurgu', tik: 'check'
};
const alts = w => { const f = fold(w); return [...new Set([w, f, TR_EN[w], TR_EN[f], SYN[f]].filter(Boolean))]; };

// Paket verisini ortak öğe biçimine çevirir: { id, pack, group, name, keys, recolor, vb, svg(color) }
function normalize(pack, data) {
  const out = [];
  const wrap = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;
  if (pack.format === 'items') {
    for (const it of data.items) {
      const vb = it.v || data.v || '0 0 100 100';
      out.push({ id: `${pack.id}:${it.i}`, pack: pack.id, group: it.g, name: it.n, keys: fold(`${it.n} ${it.t || ''}`), recolor: !!pack.recolor, vb, svg: () => wrap(vb, it.b) });
    }
  } else if (pack.format === 'legacy-sticker') {
    for (const p of data.packs) for (const it of p.items) {
      const vb = (it.svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 120 120';
      out.push({ id: `${pack.id}:${it.id}`, pack: pack.id, group: p.id, name: it.name, keys: fold(`${it.name} ${it.k.join(' ')}`), recolor: false, vb, svg: () => it.svg });
    }
  } else {
    for (const p of data.packs) for (const [name, body, h] of p.items) {
      const vb = `0 0 ${data.w} ${h || data.h}`;
      out.push({ id: `${pack.id}:${name}`, pack: pack.id, group: pack.format === 'legacy-icon' ? '*' : p.id, name: name.replace(/-/g, ' '), keys: fold(name.replace(/-/g, ' ')), recolor: !!pack.recolor, vb, svg: () => wrap(vb, body) });
    }
  }
  return out;
}

export async function loadPack(id) {
  const reg = await loadRegistry();
  const pack = reg.packs.find(p => p.id === id);
  if (!pack) return [];
  if (!packCache.has(id)) packCache.set(id, fetch(`/vendor/packs/${pack.file}`).then(r => { if (!r.ok) throw new Error('Paket yüklenemedi.'); return r.json(); }).then(d => normalize(pack, d)).catch(err => { packCache.delete(id); throw err; }));
  return packCache.get(id);
}

// Yönetim panelinden yüklenen yayımdaki öğeler
export async function loadCustom(api, force = false) {
  if (!customCache || force) customCache = api.elements().then(r => r.elements.map(e => ({ id: `custom:${e.id}`, pack: 'custom', group: e.category || 'diger', name: e.name, keys: fold(`${e.name} ${(e.tags || []).join(' ')} ${e.categoryLabel || ''}`), recolor: !!e.recolor, vb: e.viewBox || '0 0 100 100', custom: e, createdAt: e.createdAt, svg: e.svg ? () => e.svg : null, url: e.url }))).catch(() => []);
  return customCache;
}

export async function itemsFor(sub, api) {
  if (sub.pack === 'custom') return (await loadCustom(api)).filter(it => sub.group === '*' || it.group === sub.group);
  const list = await loadPack(sub.pack);
  return sub.group === '*' ? list : list.filter(it => it.group === sub.group);
}

export async function allItems(api) {
  const reg = await loadRegistry();
  const lists = await Promise.all(reg.packs.map(p => loadPack(p.id).catch(() => [])));
  return [...(await loadCustom(api)), ...lists.flat()];
}

export function search(items, q) {
  const words = fold(q).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const terms = String(q).trim().toLocaleLowerCase('tr').split(/\s+/).map(alts);
  return items.filter(it => terms.every(a => a.some(t => it.keys.includes(fold(t)))));
}

// Bu tarayıcıdaki kullanım bilgisi (son kullanılanlar, favoriler, kullanım sayısı)
const KEY = 'ium.elements';
function store() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* özel pencere: yok say */ } }
export function usage() { const s = store(); return { recent: s.recent || [], fav: s.fav || [], count: s.count || {} }; }
export function markUsed(id) {
  const s = store(); s.recent = [id, ...(s.recent || []).filter(x => x !== id)].slice(0, 40);
  s.count = s.count || {}; s.count[id] = (s.count[id] || 0) + 1; save(s);
}
export function toggleFav(id) {
  const s = store(); const f = s.fav || []; s.fav = f.includes(id) ? f.filter(x => x !== id) : [id, ...f].slice(0, 200); save(s); return s.fav.includes(id);
}
export async function byIds(ids, api) {
  const packs = [...new Set(ids.map(id => id.split(':')[0]))];
  const lists = await Promise.all(packs.map(p => (p === 'custom' ? loadCustom(api) : loadPack(p).catch(() => []))));
  const map = new Map(lists.flat().map(it => [it.id, it]));
  return ids.map(id => map.get(id)).filter(Boolean);
}

// Görünüm kutusundan en-boy oranı
export const ratioOf = vb => { const p = String(vb || '').split(/[\s,]+/).map(Number); return p.length === 4 && p[2] > 0 && p[3] > 0 ? p[3] / p[2] : 1; };
export const previewSvg = (it, color) => { const s = it.svg(); return it.recolor ? s.replace(/currentColor/g, color) : s.replace(/currentColor/g, '#1b1f3b'); };
