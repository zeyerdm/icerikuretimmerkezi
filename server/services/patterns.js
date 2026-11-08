// Kalıp arşivi: beğenilen, rakip ya da markanın kendi Reels metinlerinden giriş cümlesi tipi, tema, akış, CTA ve
// neden işe yaradığını çıkarır; markanın arşivine kaydeder. Senaryo yazarken seçilen kalıp (ya da favoriler) isteme girer.
// Kalıbın yapısı alınır; metin, espri ve marka adları kopyalanmaz.
import { newId, now, text, notFound, oneOf, parseJson } from '../lib/http.js';
import { polish } from './reels/rules.js';

export const PATTERN_SOURCES = { begendigim: 'Beğendiğim', rakip: 'Rakip', kendi: 'Kendi videom' };
export const HOOK_TYPES = { soru: 'Soru', iddia: 'Şaşırtıcı iddia', itiraf: 'İtiraf / kişisel', sahne: 'Sahne içinden başlama', liste: 'Liste / sayı', karsilastirma: 'Karşılaştırma', meydan: 'Meydan okuma', diger: 'Diğer' };

export function createPatternService({ db, ai, brands }) {
  const toPattern = r => {
    const d = parseJson(r.data, {});
    return Object.assign({ id: r.id, sourceType: r.source_type, sourceLabel: PATTERN_SOURCES[r.source_type] || r.source_type, sourceNote: r.source_note, title: r.title, favorite: Boolean(r.favorite),
      rawText: r.raw_text, model: r.model, createdAt: r.created_at }, d, { hookTypeLabel: HOOK_TYPES[d.hookType] || d.hookType || '' });
  };
  const row = (brandId, id) => {
    const r = db.prepare('SELECT * FROM patterns WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Kalıp bulunamadı.');
    return r;
  };
  const line = p => `"${p.title}" · giriş (${p.hookTypeLabel}): ${p.hook} · tema: ${p.theme} · akış: ${(p.structure || []).join(' → ')} · kapanış/CTA: ${p.cta || '-'} · neden işe yarıyor: ${p.why}`;

  const service = {
    sources: PATTERN_SOURCES,
    hookTypes: HOOK_TYPES,
    list: brandId => db.prepare('SELECT * FROM patterns WHERE brand_id = ? ORDER BY favorite DESC, created_at DESC').all(brands.get(brandId).id).map(toPattern),
    async analyze(brandId, { text: raw, sourceType = 'begendigim', sourceNote = '', modelRef = null } = {}) {
      const b = brands.get(brandId);
      const src = text(raw, { field: 'Metin', max: 8000, required: true });
      oneOf(sourceType, Object.keys(PATTERN_SOURCES), 'Kaynak');
      const prompt = [
        'REELS KALIBI ÇIKARMA',
        `Aşağıdaki metin bir Instagram Reels videosunun konuşma metni / altyazısı / açıklaması (${PATTERN_SOURCES[sourceType].toLocaleLowerCase('tr-TR')}). '${b.name}' markasının kalıp arşivi için bu videonun YAPISINI çıkar.`,
        'Metni, esprileri, marka ve kişi adlarını kopyalama; yalnızca başka konulara uygulanabilir kalıbı tarif et. Türkçe yaz.',
        `hookType şunlardan biri: ${Object.entries(HOOK_TYPES).map(([k, v]) => `${k} (${v})`).join(', ')}.`,
        '"hook": giriş cümlesinin ne yaptığını genel bir kalıp olarak yaz (ör. "Herkesin yaşadığı küçük bir aksilikle başlayıp \'bunu bilen var mı?\' diye sormak"). "structure": 3-6 adımlık akış. "cta": kapanış veya eylem çağrısı (yoksa boş). "why": neden işe yaradığı (1-2 cümle). "reuse": bu kalıbı markaya uyarlamak için 1 cümlelik öneri.',
        '', `METİN:\n"""\n${src}\n"""`, '',
        'Sadece şu JSON biçiminde yanıt ver:',
        JSON.stringify({ title: 'Kalıbın kısa adı', hookType: 'soru', hook: '...', theme: '...', structure: ['Adım 1', 'Adım 2'], cta: '...', why: '...', reuse: '...', format: 'skeç | vlog | bilgi | hikâye | tanıtım', duration: 'ör. 20-30 sn' })
      ].join('\n');
      const r = await ai.run({ task: 'fikir', brandId: b.id, prompt, json: true, modelRef, temperature: 0.4 });
      const o = r.output || {};
      const data = {
        hookType: HOOK_TYPES[o.hookType] ? o.hookType : 'diger',
        hook: polish(o.hook).slice(0, 400), theme: polish(o.theme).slice(0, 200),
        structure: (Array.isArray(o.structure) ? o.structure : []).map(x => polish(x).slice(0, 200)).filter(Boolean).slice(0, 8),
        cta: polish(o.cta).slice(0, 200), why: polish(o.why).slice(0, 500), reuse: polish(o.reuse).slice(0, 300),
        format: polish(o.format).slice(0, 40), duration: polish(o.duration).slice(0, 40)
      };
      const id = newId();
      const title = polish(o.title).slice(0, 80) || data.theme.slice(0, 80) || 'Kalıp';
      db.prepare('INSERT INTO patterns (id, brand_id, source_type, source_note, raw_text, title, data, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, sourceType, text(sourceNote, { field: 'Kaynak notu', max: 200 }), src, title, JSON.stringify(data), r.servedRef || r.ref, now());
      brands.logActivity(b.id, 'pattern.added', `Kalıp arşivine eklendi: ${title}`);
      return Object.assign(toPattern(row(b.id, id)), { ai: { model: r.servedRef || r.ref, modelLabel: ai.labelOf(r.servedRef || r.ref), cost: r.cost, ms: r.ms, fallbackUsed: Boolean(r.fallbackUsed) } });
    },
    update(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const d = parseJson(r.data, {});
      for (const k of ['hook', 'theme', 'cta', 'why', 'reuse']) if (k in body) d[k] = polish(body[k]).slice(0, 500);
      if ('structure' in body) d.structure = (Array.isArray(body.structure) ? body.structure : String(body.structure || '').split('\n')).map(x => polish(x).slice(0, 200)).filter(Boolean).slice(0, 8);
      const title = 'title' in body ? (text(body.title, { field: 'Ad', max: 80 }) || r.title) : r.title;
      const fav = 'favorite' in body ? (body.favorite ? 1 : 0) : r.favorite;
      db.prepare('UPDATE patterns SET title = ?, data = ?, favorite = ? WHERE id = ?').run(title, JSON.stringify(d), fav, r.id);
      return toPattern(row(b.id, r.id));
    },
    remove(brandId, id) { db.prepare('DELETE FROM patterns WHERE id = ?').run(row(brands.get(brandId).id, id).id); },
    // Senaryo istemi için: seçilen kalıp "izlenecek", değilse favoriler "örnek"
    promptBlock(brandId, patternId = null) {
      const b = brands.get(brandId);
      if (patternId) {
        const p = toPattern(row(b.id, patternId));
        return `İZLENECEK KALIP (arşivden seçildi; yapısını uygula, metnini/esprisini kopyalama):\n${line(p)}${p.reuse ? `\nUyarlama önerisi: ${p.reuse}` : ''}`;
      }
      const favs = db.prepare('SELECT * FROM patterns WHERE brand_id = ? AND favorite = 1 ORDER BY created_at DESC LIMIT 3').all(b.id).map(toPattern);
      return favs.length ? `KALIP ARŞİVİNDEKİ FAVORİLER (konuya uyan varsa yapısından yararlan; kopyalama):\n${favs.map(p => '- ' + line(p)).join('\n')}` : '';
    }
  };
  return service;
}
