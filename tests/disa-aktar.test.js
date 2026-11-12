// 8.8 Veri dışa aktarma: JSON (bütün kayıtlar), CSV (tür tür, Excel uyumlu), .ics (Google/Outlook takvimi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { toCsv, toIcs } from '../server/services/dataExport.js';

test('8.8 CSV ve iCalendar biçimi: kaçış, formül koruması, satır katlama', () => {
  const csv = toCsv([{ a: 'düz', b: 'noktalı; virgül', c: 'tırnak "x"' }, { a: '=1+1', d: { x: 1 } }]);
  assert.ok(csv.startsWith('﻿a;b;c;d\r\n'), 'BOM ve noktalı virgül');
  assert.match(csv, /düz;"noktalı; virgül";"tırnak ""x""";\r\n/);
  assert.match(csv, /"'=1\+1";;;"\{""x"":1\}"/, 'formül olarak çalışmaz; iç içe değer JSON');
  const ics = toIcs([{ uid: 'u1@x', start: '2026-11-20T09:30:00.000Z', summary: 'Kahve, Reels; çekim', description: 'Satır 1\nSatır 2 ' + 'uzun '.repeat(30) }], { name: 'Test' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(ics, /DTSTART:20261120T093000Z\r\nDTEND:20261120T100000Z/);
  assert.ok(ics.includes('SUMMARY:Kahve\\, Reels\\; çekim'));
  assert.match(ics, /DESCRIPTION:Satır 1\\nSatır 2/);
  assert.ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'satırlar 75 baytı geçmez');
  assert.ok(ics.includes('\r\n '), 'uzun satır katlanır');
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('8.8 dışa aktarma uç noktaları: JSON, CSV ve takvim; yalnız kendi markası ve gizli sütunlar olmadan', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kahve Durağı' })).data.brand;
    const other = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Latte günü', category: 'guncel' });
    await s.request('POST', '/api/contents', { brandId: b.id, title: 'Latte Reels', type: 'reels', scheduledAt: '2026-11-20T09:30:00.000Z', notes: 'Çekim sabah' });
    await s.request('POST', '/api/contents', { brandId: b.id, title: 'Tarihsiz', type: 'post' });
    await s.request('POST', '/api/contents', { brandId: other.id, title: 'Başka marka', type: 'post', scheduledAt: '2026-11-21T10:00:00.000Z' });
    await s.request('POST', '/api/notes', { brandId: b.id, title: 'Not', body: 'gizli değil' });

    const r = await fetch(`${s.base}/api/brands/${b.id}/export.json`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /attachment; filename="Kahve-Duragi-\d{4}-\d\d-\d\d\.json"; filename\*=UTF-8''Kahve%20Dura%C4%9F%C4%B1/);
    const data = await r.json();
    assert.equal(data.format, 'icerik-uretim-merkezi/marka');
    assert.equal(data.brand.name, 'Kahve Durağı');
    assert.equal(data.contents.length, 2);
    assert.equal(data.ideas[0].title, 'Latte günü');
    assert.equal(data.notes.length, 1);
    assert.ok(!JSON.stringify(data).includes('Başka marka'), 'başka markanın kaydı girmez');
    assert.equal('brand_id' in data.contents[0] || 'owner_id' in data.brand, false, 'iç sütunlar çıkarılır');

    const c = await fetch(`${s.base}/api/brands/${b.id}/export/contents.csv`);
    assert.match(c.headers.get('content-type'), /text\/csv/);
    const csv = await c.text();
    assert.match(csv, /^﻿?id;/);
    assert.match(csv, /Latte Reels/);
    assert.equal((await fetch(`${s.base}/api/brands/${b.id}/export/sifreler.csv`)).status, 400);

    const ics = await (await fetch(`${s.base}/api/brands/${b.id}/calendar.ics`)).text();
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1, 'yalnız tarihli içerik');
    assert.match(ics, /SUMMARY:Latte Reels · Reels/);
    assert.match(ics, /DESCRIPTION:Durum: Taslak\\nÇekim sabah/);
    const all = await (await fetch(`${s.base}/api/export/calendar.ics`)).text();
    assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, 2, 'bütün markalar');
    assert.match(all, /\(Diğer\)/);
    assert.equal((await fetch(`${s.base}/api/brands/yok/export.json`)).status, 404);
  } finally { await s.stop(); }
});
