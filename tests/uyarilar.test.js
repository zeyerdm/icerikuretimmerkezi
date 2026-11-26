// Proaktif uyarılar (Aşama 05): yapay zekâsız kurallar; anahtar sabit (tekrar yok), gizlenen uyarı süre boyunca çıkmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const day = n => new Date(Date.now() + n * 86400000).toISOString();

test('Uyarılar: plan boşluğu, onay bekleyen, tarihi geçen içerik, geciken görev, üretim düşüşü, tek tip; gizle', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Uyarılı' })).data.brand;
    // Son 30 günde üretim var, önümüzdeki 7 gün boş → plan boşluğu (yüksek)
    const past = (await s.request('POST', '/api/contents', { brandId: b.id, title: 'Geçen hafta', type: 'post', scheduledAt: day(-3) })).data.content;
    let ins = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    const plan = ins.find(i => i.kind === 'plan_bos');
    assert.ok(plan, JSON.stringify(ins.map(i => i.kind)));
    assert.equal(plan.priority, 'yuksek'); assert.match(plan.action.href, /\/takvim$/);
    // Tarihi geçmiş ve bitmemiş içerik
    assert.ok(ins.some(i => i.kind === 'geciken_icerik' && /1 içeriğin tarihi geçti/.test(i.title)));
    // Onay bekleyen
    await s.request('PATCH', `/api/contents/${past.id}`, { status: 'onay' });
    ins = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    assert.ok(ins.some(i => i.kind === 'onay_bekliyor' && i.title.includes('Geçen hafta')));
    // Geciken görev
    await s.request('POST', '/api/tasks', { brandId: b.id, title: 'Logo dosyasını iste', dueDate: day(-2).slice(0, 10) });
    ins = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    assert.ok(ins.some(i => i.kind === 'geciken_gorev' && i.text.includes('Logo dosyasını iste')));
    // Sıralama: yüksek öncelik önce
    assert.equal(ins[0].priority, 'yuksek');
    // Gizle: aynı anahtar 7 gün çıkmaz; anahtarlar tekil
    assert.equal(new Set(ins.map(i => i.key)).size, ins.length);
    assert.equal((await s.request('POST', '/api/insights/dismiss', { key: plan.key })).status, 200);
    ins = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    assert.ok(!ins.some(i => i.key === plan.key));
    assert.equal((await s.request('POST', '/api/insights/dismiss', {})).status, 400);
    // Tümü (marka verilmeden) de çalışır
    assert.ok((await s.request('GET', '/api/insights')).data.insights.length >= 1);
  } finally { await s.stop(); }
});

test('Uyarılar: tek tip içerik ve aylık hedefe göre haftalık plan eksiği', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Hedefli' })).data.brand;
    await s.request('PATCH', `/api/brands/${b.id}`, { monthlyGoal: 13 }); // haftada 4
    for (let i = 0; i < 6; i++) await s.request('POST', '/api/contents', { brandId: b.id, title: `Post ${i}`, type: 'post', scheduledAt: day(i < 2 ? 2 + i : -10 - i) });
    const ins = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    const plan = ins.find(i => i.kind === 'plan_bos');
    assert.ok(plan && /Bu hafta 2 içerik planlı/.test(plan.title) && /haftada 4/.test(plan.text), JSON.stringify(plan));
    assert.equal(plan.priority, 'orta');
    assert.ok(ins.some(i => i.kind === 'tek_tip'), 'son 30 günde 6 içeriğin hepsi post');
  } finally { await s.stop(); }
});

test('Performans analizi: çok izlenip az etkileşim, türe göre kaydetme/paylaşım, takipçi getirenler', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Ölçülü' })).data.brand;
    const rows = [['A', 'post', { views: 1000, likes: 80, saves: 30, shares: 10, follows: 5 }], ['B', 'reels', { views: 9000, likes: 20, saves: 2, shares: 1, follows: 40 }], ['C', 'post', { views: 1200, likes: 90, saves: 25, shares: 8 }], ['D', 'carousel', { views: 800, likes: 70, saves: 40, shares: 12, follows: 2 }]];
    for (const [t, type, m] of rows) { const c = (await s.request('POST', '/api/contents', { brandId: b.id, title: t, type, scheduledAt: day(-5) })).data.content; await s.request('PATCH', `/api/contents/${c.id}`, { metrics: m }); }
    const p = (await s.request('GET', `/api/performance?brandId=${b.id}`)).data;
    assert.deepEqual(p.lowEngagement.map(x => x.title), ['B']);
    assert.equal(p.saveShare[0].label, 'Carousel'); assert.equal(p.saveShare[0].saveRate, 5);
    assert.deepEqual(p.follows.map(x => x.title), ['B', 'A', 'D']);
  } finally { await s.stop(); }
});

// O4.6: marka kimliğinde kişinin vermesi gereken eksik bilgi bildirim merkezinde; sihirbaz eksik adımı açar
test('Uyarı: marka kimliği kurulmadı / eksik bilgi; tamamlanınca sayı değişir, bağlantı eksik adıma gider', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Eksikli' })).data.brand;
    const get = async () => (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights.filter(i => i.kind === 'kimlik_eksik');
    let ins = await get();
    assert.equal(ins.length, 1); assert.equal(ins[0].title, 'Marka kimliği kurulmadı');
    assert.match(ins[0].action.href, /\/kimlik\/kurulum$/);
    // Bir adım kaydedilince kurulum başlamış sayılır; kalan eksikler sayılır ve ilk eksik adıma bağlanır
    assert.equal((await s.request('PUT', `/api/brands/${b.id}/setup/temel`, { name: 'Eksikli', sector: 'Kafe', description: 'Kampüste kahve', slogan: 'Mola' })).status, 200);
    ins = await get();
    assert.equal(ins.length, 1);
    const m = ins[0].title.match(/^Marka kimliğinde (\d+) eksik bilgi$/);
    assert.ok(m, ins[0].title);
    assert.doesNotMatch(ins[0].text, /^Marka:/, 'tamamlanan adım listede yok');
    assert.match(ins[0].action.href, /\/kimlik\/kurulum\/[a-z]+$/);
    const before = Number(m[1]);
    await s.request('PUT', `/api/brands/${b.id}/setup/kitle`, { audience: 'Öğrenciler', goals: 'Bilinirlik', competitors: 'Zincirler', monthlyGoal: 12 });
    const after = Number(((await get())[0] || { title: 'Marka kimliğinde 0 eksik bilgi' }).title.match(/(\d+)/)[1]);
    assert.ok(after < before, `${after} < ${before}`);
  } finally { await s.stop(); }
});

// Çalışma modları: proaktif (varsayılan) / komut; komutla modda asistana "öneriler" yazınca yapay zekâsız liste
test('Çalışma modu: varsayılan proaktif, komut seçilebilir; asistan "öneriler" sorusunu kayıtlardan cevaplar', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Modlu' })).data.brand;
    assert.equal((await s.request('GET', '/api/insights')).data.mode, 'proaktif');
    assert.equal((await s.request('PUT', '/api/insights/mode', { mode: 'x' })).status, 400);
    assert.equal((await s.request('PUT', '/api/insights/mode', { mode: 'komut' })).data.mode, 'komut');
    assert.equal((await s.request('GET', '/api/insights')).data.mode, 'komut');
    const r = await s.request('POST', `/api/brands/${b.id}/chat`, { message: "öneriler" });
    assert.ok(r.status < 300, JSON.stringify(r.data));
    const text = r.data.assistantMessage.content;
    assert.match(text, /^\d+ öneri \/ uyarı:\n/); assert.match(text, /\n- \[Önemli\] Marka kimliği kurulmadı/);
    assert.match(text, /yapay zekâ kullanılmadı/);
  } finally { await s.stop(); }
});

// Performansı düşen içerik türü ve gelecek hafta önerisi (yapay zekâsız)
test('Uyarı: içerik türünün etkileşimi düşünce ve gelecek hafta için tür / sütun önerisi', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Ölçülü' })).data.brand;
    const pil = (await s.request('POST', `/api/brands/${b.id}/pillars`, { name: 'Eğitici', share: 50 })).data.pillar;
    const mk = async (type, daysAgo, likes) => {
      const c = (await s.request('POST', '/api/contents', { brandId: b.id, title: `${type} ${daysAgo}`, type, status: 'yayinlandi', scheduledAt: day(-daysAgo) })).data.content;
      await s.request('PATCH', `/api/contents/${c.id}`, { metrics: { views: 100, likes } });
    };
    // Reels: önce %8, son 30 günde %2 → düştü; Carousel: istikrarlı %6
    await mk('reels', 50, 8); await mk('reels', 60, 8); await mk('reels', 5, 2); await mk('reels', 10, 2);
    await mk('carousel', 8, 6); await mk('carousel', 12, 6);
    const list = (await s.request('GET', `/api/insights?brandId=${b.id}`)).data.insights;
    const drop = list.find(i => i.kind === 'tur_dustu');
    assert.ok(drop, JSON.stringify(list.map(i => i.kind)));
    assert.equal(drop.title, 'Reels etkileşimi düştü'); assert.match(drop.text, /%2 \(önceki 60 gün %8\)/);
    assert.ok(!list.some(i => i.kind === 'tur_dustu' && /Carousel/.test(i.title)));
    const plan = list.find(i => i.kind === 'hafta_plani');
    assert.ok(plan); assert.match(plan.title, /^Gelecek hafta: \d+ içerik$/);
    assert.match(plan.text, /En çok tutan türler: Carousel \(%6\), Reels \(%5\)/); assert.match(plan.text, /Geride kalan sütunlar: Eğitici \(hedef %50\)/);
    assert.ok(pil.id);
  } finally { await s.stop(); }
});
