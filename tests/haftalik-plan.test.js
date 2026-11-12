// 8.16 Haftalık plan sihirbazı: gün dağılımı, kaynaklar (fikir, Reels havuzu, özel gün), dolu günler, aylık hedef, takvime yazma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { pickDays } from '../server/services/planWizard.js';

test('8.16 gün seçimi: dengeli dağılım, dolu günden kaçınma, haftada 7\'den fazla', () => {
  assert.deepEqual(pickDays({}, 3), [0, 2, 4]);
  assert.deepEqual(pickDays({}, 5), [0, 1, 2, 4, 6]);
  assert.deepEqual(pickDays({ 0: 1, 2: 1 }, 2), [4, 6], 'dolu Pazartesi ve Çarşamba atlanır');
  assert.equal(pickDays({}, 10).length, 10);
  assert.equal(new Set(pickDays({}, 7)).size, 7);
});

test('8.16 taslak ve takvime yazma: kaynaklar, özel gün, dolu gün, hedef notu; başka markanın fikri bağlanamaz', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Planlı' })).data.brand;
    const url = `/api/brands/${b.id}/plan/week`;
    await s.request('PATCH', `/api/brands/${b.id}`, { monthlyGoal: 12 });
    const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Vize kahvesi kampanyası', category: 'guncel', description: 'Sınav haftasında indirim' })).data.idea;
    await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Barista tanıtımı', category: 'egitici' });
    await s.request('POST', `/api/brands/${b.id}/reels/pool`, { text: 'Kahve kuyruğunda yaşanan komik an', category: 'guncel' });
    // 23 Kasım 2026 Pazartesi; 24 Kasım Öğretmenler Günü. Salı günü zaten bir içerik var (İstanbul saatiyle 10:00)
    await s.request('POST', '/api/contents', { brandId: b.id, title: 'Var olan', type: 'post', scheduledAt: '2026-11-25T07:00:00.000Z' });
    assert.equal((await s.request('POST', `${url}/draft`, { weekStart: 'yok', count: 3 })).status, 400);
    assert.equal((await s.request('POST', `${url}/draft`, { weekStart: '2026-11-23', count: 20 })).status, 400);

    const d = (await s.request('POST', `${url}/draft`, { weekStart: '2026-11-23', count: 5, time: '19:30', tz: -180 })).data;
    assert.equal(d.items.length, 5);
    const special = d.items.find(x => x.source === 'ozel-gun');
    assert.equal(special.title, 'Öğretmenler Günü paylaşımı');
    assert.equal(special.scheduledAt, '2026-11-24T16:30:00.000Z', 'İstanbul 19:30 = 16:30 UTC');
    assert.ok(!d.items.some(x => x.scheduledAt.startsWith('2026-11-25')), 'dolu Çarşamba atlanır');
    assert.ok(d.items.some(x => x.source === 'fikir' && x.ideaId === idea.id), 'favori/yeni fikir kullanılır');
    assert.ok(d.items.some(x => x.source === 'reels-havuzu' && x.type === 'reels'));
    assert.equal(d.existing.length, 1);
    assert.ok(d.notes.some(n => /Aylık hedef 12/.test(n)));
    assert.ok(d.notes.some(n => /zaten 1 içerik/.test(n)));
    assert.deepEqual(d.items.map(x => x.scheduledAt), [...d.items.map(x => x.scheduledAt)].sort(), 'gün sırasına göre');

    const ap = (await s.request('POST', `${url}/apply`, { items: d.items.slice(0, 3) })).data;
    assert.equal(ap.created.length, 3);
    assert.ok(ap.created.every(c => c.status === 'taslak'));
    const linked = ap.created.find(c => c.ideaId === idea.id) || (await s.request('POST', `${url}/apply`, { items: d.items.filter(x => x.ideaId === idea.id) })).data.created[0];
    assert.equal(linked.ideaId, idea.id);
    // Kullanılan fikir sonraki taslakta önerilmez
    const d2 = (await s.request('POST', `${url}/draft`, { weekStart: '2026-11-30', count: 3 })).data;
    assert.ok(!d2.items.some(x => x.ideaId === idea.id));
    // Başka markanın fikri bağlanamaz; boş liste reddedilir
    const o = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    assert.equal((await s.request('POST', `/api/brands/${o.id}/plan/week/apply`, { items: [{ title: 'x', type: 'post', scheduledAt: '2026-11-30T09:00:00.000Z', ideaId: idea.id }] })).status, 400);
    assert.equal((await s.request('POST', `${url}/apply`, { items: [] })).status, 400);
  } finally { await s.stop(); }
});
