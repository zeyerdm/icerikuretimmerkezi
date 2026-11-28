// Sektör kaynakları: RSS/HTML kaynaklardan güncel başlık ve özet çekme, post üretim istemine bağlam olarak girme, marka izolasyonu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

test('Sektör kaynakları: RSS/HTML içerikleri çekilir, tekrarlanmaz ve post üretimine bilgi kaynağı olarak girer', async () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>Teknoloji Blogu</title>
      <item><title>PostgreSQL indeks optimizasyonu ile sorguları hızlandırma</title><link>https://kaynak.example/pg-index</link><description>B-Tree ve GIN indekslerinin doğru kullanımı sorgu süresini %80 düşürür.</description></item>
      <item><title>API önbellekleme stratejileri</title><link>https://kaynak.example/cache</link><description>ETag ve Redis ile gereksiz veritabanı yükünü azaltma yöntemleri.</description></item>
    </channel></rss>`;
  const siteFetch = async url => new Response(rss, { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8' } });
  const provider = fakeProvider([{
    title: 'PostgreSQL İndeks Rehberi',
    caption: 'Açıklama',
    hashtags: ['#sql'],
    slides: [
      { title: 'Sorguların Neden *Yavaş?*', body: 'Doğru indeksle süreyi %80 düşür.' },
      { title: 'B-Tree ve GIN *Farkı*', body: 'Tam metin aramalarında GIN, eşitlikte B-Tree kullan.' },
      { title: 'Hemen *Dene*', body: 'EXPLAIN ANALYZE ile kontrol et.' }
    ]
  }]);
  const s = await startServer({ aiProvider: provider, siteFetch, siteAllowPrivate: true });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'DevOrtak' })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;

    const added = await s.request('POST', `/api/brands/${a.id}/sources`, { url: 'https://kaynak.example/rss.xml', label: 'Teknoloji Blogu' });
    assert.equal(added.status, 201);
    const src = added.data.source;

    const fetched = await s.request('POST', `/api/brands/${a.id}/sources/${src.id}/fetch`, {});
    assert.equal(fetched.status, 200);
    assert.equal(fetched.data.added, 2);
    // Aynı başlıklar ikinci çekmede tekrar eklenmez
    const fetched2 = await s.request('POST', `/api/brands/${a.id}/sources/${src.id}/fetch`, {});
    assert.equal(fetched2.data.added, 0);

    const listA = (await s.request('GET', `/api/brands/${a.id}/sources`)).data;
    assert.equal(listA.items.length, 2);
    // Diğer markada görünmez
    assert.equal((await s.request('GET', `/api/brands/${b.id}/sources`)).data.items.length, 0);

    // Post üretiminde çekilen güncel kaynak bilgileri isteme girer
    const postRes = await s.request('POST', `/api/brands/${a.id}/posts`, { topic: 'PostgreSQL sorgu performansı', kind: 'carousel', slides: 3 });
    assert.equal(postRes.status, 201);
    assert.match(provider.calls[0].prompt, /SEKTÖR KAYNAKLARINDAN GÜNCEL BİLGİLER/);
    assert.match(provider.calls[0].prompt, /B-Tree ve GIN indekslerinin doğru kullanımı/);

    assert.equal((await s.request('DELETE', `/api/brands/${a.id}/sources/${src.id}`)).status, 204);
    assert.equal((await s.request('GET', `/api/brands/${a.id}/sources`)).data.items.length, 0);
  } finally { await s.stop(); }
});
