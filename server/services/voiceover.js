// 8.13 Seslendirme (TTS): Reels senaryosundaki replikler markanın seçtiği hazır sesle (Gemini TTS) sahne sahne
// seslendirilir. Her sahnenin sesi ayrı WAV olur; ayrıca sahneler altyazıyla aynı zamanlamada tek iz (full.wav) hâline
// getirilir. Video sayfası bu izi klip sesiyle birlikte kayda ekleyebilir. Gemini bağlı değilse açık hata verir.
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound, now, parseJson, text as cleanText } from '../lib/http.js';

// 16 bit tek kanal PCM → WAV
export function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
// Parçaları zaman çizelgesine yerleştirir: [{ at (sn), pcm }] → tek PCM; çakışmada sonraki parça bir öncekinin bitişinden başlar
export function assemble(parts, rate = 24000) {
  let cursor = 0;
  const placed = parts.map(p => { const start = Math.max(Math.round(p.at * rate) * 2, cursor); cursor = start + p.pcm.length; return { start, pcm: p.pcm }; });
  const out = Buffer.alloc(cursor);
  placed.forEach(p => p.pcm.copy(out, p.start));
  return out;
}

export function createVoiceoverService({ db, ai, brands, uploadDir }) {
  const dir = (brandId, reelsId) => path.join(uploadDir, brandId, 'voice', reelsId);
  const rowOf = (brandId, id) => {
    const r = db.prepare('SELECT id, brand_id, data, voiceover FROM reels WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Senaryo bulunamadı.');
    return r;
  };
  const info = (b, r) => {
    const v = parseJson(r.voiceover, null);
    if (!v) return null;
    const base = `/api/brands/${b.id}/reels/${r.id}/voice`;
    return Object.assign({}, v, { url: `${base}/full.wav?v=${encodeURIComponent(v.at)}`, scenes: v.scenes.map(s => Object.assign({}, s, { url: `${base}/${s.i}.wav?v=${encodeURIComponent(v.at)}` })) });
  };
  return {
    overview: () => ai.speechOverview(),
    get(brandId, reelsId) { const b = brands.get(brandId); return info(b, rowOf(b.id, reelsId)); },
    // Bütün replikler (ya da tek sahne) seslendirilir; tek sahne yeniden üretilince iz yeniden kurulur
    async generate(brandId, reelsId, { voice = 'Kore', style = '', model = null, sceneIndex = null } = {}) {
      const b = brands.get(brandId);
      const r = rowOf(b.id, reelsId);
      const scenes = (parseJson(r.data, {}).scenes || []);
      const st = cleanText(style, { field: 'Konuşma tarzı', max: 120 }) || '';
      const lines = scenes.map((s, i) => ({ i, line: String(s.line || '').trim(), from: s.lineFrom || 0, duration: s.duration || 0 }));
      if (!lines.some(l => l.line)) throw badRequest('Senaryoda seslendirilecek replik yok.');
      const prev = parseJson(r.voiceover, null);
      const only = sceneIndex == null ? null : Number(sceneIndex);
      if (only != null && (!Number.isInteger(only) || !lines[only] || !lines[only].line)) throw badRequest('Bu sahnede replik yok.');
      fs.mkdirSync(dir(b.id, r.id), { recursive: true });
      let cost = 0; let label = ''; let rate = (prev && prev.rate) || 24000;
      const sceneInfo = (prev && only != null ? prev.scenes : []).slice();
      for (const l of lines.filter(x => x.line && (only == null || x.i === only))) {
        const out = await ai.speech({ brandId: b.id, text: `Read aloud in natural Turkish${st ? `, ${st}` : ''}:\n${l.line}`, voice, modelRef: model });
        rate = out.rate; cost += out.cost; label = out.label;
        fs.writeFileSync(path.join(dir(b.id, r.id), `${l.i}.pcm`), out.pcm);
        fs.writeFileSync(path.join(dir(b.id, r.id), `${l.i}.wav`), wav(out.pcm, out.rate));
        const k = sceneInfo.findIndex(s => s.i === l.i);
        const item = { i: l.i, seconds: Math.round(out.pcm.length / 2 / out.rate * 10) / 10, line: l.line };
        if (k >= 0) sceneInfo[k] = item; else sceneInfo.push(item);
      }
      sceneInfo.sort((a, z) => a.i - z.i);
      // Tek iz: sahne başlangıcı + replik başlangıcı (altyazıyla aynı zamanlama)
      let offset = 0;
      const starts = lines.map(l => { const at = offset + l.from; offset += l.duration; return at; });
      const parts = sceneInfo.filter(s => fs.existsSync(path.join(dir(b.id, r.id), `${s.i}.pcm`))).map(s => ({ at: starts[s.i] || 0, pcm: fs.readFileSync(path.join(dir(b.id, r.id), `${s.i}.pcm`)) }));
      const full = assemble(parts, rate);
      fs.writeFileSync(path.join(dir(b.id, r.id), 'full.wav'), wav(full, rate));
      const v = { voice, style: st, model: model || ai.speechOverview().default, rate, at: now(), seconds: Math.round(full.length / 2 / rate * 10) / 10, scenes: sceneInfo };
      db.prepare('UPDATE reels SET voiceover = ? WHERE id = ?').run(JSON.stringify(v), r.id);
      brands.logActivity(b.id, 'reels.voice', `Senaryo seslendirildi (${label})`);
      return Object.assign({ voiceover: info(b, Object.assign(r, { voiceover: JSON.stringify(v) })) }, { ai: { modelLabel: label, cost } });
    },
    file(brandId, reelsId, name) {
      const b = brands.get(brandId);
      const r = rowOf(b.id, reelsId);
      if (!/^(full|\d{1,2})\.wav$/.test(name)) throw notFound('Ses dosyası bulunamadı.');
      const p = path.join(dir(b.id, r.id), name);
      if (!fs.existsSync(p)) throw notFound('Ses dosyası bulunamadı.');
      return p;
    }
  };
}
