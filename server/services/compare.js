// Model karşılaştırma: aynı brief'i 2-3 modele aynı anda yazdırır, sonuçları yan yana saklar.
// Karar kullanıcınındır: beğenilen sonuç "kazanan" olarak işaretlenir, istenirse o model bir işe atanır.
import { newId, now, text, badRequest, notFound, parseJson } from '../lib/http.js';
import { parseRef } from './ai/catalog.js';

export const COMPARE_KINDS = {
  serbest: { label: 'Serbest istek', build: brief => brief },
  reels: {
    label: 'Reels senaryosu',
    build: brief => `Aşağıdaki konu için 30-45 saniyelik bir Instagram Reels senaryosu yaz.
- Sahne sahne ilerle; her sahnede süre (saniye), ekranda görünen ve konuşma metni olsun.
- Konuşma metni doğal, günlük Türkçe olsun; doğal konuşma hızına uygun uzunlukta.
- İlk 2 saniyede dikkat çeken bir giriş, sonda akılda kalan bir kapanış olsun.
Konu: ${brief}`
  },
  aciklama: {
    label: 'Gönderi açıklaması',
    build: brief => `Aşağıdaki gönderi için Instagram açıklaması yaz: dikkat çeken ilk cümle, 2-4 kısa paragraf, sonda net bir çağrı ve 5-8 ilgili hashtag. Türkçe yaz.
Gönderi: ${brief}`
  },
  fikir: {
    label: 'Fikir listesi',
    build: brief => `Aşağıdaki konu için 5 farklı içerik fikri öner. Her fikirde: kısa başlık, 1-2 cümle açıklama ve uygun format (Reels, carousel, story, post). Türkçe yaz.
Konu: ${brief}`
  }
};

// 7.13: "prompt:<tür>" kaydı Prompt Studio'nun kemiği ve markanın prompt kimliğiyle yazılır; sonuçlara kalite puanı eklenir
export const PROMPT_COMPARE = 'prompt';

export function createCompareService({ db, ai, brands, prompts = null }) {
  const kindLabelOf = k => (String(k).startsWith('prompt:') && prompts && prompts.kinds[k.slice(7)] ? `Prompt · ${prompts.kinds[k.slice(7)].label}` : (COMPARE_KINDS[k] || {}).label || k);
  const toItem = r => ({ id: r.id, createdAt: r.created_at, kind: r.kind, kindLabel: kindLabelOf(r.kind), brandId: r.brand_id, brief: r.brief, results: parseJson(r.results, []), winner: r.winner || null });

  return {
    kinds: Object.assign(Object.fromEntries(Object.entries(COMPARE_KINDS).map(([k, v]) => [k, v.label])), prompts ? { [PROMPT_COMPARE]: 'Prompt (kemik + kimlik)' } : {}),

    async run({ brief, kind = 'serbest', brandId = null, models = [], promptKind = '' }) {
      const b = text(brief, { field: 'İstek', max: 3000, required: true });
      const isPrompt = kind === PROMPT_COMPARE && prompts;
      if (!isPrompt && !COMPARE_KINDS[kind]) throw badRequest('Geçersiz karşılaştırma türü.');
      if (isPrompt && !brandId) throw badRequest('Prompt karşılaştırması için marka seç (kimlik ve kemik markadan gelir).');
      const refs = [...new Set((Array.isArray(models) ? models : []).map(String))];
      if (refs.length < 2 || refs.length > 3) throw badRequest('Karşılaştırmak için 2 ya da 3 model seç.');
      if (refs.some(r => !parseRef(r))) throw badRequest('Geçersiz model seçimi.');
      const brand = brandId ? brands.get(brandId) : null;
      const composed = isPrompt ? prompts.compose(brand.id, { kind: promptKind, brief: b }) : null;
      const prompt = composed ? composed.prompt
        : (brand ? `Bu içerik şu marka için: aşağıdaki marka bilgisine ve iletişim diline uy.\n\nMARKA HAFIZASI:\n${brands.memory(brand.id)}\n\n` : '') + COMPARE_KINDS[kind].build(b);

      const settled = await Promise.allSettled(refs.map(ref => ai.runOne(ref, { task: 'karsilastirma', brandId: brand ? brand.id : null, prompt, json: Boolean(composed) })));
      const results = settled.map((s, i) => {
        if (s.status !== 'fulfilled') return { ref: refs[i], label: ai.labelOf(refs[i]), ok: false, error: s.reason && s.reason.message ? s.reason.message : 'Bilinmeyen hata' };
        const base = { ref: refs[i], label: ai.labelOf(refs[i]), ok: true, ms: s.value.ms, usage: s.value.usage, cost: s.value.cost };
        if (!composed) return Object.assign(base, { text: String(s.value.output) });
        try {
          const c = prompts.readOutput(composed.kind, s.value.output, composed.lang);
          const q = prompts.score(brand.id, composed.kind, c.text, composed.lang);
          return Object.assign(base, { text: c.text, title: c.title, quality: { score: q.score, ok: q.ok, missing: q.missing } });
        } catch (err) { return { ref: refs[i], label: ai.labelOf(refs[i]), ok: false, error: err.message }; }
      });
      if (composed) kind = `prompt:${composed.kind}`;
      // Bütçe sınırı gibi bütün modelleri etkileyen hata: kayıt açılmaz, hata olduğu gibi gösterilir
      if (settled.every(s => s.status === 'rejected') && settled[0].reason && settled[0].reason.code === 'AI_BUDGET') throw settled[0].reason;

      const row = { id: newId(), created_at: now(), kind, brand_id: brand ? brand.id : null, brief: b, results: JSON.stringify(results) };
      db.prepare('INSERT INTO ai_comparisons (id, created_at, kind, brand_id, brief, results) VALUES (?, ?, ?, ?, ?, ?)')
        .run(row.id, row.created_at, row.kind, row.brand_id, row.brief, row.results);
      return toItem(row);
    },

    list(limit = 20) {
      return db.prepare('SELECT * FROM ai_comparisons ORDER BY created_at DESC LIMIT ?').all(limit).map(toItem);
    },

    setWinner(id, ref) {
      const row = db.prepare('SELECT * FROM ai_comparisons WHERE id = ?').get(String(id));
      if (!row) throw notFound('Karşılaştırma bulunamadı.');
      const results = parseJson(row.results, []);
      if (ref && !results.some(r => r.ref === ref && r.ok)) throw badRequest('Bu model bu karşılaştırmada yok.');
      db.prepare('UPDATE ai_comparisons SET winner = ? WHERE id = ?').run(ref || '', row.id);
      return toItem(Object.assign(row, { winner: ref || '' }));
    },

    // Kazananların sayımı: hangi model kaç kez seçildi
    scoreboard() {
      return db.prepare("SELECT winner AS ref, COUNT(*) AS wins FROM ai_comparisons WHERE winner != '' GROUP BY winner ORDER BY wins DESC").all()
        .map(r => ({ ref: r.ref, label: ai.labelOf(r.ref), wins: r.wins }));
    }
  };
}
