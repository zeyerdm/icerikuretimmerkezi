// 20 Kasım yapılacaklar listesi: hız ayarı, planlı Reels'te sahne işlemleri, toplu Reels, isteğe bağlı İngilizce,
// ilk kare görselleri, beğenilen Reels'ten öğrenme, rapordan Reels, Post'ta kendi maddeler, asistanın Reels'i tek akışta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';
import { thinkingConfig } from '../server/services/ai/providers/gemini.js';
import { fixPublishing } from '../server/services/prompts.js';
import { RULE_EXAMPLES } from '../public/js/ruleExamples.js';

const FLOW = RULE_EXAMPLES[0].body;
const LINE = 'İlk bilgisayarlar koca bir odayı kaplıyordu ve otuz ton ağırlığındaydı inanabiliyor musun';
const beats = d => [{ from: 0, to: 2, action: 'Dev bilgisayar odayı kaplıyor', camera: 'geniş plan' }, { from: 2, to: d, action: 'Karakter çipi gösteriyor', camera: 'yakın plan' }];
const scene = (d = 7, line = LINE) => ({ duration: d, start: 'Laboratuvar', beats: beats(d), line, lineFrom: 0.5, lineTo: d, endFrame: 'Çip avuçta' });
const PLAN = { title: 'Cebe sığan dev', punchline: 'Eskiden bir oda, şimdi bir avuç', setting: 'Eski laboratuvar, sıcak ışık', screenTitle: 'Oda kadar bilgisayar', titleKeyword: 'Oda',
  scenes: [scene(), scene()], ending: { twist: 'Telefon çalıyor' }, caption: 'Uzun açıklama. '.repeat(90).trim(), hashtags: ['#teknoloji', '#tarih', '#bilgisayar', '#bilim', '#çip'] };
const filled = (n, line = LINE, d = 7) => FLOW.replace('[NUMARASI]', String(n)).replace('[X] saniye', `${d} saniye`).replace('"[Seslendirme metni birebir buraya yazılır.]"', `"${line}"`).replace(/\[[^\]\n]+\]/g, 'dolu');

// İsteğin türüne göre yanıt veren sahte sağlayıcı
function router(extra = {}) {
  return fakeProvider([p => {
    for (const [k, v] of Object.entries(extra)) if (p.includes(k)) return typeof v === 'function' ? v(p) : v;
    if (p.includes('SENARYO PLANINI')) return PLAN;
    if (p.startsWith('PROMPT STUDIO · SAHNELİ')) return { title: 'X', scenes: [1, 2, 3, 4, 5, 6].map(n => ({ title: 'S' + n, prompt: filled(n) })) };
    if (p.startsWith('PROMPT STUDIO · SAHNE')) return { title: 'Yeni', prompt: filled(3, 'Bugün aynı güç avucumda duruyor ve cebime rahatça sığıyor bak şimdi', 6), planScene: scene(6, 'Bugün aynı güç avucumda duruyor ve cebime rahatça sığıyor bak şimdi') };
    if (p.startsWith('REELS PROMPT ÇEVİRİSİ')) return { scenes: [{ title: 'S1', prompt: 'SCENE 1 English "İlk bilgisayarlar" spoken in Turkish' }, { title: 'S2', prompt: 'SCENE 2 English' }] };
    if (p.startsWith('REELS İLK KARE')) return { settingEn: 'An old lab with warm light', frames: [{ scene: 1, shot: 'Medium shot, the character peeks out of cables' }, { scene: 2, shot: 'Close-up, the character holds a chip' }] };
    if (p.includes('Instagram içerik yazarısın')) return { title: 'Kahve rehberi', slides: [{ title: 'Kapak', body: 'Alt' }, { title: 'Madde', body: 'Açıklama' }, { title: 'Son', body: 'Kapanış' }], caption: 'Açıklama', hashtags: ['#kahve'] };
    return { title: 'Prompt', prompt: 'Kısa' };
  }]);
}

test('Hız ayarı: Gemini düşünme bütçesi/düzeyi; ayar kaydedilir, geçersiz reddedilir', async () => {
  assert.deepEqual(thinkingConfig('gemini-2.5-flash', 'low'), { thinkingBudget: 0 });
  assert.deepEqual(thinkingConfig('gemini-2.5-pro', 'low'), { thinkingBudget: 128 }, "Pro'da kapatılamaz");
  assert.deepEqual(thinkingConfig('gemini-2.5-flash', 'medium'), { thinkingBudget: 1024 });
  assert.equal(thinkingConfig('gemini-2.5-flash', 'high'), null, 'Derin: modelin varsayılanı');
  assert.deepEqual(thinkingConfig('gemini-3-flash', 'low'), { thinkingLevel: 'low' });
  assert.equal(thinkingConfig('gemma-3', 'low'), null, 'düşünmeyen modele bir şey gönderilmez');
  const s = await startServer({ aiProvider: router() });
  try {
    const ov = (await s.request('GET', '/api/ai')).data;
    assert.equal(ov.tasks.find(t => t.id === 'yazim').speed, 'hizli', 'varsayılan Hızlı');
    assert.deepEqual(ov.speeds, { hizli: 'Hızlı', dengeli: 'Dengeli', derin: 'Derin' });
    assert.equal((await s.request('PUT', '/api/ai/tasks', { tasks: { yazim: { speed: 'roket' } } })).status, 400);
    const ov2 = (await s.request('PUT', '/api/ai/tasks', { tasks: { yazim: { speed: 'derin' } } })).data;
    assert.equal(ov2.tasks.find(t => t.id === 'yazim').speed, 'derin');
  } finally { await s.stop(); }
});

test('Hızlı modda eksikli prompt ikinci kez yazılmaz (eksikler rozetlerde uyarı)', async () => {
  const provider = router();
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Hızlı' })).data.brand;
    const p = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'Kahve' })).data.prompt;
    assert.equal(provider.calls.length, 1, 'tek yazım');
    assert.equal(p.ai.qualityRetried, false);
    assert.equal(p.quality.ok, false, 'eksikler görünür');
  } finally { await s.stop(); }
});

test('Yayın: tam 5 hashtag, genel etiket atılır, eksikse marka etiketi; kısa açıklama uyarılır', () => {
  const r = fixPublishing({ caption: 'Kısa', hashtags: ['#reels', 'kahve', '#Kahve', '#keşfet', '#latte'] }, 'Kahve Evi');
  assert.deepEqual(r.plan.hashtags, ['#kahve', '#latte', '#KahveEvi']);
  assert.ok(r.notes.some(n => /Hashtag sayısı 3/.test(n)));
  assert.ok(r.notes.some(n => /Açıklama kısa/.test(n)));
  assert.deepEqual(fixPublishing(PLAN, 'X').notes, []);
});

test('Planlı Reels: sahne işlemi planı günceller, kapak yazısı yalnız ilk sahnede; İngilizce isteğe bağlı; ilk kare görselleri sabit karakter ve mekânla', async () => {
  const provider = router();
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Flow' })).data.brand;
    await s.request('PUT', `/api/brands/${b.id}/reels/settings`, { character: 'Bitbit' });
    await s.request('PUT', `/api/brands/${b.id}/character-book`, { lookEn: 'A small round robot with big blue eyes' });
    const plan = (await s.request('POST', `/api/brands/${b.id}/prompts/reels-plan`, { brief: 'Bilgisayarlar', scenes: 2 })).data;
    assert.match(provider.calls[0].prompt, /hedef toplam 30 saniye civarı, kesin üst sınır 40 saniye/);
    let p = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'reels', brief: 'Bilgisayarlar', plan: plan.plan })).data.prompt;
    assert.match(provider.calls.at(-1).prompt, /SABİT MEKÂN VE IŞIK[\s\S]*Eski laboratuvar, sıcak ışık/);
    const url = `/api/brands/${b.id}/prompts/${p.id}`;

    // Bir sahne daha: plana yeni sahne eklenir, yeni sahnede kapak yazısı yok, plana uyum uyarısı çıkmaz
    p = (await s.request('POST', `${url}/scenes`, { action: 'add' })).data.prompt;
    const ask = provider.calls.at(-1).prompt;
    assert.match(ask, /ONAYLANAN SENARYO PLANI/);
    assert.match(ask, /planScene/);
    assert.match(ask, /kapak yazısı bölümüne yalnızca/);
    assert.equal(p.scenes.length, 3);
    assert.equal(p.plan.scenes.length, 3);
    assert.equal(p.plan.scenes[2].duration, 6);
    assert.match(p.scenes[2].text, /Bu sahnede kapak yazısı yok/);
    assert.deepEqual(p.planIssues, [], p.planIssues.join(' | '));

    // İngilizce yalnız istenince; Türkçe asıl kalır; sahne değişince İngilizcesi silinir
    assert.deepEqual(p.scenesEn, []);
    provider.calls.length = 0;
    const en = (await s.request('POST', `${url}/translate`, {})).status;
    assert.equal(en, 400, 'sahne sayısı tutmazsa çeviri kaydedilmez');
    await s.request('PUT', url, { scenes: p.scenes.slice(0, 2) });
    p = (await s.request('POST', `${url}/translate`, {})).data.prompt;
    assert.match(provider.calls.at(-1).prompt, /KELİMESİ KELİMESİNE Türkçe kalır/);
    assert.equal(p.scenesEn.length, 2);
    assert.equal(p.lang, 'tr', 'Türkçe asıl kalır');
    assert.match(p.text, /SAHNE 1/);
    p = (await s.request('PUT', url, { scenes: p.scenes.map((x, i) => (i ? Object.assign({}, x, { text: x.text + ' Ek.' }) : x)) })).data.prompt;
    assert.deepEqual(p.scenesEn, [], 'Türkçe değişince İngilizcesi silinir');

    // İlk kare görselleri: sabit kısım her sahnede birebir aynı
    const ffr = await s.request('POST', `${url}/first-frames`, {});
    assert.equal(ffr.status, 200, JSON.stringify(ffr.data));
    p = ffr.data.prompt;
    const ff = p.plan.scenes.map(x => x.firstFrame);
    assert.equal(ff.filter(Boolean).length, 2);
    const fixed = x => x.split(' Shot: ')[0];
    assert.equal(fixed(ff[0]), fixed(ff[1]));
    assert.match(ff[0], /A small round robot with big blue eyes/);
    assert.match(ff[0], /An old lab with warm light/);
    assert.match(ff[1], /Close-up, the character holds a chip/);
    // Plansız prompt'ta ilk kare yazılmaz
    const plain = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'x' })).data.prompt;
    assert.equal((await s.request('POST', `/api/brands/${b.id}/prompts/${plain.id}/first-frames`, {})).status, 400);
  } finally { await s.stop(); }
});

test('Senaryo planı öğrenir: beğenilen ve beğenilmeyen Reels, favori fikirler, rapordaki en çok izlenen Reels', async () => {
  const provider = router();
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Öğrenen' })).data.brand;
    const plan = (await s.request('POST', `/api/brands/${b.id}/prompts/reels-plan`, { brief: 'İlk' })).data.plan;
    const liked = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'reels', brief: 'İlk', plan })).data.prompt;
    await s.request('PUT', `/api/brands/${b.id}/prompts/${liked.id}`, { example: true });
    const bad = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'reels', brief: 'Kötü', plan: Object.assign({}, plan, { title: 'Sıkıcı video' }) })).data.prompt;
    const fb = await s.request('PUT', `/api/brands/${b.id}/feedback`, { targetType: 'prompt', targetId: bad.id, vote: -1, reasons: ['kalabalik'], note: 'espri yok' });
    assert.equal(fb.status, 200, JSON.stringify(fb.data));
    const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Kodun ilk günü', category: 'eglenceli', format: 'reels' })).data.idea;
    await s.request('PATCH', `/api/brands/${b.id}/ideas/${idea.id}`, { favorite: true });
    const month = new Date().toISOString().slice(0, 7);
    await s.request('POST', `/api/brands/${b.id}/perf/${month}/entries`, { title: 'Klavye Reels', kind: 'reels', metrics: { views: 50000, saves: 900 }, note: 'hızlı kanca tuttu' });
    provider.calls.length = 0;
    await s.request('POST', `/api/brands/${b.id}/prompts/reels-plan`, { brief: 'Yeni konu' });
    const ask = provider.calls[0].prompt;
    assert.match(ask, /BEĞENİLEN REELS'LER[\s\S]*Eskiden bir oda, şimdi bir avuç/);
    assert.match(ask, /BEĞENİLMEYEN REELS'LER[\s\S]*Sıkıcı video \(neden: Fazla kalabalık, espri yok\)/);
    assert.match(ask, /FAVORİ REELS FİKİRLERİ[\s\S]*Kodun ilk günü/);
    assert.match(ask, /EN ÇOK İZLENEN REELS'LER[\s\S]*Klavye Reels · 50\.000 izlenme, 900 kaydetme · not: hızlı kanca tuttu/);
    assert.match(ask, /DAHA ÖNCE YAZILAN REELS'LER/);
  } finally { await s.stop(); }
});

test('Toplu Reels: seçilen fikirlerin senaryosu arka planda yazılır, fikir kullanıldı olur; post kuyruğuyla karışmaz', async () => {
  const s = await startServer({ aiProvider: router(), queueAutostart: true });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Toplu' })).data.brand;
    const ids = [];
    for (const t of ['Klavye tarihi', 'Fare tarihi']) ids.push((await s.request('POST', `/api/brands/${b.id}/ideas`, { title: t, category: 'egitici', format: 'reels' })).data.idea.id);
    const r = await s.request('POST', `/api/brands/${b.id}/gen-batches`, { type: 'reels', ideaIds: ids, scenes: 2 });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.added.length, 2);
    let res;
    for (let i = 0; i < 100; i++) { res = (await s.request('GET', `/api/brands/${b.id}/gen-jobs?type=reels`)).data; if (res.jobs.every(j => ['tamamlandi', 'hata'].includes(j.status))) break; await new Promise(r2 => setTimeout(r2, 50)); }
    assert.deepEqual(res.jobs.map(j => j.status), ['tamamlandi', 'tamamlandi'], JSON.stringify(res.jobs.map(j => j.error)));
    assert.ok(res.jobs.every(j => j.type === 'reels' && j.promptId));
    const pr = (await s.request('GET', `/api/brands/${b.id}/prompts/${res.jobs[0].promptId}`)).data.prompt;
    assert.equal(pr.kind, 'reels'); assert.equal(pr.scenes.length, 2); assert.ok(pr.plan);
    const used = (await s.request('GET', `/api/brands/${b.id}/ideas?status=kullanildi`)).data.ideas;
    assert.equal(used.length, 2);
    // Post kuyruğu Reels işlerini görmez; aynı fikirden post da üretilebilir (tür başına çift üretim engeli)
    assert.equal((await s.request('GET', `/api/brands/${b.id}/gen-jobs`)).data.jobs.length, 0);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/gen-batches`, { type: 'reels', ideaIds: [ids[0]] })).data.skipped[0].reason, 'Daha önce üretildi');
  } finally { await s.stop(); }
});

test("Post'ta kendi maddelerin: isteme girer, kayıtta saklanır", async () => {
  const provider = router();
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Notlu' })).data.brand;
    const r = await s.request('POST', `/api/brands/${b.id}/posts`, { topic: 'Kahve rehberi', kind: 'carousel', slides: 3, notes: 'Aç karnına içme\nGünde en çok 3 fincan' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const ask = provider.calls.map(c => c.prompt).find(p => p.includes('Instagram içerik yazarısın'));
    assert.match(ask, /KULLANICININ VERDİĞİ MADDELER VE NOTLAR:[\s\S]*Aç karnına içme[\s\S]*hiçbirini atlama/);
    assert.equal(r.data.post.data.notes, 'Aç karnına içme\nGünde en çok 3 fincan');
    const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Çay rehberi', category: 'egitici', format: 'post' })).data.idea;
    provider.calls.length = 0;
    const r2 = await s.request('POST', `/api/brands/${b.id}/posts/from-idea`, { ideaId: idea.id, slides: 3, notes: 'Demleme 5 dakika' });
    assert.equal(r2.status, 201, JSON.stringify(r2.data));
    assert.match(provider.calls.map(c => c.prompt).find(p => p.includes('Instagram içerik yazarısın')), /Demleme 5 dakika/);
  } finally { await s.stop(); }
});

test('Asistan Reels: fikirler İçerik fikirlerine (Reels türü), senaryo Prompt Studio\'da; takvim içeriği senaryoya bağlanır', async () => {
  const turns = [];
  const provider = router({ "Sen 'KREATİFHANE'": () => turns.shift() || { reply: 'Tamam.', actions: [] } });
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Asistanlı' })).data.brand;
    turns.push({ reply: 'Ekledim.', actions: [{ type: 'add_reels_ideas', ideas: [{ text: 'Kod yazarken kahve' }, { text: 'kod yazarken kahve' }] }, { type: 'create_reels', topic: 'Klavye tarihi', scenes: 2 }] });
    const res = (await s.request('POST', `/api/brands/${b.id}/chat`, { message: 'Reels' })).data.assistantMessage.actions;
    const ideas = (await s.request('GET', `/api/brands/${b.id}/ideas?format=reels`)).data.ideas;
    assert.deepEqual(ideas.map(i => i.title), ['Kod yazarken kahve'], 'tekrar eden atlanır, tek havuzda görünür');
    const cr = res.find(a => a.type === 'create_reels');
    assert.equal(cr.ok, true, JSON.stringify(cr));
    const pr = (await s.request('GET', `/api/brands/${b.id}/prompts/${cr.id}`)).data.prompt;
    assert.equal(pr.kind, 'reels'); assert.ok(pr.plan);
    const c = (await s.request('POST', `/api/brands/${b.id}/prompts/${cr.id}/schedule`, { scheduledAt: '2026-12-01T09:00:00.000Z' })).data.content;
    const got = (await s.request('GET', `/api/contents/${c.id}`)).data.content;
    assert.equal(got.promptId, cr.id);
  } finally { await s.stop(); }
});
