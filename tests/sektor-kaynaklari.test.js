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
    const dup = await s.request('POST', `/api/brands/${a.id}/sources`, { url: 'http://www.kaynak.example/rss.xml' });
    assert.equal(dup.status, 400);
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
    assert.equal(ideasA.filter(i => i.source === 'kaynak').length, 1);
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

test('Sektör kaynakları: HTML menü/slogan gürültüsü atlanır, gerçek makale ve RSS keşfi çalışır', async () => {
  const htmlSite = `<!doctype html><html><head><title>Örnek Teknoloji</title></head><body>
    <header><nav><a href="#main">Skip to main content Research</a><a href="/tech">Teknoloji Haberleri</a><a href="/apps">Uygulama / Yazılım</a></nav></header>
    <main>
      <p>Insights içeriklerine göz atın.</p>
      <p>Teknoloji dünyasından önemli gelişmeleri yakından takip edin.</p>
      <a href="/mac">Mac / iMac / Macbook / Mac Mini</a>
      <a href="/foundation">Foundation (opens in a new window)</a>
      <a href="/sartlar">- İçerik Kullanım Şartları</a>
      <h2>Güncel Teknoloji Haberleri ve Rehberler</h2>
      <article><h2><a href="/yapay-zeka-kod-asistani">Yapay Zekâ Kod Asistanlarında Yeni Verimlilik Ölçütleri</a></h2><p>Geliştirici ekiplerin kod inceleme süresini %40 azaltan yeni nesil araçlar karşılaştırıldı.</p></article>
    </main></body></html>`;
  const siteWithRss = `<!doctype html><html><head><title>Blog</title><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body><nav>Ana Sayfa</nav></body></html>`;
  const rssFeed = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title><item><title>Node.js 24 ile Yerel Test Koşucusu İpuçları</title><link>https://blog.example/node-24</link><description>Harici paket kurmadan hızlı birim testi yazma yöntemleri.</description></item></channel></rss>`;
  const siteFetch = async url => {
    const u = String(url);
    if (u.includes('blog.example/feed.xml')) return new Response(rssFeed, { status: 200, headers: { 'content-type': 'application/xml' } });
    if (u.includes('blog.example')) return new Response(siteWithRss, { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response(htmlSite, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const s = await startServer({ aiProvider: fakeProvider([]), siteFetch, siteAllowPrivate: true });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'DevOrtak' })).data.brand;
    const s1 = (await s.request('POST', `/api/brands/${b.id}/sources`, { url: 'https://haber.example', label: 'haber.example' })).data.source;
    const s2 = (await s.request('POST', `/api/brands/${b.id}/sources`, { url: 'https://blog.example', label: 'blog.example' })).data.source;
    await s.request('POST', `/api/brands/${b.id}/sources/fetch-all`, {});
    const ideas = (await s.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas.filter(i => i.source === 'kaynak');
    assert.equal(ideas.length, 2);
    assert.ok(ideas.some(i => i.title.includes('Yapay Zekâ Kod Asistanlarında')));
    assert.ok(ideas.some(i => i.title.includes('Node.js 24 ile Yerel Test')));
    assert.ok(!ideas.some(i => /Skip to main|Teknoloji Haberleri|göz atın|takip edin|Uygulama/i.test(i.title)));
    void s1; void s2;
  } finally { await s.stop(); }
});
