// Hazır paketler: çıkartmalar, emoji ve ikonlar (uygulamayla gelen SVG'ler, internet gerekmez).
// Seçilen öğe PNG'ye çevrilip markanın kütüphanesine "sticker" olarak kaydedilir; böylece dışa aktarma ve
// şablonlar her zamanki görsel katmanı gibi çalışır. Aynı öğe ikinci kez seçilince kütüphanedeki kopyası kullanılır.
const cache = new Map();

export const STOCK_KINDS = [['sticker', 'Çıkartma'], ['emoji', 'Emoji'], ['icon', 'İkon']];
const FILE = { sticker: 'stickers', emoji: 'emoji', icon: 'icons' };

export async function loadStock(kind) {
  if (!cache.has(kind)) {
    cache.set(kind, fetch(`/vendor/packs/${FILE[kind]}.json`).then(r => { if (!r.ok) throw new Error('Paket yüklenemedi.'); return r.json(); }).catch(err => { cache.delete(kind); throw err; }));
  }
  return cache.get(kind);
}

// Ortak öğe biçimi: { id, name, keys, svg(color) }
export function itemsOf(kind, data, packId) {
  const packs = packId ? data.packs.filter(p => p.id === packId) : data.packs;
  const out = [];
  for (const p of packs) {
    for (const it of p.items) {
      if (kind === 'sticker') out.push({ id: it.id, name: it.name, keys: `${it.name} ${it.k.join(' ')}`.toLocaleLowerCase('tr'), pack: p.name, svg: () => it.svg });
      else {
        const [name, body, h] = it;
        const vb = `0 0 ${data.w} ${h || data.h}`;
        const pretty = name.replace(/-/g, ' ');
        out.push({ id: name, name: pretty, keys: pretty, pack: p.name,
          svg: color => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${data.w}" height="${h || data.h}">${kind === 'icon' ? body.replace(/currentColor/g, color || '#1b1f3b') : body}</svg>` });
      }
    }
  }
  return out;
}

// Türkçe aramayı İngilizce anahtar kelimelere de çevirir (emoji ve ikon adları İngilizce)
const TR_EN = {
  kalp: 'heart', yildiz: 'star', yıldız: 'star', ok: 'arrow', gul: 'smil', gül: 'smil', gulen: 'smil', gülen: 'smil', kahkaha: 'laugh', uzgun: 'sad', üzgün: 'sad', kizgin: 'angry', kızgın: 'angry',
  ates: 'fire', ateş: 'fire', roket: 'rocket', kahve: 'coffee', cay: 'tea', çay: 'tea', kitap: 'book', para: 'money', dolar: 'dollar', alisveris: 'shopping', alışveriş: 'shopping', sepet: 'cart',
  telefon: 'phone', bilgisayar: 'computer', laptop: 'laptop', kod: 'code', kamera: 'camera', fotograf: 'photo', fotoğraf: 'photo', muzik: 'music', müzik: 'music', video: 'video', mikrofon: 'microphone',
  ev: 'home', araba: 'car', ucak: 'plane', uçak: 'plane', gunes: 'sun', güneş: 'sun', ay: 'moon', bulut: 'cloud', yagmur: 'rain', yağmur: 'rain', kar: 'snow', cicek: 'flower', çiçek: 'flower', agac: 'tree', ağaç: 'tree',
  kedi: 'cat', kopek: 'dog', köpek: 'dog', kus: 'bird', kuş: 'bird', balik: 'fish', balık: 'fish', ayi: 'bear', ayı: 'bear', pasta: 'cake', hediye: 'gift', balon: 'balloon', parti: 'party', kutlama: 'party',
  saat: 'clock', takvim: 'calendar', zil: 'bell', bildirim: 'bell', mesaj: 'message', posta: 'mail', eposta: 'mail', konum: 'map-pin', harita: 'map', arama: 'search', ayar: 'settings', kilit: 'lock',
  onay: 'check', tik: 'check', carpi: 'x', çarpı: 'x', arti: 'plus', artı: 'plus', soru: 'question', unlem: 'exclamation', ünlem: 'exclamation', uyari: 'alert', uyarı: 'alert', bilgi: 'info',
  el: 'hand', alkis: 'clap', alkış: 'clap', basparmak: 'thumb', başparmak: 'thumb', goz: 'eye', göz: 'eye', kupa: 'trophy', madalya: 'medal', hedef: 'target', grafik: 'chart', ampul: 'bulb', fikir: 'bulb',
  kullanici: 'user', kullanıcı: 'user', insan: 'person', kisi: 'person', kişi: 'person', bebek: 'baby', ogrenci: 'school', öğrenci: 'school', okul: 'school', is: 'briefcase', iş: 'briefcase', yemek: 'food', pizza: 'pizza', meyve: 'fruit'
};
export function searchItems(items, q) {
  const s = String(q || '').trim().toLocaleLowerCase('tr');
  if (!s) return items;
  const terms = s.split(/\s+/).map(w => [w, TR_EN[w]].filter(Boolean));
  return items.filter(it => terms.every(alts => alts.some(a => it.keys.includes(a))));
}

export const svgUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// SVG → kare PNG dosyası (kenar boşluğu korunur, oran bozulmaz)
export function svgToPng(svg, size = 512, name = 'paket') {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const k = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
      const w = (img.naturalWidth || size) * k; const h = (img.naturalHeight || size) * k;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      c.toBlob(b => (b ? resolve(new File([b], `${name}.png`, { type: 'image/png' })) : reject(new Error('Görsel hazırlanamadı.'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Görsel hazırlanamadı.'));
    img.src = svgUrl(svg);
  });
}
