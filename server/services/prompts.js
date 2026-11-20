// Prompt Studio: marka hafızasıyla görsel, video, Reels, metin, reklam, ürün fotoğrafı, maskot animasyonu ve
// post tasarımı prompt'u üretme; elle düzenleme, geliştirme işlemleri ve sürüm geçmişi.
// Görsel/video prompt'ları üretim araçları İngilizceyi daha iyi anladığı için İngilizce yazılır, Türkçesi yanında durur.
// Metin ve Reels prompt'ları Türkçe yazılır (bir sohbet modeline verilecek talimat olarak).
import { checkPrompt, retryInstruction } from './promptQuality.js';
import { bookBlock, bookImageLine } from './characterBook.js';
import { SKELETONS, skeletonInstruction, NEGATIVE_TAIL } from './promptSkeleton.js';
import { newId, now, text, badRequest, notFound, oneOf, parseJson } from '../lib/http.js';
import { transaction } from '../db.js';
import { polish, LIMITS as REELS_LIMITS, planPrompt, normalizeScenario, checkQuality, totalSeconds, buildSrt, STATUSES as REELS_STATUSES, STYLES as REELS_STYLES } from './reels/rules.js';
import { RULE_EXAMPLES } from '../../public/js/ruleExamples.js';
import { perfTopReels } from './perf.js';
import { REASONS as FEEDBACK_REASONS } from './feedback.js';
import { toolsFor, validTool, toolInstruction, toolOutput, ASPECTS } from './promptTools.js';

export const PROMPT_KINDS = {
  gorsel: { label: 'Görsel', english: true, hint: 'Midjourney, Imagen, DALL·E, Flux gibi görsel üreticiler için' },
  video: { label: 'Video', english: true, hint: 'Veo, Flow, Sora, Runway, Kling gibi video üreticiler için' },
  reels: { label: 'Reels', english: false, hint: 'Google Flow için saniye saniye, sahne sahne Reels senaryosu' },
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

const MAX_TEXT = 30000; // kural şablonlu sahneli prompt'lar uzun olabilir
const MAX_RULE = 20000;
const MAX_SCENES = 8;
export const MAX_EXAMPLES = 3; // 7.9: türe göre en çok 3 marka örneği
const IMAGE_KINDS = ['gorsel', 'urun', 'reklam', 'post', 'maskot'];
// 7.8: sahneler [{ title, text }]; prompt metni sahnelerin birleşimidir (kopyalama ve görsel üretimi için)
const sceneList = v => (Array.isArray(v) ? v : []).map(s => ({ title: String((s && s.title) || '').trim().slice(0, 80), text: String((s && (s.text || s.prompt)) || '').trim().slice(0, 12000) })).filter(s => s.text).slice(0, MAX_SCENES);
// Sahne metni zaten "SAHNE 2 — ..." diye başlıyorsa (kural şablonu) başlık ikinci kez eklenmez
const joinScenes = (scenes, lang) => scenes.map((s, i) => (/^\s*(SAHNE|SCENE)\s*\d/i.test(s.text) ? s.text : `${lang === 'en' ? 'SCENE' : 'SAHNE'} ${i + 1}${s.title ? ' — ' + s.title : ''}\n${s.text}`)).join('\n\n');

// Hazır Google Flow sahne şablonu: Reels'te kullanıcının varsayılan şablonu yoksa bu kullanılır (video ve maskotta da seçilebilir)
export const BUILTIN_RULE_ID = 'hazir-flow';
const FLOW_EX = RULE_EXAMPLES.find(x => x.id === 'sahne-916');
const BUILTIN_RULE = { id: BUILTIN_RULE_ID, brand_id: '', kind: 'reels', name: 'Google Flow sahnesi (hazır)', body: FLOW_EX.body, lang: 'tr', is_default: 0, shared: 1, example: '', spec: '{}', builtin: true };
const BUILTIN_KINDS = ['reels', 'video', 'maskot'];
// Reels senaryo kuralları (Reels modülüyle aynı sınırlar): şablon doldurulurken bunlara da uyulur
export const REELS_RULES = [
  'REELS SENARYO KURALLARI (Google Flow\'da her sahne ayrı bir klip olarak üretilip birleştirilecek):',
  `- Her sahne en çok ${REELS_LIMITS.maxScene} saniye (Flow'un tek klip sınırı), en az ${REELS_LIMITS.minScene} saniye; sahneler 8 saniye olmak zorunda değil. Toplam süre hedefi ${REELS_LIMITS.targetMax} saniye civarı, kesin üst sınır ${REELS_LIMITS.maxTotal} saniye.`,
  '- İlk 1-2 saniyede dikkat çekici bir olay (kanca); giriş, selamlama, tanıtım yok.',
  '- Saniye saniye aksiyon 0\'dan başlar, aralıklar boşluksuz ve çakışmasız ilerler, son aralık sahnenin son saniyesinde biter.',
  `- Karakter her sahnede konuşur; konuşma sahnenin en az %70'ini kaplar. Türkçe konuşma hızı saniyede yaklaşık ${REELS_LIMITS.speechRate} kelimedir: replik konuşma süresini doldurur ama aşmaz (8 saniyelik sahnede 12-16 kelime). Konuşmanın başladığı ve bittiği saniyeyi yaz.`,
  '- Konuşmada geçen nesne ya da olay görüntüde somut olarak gösterilir; bilgi veren konularda en çarpıcı somut bilgi (rakam, süre, sonuç) söylenir, emin olunmayan bilgi uydurulmaz.',
  '- Kamera 2-3 saniyede bir plan değiştirir (yakın, detay, geniş); \'yavaş\', \'ağır çekim\' gibi tempoyu düşüren ifadeler yok.',
  '- Son sahne konunun asıl esprisini ya da en çarpıcı bilgisini açıkça söyleyerek biter; mümkünse son kare ilk sahneye bağlanır (döngü).',
  '- Altyazı, ekranda konuşma metni, logo ve gerçek kişi/marka adı yok; karakter tasarımı bütün sahnelerde aynı kalır.'
].join('\n');

// --- Reels senaryo planı (eski Reels bölümünün mantığı): önce espri, akış, süreler ve replikler; Flow prompt'ları sonra ---
const fmtSec = v => String(v).replace('.', ',');
// Planın modele verilen hâli: sahne prompt'ları bu plana birebir uyar
export function planBlock(plan) {
  const L = ['ONAYLANAN SENARYO PLANI (BİREBİR UY: sahne sayısını, süreleri, saniye aralıklarını ve replikleri DEĞİŞTİRME):',
    `Video adı: ${plan.title}`, plan.punchline ? `Asıl espri: ${plan.punchline}` : '', plan.setting ? `Korunacak mekân ve ışık: ${plan.setting}` : '',
    plan.screenTitle ? `Kapak yazısı (yalnız 1. sahnede): "${plan.screenTitle}"` : '', plan.music ? `Müzik: ${plan.music}` : ''];
  plan.scenes.forEach((sc, i) => {
    L.push('', `SAHNE ${i + 1} (${fmtSec(sc.duration)} saniye):`);
    if (sc.start) L.push(`Başlangıç: ${sc.start}`);
    (sc.beats || []).forEach(b => L.push(`* ${fmtSec(b.from)}–${fmtSec(b.to)} saniye: ${b.action}${b.camera ? ` Kamera: ${b.camera}.` : ''}${b.sound ? ` Ses: ${b.sound}.` : ''}`));
    if (sc.line) L.push(`Konuşma ${sc.lineFrom != null ? `${fmtSec(sc.lineFrom)}. saniyede başlar, ${fmtSec(sc.lineTo)}. saniyede biter` : ''}: "${sc.line}"`);
    if (sc.endFrame) L.push(`Bitiş karesi: ${sc.endFrame}`);
  });
  if (plan.ending && plan.ending.twist) L.push('', `Final: ${plan.ending.twist}`);
  L.push('', plan.setting ? `SABİT MEKÂN VE IŞIK: Her sahnenin mekân ve ışık bölümüne önce şu cümleyi AYNEN yaz, sahneye özgü ayrıntıyı arkasına ekle: "${plan.setting}". Karakterin görünüşünü değiştirme, yeniden tarif etme.` : '');
  L.push('', 'PLANI ŞABLONA DÖKME: Her sahnenin prompt\'u plandaki sahneyi anlatır. Süre alanına sahnenin süresini, saniye saniye bölümüne plandaki aralıkları AYNEN (aynı saniyelerle), konuşma bölümüne konuşmanın başlama saniyesini ve repliği tırnak içinde KELİMESİ KELİMESİNE yaz. Kapak yazısı yalnız 1. sahnede kullanılır; 2. sahneden itibaren kapak yazısı bölümüne yalnızca "Bu sahnede kapak yazısı yok; ekranda hiçbir yazı olmayacak." yaz.');
  return L.filter(x => x !== '').join('\n').replace(/\n(SAHNE|PLANI|Final)/g, '\n\n$1');
}
// Kapak yazısı yalnız ilk sahnede: Flow her sahnede yeniden çizilen yazıyı farklı ve hatalı çiziyor. 2. sahneden itibaren bölüm kodla sabitlenir.
const NO_COVER = 'Bu sahnede kapak yazısı yok; ekranda hiçbir yazı olmayacak.';
export function coverOnlyFirst(scenes, ruleBody) {
  const heads = ruleHeadings(ruleBody);
  const cover = heads.find(h => /kapak yaz/i.test(foldTr(h)) || /^cover/i.test(h));
  if (!cover) return scenes;
  // Ana başlıklar: hemen bir başlığın altındaki başlık ("Kapak yazısı:" altındaki "Tam olarak şu metin kullanılmalı:") alt satırdır
  const key = l => foldTr(l.trim().replace(/^[*•-]\s*/, '').replace(/:$/, ''));
  const headSet = new Set(heads.map(foldTr));
  const main = new Set();
  let prevHead = false;
  String(ruleBody).split('\n').filter(l => l.trim()).forEach(l => { const h = /:\s*$/.test(l.trim()) && headSet.has(key(l)); if (h && !prevHead) main.add(key(l)); prevHead = h; });
  const isHead = l => /:\s*$/.test(l.trim()) && main.has(key(l));
  return scenes.map((sc, i) => {
    if (i === 0) return sc;
    const lines = sc.text.split('\n');
    const at = lines.findIndex(l => foldTr(l.trim().replace(/:$/, '')) === foldTr(cover) && /:\s*$/.test(l.trim()));
    if (at < 0) return sc;
    let end = at + 1;
    while (end < lines.length && !isHead(lines[end])) end++;
    return Object.assign({}, sc, { text: [...lines.slice(0, at + 1), NO_COVER, ...lines.slice(end)].join('\n') });
  });
}
// Plan denetimi (eski Reels kalite kontrolü) + sahne prompt'larında replik birebir geçiyor mu
export function planIssues(plan, scenes = [], { character = '', allow = [] } = {}) {
  const issues = checkQuality(plan, { character, allow });
  scenes.forEach((sc, i) => {
    const want = plan.scenes[i];
    if (!want) return;
    if (want.line && !foldTr(sc.text).includes(foldTr(want.line).replace(/[.!?…]+$/, ''))) issues.push(`Sahne ${i + 1}: plandaki replik prompt'ta birebir geçmiyor.`);
    if (!new RegExp(`(^|\\D)${String(want.duration).replace('.', '[.,]')}\\s*saniye`, 'i').test(sc.text)) issues.push(`Sahne ${i + 1}: süre (${want.duration} saniye) prompt'ta yazmıyor.`);
  });
  return issues;
}

// Reels açıklaması ve hashtag'ler: tam 5 hashtag (genel etiketler atılır, eksikse marka etiketiyle tamamlanır); kısa açıklama uyarılır
const GENERIC_TAGS = new Set(['#keşfet', '#kesfet', '#reels', '#viral', '#explore', '#fyp', '#instagram', '#trend', '#reelsinstagram']);
export function fixPublishing(plan, brandName = '') {
  const seen = new Set();
  const tags = (plan.hashtags || []).map(h => String(h || '').trim().replace(/^#?/, '#').replace(/\s+/g, '')).filter(h => h.length > 2 && !GENERIC_TAGS.has(h.toLocaleLowerCase('tr-TR')))
    .filter(h => { const k = h.toLocaleLowerCase('tr-TR'); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
  const brandTag = '#' + String(brandName || '').replace(/[^\p{L}\p{N}]/gu, '');
  if (tags.length < 5 && brandTag.length > 2 && !seen.has(brandTag.toLocaleLowerCase('tr-TR'))) tags.push(brandTag);
  const out = Object.assign({}, plan, { hashtags: tags });
  const notes = [];
  if (tags.length < 5) notes.push(`Hashtag sayısı ${tags.length}; 5 olmalı (Yayın panelinden tamamlayabilirsin).`);
  const len = String(plan.caption || '').length;
  if (len && len < 1000) notes.push(`Açıklama kısa (${len} karakter); hedef 1200-1800.`);
  return { plan: out, notes };
}

// Kural şablonu: kullanıcının kendi prompt yapısı. Başlıklar ve sabit cümleler aynen kalır, [köşeli] alanlar doldurulur.
const PLACEHOLDER = /\[[^\]\n]+\]/g;
const foldTr = s => String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
// Şablondaki bölüm başlıkları: ":" ile biten, köşeli alan içermeyen kısa satırlar
export function ruleHeadings(body) {
  return [...new Set(String(body || '').split('\n').map(l => l.trim().replace(/^[*•-]\s*/, ''))
    .filter(l => /:$/.test(l) && l.length >= 3 && l.length <= 70 && !l.includes('[')).map(l => l.slice(0, -1).trim()))];
}
export function ruleCheck(body, out) {
  const t = foldTr(out);
  const missing = ruleHeadings(body).filter(h => !t.includes(foldTr(h)));
  const left = [...new Set(String(out || '').match(PLACEHOLDER) || [])];
  const checks = [
    ...ruleHeadings(body).map(h => ({ key: 'h:' + h, label: h, ok: !missing.includes(h), kind: 'section' })),
    { key: 'filled', label: 'Bütün [alanlar] dolu', ok: !left.length, kind: 'rule', msg: left.length ? `Doldurulmamış alan: ${left.slice(0, 3).join(', ')}` : '' }
  ];
  const failed = checks.filter(c => !c.ok);
  return { ok: !failed.length, score: Math.round((checks.length - failed.length) / checks.length * 100), checks, missing: failed.map(c => c.msg || `"${c.label}" bölümü yok`), rule: true };
}

function toRule(r) {
  return { id: r.id, brandId: r.brand_id, kind: r.kind, kindLabel: (PROMPT_KINDS[r.kind] || {}).label || r.kind, name: r.name, body: r.body, lang: r.lang, isDefault: Boolean(r.is_default),
    shared: Boolean(r.shared), example: r.example || '', spec: parseJson(r.spec, {}) || {},
    headings: ruleHeadings(r.body), fields: (String(r.body).match(PLACEHOLDER) || []).length, createdAt: r.created_at, updatedAt: r.updated_at };
}

function toPrompt(row) {
  return {
    id: row.id, brandId: row.brand_id, kind: row.kind, kindLabel: (PROMPT_KINDS[row.kind] || {}).label || row.kind,
    english: Boolean((PROMPT_KINDS[row.kind] || {}).english),
    title: row.title, brief: row.brief, text: row.text, textTr: row.text_tr, favorite: Boolean(row.favorite), example: Boolean(row.is_example), model: row.model,
    lang: (PROMPT_KINDS[row.kind] || {}).english ? (row.lang || 'en') : 'tr',
    tool: row.tool || '', aspect: row.aspect || '', ruleId: row.rule_id || '',
    scenes: (() => { try { return sceneList(JSON.parse(row.scenes || '[]')); } catch { return []; } })(),
    plan: row.plan ? parseJson(row.plan, null) : null,
    // Reels: istenince yapılan İngilizce (sahne sırasıyla); Türkçe sahneler değişince silinir
    scenesEn: row.scenes_en ? (parseJson(row.scenes_en, []) || []) : [],
    status: row.status || 'taslak', statusLabel: REELS_STATUSES[row.status || 'taslak'] || row.status,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export function createPromptService({ db, ai, brands, reels, workspace = null, identity = null }) {
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
  // Ortak şablonlar (shared) bütün markalarda görünür ve kullanılır
  // Beğenilen Reels'ten öğrenme: "Marka örneği" ve beğenilen (👍) Reels'lerin esprisi ve replikleri ölçü olur; beğenilmeyenlerin
  // nedenleri kaçınılacaklar olarak, son yazılan başlıklar da tekrar etmemek için plana girer.
  function reelsMemory(brandId) {
    const short = (t, n = 160) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);
    const rows = db.prepare(`SELECT p.id, p.title, p.plan, p.is_example, f.vote, f.reasons, f.note FROM prompts p
      LEFT JOIN feedback f ON f.brand_id = p.brand_id AND f.target_type = 'prompt' AND f.target_id = p.id
      WHERE p.brand_id = ? AND p.kind = 'reels' ORDER BY p.updated_at DESC LIMIT 60`).all(brandId);
    const liked = rows.filter(r => r.plan && (r.is_example || r.vote > 0)).slice(0, 3).map(r => {
      const pl = parseJson(r.plan, null);
      if (!pl) return '';
      return `- ${short(r.title, 80)} · espri: ${short(pl.punchline)} · ${pl.scenes.length} sahne, ${totalSeconds(pl)} sn · replikler: ${pl.scenes.map(x => `"${short(x.line, 90)}"`).join(' / ')}`;
    }).filter(Boolean);
    const disliked = rows.filter(r => r.vote < 0).slice(0, 5).map(r => {
      const why = [...(parseJson(r.reasons, []) || []).map(k => (FEEDBACK_REASONS[k] || {}).label || k), r.note].filter(Boolean).join(', ');
      return `- ${short(r.title, 80)}${why ? ` (neden: ${short(why, 120)})` : ''}`;
    });
    const recent = rows.slice(0, 15).map(r => short(r.title, 70));
    const favIdeas = db.prepare("SELECT title FROM ideas WHERE brand_id = ? AND format = 'reels' AND favorite = 1 ORDER BY created_at DESC LIMIT 5").all(brandId).map(r => short(r.title, 90));
    let top = '';
    try { top = perfTopReels(db, brandId); } catch { /* rapor tabloları yoksa atlanır */ }
    return [
      top,
      favIdeas.length ? `FAVORİ REELS FİKİRLERİ (markanın sevdiği konu ve yaklaşım tarzı): ${favIdeas.join(' · ')}` : '',
      liked.length ? `BEĞENİLEN REELS'LER (espri tarzını, temposunu ve replik dilini ölçü al; içeriğini kopyalama):\n${liked.join('\n')}` : '',
      disliked.length ? `BEĞENİLMEYEN REELS'LER (bu yaklaşımları ve nedenlerini tekrarlama):\n${disliked.join('\n')}` : '',
      recent.length ? `DAHA ÖNCE YAZILAN REELS'LER (konuyu ve esprisini tekrar etme): ${recent.join(' · ')}` : ''
    ].filter(Boolean).join('\n\n');
  }
  // Hızlı modda kalite için ikinci yazım yapılmaz; eksikler kalite rozetlerinde uyarı olarak görünür
  const qualityRetry = () => !(ai.speedOf && ai.speedOf('yazim') === 'hizli');
  const reelsCheckOpts = brandId => { const b = brands.get(brandId); const ch = reels ? reels.settings(b.id).character : ''; return { character: ch, allow: [b.name, ch].filter(Boolean) }; };
  // Planı gelen ya da düzenlenen hâliyle yeniden düzenler (süreler, konuşma hızına göre uzatma); kullanılamazsa 400
  const cleanPlan = (raw, n = 0) => {
    const pl = normalizeScenario(raw && typeof raw === 'object' ? Object.assign({}, raw, { title: raw.title || raw.screenTitle || 'Reels' }) : null);
    if (!pl) throw badRequest('Senaryo planı okunamadı.');
    if (n >= 1) pl.scenes = pl.scenes.slice(0, n);
    return pl;
  };
  const ruleOf = (brandId, id) => (id === BUILTIN_RULE_ID ? BUILTIN_RULE : id ? db.prepare('SELECT * FROM prompt_rules WHERE id = ? AND (brand_id = ? OR shared = 1)').get(String(id), brandId) || null : null);
  // ruleId: '' → türün varsayılan şablonu, 'none' → şablonsuz, kimlik → o şablon
  const pickRule = (brandId, kind, ruleId) => {
    if (ruleId === 'none') return null;
    if (ruleId === BUILTIN_RULE_ID) { if (!BUILTIN_KINDS.includes(kind)) throw badRequest('Hazır Flow şablonu yalnız Reels, video ve maskot için.'); return BUILTIN_RULE; }
    if (ruleId) { const r0 = ruleOf(brandId, ruleId); if (!r0) throw notFound('Kural şablonu bulunamadı.'); if (r0.kind !== kind) throw badRequest('Bu kural şablonu başka bir prompt türü için.'); return r0; }
    const def = db.prepare('SELECT * FROM prompt_rules WHERE (brand_id = ? OR shared = 1) AND kind = ? AND is_default = 1 ORDER BY brand_id = ? DESC LIMIT 1').get(brandId, kind, brandId) || null;
    // Reels'in ana kalıbı: kendi varsayılan şablonun yoksa hazır Google Flow sahne şablonu
    return def || (kind === 'reels' ? BUILTIN_RULE : null);
  };
  // Şablonlu kurallar: genel kemik ve "ekranda yazı yok" kuralı yerine kullanıcının şablonu geçerlidir
  function ruleRules(kind, rule, sceneCount = 0) {
    const k = PROMPT_KINDS[kind];
    return [
      `PROMPT TÜRÜ: ${k.label} (${k.hint}).`,
      `KULLANICININ KURAL ŞABLONU ("${rule.name}"): Prompt'u AŞAĞIDAKİ ŞABLONU BİREBİR KULLANARAK yaz. Bu şablon diğer bütün biçim kurallarından önce gelir.`,
      '- Bölüm başlıklarını, bölüm sırasını ve köşeli parantez dışındaki bütün sabit cümleleri KELİMESİ KELİMESİNE aynen koru; kısaltma, yeniden yazma, çevirme.',
      '- Köşeli parantez içindeki [ ... ] alanları isteğe, marka hafızasına ve karakter bilgisine göre somut ve ayrıntılı içerikle doldur; köşeli parantezleri ve içindeki talimat yazısını sil. Hiçbir alan [ ... ] hâlinde kalmasın.',
      '- "[A / B / C]" gibi seçenekli alanlarda isteğe en uygun olanı (ya da ikisini) seç. "[X]" gibi sayı alanlarına uygun sayıyı yaz; saniyeler birbirini izlesin ve toplam süreyle tutarlı olsun.',
      '- Madde işaretli satırların yapısını koru. Şablonda olmayan bölüm ekleme, olan bölümü çıkarma; açıklama ya da giriş cümlesi yazma.',
      `- Dil: ${rule.lang === 'en' ? 'İngilizce' : 'Türkçe'}. Gerçek kişi, ünlü ya da başka marka adı kullanma. Seslendirme veya kapak yazısı istenmişse metni tırnak içinde birebir yaz.`,
      rule.example ? `- ÖRNEK PROMPT (yalnızca ayrıntı düzeyi, üslup ve dil için referans; içeriğini kopyalama):\n<<<\n${String(rule.example).slice(0, 4000)}\n>>>` : '',
      kind === 'reels' ? REELS_RULES : '',
      sceneCount >= 2 ? `- ${sceneCount} sahnenin HER BİRİ bu şablonun eksiksiz, ayrı bir kopyasıdır. Sahne numaralarını 1'den sırayla ver; "Sahne devamlılığı" gibi bölümlerde önceki ve sonraki sahneye açıkça bağla. Karakter, mekân ve ışık sahneler arasında tutarlı kalsın. Her sahnenin "prompt" alanı şablonun ilk satırından başlasın.` : '',
      '', 'ŞABLON:', '<<<', rule.body, '>>>'
    ].filter(Boolean).join('\n');
  }
  const rulesFor = r => { const ru = ruleOf(r.brand_id, r.rule_id); return ru ? ruleRules(r.kind, ru, toPrompt(r).scenes.length) : rules(r.kind, qLang(r), r.tool); };
  const quality = r => {
    const ru = ruleOf(r.brand_id, r.rule_id);
    if (ru) {
      const sc = toPrompt(r).scenes;
      if (!sc.length) return ruleCheck(ru.body, r.text);
      // 2. sahneden itibaren kapak yazısı bölümü bilerek sadeleştirilir: o sahneler sadeleştirilmiş şablona göre denetlenir
      const noCoverBody = coverOnlyFirst([{ text: '' }, { text: ru.body }], ru.body)[1].text;
      const qs = sc.map((s, i) => ruleCheck(i > 0 && s.text.includes(NO_COVER) ? noCoverBody : ru.body, s.text));
      const worst = qs.reduce((a, q) => (q.score < a.score ? q : a), qs[0]);
      return Object.assign({}, worst, { scenes: qs.map(q => ({ ok: q.ok, score: q.score, missing: q.missing })) });
    }
    const scenes = toPrompt(r).scenes;
    return scenes.length ? sceneQuality(r.kind, scenes, qLang(r), qualityOpts(r.brand_id)) : checkPrompt(r.kind, r.text, qLang(r), qualityOpts(r.brand_id));
  };
  // 7.11: bu prompt'a verilen oy (yoksa null)
  const fbOf = (brandId, type, id) => {
    const f = db.prepare('SELECT vote, reasons, note FROM feedback WHERE brand_id = ? AND target_type = ? AND target_id = ?').get(brandId, type, id);
    return f ? { vote: f.vote, reasons: parseJson(f.reasons, []) || [], note: f.note } : null;
  };
  function detail(r) {
    const ru = ruleOf(r.brand_id, r.rule_id);
    return Object.assign(toPrompt(r), {
      rule: ru ? { id: ru.id, name: ru.name } : null,
      quality: quality(r),
      // Reels yayın paketi: altyazı (.srt plandaki konuşma saniyelerinden), takvimdeki içerik
      srt: r.plan ? (() => { const pl = parseJson(r.plan, null); return pl ? buildSrt(pl) : ''; })() : '',
      content: (() => { const c = db.prepare('SELECT id, scheduled_at FROM contents WHERE prompt_id = ? ORDER BY created_at DESC LIMIT 1').get(r.id); return c ? { id: c.id, scheduledAt: c.scheduled_at } : null; })(),
      planIssues: r.plan ? (() => { const pl = parseJson(r.plan, null); return pl ? planIssues(pl, toPrompt(r).scenes, reelsCheckOpts(r.brand_id)) : []; })() : [],
      feedback: fbOf(r.brand_id, 'prompt', r.id),
      // 7.10: hedef araca göre kopyalanacak çıktı (yalnız İngilizce hâlde)
      toolOutput: PROMPT_KINDS[r.kind].english && (r.lang || 'en') === 'en' ? toolOutput(r.kind, r.tool, r.text, r.aspect) : null,
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
  function rules(kind, lang = 'en', tool = '') {
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
      SKELETONS[kind] ? skeletonInstruction(kind, k.english ? lang : 'en') : '',
      kind === 'reels' ? REELS_RULES : '',
      toolInstruction(kind, tool)
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
    kinds: Object.fromEntries(Object.entries(PROMPT_KINDS).map(([k, v]) => [k, { label: v.label, english: v.english, hint: v.hint, tools: Object.fromEntries(Object.entries(toolsFor(k)).map(([t, d]) => [t, d.label])) }])),
    statuses: REELS_STATUSES,
    aspects: ASPECTS,
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

    // 7.13: model karşılaştırması için aynı kemik + aynı marka kimliğiyle istem (kaydetmeden) ve kalite puanı
    compose(brandId, { kind, brief, lang = 'tr', tool = '' } = {}) {
      const b = brands.get(brandId);
      const k = oneOf(kind, Object.keys(PROMPT_KINDS), 'Prompt türü');
      const want = text(brief, { field: 'İstek', max: 2000, required: true });
      const lg = PROMPT_KINDS[k].english && lang === 'en' ? 'en' : 'tr';
      const prompt = ['PROMPT STUDIO', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rules(k, lg, validTool(k, tool) ? tool : ''), '',
        `İSTEK (kullanıcının kısa tarifi):\n${want}`, '', 'Sadece şu JSON biçiminde yanıt ver:', SHAPE].join('\n');
      return { prompt, kind: k, lang: lg, label: PROMPT_KINDS[k].label };
    },
    readOutput(kind, output, lang) { return clean(output, kind, '', lang); },
    score(brandId, kind, textIn, lang) { return checkPrompt(kind, textIn, lang, qualityOpts(brandId)); },

    // AI ile yeni prompt: kısa tarif (brief) → tam prompt
    async create(brandId, { kind, brief, modelRef = null, lang = 'tr', scenes: sceneCount = 0, tool = '', ruleId = '', plan = null } = {}) {
      const b = brands.get(brandId);
      const k = oneOf(kind, Object.keys(PROMPT_KINDS), 'Prompt türü');
      const want = text(brief, { field: 'İstek', max: 2000, required: true });
      const rule = pickRule(b.id, k, String(ruleId || ''));
      const lg = rule ? (PROMPT_KINDS[k].english && rule.lang === 'en' ? 'en' : 'tr') : PROMPT_KINDS[k].english && lang === 'en' ? 'en' : 'tr';
      const tl = validTool(k, tool) ? tool : '';
      const nScenes = Math.round(Number(sceneCount) || 0);
      // Reels: onaylanan senaryo planı varsa sahne sayısı ve içerik plandan gelir
      if (plan && k === 'reels') { const pl = cleanPlan(plan); return this.createScenes(b, k, want, pl.scenes.length, lg, modelRef, tl, rule, pl); }
      if (nScenes >= 2) return this.createScenes(b, k, want, Math.min(k === 'reels' ? REELS_LIMITS.maxScenes : MAX_SCENES, nScenes), lg, modelRef, tl, rule);
      if (rule) return this.createWithRule(b, k, want, lg, modelRef, tl, rule);
      const prompt = ['PROMPT STUDIO', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rules(k, lg, tl), '',
        `İSTEK (kullanıcının kısa tarifi):\n${want}`, '', 'Sadece şu JSON biçiminde yanıt ver:', SHAPE].join('\n');
      let r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.8 });
      let c = clean(r.output, k, want.slice(0, 60), lg);
      // 7.6: zorunlu eksik varsa eksikler söylenerek bir kez daha denenir; daha iyi olan tutulur
      let q = checkPrompt(k, c.text, lg, qualityOpts(b.id));
      let retried = false;
      if (!q.ok && qualityRetry()) {
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
      db.prepare('INSERT INTO prompts (id, brand_id, kind, title, brief, text, text_tr, model, lang, tool, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, k, c.title, want, c.text, c.textTr, r.servedRef || r.ref, lg, tl, t, t);
      const created = row(b.id, id);
      saveVersion(created, 'İlk üretim');
      return Object.assign(detail(created), { ai: Object.assign(meta(r), { qualityRetried: retried }) });
    },

    // Reels senaryo planı (kaydedilmez): espri, akış, sahne süreleri, saniyeler ve replikler. Eski Reels bölümünün kuralları
    // ve kalite kontrolü; zamanlama sorunu varsa sorunlar söylenerek bir kez daha yazılır, daha az sorunlu olan tutulur.
    async plan(brandId, { brief, scenes = 0, modelRef = null } = {}) {
      const b = brands.get(brandId);
      const want = text(brief, { field: 'İstek', max: 2000, required: true });
      const n = Math.max(0, Math.min(REELS_LIMITS.maxScenes, Math.round(Number(scenes) || 0)));
      const settings = reels ? reels.settings(b.id) : { character: 'Karakter', style: '3d' };
      const book = bookBlock(parseJson((db.prepare('SELECT character_book FROM brands WHERE id = ?').get(b.id) || {}).character_book, {}) || {});
      const ask = planPrompt({ brandName: b.name, memory: brands.memory(b.id), settings, topic: want, scenes: n, extra: [book, reelsMemory(b.id)].filter(Boolean).join('\n\n') });
      const opts = reelsCheckOpts(b.id);
      const attempt = async (prompt, temperature) => {
        // Senaryo planı özen ister: hız ayarı Hızlı olsa da en az Dengeli düşünülür
        const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature, effort: 'medium' });
        const pl = normalizeScenario(r.output, { titleStyle: settings.titleStyle || 'pop' });
        if (!pl) return { r, pl: null, issues: ['x'] };
        if (n >= 1) pl.scenes = pl.scenes.slice(0, n);
        return { r, pl, issues: checkQuality(pl, opts) };
      };
      let a = await attempt(ask, 0.9);
      let retried = false;
      const timing = list => list.filter(t => /saniye|sığmıyor|boş|çakışıyor|konuşma|replik/i.test(t));
      if (!a.pl || timing(a.issues).length) {
        try {
          const fix = a.pl ? `ÖNCEKİ DENEMEDEKİ SORUNLAR (bunları düzelterek yeniden yaz):\n${a.issues.map(t => '- ' + t).join('\n')}\nÖNCEKİ DENEME:\n${JSON.stringify(a.pl)}` : 'ÖNCEKİ DENEME KULLANILAMADI: yalnız istenen JSON biçiminde yanıt ver.';
          const a2 = await attempt(ask + '\n\n' + fix, 0.6);
          retried = true;
          if (a2.pl && (!a.pl || a2.issues.length <= a.issues.length)) a = Object.assign(a2, { r: Object.assign(a2.r, { cost: (a.r.cost || 0) + (a2.r.cost || 0) }) });
        } catch { /* ilk sonuç kalır */ }
      }
      if (!a.pl) throw badRequest('Model kullanılabilir bir senaryo döndürmedi; tekrar dene ya da başka model seç.');
      const pub = fixPublishing(a.pl, b.name);
      a.pl = pub.plan; a.issues = a.issues.concat(pub.notes);
      return { plan: a.pl, issues: a.issues, totalSeconds: totalSeconds(a.pl), ai: Object.assign(meta(a.r), { qualityRetried: retried }) };
    },
    // Düzenlenen planı yeniden ölçer (replik süreye sığıyor mu, saniyeler boşluksuz mu); AI çağrısı yok
    checkPlan(brandId, { plan } = {}) {
      const b = brands.get(brandId);
      const pl = cleanPlan(plan);
      return { plan: pl, issues: checkQuality(pl, reelsCheckOpts(b.id)), totalSeconds: totalSeconds(pl) };
    },

    // Karakter ve mekân sabitliği: her sahne için ilk kare görseli prompt'u (Flow'da görselden video). Sabit kısım kodla kurulur
    // (stil + karakter kitabındaki İngilizce görünüş + plandaki mekân ve ışık, her sahnede birebir aynı); yapay zekâ yalnız
    // sahnenin 0. saniyesindeki pozu ve kadrajı yazar. Sonuç planın içinde saklanır.
    async firstFrames(brandId, id, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const pl = r.plan ? parseJson(r.plan, null) : null;
      if (!pl || !pl.scenes || !pl.scenes.length) throw badRequest('İlk kare görselleri senaryo planı olan Reels için yazılır.');
      const settings = reels ? reels.settings(b.id) : { character: 'Karakter', style: '3d' };
      const book = parseJson((db.prepare('SELECT character_book FROM brands WHERE id = ?').get(b.id) || {}).character_book, {}) || {};
      const prompt = ['REELS İLK KARE GÖRSELLERİ', `Marka: ${b.name}. Karakter: ${settings.character}.`,
        `Korunacak mekân ve ışık (Türkçe): ${pl.setting || '-'}`, '',
        'Her sahnenin 0. saniyesindeki ilk kareyi İNGİLİZCE ve kısa tarif et: karakterin pozu, yüz ifadesi, elindeki/önündeki nesne, kadraj (close-up / medium / wide) ve kamera açısı. Karakterin görünüşünü, kıyafetini ve rengini YAZMA (sabit tarif ayrıca eklenir). Mekânı yeniden tarif etme; yalnız sahneye özgü nesneleri ekle. Yazı, harf, logo isteme.',
        "Ayrıca 'settingEn' alanına korunacak mekân ve ışık cümlesinin İngilizcesini yaz (her sahnede aynen kullanılacak).", '',
        `SAHNELER:\n${pl.scenes.map((x, i) => `${i + 1}. Başlangıç: ${x.start || '-'} | İlk aksiyon: ${(x.beats && x.beats[0] && x.beats[0].action) || '-'} | Kamera: ${(x.beats && x.beats[0] && x.beats[0].camera) || '-'}`).join('\n')}`, '',
        'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify({ settingEn: 'English setting and lighting sentence', frames: [{ scene: 1, shot: 'English first-frame description' }] })].join('\n');
      const out = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.4 });
      const frames = Array.isArray(out.output && out.output.frames) ? out.output.frames : [];
      const settingEn = String((out.output && out.output.settingEn) || '').trim().slice(0, 600);
      if (frames.length < pl.scenes.length) throw badRequest('Model her sahne için ilk kare döndürmedi; tekrar dene.');
      const style = (REELS_STYLES[settings.style] || REELS_STYLES['3d']).en;
      const look = bookImageLine(Object.assign({ name: settings.character }, book)) || `The main character "${settings.character}" keeps exactly the same design as the reference character in every frame.`;
      const fixed = ['Vertical 9:16, first frame of a video clip.', style, look, settingEn ? `Setting and lighting (identical in every scene): ${settingEn}` : ''].filter(Boolean).join(' ');
      const scenes = pl.scenes.map((x, i) => Object.assign({}, x, { firstFrame: `${fixed} Shot: ${String(frames[i].shot || '').trim().slice(0, 600)} No text, no letters, no logo, no watermark.` }));
      db.prepare('UPDATE prompts SET plan = ? WHERE id = ?').run(JSON.stringify(Object.assign({}, pl, { scenes, settingEn })), r.id);
      return Object.assign(detail(row(b.id, r.id)), { ai: meta(out) });
    },

    // Takvime ekle: senaryolu Reels prompt'u takvimde içerik olur (açıklama ve hashtag'lerle)
    schedule(brandId, id, { scheduledAt = null } = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      if (!workspace) throw badRequest('Takvim kullanılamıyor.');
      const pl = parseJson(r.plan, {}) || {};
      const content = workspace.createContent({ brandId: b.id, title: r.title, type: r.kind === 'reels' ? 'reels' : 'post', status: r.status === 'paylasildi' ? 'yayinlandi' : 'hazirlaniyor', scheduledAt, notes: 'Prompt Studio senaryosundan oluşturuldu.', caption: String(pl.caption || '').slice(0, 2200), hashtags: pl.hashtags || [] });
      db.prepare('UPDATE contents SET prompt_id = ? WHERE id = ?').run(r.id, content.id);
      return Object.assign(content, { promptId: r.id });
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
      // 7.13: karşılaştırmadan kaydedilen Türkçe prompt Türkçe olarak işaretlenir (sonra çevrilebilir)
      const lg = PROMPT_KINDS[k].english && body.lang === 'tr' ? 'tr' : 'en';
      db.prepare('INSERT INTO prompts (id, brand_id, kind, title, brief, text, text_tr, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, k, text(body.title, { field: 'Başlık', max: 80 }) || t.slice(0, 50), text(body.brief, { field: 'İstek', max: 2000 }) || '', t, text(body.textTr, { field: 'Türkçesi', max: MAX_TEXT }) || '', lg, ts, ts);
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
      // 7.10: hedef araç ve oran
      const tool = 'tool' in body ? String(body.tool || '') : (r.tool || '');
      if (tool && !validTool(r.kind, tool)) throw badRequest('Bu prompt türü için geçersiz araç.');
      const aspect = 'aspect' in body ? String(body.aspect || '') : (r.aspect || '');
      if (aspect && !ASPECTS.includes(aspect)) throw badRequest('Geçersiz oran.');
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
        // Planlı Reels'te sahne elle silinirse plan da kısalır (süre, replik ve ilk kare sahneyle birlikte gider)
        const pl = r.plan ? parseJson(r.plan, null) : null;
        if (pl && Array.isArray(pl.scenes) && pl.scenes.length > sc.length) db.prepare('UPDATE prompts SET plan = ? WHERE id = ?').run(JSON.stringify(Object.assign({}, pl, { scenes: pl.scenes.slice(0, sc.length) })), r.id);
      }
      // Reels: çekim durumu; açıklama ve hashtag'ler planın içinde saklanır
      const status = 'status' in body ? oneOf(body.status, Object.keys(REELS_STATUSES), 'Durum') : (r.status || 'taslak');
      let planJson = r.plan || '';
      if (planJson && ('caption' in body || 'hashtags' in body)) {
        const pl = parseJson(planJson, {}) || {};
        if ('caption' in body) pl.caption = (text(body.caption, { field: 'Açıklama', max: 2200 }) || '');
        if ('hashtags' in body) pl.hashtags = (Array.isArray(body.hashtags) ? body.hashtags : String(body.hashtags || '').split(/[\s,]+/)).map(h => polish(h).replace(/^#?/, '#')).filter(h => h.length > 1).slice(0, 30);
        planJson = JSON.stringify(pl);
      }
      db.prepare('UPDATE prompts SET status = ? WHERE id = ?').run(status, r.id);
      if (planJson !== (r.plan || '')) db.prepare('UPDATE prompts SET plan = ? WHERE id = ?').run(planJson, r.id);
      const changed = next.text !== r.text || next.textTr !== r.text_tr;
      db.prepare('UPDATE prompts SET title = ?, text = ?, text_tr = ?, favorite = ?, is_example = ?, tool = ?, aspect = ?, model = ?, scenes = ?, updated_at = ? WHERE id = ?')
        .run(next.title, next.text, next.textTr, next.favorite, next.example, tool, aspect, changed ? '' : r.model, scenesJson, now(), r.id);
      if (changed) db.prepare("UPDATE prompts SET scenes_en = '' WHERE id = ?").run(r.id);
      const u = row(b.id, r.id);
      if (changed) saveVersion(u, 'Elle düzenlendi');
      return detail(u);
    },

    // 7.8: çok sahneli prompt (eski sistemdeki gibi): sahneler birbirinin devamı, her biri kemiğe uyan tam bir prompt
    async createScenes(b, k, want, n, lg, modelRef, tl = '', rule = null, plan = null) {
      const shape = JSON.stringify({ title: 'Kısa Türkçe başlık', scenes: [{ title: 'Sahne adı', prompt: 'Sahnenin tam prompt\'u' }] });
      const prompt = ['PROMPT STUDIO · SAHNELİ', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rule ? ruleRules(k, rule, n) : rules(k, lg, tl), '',
        `İSTEK (kullanıcının kısa tarifi):\n${want}`, '',
        plan ? planBlock(plan) + '\n' : '',
        `GÖREV: Bu ${plan ? 'plan' : 'istek'} için birbirinin devamı olan ${n} sahne yaz. Her sahne kendi başına ${rule ? 'şablona birebir uyan' : 'kemiğe uyan'} tam bir prompt olsun; karakter, mekân, ışık ve stil sahneler arasında tutarlı kalsın; her sahne bir öncekinin bittiği yerden başlasın.`,
        '', 'Sadece şu JSON biçiminde yanıt ver:', shape].join('\n');
      let r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: rule ? 0.6 : 0.8 });
      let scenes = sceneList(r.output && r.output.scenes).slice(0, n); // fazla sahne gelirse istenen sayıda kesilir
      if (!scenes.length) throw badRequest('Model kullanılabilir sahne döndürmedi; tekrar dene.');
      let retried = false;
      // Şablon kontrolü: eksik bölüm ya da doldurulmamış [alan] varsa bir kez daha yazılır, daha iyisi tutulur
      if (rule && qualityRetry()) {
        const worst = list => Math.min(...list.map(s => ruleCheck(rule.body, s.text).score));
        const q = scenes.map(s => ruleCheck(rule.body, s.text)).find(x => !x.ok);
        if (q) {
          try {
            const r2 = await ai.run({ task: 'yazim', brandId: b.id, prompt: prompt + '\n\n' + retryInstruction(q), json: true, modelRef, temperature: 0.5 });
            const s2 = sceneList(r2.output && r2.output.scenes).slice(0, n);
            retried = true;
            if (s2.length && worst(s2) >= worst(scenes)) { r = Object.assign(r2, { cost: (r.cost || 0) + (r2.cost || 0) }); scenes = s2; }
          } catch { /* ilk sonuç kalır */ }
        }
      }
      if (rule) scenes = coverOnlyFirst(scenes, rule.body);
      const title = (plan && plan.title) || polish(r.output && r.output.title).slice(0, 80) || want.slice(0, 60);
      const id = newId(); const t = now();
      db.prepare('INSERT INTO prompts (id, brand_id, kind, title, brief, text, text_tr, model, lang, scenes, tool, rule_id, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, k, title, want, joinScenes(scenes, lg), '', r.servedRef || r.ref, lg, JSON.stringify(scenes), tl, rule ? rule.id : '', plan ? JSON.stringify(plan) : '', t, t);
      const created = row(b.id, id);
      saveVersion(created, `İlk üretim (${scenes.length} sahne${rule ? `, "${rule.name}" şablonu` : ''})`);
      return Object.assign(detail(created), { ai: Object.assign(meta(r), { qualityRetried: retried }) });
    },

    // Kural şablonuyla tek prompt
    async createWithRule(b, k, want, lg, modelRef, tl, rule) {
      const prompt = ['PROMPT STUDIO · KURAL ŞABLONU', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', ruleRules(k, rule), '',
        `İSTEK (kullanıcının kısa tarifi):\n${want}`, '', 'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify({ title: 'Kısa Türkçe başlık (en çok 60 karakter)', prompt: 'Şablona göre doldurulmuş prompt\'un tamamı' })].join('\n');
      let r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.6 });
      let c = clean(r.output, k, want.slice(0, 60), 'tr');
      let q = ruleCheck(rule.body, c.text);
      let retried = false;
      if (!q.ok && qualityRetry()) {
        try {
          const r2 = await ai.run({ task: 'yazim', brandId: b.id, prompt: prompt + '\n\n' + retryInstruction(q), json: true, modelRef, temperature: 0.5 });
          const c2 = clean(r2.output, k, want.slice(0, 60), 'tr');
          const q2 = ruleCheck(rule.body, c2.text);
          retried = true;
          if (q2.score >= q.score) { r = Object.assign(r2, { cost: (r.cost || 0) + (r2.cost || 0) }); c = c2; q = q2; }
        } catch { /* ilk sonuç kalır */ }
      }
      const id = newId(); const t = now();
      db.prepare('INSERT INTO prompts (id, brand_id, kind, title, brief, text, text_tr, model, lang, tool, rule_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, k, c.title, want, c.text, '', r.servedRef || r.ref, lg, tl, rule.id, t, t);
      const created = row(b.id, id);
      saveVersion(created, `İlk üretim ("${rule.name}" şablonu)`);
      return Object.assign(detail(created), { ai: Object.assign(meta(r), { qualityRetried: retried }) });
    },

    // Kural şablonları: listele, ekle, düzenle, varsayılan yap, sil
    listRules(brandId, kind = null) {
      const b = brands.get(brandId);
      return db.prepare('SELECT * FROM prompt_rules WHERE brand_id = ? OR shared = 1 ORDER BY kind, is_default DESC, updated_at DESC').all(b.id)
        .filter(r => !kind || r.kind === kind).map(toRule);
    },
    saveRule(brandId, ruleId, body = {}) {
      const b = brands.get(brandId);
      if (ruleId === BUILTIN_RULE_ID) throw badRequest('Hazır şablon değiştirilemez; "Hazır örnek" ile kopyasını kaydedip düzenle.');
      const old = ruleId ? ruleOf(b.id, ruleId) : null;
      if (ruleId && !old) throw notFound('Kural şablonu bulunamadı.');
      const kind = oneOf(body.kind != null ? body.kind : old && old.kind, Object.keys(PROMPT_KINDS), 'Prompt türü');
      const name = text(body.name != null ? body.name : old && old.name, { field: 'Şablon adı', max: 80, required: true });
      const ruleBody = text(body.body != null ? body.body : old && old.body, { field: 'Şablon', max: MAX_RULE, required: true });
      if (ruleBody.length < 20) throw badRequest('Şablon çok kısa; uyulmasını istediğin yapıyı yaz.');
      const lang = (body.lang != null ? body.lang : old && old.lang) === 'en' ? 'en' : 'tr';
      const shared = body.shared != null ? Boolean(body.shared) : old ? Boolean(old.shared) : false;
      const example = body.example != null ? (text(body.example, { field: 'Örnek prompt', max: 8000 }) || '') : old ? old.example : '';
      const spec = body.spec && typeof body.spec === 'object' ? JSON.stringify(body.spec).slice(0, 4000) : old ? old.spec : '{}';
      const t = now();
      const id = old ? old.id : newId();
      const isDefault = body.isDefault != null ? Boolean(body.isDefault) : old ? Boolean(old.is_default) : !db.prepare('SELECT 1 FROM prompt_rules WHERE (brand_id = ? OR shared = 1) AND kind = ?').get(b.id, kind);
      transaction(db, () => {
        if (isDefault) db.prepare('UPDATE prompt_rules SET is_default = 0 WHERE (brand_id = ? OR shared = 1) AND kind = ?').run(b.id, kind);
        if (old) db.prepare('UPDATE prompt_rules SET kind = ?, name = ?, body = ?, lang = ?, is_default = ?, shared = ?, example = ?, spec = ?, updated_at = ? WHERE id = ?').run(kind, name, ruleBody, lang, isDefault ? 1 : 0, shared ? 1 : 0, example, spec, t, id);
        else db.prepare('INSERT INTO prompt_rules (id, brand_id, kind, name, body, lang, is_default, shared, example, spec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, b.id, kind, name, ruleBody, lang, isDefault ? 1 : 0, shared ? 1 : 0, example, spec, t, t);
      });
      return toRule(ruleOf(b.id, id));
    },
    removeRule(brandId, ruleId) {
      const b = brands.get(brandId);
      const r0 = ruleId === BUILTIN_RULE_ID ? null : ruleOf(b.id, ruleId);
      if (!r0) throw notFound('Kural şablonu bulunamadı.');
      db.prepare('DELETE FROM prompt_rules WHERE id = ?').run(r0.id);
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
      // Planlı Reels: sahne işlemi planı da günceller (süre, saniye saniye aksiyon, replik); kapak yazısı yalnız ilk sahnede kalır
      const plan = r.plan ? parseJson(r.plan, null) : null;
      const at = action === 'add' ? scenes.length : i;
      if (plan && action === 'add') {
        if (scenes.length >= REELS_LIMITS.maxScenes) throw badRequest(`Reels en fazla ${REELS_LIMITS.maxScenes} sahne olabilir.`);
        if (totalSeconds(plan) + REELS_LIMITS.minScene > REELS_LIMITS.maxTotal) throw badRequest(`Video ${totalSeconds(plan)} saniye; yeni sahne ${REELS_LIMITS.maxTotal} saniye üst sınırını aşar.`);
      }
      const planAsk = plan ? [planBlock(plan), '',
        `PLANLI SAHNE KURALI: Değişen sahnenin plandaki karşılığını da 'planScene' alanında ver (duration, start, beats [from, to, action, camera, sound], line, lineFrom, lineTo, endFrame). Sahne en fazla ${REELS_LIMITS.maxScene} saniye; "uzatmak" saniye eklemek değil, akışı ve ayrıntıyı zenginleştirmektir. Toplam süre ${REELS_LIMITS.maxTotal} saniyeyi aşmasın. Sahne prompt'u planScene ile birebir uyumlu olsun (aynı süre, aynı saniye aralıkları, replik kelimesi kelimesine). Konuşma süresi saniyede yaklaşık ${REELS_LIMITS.speechRate} kelimeyi aşmasın.`,
        at > 0 ? `Bu sahne ${at + 1}. sahne: kapak yazısı bölümüne yalnızca "${NO_COVER}" yaz.` : ''].filter(Boolean).join('\n') : '';
      const shape = plan ? { title: 'Sahne adı', prompt: 'Sahnenin tam prompt\'u', planScene: { duration: 7, start: '...', beats: [{ from: 0, to: 7, action: '...', camera: '...', sound: '' }], line: 'Replik', lineFrom: 0.5, lineTo: 7, endFrame: '...' } } : { title: 'Sahne adı', prompt: 'Sahnenin tam prompt\'u' };
      const prompt = ['PROMPT STUDIO · SAHNE', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, r.kind), '', rulesFor(r), '',
        `İLK İSTEK: ${r.brief || '-'}`, '', planAsk, 'MEVCUT SAHNELER:', joinScenes(scenes, lg), '', `YAPILACAK: ${ask}`, '',
        'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify(shape)].join('\n');
      const out = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef, temperature: 0.8 });
      const sc = sceneList([out.output])[0];
      if (!sc) throw badRequest('Model sahne döndürmedi; tekrar dene.');
      let next = scenes.slice();
      if (action === 'add') next.push(sc); else next[i] = Object.assign({}, sc, { title: sc.title || scenes[i].title });
      const ru = ruleOf(r.brand_id, r.rule_id);
      if (plan && ru) next = coverOnlyFirst(next, ru.body);
      let planJson = r.plan || '';
      if (plan) {
        // Modelin verdiği plan sahnesi aynı kurallarla düzenlenir (süre sınırı, konuşma hızına göre uzatma); gelmezse plan sahnesi korunur
        const ps = out.output && out.output.planScene;
        const one = ps && typeof ps === 'object' ? normalizeScenario({ title: plan.title || 'Reels', scenes: [ps] }) : null;
        if (one && one.scenes[0]) {
          const scenesNext = plan.scenes.slice();
          if (action === 'add') scenesNext.push(one.scenes[0]); else scenesNext[i] = one.scenes[0];
          planJson = JSON.stringify(Object.assign({}, plan, { scenes: scenesNext }));
        }
      }
      db.prepare("UPDATE prompts SET scenes = ?, text = ?, model = ?, plan = ?, scenes_en = '', updated_at = ? WHERE id = ?").run(JSON.stringify(next), joinScenes(next, lg), out.servedRef || out.ref, planJson, now(), r.id);
      const u = row(b.id, r.id);
      saveVersion(u, note);
      return Object.assign(detail(u), { ai: meta(out) });
    },

    // 7.5: Türkçe yazılmış prompt'u İngilizceye çevirir; Türkçesi "Türkçesi" alanına geçer, İngilizce üretim aracına verilir
    async translate(brandId, id, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      // Reels: Türkçe senaryo asıl kalır; İngilizcesi yalnız istenince yazılır (Flow/Veo İngilizceyi daha iyi anlar).
      // Replikler ve kapak yazısı Türkçe kalır: karakter Türkçe konuşur, kapakta Türkçe yazı çıkar.
      if (r.kind === 'reels') {
        const scs = toPrompt(r).scenes;
        const src = scs.length ? scs : [{ title: r.title, text: r.text }];
        const prompt = ['REELS PROMPT ÇEVİRİSİ (Google Flow / Veo için)',
          'Aşağıdaki Türkçe sahne prompt\'larını sırasını ve bölüm yapısını koruyarak İngilizceye çevir. Video terimlerini İngilizce kullan (shot types, camera moves, lighting). Yeni bilgi ekleme, açıklama yazma.',
          'TÜRKÇE KALACAKLAR: Karakterin söylediği replikler (tırnak içindeki konuşma metni) ve kapak yazısı metni KELİMESİ KELİMESİNE Türkçe kalır; yanlarına "spoken in Turkish" / "on-screen text in Turkish, exactly" diye belirt. Karakter adı değişmez.',
          '', `SAHNELER (JSON):\n${JSON.stringify(src.map(x => ({ title: x.title, prompt: x.text })))}`, '', 'Sadece şu JSON biçiminde yanıt ver:', JSON.stringify({ scenes: [{ title: 'Scene title', prompt: 'English prompt' }] })].join('\n');
        const out = await ai.run({ task: 'ceviri', brandId: b.id, prompt, json: true, modelRef, temperature: 0.2 });
        const en = sceneList(out.output && out.output.scenes);
        if (en.length !== src.length) throw badRequest('Model sahnelerin hepsini çevirmedi; tekrar dene.');
        db.prepare('UPDATE prompts SET scenes_en = ? WHERE id = ?').run(JSON.stringify(en), r.id);
        return Object.assign(detail(row(b.id, r.id)), { ai: meta(out) });
      }
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
      const prompt = ['PROMPT GELİŞTİRME', `Sen '${b.name}' markası için profesyonel prompt yazarısın.`, '', context(b, k), '', rulesFor(r), '',
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
