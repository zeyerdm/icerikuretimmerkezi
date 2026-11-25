// AI asistanı: seçili markanın hafızasıyla konuşur ve modüllerde işlemleri gerçekten uygular
// (fikir kaydetme/düzenleme, Reels fikir havuzu, Reels senaryosu, post tasarımı, prompt, takvim, görev).
// Yanıt biçimi: { reply, actions: [...] }. Bilinmeyen veya geçersiz işlemler uygulanmaz; başarısız olan işlem
// sonuç listesinde hata olarak görünür (yapılmış gibi gösterilmez).
import { newId, now, text, parseJson } from '../lib/http.js';
import { transaction } from '../db.js';
import { IDEA_CATEGORIES, IDEA_FORMATS } from './ideas.js';
import { CONTENT_TYPES } from './workspace.js';
import { PROMPT_KINDS } from './prompts.js';
import { streamCtx } from '../lib/streamCtx.js';
import { cancelled } from './ai/providers/common.js';
import { upcomingText, specialDays } from './specialDays.js';

const HISTORY_LIMIT = 8;
const PAST_CHARS = 700; // geçmiş mesajlar kısaltılarak gönderilir (uzun eski yanıtlar her seferinde tekrar ödenmez)
// Bağlam seçici: üretim/plan isteyen mesajda tam hafıza (son fikirler, performans, özel günler); sohbet ve sorularda hafif
// hafıza. Karar kodla verilir, yapay zekâ çağrılmaz.
export const wantsProduction = m => /fikir|öner|plan|takvim|hafta|ay(?:lık|ın)?\b|içerik|reels|post|carousel|story|hikâye|hikaye|kampanya|özel gün|bayram|tasarla|üret|yaz|senaryo|prompt|görsel/i.test(String(m || ''));
const MAX_IDEAS_PER_ACTION = 12;
// AI çağıran ağır işlemler (senaryo, post, prompt) tek mesajda en çok bu kadar
const MAX_HEAVY = 3;
const HEAVY = ['create_reels', 'create_post', 'create_prompt', 'create_image'];

export function createAssistantService({ db, ai, brands, ideas, reels = null, posts = null, prompts = null, workspace = null, images = null, memory = null }) {
  const toMessage = r => ({ id: r.id, role: r.role, content: r.content, actions: parseJson(r.actions, []), createdAt: r.created_at });
  const save = (brandId, role, content, actions = []) => {
    const row = { id: newId(), brand_id: brandId, role, content, actions: JSON.stringify(actions), created_at: now() };
    db.prepare('INSERT INTO chat_messages (id, brand_id, role, content, actions, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.id, row.brand_id, row.role, row.content, row.actions, row.created_at);
    return toMessage(row);
  };

  function history(brandId, limit = 50) {
    // Aynı milisaniyede kaydedilen mesajlar (soru ve yanıt) ekleme sırasına göre dizilir
    return db.prepare('SELECT * FROM (SELECT *, rowid AS seq FROM chat_messages WHERE brand_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?) ORDER BY created_at ASC, seq ASC')
      .all(brandId, limit).map(toMessage);
  }

  function buildPrompt(brand, memory, past, message) {
    const categories = Object.entries(IDEA_CATEGORIES).map(([id, label]) => `${id} (${label})`).join(', ');
    return [
      "Sen 'KREATİFHANE' (Kreatif Yönetim Platformu) uygulamasının AI içerik asistanısın. Şu an yalnızca aşağıdaki marka için çalışıyorsun.",
      'Yanıtlarını bu markanın kimliğine, hedef kitlesine ve iletişim diline göre yaz. Başka markaların bilgisini kullanma, uydurma bilgi verme.',
      '',
      'MARKA HAFIZASI:',
      memory,
      '',
      past.length ? 'SON KONUŞMA:\n' + past.map(m => `${m.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${String(m.content).length > PAST_CHARS ? String(m.content).slice(0, PAST_CHARS) + '…' : m.content}`).join('\n') : '',
      '',
      'MARKANIN SON KAYITLARI (kullanıcı "bu fikir", "bu senaryo" derse buradaki id ile işlem yap):',
      context(brand.id),
      '',
      `BUGÜN: ${new Date().toISOString().slice(0, 10)}`,
      ...(wantsProduction(message) ? ['YAKLAŞAN ÖZEL GÜNLER VE DÖNEMLER (fikir ve plan önerirken bunları dikkate al; anma günlerinde ticari içerik önerme):', upcomingText(45) || '(yok)'] : []),
      '',
      'YAPABİLECEĞİN İŞLEMLER (actions listesine ekle; uygulama gerçekten yapar):',
      `- save_ideas: {ideas: [{title, description, category, format}]} içerik fikirlerini fikir havuzuna kaydeder. Kategoriler: ${categories}. Tür (format): ${Object.keys(IDEA_FORMATS).join(', ')} (istekte geçmiyorsa genel). En fazla ${MAX_IDEAS_PER_ACTION}.`,
      '- update_idea: {id, title, description} kayıtlı bir fikri değiştirir ("bu fikri daha eğlenceli yap" gibi).',
      `- add_reels_ideas: {ideas: [{text, category}]} fikir havuzuna Reels türünde kısa fikirler ekler ("haftaya 5 Reels fikri üret"). En fazla ${MAX_IDEAS_PER_ACTION}.`,
      '- create_reels: {topic, scenes?: 1-6} Prompt Studio\'da konudan saniye saniye Reels senaryosu (plan + Google Flow sahne prompt\'ları) yazar (ayrı bir üretim; birkaç saniye sürer).',
      '- create_post: {topic, kind: "carousel"|"post"|"story"|"kapak"(Reels kapağı)|"reklam"|"grafik"(bilgi grafiği), slides: 3-10 (yalnız carousel), fromReelsId?} carousel/post tasarımı üretir; "bu senaryoya göre post tasarla" ise fromReelsId ver.',
      `- create_prompt: {kind, brief} Prompt Studio'da prompt üretir. Türler: ${Object.entries(PROMPT_KINDS).map(([k, v]) => `${k} (${v.label})`).join(', ')}.`,
      `- plan_content: {items: [{title, type, date: "YYYY-MM-DD", time?: "HH:MM", ideaId?}]} takvime içerik planlar. Türler: ${Object.keys(CONTENT_TYPES).join(', ')}.`,
      '- create_image: {prompt (İngilizce, ayrıntılı görsel tarifi), aspect: "1:1"|"4:5"|"9:16"|"16:9", useMascot: true|false} görsel modeliyle görsel üretir ve kütüphaneye kaydeder (görsel başına ücretlidir; yalnızca kullanıcı görsel isterse).',
      '- remember: {category: "urun"|"fiyat"|"iletisim"|"saat"|"kampanya"|"sss"|"hikaye"|"diger", title, content} kullanıcı "bunu hatırla / hafızaya kaydet" derse ya da kalıcı bir marka bilgisi (ürün, fiyat, adres, kampanya) verirse marka hafızasına bilgi kartı ekler.',
      '- forbid_words: {words: ["..."]} kullanıcı "şu kelimeyi kullanma" derse yasaklı listeye ekler.',
      '- add_task: {title, dueDate?: "YYYY-MM-DD", priority?: "dusuk"|"orta"|"yuksek"} bu marka için görev ekler.',
      `Senaryo, post ve prompt üretimi ayrı AI çağrısıdır: tek mesajda en çok ${MAX_HEAVY} tane. Kullanıcı açıkça istemedikçe bunları başlatma.`,
      'İşlem sonucunu reply içinde "kaydettim/oluşturdum" diye anlatabilirsin; uygulama başarısız olanları ayrıca gösterir. Listede olmayan bir işi yapmış gibi anlatma.',
      'Kullanıcı yalnızca sohbet ediyor veya soru soruyorsa actions boş liste olsun.',
      '',
      `KULLANICININ MESAJI: ${message}`,
      '',
      'Sadece şu JSON biçiminde yanıt ver:',
      '{"reply": "Kullanıcıya Türkçe, samimi ve net yanıt (yaptığın işlemleri kısaca özetle)", "actions": [{"type": "save_ideas", "ideas": [{"title": "...", "description": "...", "category": "egitici"}]}, {"type": "create_post", "topic": "...", "kind": "carousel", "slides": 6}]}'
    ].filter(s => s !== null).join('\n');
  }

  // Asistanın "bu fikir / bu senaryo" diyebilmesi için son kayıtlar (id'leriyle)
  function context(brandId) {
    const lines = [];
    const short = t => String(t || '').replace(/\s+/g, ' ').slice(0, 110);
    const idList = ideas.list(brandId, { limit: 8 });
    if (idList.length) lines.push('Fikirler:', ...idList.map(i => `  [${i.id}] ${short(i.title)}: ${short(i.description)}`));
    // Reels senaryoları artık Prompt Studio'da (planlı Reels prompt'ları)
    if (prompts) { const r = prompts.list(brandId, { kind: 'reels' }).slice(0, 5); if (r.length) lines.push('Reels senaryoları:', ...r.map(x => `  [${x.id}] ${short(x.title)}`)); }
    if (posts) { const p = posts.list(brandId).slice(0, 5); if (p.length) lines.push('Post tasarımları:', ...p.map(x => `  [${x.id}] ${short(x.title)}`)); }
    return lines.length ? lines.join('\n') : '(henüz kayıt yok)';
  }

  // Intent Router (kural tabanlı): yalnız kısa ve açık bilgi soruları; öneri/üretim isteyen her şey yapay zekâya gider
  function quickAnswer(brand, message) {
    const m = String(message).toLocaleLowerCase('tr-TR').trim();
    if (m.length > 90 || /öner|üret|yaz|tasarla|fikir ver|ne paylaşalım|ne yapalım|nasıl|neden|niçin|plan(la|ı) (yap|çıkar|hazırla)/.test(m)) return null;
    const day = d => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });
    const time = d => new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const DONE = ['tamamlandi', 'yayinlandi'];
    const contents = (from, to) => workspace ? workspace.listContents({ brandId: brand.id, from, to }) : [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const list = (rows, fmt) => rows.slice(0, 10).map(fmt).join('\n') + (rows.length > 10 ? `\n… ve ${rows.length - 10} tane daha` : '');
    // Bugün / yarın / bu hafta takvimde ne var
    const span = /(^|\s)bugün/.test(m) ? [0, 1, 'Bugün'] : /(^|\s)yarın/.test(m) ? [1, 2, 'Yarın'] : /bu hafta|önümüzdeki hafta|7 gün/.test(m) ? [0, 7, 'Önümüzdeki 7 günde'] : null;
    if (span && /ne var|neler var|hangi|planlı|takvim|yayın|paylaşım|içerik/.test(m) && workspace) {
      const from = new Date(start.getTime() + span[0] * 86400000).toISOString(); const to = new Date(start.getTime() + span[1] * 86400000).toISOString();
      const rows = contents(from, to);
      return rows.length ? `${span[2]} ${rows.length} içerik planlı:\n${list(rows, c => `• ${day(c.scheduledAt)} ${time(c.scheduledAt)}: ${c.title} (${c.typeLabel}, ${c.statusLabel})`)}` : `${span[2]} planlı içerik yok.`;
    }
    if (/onay bekle/.test(m) && workspace) {
      const rows = workspace.listContents({ brandId: brand.id, status: 'onay' });
      return rows.length ? `Onay bekleyen ${rows.length} içerik var:\n${list(rows, c => `• ${c.title} (${c.typeLabel})`)}` : 'Onay bekleyen içerik yok.';
    }
    if (/gecik|tarihi geç/.test(m) && /görev|iş|içerik/.test(m) && workspace) {
      const today = start.toISOString().slice(0, 10);
      const tasks = workspace.listTasks({ brandId: brand.id }).filter(t => !t.done && t.dueDate && t.dueDate < today);
      const late = contents(new Date(start.getTime() - 60 * 86400000).toISOString(), new Date().toISOString()).filter(c => !DONE.includes(c.status));
      const parts = [];
      if (/görev|iş/.test(m)) parts.push(tasks.length ? `Geciken ${tasks.length} görev:\n${list(tasks, t => `• ${t.title} (son gün ${t.dueDate})`)}` : 'Geciken görev yok.');
      if (/içerik/.test(m)) parts.push(late.length ? `Tarihi geçmiş ${late.length} içerik:\n${list(late, c => `• ${day(c.scheduledAt)}: ${c.title} (${c.statusLabel})`)}` : 'Tarihi geçmiş içerik yok.');
      return parts.join('\n\n');
    }
    if (/kaç fikir|fikir sayısı|havuzda kaç/.test(m)) {
      const all = ideas.list(brand.id, { limit: 5000 });
      const unused = all.filter(i => !i.used).length;
      return `Fikir havuzunda ${all.length} fikir var; ${unused} tanesi henüz kullanılmadı${all.filter(i => i.favorite).length ? `, ${all.filter(i => i.favorite).length} tanesi favori` : ''}.`;
    }
    if (/özel gün/.test(m) && /yaklaşan|hangi|ne zaman|var mı|listele/.test(m)) {
      const from = start.toISOString().slice(0, 10); const to = new Date(start.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const days = specialDays(from, to, { brands: [brand] }).filter(d => d.category !== 'donem');
      return days.length ? `Önümüzdeki 30 günün özel günleri:\n${list(days, d => `• ${day(d.date + 'T12:00:00')}: ${d.name}${d.importance === 'yuksek' ? ' (önemli)' : ''}`)}` : 'Önümüzdeki 30 günde özel gün yok.';
    }
    return null;
  }

  // Modelin önerdiği işlemleri doğrular ve uygular. Her işlem kendi sonucunu döndürür: { type, ok, ...ya da error }.
  // AI çağıran işlemler sohbet kaydından önce, tek tek yapılır; biri başarısız olursa diğerleri yine denenir.
  async function applyActions(brandId, rawActions) {
    const results = [];
    const list = (Array.isArray(rawActions) ? rawActions : []).filter(a => a && typeof a.type === 'string').slice(0, 10);
    let heavy = 0;
    const fail = (type, err) => results.push({ type, ok: false, error: String((err && err.message) || err).slice(0, 200) });
    for (const a of list) {
      try {
        if (a.type === 'save_ideas' && Array.isArray(a.ideas)) {
          const saved = [];
          let skipped = 0;
          for (const item of a.ideas.slice(0, MAX_IDEAS_PER_ACTION)) {
            const category = item && Object.prototype.hasOwnProperty.call(IDEA_CATEGORIES, item.category) ? item.category : 'bilgilendirici';
            const format = item && Object.prototype.hasOwnProperty.call(IDEA_FORMATS, item.format) ? item.format : 'genel';
            try { saved.push(ideas.create(brandId, { title: String(item.title || ''), description: String(item.description || ''), category, format }, 'assistant')); } catch { skipped++; }
          }
          if (saved.length) {
            brands.logActivity(brandId, 'ideas.generated', `AI asistanı ${saved.length} içerik fikri kaydetti`);
            results.push({ type: 'save_ideas', ok: true, ideas: saved, skipped });
          }
        } else if (a.type === 'update_idea' && a.id) {
          const body = {};
          if (a.title) body.title = String(a.title);
          if (a.description != null) body.description = String(a.description);
          results.push({ type: 'update_idea', ok: true, idea: ideas.update(brandId, String(a.id), body) });
        } else if (a.type === 'add_reels_ideas' && Array.isArray(a.ideas)) {
          // Tek fikir havuzu: Reels fikirleri İçerik fikirlerine "Reels" türüyle yazılır (eski Reels havuzu artık görünmüyor)
          const added = [];
          const key = t => String(t || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
          const have = new Set(db.prepare('SELECT title FROM ideas WHERE brand_id = ?').all(brandId).map(r => key(r.title)));
          for (const item of a.ideas.slice(0, MAX_IDEAS_PER_ACTION)) {
            const category = item && Object.prototype.hasOwnProperty.call(IDEA_CATEGORIES, item.category) ? item.category : 'eglenceli';
            const title = String((item && (item.text || item.title)) || '').trim().slice(0, 200);
            if (!title || have.has(key(title))) continue; // boş ya da tekrar eden fikir atlanır
            try { const idea = ideas.create(brandId, { title, category, format: 'reels' }, 'asistan'); have.add(key(title)); added.push({ id: idea.id, text: idea.title, category: idea.category }); } catch { /* geçersiz fikir atlanır */ }
          }
          if (added.length) results.push({ type: 'add_reels_ideas', ok: true, items: added });
        } else if (HEAVY.includes(a.type)) {
          if (++heavy > MAX_HEAVY) { fail(a.type, `Tek mesajda en çok ${MAX_HEAVY} üretim yapılır; kalanını ayrı iste.`); continue; }
          if (a.type === 'create_reels' && prompts) {
            // Reels tek akış: önce senaryo planı (espri, süreler, replikler), sonra Flow şablonuna dökülen sahneler
            const topic = String(a.topic || '').slice(0, 1000);
            const pl = await prompts.plan(brandId, { brief: topic, scenes: Math.max(1, Math.min(6, Number(a.scenes) || 4)) });
            const p = await prompts.create(brandId, { kind: 'reels', brief: topic, plan: pl.plan });
            results.push({ type: 'create_reels', ok: true, id: p.id, title: p.title, issues: pl.issues.length });
          } else if (a.type === 'create_post' && posts) {
            let topic = String(a.topic || '');
            if (a.fromReelsId) {
              // Önce Prompt Studio'daki Reels (plan), yoksa eski Reels senaryosu
              let src = null;
              try { const p = prompts && prompts.get(brandId, String(a.fromReelsId)); if (p) src = { title: p.title, script: p.plan ? [p.plan.punchline, ...p.plan.scenes.map(x => x.line)].filter(Boolean).join(' ') : p.text }; } catch { /* Prompt Studio'da yok */ }
              if (!src && reels) src = reels.get(brandId, String(a.fromReelsId));
              if (src) topic = `${topic ? topic + '\n' : ''}Şu Reels senaryosuna dayanarak: ${src.title}. ${String(src.script || '').slice(0, 700)}`;
            }
            const kind = ['post', 'carousel', 'story', 'kapak', 'reklam', 'grafik'].includes(a.kind) ? a.kind : 'carousel';
            const p = await posts.create(brandId, { topic: topic.slice(0, 1000), kind, slides: Math.max(3, Math.min(10, Number(a.slides) || 6)) });
            results.push({ type: 'create_post', ok: true, id: p.id, title: p.title });
          } else if (a.type === 'create_image' && images) {
            const r = await images.generate(brandId, { prompt: String(a.prompt || '').slice(0, 4000), aspect: ['1:1', '4:5', '9:16', '16:9'].includes(a.aspect) ? a.aspect : '1:1', useMascot: Boolean(a.useMascot) });
            results.push({ type: 'create_image', ok: true, asset: { id: r.asset.id, url: r.asset.url }, modelLabel: r.ai.modelLabel });
          } else if (a.type === 'create_prompt' && prompts) {
            const p = await prompts.create(brandId, { kind: PROMPT_KINDS[a.kind] ? a.kind : 'gorsel', brief: String(a.brief || a.topic || '').slice(0, 2000) });
            results.push({ type: 'create_prompt', ok: true, id: p.id, title: p.title, kindLabel: p.kindLabel });
          }
        } else if (a.type === 'plan_content' && workspace && Array.isArray(a.items)) {
          const planned = [];
          for (const it of a.items.slice(0, 14)) {
            const date = /^\d{4}-\d{2}-\d{2}$/.test(String(it && it.date)) ? it.date : null;
            const time = /^\d{2}:\d{2}$/.test(String(it && it.time)) ? it.time : '10:00';
            try {
              planned.push(workspace.createContent({ brandId, title: String((it && it.title) || '').slice(0, 200), type: CONTENT_TYPES[it && it.type] ? it.type : 'post',
                scheduledAt: date ? new Date(`${date}T${time}:00`).toISOString() : null, ideaId: (it && it.ideaId) || null }));
            } catch { /* geçersiz satır atlanır */ }
          }
          if (planned.length) results.push({ type: 'plan_content', ok: true, items: planned.map(c => ({ id: c.id, title: c.title, typeLabel: c.typeLabel, scheduledAt: c.scheduledAt })) });
        } else if (a.type === 'remember' && memory && a.title && a.content) {
          const f = memory.addFact(brandId, { category: a.category, title: String(a.title).slice(0, 120), content: String(a.content).slice(0, 2000) }, 'assistant');
          results.push({ type: 'remember', ok: true, fact: { title: f.title, categoryLabel: f.categoryLabel } });
        } else if (a.type === 'forbid_words' && memory && Array.isArray(a.words) && a.words.length) {
          const m = memory.addBanned(brandId, a.words);
          results.push({ type: 'forbid_words', ok: true, words: a.words.slice(0, 20).map(String), total: m.banned.length });
        } else if (a.type === 'add_task' && workspace && a.title) {
          const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(a.dueDate)) ? a.dueDate : null;
          const t = workspace.createTask({ brandId, title: String(a.title).slice(0, 200), dueDate, priority: ['dusuk', 'orta', 'yuksek'].includes(a.priority) ? a.priority : 'orta' });
          results.push({ type: 'add_task', ok: true, task: { id: t.id, title: t.title, dueDate: t.dueDate } });
        }
      } catch (err) { fail(a.type, err); }
    }
    return results;
  }

  return {
    history,

    clear(brandId) {
      db.prepare('DELETE FROM chat_messages WHERE brand_id = ?').run(brandId);
    },

    async send(brandId, rawMessage) {
      const brand = brands.get(brandId);
      const message = text(rawMessage, { field: 'Mesaj', max: 4000, required: true });
      // Kural tabanlı yönlendirme: kayıtlardan cevaplanabilen bilgi sorusu yapay zekâya gitmez (ücretsiz ve anlık)
      const quick = quickAnswer(brand, message);
      if (quick) {
        return transaction(db, () => ({ userMessage: save(brand.id, 'user', message), assistantMessage: save(brand.id, 'assistant', `${quick}\n\n(Bu cevap kayıtlardan hazırlandı; yapay zekâ kullanılmadı.)`, []) }));
      }
      const past = history(brand.id, HISTORY_LIMIT);
      const response = await ai.generate(buildPrompt(brand, brands.memory(brand.id, { light: !wantsProduction(message) }), past, message), { json: true, temperature: 0.8, task: 'fikir', brandId: brand.id });
      const reply = typeof (response && response.reply) === 'string' && response.reply.trim()
        ? response.reply.trim()
        : 'Yanıt oluşturulamadı, mesajını biraz farklı yazıp tekrar dener misin?';
      // Kullanıcı "Durdur" dediyse yanıt geldikten sonra bile işlem uygulanmaz, mesaj kaydedilmez
      const sc = streamCtx.getStore();
      if (sc && sc.signal && sc.signal.aborted) throw cancelled();
      // İşlemler uygulanır (AI çağıranlar dahil), sonra mesaj ve sonuçları birlikte kaydedilir
      const actions = await applyActions(brand.id, response && response.actions);
      return transaction(db, () => {
        const userMessage = save(brand.id, 'user', message);
        const assistantMessage = save(brand.id, 'assistant', reply, actions);
        return { userMessage, assistantMessage };
      });
    }
  };
}
