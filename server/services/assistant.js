// AI asistanı: seçili markanın hafızasıyla konuşur ve desteklenen işlemleri gerçekten uygular.
// Yanıt biçimi: { reply, actions: [...] }. Bilinmeyen veya geçersiz işlemler uygulanmaz, sessizce de yutulmaz.
import { newId, now, text, parseJson } from '../lib/http.js';
import { transaction } from '../db.js';
import { IDEA_CATEGORIES } from './ideas.js';

const HISTORY_LIMIT = 12;
const MAX_IDEAS_PER_ACTION = 12;

export function createAssistantService({ db, ai, brands, ideas }) {
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
      past.length ? 'SON KONUŞMA:\n' + past.map(m => `${m.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${m.content}`).join('\n') : '',
      '',
      'YAPABİLECEĞİN İŞLEMLER:',
      `- save_ideas: Kullanıcı içerik fikri isterse fikirleri üret ve bu işlemle markanın fikir havuzuna kaydet. Her fikirde title (kısa, somut başlık), description (1-2 cümle: ne anlatılacak, neden işe yarar) ve category olsun. Kategoriler: ${categories}. Tek seferde en fazla ${MAX_IDEAS_PER_ACTION} fikir.`,
      'Şu an bunların dışında işlem yapamıyorsun. Reels senaryosu, prompt üretimi veya post tasarımı istenirse bunun bu sürümde henüz olmadığını dürüstçe söyle ve yapabileceğin işi öner. Yapmadığın bir işlemi yapmış gibi anlatma.',
      'Kullanıcı yalnızca sohbet ediyor, soru soruyor veya fikir istemiyorsa actions boş liste olsun.',
      '',
      `KULLANICININ MESAJI: ${message}`,
      '',
      'Sadece şu JSON biçiminde yanıt ver:',
      '{"reply": "Kullanıcıya Türkçe, samimi ve net yanıt (fikir kaydettiysen kısaca özetle)", "actions": [{"type": "save_ideas", "ideas": [{"title": "...", "description": "...", "category": "egitici"}]}]}'
    ].filter(s => s !== null).join('\n');
  }

  // Modelin önerdiği işlemleri doğrular ve uygular; uygulanan sonuçları döndürür
  function applyActions(brandId, rawActions) {
    const results = [];
    const list = Array.isArray(rawActions) ? rawActions : [];
    for (const action of list) {
      if (!action || action.type !== 'save_ideas' || !Array.isArray(action.ideas)) continue;
      const saved = [];
      const skipped = [];
      for (const item of action.ideas.slice(0, MAX_IDEAS_PER_ACTION)) {
        const category = item && Object.prototype.hasOwnProperty.call(IDEA_CATEGORIES, item.category) ? item.category : 'bilgilendirici';
        try {
          saved.push(ideas.create(brandId, { title: String(item.title || ''), description: String(item.description || ''), category }, 'assistant'));
        } catch {
          skipped.push(item && item.title);
        }
      }
      if (saved.length) {
        brands.logActivity(brandId, 'ideas.generated', `AI asistanı ${saved.length} içerik fikri kaydetti`);
        results.push({ type: 'save_ideas', ideas: saved, skipped: skipped.length });
      }
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
      const past = history(brand.id, HISTORY_LIMIT);
      const response = await ai.generate(buildPrompt(brand, brands.memory(brand.id), past, message), { json: true, temperature: 0.8, task: 'fikir', brandId: brand.id });
      const reply = typeof (response && response.reply) === 'string' && response.reply.trim()
        ? response.reply.trim()
        : 'Yanıt oluşturulamadı, mesajını biraz farklı yazıp tekrar dener misin?';
      // Kullanıcı mesajı, yanıt ve uygulanan işlemler birlikte kaydedilir
      return transaction(db, () => {
        const userMessage = save(brand.id, 'user', message);
        const actions = applyActions(brand.id, response && response.actions);
        const assistantMessage = save(brand.id, 'assistant', reply, actions);
        return { userMessage, assistantMessage };
      });
    }
  };
}
