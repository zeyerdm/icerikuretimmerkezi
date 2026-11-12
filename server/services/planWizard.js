// 8.16 Haftalık plan sihirbazı: "Bu hafta N içerik" → fikir havuzu, Reels havuzu, özel günler ve aylık hedefe göre
// takvim taslağı (yapay zekâ kullanmaz; anında ve ücretsiz). Kullanıcı satırları düzenleyip onaylayınca takvime yazılır.
import { badRequest } from '../lib/http.js';
import { CONTENT_TYPES } from './workspace.js';
import { specialDays } from './specialDays.js';

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DEFAULT_MIX = ['reels', 'post', 'carousel', 'reels', 'story'];

// Haftanın günlerinden "count" gün seçer: önce boş günler, aralıklar dengeli (ör. 3 → Pzt, Çar, Cum)
export function pickDays(busy, count) {
  const out = [];
  const order = [0, 2, 4, 6, 1, 3, 5];
  let round = 0;
  while (out.length < count && round < 3) {
    for (const i of order) {
      if (out.length >= count) break;
      if ((busy[i] || 0) + out.filter(x => x === i).length <= round) out.push(i);
    }
    round++;
  }
  return out.sort((a, b) => a - b);
}

export function createPlanWizardService({ db, brands, workspace }) {
  return {
    draft(brandId, { weekStart, count = 5, time = '12:00', tz = 0 } = {}) {
      const b = brands.get(brandId);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart || ''))) throw badRequest('Hafta başlangıcı (YYYY-AA-GG) gerekli.');
      const n = Math.round(Number(count));
      if (!(n >= 1 && n <= 14)) throw badRequest('Haftada 1 ile 14 arasında içerik planlanabilir.');
      if (!/^\d{2}:\d{2}$/.test(String(time))) throw badRequest('Saat SS:DD biçiminde olmalı.');
      const offset = Number(tz) || 0; // istemcinin saat dilimi (dakika, getTimezoneOffset)
      const [y, m, d] = weekStart.split('-').map(Number);
      const [hh, mm] = time.split(':').map(Number);
      const localDay = i => new Date(Date.UTC(y, m - 1, d + i, hh, mm) + offset * 60000); // yerel saat → UTC
      const startUtc = new Date(Date.UTC(y, m - 1, d) + offset * 60000);
      const endUtc = new Date(startUtc.getTime() + 7 * DAY);
      const dayIndex = iso => Math.floor((new Date(iso).getTime() - startUtc.getTime()) / DAY);

      const existing = db.prepare('SELECT id, title, type, scheduled_at FROM contents WHERE brand_id = ? AND scheduled_at >= ? AND scheduled_at < ? ORDER BY scheduled_at').all(b.id, startUtc.toISOString(), endUtc.toISOString());
      const busy = {};
      existing.forEach(c => { const i = dayIndex(c.scheduled_at); busy[i] = (busy[i] || 0) + 1; });

      // Tür karışımı: son 90 günde markanın kullandığı türler (yoksa varsayılan karışım)
      const hist = db.prepare("SELECT type, COUNT(*) AS n FROM contents WHERE brand_id = ? AND created_at >= ? GROUP BY type ORDER BY n DESC").all(b.id, new Date(Date.now() - 90 * DAY).toISOString());
      const mix = hist.length ? hist.flatMap(h => Array(Math.max(1, Math.round(h.n / hist[0].n * 3))).fill(h.type)) : DEFAULT_MIX;

      // Kaynaklar: henüz takvime girmemiş fikirler (favoriler önce) ve beğenilmemiş olmayan Reels havuzu fikirleri
      const ideas = db.prepare('SELECT i.id, i.title, i.description FROM ideas i WHERE i.brand_id = ? AND NOT EXISTS (SELECT 1 FROM contents c WHERE c.idea_id = i.id) ORDER BY i.favorite DESC, i.created_at DESC LIMIT 30').all(b.id);
      const pool = db.prepare('SELECT p.id, p.text FROM reels_pool p WHERE p.brand_id = ? AND p.rating >= 0 AND NOT EXISTS (SELECT 1 FROM reels r WHERE r.pool_id = p.id) ORDER BY p.rating DESC, p.created_at DESC LIMIT 30').all(b.id);

      // Özel günler (dönemler değil): o güne bir içerik
      const specials = specialDays(keyOf(new Date(Date.UTC(y, m - 1, d))), keyOf(new Date(Date.UTC(y, m - 1, d + 6)))).filter(s => !s.end);
      const items = [];
      for (const s of specials) {
        if (items.length >= n) break;
        const i = Math.round((Date.UTC(...s.date.split('-').map((v, k) => (k === 1 ? v - 1 : +v))) - Date.UTC(y, m - 1, d)) / DAY);
        if (i < 0 || i > 6) continue;
        items.push({ day: i, type: 'post', title: `${s.name} paylaşımı`, source: 'ozel-gun', note: s.tip });
        busy[i] = (busy[i] || 0) + 1;
      }
      const days = pickDays(busy, n - items.length);
      let k = 0;
      for (const i of days) {
        const type = mix[k % mix.length]; k++;
        let item = { day: i, type, title: '', source: 'bos', note: '' };
        if (type === 'reels' && pool.length) { const p = pool.shift(); item = Object.assign(item, { title: p.text.slice(0, 120), poolId: p.id, source: 'reels-havuzu' }); }
        else if (ideas.length) { const x = ideas.shift(); item = Object.assign(item, { title: x.title, ideaId: x.id, source: 'fikir', note: x.description || '' }); }
        else if (pool.length) { const p = pool.shift(); item = Object.assign(item, { type: 'reels', title: p.text.slice(0, 120), poolId: p.id, source: 'reels-havuzu' }); }
        else item.title = `Yeni ${CONTENT_TYPES[type] || type} içeriği`;
        items.push(item);
      }
      items.sort((a, z) => a.day - z.day);

      // Aylık hedef notu
      const notes = [];
      const goal = b.monthlyGoal || 0;
      if (goal) {
        const now = new Date();
        const ms = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const me = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
        const planned = db.prepare('SELECT COUNT(*) AS n FROM contents WHERE brand_id = ? AND scheduled_at >= ? AND scheduled_at < ?').get(b.id, ms, me).n;
        notes.push(`Aylık hedef ${goal}; bu ay ${planned} içerik planlı.${planned + items.length >= goal ? ' Bu taslakla hedef tamamlanıyor.' : ` Bu taslakla ${planned + items.length} olur.`}`);
      }
      if (existing.length) notes.push(`Bu hafta zaten ${existing.length} içerik var; dolu günlerden kaçınıldı.`);
      if (!ideas.length && !pool.length && items.some(x => x.source === 'bos')) notes.push('Fikir havuzu boşaldı; başlıkları düzenle ya da önce fikir üret.');
      return {
        weekStart, count: n,
        items: items.map(x => Object.assign(x, { scheduledAt: localDay(x.day).toISOString() })),
        existing: existing.map(c => ({ id: c.id, title: c.title, type: c.type, scheduledAt: c.scheduled_at })),
        notes
      };
    },
    // Onaylanan satırlar takvime yazılır (taslak durumunda); fikirden gelenler fikre bağlanır
    apply(brandId, items = []) {
      const b = brands.get(brandId);
      if (!Array.isArray(items) || !items.length) throw badRequest('Takvime yazılacak satır yok.');
      if (items.length > 14) throw badRequest('Bir seferde en çok 14 içerik yazılabilir.');
      const created = items.map(x => workspace.createContent({ brandId: b.id, title: x.title, type: x.type, scheduledAt: x.scheduledAt, status: 'taslak', notes: x.note || '', ideaId: x.ideaId || null }));
      brands.logActivity(b.id, 'plan.week', `Haftalık plan: ${created.length} içerik takvime yazıldı`);
      return { created };
    }
  };
}
