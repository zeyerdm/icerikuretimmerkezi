// Aşama 5.17: Genel arama. Bütün markalarda (yalnız bu kullanıcının) fikir, not, görev, takvim içeriği, tasarım,
// prompt ve Reels senaryosu başlık/metinlerinde arar. Her türden en fazla 6 sonuç; Türkçe büyük-küçük harf farkı gözetilmez.
export function createSearchService(db, ownerId) {
  const SOURCES = [
    { type: 'idea', label: 'Fikir', sql: "SELECT i.id, i.title, i.description AS body, i.brand_id, b.name AS brand FROM ideas i JOIN brands b ON b.id = i.brand_id WHERE b.owner_id = ?", fields: ['title', 'body'], href: r => `#/m/${r.brand_id}/fikirler` },
    { type: 'content', label: 'Takvim içeriği', sql: "SELECT c.id, c.title, c.notes AS body, c.brand_id, b.name AS brand, c.scheduled_at AS at FROM contents c JOIN brands b ON b.id = c.brand_id WHERE b.owner_id = ?", fields: ['title', 'body'], href: () => '#/masa' },
    { type: 'post', label: 'Tasarım', sql: "SELECT p.id, p.title, '' AS body, p.brand_id, b.name AS brand FROM posts p JOIN brands b ON b.id = p.brand_id WHERE b.owner_id = ?", fields: ['title'], href: r => `#/m/${r.brand_id}/post/${r.id}` },
    { type: 'reels', label: 'Reels senaryosu', sql: "SELECT r.id, r.title, '' AS body, r.brand_id, b.name AS brand FROM reels r JOIN brands b ON b.id = r.brand_id WHERE b.owner_id = ?", fields: ['title'], href: r => `#/m/${r.brand_id}/reels/${r.id}` },
    { type: 'prompt', label: 'Prompt', sql: "SELECT p.id, p.title, p.text AS body, p.brand_id, b.name AS brand FROM prompts p JOIN brands b ON b.id = p.brand_id WHERE b.owner_id = ?", fields: ['title', 'body'], href: r => `#/m/${r.brand_id}/prompt/${r.id}` },
    { type: 'note', label: 'Not', sql: "SELECT n.id, n.title, n.body, n.brand_id, b.name AS brand FROM notes n LEFT JOIN brands b ON b.id = n.brand_id WHERE n.owner_id = ?", fields: ['title', 'body'], href: () => '#/notlar' },
    { type: 'task', label: 'Görev', sql: "SELECT t.id, t.title, t.description AS body, t.brand_id, b.name AS brand FROM tasks t LEFT JOIN brands b ON b.id = t.brand_id WHERE t.owner_id = ?", fields: ['title', 'body'], href: () => '#/gorevler' }
  ];
  const norm = s => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  return {
    search(q) {
      const words = norm(q).split(/\s+/).filter(Boolean);
      if (!words.length || norm(q).length < 2) return [];
      const out = [];
      for (const s of SOURCES) {
        // SQLite LIKE Türkçe harfleri ayırt edemediği için eşleştirme JS'te yapılır (kayıt sayıları küçük)
        const rows = db.prepare(s.sql).all(ownerId).filter(r => { const hay = norm(s.fields.map(f => r[f]).join(' ')); return words.every(w => hay.includes(w)); }).slice(0, 6);
        rows.forEach(r => {
          const body = String(r.body || '');
          const k = norm(body).indexOf(words[0]);
          const snippet = body && k >= 0 ? (k > 30 ? '…' : '') + body.slice(Math.max(0, k - 30), k + 70).replace(/\s+/g, ' ') + (k + 70 < body.length ? '…' : '') : '';
          out.push({ type: s.type, typeLabel: s.label, id: r.id, title: String(r.title || body.slice(0, 60) || s.label).slice(0, 120), snippet, brandId: r.brand_id || null, brandName: r.brand || '', href: s.href(r) });
        });
      }
      return out;
    }
  };
}
