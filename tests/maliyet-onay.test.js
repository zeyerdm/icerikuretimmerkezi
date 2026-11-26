// Ücretli işlem onayı (Aşama 04): tahmini tutar işlem başına sınırı aşarsa 409 COST_CONFIRM; onayla tekrar gönderilince
// çalışır; 0 = hiç sorma; aylık sınır ayrıca geçerli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

test('Ücretli işlem onayı: sınırı aşan işlem önce sorulur, onayla çalışır, sınır 0 ise sorulmaz', async () => {
  const provider = fakeProvider([{ ideas: [{ title: 'Yeni fikir', description: 'x' }] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Onaylı' })).data.brand;
    const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Kahve rehberi', category: 'egitici' })).data.idea;
    // Varsayılan sınır $0,10; test modelinin fiyatı yükseltilir (2.500 çıktı tokenı × $100/1M = $0,25)
    assert.equal((await s.request('PUT', '/api/ai/prices', { ref: 'fake:test', price: { input: 10, output: 100 } })).status, 200);
    const url = `/api/brands/${b.id}/ideas/${idea.id}/similar`;
    let r = await s.request('POST', url, { count: 1 });
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.error.code, 'COST_CONFIRM');
    assert.match(r.data.error.message, /yaklaşık \$0\.2\d+ tutacak \(işlem başına onay sınırı \$0\.1\)/);
    assert.equal(provider.calls.length, 0, 'onaysız çağrı yapılmaz');
    r = await s.request('POST', url, { count: 1, confirmCost: true });
    assert.ok(r.status < 300, JSON.stringify(r.data));
    assert.equal(provider.calls.length, 1);
    // Sınır 0: hiç sorulmaz
    const ov = (await s.request('PUT', '/api/ai/budget', { confirmUsd: 0 })).data;
    assert.equal(ov.budget ? ov.budget.confirmUsd : 0, 0);
    assert.ok((await s.request('POST', url, { count: 1 })).status < 300);
    assert.equal((await s.request('PUT', '/api/ai/budget', { confirmUsd: -1 })).status, 400);
  } finally { await s.stop(); }
});

test('Ücretli işlem onayı: toplu üretim kuyruğa alınırken toplam tahmin sorulur', async () => {
  const s = await startServer({ aiProvider: fakeProvider([{}]), queueAutostart: false });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Toplu' })).data.brand;
    const ids = [];
    for (const t of ['A', 'B', 'C']) ids.push((await s.request('POST', `/api/brands/${b.id}/ideas`, { title: t, format: 'post', category: 'egitici' })).data.idea.id);
    await s.request('PUT', '/api/ai/prices', { ref: 'fake:test', price: { input: 1, output: 15 } }); // tek iş ≈ $0,047; 3 iş ≈ $0,14
    let r = await s.request('POST', `/api/brands/${b.id}/gen-batches`, { ideaIds: ids });
    assert.equal(r.status, 409); assert.match(r.data.error.message, /3 yapay zekâ işlemi \(toplu üretim\)/);
    r = await s.request('POST', `/api/brands/${b.id}/gen-batches`, { ideaIds: ids, confirmCost: true });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  } finally { await s.stop(); }
});
