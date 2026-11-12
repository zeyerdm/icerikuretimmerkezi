// 9.3–9.9 Tek akışta marka kurulumu ve Marka dosyası.
// Dijital kimlik, hafıza, prompt kimliği ve maskot ayrı ayrı doldurulmaz: sihirbaz soruları sırayla sorar, cevaplara göre
// sonraki adımları açar (maskot varsa maskot adımı, görsel içerik varsa görsel dil, video varsa video adımı, mekân varsa
// adres/saat). Cevaplar yeni bir yere değil, var olan kaynaklara yazılır (marka profili, hafıza, prompt kimliği, karakter
// kitabı); böylece kurulumdan sonra her şey Marka kimliği sayfasında tek yerde görünür ve oradan düzenlenir.
import { badRequest, notFound, parseJson, HEX } from '../lib/http.js';
import { transaction } from '../db.js';

export const CHANNELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X (Twitter)', blog: 'Web sitesi / blog' };
export const CONTENT_KINDS = { post: 'Tek görselli post', carousel: 'Kaydırmalı post (carousel)', story: 'Hikâye (story)', reels: 'Reels / kısa video', video: 'Uzun video', yazi: 'Yazı / blog' };
const VISUAL = ['post', 'carousel', 'story', 'reels', 'video'];
const hasVideo = s => (s.contentKinds || []).some(k => k === 'reels' || k === 'video') || (s.channels || []).some(c => c === 'tiktok' || c === 'youtube');

// Bilgiler adımının sabit kartları (aynı başlıkla yeniden kaydedilince güncellenir, çoğalmaz)
const FACT_SLOTS = {
  urunler: { category: 'urun', title: 'Ürün ve hizmetler' },
  hikaye: { category: 'hikaye', title: 'Marka hikâyesi' },
  adres: { category: 'iletisim', title: 'Adres ve iletişim', place: true },
  saatler: { category: 'saat', title: 'Çalışma saatleri', place: true }
};

// Adımlar: applies cevaplara göre adımın açılıp açılmadığını söyler
export const STEPS = [
  { id: 'temel', label: 'Marka', title: 'Bu ne markası?', applies: () => true },
  { id: 'yapi', label: 'Yapı', title: 'Nerede, neyle anlatacağız?', applies: () => true },
  { id: 'kitle', label: 'Kitle ve hedef', title: 'Kime sesleniyoruz, ne istiyoruz?', applies: () => true },
  { id: 'ses', label: 'Ses ve dil', title: 'Marka nasıl konuşur?', applies: () => true },
  { id: 'gorsel', label: 'Logo ve renkler', title: 'Marka nasıl görünür?', applies: () => true },
  { id: 'maskot', label: 'Maskot', title: 'Maskotu tanıyalım', applies: s => s.hasMascot === true },
  { id: 'gorseldil', label: 'Görsel dil', title: 'Görseller nasıl olsun?', applies: s => (s.contentKinds || []).some(k => VISUAL.includes(k)) },
  { id: 'video', label: 'Video', title: 'Videolar nasıl çekilsin?', applies: hasVideo },
  { id: 'bilgiler', label: 'Bilgiler', title: 'Yapay zekâ neleri bilmeli?', applies: () => true }
];
const STEP = Object.fromEntries(STEPS.map(s => [s.id, s]));

const pickKeys = (v, dict) => [...new Set((Array.isArray(v) ? v : []).map(String).filter(k => dict[k]))];
const bool = v => v === true || v === 'true' || v === 'on' || v === 1;
const lines = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => String(x).trim()).filter(Boolean);

export function createBrandSetupService({ db, brands, memory, identity, characterBook, assets }) {
  // Maskot cevabının tek doğrusu prompt kimliğidir (Maskot sekmesinden kapatılırsa kurulum da "yok" görür)
  const read = id => {
    const s = Object.assign({ channels: [], contentKinds: [], hasMascot: null, hasPlace: null, done: [] },
      parseJson((db.prepare('SELECT setup FROM brands WHERE id = ?').get(id) || {}).setup, {}) || {});
    s.hasMascot = identity.get(id).hasMascot ? true : (s.hasMascot == null ? null : false);
    return s;
  };
  const write = (id, s) => db.prepare('UPDATE brands SET setup = ? WHERE id = ?').run(JSON.stringify(s), id);
  const mergeIdentity = (id, patch) => identity.set(id, Object.assign({}, identity.get(id), patch));

  // Her adımın eksikleri: kaydedilmiş veriden hesaplanır (sihirbaz dışında doldurulanlar da sayılır)
  function needsOf(stepId, ctx) {
    const { brand: b, setup: s, counts, mem, idt, book } = ctx;
    const n = [];
    const want = (ok, label) => { if (!ok) n.push(label); };
    if (stepId === 'temel') { want(b.sector, 'Sektör'); want(b.description, 'Marka açıklaması'); }
    if (stepId === 'yapi') { want(s.channels.length, 'Kanallar'); want(s.contentKinds.length, 'İçerik türleri'); want(s.hasMascot !== null, 'Maskot var mı?'); }
    if (stepId === 'kitle') { want(b.audience, 'Hedef kitle'); want(b.goals, 'İçerik hedefleri'); }
    if (stepId === 'ses') { want(b.character, 'Marka karakteri'); want(b.tone, 'İletişim dili'); }
    if (stepId === 'gorsel') { want(counts.logo, 'Logo'); want(b.colors.primary, 'Ana renk'); want(b.fonts.heading && b.fonts.body, 'Fontlar'); }
    if (stepId === 'maskot') { want(idt.mascotName || book.name, 'Maskotun adı'); want(counts.mascot, 'Maskot pozları'); want(idt.mascotLook || book.lookEn, 'Maskotun görünüşü'); }
    if (stepId === 'gorseldil') { want(idt.visualStyle, 'Görsel stil'); want((idt.mood || []).length, 'His'); }
    if (stepId === 'video') want(idt.camera, 'Kamera dili');
    if (stepId === 'bilgiler') want(mem.facts.length, 'En az bir bilgi kartı');
    return n;
  }

  const service = {
    channels: CHANNELS,
    contentKinds: CONTENT_KINDS,
    status(brandId) {
      const b = brands.get(brandId);
      const setup = read(b.id);
      const ctx = { brand: b, setup, counts: brands.assetCounts(b.id), mem: memory.get(b.id), idt: identity.get(b.id), book: characterBook.get(b.id) };
      // Bir adım cevaplandıysa ya da verisi zaten eksiksizse tamam sayılır (kurulmuş markada yalnız boşlar sorulur)
      const steps = STEPS.filter(st => st.applies(setup)).map(st => {
        const needs = needsOf(st.id, ctx);
        return { id: st.id, label: st.label, title: st.title, done: setup.done.includes(st.id) || !needs.length, needs };
      });
      const doneCount = steps.filter(s => s.done).length;
      return {
        setup, steps,
        started: setup.done.length > 0 || steps.some(s => s.done),
        complete: steps.every(s => s.done),
        percent: Math.round((doneCount / steps.length) * 100),
        // "Eksikleri tamamla": önce atlanmış adım, sonra eksiği olan ilk adım
        next: (steps.find(s => !s.done) || steps.find(s => s.needs.length) || {}).id || null
      };
    },
    // Marka dosyası: bütün kimlik tek çağrıda (özet sayfası ve sihirbazın ön doldurması için)
    dossier(brandId) {
      const b = brands.get(brandId);
      const logo = assets.list(b.id, 'logo')[0];
      const mascots = assets.list(b.id, 'mascot');
      return Object.assign(service.status(b.id), {
        brand: b,
        memory: memory.get(b.id),
        identity: identity.get(b.id),
        book: characterBook.get(b.id),
        assetCounts: brands.assetCounts(b.id),
        logo: logo ? { id: logo.id, url: logo.url } : null,
        mascots: mascots.slice(0, 12).map(a => ({ id: a.id, url: a.thumbUrl || a.url, label: a.label })),
        questions: identity.questions,
        options: { channels: CHANNELS, contentKinds: CONTENT_KINDS }
      });
    },
    save(brandId, stepId, body = {}) {
      const b = brands.get(brandId);
      const st = STEP[stepId];
      if (!st) throw notFound('Kurulum adımı bulunamadı.');
      const setup = read(b.id);
      if (!st.applies(setup)) throw badRequest('Bu adım verdiğin cevaplara göre gerekmiyor.');
      const has = k => k in body;
      transaction(db, () => {
        if (stepId === 'temel') brands.update(b.id, Object.fromEntries(['name', 'sector', 'description', 'slogan'].filter(has).map(k => [k, body[k]])));
        if (stepId === 'yapi') {
          setup.channels = pickKeys(body.channels, CHANNELS);
          setup.contentKinds = pickKeys(body.contentKinds, CONTENT_KINDS);
          setup.hasMascot = bool(body.hasMascot);
          setup.hasPlace = bool(body.hasPlace);
          // Maskot cevabı prompt kimliğiyle aynı kalsın (tek doğru)
          if (Boolean(identity.get(b.id).hasMascot) !== setup.hasMascot) mergeIdentity(b.id, { hasMascot: setup.hasMascot });
          // Artık geçerli olmayan adımlar tamamlanmış sayılmaz
          setup.done = setup.done.filter(id => STEP[id] && STEP[id].applies(setup));
        }
        if (stepId === 'kitle') brands.update(b.id, Object.fromEntries(['audience', 'goals', 'competitors', 'monthlyGoal'].filter(has).map(k => [k, body[k]])));
        if (stepId === 'ses') {
          brands.update(b.id, Object.fromEntries(['character', 'tone'].filter(has).map(k => [k, body[k]])));
          const lists = Object.fromEntries(['banned', 'preferred'].filter(has).map(k => [k, body[k]]));
          if (Object.keys(lists).length) memory.setLists(b.id, lists);
        }
        if (stepId === 'gorsel') {
          const colors = Object.assign({}, b.colors);
          if (has('primary')) colors.primary = String(body.primary || '');
          if (has('secondary')) colors.secondary = (Array.isArray(body.secondary) ? body.secondary : []).filter(c => HEX.test(String(c)));
          const fonts = Object.assign({}, b.fonts, Object.fromEntries(['heading', 'body'].filter(k => has('font_' + k)).map(k => [k, body['font_' + k] || ''])));
          brands.update(b.id, { colors, fonts });
        }
        if (stepId === 'maskot') {
          const name = String(body.name || '').trim();
          const never = lines(body.never);
          mergeIdentity(b.id, { hasMascot: true, mascotName: name, mascotLook: body.look || '', mascotVoice: body.voice || '', mascotMoves: body.moves || '', mascotNever: never.join('; ') });
          characterBook.set(b.id, Object.assign({}, characterBook.get(b.id), { name, personality: body.personality || '', speech: lines(body.speech), never }));
        }
        if (stepId === 'gorseldil') mergeIdentity(b.id, Object.fromEntries(['visualStyle', 'lighting', 'colors', 'mood', 'people', 'avoid'].filter(has).map(k => [k, body[k]])));
        if (stepId === 'video') mergeIdentity(b.id, Object.fromEntries(['camera', 'places'].filter(has).map(k => [k, body[k]])));
        if (stepId === 'bilgiler') {
          const facts = memory.get(b.id).facts;
          for (const [key, slot] of Object.entries(FACT_SLOTS)) {
            if (!has(key) || (slot.place && !setup.hasPlace)) continue;
            const content = String(body[key] || '').trim();
            const cur = facts.find(f => f.category === slot.category && f.title === slot.title);
            if (cur && content) memory.updateFact(b.id, cur.id, { content });
            else if (cur && !content) memory.removeFact(b.id, cur.id);
            else if (content) memory.addFact(b.id, { category: slot.category, title: slot.title, content });
          }
        }
        if (!setup.done.includes(stepId)) setup.done.push(stepId);
        setup.updatedAt = new Date().toISOString();
        write(b.id, setup);
      });
      const s = service.status(b.id);
      if (s.complete && !setup.completedAt) {
        setup.completedAt = new Date().toISOString();
        write(b.id, setup);
        brands.logActivity(b.id, 'brand.setup', 'Marka kurulumu tamamlandı');
        s.setup = setup;
      }
      return s;
    }
  };
  return service;
}
