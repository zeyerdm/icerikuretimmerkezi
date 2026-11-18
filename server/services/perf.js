// Aylık performans: kullanıcı ayın en çok tutan içeriklerini (izlenme, beğeni, yorum, kaydetme, paylaşım, takipçi)
// ve isterse ekran görüntülerini girer. Yapay zekâ bunları marka hafızası ve fikir havuzuyla birlikte okuyup sonraki
// ay için öneri verir: odaklanılacak konular, fikir havuzuna eklenecek / revize edilecek / arşivlenecek fikirler,
// tasarım ve format önerileri. Öneriler kullanıcı onaylamadan uygulanmaz. "Sonraki ay bunlara odaklan" açık olan son
// analiz marka hafızasına girer; böylece fikir, post ve prompt üretimleri bu odakları dikkate alır.
import fs from 'node:fs';
import { badRequest, notFound, newId, now, text, parseJson, HttpError } from '../lib/http.js';
import { IDEA_CATEGORIES, IDEA_FORMATS } from './ideas.js';

export const PERF_KINDS = { reels: 'Reels', post: 'Post', carousel: 'Carousel', story: 'Hikâye', youtube: 'YouTube', diger: 'Diğer' };
export const PERF_METRICS = { views: 'İzlenme', reach: 'Erişim', likes: 'Beğeni', comments: 'Yorum', saves: 'Kaydetme', shares: 'Paylaşım', follows: 'Yeni takipçi' };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_ENTRIES = 30;
const MAX_IMAGES = 6;

const cleanMetrics = m => Object.fromEntries(Object.keys(PERF_METRICS).map(k => [k, Math.round(Number(m && m[k]))]).filter(([, v]) => Number.isFinite(v) && v >= 0 && v < 1e10));
// Etkileşim oranı: (beğeni + yorum + kaydetme + paylaşım) / (erişim, yoksa izlenme)
export const perfRate = m => { const base = m.reach || m.views; if (!base) return null; return Math.round(((m.likes || 0) + (m.comments || 0) + (m.saves || 0) + (m.shares || 0)) / base * 1000) / 10; };
const list = (v, n, max) => (Array.isArray(v) ? v : []).map(x => String(x || '').trim().slice(0, max)).filter(Boolean).slice(0, n);

export function createPerfService({ db, ai, brands, assets }) {
  const month = m => { const v = String(m || ''); if (!MONTH.test(v)) throw badRequest('Ay YYYY-AA biçiminde olmalı.'); return v; };
  const toEntry = r => { const metrics = parseJson(r.metrics, {}); const ids = parseJson(r.asset_ids, []);
    return { id: r.id, month: r.month, title: r.title, kind: r.kind, kindLabel: PERF_KINDS[r.kind] || r.kind, metrics, rate: perfRate(metrics), url: r.url, note: r.note,
      assets: ids.map(id => ({ id, url: `/api/brands/${r.brand_id}/assets/${id}/file` })), createdAt: r.created_at }; };
  const entries = (brandId, m) => db.prepare('SELECT * FROM perf_entries WHERE brand_id = ? AND month = ? ORDER BY created_at, rowid').all(brandId, m).map(toEntry);
  const cleanAssets = (brandId, ids) => [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 4).filter(id => {
    if (!db.prepare('SELECT 1 FROM assets WHERE id = ? AND brand_id = ?').get(id, brandId)) throw badRequest('Ekran görüntüsü bu markanın kütüphanesinde olmalı.');
    return true;
  });
  const fields = (brandId, body) => ({
    title: text(body.title, { field: 'İçerik adı', max: 200 }),
    kind: Object.keys(PERF_KINDS).includes(body.kind) ? body.kind : 'post',
    metrics: JSON.stringify(cleanMetrics(body.metrics)),
    url: (() => { const u = text(body.url, { field: 'Bağlantı', max: 400 }); if (u && !/^https?:\/\//i.test(u)) throw badRequest('Bağlantı http(s):// ile başlamalı.'); return u; })(),
    note: text(body.note, { field: 'Not', max: 1000 }),
    asset_ids: JSON.stringify(cleanAssets(brandId, body.assetIds))
  });
  const reportOf = (brandId, m) => { const r = db.prepare('SELECT * FROM perf_reports WHERE brand_id = ? AND month = ?').get(brandId, m);
    return r ? { month: r.month, ...parseJson(r.data, {}), model: r.model, active: !!r.active, applied: parseJson(r.applied, {}), createdAt: r.created_at } : null; };

  return {
    kinds: PERF_KINDS, metrics: PERF_METRICS,
    get(brandId, m) { const b = brands.get(brandId); m = month(m); return { entries: entries(b.id, m), report: reportOf(b.id, m) }; },
    addEntry(brandId, m, body = {}) {
      const b = brands.get(brandId); m = month(m);
      if (db.prepare('SELECT COUNT(*) AS n FROM perf_entries WHERE brand_id = ? AND month = ?').get(b.id, m).n >= MAX_ENTRIES) throw badRequest(`Bir ay için en fazla ${MAX_ENTRIES} içerik girilebilir.`);
      const f = fields(b.id, body); const id = newId();
      if (!f.title && !JSON.parse(f.asset_ids).length) throw badRequest('İçerik adı ya da ekran görüntüsü gerekli.');
      if (!f.title) f.title = 'Ekran görüntüsünden';
      db.prepare('INSERT INTO perf_entries (id, brand_id, month, title, kind, metrics, url, note, asset_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, b.id, m, f.title, f.kind, f.metrics, f.url, f.note, f.asset_ids, now());
      return toEntry(db.prepare('SELECT * FROM perf_entries WHERE id = ?').get(id));
    },
    updateEntry(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const r = db.prepare('SELECT * FROM perf_entries WHERE id = ? AND brand_id = ?').get(String(id), b.id);
      if (!r) throw notFound('Kayıt bulunamadı.');
      const f = fields(b.id, { title: r.title, kind: r.kind, metrics: parseJson(r.metrics, {}), url: r.url, note: r.note, assetIds: parseJson(r.asset_ids, []), ...body });
      db.prepare('UPDATE perf_entries SET title = ?, kind = ?, metrics = ?, url = ?, note = ?, asset_ids = ? WHERE id = ?').run(f.title || r.title, f.kind, f.metrics, f.url, f.note, f.asset_ids, r.id);
      return toEntry(db.prepare('SELECT * FROM perf_entries WHERE id = ?').get(r.id));
    },
    removeEntry(brandId, id) {
      const b = brands.get(brandId);
      if (!db.prepare('DELETE FROM perf_entries WHERE id = ? AND brand_id = ?').run(String(id), b.id).changes) throw notFound('Kayıt bulunamadı.');
      return { ok: true };
    },

    async analyze(brandId, m, { modelRef = null } = {}) {
      const b = brands.get(brandId); m = month(m);
      const list0 = entries(b.id, m);
      if (!list0.length) throw badRequest('Önce bu ayın en çok tutan içeriklerinden en az birini gir.');
      const [y, mo] = m.split('-').map(Number);
      const from = new Date(Date.UTC(y, mo - 1, 1)).toISOString(); const to = new Date(Date.UTC(y, mo, 1)).toISOString();
      const planned = db.prepare('SELECT title, type, status FROM contents WHERE brand_id = ? AND scheduled_at >= ? AND scheduled_at < ? ORDER BY scheduled_at LIMIT 80').all(b.id, from, to);
      const pool = db.prepare("SELECT id, title, description, category, format FROM ideas WHERE brand_id = ? AND archived = 0 AND (used_at IS NULL OR used_at = '') ORDER BY created_at DESC LIMIT 60").all(b.id);
      const images = list0.flatMap(e => e.assets.map(a => a.id)).slice(0, MAX_IMAGES).map(id => {
        const f = assets.visionFile(b.id, id);
        return /^image\/(png|jpeg|webp|gif)$/.test(f.mime) ? { mime: f.mime, data: fs.readFileSync(f.path) } : null;
      }).filter(Boolean);
      const metricLine = e => Object.entries(e.metrics).map(([k, v]) => `${PERF_METRICS[k]} ${v}`).join(', ');
      const prompt = [
        `AYLIK PERFORMANS ANALİZİ: "${b.name}" markasının ${m} ayı.`,
        'Marka bilgisi:', String(brands.memory(b.id) || '').slice(0, 4000),
        'Bu ay EN ÇOK TUTAN içerikler (kullanıcının girdiği):',
        list0.map((e, i) => `${i + 1}. ${e.title} [${e.kindLabel}]${metricLine(e) ? ` · ${metricLine(e)}` : ''}${e.rate != null ? ` · etkileşim %${e.rate}` : ''}${e.note ? ` · not: ${e.note}` : ''}${e.assets.length ? ` · ${e.assets.length} ekran görüntüsü` : ''}`).join('\n'),
        images.length ? `Ekte ${images.length} ekran görüntüsü var (istatistik ekranları ya da gönderiler). Görüntüdeki sayıları ve gönderinin konusunu/tasarımını da dikkate al; görüntüde olmayan sayı uydurma.` : '',
        planned.length ? `Bu ay takvimdeki diğer içerikler:\n${planned.map(p => `- ${p.title} (${p.type})`).join('\n')}` : '',
        pool.length ? `Fikir havuzundaki kullanılmamış fikirler (id ile):\n${pool.map(p => `- [${p.id}] ${p.title} (${IDEA_FORMATS[p.format] || p.format}, ${IDEA_CATEGORIES[p.category] || p.category})`).join('\n')}` : 'Fikir havuzu boş.',
        'Görev: Neyin neden tuttuğunu çıkar ve SONRAKİ AY için somut öneri ver. Abartma, veride olmayanı iddia etme; az veri varsa bunu söyle.',
        `Fikir kategorileri: ${Object.keys(IDEA_CATEGORIES).join(', ')}. Fikir türleri: ${Object.keys(IDEA_FORMATS).join(', ')}.`,
        'Yanıt yalnızca JSON, Türkçe:',
        '{"summary":"2-3 cümle","worked":["neden tuttu"],"weak":["zayıf kalan / eksik"],"focus":["sonraki ay odak (en fazla 5, kısa ve uygulanabilir)"],"design":["tasarım önerisi"],"formats":["format / yayın sıklığı / saat önerisi"],"ideas":{"add":[{"title":"","description":"","format":"reels","category":"egitici","why":""}],"revise":[{"id":"havuzdaki id","title":"yeni başlık","description":"","why":""}],"archive":[{"id":"havuzdaki id","why":""}]}}'
      ].filter(Boolean).join('\n\n');
      const r = await ai.run({ task: 'yazim', brandId: b.id, prompt, json: true, modelRef: modelRef || null, temperature: 0.4, ...(images.length ? { images } : {}) });
      const o = r.output || {};
      const ids = new Set(pool.map(p => p.id));
      const ideasOut = o.ideas || {};
      const data = {
        summary: String(o.summary || '').trim().slice(0, 800),
        worked: list(o.worked, 6, 300), weak: list(o.weak, 6, 300), focus: list(o.focus, 5, 200), design: list(o.design, 6, 300), formats: list(o.formats, 5, 300),
        ideas: {
          add: (Array.isArray(ideasOut.add) ? ideasOut.add : []).map(x => ({ title: String(x && x.title || '').trim().slice(0, 200), description: String(x && x.description || '').trim().slice(0, 1000),
            format: IDEA_FORMATS[x && x.format] ? x.format : 'genel', category: IDEA_CATEGORIES[x && x.category] ? x.category : 'guncel', why: String(x && x.why || '').trim().slice(0, 300) })).filter(x => x.title).slice(0, 10),
          revise: (Array.isArray(ideasOut.revise) ? ideasOut.revise : []).filter(x => x && ids.has(String(x.id)) && String(x.title || '').trim())
            .map(x => ({ id: String(x.id), before: pool.find(p => p.id === String(x.id)).title, title: String(x.title).trim().slice(0, 200), description: String(x.description || '').trim().slice(0, 1000), why: String(x.why || '').trim().slice(0, 300) })).slice(0, 10),
          archive: (Array.isArray(ideasOut.archive) ? ideasOut.archive : []).filter(x => x && ids.has(String(x.id)))
            .map(x => ({ id: String(x.id), title: pool.find(p => p.id === String(x.id)).title, why: String(x.why || '').trim().slice(0, 300) })).slice(0, 15)
        }
      };
      if (!data.summary && !data.focus.length) throw new HttpError(502, 'AI_BAD_REPORT', 'Model kullanılabilir bir analiz döndürmedi. Tekrar dene ya da başka bir model seç.');
      db.prepare('INSERT INTO perf_reports (brand_id, month, data, model, active, applied, created_at) VALUES (?, ?, ?, ?, 1, \'{}\', ?) ON CONFLICT(brand_id, month) DO UPDATE SET data = excluded.data, model = excluded.model, active = 1, applied = \'{}\', created_at = excluded.created_at')
        .run(b.id, m, JSON.stringify(data), r.servedRef || r.ref || '', now());
      brands.logActivity(b.id, 'perf.analyzed', `${m} performans analizi hazırlandı`);
      return reportOf(b.id, m);
    },

    // Onaylanan önerileri uygular: seçilen fikirler eklenir, revize edilir, arşivlenir (her biri bir kez)
    apply(brandId, m, { add = [], revise = [], archive = [] } = {}, ideas) {
      const b = brands.get(brandId); m = month(m);
      const rep = reportOf(b.id, m);
      if (!rep) throw notFound('Bu ay için analiz yok.');
      const applied = rep.applied || {}; const done = { add: [], revise: [], archive: [] };
      for (const i of [...new Set(add.map(Number))]) { const x = rep.ideas.add[i]; const k = `add:${i}`; if (!x || applied[k]) continue; ideas.create(b.id, { title: x.title, description: x.description, format: x.format, category: x.category }, 'ai'); applied[k] = 1; done.add.push(x.title); }
      for (const id of [...new Set(revise.map(String))]) { const x = rep.ideas.revise.find(v => v.id === id); const k = `revise:${id}`; if (!x || applied[k]) continue; try { ideas.update(b.id, id, { title: x.title, ...(x.description ? { description: x.description } : {}) }); applied[k] = 1; done.revise.push(x.title); } catch { /* fikir silinmiş */ } }
      for (const id of [...new Set(archive.map(String))]) { const x = rep.ideas.archive.find(v => v.id === id); const k = `archive:${id}`; if (!x || applied[k]) continue; try { ideas.update(b.id, id, { archived: true }); applied[k] = 1; done.archive.push(x.title); } catch { /* fikir silinmiş */ } }
      db.prepare('UPDATE perf_reports SET applied = ? WHERE brand_id = ? AND month = ?').run(JSON.stringify(applied), b.id, m);
      return { done, report: reportOf(b.id, m) };
    },
    setActive(brandId, m, active) {
      const b = brands.get(brandId); m = month(m);
      if (active) db.prepare('UPDATE perf_reports SET active = 0 WHERE brand_id = ?').run(b.id);
      if (!db.prepare('UPDATE perf_reports SET active = ? WHERE brand_id = ? AND month = ?').run(active ? 1 : 0, b.id, m).changes) throw notFound('Bu ay için analiz yok.');
      return reportOf(b.id, m);
    }
  };
}

// Marka hafızası için: odak açık olan son analiz (üretimlerde dikkate alınır)
export function perfFocusText(db, brandId) {
  const r = db.prepare('SELECT month, data FROM perf_reports WHERE brand_id = ? AND active = 1 ORDER BY month DESC LIMIT 1').get(brandId);
  if (!r) return '';
  const d = parseJson(r.data, {});
  const parts = [(d.focus || []).length ? `Odak: ${d.focus.join('; ')}` : '', (d.worked || []).length ? `Tutanlar: ${d.worked.slice(0, 3).join('; ')}` : '', (d.design || []).length ? `Tasarım: ${d.design.slice(0, 3).join('; ')}` : ''].filter(Boolean);
  return parts.length ? `${r.month} performans analizine göre bu dönem önceliği (fikir, metin ve tasarımda dikkate al):\n${parts.map(p => `- ${p}`).join('\n')}` : '';
}
