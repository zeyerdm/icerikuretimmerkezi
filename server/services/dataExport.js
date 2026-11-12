// Takvim aktarımı: takvim içerikleri .ics olarak Google Takvim / Outlook'a aktarılır (Takvim sayfasındaki düğme).
// 10.1: marka geneli JSON/CSV dışa aktarma kaldırıldı; her üretim kendi yerinden indirilir ya da Drive'a gönderilir.
import { CONTENT_TYPES, CONTENT_STATUSES } from './workspace.js';

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

export function createDataExportService({ db, brands }) {
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
    ics(brandId = null) {
      if (brandId) { const b = brands.get(brandId); return toIcs(calendarEvents([b.id]), { name: `${b.name} · içerik takvimi` }); }
      const all = brands.list().map(b => b.id);
      return toIcs(all.length ? calendarEvents(all) : [], { name: 'Bütün markalar · içerik takvimi' });
    }
  };
}
