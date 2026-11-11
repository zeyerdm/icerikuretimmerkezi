// Toplu testler: T.6 varlık paketleri, T.7 paylaşım sonuçları, T.8 içerik kartı (sunucu tarafı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, PNG_1PX } from './helpers.js';
import { writeZip } from '../server/lib/zip.js';
import { engagementRate } from '../server/services/workspace.js';

const brand = async (s, name) => (await s.request('POST', '/api/brands', { name })).data.brand;
const zipHeaders = { 'Content-Type': 'application/zip' };

test('T.6 varlık paketleri: ZIP içe aktarma, klasör → etiket, atlanan dosyalar, liste ve silme, marka izolasyonu', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Paket A');
    const b = await brand(s, 'Paket B');
    const zip = writeZip([
      { name: 'yuzler/mutlu_kahve-1.png', data: PNG_1PX },
      { name: 'yuzler/uzgun.png', data: PNG_1PX },
      { name: 'dans.png', data: PNG_1PX },
      { name: '__MACOSX/yuzler/._mutlu.png', data: PNG_1PX },
      { name: '.gizli.png', data: PNG_1PX },
      { name: 'oku-beni.txt', data: Buffer.from('metin') },
      { name: 'bozuk.png', data: Buffer.from('png değil') }
    ]);
    const url = `/api/brands/${a.id}/asset-packs`;
    const r = await s.request('POST', `${url}?pack=Kahve%20Yüzleri&category=sticker`, zip, zipHeaders);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.added.length, 3);
    // 4 atlanan: __MACOSX, gizli, txt, bozuk görsel
    assert.equal(r.data.skipped, 4);
    const happy = r.data.added.find(x => x.label === 'mutlu kahve 1');
    assert.ok(happy, 'alt çizgi ve tire boşluğa çevrilmeli');
    assert.match(JSON.stringify(happy.tags), /yuzler/, 'klasör adı etikete girmeli');
    assert.ok(r.data.added.every(x => x.pack === 'Kahve Yüzleri' && x.category === 'sticker'));

    // Paketsiz, kategorisiz, görselsiz ve bozuk arşiv reddedilir
    assert.equal((await s.request('POST', `${url}?category=sticker`, zip, zipHeaders)).status, 400);
    assert.equal((await s.request('POST', `${url}?pack=x&category=yok`, zip, zipHeaders)).status, 400);
    assert.equal((await s.request('POST', `${url}?pack=x`, writeZip([{ name: 'a.txt', data: Buffer.from('a') }]), zipHeaders)).status, 400);
    assert.equal((await s.request('POST', `${url}?pack=x`, Buffer.from('zip değil'), zipHeaders)).status, 400);
    // 200 görsel sınırı
    const many = writeZip(Array.from({ length: 201 }, (_, i) => ({ name: `g${i}.png`, data: PNG_1PX })));
    assert.equal((await s.request('POST', `${url}?pack=Büyük`, many, zipHeaders)).status, 400);

    // Tek tek yüklemede paket adı
    await s.request('POST', `/api/brands/${a.id}/assets?category=sticker&pack=Kahve%20Yüzleri&label=Ek`, PNG_1PX, { 'Content-Type': 'image/png' });
    const packs = (await s.request('GET', url)).data.packs;
    assert.deepEqual(packs, [{ name: 'Kahve Yüzleri', category: 'sticker', count: 4 }]);
    // Başka marka bu paketi göremez ve silemez
    assert.deepEqual((await s.request('GET', `/api/brands/${b.id}/asset-packs`)).data.packs, []);
    assert.equal((await s.request('DELETE', `/api/brands/${b.id}/asset-packs?pack=Kahve%20Yüzleri`)).status, 404);

    // Silince dosyalar diskten de silinir
    const files = () => { const dir = path.join(s.dataDir, 'uploads', a.id); return fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter(f => /\.\w+$/.test(f)) : []; };
    assert.ok(files().length >= 4);
    const del = await s.request('DELETE', `${url}?pack=Kahve%20Yüzleri`);
    assert.equal(del.data.removed, 4);
    assert.equal(files().length, 0);
    assert.deepEqual((await s.request('GET', `/api/brands/${a.id}/assets`)).data.assets, []);
  } finally { await s.stop(); }
});

test('T.7 paylaşım sonuçları: doğrulama, etkileşim oranı, giriş zamanı, performans özeti, marka ayrımı', async () => {
  assert.equal(engagementRate({ views: 1000, likes: 50, comments: 10, saves: 5, shares: 2 }), 7.6); // (50 + 10 + 2×5 + 3×2) / 1000
  assert.equal(engagementRate({ likes: 5 }), null);
  assert.equal(engagementRate(null), null);

  const s = await startServer();
  try {
    const a = await brand(s, 'Sonuç A');
    const b = await brand(s, 'Sonuç B');
    const mk = async (brandId, title, type, theme, hook) => (await s.request('POST', '/api/contents', { brandId, title, type, scheduledAt: new Date().toISOString() })).data.content.id
      && (await s.request('GET', '/api/contents')).data.contents.find(c => c.title === title).id;
    const r1 = await mk(a.id, 'Reels 1', 'reels');
    const p1 = await mk(a.id, 'Post 1', 'post');
    const other = await mk(b.id, 'B içeriği', 'post');
    const patch = (id, body) => s.request('PATCH', `/api/contents/${id}`, body);

    assert.equal((await patch(r1, { metrics: { views: -1 } })).status, 400);
    assert.equal((await patch(r1, { metrics: { views: 'çok' } })).status, 400);
    assert.equal((await patch(r1, { metrics: 'metin' })).status, 400);

    const m1 = (await patch(r1, { metrics: { views: 1000, likes: 80, comments: 10, saves: 5, shares: 3, reach: '' }, theme: 'Eğitici', hook: 'Bunu kimse bilmiyor' })).data.content;
    assert.equal(m1.rate, 10.9); // (80 + 10 + 10 + 9) / 1000
    assert.equal(m1.metrics.reach, undefined, 'boş alan kaydedilmez');
    const at = m1.metrics.at;
    assert.ok(at);
    // Sayılar değişmezse giriş zamanı korunur, değişirse yenilenir
    await new Promise(r => setTimeout(r, 15));
    const same = (await patch(r1, { metrics: { views: 1000, likes: 80, comments: 10, saves: 5, shares: 3 } })).data.content;
    assert.equal(same.metrics.at, at);
    const changed = (await patch(r1, { metrics: { views: 1000, likes: 91, comments: 10, saves: 5, shares: 3 } })).data.content;
    assert.notEqual(changed.metrics.at, at);
    assert.equal(changed.rate, 12);

    await patch(p1, { metrics: { views: 1000, likes: 20 }, theme: 'Kampanya' });
    await patch(other, { metrics: { views: 10, likes: 9 } });

    const perf = (await s.request('GET', `/api/performance?brandId=${a.id}`)).data;
    assert.equal(perf.count, 2, 'başka markanın verisi gelmemeli');
    assert.equal(perf.totals.views, 2000);
    assert.equal(perf.averageRate, 7);
    assert.deepEqual(perf.top.map(c => c.title), ['Reels 1', 'Post 1']);
    assert.deepEqual(perf.byType.map(g => [g.key, g.rate]), [['reels', 12], ['post', 2]]);
    assert.deepEqual(perf.byTheme.map(g => g.key), ['Eğitici', 'Kampanya']);
    assert.equal(perf.hooks[0].hook, 'Bunu kimse bilmiyor');
    assert.equal((await s.request('GET', '/api/performance')).data.count, 3);

    // Sonuçları temizleme
    const cleared = (await patch(p1, { metrics: {} })).data.content;
    assert.equal(cleared.metrics, null);
  } finally { await s.stop(); }
});

test('T.8 içerik kartı: türe göre yapılacaklar, liste doğrulaması, hashtag temizleme, açıklama', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Kart');
    const create = async (type, extra = {}) => (await s.request('POST', '/api/contents', Object.assign({ brandId: a.id, title: 'Kart ' + type, type }, extra))).data.content;
    const reels = await create('reels');
    assert.deepEqual(reels.checklist.map(i => i.label), ['Senaryo', 'Çekim', 'Kurgu', 'Kapak', 'Açıklama']);
    assert.ok(reels.checklist.every(i => i.done === false));
    assert.deepEqual((await create('reklam')).checklist.map(i => i.label), ['Metin', 'Tasarım', 'Hedef kitle ve bütçe', 'Onay']);

    const patch = body => s.request('PATCH', `/api/contents/${reels.id}`, body);
    // En çok 15 adım, boş adım atlanır, 60 karakter
    const long = Array.from({ length: 20 }, (_, i) => ({ label: i === 1 ? '   ' : `Adım ${i} ${'x'.repeat(i === 0 ? 80 : 0)}`, done: i === 0 }));
    const c1 = (await patch({ checklist: long })).data.content;
    assert.equal(c1.checklist.length, 14, '15 adım alınır, biri boş olduğu için atlanır');
    assert.equal(c1.checklist[0].label.length, 60);
    assert.equal(c1.checklist[0].done, true);
    assert.equal((await patch({ checklist: 'liste değil' })).status, 400);

    // Hashtag temizleme: # eklenir, tekrarlı # ve virgül/boşluk ayırıcıları
    const c2 = (await patch({ hashtags: 'kahve, ##sabah  #latte', caption: 'Günaydın!', firstComment: 'İlk yorum' })).data.content;
    assert.deepEqual(c2.hashtags, ['#kahve', '#sabah', '#latte']);
    assert.equal(c2.caption, 'Günaydın!');
    assert.equal(c2.firstComment, 'İlk yorum');
    const c3 = (await patch({ hashtags: Array.from({ length: 40 }, (_, i) => 'tag' + i) })).data.content;
    assert.equal(c3.hashtags.length, 30);

    // Takvime eklerken açıklama ve hashtag'ler geçer
    const withCaption = await create('post', { caption: 'Yeni menü burada', hashtags: ['menu', '#yeni'] });
    assert.equal(withCaption.caption, 'Yeni menü burada');
    assert.deepEqual(withCaption.hashtags, ['#menu', '#yeni']);
    // Onay bekliyor durumu tamamlanmış sayılmaz (T.25)
    const onay = (await patch({ status: 'onay' })).data.content;
    assert.equal(onay.status, 'onay');
    assert.equal(onay.done, false);
  } finally { await s.stop(); }
});
