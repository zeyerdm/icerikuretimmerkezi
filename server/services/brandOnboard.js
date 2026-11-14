// 11.1–11.4 Marka kurarken karşılama sohbeti: önce elindekileri at, yapay zekâ doldurabildiğini doldursun, yalnız eksikler
// sorulsun, kurulum bitince boş sayfa kalmasın.
// - absorb: atılan görseller türlerine göre kütüphaneye yerleşir (logo, maskot, palet, referans, ürün…); tarayıcının
//   görsellerden çıkardığı renkler boş renk alanlarına yazılır; yapıştırılan metinden (web sitesi, biyografi) boş profil
//   alanları, maskot görsellerinden karakter kitabı doldurulur (AI bağlıysa); içerik fikirleri havuza girer.
// - questions: yalnız hâlâ boş olan bilgiler için sorular (hazır seçenekli). Maskot görseli atıldıysa "maskot var mı?",
//   renk çıktıysa renk, logo atıldıysa logo sorulmaz. Cevaplanan ya da geçilen soru bir daha sorulmaz.
// - finish: AI bağlıysa fikir havuzu benzerleriyle çoğaltılır, tasarım referansından örnek şablon çıkarılır.
// Bütün cevaplar var olan kaynaklara yazılır (profil, hafıza, prompt kimliği, karakter kitabı, kurulum durumu).
import { badRequest, notFound, parseJson, HEX } from '../lib/http.js';
import { CHOICES } from './choices.js';
import { IDEA_FORMATS } from './ideas.js';

// Atılan görselin türü → kütüphane kategorisi
export const DROP_KINDS = { logo: 'logo', maskot: 'mascot', palet: 'reference', referans: 'reference', urun: 'product', gorsel: 'brand_image', diger: 'other' };
const DROP_LABELS = { logo: 'Logo', maskot: 'Maskot', palet: 'Renk paleti', referans: 'Tasarım referansı', urun: 'Ürün fotoğrafı', gorsel: 'Marka görseli', diger: 'Diğer' };

const guessFormat = t => (/reels|video|kısa video|tiktok/i.test(t) ? 'reels' : /youtube/i.test(t) ? 'youtube' : /story|hikâye|hikaye/i.test(t) ? 'story' : /post|carousel|gönderi/i.test(t) ? 'post' : 'genel');
const list = v => (Array.isArray(v) ? v : String(v || '').split(/[,\n]+/)).map(x => String(x).trim()).filter(Boolean);

export function createBrandOnboardService({ db, ai, brands, assets, memory, identity, characterBook, ideas, setup, identityDraft, designRef }) {
  const readState = id => Object.assign({ absorbed: false, skipped: [], answered: [], finished: false, references: [] },
    (parseJson((db.prepare('SELECT setup FROM brands WHERE id = ?').get(id) || {}).setup, {}) || {}).onboard || {});
  const writeState = (id, st) => {
    const s = parseJson((db.prepare('SELECT setup FROM brands WHERE id = ?').get(id) || {}).setup, {}) || {};
    s.onboard = st;
    db.prepare('UPDATE brands SET setup = ? WHERE id = ?').run(JSON.stringify(s), id);
  };
  const aiOn = () => { try { return ai.overview().providers.some(p => p.configured); } catch { return false; } };
  const mergeIdentity = (id, patch) => identity.set(id, Object.assign({}, identity.get(id), patch));
  const meta = r => (r ? { model: r.servedRef || r.ref || r.model, modelLabel: r.modelLabel || (ai.labelOf ? ai.labelOf(r.servedRef || r.ref) : '') } : null);

  // Sorular: yalnız eksikler, sırayla. type: one (tek seçim) | many (çoklu) | text | color | yesno | upload
  function questions(brandId) {
    const b = brands.get(brandId);
    const st = readState(b.id);
    const done = new Set([...st.skipped, ...st.answered]);
    const s = setup.status(b.id).setup;
    const counts = brands.assetCounts(b.id);
    const idt = identity.get(b.id);
    const book = characterBook.get(b.id);
    const mem = memory.get(b.id);
    const q = [];
    const add = (key, cond, def) => { if (cond && !done.has(key)) q.push(Object.assign({ key }, def)); };
    add('sector', !b.sector, { type: 'one', label: 'Bu ne markası?', options: CHOICES.sector, other: true });
    add('description', !b.description, { type: 'text', label: 'Marka ne yapıyor, neyi farklı yapıyor? (bir iki cümle)', long: true });
    add('logo', !counts.logo, { type: 'upload', label: 'Logon var mı? Varsa buraya at.', category: 'logo' });
    add('hasMascot', !counts.mascot && idt.hasMascot === undefined && s.hasMascot == null, { type: 'yesno', label: 'Markanın bir maskotu var mı?', yes: 'Evet, var', no: 'Hayır' });
    add('mascotUpload', (idt.hasMascot || s.hasMascot) && !counts.mascot, { type: 'upload', label: 'Maskotun görsellerini at (farklı pozlar olursa daha iyi).', category: 'mascot', multiple: true });
    add('mascotName', (idt.hasMascot || counts.mascot) && !(idt.mascotName || book.name), { type: 'text', label: 'Maskotun adı ne?' });
    add('mascotPersonality', (idt.hasMascot || counts.mascot) && !book.personality, { type: 'many', label: 'Maskot nasıl bir karakter?', options: CHOICES.mascotPersonality, other: true });
    add('colors', !b.colors.primary, { type: 'color', label: 'Markanın ana rengi ne?' });
    add('channels', !s.channels.length, { type: 'many', label: 'Hangi kanallarda paylaşıyorsun?', options: Object.values(setup.channels), values: Object.keys(setup.channels) });
    add('contentKinds', !s.contentKinds.length, { type: 'many', label: 'Ne tür içerikler üreteceğiz?', options: Object.values(setup.contentKinds), values: Object.keys(setup.contentKinds) });
    add('audience', !b.audience, { type: 'many', label: 'Kime sesleniyoruz?', options: CHOICES.audience, other: true });
    add('goals', !b.goals, { type: 'many', label: 'İçeriklerden ne bekliyoruz?', options: CHOICES.goals, other: true });
    add('character', !b.character, { type: 'many', label: 'Marka bir insan olsaydı nasıl biri olurdu?', options: CHOICES.character, other: true });
    add('tone', !b.tone, { type: 'many', label: 'Nasıl konuşsun?', options: CHOICES.tone, other: true });
    add('banned', !mem.banned.length, { type: 'many', label: 'Metinlerde neler asla geçmesin?', options: CHOICES.banned, other: true, optional: true });
    add('hasPlace', s.hasPlace == null, { type: 'yesno', label: 'Müşterinin geldiği bir mekân var mı? (dükkân, kafe, klinik…)', yes: 'Evet', no: 'Hayır, çevrim içi' });
    add('ideas', !ideas.list(b.id).length, { type: 'text', label: 'Aklında içerik fikirleri var mı? Her satıra bir fikir yaz (en az 2-3 tane yazarsan benzerlerini ben üretirim).', long: true, optional: true });
    return q;
  }

  const join = v => list(v).join(', ');
  function applyAnswer(b, key, value) {
    const s = setup.status(b.id).setup;
    if (key === 'sector') brands.update(b.id, { sector: String(value || '').slice(0, 120) });
    else if (key === 'description') brands.update(b.id, { description: String(value || '').slice(0, 1500) });
    else if (key === 'audience' || key === 'goals' || key === 'character' || key === 'tone') brands.update(b.id, { [key]: join(value).slice(0, 1000) });
    else if (key === 'colors') {
      const v = list(value).filter(c => HEX.test(c)).map(c => c.toLowerCase());
      if (!v.length) throw badRequest('Renk #RRGGBB biçiminde olmalı.');
      brands.update(b.id, { colors: Object.assign({}, b.colors, { primary: v[0], secondary: v.slice(1, 7) }) });
    } else if (key === 'hasMascot') {
      const yes = value === true || value === 'true';
      mergeIdentity(b.id, { hasMascot: yes });
      setup.save(b.id, 'yapi', { channels: s.channels, contentKinds: s.contentKinds, hasMascot: yes, hasPlace: Boolean(s.hasPlace) });
    } else if (key === 'hasPlace') {
      setup.save(b.id, 'yapi', { channels: s.channels, contentKinds: s.contentKinds, hasMascot: Boolean(s.hasMascot), hasPlace: value === true || value === 'true' });
    } else if (key === 'channels' || key === 'contentKinds') {
      setup.save(b.id, 'yapi', Object.assign({ channels: s.channels, contentKinds: s.contentKinds, hasMascot: Boolean(s.hasMascot), hasPlace: Boolean(s.hasPlace) }, { [key]: list(value) }));
    } else if (key === 'mascotName') {
      const name = String(value || '').trim().slice(0, 60);
      mergeIdentity(b.id, { hasMascot: true, mascotName: name });
      characterBook.set(b.id, Object.assign({}, characterBook.get(b.id), { name }));
    } else if (key === 'mascotPersonality') {
      characterBook.set(b.id, Object.assign({}, characterBook.get(b.id), { personality: join(value).slice(0, 300) }));
    } else if (key === 'banned') {
      const items = list(value);
      memory.setLists(b.id, { banned: [...new Set([...memory.get(b.id).banned, ...items])] });
      if (items.some(x => /ünlü|gerçek kişi/i.test(x))) mergeIdentity(b.id, { noRealPeople: true });
    } else if (key === 'ideas') {
      for (const t of String(value || '').split('\n').map(x => x.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 30)) {
        try { ideas.create(b.id, { title: t.slice(0, 200), category: 'bilgilendirici', format: guessFormat(t) }, 'manual'); } catch { /* geçersiz satır atlanır */ }
      }
    } else if (key === 'logo' || key === 'mascotUpload') { /* yükleme arayüzden; burada yalnız soru kapanır */ }
    else throw notFound('Soru bulunamadı.');
  }

  const service = {
    kinds: DROP_LABELS,
    state(brandId) {
      const b = brands.get(brandId);
      const st = readState(b.id);
      return { state: st, questions: st.absorbed ? questions(b.id) : [], aiReady: aiOn(), choices: CHOICES };
    },

    // Elindekileri at: files = [{ id, kind }], colors = { logo: [...], palette: [...] } (tarayıcı görselden çıkarır),
    // text = web sitesi / biyografi, ideas = satır satır fikirler
    async absorb(brandId, { files = [], colors = {}, text = '', ideas: ideaText = '', modelRef = null } = {}) {
      const b = brands.get(brandId);
      const st = readState(b.id);
      const found = [];
      const notes = [];
      const mine = new Set(assets.list(b.id).map(a => a.id));
      let mascotCount = 0;
      for (const f of (Array.isArray(files) ? files : []).slice(0, 40)) {
        const kind = DROP_KINDS[f && f.kind] ? f.kind : 'diger';
        if (!mine.has(String(f.id))) continue;
        assets.update(b.id, String(f.id), Object.assign({ category: DROP_KINDS[kind] }, kind === 'palet' ? { label: 'Renk paleti', tags: 'palet' } : {}));
        if (kind === 'maskot') mascotCount++;
        if (kind === 'referans') st.references = [...new Set([...st.references, String(f.id)])];
      }
      const byKind = k => (Array.isArray(files) ? files : []).filter(f => f && f.kind === k).length;
      if (byKind('logo')) found.push(`Logo (${byKind('logo')})`);
      if (mascotCount) {
        found.push(`Maskot görselleri (${mascotCount})`);
        mergeIdentity(b.id, { hasMascot: true });
        const s = setup.status(b.id).setup;
        setup.save(b.id, 'yapi', { channels: s.channels, contentKinds: s.contentKinds, hasMascot: true, hasPlace: Boolean(s.hasPlace) });
      }
      if (byKind('referans')) found.push(`Tasarım referansı (${byKind('referans')})`);
      if (byKind('urun') + byKind('gorsel')) found.push(`Marka ve ürün görselleri (${byKind('urun') + byKind('gorsel')})`);
      // Renkler: önce palet görseli, yoksa logo; yalnız boşsa yazılır
      const pal = list(colors.palette).filter(c => HEX.test(c));
      const logoCols = list(colors.logo).filter(c => HEX.test(c));
      const pick = (pal.length ? pal : logoCols).map(c => c.toLowerCase());
      const cur = brands.get(b.id);
      if (pick.length && !cur.colors.primary) {
        brands.update(b.id, { colors: Object.assign({}, cur.colors, { primary: pick[0], secondary: pick.slice(1, 6) }) });
        found.push(`Renk paleti (${pick.slice(0, 6).join(', ')})`);
      }
      // Yapıştırılan metinden profil (AI): yalnız boş alanlar
      const t = String(text || '').trim();
      if (t.length >= 40 && aiOn()) {
        try {
          const r = await identityDraft({ text: t, modelRef, brandId: b.id });
          const now = brands.get(b.id);
          const patch = Object.fromEntries(Object.entries(r.profile || {}).filter(([k, v]) => v && !now[k] && k !== 'name'));
          if (r.fonts && (r.fonts.heading || r.fonts.body) && !(now.fonts.heading && now.fonts.body)) patch.fonts = Object.assign({}, now.fonts, r.fonts);
          if (r.colors && r.colors.primary && !now.colors.primary) patch.colors = Object.assign({}, now.colors, r.colors);
          if (Object.keys(patch).length) { brands.update(b.id, patch); found.push(`Metinden marka bilgileri (${Object.keys(patch).length} alan)`); }
        } catch (err) { notes.push(`Metin okunamadı: ${err.message}`); }
      } else if (t && !brands.get(b.id).description) {
        brands.update(b.id, { description: t.slice(0, 1500) });
        found.push('Marka açıklaması (yapıştırdığın metin)');
      }
      // Maskot görsellerinden karakter kitabı (AI)
      if (mascotCount && aiOn()) {
        try {
          const r = await characterBook.draft(b.id, { modelRef });
          const prev = characterBook.get(b.id);
          characterBook.set(b.id, Object.assign({}, r.draft, prev, { lookEn: prev.lookEn || r.draft.lookEn }));
          if (r.draft.name && !identity.get(b.id).mascotName) mergeIdentity(b.id, { mascotName: r.draft.name });
          found.push('Maskotun görünüşü ve renkleri (karakter kitabı)');
        } catch (err) { notes.push(`Maskot okunamadı: ${err.message}`); }
      }
      // Fikirler
      const lines = String(ideaText || '').split('\n').map(x => x.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 30);
      let added = 0;
      for (const l of lines) { try { ideas.create(b.id, { title: l.slice(0, 200), category: 'bilgilendirici', format: guessFormat(l) }, 'manual'); added++; } catch { /* geçersiz satır */ } }
      if (added) found.push(`İçerik fikirleri (${added})`);
      st.absorbed = true;
      writeState(b.id, st);
      brands.logActivity(b.id, 'brand.onboard', 'Marka kurulumu: atılan dosya ve metinler işlendi');
      return Object.assign(service.state(b.id), { found, notes });
    },

    answer(brandId, key, { value, skip = false } = {}) {
      const b = brands.get(brandId);
      const st = readState(b.id);
      if (!skip) applyAnswer(b, String(key), value);
      const list2 = skip ? 'skipped' : 'answered';
      st[list2] = [...new Set([...st[list2], String(key)])];
      writeState(b.id, st);
      return service.state(b.id);
    },

    // Boş karşılamasın: fikir havuzu ve örnek tasarım
    async finish(brandId, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      const st = readState(b.id);
      const done = [];
      const notes = [];
      if (aiOn()) {
        const seeds = ideas.list(b.id).slice(0, 3);
        const target = 9;
        for (const seed of seeds) {
          if (ideas.list(b.id).length >= target) break;
          try { const r = await ideas.similar(b.id, seed.id, { count: 3, modelRef }); if (r.ideas.length) done.push(`"${seed.title}" fikrinin ${r.ideas.length} benzeri havuza eklendi`); } catch (err) { notes.push(`Fikir üretilemedi: ${err.message}`); break; }
        }
        if (!seeds.length) notes.push('İçerik fikri girilmediği için benzer fikir üretilmedi; asistandan fikir isteyebilirsin.');
        const ref = st.references.find(id => assets.list(b.id).some(a => a.id === id));
        if (ref) {
          try { const r = await designRef.analyze(b.id, { assetId: ref, modelRef, name: 'Örnek tasarım (referanstan)' }); done.push(`Referansından "${r.template.name}" şablonu hazırlandı (Post stüdyosu)`); st.exampleTemplateId = r.template.id; } catch (err) { notes.push(`Örnek tasarım hazırlanamadı: ${err.message}`); }
        }
      } else notes.push('Yapay zekâ bağlı olmadığı için benzer fikir ve örnek tasarım üretilmedi; bağlayınca Marka dosyasından tamamlayabilirsin.');
      st.finished = true;
      writeState(b.id, st);
      return Object.assign(service.state(b.id), { done, notes, formats: IDEA_FORMATS });
    }
  };
  return service;
}
