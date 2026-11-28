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
  const articleHtml = `<!doctype html><html><head><title>PostgreSQL İndeks Optimizasyonu</title></head><body><article><h1>PostgreSQL İndeks Optimizasyonu</h1><p>EXPLAIN ANALYZE çıktısında Seq Scan görüyorsanız ve tablo 100 bin satırı geçtiyse CONCURRENTLY ile B-Tree indeks eklemek kilitlenmeyi önler.</p></article></body></html>`;
  const siteFetch = async url => new Response(String(url).includes('/pg-index') ? articleHtml : rss, { status: 200, headers: { 'content-type': String(url).includes('/pg-index') ? 'text/html; charset=utf-8' : 'application/xml; charset=utf-8' } });
  const provider = fakeProvider([{
    title: 'PostgreSQL İndeks Rehberi',
    caption: 'Açıklama',
    hashtags: ['#sql'],
    slides: [
      { title: 'Sorguların Neden *Yavaş?*', body: 'Doğru indeksle süreyi %80 düşür.' },
      { title: 'B-Tree ve GIN *Farkı*', body: 'Tam metin aramalarında GIN, eşitlikte B-Tree kullan.' },
      { title: 'Hemen *Dene*', body: 'EXPLAIN ANALYZE ile kontrol et.' }
    ]
  }, { reply: 'Kaynaklardan fikirler ürettim.', actions: [] }]);
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
    // Her kaynaktan günde 1 yeni fikir İçerik fikirleri havuzuna eklenir
    const ideasA = (await s.request('GET', `/api/brands/${a.id}/ideas`)).data.ideas;
    assert.equal(ideasA.filter(i => i.source === `kaynak:${src.id}`).length, 1);
    assert.ok(ideasA.some(i => i.title.includes('PostgreSQL indeks') && i.category === 'guncel'));
    // Diğer markada görünmez
    assert.equal((await s.request('GET', `/api/brands/${b.id}/sources`)).data.items.length, 0);

    // Post üretiminde çekilen güncel kaynak bilgileri ve makalenin tam içeriği isteme girer
    const postRes = await s.request('POST', `/api/brands/${a.id}/posts`, { topic: 'PostgreSQL sorgu performansı', kind: 'carousel', slides: 3 });
    assert.equal(postRes.status, 201);
    assert.match(provider.calls[0].prompt, /SEKTÖR KAYNAKLARINDAN GÜNCEL BİLGİLER/);
    assert.match(provider.calls[0].prompt, /B-Tree ve GIN indekslerinin doğru kullanımı/);
    assert.match(provider.calls[0].prompt, /CONCURRENTLY ile B-Tree indeks eklemek kilitlenmeyi önler/);

    // Asistandan fikir istendiğinde de kayıtlı kaynaklardaki güncel bilgiler isteme girer
    const chatRes = await s.request('POST', `/api/brands/${a.id}/chat`, { message: 'Sektör kaynaklarından PostgreSQL için fikir üret' });
    assert.equal(chatRes.status, 200);
    assert.match(provider.calls[1].prompt, /SEKTÖR KAYNAKLARINDAN GÜNCEL BİLGİLER/);
    assert.match(provider.calls[1].prompt, /CONCURRENTLY ile B-Tree indeks eklemek kilitlenmeyi önler/);

    assert.equal((await s.request('DELETE', `/api/brands/${a.id}/sources/${src.id}`)).status, 204);
    assert.equal((await s.request('GET', `/api/brands/${a.id}/sources`)).data.items.length, 0);
  } finally { await s.stop(); }
});
