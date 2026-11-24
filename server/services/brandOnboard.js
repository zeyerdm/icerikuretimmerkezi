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
import { IDEA_FORMATS, IDEA_CATEGORIES } from './ideas.js';
import { FACT_CATEGORIES } from './memory.js';
import { polish } from './reels/rules.js';

// Atılan görselin türü → kütüphane kategorisi
export const DROP_KINDS = { logo: 'logo', maskot: 'mascot', palet: 'reference', referans: 'reference', urun: 'product', gorsel: 'brand_image', diger: 'other' };
const DROP_LABELS = { logo: 'Logo', maskot: 'Maskot', palet: 'Renk paleti', referans: 'Tasarım referansı', urun: 'Ürün fotoğrafı', gorsel: 'Marka görseli', diger: 'Diğer' };

const guessFormat = t => (/reels|video|kısa video|tiktok/i.test(t) ? 'reels' : /youtube/i.test(t) ? 'youtube' : /story|hikâye|hikaye/i.test(t) ? 'story' : /post|carousel|gönderi/i.test(t) ? 'post' : 'genel');
const pick0 = colors => [...list(colors && colors.palette), ...list(colors && colors.logo)].some(c => HEX.test(c));
const list = v => (Array.isArray(v) ? v : String(v || '').split(/[,\n]+/)).map(x => String(x).trim()).filter(Boolean);

export function createBrandOnboardService({ db, ai, brands, assets, memory, identity, characterBook, ideas, setup, identityDraft, designRef, siteReader = null, readMs = 90000 }) {
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
      setup.save(b.id, 'yapi', { channels: s.channels, contentKinds: s.contentKinds, hasMascot: yes, hasPlace: s.hasPlace });
    } else if (key === 'hasPlace') {
      setup.save(b.id, 'yapi', { channels: s.channels, contentKinds: s.contentKinds, hasMascot: s.hasMascot, hasPlace: value === true || value === 'true' });
    } else if (key === 'channels' || key === 'contentKinds') {
      setup.save(b.id, 'yapi', Object.assign({ channels: s.channels, contentKinds: s.contentKinds, hasMascot: s.hasMascot, hasPlace: s.hasPlace }, { [key]: list(value) }));
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

  // Metinden (web sitesi / yapıştırılan yazı) bilgi kartları ve ilk içerik fikirleri: tek istek. Fikir havuzu boş başlamaz.
  async function digest(brandId, source, modelRef) {
    const b = brands.get(brandId);
    const s = setup.status(b.id).setup;
    const existing = ideas.list(b.id).map(i => i.title).slice(0, 60);
    const prompt = [
      'MARKA METNİNDEN BİLGİ VE İÇERİK FİKRİ ÇIKARMA',
      `Aşağıdaki metin "${b.name}" markasının web sitesinden ya da tanıtım yazısından alındı.`,
      '1) facts: Metinde AÇIKÇA geçen, içerik üretirken işe yarayacak somut bilgileri kart olarak çıkar (ürün ve hizmetler, fiyatlar, adres, çalışma saatleri, marka hikâyesi, sık sorulanlar, kampanyalar). Uydurma; metinde yoksa yazma. En fazla 12 kart; her biri kısa başlık + 1-3 cümle.',
      `   Kategoriler: ${Object.entries(FACT_CATEGORIES).map(([k, v]) => `${k} (${v})`).join(', ')}.`,
      '2) ideas: Bu bilgilere dayanan, markanın sosyal medyasında paylaşılabilecek 12 farklı içerik fikri üret. Her biri somut ve markaya özgü olsun (ürünü, hizmeti, hikâyeyi, sık sorulanı kullanan); genel geçer başlık yazma. Türleri karıştır.',
      `   Türler: ${Object.entries(IDEA_FORMATS).map(([k, v]) => `${k} (${v})`).join(', ')}${s.contentKinds.length ? ` (marka şu içerikleri üretiyor: ${s.contentKinds.join(', ')})` : ''}.`,
      `   Kategoriler: ${Object.entries(IDEA_CATEGORIES).map(([k, v]) => `${k} (${v})`).join(', ')}.`,
      existing.length ? `Havuzda zaten olanları tekrar etme:\n${existing.map(t => `- ${t}`).join('\n')}` : '',
      'Türkçe yaz.', '', `METİN:\n"""\n${String(source).slice(0, 20000)}\n"""`, '',
      'Sadece şu JSON biçiminde yanıt ver:',
      JSON.stringify({ facts: [{ category: 'urun', title: '', content: '' }], ideas: [{ title: '', description: 'Bir iki cümle: ne anlatılacak, nasıl', format: 'reels', category: 'egitici' }] })
    ].filter(x => x !== '').join('\n');
    const r = await ai.run({ task: 'fikir', brandId: b.id, prompt, json: true, modelRef, temperature: 0.7 });
    const o = r.output || {};
    const have = new Set(memory.get(b.id).facts.map(f => f.title.toLocaleLowerCase('tr-TR')));
    let facts = 0; let added = 0;
    for (const f of (Array.isArray(o.facts) ? o.facts : []).slice(0, 12)) {
      const title = polish(String((f && f.title) || '')).slice(0, 120); const content = String((f && f.content) || '').trim().slice(0, 2000);
      if (!title || !content || have.has(title.toLocaleLowerCase('tr-TR'))) continue;
      try { memory.addFact(b.id, { category: FACT_CATEGORIES[f.category] ? f.category : 'diger', title, content }); have.add(title.toLocaleLowerCase('tr-TR')); facts++; } catch { break; }
    }
    for (const it of (Array.isArray(o.ideas) ? o.ideas : []).slice(0, 15)) {
      const title = polish(String((it && it.title) || '')).slice(0, 200);
      if (!title) continue;
      const idea = ideas.create(b.id, { title, description: String((it && it.description) || '').slice(0, 2000), category: IDEA_CATEGORIES[it.category] ? it.category : 'bilgilendirici', format: IDEA_FORMATS[it.format] ? it.format : guessFormat(title) }, 'site');
      if (idea.similarTo) { try { ideas.remove(b.id, idea.id); } catch { /* yoksa geç */ } continue; }
      added++;
    }
    return { facts, ideas: added };
  }

  // Arka plan işi: her adım kendi sınırıyla, biri takılsa da öbürleri sürer; sonuçlar adım adım kaydedilir
  async function enrich(brandId, modelRef) {
    const push = (kind, msg) => { try { const st = readState(brandId); if (!st.ai) return; st.ai[kind].push(msg); writeState(brandId, st); } catch { /* marka silinmiş olabilir */ } };
    const withLimit = (p, label) => Promise.race([p, new Promise((_, no) => { const t = setTimeout(() => no(new Error(`${label} ${Math.round(readMs / 1000)} sn içinde bitmedi`)), readMs); if (t.unref) t.unref(); })]);
    try {
      const st0 = readState(brandId);
      const pending = st0.pending || {};
      const jobs = [];
      if (pending.text) {
        jobs.push(withLimit(identityDraft({ text: pending.text, modelRef, brandId }), 'Metin okuması').then(r => {
          const now = brands.get(brandId);
          const patch = Object.fromEntries(Object.entries(r.profile || {}).filter(([k, v]) => v && !now[k] && k !== 'name'));
          if (r.fonts && (r.fonts.heading || r.fonts.body) && !(now.fonts.heading && now.fonts.body)) patch.fonts = Object.assign({}, now.fonts, r.fonts);
          if (r.colors && r.colors.primary && !now.colors.primary) patch.colors = Object.assign({}, now.colors, r.colors);
          if (Object.keys(patch).length) { brands.update(brandId, patch); push('found', `Metinden boş kalan marka bilgileri dolduruldu (${Object.keys(patch).length} alan)`); }
        }).catch(err => push('notes', `Metin okunamadı: ${err.message}`)));
      }
      if (pending.mascot && brands.assetCounts(brandId).mascot) {
        jobs.push(withLimit(characterBook.draft(brandId, { modelRef }), 'Maskot okuması').then(r => {
          const prev = characterBook.get(brandId);
          characterBook.set(brandId, Object.assign({}, r.draft, prev, { lookEn: prev.lookEn || r.draft.lookEn }));
          if (r.draft.name && !identity.get(brandId).mascotName) mergeIdentity(brandId, { mascotName: r.draft.name });
          push('found', 'Maskotun görünüş tarifi ve renkleri çıkarıldı (karakter kitabı)');
        }).catch(err => push('notes', `Maskot okunamadı: ${err.message}`)));
      }
      // Metin varsa önce ondan bilgi kartları ve fikirler; sonra (havuz hâlâ küçükse) benzerleri
      const fromText = pending.text ? withLimit(digest(brandId, pending.text, modelRef), 'Fikir ve bilgi çıkarma').then(r => {
        if (r.facts) push('found', `${pending.site ? 'Web sitesinden' : 'Metinden'} ${r.facts} bilgi kartı çıkarıldı (Marka hafızası)`);
        if (r.ideas) push('found', `${pending.site ? 'Web sitesine' : 'Metne'} dayanan ${r.ideas} içerik fikri havuza eklendi`);
      }).catch(err => push('notes', `Fikir ve bilgi çıkarılamadı: ${err.message}`)) : Promise.resolve();
      jobs.push(fromText);
      jobs.push((async () => {
        await fromText;
        const seeds = ideas.list(brandId).filter(i => i.source !== 'site').slice(0, 3);
        for (const seed of seeds) {
          if (ideas.list(brandId).length >= 9) break;
          try { const r = await withLimit(ideas.similar(brandId, seed.id, { count: 3, modelRef }), 'Fikir üretimi'); if (r.ideas.length) push('found', `"${seed.title}" fikrinin ${r.ideas.length} benzeri havuza eklendi`); } catch (err) { push('notes', `Fikir üretilemedi: ${err.message}`); break; }
        }
      })());
      // Bütün referanslar birlikte incelenir: kapak, ara ve kapanış slaytlı tek şablon
      const refs = (st0.references || []).filter(id => assets.list(brandId).some(a => a.id === id)).slice(0, 6);
      const ref = refs[0];
      if (ref) {
        jobs.push(withLimit(designRef.analyze(brandId, { assetId: ref, assetIds: refs, modelRef, name: 'Örnek tasarım (referanstan)' }), 'Örnek tasarım').then(r => {
          push('found', `Referansından "${r.template.name}" şablonu hazırlandı (Post stüdyosu)`);
        }).catch(err => push('notes', `Örnek tasarım hazırlanamadı: ${err.message}`)));
      }
      await Promise.all(jobs);
      const st = readState(brandId);
      if (st.ai) { st.ai.status = 'bitti'; st.ai.finishedAt = new Date().toISOString(); st.pending = null; writeState(brandId, st); }
      try { brands.logActivity(brandId, 'brand.onboard', 'Yapay zekâ markanın boş kalan kısımlarını doldurdu'); } catch { /* yoksa geç */ }
    } catch (err) {
      try { const st = readState(brandId); if (st.ai) { st.ai.status = 'hata'; st.ai.notes.push(err.message); writeState(brandId, st); } } catch { /* marka silinmiş olabilir */ }
    }
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
    async absorb(brandId, { files = [], colors = {}, text = '', site: siteUrl = '', ideas: ideaText = '', modelRef = null } = {}) {
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
        setup.save(b.id, 'yapi', { channels: s.channels, contentKinds: s.contentKinds, hasMascot: true, hasPlace: s.hasPlace });
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
      // Web sitesi: sayfalar şimdi okunur (yapay zekâsız, birkaç saniye); metin arka plandaki okumaya eklenir
      let siteText = '';
      if (String(siteUrl || '').trim() && siteReader) {
        try {
          const site = await siteReader.read(siteUrl);
          siteText = site.text;
          st.site = { url: site.url, pages: site.pages, readAt: new Date().toISOString() };
          if (site.pages.map(p => p.title).join('').length + site.text.length < 400) notes.push('Siteden çok az yazı okunabildi (sayfa içeriği tarayıcıda sonradan yükleniyor olabilir). "Hakkımızda" yazısını metin kutusuna yapıştırırsan daha çok bilgi çıkar.');
          found.push(`Web sitesi okundu: ${site.pages.length} sayfa (${site.pages.map(p => p.title || new URL(p.url).pathname).slice(0, 6).join(', ')})`);
          const c = site.contacts;
          const lines = [c.phones.length && `Telefon: ${c.phones.join(', ')}`, c.emails.length && `E-posta: ${c.emails.join(', ')}`, `Web: ${site.url}`, ...Object.entries(c.socials).map(([k, v]) => `${k}: ${v}`)].filter(Boolean);
          brands.update(b.id, { website: site.url });
          const old = memory.get(b.id).facts.find(f => f.title === 'İletişim ve sosyal medya');
          try {
            if (old) memory.updateFact(b.id, old.id, { content: lines.join('\n') });
            else memory.addFact(b.id, { category: 'iletisim', title: 'İletişim ve sosyal medya', content: lines.join('\n') });
            found.push('İletişim ve sosyal medya bağlantıları (bilgi kartı)');
          } catch { /* kart sınırı */ }
          const cur0 = brands.get(b.id);
          if (site.themeColor && !cur0.colors.primary && !pick0(colors)) { brands.update(b.id, { colors: Object.assign({}, cur0.colors, { primary: site.themeColor }) }); found.push(`Ana renk (sitenin teması: ${site.themeColor})`); }
          if (site.description && !cur0.description) brands.update(b.id, { description: site.description.slice(0, 1500) });
        } catch (err) { notes.push(`Web sitesi okunamadı: ${err.message}`); }
      }
      // Yapay zekâ burada beklenmez (yavaş): metin şimdilik açıklama olur; okuma işleri en sona, arka plana bırakılır
      const t = String(text || '').trim();
      if (t && !brands.get(b.id).description) {
        brands.update(b.id, { description: t.slice(0, 1500) });
        found.push('Marka açıklaması (yapıştırdığın metin)');
      }
      const all = [siteText, t.length >= 40 ? t : ''].filter(Boolean).join('\n\n').slice(0, 20000);
      st.pending = { text: all, site: Boolean(siteText), mascot: mascotCount > 0 || Boolean(st.pending && st.pending.mascot) };
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

    // Bitiş anında olur. Yapay zekâ istenirse ARKA PLANDA çalışır (kullanıcı beklemez): yalnız boş kalan alanları
    // metinden doldurur, maskot tarifini çıkarır, fikir havuzunu benzerleriyle çoğaltır, referanstan örnek şablon hazırlar.
    // İlerleme state.ai'da tutulur (calisiyor → bitti); arayüz ve Marka dosyası buradan gösterir.
    finish(brandId, { modelRef = null, useAi = true } = {}) {
      const b = brands.get(brandId);
      const st = readState(b.id);
      st.finished = true;
      const notes = [];
      if (useAi && aiOn()) {
        if (!st.ai || st.ai.status !== 'calisiyor') {
          st.ai = { status: 'calisiyor', startedAt: new Date().toISOString(), found: [], notes: [] };
          writeState(b.id, st);
          enrich(b.id, modelRef).catch(() => {});
        }
      } else {
        if (useAi) notes.push('Yapay zekâ bağlı olmadığı için otomatik doldurma yapılmadı; bağlayınca Marka dosyasından "Yapay zekâ ile tamamla" diyebilirsin.');
        writeState(b.id, st);
      }
      return Object.assign(service.state(b.id), { done: [], notes, formats: IDEA_FORMATS });
    },
    // Var olan markaya sonradan web sitesi okutma: iletişim kartı hemen, profil/bilgi kartları/fikirler arka planda
    async fromSite(brandId, { url, modelRef = null } = {}) {
      const b = brands.get(brandId);
      if (!siteReader) throw badRequest('Web sitesi okuma kapalı.');
      const r = await service.absorb(b.id, { site: url, modelRef });
      if (r.notes.some(n => /Web sitesi okunamadı/.test(n))) throw badRequest(r.notes.find(n => /Web sitesi okunamadı/.test(n)).replace('Web sitesi okunamadı: ', ''));
      const st = readState(b.id);
      if (aiOn() && !(st.ai && st.ai.status === 'calisiyor')) {
        st.ai = { status: 'calisiyor', startedAt: new Date().toISOString(), found: [...r.found], notes: [] };
        writeState(b.id, st);
        enrich(b.id, modelRef).catch(() => {});
      }
      return Object.assign(service.state(b.id), { found: r.found, aiStarted: aiOn() });
    },
    // Marka dosyasından sonradan da başlatılabilir
    enrichNow(brandId, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      if (!aiOn()) throw badRequest('Yapay zekâ bağlı değil.');
      const st = readState(b.id);
      if (st.ai && st.ai.status === 'calisiyor') return service.state(b.id);
      st.ai = { status: 'calisiyor', startedAt: new Date().toISOString(), found: [], notes: [] };
      if (!st.pending) st.pending = { text: '', mascot: brands.assetCounts(b.id).mascot > 0 };
      writeState(b.id, st);
      enrich(b.id, modelRef).catch(() => {});
      return service.state(b.id);
    }
  };
  return service;
}
