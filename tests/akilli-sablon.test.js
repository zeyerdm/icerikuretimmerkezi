// Akıllı şablon sistemi: alan kimlikleri, şablon versiyonları ve paketleri, kullanım izleme, marka tasarım kilidi,
// toplu üretim kuyruğu (çift üretim engeli, hata ve yeniden deneme, durdur/devam), tür seçilmeden referans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

const T = (id, text, extra = {}) => Object.assign({ id, type: 'text', role: 'title', text, x: 90, y: 100, w: 800, size: 80, color: '#111111', font: 'Inter', weight: 800, align: 'left' }, extra);
const slidesOut = n => ({ title: 'Kahve', caption: 'c', hashtags: ['#a'], slides: Array.from({ length: n }, (_, i) => ({ title: `Başlık ${i + 1}`, body: `Gövde ${i + 1}`, fields: { FIYAT: '99 TL' } })) });

test('Şablon versiyonları: güncelle → V2, eski sürüm saklanır, geri yüklenir; paket ve kullanım', async () => {
  const s = await startServer({ aiProvider: fakeProvider([slidesOut(1)]) });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Versiyon' })).data.brand;
    const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Ş', kind: 'post' })).data.post;
    const put = layers => s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#ffffff', layers }] } });
    await put([T('t1', 'Başlık', { field: 'MAIN_TITLE' }), T('t2', 'Fiyat', { role: 'custom', field: 'FIYAT', name: 'Fiyat', y: 600 }), T('t3', 'Sabit', { role: 'text', fixed: true, y: 900 })]);
    let r = await s.request('POST', `/api/brands/${b.id}/posts/${post.id}/template`, { name: 'Kampanya', pack: 'Bahar' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const tpl = r.data.template;
    assert.equal(tpl.version, 1); assert.equal(tpl.pack, 'Bahar');
    await put([T('t1', 'Yeni başlık', { field: 'MAIN_TITLE', color: '#ff0000' })]);
    r = await s.request('POST', `/api/brands/${b.id}/post-templates/${tpl.id}/update-from/${post.id}`, { note: 'Kırmızı' });
    assert.equal(r.data.template.version, 2);
    const vs = (await s.request('GET', `/api/brands/${b.id}/post-templates/${tpl.id}/versions`)).data.versions;
    assert.deepEqual(vs.map(v => v.version), [2, 1]);
    assert.equal(vs.find(v => v.version === 1).data.slides[0].layers.length, 3, 'eski sürüm saklandı');
    r = await s.request('POST', `/api/brands/${b.id}/post-templates/${tpl.id}/restore`, { version: 1 });
    assert.ok(r.data.template.version >= 3, 'geri yükleme yeni sürüm olur');
    assert.equal(r.data.template.data.slides[0].layers.length, 3);
    r = await s.request('PUT', `/api/brands/${b.id}/post-templates/${tpl.id}/pack`, { pack: 'Yaz' });
    assert.equal(r.data.template.pack, 'Yaz');
    // Şablonla üretim: sabit katman korunur, özel alan dolar, şablon sürümü kayda yazılır, kullanım listelenir
    r = await s.request('POST', `/api/brands/${b.id}/posts`, { topic: 'Kahve', kind: 'post', templateId: tpl.id });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const L = r.data.post.data.slides[0].layers;
    assert.ok(L.some(l => l.text === 'Sabit'), 'sabit katman değişmez');
    assert.equal(L.find(l => l.field === 'FIYAT').text, '99 TL');
    assert.ok(r.data.post.data.template.version >= 3, 'üretimde şablonun güncel sürümü kayda yazılır');
    const usage = (await s.request('GET', `/api/brands/${b.id}/post-templates/${tpl.id}/usage`)).data.posts;
    assert.equal(usage.length, 1);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/post-templates/yok/versions`)).status, 404);
  } finally { await s.stop(); }
});

test('Marka tasarım kilidi: alanlar sınırlanır, politika doğrulanır, markayla döner', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kilit' })).data.brand;
    const r = await s.request('PUT', `/api/brands/${b.id}/design-lock`, { colors: 1, fonts: true, margin: 9999, titleMin: 40, titleMax: 120, policy: 'yasak', notes: 'x'.repeat(2000) });
    assert.equal(r.status, 200);
    const d = r.data.designLock;
    assert.equal(d.colors, true); assert.equal(d.fonts, true); assert.equal(d.logo, false);
    assert.equal(d.margin, 300); assert.equal(d.titleMin, 40); assert.equal(d.policy, 'warn'); assert.equal(d.notes.length, 1500);
    const got = (await s.request('GET', `/api/brands/${b.id}`)).data.brand;
    assert.equal(got.designLock.titleMax, 120);
  } finally { await s.stop(); }
});

test('Toplu üretim kuyruğu: her fikir ayrı post, çift üretim engeli, hata iki denemeden sonra kalır, yeniden işlenir', async () => {
  // Sıra: 1. ve 2. iş başarılı, 3. iş iki denemede de hata (3. ve 4. çağrı); yeniden işlemede başarılı
  let n = 0;
  const provider = fakeProvider([() => { n++; if (n === 3 || n === 4) throw new Error('model hatası'); return slidesOut(1); }]);
  const s = await startServer({ aiProvider: provider, queueAutostart: true });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kuyruk' })).data.brand;
    const ids = [];
    for (const t of ['Kahve rehberi', 'Çay rehberi', 'Bozuk fikir']) ids.push((await s.request('POST', `/api/brands/${b.id}/ideas`, { title: t, format: 'post', category: 'egitici' })).data.idea.id);
    let r = await s.request('POST', `/api/brands/${b.id}/gen-batches`, { ideaIds: [...ids, ids[0]] });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.added.length, 3, 'aynı fikir bir kez');
    const batch = r.data.batchId;
    const jobs = async () => (await s.request('GET', `/api/brands/${b.id}/gen-jobs?batch=${batch}`)).data.jobs;
    let list = [];
    for (let i = 0; i < 100; i++) { list = await jobs(); if (list.every(j => ['tamamlandi', 'hata'].includes(j.status))) break; await new Promise(r2 => setTimeout(r2, 50)); }
    assert.equal(list.filter(j => j.status === 'tamamlandi').length, 2, JSON.stringify(list.map(j => [j.ideaTitle, j.status, j.error])));
    const bad = list.find(j => j.status === 'hata');
    assert.equal(bad.attempts, 2); assert.match(bad.error, /model hatası/); assert.equal(bad.statusLabel, 'Hata oluştu');
    assert.ok(new Set(list.filter(j => j.postId).map(j => j.postId)).size === 2, 'her fikir ayrı post');
    // Tekrar kuyruğa almak: tamamlanmış fikir atlanır
    r = await s.request('POST', `/api/brands/${b.id}/gen-batches`, { ideaIds: [ids[0]] });
    assert.equal(r.status, 201); assert.equal(r.data.added.length, 0); assert.equal(r.data.skipped[0].reason, 'Daha önce üretildi');
    // Hata alan işi yeniden işle
    r = await s.request('POST', `/api/brands/${b.id}/gen-jobs/${bad.id}/retry`);
    assert.equal(r.status, 200);
    for (let i = 0; i < 100; i++) { list = await jobs(); if (list.every(j => j.status === 'tamamlandi')) break; await new Promise(r2 => setTimeout(r2, 50)); }
    assert.ok(list.every(j => j.status === 'tamamlandi'));
    assert.equal((await s.request('POST', `/api/brands/${b.id}/gen-jobs/${bad.id}/retry`)).status, 400, 'tamamlanan iş yeniden işlenmez');
    assert.equal((await s.request('POST', `/api/brands/${b.id}/gen-batches`, { ideaIds: [] , category: 'yok' })).status, 400);
  } finally { await s.stop(); }
});

test('Toplu üretim kuyruğu: durdur, devam ettir, iptal', async () => {
  const s = await startServer({ aiProvider: fakeProvider([slidesOut(1)]), queueAutostart: false });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Durdur' })).data.brand;
    const ids = [];
    for (const t of ['A fikri', 'B fikri']) ids.push((await s.request('POST', `/api/brands/${b.id}/ideas`, { title: t, format: 'post', category: 'egitici' })).data.idea.id);
    const { batchId } = (await s.request('POST', `/api/brands/${b.id}/gen-batches`, { ideaIds: ids })).data;
    let r = await s.request('POST', `/api/brands/${b.id}/gen-batches/${batchId}/pause`);
    assert.equal(r.data.changed, 2);
    let jobs = (await s.request('GET', `/api/brands/${b.id}/gen-jobs?batch=${batchId}`)).data.jobs;
    assert.ok(jobs.every(j => j.status === 'durduruldu'));
    r = await s.request('POST', `/api/brands/${b.id}/gen-batches/${batchId}/resume`);
    assert.equal(r.data.changed, 2);
    await s.request('POST', `/api/brands/${b.id}/gen-batches/${batchId}/pause`);
    r = await s.request('POST', `/api/brands/${b.id}/gen-batches/${batchId}/cancel`);
    assert.equal(r.data.removed, 2);
    jobs = (await s.request('GET', `/api/brands/${b.id}/gen-jobs?batch=${batchId}`)).data.jobs;
    assert.equal(jobs.length, 0);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/gen-batches/${batchId}/uc`)).status, 404);
  } finally { await s.stop(); }
});
