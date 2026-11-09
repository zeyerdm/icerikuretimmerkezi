// Aşama 5.16: Kampanya kanvası. Marka başına panolar; kartlar markanın kendi kayıtlarına bağlanır (fikir, Reels senaryosu,
// tasarım, prompt, kütüphane görseli, takvim içeriği) ya da serbest not olur. Kartlar panoda serbestçe konumlanır ve
// birbirine bağlanabilir. Bağlı kayıt silinirse kart "silinmiş kayıt" olarak kalır (pano bozulmaz).
import { newId, now, text, notFound, badRequest, parseJson, HEX } from '../lib/http.js';

export const CAMPAIGN_KINDS = { idea: 'Fikir', reels: 'Reels', post: 'Tasarım', prompt: 'Prompt', asset: 'Görsel', content: 'Takvim içeriği', note: 'Not' };
const TABLE = { idea: 'ideas', reels: 'reels', post: 'posts', prompt: 'prompts', asset: 'assets', content: 'contents' };
const MAX_ITEMS = 120;

export function createCampaignService({ db, brands }) {
  const row = (brandId, id) => {
    const r = db.prepare('SELECT * FROM campaigns WHERE id = ? AND brand_id = ?').get(String(id), brandId);
    if (!r) throw notFound('Kampanya bulunamadı.');
    return r;
  };
  // Kartın bağlı olduğu kaydın özeti (başlık, alt bilgi, görsel, açılacak adres)
  function resolve(brandId, it) {
    const base = `#/m/${brandId}`;
    if (it.kind === 'note') return { title: it.text, sub: '', href: null };
    const t = TABLE[it.kind];
    const r = t && db.prepare(`SELECT * FROM ${t} WHERE id = ? AND brand_id = ?`).get(String(it.ref_id), brandId);
    if (!r) return { title: 'Silinmiş kayıt', sub: CAMPAIGN_KINDS[it.kind] || '', href: null, missing: true };
    if (it.kind === 'idea') return { title: r.title, sub: r.description.slice(0, 120), href: `${base}/fikirler` };
    if (it.kind === 'reels') return { title: r.title, sub: 'Reels senaryosu', href: `${base}/reels/${r.id}` };
    if (it.kind === 'post') return { title: r.title, sub: 'Post tasarımı', href: `${base}/post/${r.id}` };
    if (it.kind === 'prompt') return { title: r.title, sub: String(r.text || '').slice(0, 120), href: `${base}/prompt/${r.id}` };
    if (it.kind === 'asset') return { title: r.label || 'Görsel', sub: 'Kütüphane', href: `${base}/kutuphane`, image: `/api/brands/${brandId}/assets/${r.id}/file` };
    if (it.kind === 'content') return { title: r.title, sub: r.scheduled_at ? new Date(r.scheduled_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Tarihsiz', href: `${base}/takvim`, status: r.status };
    return { title: '', sub: '' };
  }
  const toItem = (brandId, it) => Object.assign({ id: it.id, kind: it.kind, kindLabel: CAMPAIGN_KINDS[it.kind], refId: it.ref_id, text: it.text, x: it.x, y: it.y }, resolve(brandId, it));
  const toCampaign = (r, withItems) => {
    const out = { id: r.id, name: r.name, goal: r.goal, color: r.color, links: parseJson(r.links, []), createdAt: r.created_at, updatedAt: r.updated_at,
      itemCount: db.prepare('SELECT COUNT(*) AS n FROM campaign_items WHERE campaign_id = ?').get(r.id).n };
    if (withItems) out.items = db.prepare('SELECT * FROM campaign_items WHERE campaign_id = ? ORDER BY created_at').all(r.id).map(it => toItem(r.brand_id, it));
    return out;
  };
  const touch = id => db.prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?').run(now(), id);
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(6000, Math.round(n))) : d; };

  return {
    list(brandId) { const b = brands.get(brandId); return db.prepare('SELECT * FROM campaigns WHERE brand_id = ? ORDER BY updated_at DESC').all(b.id).map(r => toCampaign(r, false)); },
    get(brandId, id) { const b = brands.get(brandId); return toCampaign(row(b.id, id), true); },
    create(brandId, body = {}) {
      const b = brands.get(brandId);
      const t = now();
      const r = { id: newId(), brand_id: b.id, name: text(body.name, { field: 'Kampanya adı', max: 100, required: true }), goal: text(body.goal, { field: 'Amaç', max: 500 }),
        color: HEX.test(body.color || '') ? body.color : (b.colors && b.colors.primary) || '#7d6bf0', links: '[]', created_at: t, updated_at: t };
      db.prepare('INSERT INTO campaigns (id, brand_id, name, goal, color, links, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, r.brand_id, r.name, r.goal, r.color, r.links, r.created_at, r.updated_at);
      brands.logActivity(b.id, 'campaign.created', `Kampanya panosu açıldı: ${r.name}`);
      return toCampaign(r, true);
    },
    update(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const items = new Set(db.prepare('SELECT id FROM campaign_items WHERE campaign_id = ?').all(r.id).map(x => x.id));
      const next = {
        name: 'name' in body ? text(body.name, { field: 'Kampanya adı', max: 100, required: true }) : r.name,
        goal: 'goal' in body ? text(body.goal, { field: 'Amaç', max: 500 }) : r.goal,
        color: 'color' in body && HEX.test(body.color || '') ? body.color : r.color,
        // Bağlantı: iki kart kimliği; yalnız bu panodaki kartlar, tekrarsız, en fazla 300
        links: 'links' in body ? JSON.stringify((Array.isArray(body.links) ? body.links : []).filter(l => Array.isArray(l) && l.length === 2 && items.has(l[0]) && items.has(l[1]) && l[0] !== l[1])
          .map(l => [String(l[0]), String(l[1])]).filter((l, i, a) => a.findIndex(m => (m[0] === l[0] && m[1] === l[1]) || (m[0] === l[1] && m[1] === l[0])) === i).slice(0, 300)) : r.links
      };
      db.prepare('UPDATE campaigns SET name = ?, goal = ?, color = ?, links = ?, updated_at = ? WHERE id = ?').run(next.name, next.goal, next.color, next.links, now(), r.id);
      return this.get(b.id, r.id);
    },
    remove(brandId, id) { const b = brands.get(brandId); const r = row(b.id, id); db.prepare('DELETE FROM campaigns WHERE id = ?').run(r.id); },
    addItem(brandId, id, body = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      if (db.prepare('SELECT COUNT(*) AS n FROM campaign_items WHERE campaign_id = ?').get(r.id).n >= MAX_ITEMS) throw badRequest(`Bir panoda en fazla ${MAX_ITEMS} kart olabilir.`);
      const kind = String(body.kind || '');
      if (!CAMPAIGN_KINDS[kind]) throw badRequest('Geçersiz kart türü.');
      let refId = null; let noteText = '';
      if (kind === 'note') noteText = text(body.text, { field: 'Not', max: 1000, required: true });
      else {
        refId = String(body.refId || '');
        // Yalnızca bu markanın kaydı bağlanabilir
        if (!db.prepare(`SELECT 1 FROM ${TABLE[kind]} WHERE id = ? AND brand_id = ?`).get(refId, b.id)) throw badRequest('Bağlanacak kayıt bu markada bulunamadı.');
      }
      const it = { id: newId(), campaign_id: r.id, kind, ref_id: refId, text: noteText, x: num(body.x, 40), y: num(body.y, 40), created_at: now() };
      db.prepare('INSERT INTO campaign_items (id, campaign_id, kind, ref_id, text, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(it.id, it.campaign_id, it.kind, it.ref_id, it.text, it.x, it.y, it.created_at);
      touch(r.id);
      return toItem(b.id, it);
    },
    updateItem(brandId, id, itemId, body = {}) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const it = db.prepare('SELECT * FROM campaign_items WHERE id = ? AND campaign_id = ?').get(String(itemId), r.id);
      if (!it) throw notFound('Kart bulunamadı.');
      const next = { x: 'x' in body ? num(body.x, it.x) : it.x, y: 'y' in body ? num(body.y, it.y) : it.y,
        text: it.kind === 'note' && 'text' in body ? text(body.text, { field: 'Not', max: 1000, required: true }) : it.text };
      db.prepare('UPDATE campaign_items SET x = ?, y = ?, text = ? WHERE id = ?').run(next.x, next.y, next.text, it.id);
      touch(r.id);
      return toItem(b.id, Object.assign(it, next));
    },
    removeItem(brandId, id, itemId) {
      const b = brands.get(brandId);
      const r = row(b.id, id);
      const del = db.prepare('DELETE FROM campaign_items WHERE id = ? AND campaign_id = ?').run(String(itemId), r.id);
      if (!del.changes) throw notFound('Kart bulunamadı.');
      const links = parseJson(r.links, []).filter(l => l[0] !== itemId && l[1] !== itemId);
      db.prepare('UPDATE campaigns SET links = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(links), now(), r.id);
    }
  };
}
