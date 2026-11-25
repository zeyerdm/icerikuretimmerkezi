// O3 · Ölçülebilir hedefler ve içerik sütunları: hedef/gerçekleşen, sütun payı, içeriğe atama, takvim filtreleri, uyarı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const month = new Date().toISOString().slice(0, 7);
const at = day => `${month}-${String(day).padStart(2, '0')}T10:00:00.000Z`;

test('Hedefler ve sütunlar: hedef kaydı, otomatik gerçekleşen, sütun payı sınırı, içerik ataması ve filtreler', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Hedefli' })).data.brand;
    const base = `/api/brands/${b.id}`;
    // Sütunlar: toplam pay %100'ü geçemez, aynı ad iki kez açılmaz
    const egit = (await s.request('POST', `${base}/pillars`, { name: 'Eğitici', share: 60 })).data.pillar;
    const urun = (await s.request('POST', `${base}/pillars`, { name: 'Ürün', share: 30 })).data.pillar;
    assert.equal((await s.request('POST', `${base}/pillars`, { name: 'Kampanya', share: 20 })).status, 400, 'toplam %110 olamaz');
    assert.equal((await s.request('POST', `${base}/pillars`, { name: 'eğitici', share: 5 })).status, 400, 'aynı ad');
    assert.equal((await s.request('PATCH', `${base}/pillars/${urun.id}`, { share: 40 })).status, 200);
    // Hedefler: aynı ay ve tür ikinci kez açılmaz, güncellenir; satış elle, erişim kendiliğinden
    const g1 = (await s.request('POST', `${base}/goals`, { kind: 'erisim', month, target: 1000 })).data.goal;
    const g2 = (await s.request('POST', `${base}/goals`, { kind: 'erisim', month, target: 2000 })).data.goal;
    assert.equal(g1.id, g2.id); assert.equal(g2.target, 2000);
    await s.request('POST', `${base}/goals`, { kind: 'satis', month, target: 50, actual: 20 });
    await s.request('POST', `${base}/goals`, { kind: 'etkilesim', month, target: 5 });
    assert.equal((await s.request('POST', `${base}/goals`, { kind: 'etkilesim', month, target: 500 })).status, 400);
    assert.equal((await s.request('POST', `${base}/goals`, { kind: 'uydurma', month, target: 5 })).status, 400);
    // İçerikler: sütun, amaç, kitle, kanal
    const mk = async (body) => (await s.request('POST', '/api/contents', Object.assign({ brandId: b.id, type: 'post', status: 'yayinlandi' }, body))).data.content;
    const c1 = await mk({ title: 'Nasıl yapılır', scheduledAt: at(3), pillarId: egit.id, purpose: 'egitim', audience: 'Öğrenciler' });
    const c2 = await mk({ title: 'Yeni ürün', scheduledAt: at(4), pillarId: urun.id, purpose: 'satis', platform: 'tiktok' });
    const c3 = await mk({ title: 'YouTube bölümü', type: 'youtube', scheduledAt: at(5) });
    assert.equal(c1.pillarName, 'Eğitici'); assert.equal(c1.purposeLabel, 'Bilgilendirme'); assert.equal(c1.platform, 'instagram', 'kanal türden çıkarılır');
    assert.equal(c2.platform, 'tiktok'); assert.equal(c3.platform, 'youtube'); assert.equal(c3.platformSet, false);
    // Başka markanın sütunu atanamaz
    const other = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    const op = (await s.request('POST', `/api/brands/${other.id}/pillars`, { name: 'Yabancı' })).data.pillar;
    assert.equal((await s.request('PATCH', `/api/contents/${c3.id}`, { pillarId: op.id })).status, 400);
    assert.equal((await s.request('PATCH', `/api/contents/${c3.id}`, { purpose: 'olmayan' })).status, 400);
    // Sonuçlar: erişim ve etkileşim sonuçlardan hesaplanır
    await s.request('PATCH', `/api/contents/${c1.id}`, { metrics: { views: 1000, reach: 800, likes: 40, comments: 10 } });
    await s.request('PATCH', `/api/contents/${c2.id}`, { metrics: { views: 500, reach: 400, likes: 10, follows: 7 } });
    // Filtreler
    const list = async q => (await s.request('GET', `/api/contents?brandId=${b.id}&${q}`)).data.contents.map(c => c.title).sort();
    assert.deepEqual(await list('platform=instagram'), ['Nasıl yapılır']);
    assert.deepEqual(await list('platform=youtube'), ['YouTube bölümü']);
    assert.deepEqual(await list(`pillarId=${urun.id}`), ['Yeni ürün']);
    assert.deepEqual(await list('pillarId=yok'), ['YouTube bölümü']);
    assert.deepEqual(await list('purpose=egitim'), ['Nasıl yapılır']);
    assert.deepEqual(await list('audience=' + encodeURIComponent('öğrenciler')), ['Nasıl yapılır'], 'Türkçe büyük/küçük harf');
    // İlerleme
    const st = (await s.request('GET', `${base}/strategy?month=${month}`)).data;
    const g = k => st.progress.goals.find(x => x.kind === k);
    assert.equal(g('erisim').actual, 1200); assert.equal(g('erisim').percent, 60);
    assert.equal(g('satis').actual, 20); assert.equal(g('satis').percent, 40);
    assert.equal(g('etkilesim').actual, 3.5, 'c1 %5, c2 %2 ortalaması');
    assert.equal(st.progress.assigned, 2); assert.equal(st.progress.unassigned, 1);
    assert.deepEqual(st.progress.pillars.map(p => [p.name, p.count, p.actualShare]), [['Eğitici', 1, 50], ['Ürün', 1, 50]]);
    assert.equal(st.progress.byPlatform.length, 3);
    // Geçen aydan kopyala: var olana dokunmaz
    const next = new Date(); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
    const nm = next.toISOString().slice(0, 7);
    assert.equal((await s.request('POST', `${base}/goals/copy`, { from: month, to: nm })).data.copied, 3);
    assert.equal((await s.request('POST', `${base}/goals/copy`, { from: month, to: nm })).data.copied, 0);
    // Sütun silinince içerik silinmez, sütunsuz kalır
    await s.request('DELETE', `${base}/pillars/${egit.id}`);
    const after = (await s.request('GET', `/api/contents/${c1.id}`)).data.content;
    assert.equal(after.pillarId, null); assert.equal(after.title, 'Nasıl yapılır');
    // Marka değişince sütun bağı kopar
    await s.request('PATCH', `/api/contents/${c2.id}`, { brandId: other.id });
    assert.equal((await s.request('GET', `/api/contents/${c2.id}`)).data.content.pillarId, null);
    // Meta
    const meta = (await s.request('GET', '/api/meta')).data;
    assert.ok(meta.goalKinds.erisim && meta.purposes.egitim && meta.platforms.tiktok);
  } finally { await s.stop(); }
});

test('Uyarı: içerik sütunları hedef payın çok altında kalınca bildirim merkezinde görünür', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Dengesiz' })).data.brand;
    const base = `/api/brands/${b.id}`;
    const egit = (await s.request('POST', `${base}/pillars`, { name: 'Eğitici', share: 40 })).data.pillar;
    const urun = (await s.request('POST', `${base}/pillars`, { name: 'Ürün', share: 40 })).data.pillar;
    const day = n => new Date(Date.now() - n * 86400000).toISOString();
    for (let i = 0; i < 6; i++) await s.request('POST', '/api/contents', { brandId: b.id, title: `Ürün ${i}`, type: 'post', status: 'yayinlandi', scheduledAt: day(i + 1), pillarId: urun.id });
    let list = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    const ins = list.find(i => i.kind === 'sutun_dengesi');
    assert.ok(ins, 'sütun uyarısı var');
    assert.match(ins.text, /Eğitici: hedef %40, son 30 gün %0/);
    assert.doesNotMatch(ins.text, /Ürün:/);
    // Dengelenince kalkar
    for (let i = 0; i < 5; i++) await s.request('POST', '/api/contents', { brandId: b.id, title: `Eğitim ${i}`, type: 'post', status: 'yayinlandi', scheduledAt: day(i + 1), pillarId: egit.id });
    list = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    assert.ok(!list.some(i => i.kind === 'sutun_dengesi'));
  } finally { await s.stop(); }
});
