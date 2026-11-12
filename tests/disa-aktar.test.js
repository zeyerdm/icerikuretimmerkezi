// Takvim aktarımı (.ics, Google/Outlook). 10.1: marka geneli JSON/CSV dışa aktarma kaldırıldı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { toIcs } from '../server/services/dataExport.js';

test('iCalendar biçimi: kaçış ve satır katlama', () => {
  const ics = toIcs([{ uid: 'u1@x', start: '2026-11-20T09:30:00.000Z', summary: 'Kahve, Reels; çekim', description: 'Satır 1\nSatır 2 ' + 'uzun '.repeat(30) }], { name: 'Test' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(ics, /DTSTART:20261120T093000Z\r\nDTEND:20261120T100000Z/);
  assert.ok(ics.includes('SUMMARY:Kahve\\, Reels\\; çekim'));
  assert.match(ics, /DESCRIPTION:Satır 1\\nSatır 2/);
  assert.ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'satırlar 75 baytı geçmez');
  assert.ok(ics.includes('\r\n '), 'uzun satır katlanır');
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('takvim aktarımı: marka ve bütün markalar .ics', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kahve Durağı' })).data.brand;
    const other = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Latte günü', category: 'guncel' });
    await s.request('POST', '/api/contents', { brandId: b.id, title: 'Latte Reels', type: 'reels', scheduledAt: '2026-11-20T09:30:00.000Z', notes: 'Çekim sabah' });
    await s.request('POST', '/api/contents', { brandId: b.id, title: 'Tarihsiz', type: 'post' });
    await s.request('POST', '/api/contents', { brandId: other.id, title: 'Başka marka', type: 'post', scheduledAt: '2026-11-21T10:00:00.000Z' });
    await s.request('POST', '/api/notes', { brandId: b.id, title: 'Not', body: 'gizli değil' });

    const ics = await (await fetch(`${s.base}/api/brands/${b.id}/calendar.ics`)).text();
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1, 'yalnız tarihli içerik');
    assert.match(ics, /SUMMARY:Latte Reels · Reels/);
    assert.match(ics, /DESCRIPTION:Durum: Taslak\\nÇekim sabah/);
    const all = await (await fetch(`${s.base}/api/export/calendar.ics`)).text();
    assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, 2, 'bütün markalar');
    assert.match(all, /\(Diğer\)/);
    assert.equal((await fetch(`${s.base}/api/brands/yok/calendar.ics`)).status, 404);
  } finally { await s.stop(); }
});
