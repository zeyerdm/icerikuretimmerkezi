// 8.11 Onay akışı: onaya gönder → yorum → onayla / düzeltme iste; geçmiş; tek kullanıcıda kontrol listesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

test('8.11 onay akışı: durum geçişleri, zorunlu not, kontrol listesi, geçmiş, çöp kutusunda korunma', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Onaylı' })).data.brand;
    const c = (await s.request('POST', '/api/contents', { brandId: b.id, title: 'Kampanya postu', type: 'post' })).data.content;
    const rv = body => s.request('POST', `/api/contents/${c.id}/review`, body);
    assert.equal((await rv({ action: 'onayla' })).status, 400, 'onay beklemeyen içerik onaylanamaz');
    assert.equal((await rv({ action: 'yok' })).status, 400);
    const sent = (await rv({ action: 'gonder', note: 'Bakar mısın?' })).data;
    assert.equal(sent.content.status, 'onay');
    assert.equal((await rv({ action: 'gonder' })).status, 400, 'zaten onayda');
    assert.equal((await rv({ action: 'duzelt' })).status, 400, 'düzeltme notu zorunlu');
    const fix = (await rv({ action: 'duzelt', note: 'Fiyat yanlış' })).data;
    assert.equal(fix.content.status, 'hazirlaniyor');
    assert.equal((await rv({ action: 'yorum' })).status, 400, 'boş yorum');
    await rv({ action: 'yorum', note: 'Düzelttim' });
    await rv({ action: 'gonder' });
    // Kontrol listesi: açık adım varsa 409, force ile onay
    const open = await rv({ action: 'onayla' });
    assert.equal(open.status, 409);
    assert.equal(open.data.error.code, 'CHECKLIST_OPEN');
    assert.match(open.data.error.message, /adım açık/);
    // Modaldaki işaretler onayla isteğiyle kaydedilir
    const items = (await s.request('GET', `/api/contents/${c.id}`)).data.content.checklist.map(i => Object.assign({}, i, { done: true }));
    const ok = (await rv({ action: 'onayla', checklist: items })).data;
    assert.equal(ok.content.status, 'tamamlandi');
    assert.ok(ok.content.completedAt);
    assert.deepEqual(ok.reviews.map(r => r.action), ['gonder', 'duzelt', 'yorum', 'gonder', 'onayla']);
    assert.deepEqual(ok.reviews.map(r => r.label), ['Onaya gönderildi', 'Düzeltme istendi', 'Yorum', 'Onaya gönderildi', 'Onaylandı']);
    assert.equal(ok.reviews[1].note, 'Fiyat yanlış');
    // force: açık adımla onay
    const c2 = (await s.request('POST', '/api/contents', { brandId: b.id, title: 'İkinci', type: 'post' })).data.content;
    await s.request('POST', `/api/contents/${c2.id}/review`, { action: 'gonder' });
    assert.equal((await s.request('POST', `/api/contents/${c2.id}/review`, { action: 'onayla', force: true })).data.content.status, 'tamamlandi');
    // Silip geri alınca geçmiş de geri gelir
    const del = await fetch(`${s.base}/api/contents/${c.id}`, { method: 'DELETE' });
    await s.request('POST', `/api/trash/${del.headers.get('x-trash-id')}/restore`);
    assert.equal((await s.request('GET', `/api/contents/${c.id}/reviews`)).data.reviews.length, 5);
    assert.equal((await s.request('GET', '/api/contents/yok/reviews')).status, 404);
  } finally { await s.stop(); }
});
