// Prompt Studio: marka hafızasıyla görsel, video, Reels, metin, reklam, ürün fotoğrafı, maskot animasyonu ve
// post tasarımı prompt'u üretme; elle düzenleme, geliştirme işlemleri ve sürüm geçmişi.
// Görsel/video prompt'ları üretim araçları İngilizceyi daha iyi anladığı için İngilizce yazılır, Türkçesi yanında durur.
// Metin ve Reels prompt'ları Türkçe yazılır (bir sohbet modeline verilecek talimat olarak).
import { checkPrompt, retryInstruction } from './promptQuality.js';
import { bookBlock } from './characterBook.js';
import { SKELETONS, skeletonInstruction, NEGATIVE_TAIL } from './promptSkeleton.js';
import { newId, now, text, badRequest, notFound, oneOf, parseJson } from '../lib/http.js';
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
const MAX_SCENES = 8;
export const MAX_EXAMPLES = 3; // 7.9: türe göre en çok 3 marka örneği
const IMAGE_KINDS = ['gorsel', 'urun', 'reklam', 'post', 'maskot'];
// 7.8: sahneler [{ title, text }]; prompt metni sahnelerin birleşimidir (kopyalama ve görsel üretimi için)
const sceneList = v => (Array.isArray(v) ? v : []).map(s => ({ title: String((s && s.title) || '').trim().slice(0, 80), text: String((s && (s.text || s.prompt)) || '').trim().slice(0, 3000) })).filter(s => s.text).slice(0, MAX_SCENES);
const joinScenes = (scenes, lang) => scenes.map((s, i) => `${lang === 'en' ? 'SCENE' : 'SAHNE'} ${i + 1}${s.title ? ' — ' + s.title : ''}\n${s.text}`).join('\n\n');

function toPrompt(row) {
  return {
    id: row.id, brandId: row.brand_id, kind: row.kind, kindLabel: (PROMPT_KINDS[row.kind] || {}).label || row.kind,
    english: Boolean((PROMPT_KINDS[row.kind] || {}).english),
    title: row.title, brief: row.brief, text: row.text, textTr: row.text_tr, favorite: Boolean(row.favorite), example: Boolean(row.is_example), model: row.model,
    lang: (PROMPT_KINDS[row.kind] || {}).english ? (row.lang || 'en') : 'tr',
    scenes: (() => { try { return sceneList(JSON.parse(row.scenes || '[]')); } catch { return []; } })(),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function createPromptService({ db, ai, brands, reels, identity = null }) {
  const meta = r => ({ model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) });

  function row(brandId, id) {
    const r = db.prepare('SELECT * FROM prompts WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Prompt bulunamadı.');
    return r;
  }
  function saveVersion(r, note) {
    db.prepare('INSERT INTO prompt_versions (id, prompt_id, note, model, brief, text, text_tr, lang, scenes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), r.id, note, r.model || '', r.brief || '', r.text, r.text_tr || '', r.lang || 'en', r.scenes || '[]', now());
  }
  // 7.6: denetim seçenekleri (marka hafızasındaki yasaklı kelimeler)
  const qualityOpts = brandId => {
    const m = db.prepare('SELECT name, banned_words, prompt_identity FROM brands WHERE id = ?').get(brandId) || {};
    const idt = parseJson(m.prompt_identity, {}) || {};
    // 7.7: marka adı / istenmeyen isimler de denetlenir
    return { banned: parseJson(m.banned_words, []) || [], brandName: m.name, noBrandName: Boolean(idt.noBrandName), forbidNames: idt.forbidNames || [], allowText: Boolean(idt.allowText) };
  };
  const qLang = r => (PROMPT_KINDS[r.kind] && PROMPT_KINDS[r.kind].english ? (r.lang || 'en') : 'tr');
  // Sahneli prompt'ta her sahne ayrı denetlenir; genel sonuç en zayıf sahnedir
  const sceneQuality = (kind, scenes, lang, opts) => {
    const qs = scenes.map(s => checkPrompt(kind, s.text, lang, opts));
    const worst = qs.reduce((a, q) => (q.score < a.score ? q : a), qs[0]);
    return Object.assign({}, worst, { scenes: qs.map(q => ({ ok: q.ok, score: q.score, missing: q.missing })) });
  };
  const quality = r => {
    const scenes = toPrompt(r).scenes;
    return scenes.length ? sceneQuality(r.kind, scenes, qLang(r), qualityOpts(r.brand_id)) : checkPrompt(r.kind, r.text, qLang(r), qualityOpts(r.brand_id));
  };
  function detail(r) {
    return Object.assign(toPrompt(r), {
      quality: quality(r),
      modelLabel: r.model ? ai.labelOf(r.model) : '',
      versions: db.prepare('SELECT id, note, model, created_at FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 40').all(r.id)
        .map(v => ({ id: v.id, note: v.note, model: v.model, modelLabel: v.model ? ai.labelOf(v.model) : '', createdAt: v.created_at }))
    });
  }

  function examples(brandId, kind) {
    const list = db.prepare('SELECT title, text FROM prompts WHERE brand_id = ? AND kind = ? AND is_example = 1 ORDER BY updated_at DESC LIMIT ?').all(brandId, kind, MAX_EXAMPLES)
      .map(r => ({ title: r.title, text: r.text }));
    if (IMAGE_KINDS.includes(kind) && list.length < MAX_EXAMPLES) {
      db.prepare('SELECT prompt FROM image_generations WHERE brand_id = ? AND is_example = 1 ORDER BY created_at DESC LIMIT ?').all(brandId, MAX_EXAMPLES - list.length)
        .forEach(r => list.push({ title: 'Beğenilen görselin tarifi', text: r.prompt }));
    }
    if (!list.length) return '';
    return 'MARKANIN BEĞENDİĞİ ÖRNEKLER (kalite, ayrıntı düzeyi ve üslup için ölçü al; içeriğini kopyalama, isteğe göre yeni yaz):\n'
      + list.map((e, i) => `ÖRNEK ${i + 1}${e.title ? ' — ' + e.title : ''}:\n${String(e.text).slice(0, 1500)}`).join('\n\n');
  }

  // Marka bağlamı: kimlik hafızası + (maskot/Reels için) karakter adı ve görsel stil
  function context(b, kind) {
    const lines = ['MARKA HAFIZASI:', brands.memory(b.id)];
    // Karakter ve Reels görsel stili (3D/2D/gerçekçi) yalnız maskot, video ve Reels prompt'larına girer;
    // görsel/ürün/post/reklam prompt'larına girince istenmediği halde "3D Pixar" görünümü dayatıyordu.
    if (reels && ['maskot', 'reels'].includes(kind)) {
      const s = reels.settings(b.id);
      lines.push(`Karakter / maskot adı: ${s.character}. Görsel stil: ${s.style === '3d' ? '3D animasyon (Pixar benzeri, yumuşak ışık)' : s.style === '2d' ? '2D çizim' : 'gerçekçi'}.`);
    }
    // 7.2: markanın kalıcı prompt kimliği (sihirbaz cevapları)
    const idt = identity ? identity.block(b.id, kind) : '';
    if (idt) lines.push('', idt);
    // 7.3: maskot ve Reels prompt'larında karakter kitabı
    if (['maskot', 'reels', 'video'].includes(kind)) {
      const book = bookBlock(parseJson((db.prepare('SELECT character_book FROM brands WHERE id = ?').get(b.id) || {}).character_book, {}) || {});
      if (book) lines.push('', book);
    }
    // 7.9: beğenilen örnekler (aynı türden prompt'lar; görsel türlerinde beğenilen görsellerin tarifleri), en çok 3
    const ex = examples(b.id, kind);
    if (ex) lines.push('', ex);
    return lines.join('\n');
  }
  // lang: 'tr' → İngilizce türler de önce Türkçe yazılır (7.5); 'en' → İngilizce + Türkçesi
  function rules(kind, lang = 'en') {
    const k = PROMPT_KINDS[kind];
    return [
      `PROMPT TÜRÜ: ${k.label} (${k.hint}).`,
      k.english && lang === 'en'
        ? 'Prompt İngilizce yazılır (üretim araçları İngilizceyi daha iyi anlar); "promptTr" alanına aynı prompt\'un anlamca birebir Türkçesini yaz.'
        : k.english
          ? 'Prompt TÜRKÇE yazılır (kullanıcı önce Türkçesini okuyup düzenler, sonra tek tıkla İngilizceye çevrilir); kemikteki bölüm sırasına uy, görsel terimleri (çekim türü, lens, ışık) Türkçe yaz; "promptTr" boş kalır.'
          : 'Prompt Türkçe yazılır ve bir sohbet modeline verilecek açık bir talimattır; "promptTr" boş kalır.',
      'Gerçek kişi, ünlü ya da başka marka adı kullanma. Görsel/video prompt\'larında ekranda yazı, logo metni, altyazı isteme (yazı sonradan eklenir).',
      'Markanın renklerini, tonunu ve hedef kitlesini yansıt. Tek paragraf ya da kısa bölümler; açıklama, giriş cümlesi veya madde dışı yorum ekleme.',
      SKELETONS[kind] ? skeletonInstruction(kind, k.english ? lang : 'en') : ''
    ].filter(Boolean).join('\n');
  }
  const SHAPE = JSON.stringify({ title: 'Kısa Türkçe başlık (en çok 60 karakter)', prompt: 'Prompt metni', promptTr: 'Türkçesi (gerekiyorsa)' });

  function clean(o, kind, fallbackTitle, lang = 'en') {
    const english = PROMPT_KINDS[kind].english && lang === 'en';
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
    async create(brandId, { kind, brief, modelRef = null, lang = 'tr', scenes: sceneCount = 0 } = {}) {
      const b = brands.get(brandId);
      const k = oneOf(kind, Object.keys(PROMPT_KINDS), 'Prompt türü');
      const want = text(brief, { field: 'İstek', max: 2000, required: true });
      const lg = PROMPT_KINDS[k].english && lang === 'en' ? 'en' : 'tr';
      const nScenes = Math.round(Number(sceneCount) || 0);
      if (nScenes >= 2) return this.createScenes(b, k, want, Math.min(MAX_SCENES, nScenes), lg, modelRef);
      const prompt = ['PROMPT STUDIO', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rules(k, lg), '',
        `İSTEK (kullanıcının kısa tarifi):\n${want}`, '', 'Sadece şu JSON biçiminde yanıt ver:', SHAPE].join('\n');
      let r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.8 });
      let c = clean(r.output, k, want.slice(0, 60), lg);
      // 7.6: zorunlu eksik varsa eksikler söylenerek bir kez daha denenir; daha iyi olan tutulur
      let q = checkPrompt(k, c.text, lg, qualityOpts(b.id));
      let retried = false;
      if (!q.ok) {
        try {
          const r2 = await ai.run({ task: 'yazim', brandId: b.id, prompt: prompt + '\n\n' + retryInstruction(q), json: true, modelRef, temperature: 0.7 });
          const c2 = clean(r2.output, k, want.slice(0, 60), lg);
          const q2 = checkPrompt(k, c2.text, lg, qualityOpts(b.id));
          retried = true;
          if (q2.score >= q.score) { r = Object.assign(r2, { cost: (r.cost || 0) + (r2.cost || 0) }); c = c2; q = q2; }
        } catch { /* ikinci deneme başarısızsa ilk sonuç kalır */ }
      }
      const id = newId();
      const t = now();
      db.prepare('INSERT INTO prompts (id, brand_id, kind, title, brief, text, text_tr, model, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, k, c.title, want, c.text, c.textTr, r.servedRef || r.ref, lg, t, t);
      const created = row(b.id, id);
      saveVersion(created, 'İlk üretim');
      return Object.assign(detail(created), { ai: Object.assign(meta(r), { qualityRetried: retried }) });
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
        favorite: 'favorite' in body ? (body.favorite ? 1 : 0) : r.favorite,
        example: 'example' in body ? (body.example ? 1 : 0) : r.is_example
      };
      if (next.example && !r.is_example) {
        const n = db.prepare('SELECT COUNT(*) AS n FROM prompts WHERE brand_id = ? AND kind = ? AND is_example = 1').get(b.id, r.kind).n;
        if (n >= MAX_EXAMPLES) throw badRequest(`Bu türde en çok ${MAX_EXAMPLES} marka örneği olabilir; önce birini örneklikten çıkar.`);
      }
      // 7.8: sahneler elle düzenlenince metin sahnelerden yeniden kurulur
      let scenesJson = r.scenes || '[]';
      if ('scenes' in body) {
        const sc = sceneList(body.scenes);
        if (!sc.length) throw badRequest('En az bir sahne olmalı.');
        scenesJson = JSON.stringify(sc);
        next.text = joinScenes(sc, PROMPT_KINDS[r.kind].english ? (r.lang || 'en') : 'tr');
      }
      const changed = next.text !== r.text || next.textTr !== r.text_tr;
      db.prepare('UPDATE prompts SET title = ?, text = ?, text_tr = ?, favorite = ?, is_example = ?, model = ?, scenes = ?, updated_at = ? WHERE id = ?')
        .run(next.title, next.text, next.textTr, next.favorite, next.example, changed ? '' : r.model, scenesJson, now(), r.id);
      const u = row(b.id, r.id);
      if (changed) saveVersion(u, 'Elle düzenlendi');
      return detail(u);
    },

    // 7.8: çok sahneli prompt (eski sistemdeki gibi): sahneler birbirinin devamı, her biri kemiğe uyan tam bir prompt
    async createScenes(b, k, want, n, lg, modelRef) {
      const shape = JSON.stringify({ title: 'Kısa Türkçe başlık', scenes: [{ title: 'Sahne adı', prompt: 'Sahnenin tam prompt\'u' }] });
      const prompt = ['PROMPT STUDIO · SAHNELİ', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rules(k, lg), '',
        `İSTEK (kullanıcının kısa tarifi):\n${want}`, '',
        `GÖREV: Bu istek için birbirinin devamı olan ${n} sahne yaz. Her sahne kendi başına kemiğe uyan tam bir prompt olsun; karakter, mekân, ışık ve stil sahneler arasında tutarlı kalsın; her sahne bir öncekinin bittiği yerden başlasın.`,
        '', 'Sadece şu JSON biçiminde yanıt ver:', shape].join('\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.8 });
      const scenes = sceneList(r.output && r.output.scenes);
      if (!scenes.length) throw badRequest('Model kullanılabilir sahne döndürmedi; tekrar dene.');
      const title = polish(r.output && r.output.title).slice(0, 80) || want.slice(0, 60);
      const id = newId(); const t = now();
      db.prepare('INSERT INTO prompts (id, brand_id, kind, title, brief, text, text_tr, model, lang, scenes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, k, title, want, joinScenes(scenes, lg), '', r.servedRef || r.ref, lg, JSON.stringify(scenes), t, t);
      const created = row(b.id, id);
      saveVersion(created, `İlk üretim (${scenes.length} sahne)`);
      return Object.assign(detail(created), { ai: Object.assign(meta(r), { qualityRetried: false }) });
    },

    // 7.8 sahne işlemleri: add (devamını üret), extend (sahneyi uzat), rewrite (beğenilmeyen sahneyi talimatla değiştir)
    async sceneAction(brandId, id, { action, index = null, instruction = '', modelRef = null } = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const p = toPrompt(r);
      const scenes = p.scenes;
      if (!scenes.length) throw badRequest('Bu prompt sahneli değil.');
      const lg = qLang(r);
      const i = Number(index);
      let ask; let note;
      if (action === 'add') {
        if (scenes.length >= MAX_SCENES) throw badRequest(`En fazla ${MAX_SCENES} sahne olabilir.`);
        ask = `Son sahnenin bittiği yerden devam eden YENİ bir sahne yaz (sahne ${scenes.length + 1}). Karakter, mekân ve stil aynı kalsın.`; note = 'Bir sahne daha eklendi';
      } else if (action === 'extend' || action === 'rewrite') {
        if (!Number.isInteger(i) || !scenes[i]) throw badRequest('Geçersiz sahne.');
        const how = text(instruction, { field: 'Talimat', max: 500 });
        if (action === 'rewrite' && !how) throw badRequest('Bu sahnede neyi değiştirmek istediğini yaz.');
        ask = action === 'extend'
          ? `YALNIZCA sahne ${i + 1}'i daha uzun ve ayrıntılı yaz: aksiyonu çoğalt, saniye saniye akışı genişlet, ayrıntı ekle. Diğer sahnelerle tutarlı kalsın.`
          : `YALNIZCA sahne ${i + 1}'i şu talimata göre yeniden yaz: ${how}. Beğenilmeyen kısmı değiştir, geri kalanı ve diğer sahnelerle tutarlılığı koru.`;
        note = action === 'extend' ? `Sahne ${i + 1} uzatıldı` : `Sahne ${i + 1} değiştirildi`;
      } else throw badRequest('Geçersiz sahne işlemi.');
      const prompt = ['PROMPT STUDIO · SAHNE', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, r.kind), '', rules(r.kind, lg), '',
        `İLK İSTEK: ${r.brief || '-'}`, '', 'MEVCUT SAHNELER:', joinScenes(scenes, lg), '', `YAPILACAK: ${ask}`, '',
        'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify({ title: 'Sahne adı', prompt: 'Sahnenin tam prompt\'u' })].join('\n');
      const out = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.8 });
      const sc = sceneList([out.output])[0];
      if (!sc) throw badRequest('Model sahne döndürmedi; tekrar dene.');
      const next = scenes.slice();
      if (action === 'add') next.push(sc); else next[i] = Object.assign({}, sc, { title: sc.title || scenes[i].title });
      db.prepare('UPDATE prompts SET scenes = ?, text = ?, model = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(next), joinScenes(next, lg), out.servedRef || out.ref, now(), r.id);
      const u = row(b.id, r.id);
      saveVersion(u, note);
      return Object.assign(detail(u), { ai: meta(out) });
    },

    // 7.5: Türkçe yazılmış prompt'u İngilizceye çevirir; Türkçesi "Türkçesi" alanına geçer, İngilizce üretim aracına verilir
    async translate(brandId, id, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      if (!PROMPT_KINDS[r.kind].english) throw badRequest('Bu tür Türkçe kullanılır; çeviri gerekmez.');
      if ((r.lang || 'en') === 'en') throw badRequest('Prompt zaten İngilizce.');
      const tail = SKELETONS[r.kind] && SKELETONS[r.kind].sections.includes('negative') ? `Türkçe kapanışı tam olarak şu İngilizce ifadeyle değiştir: "${NEGATIVE_TAIL}"` : '';
      const trScenes = toPrompt(r).scenes;
      if (trScenes.length) {
        // 7.8: sahneler tek istekte, sırası korunarak çevrilir
        const prompt = ['PROMPT ÇEVİRİSİ · SAHNELİ', 'Aşağıdaki Türkçe sahne prompt\'larını sırasını koruyarak İngilizceye çevir; her sahne için yalnız prompt\'u çevir, başlığı da İngilizceye çevir. Görsel/video terimlerini İngilizce kullan. Yeni bilgi ekleme.', tail, '',
          `SAHNELER (JSON):\n${JSON.stringify(trScenes.map(s => ({ title: s.title, prompt: s.text })))}`, '', 'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify({ scenes: [{ title: 'Scene title', prompt: 'English prompt' }] })].filter(Boolean).join('\n');
        const out = await ai.run({ task: 'ceviri', brandId: b.id, prompt, json: true, modelRef, temperature: 0.2 });
        const en = sceneList(out.output && out.output.scenes);
        if (en.length !== trScenes.length) throw badRequest('Model sahnelerin hepsini çevirmedi; tekrar dene.');
        db.prepare("UPDATE prompts SET text = ?, text_tr = ?, scenes = ?, lang = 'en', updated_at = ? WHERE id = ?").run(joinScenes(en, 'en'), r.text, JSON.stringify(en), now(), r.id);
        const u = row(b.id, r.id);
        saveVersion(u, 'İngilizceye çevrildi');
        return Object.assign(detail(u), { ai: meta(out) });
      }
      const prompt = ['PROMPT ÇEVİRİSİ', 'Aşağıdaki Türkçe üretim prompt\'unu İngilizceye çevir. Anlamı, bölüm sırasını ve ayrıntıları koru; görsel/video üretim araçlarının kullandığı İngilizce terimleri kullan (shot types, lens, lighting). Yeni bilgi ekleme, açıklama yazma.',
        SKELETONS[r.kind] && SKELETONS[r.kind].sections.includes('negative') ? `Türkçe kapanışı tam olarak şu İngilizce ifadeyle değiştir: "${NEGATIVE_TAIL}"` : '',
        '', `TÜRKÇE PROMPT:\n${r.text}`, '', 'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify({ prompt: 'English prompt' })].filter(Boolean).join('\n');
      const out = await ai.run({ task: 'ceviri', brandId: b.id, prompt, json: true, modelRef, temperature: 0.2 });
      const en = String((out.output && out.output.prompt) || '').trim().slice(0, MAX_TEXT);
      if (!en) throw badRequest('Model çeviri döndürmedi; tekrar dene.');
      db.prepare("UPDATE prompts SET text = ?, text_tr = ?, lang = 'en', updated_at = ? WHERE id = ?").run(en, r.text, now(), r.id);
      const u = row(b.id, r.id);
      saveVersion(u, 'İngilizceye çevrildi');
      return Object.assign(detail(u), { ai: meta(out) });
    },

    // Geliştirme: hazır işlem, girişi değiştirip yeniden yazma ya da seçili bölümü yeniden yazma
    async improve(brandId, id, { action, brief = null, selection = '', instruction = '', modelRef = null } = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const k = r.kind;
      if (toPrompt(r).scenes.length) throw badRequest('Sahneli prompt\'ta sahne kartlarındaki işlemleri kullan (uzat, değiştir, bir sahne daha).');
      const lg = PROMPT_KINDS[k].english ? (r.lang || 'en') : 'tr';
      const english = PROMPT_KINDS[k].english && lg === 'en';
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
      const prompt = ['PROMPT GELİŞTİRME', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rules(k, lg), '',
        `İLK İSTEK: ${r.brief || '(elle yazılmış prompt)'}`, '', `MEVCUT PROMPT:\n${r.text}`, '', `YAPILACAK DEĞİŞİKLİK:\n${ask}`, '',
        'Sadece şu JSON biçiminde yanıt ver:', SHAPE].join('\n');
      const out = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: action === 'kisalt' ? 0.4 : 0.8 });
      const c = clean(out.output, k, r.title, lg);
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
      db.prepare('UPDATE prompts SET brief = ?, text = ?, text_tr = ?, model = ?, lang = ?, scenes = ?, updated_at = ? WHERE id = ?').run(v.brief, v.text, v.text_tr, v.model, v.lang || 'en', v.scenes || '[]', now(), r.id);
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
