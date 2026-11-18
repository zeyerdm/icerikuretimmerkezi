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

test('Aylık performans: içerik ve metrik girişi, AI önerisi, fikir havuzuna onaylı uygulama, odak marka hafızasına girer', async () => {
  const provider = fakeProvider([p => (/AYLIK PERFORMANS/.test(p) ? null : { changes: [] }) || ({ summary: 'Eğitici Reels tuttu.', worked: ['Kısa ipucu'], weak: [], focus: ['Haftada 2 eğitici Reels'], design: ['Kapakta büyük başlık'], formats: [],
    ideas: { add: [{ title: 'Git ipuçları serisi', description: 'd', format: 'reels', category: 'egitici', why: 'tuttu' }], revise: [{ id: (p.match(/\[([0-9a-f-]{36})\] Eski fikir/) || [])[1], title: 'Yeni başlık' }], archive: [{ id: 'yok', why: 'x' }] } })]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Perf' })).data.brand;
    const old = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Eski fikir', category: 'egitici' })).data.idea;
    assert.equal((await s.request('POST', `/api/brands/${b.id}/perf/2026-11/analyze`, {})).status, 400, 'kayıt yokken analiz yok');
    let r = await s.request('POST', `/api/brands/${b.id}/perf/2026-11/entries`, { title: 'Kod ipucu Reels', kind: 'reels', metrics: { views: 12000, likes: 900, comments: 40, saves: 300, shares: 60, bad: 5 }, url: 'https://x.com/p' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.entry.rate, 10.8); assert.equal(r.data.entry.metrics.bad, undefined);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/perf/2026-11/entries`, { title: 'x', url: 'javascript:1' })).status, 400);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/perf/2026-13`)).status, 400);
    r = await s.request('POST', `/api/brands/${b.id}/perf/2026-11/analyze`, {});
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const rep = r.data.report;
    assert.deepEqual(rep.focus, ['Haftada 2 eğitici Reels']);
    assert.equal(rep.ideas.revise[0].id, old.id); assert.equal(rep.ideas.archive.length, 0, 'havuzda olmayan id atılır');
    r = await s.request('POST', `/api/brands/${b.id}/perf/2026-11/apply`, { add: [0], revise: [old.id] });
    assert.deepEqual(r.data.done.add, ['Git ipuçları serisi']); assert.deepEqual(r.data.done.revise, ['Yeni başlık']);
    r = await s.request('POST', `/api/brands/${b.id}/perf/2026-11/apply`, { add: [0] });
    assert.equal(r.data.done.add.length, 0, 'aynı öneri iki kez uygulanmaz');
    const pool = (await s.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas.map(i => i.title);
    assert.ok(pool.includes('Git ipuçları serisi') && pool.includes('Yeni başlık'));
    // Odak açıkken sonraki üretimlerin istemine marka hafızasıyla girer; kapatınca girmez
    const edit = () => s.request('POST', `/api/brands/${b.id}/posts/ai-edit`, { command: 'kisalt', texts: [{ id: 't', text: 'Bir metin', max: 20 }] });
    await edit();
    assert.match(provider.calls.at(-1).prompt, /Haftada 2 eğitici Reels/);
    await s.request('PUT', `/api/brands/${b.id}/perf/2026-11/active`, { active: false });
    await edit();
    assert.doesNotMatch(provider.calls.at(-1).prompt, /Haftada 2 eğitici/);
  } finally { await s.stop(); }
});

test('Varsayılan şablon: eşleşen şablon yoksa fikirden üretim varsayılan şablonla yapılır, AI yalnızca metni yazar', async () => {
  const provider = fakeProvider([slidesOut(1)]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Varsayılan' })).data.brand;
    const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Ş', kind: 'post' })).data.post;
    await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#123456', layers: [T('t1', 'Başlık', { field: 'MAIN_TITLE' })] }] } });
    const t1 = (await s.request('POST', `/api/brands/${b.id}/posts/${post.id}/template`, { name: 'Ana' })).data.template;
    const t2 = (await s.request('POST', `/api/brands/${b.id}/posts/${post.id}/template`, { name: 'İkinci' })).data.template;
    let r = await s.request('PUT', `/api/brands/${b.id}/post-templates/${t1.id}/default`, { on: true });
    assert.equal(r.data.template.match.isDefault, true);
    await s.request('PUT', `/api/brands/${b.id}/post-templates/${t2.id}/default`, { on: true });
    const list = (await s.request('GET', `/api/brands/${b.id}/post-templates`)).data.templates;
    assert.deepEqual(list.filter(t => t.match.isDefault).map(t => t.id), [t2.id], 'markada tek varsayılan');
    // Eşleştirme kaydı varsayılanlığı bozmaz
    await s.request('PUT', `/api/brands/${b.id}/post-templates/${t2.id}/match`, { formats: [], categories: [] });
    const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Kahve rehberi', format: 'post', category: 'egitici' })).data.idea;
    r = await s.request('POST', `/api/brands/${b.id}/posts/from-idea`, { ideaId: idea.id });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.template.id, t2.id);
    assert.equal(r.data.post.data.slides[0].bg, '#123456', 'tasarım şablondan');
    assert.equal(r.data.post.data.slides[0].layers[0].text, 'Başlık 1', 'metin AI\'dan');
  } finally { await s.stop(); }
});

test('Referans şablonu: bölünmüş başlık satırlara paylaşılır, yer tutucu açıklama ve buton dolar; sabit havuzlar AI\'ya gitmez; kendi tasarımından üretim', async () => {
  const provider = fakeProvider([{ title: 'API', caption: 'c', hashtags: [], slides: [{ title: 'API Nedir ve *Neden* Önemli', body: 'Uygulamaların konuşma dili.', cta: 'Hemen öğren', speech: 'AI konuşması', pose: '' }] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Ref' })).data.brand;
    const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Ana tasarım', kind: 'post' })).data.post;
    await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#0b132b', layers: [
      T('a', 'Başlık buraya', { y: 100 }), T('b', 'Vurgulu başlık', { y: 200, highlight: '#ff6a13' }), T('c', 'Alt başlık devamı', { y: 300 }),
      T('d', 'Açıklama metni buraya', { role: 'text', y: 500, size: 30 }), T('e', 'Buton metni', { role: 'cta', y: 600, size: 30 })
    ] }] } });
    // 1) Havuz yokken: başlık üç kutuya bölünür, açıklama ve buton AI metniyle dolar
    const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'API nedir', format: 'post', category: 'egitici' })).data.idea;
    let r = await s.request('POST', `/api/brands/${b.id}/posts/from-idea`, { ideaId: idea.id, designId: post.id });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const L = Object.fromEntries(r.data.post.data.slides[0].layers.map(l => [l.id, l.text]));
    assert.notEqual(L.a, L.b, 'başlık kopyalanmaz');
    assert.equal([L.a, L.b, L.c].join(' ').replace(/\*/g, ''), 'API Nedir ve Neden Önemli');
    assert.match(L.b, /^\*.+\*$/, 'vurgulu kutu vurgulu yazılır');
    assert.equal(L.d, 'Uygulamaların konuşma dili.'); assert.equal(L.e, 'Hemen öğren');
    assert.match(provider.calls[0].prompt, /BUTON/);
    assert.equal(r.data.post.data.template, undefined, 'tasarımdan üretim şablon güncellemesine bağlanmaz');
    // 2) Havuz varken: buton havuzdan, AI'dan buton istenmez
    await s.request('PUT', `/api/brands/${b.id}/text-pools`, { cta: 'Kaydet ve paylaş\nTakip et', speech: ['Kaydırarak incele'] });
    const idea2 = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'REST nedir', format: 'post', category: 'egitici' })).data.idea;
    r = await s.request('POST', `/api/brands/${b.id}/posts/from-idea`, { ideaId: idea2.id, designId: post.id });
    const e2 = r.data.post.data.slides[0].layers.find(l => l.id === 'e').text;
    assert.ok(['Kaydet ve paylaş', 'Takip et'].includes(e2), e2);
    assert.doesNotMatch(provider.calls.at(-1).prompt, /BUTON/);
    assert.ok(r.data.post.work.some(w => /Sabit havuzdan: buton metni/.test(w.label)));
    assert.deepEqual((await s.request('GET', `/api/brands/${b.id}`)).data.brand.textPools.speech, ['Kaydırarak incele']);
    // Arşivleme
    r = await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}/archive`, { archived: true });
    assert.equal(r.data.post.archived, true);
  } finally { await s.stop(); }
});
