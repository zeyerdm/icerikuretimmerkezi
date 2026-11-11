// 7.12 Prompt kimliğini taşıma: kimlik tarif olur, başka markada boş cevapları doldurur; maskot istenmedikçe taşınmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

test('7.12 kimlik tarifi: kaydet, önizle, başka markaya başlangıç olarak uygula', async () => {
  const s = await startServer();
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kaynak' })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Hedef' })).data.brand;
    assert.equal((await s.request('POST', `/api/brands/${a.id}/prompt-identity/recipe`, {})).status, 400, 'boş kimlik kaydedilmez');
    await s.request('PUT', `/api/brands/${a.id}/prompt-identity`, { visualStyle: 'sinematik', lighting: 'altin', mood: ['samimi'], avoid: ['alkol'], hasMascot: true, mascotName: 'Fıstık', noBrandName: true });

    const r1 = (await s.request('POST', `/api/brands/${a.id}/prompt-identity/recipe`, {})).data.recipe;
    assert.equal(r1.kind, 'identity');
    assert.equal(r1.title, 'Kaynak prompt kimliği');
    assert.match(r1.preview, /Sinematik film karesi · Sıcak, altın saat · Samimi/);
    assert.doesNotMatch(r1.preview, /maskot/, 'maskot varsayılan olarak alınmaz');
    const r2 = (await s.request('POST', `/api/brands/${a.id}/prompt-identity/recipe`, { withMascot: true })).data.recipe;
    assert.match(r2.preview, /maskot cevaplarıyla/);
    assert.deepEqual((await s.request('GET', '/api/recipes?kind=identity')).data.recipes.map(r => r.id).sort(), [r1.id, r2.id].sort());

    // Hedefte dolu cevap korunur, boşlar dolar
    await s.request('PUT', `/api/brands/${b.id}/prompt-identity`, { lighting: 'neon' });
    const ap = (await s.request('POST', `/api/recipes/${r1.id}/apply`, { brandId: b.id })).data;
    assert.deepEqual(ap.filled.sort(), ['avoid', 'mood', 'noBrandName', 'visualStyle']);
    const idt = (await s.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity;
    assert.equal(idt.lighting, 'neon');
    assert.equal(idt.visualStyle, 'sinematik');
    assert.equal(idt.hasMascot, undefined);
    assert.equal(idt.mascotName, undefined);
    // Maskotlu tarif maskot cevaplarını da getirir
    const ap2 = (await s.request('POST', `/api/recipes/${r2.id}/apply`, { brandId: b.id })).data;
    assert.deepEqual(ap2.filled.sort(), ['hasMascot', 'mascotName']);
    assert.equal((await s.request('POST', `/api/recipes/${r2.id}/apply`, { brandId: b.id })).data.filled.length, 0);
    assert.equal((await s.request('GET', '/api/recipes?kind=identity')).data.recipes.find(r => r.id === r2.id).uses, 2);
  } finally { await s.stop(); }
});
