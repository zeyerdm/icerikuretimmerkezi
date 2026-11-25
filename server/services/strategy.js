// Ölçülebilir hedefler ve içerik sütunları (O3, göç 51). Yapay zekâ kullanılmaz: her şey kayıtlardan hesaplanır.
//  - Hedef: marka + ay + tür (erişim, takipçi, etkileşim, satış, web trafiği, bilinirlik), hedef değer.
//    Erişim, takipçi ve etkileşim o ay takvimdeki içeriklere girilen paylaşım sonuçlarından kendiliğinden hesaplanır;
//    satış, trafik ve bilinirlik sistemin göremediği sayılardır, gerçekleşen değeri kullanıcı girer.
//  - Sütun: içerik başlığı ve hedef payı (ör. Eğitici %30). İçeriğe sütun atanır; aylık dağılım hedef payla karşılaştırılır.
//  - İçeriğin kanalı boşsa türünden çıkarılır (aynı bilgi iki kez girilmez).
import { badRequest, notFound, newId, now, text, oneOf, parseJson } from '../lib/http.js';
import { engagementRate } from './workspace.js';

export const GOAL_KINDS = {
  erisim: { label: 'Erişim', unit: 'kişi', auto: true },
  takipci: { label: 'Yeni takipçi', unit: 'kişi', auto: true },
  etkilesim: { label: 'Ortalama etkileşim oranı', unit: '%', auto: true },
  satis: { label: 'Satış', unit: 'adet', auto: false },
  trafik: { label: 'Web sitesi ziyareti', unit: 'ziyaret', auto: false },
  bilinirlik: { label: 'Bilinirlik (marka araması, bahsedilme)', unit: 'adet', auto: false }
};
export const PURPOSES = { bilinirlik: 'Bilinirlik', etkilesim: 'Etkileşim', takipci: 'Takipçi kazanma', satis: 'Satış', trafik: 'Siteye yönlendirme', egitim: 'Bilgilendirme', topluluk: 'Topluluk / sadakat' };
export const PLATFORMS = { instagram: 'Instagram', youtube: 'YouTube', linkedin: 'LinkedIn', tiktok: 'TikTok', facebook: 'Facebook', x: 'X', web: 'Web sitesi / blog' };
export const platformOf = (type, platform) => platform || (type === 'youtube' ? 'youtube' : /^linkedin/.test(type || '') ? 'linkedin' : 'instagram');

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_PILLARS = 12;
const monthOf = v => { const m = String(v || ''); if (!MONTH.test(m)) throw badRequest('Ay YYYY-AA biçiminde olmalı.'); return m; };
const num = (v, field, { allowNull = false } = {}) => {
  if (v == null || v === '') { if (allowNull) return null; throw badRequest(`${field} gerekli.`); }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw badRequest(`${field} geçersiz.`);
  return Math.round(n * 10) / 10;
};

export function createStrategyService({ db }) {
  const toGoal = r => ({ id: r.id, kind: r.kind, label: (GOAL_KINDS[r.kind] || {}).label || r.kind, unit: (GOAL_KINDS[r.kind] || {}).unit || '',
    auto: Boolean((GOAL_KINDS[r.kind] || {}).auto), month: r.month, target: r.target, actual: r.actual, note: r.note, updatedAt: r.updated_at });
  const toPillar = r => ({ id: r.id, name: r.name, share: r.share, description: r.description, sort: r.sort });
  const goalRow = (brandId, id) => { const r = db.prepare('SELECT * FROM brand_goals WHERE id = ? AND brand_id = ?').get(String(id), brandId); if (!r) throw notFound('Hedef bulunamadı.'); return r; };
  const pillarRow = (brandId, id) => { const r = db.prepare('SELECT * FROM brand_pillars WHERE id = ? AND brand_id = ?').get(String(id), brandId); if (!r) throw notFound('Sütun bulunamadı.'); return r; };
  const pillars = brandId => db.prepare('SELECT * FROM brand_pillars WHERE brand_id = ? ORDER BY sort, created_at').all(brandId).map(toPillar);
  const shareTotal = (brandId, exceptId = null) => db.prepare('SELECT COALESCE(SUM(share), 0) AS n FROM brand_pillars WHERE brand_id = ? AND id != ?').get(brandId, exceptId || '').n;
  const cleanShare = (brandId, v, exceptId) => {
    const s = Math.round(Number(v || 0));
    if (!Number.isFinite(s) || s < 0 || s > 100) throw badRequest('Hedef pay 0 ile 100 arasında olmalı.');
    if (shareTotal(brandId, exceptId) + s > 100) throw badRequest(`Sütunların hedef payları toplamı %100'ü geçemez (şu an diğerleri %${shareTotal(brandId, exceptId)}).`);
    return s;
  };

  // Ayın içerikleri (yayın tarihine göre)
  const monthContents = (brandId, month) => db.prepare("SELECT id, title, type, status, platform, pillar_id, purpose, metrics FROM contents WHERE brand_id = ? AND substr(scheduled_at, 1, 7) = ?").all(brandId, month);

  function progress(brandId, month) {
    const rows = monthContents(brandId, month);
    const measured = rows.map(r => parseJson(r.metrics, null)).filter(m => m && typeof m === 'object');
    const sum = k => measured.reduce((n, m) => n + (Number(m[k]) || 0), 0);
    const rates = measured.map(engagementRate).filter(x => x != null);
    const autoActual = {
      erisim: measured.length ? (sum('reach') || sum('views')) : null,
      takipci: measured.length ? sum('follows') : null,
      etkilesim: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 10) / 10 : null
    };
    const goals = db.prepare('SELECT * FROM brand_goals WHERE brand_id = ? AND month = ? ORDER BY created_at').all(brandId, month).map(toGoal).map(g => {
      const actual = g.auto ? autoActual[g.kind] : g.actual;
      return Object.assign(g, { actual, measuredCount: g.auto ? measured.length : null, percent: actual != null && g.target ? Math.round(actual / g.target * 100) : null });
    });
    const ps = pillars(brandId);
    const withPillar = rows.filter(r => r.pillar_id);
    const dist = ps.map(p => {
      const n = withPillar.filter(r => r.pillar_id === p.id).length;
      return Object.assign({}, p, { count: n, actualShare: withPillar.length ? Math.round(n / withPillar.length * 100) : 0 });
    });
    const by = (key, labels) => Object.entries(rows.reduce((m, r) => { const k = key(r); if (k) m[k] = (m[k] || 0) + 1; return m; }, {}))
      .map(([k, n]) => ({ key: k, label: labels[k] || k, count: n })).sort((a, b) => b.count - a.count);
    return {
      month, goals, pillars: dist, contentCount: rows.length, assigned: withPillar.length, unassigned: rows.length - withPillar.length,
      byPlatform: by(r => platformOf(r.type, r.platform), PLATFORMS), byPurpose: by(r => r.purpose, PURPOSES)
    };
  }

  return {
    goalKinds: GOAL_KINDS, purposes: PURPOSES, platforms: PLATFORMS,
    pillars,
    get(brandId, month) {
      const m = monthOf(month);
      return { month: m, goals: progress(brandId, m).goals, pillars: pillars(brandId), progress: progress(brandId, m) };
    },
    progress: (brandId, month) => progress(brandId, monthOf(month)),
    // Aynı ay ve türde ikinci hedef açılmaz; var olan güncellenir
    saveGoal(brandId, body = {}) {
      const kind = oneOf(body.kind, Object.keys(GOAL_KINDS), 'Hedef türü');
      const month = monthOf(body.month);
      const target = num(body.target, 'Hedef değer');
      if (!target) throw badRequest('Hedef değer 0\'dan büyük olmalı.');
      if (kind === 'etkilesim' && target > 100) throw badRequest('Etkileşim oranı hedefi yüzde olarak girilir (ör. 4,5).');
      const actual = GOAL_KINDS[kind].auto ? null : num(body.actual, 'Gerçekleşen', { allowNull: true });
      const note = text(body.note, { field: 'Not', max: 300 });
      const t = now();
      const old = db.prepare('SELECT id FROM brand_goals WHERE brand_id = ? AND month = ? AND kind = ?').get(brandId, month, kind);
      if (old) db.prepare('UPDATE brand_goals SET target = ?, actual = ?, note = ?, updated_at = ? WHERE id = ?').run(target, actual, note, t, old.id);
      else db.prepare('INSERT INTO brand_goals (id, brand_id, kind, month, target, actual, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(newId(), brandId, kind, month, target, actual, note, t, t);
      const id = old ? old.id : db.prepare('SELECT id FROM brand_goals WHERE brand_id = ? AND month = ? AND kind = ?').get(brandId, month, kind).id;
      return toGoal(goalRow(brandId, id));
    },
    updateGoal(brandId, id, body = {}) {
      const r = goalRow(brandId, id);
      const auto = (GOAL_KINDS[r.kind] || {}).auto;
      const target = 'target' in body ? num(body.target, 'Hedef değer') : r.target;
      if (!target) throw badRequest('Hedef değer 0\'dan büyük olmalı.');
      const actual = auto ? null : ('actual' in body ? num(body.actual, 'Gerçekleşen', { allowNull: true }) : r.actual);
      const note = 'note' in body ? text(body.note, { field: 'Not', max: 300 }) : r.note;
      db.prepare('UPDATE brand_goals SET target = ?, actual = ?, note = ?, updated_at = ? WHERE id = ?').run(target, actual, note, now(), r.id);
      return toGoal(goalRow(brandId, r.id));
    },
    deleteGoal(brandId, id) { const r = goalRow(brandId, id); db.prepare('DELETE FROM brand_goals WHERE id = ?').run(r.id); return { ok: true }; },
    // Geçen ayın hedeflerini bu aya kopyala (yeniden yazmamak için); var olanlara dokunulmaz
    copyGoals(brandId, fromMonth, toMonth) {
      const from = monthOf(fromMonth); const to = monthOf(toMonth);
      const t = now(); let n = 0;
      for (const g of db.prepare('SELECT * FROM brand_goals WHERE brand_id = ? AND month = ?').all(brandId, from)) {
        if (db.prepare('SELECT 1 FROM brand_goals WHERE brand_id = ? AND month = ? AND kind = ?').get(brandId, to, g.kind)) continue;
        db.prepare('INSERT INTO brand_goals (id, brand_id, kind, month, target, actual, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)').run(newId(), brandId, g.kind, to, g.target, g.note, t, t);
        n++;
      }
      return { copied: n };
    },
    addPillar(brandId, body = {}) {
      if (db.prepare('SELECT COUNT(*) AS n FROM brand_pillars WHERE brand_id = ?').get(brandId).n >= MAX_PILLARS) throw badRequest(`En çok ${MAX_PILLARS} içerik sütunu açılabilir.`);
      const name = text(body.name, { field: 'Sütun adı', max: 60, required: true });
      if (db.prepare('SELECT 1 FROM brand_pillars WHERE brand_id = ? AND lower(name) = lower(?)').get(brandId, name)) throw badRequest('Bu adda bir sütun zaten var.');
      const t = now(); const id = newId();
      const sort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM brand_pillars WHERE brand_id = ?').get(brandId).n;
      db.prepare('INSERT INTO brand_pillars (id, brand_id, name, share, description, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, brandId, name, cleanShare(brandId, body.share, null), text(body.description, { field: 'Açıklama', max: 300 }), sort, t, t);
      return toPillar(pillarRow(brandId, id));
    },
    updatePillar(brandId, id, body = {}) {
      const r = pillarRow(brandId, id);
      const name = 'name' in body ? text(body.name, { field: 'Sütun adı', max: 60, required: true }) : r.name;
      if (db.prepare('SELECT 1 FROM brand_pillars WHERE brand_id = ? AND lower(name) = lower(?) AND id != ?').get(brandId, name, r.id)) throw badRequest('Bu adda bir sütun zaten var.');
      const share = 'share' in body ? cleanShare(brandId, body.share, r.id) : r.share;
      const description = 'description' in body ? text(body.description, { field: 'Açıklama', max: 300 }) : r.description;
      db.prepare('UPDATE brand_pillars SET name = ?, share = ?, description = ?, updated_at = ? WHERE id = ?').run(name, share, description, now(), r.id);
      return toPillar(pillarRow(brandId, r.id));
    },
    // Silinen sütunun içerikleri silinmez; yalnız sütunsuz kalır
    deletePillar(brandId, id) {
      const r = pillarRow(brandId, id);
      db.prepare('UPDATE contents SET pillar_id = NULL WHERE pillar_id = ?').run(r.id);
      db.prepare('DELETE FROM brand_pillars WHERE id = ?').run(r.id);
      return { ok: true };
    }
  };
}
