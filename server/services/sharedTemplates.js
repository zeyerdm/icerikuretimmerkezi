// Ortak şablon kütüphanesi: bir markada tasarlanan şablon bütün markalarda kullanılır.
// Kaydederken katmanların rolü kaynak markanın kimliğiyle karşılaştırılarak çıkarılır (ana renk, ikincil renk, zemin,
// başlık/gövde rengi, başlık/gövde fontu, logo, maskot, görsel). Uygulanırken bu roller hedef markanın kimliğiyle
// değiştirilir; hedef markada karşılığı olmayan görsel alanı "Görsel alanı" kutusuna döner (başka markanın dosyası taşınmaz).
import { newId, now, text, notFound, parseJson, HEX } from '../lib/http.js';
import { POST_KINDS, POST_FORMATS, cleanData } from './posts.js';

const norm = c => String(c || '').toLowerCase();

// Kaynak markanın kimliğinden renk → rol eşlemesi
function colorRoles(b) {
  const c = b.colors || {};
  const m = new Map();
  const put = (hex, role) => { if (HEX.test(hex || '') && !m.has(norm(hex))) m.set(norm(hex), role); };
  put(c.primary, 'primary');
  (c.secondary || []).forEach((h, i) => put(h, `secondary:${i}`));
  (c.backgrounds || []).forEach((h, i) => put(h, `bg:${i}`));
  put(c.heading, 'heading');
  put(c.body, 'body');
  return m;
}

function readableOn(hex) {
  const n = parseInt(String(hex || '#ffffff').slice(1), 16);
  const [r, g, bb] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * bb > 0.45 ? '#1b1f3b' : '#ffffff';
}

// Hedef markada rolün rengi (yoksa makul yedek)
function roleColor(b, role, fallback) {
  const c = b.colors || {};
  const [k, i] = String(role).split(':');
  const pick = k === 'primary' ? c.primary : k === 'secondary' ? (c.secondary || [])[Number(i)] || (c.secondary || [])[0] || c.primary
    : k === 'bg' ? (c.backgrounds || [])[Number(i)] || (c.backgrounds || [])[0] : k === 'heading' ? c.heading : k === 'body' ? c.body : null;
  return HEX.test(pick || '') ? pick : fallback;
}

export function createSharedTemplateService({ db, ownerId, brands, assets }) {
  const row = id => {
    const r = db.prepare('SELECT * FROM shared_templates WHERE id = ? AND owner_id = ?').get(String(id), ownerId);
    if (!r) throw notFound('Şablon bulunamadı.');
    return r;
  };

  // Bir markanın tasarımını rollere çevirir (dosyalar yerine rol işaretleri)
  function abstract(data, b) {
    const roles = colorRoles(b);
    const f = b.fonts || {};
    const assetCat = new Map(assets.list(b.id).map(a => [a.id, a.category]));
    return {
      format: data.format,
      slides: data.slides.map(s => ({
        bg: s.bg, bgRole: roles.get(norm(s.bg)) || null,
        layers: s.layers.map(l => {
          const o = Object.assign({}, l);
          if (l.color && roles.has(norm(l.color))) o.colorRole = roles.get(norm(l.color));
          if (l.type === 'text') o.fontRole = l.font === f.heading ? 'heading' : l.font === f.body ? 'body' : null;
          if (l.type === 'image') {
            const cat = assetCat.get(l.assetId) || 'brand_image';
            o.imageRole = cat === 'logo' ? 'logo' : cat === 'mascot' ? 'mascot' : cat === 'sticker' ? 'sticker' : 'image';
            delete o.src; delete o.assetId; // başka markanın dosyası şablona girmez
          }
          return o;
        })
      }))
    };
  }

  // Rolleri hedef markanın kimliğiyle doldurur
  function theme(tpl, b) {
    const f = b.fonts || {};
    const pick = cat => assets.list(b.id, cat)[0] || null;
    const files = { logo: pick('logo'), mascot: pick('mascot'), sticker: pick('sticker'), image: pick('brand_image') || pick('product') || pick('ai_image') };
    const slides = tpl.slides.map(s => {
      const bg = s.bgRole ? roleColor(b, s.bgRole, s.bg) : s.bg;
      const layers = [];
      for (const l of s.layers) {
        const o = Object.assign({}, l);
        if (o.colorRole) o.color = roleColor(b, o.colorRole, o.color);
        // Rolsüz beyaz/koyu yazı, altındaki yeni renkte (en üstteki şekil ya da slayt zemini) okunmaz kaldıysa okunur renge çekilir
        if (o.type === 'text' && !o.colorRole && ['#ffffff', '#1b1f3b', '#000000'].includes(norm(o.color))) {
          const cx = o.x + (o.w || 0) / 2;
          const cy = o.y + (o.size || 40) / 2;
          const under = [...layers].reverse().find(x => x.type === 'shape' && cx >= x.x && cx <= x.x + x.w && cy >= x.y && cy <= x.y + x.h);
          const behind = under ? under.color : bg;
          const want = readableOn(behind);
          if ((norm(o.color) === '#ffffff') !== (want === '#ffffff')) o.color = want;
        }
        if (o.type === 'text' && o.fontRole) o.font = (o.fontRole === 'heading' ? f.heading : f.body) || o.font;
        if (o.type === 'image') {
          const a = files[o.imageRole];
          if (a) { o.src = a.url; o.assetId = a.id; } else {
            layers.push({ id: o.id, type: 'shape', shape: 'rect', x: o.x, y: o.y, w: o.w, h: o.h, color: '#e5e7eb', radius: 16 });
            layers.push({ id: o.id + 't', type: 'text', role: 'label', text: o.imageRole === 'logo' ? 'Logo alanı' : o.imageRole === 'mascot' ? 'Maskot alanı' : 'Görsel alanı', x: o.x, y: o.y + Math.round(o.h / 2) - 20, w: o.w, size: 32, color: '#6b7280', font: f.body || 'Inter', weight: 600, align: 'center' });
            continue;
          }
        }
        delete o.colorRole; delete o.fontRole; delete o.imageRole;
        layers.push(o);
      }
      return { bg, layers }; // zemin görseli kaynak markanın dosyası olduğu için taşınmaz
    });
    return cleanData({ format: POST_FORMATS[tpl.format] ? tpl.format : '4:5', slides, caption: '', hashtags: [] }, b.id);
  }

  const toItem = (r, b) => {
    const data = parseJson(r.data, {});
    return { id: r.id, name: r.name, kind: r.kind, kindLabel: POST_KINDS[r.kind] || r.kind, createdAt: r.created_at,
      sourceBrandId: r.source_brand_id, sourceBrandName: r.source_brand_id ? (() => { try { return brands.get(r.source_brand_id).name; } catch { return ''; } })() : '',
      data: b ? theme(data, b) : null };
  };

  return {
    // Hedef markanın kimliğiyle önizlemeli liste
    list(brandId) {
      const b = brandId ? brands.get(brandId) : null;
      return db.prepare('SELECT * FROM shared_templates WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId).map(r => toItem(r, b));
    },
    saveFromPost(brandId, postId, { name } = {}) {
      const b = brands.get(brandId);
      const p = db.prepare('SELECT * FROM posts WHERE id = ? AND brand_id = ?').get(String(postId), b.id);
      if (!p) throw notFound('Tasarım bulunamadı.');
      const data = cleanData(parseJson(p.data, {}), b.id);
      const id = newId();
      db.prepare('INSERT INTO shared_templates (id, owner_id, name, kind, data, source_brand_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, ownerId, text(name, { field: 'Şablon adı', max: 80 }) || p.title, p.kind, JSON.stringify(abstract(data, b)), b.id, now());
      brands.logActivity(b.id, 'template.shared', `Ortak şablon kütüphanesine eklendi: ${name || p.title}`);
      return toItem(row(id), b);
    },
    // Hedef markada yeni tasarım olarak açar
    use(brandId, id, { title } = {}) {
      const b = brands.get(brandId);
      const r = row(id);
      const data = theme(parseJson(r.data, {}), b);
      const pid = newId();
      const t = now();
      const name = text(title, { field: 'Ad', max: 120 }) || r.name;
      db.prepare("INSERT INTO posts (id, brand_id, title, kind, data, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', ?, ?)").run(pid, b.id, name, r.kind, JSON.stringify(data), t, t);
      return { id: pid, title: name };
    },
    remove(id) { db.prepare('DELETE FROM shared_templates WHERE id = ?').run(row(id).id); }
  };
}
