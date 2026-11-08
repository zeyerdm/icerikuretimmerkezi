// Rakip profilleri: her rakip için ayrı kayıt; yapıştırılan örnek gönderilerden AI analizi (içerik sütunları, ton,
// paylaşım alışkanlığı, güçlü/zayıf yanlar, markamız için boşluklar ve fikir önerileri). Boşluklar marka hafızasına girer.
import { newId, now, text, notFound, badRequest, parseJson } from '../lib/http.js';
import { polish } from './reels/rules.js';

const list = (v, n, len = 200) => (Array.isArray(v) ? v : []).map(x => polish(x).slice(0, len)).filter(Boolean).slice(0, n);

export function createCompetitorService({ db, ai, brands }) {
  const toItem = r => ({ id: r.id, name: r.name, handle: r.handle, url: r.url, notes: r.notes, samples: r.samples, analysis: r.analysis ? parseJson(r.analysis, null) : null, model: r.model, modelLabel: r.model ? ai.labelOf(r.model) : '', updatedAt: r.updated_at });
  const row = (brandId, id) => {
    const r = db.prepare('SELECT * FROM competitors WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Rakip bulunamadı.');
    return r;
  };
  const fields = body => ({
    name: text(body.name, { field: 'Rakip adı', max: 80, required: true }),
    handle: text(body.handle, { field: 'Hesap', max: 80 }).replace(/^@?/, body.handle ? '@' : ''),
    url: /^https?:\/\//i.test(String(body.url || '')) ? text(body.url, { field: 'Bağlantı', max: 300 }) : '',
    notes: text(body.notes, { field: 'Notlar', max: 2000 }),
    samples: text(body.samples, { field: 'Örnek gönderiler', max: 12000 })
  });

  return {
    list: brandId => db.prepare('SELECT * FROM competitors WHERE brand_id = ? ORDER BY updated_at DESC').all(brands.get(brandId).id).map(toItem),
    create(brandId, body = {}) {
      const b = brands.get(brandId);
      const f = fields(body);
      const id = newId(); const t = now();
      db.prepare('INSERT INTO competitors (id, brand_id, name, handle, url, notes, samples, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, b.id, f.name, f.handle, f.url, f.notes, f.samples, t, t);
      return toItem(row(b.id, id));
    },
    update(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const f = fields(Object.assign({ name: r.name, handle: r.handle, url: r.url, notes: r.notes, samples: r.samples }, body));
      db.prepare('UPDATE competitors SET name = ?, handle = ?, url = ?, notes = ?, samples = ?, updated_at = ? WHERE id = ?').run(f.name, f.handle, f.url, f.notes, f.samples, now(), r.id);
      return toItem(row(b.id, r.id));
    },
    remove(brandId, id) { db.prepare('DELETE FROM competitors WHERE id = ?').run(row(brands.get(brandId).id, id).id); },
    async analyze(brandId, id, { modelRef = null } = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      if (String(r.samples || '').trim().length < 60) throw badRequest('Analiz için rakibin birkaç gönderi açıklamasını ya da Reels metnini "Örnek gönderiler" alanına yapıştır.');
      const prompt = [
        'RAKİP ANALİZİ', `Sen '${b.name}' markasının sosyal medya stratejistisin. Aşağıda rakip "${r.name}"${r.handle ? ` (${r.handle})` : ''} hakkında örnek gönderiler ve notlar var.`,
        '', 'BİZİM MARKA:', brands.memory(b.id), '',
        r.notes ? `NOTLAR: ${r.notes}` : '', `ÖRNEK GÖNDERİLER / METİNLER:\n"""\n${r.samples}\n"""`, '',
        'Yalnızca verilen örneklerden çıkarım yap; emin olmadığını belirt, uydurma. Rakibin metinlerini kopyalayan öneri verme. Türkçe yaz.',
        'Sadece şu JSON biçiminde yanıt ver:',
        JSON.stringify({ summary: '2-3 cümle genel değerlendirme', pillars: ['İçerik sütunu'], tone: 'Ton ve hitap', formats: ['Reels', 'carousel'], hooks: ['Kullandığı giriş/kalıp tipleri'], strengths: ['Güçlü yan'], weaknesses: ['Zayıf yan'], gaps: ['Bizim değerlendirebileceğimiz boşluk'], ideas: ['Bu boşluğa yönelik bizim markaya özgü içerik fikri'] })
      ].filter(Boolean).join('\n');
      const out = await ai.run({ task: 'fikir', brandId: b.id, prompt, json: true, modelRef, temperature: 0.5 });
      const o = out.output || {};
      const analysis = { summary: polish(o.summary).slice(0, 600), pillars: list(o.pillars, 8), tone: polish(o.tone).slice(0, 300), formats: list(o.formats, 6, 60), hooks: list(o.hooks, 6),
        strengths: list(o.strengths, 6), weaknesses: list(o.weaknesses, 6), gaps: list(o.gaps, 6), ideas: list(o.ideas, 6, 300), at: now() };
      db.prepare('UPDATE competitors SET analysis = ?, model = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(analysis), out.servedRef || out.ref, now(), r.id);
      brands.logActivity(b.id, 'competitor.analyzed', `Rakip analizi: ${r.name}`);
      return Object.assign(toItem(row(b.id, r.id)), { ai: { model: out.servedRef || out.ref, modelLabel: ai.labelOf(out.servedRef || out.ref), cost: out.cost, ms: out.ms, fallbackUsed: Boolean(out.fallbackUsed) } });
    }
  };
}
