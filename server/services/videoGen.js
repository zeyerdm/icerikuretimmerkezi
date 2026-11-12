// 8.14 Metinden video: Reels senaryosunun sahne prompt'undan (İngilizce, yazısız video prompt'u) Veo ile kısa klip.
// Üretim uzun sürer: iş kaydedilir, istemci listeyi yeniledikçe (en sık 10 sn'de bir) sağlayıcıya sorulur; bitince
// video markanın klasörüne indirilir. Video anahtarı bağlı değilse arayüz düğmeyi hiç göstermez; sahte üretim yok.
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound, newId, now } from '../lib/http.js';

const STATUS = { bekliyor: 'Üretiliyor', hazir: 'Hazır', hata: 'Hata' };

export function createVideoGenService({ db, ai, brands, reels, uploadDir, pollMs = 10000 }) {
  const file = (brandId, id) => path.join(uploadDir, brandId, 'videos', `${id}.mp4`);
  const toJob = r => ({ id: r.id, reelsId: r.reels_id, sceneIndex: r.scene_index, model: r.model, modelLabel: ai.labelOf(r.model), aspect: r.aspect, prompt: r.prompt,
    status: r.status, statusLabel: STATUS[r.status] || r.status, error: r.error, cost: r.cost_usd, createdAt: r.created_at, updatedAt: r.updated_at,
    url: r.status === 'hazir' ? `/api/brands/${r.brand_id}/video-jobs/${r.id}/file` : null });

  async function refresh(r) {
    if (r.status !== 'bekliyor') return r;
    if (r.checked_at && Date.now() - new Date(r.checked_at).getTime() < pollMs) return r;
    const t = now();
    db.prepare('UPDATE video_jobs SET checked_at = ? WHERE id = ?').run(t, r.id);
    let out;
    try { out = await ai.videoPoll({ operation: r.operation, ref: r.model, brandId: r.brand_id }); } catch (err) {
      if (err.transient) return Object.assign(r, { checked_at: t }); // geçici hata: sonra yeniden sorulur
      out = { done: true, error: err.message };
    }
    if (!out.done) return Object.assign(r, { checked_at: t });
    if (out.error) {
      db.prepare("UPDATE video_jobs SET status = 'hata', error = ?, updated_at = ? WHERE id = ?").run(String(out.error).slice(0, 400), t, r.id);
    } else {
      fs.mkdirSync(path.dirname(file(r.brand_id, r.id)), { recursive: true });
      fs.writeFileSync(file(r.brand_id, r.id), out.buffer);
      db.prepare("UPDATE video_jobs SET status = 'hazir', cost_usd = ?, updated_at = ? WHERE id = ?").run(out.cost || 0, t, r.id);
      brands.logActivity(r.brand_id, 'video.generated', 'Sahne videosu üretildi');
    }
    return db.prepare('SELECT * FROM video_jobs WHERE id = ?').get(r.id);
  }

  return {
    overview: () => ai.videoOverview(),
    async start(brandId, reelsId, { sceneIndex, model = null, aspect = '9:16', prompt = '' } = {}) {
      const b = brands.get(brandId);
      const r = reels.get(b.id, reelsId);
      const i = Number(sceneIndex);
      if (!Number.isInteger(i) || !r.data.scenes[i]) throw badRequest('Geçersiz sahne.');
      // Varsayılan: sahnenin yazısız İngilizce video prompt'u (kullanıcı düzenleyip gönderebilir)
      const p = String(prompt || '').trim() || (r.prompts[i] && r.prompts[i].cleanEn) || '';
      if (!p) throw badRequest('Sahnenin video prompt\'u boş.');
      if (p.length > 4000) throw badRequest('Prompt en çok 4.000 karakter olabilir.');
      const s = await ai.videoStart({ prompt: p, modelRef: model, aspect });
      const id = newId(); const t = now();
      db.prepare('INSERT INTO video_jobs (id, brand_id, reels_id, scene_index, model, aspect, prompt, operation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, r.id, i, s.ref, aspect, p, s.operation, t, t);
      return toJob(db.prepare('SELECT * FROM video_jobs WHERE id = ?').get(id));
    },
    async list(brandId, reelsId = null) {
      const b = brands.get(brandId);
      const rows = reelsId
        ? db.prepare('SELECT * FROM video_jobs WHERE brand_id = ? AND reels_id = ? ORDER BY created_at DESC LIMIT 40').all(b.id, String(reelsId))
        : db.prepare('SELECT * FROM video_jobs WHERE brand_id = ? ORDER BY created_at DESC LIMIT 40').all(b.id);
      const out = [];
      for (const r of rows) out.push(toJob(await refresh(r)));
      return out;
    },
    file(brandId, id) {
      const b = brands.get(brandId);
      const r = db.prepare("SELECT * FROM video_jobs WHERE id = ? AND brand_id = ? AND status = 'hazir'").get(String(id), b.id);
      if (!r || !fs.existsSync(file(b.id, r.id))) throw notFound('Video bulunamadı.');
      return file(b.id, r.id);
    },
    remove(brandId, id) {
      const b = brands.get(brandId);
      const r = db.prepare('SELECT * FROM video_jobs WHERE id = ? AND brand_id = ?').get(String(id), b.id);
      if (!r) throw notFound('Video bulunamadı.');
      db.prepare('DELETE FROM video_jobs WHERE id = ?').run(r.id);
      fs.rmSync(file(b.id, r.id), { force: true });
    }
  };
}
