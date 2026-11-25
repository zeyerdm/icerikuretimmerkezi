// O1 · Üç katmanlı marka hafızası: katman, onay, geçerlilik, güven, geçmiş; yapay zekâya yalnız onaylı ve geçerli kartlar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

const d = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('Hafıza: elle eklenen onaylı; dönemsel kart süresi dolunca arşive geçer; öneri onaylanınca eskisinin yerine geçer; geçmiş tutulur', async () => {
  const provider = fakeProvider([{ ideas: [{ title: 'Yeni fikir', description: 'x' }] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Katmanlı' })).data.brand;
    const url = `/api/brands/${b.id}/memory/facts`;
    const fiyat = (await s.request('POST', url, { category: 'fiyat', title: 'Menü fiyatları', content: 'Latte 100 TL' })).data.fact;
    assert.equal(fiyat.status, 'onayli'); assert.equal(fiyat.layer, 'sabit'); assert.equal(fiyat.source, 'manual');
    // Dönemsel: kampanya varsayılan dönemsel; geçerlilik tarihi
    const kamp = (await s.request('POST', url, { category: 'kampanya', title: 'Kış indirimi', content: '%20 indirim', validTo: d(10) })).data.fact;
    assert.equal(kamp.layer, 'donemsel'); assert.equal(kamp.validTo, d(10));
    const eski = (await s.request('POST', url, { category: 'kampanya', title: 'Yaz indirimi', content: '%30', validFrom: d(-40), validTo: d(-1) })).data.fact;
    assert.equal((await s.request('POST', url, { title: 'X', content: 'y', validFrom: d(5), validTo: d(1) })).status, 400, 'bitiş başlangıçtan önce olamaz');
    // Okununca süresi dolan arşive geçer
    let mem = (await s.request('GET', `/api/brands/${b.id}/memory`)).data.memory;
    assert.equal(mem.facts.find(f => f.id === eski.id).status, 'arsiv');
    // Yapay zekâ istemi: onaylı ve geçerli olanlar; arşiv ve öneri yok
    const prompt = () => provider.calls.at(-1).prompt;
    const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Kahve rehberi', category: 'egitici' })).data.idea;
    await s.request('POST', `/api/brands/${b.id}/ideas/${idea.id}/similar`, { count: 1 });
    assert.match(prompt(), /Menü fiyatları: Latte 100 TL/); assert.match(prompt(), /Kış indirimi/); assert.doesNotMatch(prompt(), /Yaz indirimi/);
    // Asistan "hatırla" (kullanıcının açık isteği) onaylı; ileride başlayan kart henüz gitmez
    await s.request('POST', url, { title: 'Yılbaşı menüsü', content: 'Özel menü', validFrom: d(20) });
    await s.request('POST', `/api/brands/${b.id}/ideas/${idea.id}/similar`, { count: 1 });
    assert.doesNotMatch(prompt(), /Yılbaşı menüsü/, 'başlangıcı gelmemiş kart gitmez');
    // Öneri (ör. siteden) çelişki: aynı başlık, farklı içerik → onaylanınca eskisi arşive
    const sug = (await s.request('POST', url, { title: 'Menü fiyatları', content: 'Latte 120 TL', status: 'oneri' })).data.fact;
    assert.equal(sug.status, 'oneri');
    mem = (await s.request('GET', `/api/brands/${b.id}/memory`)).data.memory;
    assert.equal(mem.pending, 1);
    assert.equal(mem.facts.find(f => f.id === sug.id).conflictWith.content, 'Latte 100 TL');
    await s.request('POST', `/api/brands/${b.id}/ideas/${idea.id}/similar`, { count: 1 });
    assert.doesNotMatch(prompt(), /Latte 120 TL/, 'onaysız öneri gitmez');
    await s.request('POST', `${url}/${sug.id}/approve`);
    mem = (await s.request('GET', `/api/brands/${b.id}/memory`)).data.memory;
    assert.equal(mem.facts.find(f => f.id === fiyat.id).status, 'arsiv');
    assert.equal(mem.facts.find(f => f.id === sug.id).status, 'onayli');
    // Geçmiş
    const h = (await s.request('GET', `${url}/${fiyat.id}/history`)).data.history;
    assert.deepEqual(h.map(x => x.action), ['yerine_gecildi', 'eklendi']);
    const he = (await s.request('GET', `${url}/${eski.id}/history`)).data.history;
    assert.equal(he[0].action, 'sure_doldu'); assert.equal(he[0].actor, 'sistem');
    // Uyarı merkezinde onay bekleyen yok artık; yeni öneri gelince görünür
    await s.request('POST', url, { title: 'Adres', content: 'Kadıköy', status: 'oneri' });
    const ins = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    assert.ok(ins.some(i => i.kind === 'hafiza_onay' && /1 bilgi onay bekliyor/.test(i.title)));
  } finally { await s.stop(); }
});
