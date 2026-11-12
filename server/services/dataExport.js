// 8.8 Veri dışa aktarma: marka başına bütün kayıtlar JSON (tek dosya) ya da tür tür CSV olarak indirilir;
// takvim içerikleri .ics olarak Google Takvim / Outlook'a aktarılır. Dosyalar (görseller) ve gizli ayarlar girmez.
import { badRequest } from '../lib/http.js';
import { CONTENT_TYPES, CONTENT_STATUSES } from './workspace.js';

// Dışa aktarılan tablolar (brand_id ile); gizli ya da iç kullanım sütunları çıkarılır
const TABLES = {
  ideas: { label: 'Fikirler', table: 'ideas' },
  contents: { label: 'Takvim içerikleri', table: 'contents' },
  tasks: { label: 'Görevler', table: 'tasks', owner: true },
  notes: { label: 'Notlar', table: 'notes', owner: true },
  reels: { label: 'Reels senaryoları', table: 'reels' },
  reelsPool: { label: 'Reels fikir havuzu', table: 'reels_pool' },
  posts: { label: 'Tasarımlar', table: 'posts' },
  prompts: { label: 'Prompt\'lar', table: 'prompts' },
  patterns: { label: 'Reels kalıpları', table: 'patterns' },
  competitors: { label: 'Rakipler', table: 'competitors' },
  campaigns: { label: 'Kampanyalar', table: 'campaigns' },
  facts: { label: 'Marka hafızası', table: 'brand_facts' },
  assets: { label: 'Kütüphane (yalnız bilgiler)', table: 'assets' },
  images: { label: 'Görsel üretim kaydı', table: 'image_generations' }
};
const HIDDEN = new Set(['owner_id', 'brand_id']);
export const EXPORT_TYPES = Object.fromEntries(Object.entries(TABLES).map(([k, v]) => [k, v.label]));

const maybeJson = v => {
  if (typeof v !== 'string' || !/^[[{]/.test(v.trim())) return v;
  try { return JSON.parse(v); } catch { return v; }
};
const clean = row => Object.fromEntries(Object.entries(row).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => [k, maybeJson(v)]));

// CSV: Türkçe Excel'in açtığı biçim (UTF-8 BOM, noktalı virgül); iç içe değerler JSON metni olur
export function toCsv(rows) {
  if (!rows.length) return '\uFEFF';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[;"\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [cols.join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))].join('\r\n') + '\r\n';
}

// iCalendar: satırlar 75 baytta katlanır, metin kaçışları uygulanır, zamanlar UTC
const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsTime = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}
export function toIcs(events, { name = 'İçerik takvimi' } = {}) {
  const stamp = icsTime(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Icerik Uretim Merkezi//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(name)}`];
  for (const e of events) {
    const start = new Date(e.start);
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(start)}`, `DTEND:${icsTime(start.getTime() + (e.minutes || 30) * 60000)}`,
      `SUMMARY:${icsText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.categories) lines.push(`CATEGORIES:${icsText(e.categories)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function createDataExportService({ db, ownerId, brands }) {
  const rowsOf = (key, brandId) => {
    const t = TABLES[key];
    const sql = `SELECT * FROM ${t.table} WHERE brand_id = ?${t.owner ? ' AND owner_id = ?' : ''} ORDER BY created_at`;
    return db.prepare(sql).all(...(t.owner ? [brandId, ownerId] : [brandId])).map(clean);
  };
  const calendarEvents = brandIds => {
    const marks = brandIds.map(() => '?').join(',');
    return db.prepare(`SELECT c.*, b.name AS brand_name FROM contents c JOIN brands b ON b.id = c.brand_id WHERE c.brand_id IN (${marks}) AND c.scheduled_at IS NOT NULL ORDER BY c.scheduled_at`).all(...brandIds)
      .map(c => ({
        uid: `${c.id}@icerik-uretim-merkezi`,
        start: c.scheduled_at,
        summary: `${c.title} · ${CONTENT_TYPES[c.type] || c.type}${brandIds.length > 1 ? ` (${c.brand_name})` : ''}`,
        description: [`Durum: ${CONTENT_STATUSES[c.status] || c.status}`, c.notes].filter(Boolean).join('\n'),
        categories: c.brand_name
      }));
  };
  return {
    types: EXPORT_TYPES,
    json(brandId) {
      const b = brands.get(brandId);
      const brand = clean(db.prepare('SELECT * FROM brands WHERE id = ?').get(b.id));
      delete brand.feedback_dismissed;
      const out = { format: 'icerik-uretim-merkezi/marka', version: 1, exportedAt: new Date().toISOString(), brand };
      for (const key of Object.keys(TABLES)) out[key] = rowsOf(key, b.id);
      // Kampanya kartları kampanyalarına bağlı
      const ids = out.campaigns.map(c => c.id);
      out.campaignItems = ids.length ? db.prepare(`SELECT * FROM campaign_items WHERE campaign_id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(clean) : [];
      return out;
    },
    csv(brandId, type) {
      const b = brands.get(brandId);
      if (!TABLES[type]) throw badRequest('Geçersiz dışa aktarma türü.');
      return toCsv(rowsOf(type, b.id));
    },
    ics(brandId = null) {
      if (brandId) { const b = brands.get(brandId); return toIcs(calendarEvents([b.id]), { name: `${b.name} · içerik takvimi` }); }
      const all = brands.list().map(b => b.id);
      return toIcs(all.length ? calendarEvents(all) : [], { name: 'Bütün markalar · içerik takvimi' });
    }
  };
}
