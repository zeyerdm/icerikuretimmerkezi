// 8.15 Hashtag grupları ve imza kapanışları: temizleme, sınırlar, yasaklı kelime denetimi, marka ayrımı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { cleanTag } from '../server/services/captionSets.js';

test('8.15 etiket temizleme', () => {
  assert.equal(cleanTag('kahve'), '#kahve');
  assert.equal(cleanTag('##Kampüs!'), '#Kampüs');
  assert.equal(cleanTag('vize-haftası'), '#vizehaftası');
  assert.equal(cleanTag('  '), '');
});

test('8.15 setler: kaydet, temizle, tekrarı at, boşları çıkar; yasaklı kelime; başka marka', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Setli' })).data.brand;
    const url = `/api/brands/${b.id}/caption-sets`;
    assert.deepEqual((await s.request('GET', url)).data.sets, { hashtagGroups: [], signatures: [] });
    const saved = (await s.request('PUT', url, {
      hashtagGroups: [{ name: 'Kampüs', tags: '#kampus kahve, #Kampus vize-haftasi' }, { name: '', tags: '#bos' }, { name: 'Boş', tags: '' }],
      signatures: [{ name: 'Kapanış', text: 'Bio\'daki linkten menüye bak ☕' }, { name: 'Eksik', text: '' }]
    })).data.sets;
    assert.equal(saved.hashtagGroups.length, 1);
    assert.deepEqual(saved.hashtagGroups[0].tags, ['#kampus', '#kahve', '#Kampus', '#vizehaftasi']);
    assert.ok(saved.hashtagGroups[0].id);
    assert.equal(saved.signatures.length, 1);
    assert.deepEqual((await s.request('GET', url)).data.sets, saved);
    // Kimlik korunur (yeniden kaydetmede aynı id)
    const again = (await s.request('PUT', url, saved)).data.sets;
    assert.equal(again.hashtagGroups[0].id, saved.hashtagGroups[0].id);
    // Yasaklı kelime
    await s.request('PUT', `/api/brands/${b.id}/memory`, { banned: ['ucuz'], preferred: [] });
    const bad = await s.request('PUT', url, { hashtagGroups: [{ name: 'İndirim', tags: '#ucuzkahve' }], signatures: [] });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error.message, /Yasaklı kelime geçiyor: ucuz/);
    assert.equal((await s.request('PUT', url, { hashtagGroups: [], signatures: [{ name: 'X', text: 'Çok UCUZ fiyat' }] })).status, 400, 'büyük/küçük harf duyarsız');
    assert.deepEqual((await s.request('GET', url)).data.sets, again, 'reddedilen kayıt eskisini bozmaz');
    // Sınır: 30 etiket
    const many = (await s.request('PUT', url, { hashtagGroups: [{ name: 'Çok', tags: Array.from({ length: 40 }, (_, i) => `#t${i}`) }] })).data.sets;
    assert.equal(many.hashtagGroups[0].tags.length, 30);
    assert.equal((await s.request('GET', '/api/brands/yok/caption-sets')).status, 404);
  } finally { await s.stop(); }
});
