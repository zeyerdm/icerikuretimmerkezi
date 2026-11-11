// Prompt Studio: marka hafızasıyla görsel, video, Reels, metin, reklam, ürün fotoğrafı, maskot animasyonu ve
// post tasarımı prompt'u üretme; elle düzenleme, geliştirme işlemleri ve sürüm geçmişi.
// Görsel/video prompt'ları üretim araçları İngilizceyi daha iyi anladığı için İngilizce yazılır, Türkçesi yanında durur.
// Metin ve Reels prompt'ları Türkçe yazılır (bir sohbet modeline verilecek talimat olarak).
import { newId, now, text, badRequest, notFound, oneOf } from '../lib/http.js';
import { polish } from './reels/rules.js';

export const PROMPT_KINDS = {
  gorsel: { label: 'Görsel', english: true, hint: 'Midjourney, Imagen, DALL·E, Flux gibi görsel üreticiler için' },
  video: { label: 'Video', english: true, hint: 'Veo, Flow, Sora, Runway, Kling gibi video üreticiler için' },
  reels: { label: 'Reels', english: false, hint: 'Bir sohbet modeline Reels fikri ya da senaryosu yazdırmak için' },
  metin: { label: 'Metin', english: false, hint: 'Açıklama, blog, e-posta gibi metinleri yazdırmak için' },
  reklam: { label: 'Reklam', english: true, hint: 'Reklam görseli ya da kısa reklam videosu için' },
  urun: { label: 'Ürün fotoğrafı', english: true, hint: 'Stüdyo, yaşam tarzı ya da katalog ürün çekimi için' },
  maskot: { label: 'Maskot animasyonu', english: true, hint: 'Markanın maskotunu hareket ettiren video için' },
  post: { label: 'Post tasarımı', english: true, hint: 'Instagram post / carousel tasarımı üretmek için' }
};

// Geliştirme işlemleri: her biri yeni bir sürüm oluşturur; "secili" yalnızca seçilen bölümü değiştirir.
export const IMPROVE_ACTIONS = {
  gelistir: { label: 'Senaryoyu geliştir', ask: 'Akışı ve anlatımı güçlendir; daha net bir başlangıç, gelişme ve sonuç kur. Konuyu ve markayı koru.' },
  yaratici: { label: 'Daha yaratıcı yap', ask: 'Daha özgün, şaşırtıcı ve akılda kalıcı yap; beklenmedik ama markaya uygun bir fikir ekle.' },
  profesyonel: { label: 'Daha profesyonel yap', ask: 'Daha profesyonel, temiz ve kurumsal kaliteye çek; gereksiz süsü çıkar, teknik ifadeleri netleştir.' },
  detay: { label: 'Görsel detay ekle', ask: 'Işık, renk paleti, doku, malzeme, kompozisyon, arka plan ve atmosfer detayları ekle.' },
  kamera: { label: 'Kamera açısını değiştir', ask: 'Kamera açısını, çekim ölçeğini, lensi ve kamera hareketini değiştir; mevcut açıdan belirgin biçimde farklı ama sahneye uygun olsun.' },
  hareket: { label: 'Karakter hareketi ekle', ask: 'Karaktere/özneye doğal, okunabilir hareketler ve mimikler ekle; hareketin zamanlamasını belirt.' },
  kisalt: { label: 'Kısalt', ask: 'Anlamı ve önemli detayları koruyarak belirgin biçimde kısalt; tekrarları çıkar.' },
  alternatif: { label: 'Alternatif üret', ask: 'Aynı amaca hizmet eden ama farklı bir yaklaşım, kurgu ya da görsel dille tamamen yeni bir alternatif yaz.' }
};

const MAX_TEXT = 8000;

function toPrompt(row) {
  return {
    id: row.id, brandId: row.brand_id, kind: row.kind, kindLabel: (PROMPT_KINDS[row.kind] || {}).label || row.kind,
    english: Boolean((PROMPT_KINDS[row.kind] || {}).english),
    title: row.title, brief: row.brief, text: row.text, textTr: row.text_tr, favorite: Boolean(row.favorite), model: row.model,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function createPromptService({ db, ai, brands, reels }) {
  const meta = r => ({ model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) });

  function row(brandId, id) {
    const r = db.prepare('SELECT * FROM prompts WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Prompt bulunamadı.');
    return r;
  }
  function saveVersion(r, note) {
    db.prepare('INSERT INTO prompt_versions (id, prompt_id, note, model, brief, text, text_tr, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), r.id, note, r.model || '', r.brief || '', r.text, r.text_tr || '', now());
  }
  function detail(r) {
    return Object.assign(toPrompt(r), {
      modelLabel: r.model ? ai.labelOf(r.model) : '',
      versions: db.prepare('SELECT id, note, model, created_at FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 40').all(r.id)
        .map(v => ({ id: v.id, note: v.note, model: v.model, modelLabel: v.model ? ai.labelOf(v.model) : '', createdAt: v.created_at }))
    });
  }

  // Marka bağlamı: kimlik hafızası + (maskot/Reels için) karakter adı ve görsel stil
  function context(b, kind) {
    const lines = ['MARKA HAFIZASI:', brands.memory(b.id)];
    // Karakter ve Reels görsel stili (3D/2D/gerçekçi) yalnız maskot, video ve Reels prompt'larına girer;
    // görsel/ürün/post/reklam prompt'larına girince istenmediği halde "3D Pixar" görünümü dayatıyordu.
    if (reels && ['maskot', 'video', 'reels'].includes(kind)) {
      const s = reels.settings(b.id);
      lines.push(`Karakter / maskot adı: ${s.character}. Görsel stil: ${s.style === '3d' ? '3D animasyon (Pixar benzeri, yumuşak ışık)' : s.style === '2d' ? '2D çizim' : 'gerçekçi'}.`);
    }
    return lines.join('\n');
  }
  function rules(kind) {
    const k = PROMPT_KINDS[kind];
    return [
      `PROMPT TÜRÜ: ${k.label} (${k.hint}).`,
      k.english
        ? 'Prompt İngilizce yazılır (üretim araçları İngilizceyi daha iyi anlar); "promptTr" alanına aynı prompt\'un anlamca birebir Türkçesini yaz.'
        : 'Prompt Türkçe yazılır ve bir sohbet modeline verilecek açık bir talimattır; "promptTr" boş kalır.',
      'Gerçek kişi, ünlü ya da başka marka adı kullanma. Görsel/video prompt\'larında ekranda yazı, logo metni, altyazı isteme (yazı sonradan eklenir).',
      'Markanın renklerini, tonunu ve hedef kitlesini yansıt. Tek paragraf ya da kısa bölümler; açıklama, giriş cümlesi veya madde dışı yorum ekleme.',
      RECIPES[kind] || ''
    ].filter(Boolean).join('\n');
  }
  // Türe göre üretim tarifi (eski sistemde iyi sonuç veren yapı): rol, zorunlu parçalar, sabit kapanış
  const STILL = 'one tangible subject and setting; shot type and camera angle (convert camera moves like zoom/pan into a static composition such as close-up or low angle); lighting; lens and depth of field (e.g. 35mm, f/1.8); color palette; atmosphere and mood';
  const NEG = 'clean composition, no text, no letters, no words, no watermark, no logo, no subtitles, no UI elements';
  const RECIPES = {
    gorsel: `TARİF: Bir Hollywood görüntü yönetmeni ve Midjourney/Flux prompt mühendisi gibi yaz. Prompt şu sırayla tek akıcı paragraf olsun: ${STILL}. Kullanıcı stil belirtmediyse fotoğraf gerçekçiliği kullan (photorealistic, cinematic film still). Oran istekte geçiyorsa başa yaz (ör. "Vertical 9:16"). Midjourney parametresi (--ar gibi) ekleme. Prompt'u şu ifadelerle bitir: "${NEG}".`,
    urun: `TARİF: Bir ürün fotoğrafçısı gibi yaz: ürün tek odak; zemin/yüzey, ışık kurulumu (softbox, rim light vb.), açı, lens (ör. 100mm macro), yansıma ve gölge, renk paleti, katalog ya da yaşam tarzı bağlamı. Midjourney parametresi ekleme. Şununla bitir: "${NEG}".`,
    reklam: `TARİF: Reklam görseli için tek güçlü sahne: ${STILL}; ürün ya da faydanın görsel karşılığı ön planda, yazı için boş alan (negative space) bırak. Şununla bitir: "${NEG}".`,
    post: `TARİF: Sosyal medya post görseli: ${STILL}; yazı eklenecek boş alan bırak. Şununla bitir: "${NEG}".`,
    video: 'TARİF: Veo/Flow için yaz: süre (ör. 8 saniye), sahne ve özne, saniye saniye aksiyon (0-3s, 3-6s…), kamera hareketi (dolly in, pan, tracking), ışık, ortam sesi ve müzik hissi, görsel stil. Ekranda yazı ve altyazı isteme.',
    maskot: 'TARİF: Maskotun tasarımını, oranlarını, renklerini ve yüzünü değiştirmeden koru (karakter tutarlılığı); saniye saniye aksiyon, kamera hareketi, ifade ve ses; ekranda yazı yok.'
  };
  const SHAPE = JSON.stringify({ title: 'Kısa Türkçe başlık (en çok 60 karakter)', prompt: 'Prompt metni', promptTr: 'Türkçesi (gerekiyorsa)' });

  function clean(o, kind, fallbackTitle) {
    const english = PROMPT_KINDS[kind].english;
    const textOut = String((o && o.prompt) || '').trim().slice(0, MAX_TEXT);
    if (!textOut) throw badRequest('Model boş prompt döndürdü; tekrar dene ya da başka model seç.');
    return {
      title: polish((o && o.title) || fallbackTitle).slice(0, 80) || fallbackTitle,
      text: textOut,
      textTr: english ? String((o && o.promptTr) || '').trim().slice(0, MAX_TEXT) : ''
    };
  }

  return {
    kinds: Object.fromEntries(Object.entries(PROMPT_KINDS).map(([k, v]) => [k, { label: v.label, english: v.english, hint: v.hint }])),
    actions: Object.fromEntries(Object.entries(IMPROVE_ACTIONS).map(([k, v]) => [k, v.label])),

    list(brandId, { kind = null, q = '' } = {}) {
      const b = brands.get(brandId);
      let rows = db.prepare('SELECT * FROM prompts WHERE brand_id = ? ORDER BY favorite DESC, updated_at DESC').all(b.id);
      if (kind && PROMPT_KINDS[kind]) rows = rows.filter(r => r.kind === kind);
      const needle = String(q || '').trim().toLocaleLowerCase('tr-TR');
      if (needle) rows = rows.filter(r => [r.title, r.text, r.text_tr, r.brief].join(' ').toLocaleLowerCase('tr-TR').includes(needle));
      return rows.map(toPrompt);
    },
    get(brandId, id) { return detail(row(brands.get(brandId).id, id)); },

    // AI ile yeni prompt: kısa tarif (brief) → tam prompt
    async create(brandId, { kind, brief, modelRef = null } = {}) {
      const b = brands.get(brandId);
      const k = oneOf(kind, Object.keys(PROMPT_KINDS), 'Prompt türü');
      const want = text(brief, { field: 'İstek', max: 2000, required: true });
      const prompt = ['PROMPT STUDIO', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rules(k), '',
        `İSTEK (kullanıcının kısa tarifi):\n${want}`, '', 'Sadece şu JSON biçiminde yanıt ver:', SHAPE].join('\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.8 });
      const c = clean(r.output, k, want.slice(0, 60));
      const id = newId();
      const t = now();
      db.prepare('INSERT INTO prompts (id, brand_id, kind, title, brief, text, text_tr, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, k, c.title, want, c.text, c.textTr, r.servedRef || r.ref, t, t);
      const created = row(b.id, id);
      saveVersion(created, 'İlk üretim');
      return Object.assign(detail(created), { ai: meta(r) });
    },

    // Beyin fırtınası: tek istekten birkaç konsept × varyasyon (kaydedilmez; beğenilen elle kaydedilir)
    async brainstorm(brandId, { kind, brief, concepts = 3, variations = 2, modelRef = null } = {}) {
      const b = brands.get(brandId);
      const k = oneOf(kind, Object.keys(PROMPT_KINDS), 'Prompt türü');
      const want = text(brief, { field: 'İstek', max: 2000, required: true });
      const nc = Math.max(2, Math.min(5, Number(concepts) || 3));
      const nv = Math.max(1, Math.min(3, Number(variations) || 2));
      const prompt = ['PROMPT BEYİN FIRTINASI', `Sen '${b.name}' markası için yaratıcı yönetmensin.`, '', context(b, k), '', rules(k), '',
        `İSTEK: ${want}`, '', `GÖREV: Bu istek için birbirinden belirgin biçimde farklı ${nc} konsept öner (farklı fikir, kurgu ya da görsel dil). Her konsept için ${nv} varyasyon prompt yaz (aynı konseptin farklı kompozisyon/ışık/an/ton denemeleri).`,
        '', 'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify({ concepts: [{ name: 'Konsept adı', idea: 'Tek cümle fikir', variations: [{ prompt: 'Prompt', promptTr: 'Türkçesi (gerekiyorsa)' }] }] })].join('\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 1 });
      const english = PROMPT_KINDS[k].english;
      // Boş varyasyon/konsept önce atılır, sonra sayı sınırı uygulanır (boş gelen biri istenen sayıyı düşürmesin)
      const list = (Array.isArray(r.output && r.output.concepts) ? r.output.concepts : []).map(c => ({
        name: polish(c && c.name).slice(0, 80) || 'Konsept', idea: polish(c && c.idea).slice(0, 300),
        variations: (Array.isArray(c && c.variations) ? c.variations : []).map(v => ({ prompt: String((v && v.prompt) || '').trim().slice(0, MAX_TEXT), promptTr: english ? String((v && v.promptTr) || '').trim().slice(0, MAX_TEXT) : '' })).filter(v => v.prompt).slice(0, nv)
      })).filter(c => c.variations.length).slice(0, nc);
      if (!list.length) throw badRequest('Model kullanılabilir konsept döndürmedi; tekrar dene ya da başka model seç.');
      return { kind: k, brief: want, concepts: list, ai: meta(r) };
    },

    // Geliştir: kısa taslağı ayrıntılı üretim prompt'una çevirir (kaydedilmez; arayüzde "Geri al" ile eskiye dönülür)
    async enhance(brandId, { kind = 'gorsel', text: draft, modelRef = null } = {}) {
      const b = brands.get(brandId);
      const k = oneOf(kind, Object.keys(PROMPT_KINDS), 'Prompt türü');
      const t = text(draft, { field: 'Taslak', max: 4000, required: true });
      const prompt = ['PROMPT GELİŞTİRME', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rules(k), '',
        `KISA TASLAK:\n${t}`, '', "GÖREV: Taslağın amacını koruyarak onu ayrıntılı, üretime hazır bir prompt'a çevir (özne, ortam, kompozisyon, ışık, renk, kamera/lens, atmosfer).",
        '', 'Sadece şu JSON biçiminde yanıt ver:', SHAPE].join('\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.7 });
      const c = clean(r.output, k, t.slice(0, 60));
      return { prompt: c.text, promptTr: c.textTr, ai: meta(r) };
    },

    // Elle yazılmış prompt'u kaydetme (AI gerekmez)
    createManual(brandId, body = {}) {
      const b = brands.get(brandId);
      const k = oneOf(body.kind, Object.keys(PROMPT_KINDS), 'Prompt türü');
      const t = text(body.text, { field: 'Prompt', max: MAX_TEXT, required: true });
      const id = newId();
      const ts = now();
      db.prepare('INSERT INTO prompts (id, brand_id, kind, title, brief, text, text_tr, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, k, text(body.title, { field: 'Başlık', max: 80 }) || t.slice(0, 50), '', t, text(body.textTr, { field: 'Türkçesi', max: MAX_TEXT }) || '', ts, ts);
      const created = row(b.id, id);
      saveVersion(created, 'Elle kaydedildi');
      return detail(created);
    },

    // Elle düzenleme: metin değiştiyse yeni sürüm
    update(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const next = {
        title: 'title' in body ? text(body.title, { field: 'Başlık', max: 80, required: true }) : r.title,
        text: 'text' in body ? text(body.text, { field: 'Prompt', max: MAX_TEXT, required: true }) : r.text,
        textTr: 'textTr' in body ? (text(body.textTr, { field: 'Türkçesi', max: MAX_TEXT }) || '') : r.text_tr,
        favorite: 'favorite' in body ? (body.favorite ? 1 : 0) : r.favorite
      };
      const changed = next.text !== r.text || next.textTr !== r.text_tr;
      db.prepare('UPDATE prompts SET title = ?, text = ?, text_tr = ?, favorite = ?, model = ?, updated_at = ? WHERE id = ?')
        .run(next.title, next.text, next.textTr, next.favorite, changed ? '' : r.model, now(), r.id);
      const u = row(b.id, r.id);
      if (changed) saveVersion(u, 'Elle düzenlendi');
      return detail(u);
    },

    // Geliştirme: hazır işlem, girişi değiştirip yeniden yazma ya da seçili bölümü yeniden yazma
    async improve(brandId, id, { action, brief = null, selection = '', instruction = '', modelRef = null } = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const k = r.kind;
      const english = PROMPT_KINDS[k].english;
      let ask;
      let note;
      let newBrief = r.brief;
      if (action === 'girdi') {
        newBrief = text(brief, { field: 'Yeni istek', max: 2000, required: true });
        ask = `Kullanıcı isteği değiştirdi. Yeni isteğe göre prompt'u baştan yaz.\nYENİ İSTEK:\n${newBrief}`;
        note = 'Giriş değiştirildi';
      } else if (action === 'secili') {
        const sel = String(selection || '').trim();
        if (!sel) throw badRequest('Önce prompt içinde değiştirmek istediğin bölümü seç.');
        if (!r.text.includes(sel)) throw badRequest('Seçilen bölüm prompt\'ta bulunamadı; metni kaydedip tekrar seç.');
        const how = text(instruction, { field: 'Talimat', max: 500 }) || 'Daha iyi ve daha net yaz.';
        ask = `Prompt'un YALNIZCA şu bölümünü yeniden yaz, geri kalan her şey kelimesi kelimesine aynı kalsın:\n"""${sel}"""\nNasıl: ${how}\n"prompt" alanında prompt'un TAMAMINI (değişmiş bölümle birlikte) döndür.`;
        note = 'Seçili bölüm yeniden yazıldı';
      } else {
        const a = IMPROVE_ACTIONS[action];
        if (!a) throw badRequest('Geçersiz işlem.');
        ask = a.ask;
        note = a.label;
      }
      const prompt = ['PROMPT GELİŞTİRME', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rules(k), '',
        `İLK İSTEK: ${r.brief || '(elle yazılmış prompt)'}`, '', `MEVCUT PROMPT:\n${r.text}`, '', `YAPILACAK DEĞİŞİKLİK:\n${ask}`, '',
        'Sadece şu JSON biçiminde yanıt ver:', SHAPE].join('\n');
      const out = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: action === 'kisalt' ? 0.4 : 0.8 });
      const c = clean(out.output, k, r.title);
      db.prepare('UPDATE prompts SET brief = ?, text = ?, text_tr = ?, model = ?, updated_at = ? WHERE id = ?')
        .run(newBrief, c.text, english ? c.textTr : '', out.servedRef || out.ref, now(), r.id);
      const u = row(b.id, r.id);
      saveVersion(u, note);
      return Object.assign(detail(u), { ai: meta(out) });
    },

    restore(brandId, id, versionId) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const v = db.prepare('SELECT * FROM prompt_versions WHERE id = ? AND prompt_id = ?').get(String(versionId), r.id);
      if (!v) throw notFound('Sürüm bulunamadı.');
      db.prepare('UPDATE prompts SET brief = ?, text = ?, text_tr = ?, model = ?, updated_at = ? WHERE id = ?').run(v.brief, v.text, v.text_tr, v.model, now(), r.id);
      const u = row(b.id, r.id);
      saveVersion(u, 'Önceki sürüme dönüldü');
      return detail(u);
    },
    version(brandId, id, versionId) {
      const r = row(brands.get(brandId).id, id);
      const v = db.prepare('SELECT * FROM prompt_versions WHERE id = ? AND prompt_id = ?').get(String(versionId), r.id);
      if (!v) throw notFound('Sürüm bulunamadı.');
      return { id: v.id, note: v.note, brief: v.brief, text: v.text, textTr: v.text_tr, createdAt: v.created_at };
    },
    remove(brandId, id) {
      const r = row(brands.get(brandId).id, id);
      db.prepare('DELETE FROM prompts WHERE id = ?').run(r.id);
    }
  };
}
