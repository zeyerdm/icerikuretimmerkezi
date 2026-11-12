// 8.12 Instagram sonuçlarını içe aktarma: Meta CSV'si (İngilizce/Türkçe sütunlar), eşleştirme ve metrik yazımı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { parseCsv, mapColumns, parseDate } from '../server/services/igImport.js';

const EN = `﻿Post ID,Account username,Description,Publish time,Permalink,Post type,Views,Reach,Likes,Shares,Follows,Comments,Saves
111,kahve,"Vize haftası latte kampanyası, kaçırma!",11/03/2026 10:15,https://instagram.com/p/a,IG reel,"12,345",9000,800,40,12,55,120
222,kahve,Yeni menü geldi,11/05/2026 18:00,https://instagram.com/p/b,IG image,3000,2500,150,5,1,9,30
333,kahve,Takvimde olmayan gönderi,10/01/2026 09:00,https://instagram.com/p/c,IG image,100,90,5,0,0,0,1
`;
const TR = `Gönderi kimliği;Açıklama;Yayınlanma zamanı;Görüntülemeler;Erişim;Beğenme;Yorumlar;Kaydetmeler;Paylaşımlar
1;Kahve günü;03.11.2026 10:15;1.234;1.000;100;10;20;3
`;

test('8.12 CSV ayrıştırma, sütun eşleme ve tarih biçimleri', () => {
  const rows = parseCsv(EN);
  assert.equal(rows.length, 4);
  assert.equal(rows[1][2], 'Vize haftası latte kampanyası, kaçırma!', 'tırnak içindeki virgül');
  const cols = mapColumns(rows[0]);
  assert.equal(cols.date, 3); assert.equal(cols.views, 6); assert.equal(cols.saves, 12); assert.equal(cols.caption, 2);
  const tr = parseCsv(TR);
  const tc = mapColumns(tr[0]);
  assert.equal(tc.date, 2); assert.equal(tc.views, 3); assert.equal(tc.likes, 5); assert.equal(tc.shares, 8);
  assert.equal(parseDate('03.11.2026 10:15').getMonth(), 10);
  assert.equal(parseDate('11/03/2026 10:15').getDate(), 3, 'Meta İngilizce: ay/gün');
  assert.equal(parseDate('25/03/2026').getMonth(), 2, '12\'den büyük ilk sayı gündür');
  assert.ok(parseDate('2026-11-03T10:15:00-0800'));
  assert.equal(parseDate('yok'), null);
});

test('8.12 ön izleme eşleştirir, onaylanınca metrikler yazılır; diğer metrikler korunur', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kahve' })).data.brand;
    const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).toISOString();
    const c1 = (await s.request('POST', '/api/contents', { brandId: b.id, title: 'Latte kampanyası', type: 'reels', scheduledAt: at(2026, 11, 3, 10, 0) })).data.content;
    const c2 = (await s.request('POST', '/api/contents', { brandId: b.id, title: 'Menü', type: 'post', scheduledAt: at(2026, 11, 5, 17, 30) })).data.content;
    await s.request('PATCH', `/api/contents/${c2.id}`, { metrics: { follows: 7, views: 1 } });
    const other = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    const x = (await s.request('POST', '/api/contents', { brandId: other.id, title: 'Başka', type: 'post', scheduledAt: at(2026, 11, 3, 10, 15) })).data.content;

    const pv = (await s.request('POST', `/api/brands/${b.id}/import/instagram/preview`, Buffer.from(EN), { 'Content-Type': 'text/csv' })).data;
    assert.equal(pv.total, 3);
    assert.equal(pv.matched, 2);
    const [r1, r2, r3] = pv.items;
    assert.equal(r1.match.contentId, c1.id);
    assert.equal(r1.match.confidence, 'yuksek');
    assert.deepEqual(r1.metrics, { views: 12345, reach: 9000, likes: 800, comments: 55, saves: 120, shares: 40, follows: 12 });
    assert.equal(r2.match.contentId, c2.id);
    assert.equal(r2.match.hasMetrics, true);
    assert.equal(r3.match, null, 'takvimde olmayan gönderi eşleşmez');
    assert.ok(!JSON.stringify(pv).includes(x.id), 'başka markanın içeriği aday olmaz');

    const ap = (await s.request('POST', `/api/brands/${b.id}/import/instagram/apply`, { items: [{ contentId: c1.id, metrics: r1.metrics }, { contentId: c2.id, metrics: { views: 3000, likes: 150 } }] })).data;
    assert.equal(ap.updated, 2);
    const g1 = (await s.request('GET', `/api/contents/${c1.id}`)).data.content;
    assert.equal(g1.metrics.views, 12345);
    assert.ok(g1.rate > 0, 'etkileşim oranı hesaplanır');
    const g2 = (await s.request('GET', `/api/contents/${c2.id}`)).data.content;
    assert.equal(g2.metrics.views, 3000);
    assert.equal(g2.metrics.follows, 7, 'CSV\'de olmayan metrik korunur');
    assert.equal((await s.request('POST', `/api/brands/${b.id}/import/instagram/apply`, { items: [{ contentId: x.id, metrics: { views: 1 } }] })).status, 400, 'başka markanın içeriğine yazılamaz');
    assert.equal((await s.request('POST', `/api/brands/${b.id}/import/instagram/preview`, Buffer.from('a,b\n1,2\n'), { 'Content-Type': 'text/csv' })).status, 400);
    // Türkçe dışa aktarım
    const tr = (await s.request('POST', `/api/brands/${b.id}/import/instagram/preview`, Buffer.from(TR), { 'Content-Type': 'text/csv' })).data;
    assert.equal(tr.items[0].match.contentId, c1.id);
    assert.equal(tr.items[0].metrics.views, 1234);
  } finally { await s.stop(); }
});
