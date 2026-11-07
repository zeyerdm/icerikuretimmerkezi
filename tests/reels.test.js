// Aşama 3 testleri: Reels kuralları, fikir havuzu, senaryo üretimi/yeniden yazma/çeviri/sürümler, model seçimi,
// takvim bağlantısı, post stüdyosu ve AI içerik denetçisi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';
import { normalizeScenario, checkQuality, flowPrompt, cleanVideoPrompt, buildSrt, titleKeyword, totalSeconds, scriptText } from '../server/services/reels/rules.js';
import { layoutSlides, cleanData } from '../server/services/posts.js';

const scene = (o = {}) => Object.assign({
  duration: 6, start: 'Karakter kafede', endFrame: 'Fincan masada',
  beats: [{ from: 0, to: 3, action: 'Fincanı kaldırır', camera: 'Yakın plan', sound: '' }, { from: 3, to: 6, action: 'Gülümser', camera: 'Geniş plan', sound: 'zil' }],
  line: 'Vize haftası geldi ama kahven hazır, sakin ol ve nefes al biraz', lineFrom: 0.5, lineTo: 6,
  flowScene: '0-3s: Kahveci lifts the cup. 3-6s: Kahveci smiles.', flowSceneTr: '0-3 sn: Kahveci fincanı kaldırır. 3-6 sn: Kahveci gülümser.'
}, o);
const RAW = {
  title: 'Vize kahvesi', format: 'skec', topic: 'Vize haftasında kahve', why: 'Herkes yaşar', punchline: 'Kahve her derdin ilacı', setting: 'Sıcak bir kafe',
  screenTitle: 'Vize haftası kahve molası', titleKeyword: 'kahve',
  scenes: [scene(), scene({ start: 'Önceki kareden devam' })], ending: { twist: 'Fincan konuşur', lastFrame: 'Logo' },
  caption: 'Uzun açıklama metni', hashtags: ['vize', '#kahve'], music: 'Neşeli'
};

test('kurallar: süreler sınırlara oturur, konuşma hızı korunur, kalite kontrolü sorunları yakalar', () => {
  const long = normalizeScenario({ ...RAW, scenes: Array.from({ length: 8 }, () => scene({ duration: 12, beats: [{ from: 0, to: 12, action: 'x', camera: '', sound: '' }], lineTo: 12 })) });
  assert.equal(long.scenes.length, 6, 'en fazla 6 sahne');
  assert.ok(long.scenes.every(s => s.duration <= 8 && s.duration >= 3));
  assert.ok(totalSeconds(long) <= 45);
  assert.ok(long.scenes.every(s => s.beats.at(-1).to <= s.duration), 'zamanlama ölçeklenmedi');
  // 20 kelimelik replik 3 saniyelik sahneye sığmaz: sahne uzar
  const talk = normalizeScenario({ ...RAW, scenes: [scene({ duration: 3, beats: [{ from: 0, to: 3, action: 'a', camera: '', sound: '' }], line: 'bir iki üç dört beş altı yedi sekiz dokuz on on bir on iki on üç on dört on beş', lineFrom: 0, lineTo: 3 })] });
  assert.ok(talk.scenes[0].duration > 3, 'sahne konuşmaya göre uzamadı');
  assert.equal(normalizeScenario({ title: '' }), null);
  assert.equal(normalizeScenario({ title: 'x', scenes: [] }), null);

  const good = normalizeScenario(RAW);
  assert.equal(good.titleKeyword, 'kahve');
  assert.deepEqual(good.hashtags, ['#vize', '#kahve']);
  assert.deepEqual(checkQuality(good, { character: 'Kahveci' }), []);
  // İngilizce prompt'ta Türkçe harfsiz yazılan ad da karakter sayılır (Çekirdek → Cekirdek)
  const cek = JSON.parse(JSON.stringify(good));
  cek.scenes.forEach(sc => { sc.flowScene = sc.flowScene.replace(/Kahveci/g, 'Cekirdek'); });
  assert.ok(!checkQuality(cek, { character: 'Çekirdek' }).some(i => /adı/.test(i)));
  assert.ok(checkQuality(cek, { character: 'Pamuk' }).some(i => /adı/.test(i)));

  const bad = JSON.parse(JSON.stringify(good));
  bad.scenes[0].beats[1].from = 4; // boşluk
  bad.scenes[1].line = 'Hemen kaydet ve takip et bizi, beğenmeyi unutma lütfen arkadaşlar';
  bad.scenes[1].flowScene = 'Kahveci holds a sign that reads OPEN, slowly';
  bad.punchline = '';
  bad.topic = 'Starbucks ile karşılaştırma';
  const issues = checkQuality(bad, { character: 'Kahveci' }).join('\n');
  assert.match(issues, /arası boş/);
  assert.match(issues, /çağrı/);
  assert.match(issues, /saniye aralıkları/);
  assert.match(issues, /karede yazı/);
  assert.match(issues, /tempoyu düşüren/);
  assert.match(issues, /Asıl espri/);
  assert.match(issues, /starbucks/);
  assert.equal(titleKeyword('Cuma 17:58 canlıya kod', 'olmayan'), 'canlıya');
});

test('kurallar: Flow prompt\'unda başlık yalnızca ilk sahnede; temiz video prompt\'unda hiç yazı yok; altyazı zamanlaması', () => {
  const d = normalizeScenario(RAW);
  const opts = { character: 'Kahveci', style: '3d', colors: { primary: '#c2410c' } };
  const p0 = flowPrompt(d, 0, opts);
  const p1 = flowPrompt(d, 1, opts);
  assert.match(p0, /Vize haftası kahve molası/);
  assert.doesNotMatch(p1, /Vize haftası kahve molası/);
  assert.match(p1, /no text in the frame/);
  assert.match(p0, /Kahveci says in Turkish/);
  assert.match(flowPrompt(d, 0, { ...opts, lang: 'tr' }), /Türkçe olarak şunu söylüyor/);
  const clean = cleanVideoPrompt(d, 0, opts);
  assert.doesNotMatch(clean, /Vize haftası kahve molası/);
  assert.match(clean, /absolutely no text/);
  assert.match(cleanVideoPrompt(d, 0, { ...opts, style: 'gercekci' }), /Photorealistic/);
  const srt = buildSrt(d);
  assert.match(srt, /^1\n00:00:00,500 --> 00:00:06,000\n/);
  assert.match(srt, /00:00:06,500 --> 00:00:12,000/, 'ikinci sahne zamanı birinci sahnenin süresi kadar kaymalı');
  assert.match(scriptText(d, opts), /SAHNE 2 – \[00:06–00:12\]/);
});

test('post şablonu: kapak marka renginde, logo ve maskot katmanları; doğrulama başka markanın görselini reddeder', () => {
  const brand = { colors: { primary: '#c2410c', backgrounds: ['#fff7ed'], heading: '', body: '' }, fonts: { heading: 'Poppins', body: 'Inter' } };
  const slides = layoutSlides({ texts: [{ title: 'Kapak', body: 'Alt' }, { title: 'İki', body: 'Metin' }, { title: 'Üç', body: '' }], brand, logoUrl: '/api/brands/b1/assets/l1/file', mascotUrl: '/api/brands/b1/assets/m1/file' });
  assert.equal(slides.length, 3);
  assert.equal(slides[0].bg, '#c2410c');
  assert.equal(slides[1].bg, '#fff7ed');
  assert.ok(slides[0].layers.some(l => l.type === 'image' && l.src.includes('/m1/')), 'kapakta maskot yok');
  assert.ok(slides.every(s => s.layers.some(l => l.type === 'image' && l.src.includes('/l1/'))), 'logo her slaytta olmalı');
  assert.equal(slides[0].layers.find(l => l.role === 'title').color, '#ffffff', 'koyu zeminde yazı beyaz olmalı');
  assert.equal(slides[2].layers.find(l => l.role === 'page').text, '3/3');
  const data = cleanData({ format: '4:5', slides }, 'b1');
  assert.equal(data.slides.length, 3);
  assert.throws(() => cleanData({ format: '4:5', slides }, 'baska'), /bu markanın/);
  assert.throws(() => cleanData({ slides: [{ layers: [{ type: 'image', src: 'https://kotu.site/x.png' }] }] }, 'b1'), /kütüphanedeki/);
});

// Sahte model: istemin türüne göre yanıt verir
function scriptedProvider() {
  let n = 0;
  return fakeProvider([prompt => {
    n++;
    if (prompt.startsWith('REELS FİKİR HAVUZU')) return { ideas: [{ text: `Yeni fikir ${n}`, category: 'eglenceli' }, { text: `Bir başka fikir ${n}`, category: 'egitici' }] };
    if (prompt.startsWith('ÇEVİRİ GÖREVİ')) return '0-3s: Kahveci lifts the cup quickly. 3-6s: Kahveci laughs.';
    if (prompt.startsWith('İÇERİK DENETİMİ')) return { score: 72, summary: 'Marka diline uygun', issues: [{ severity: 'orta', problem: 'İlk cümle zayıf', suggestion: 'Soru ile başla' }], improved: '' };
    if (prompt.includes('Instagram içerik yazarısın')) return { title: 'Sınav kahvesi', slides: [{ title: 'Kapak', body: 'Alt başlık' }, { title: 'İpucu 1', body: 'Su iç' }, { title: 'İpucu 2', body: 'Mola ver' }], caption: 'Açıklama', hashtags: ['#sinav'] };
    if (prompt.includes('YALNIZCA SAHNE 2')) return { ...RAW, scenes: [scene(), scene({ start: 'Yeni bağlantı', line: 'Yepyeni ikinci sahne repliği burada akıcı biçimde söyleniyor şimdi' })] };
    if (prompt.includes('YENİDEN YAZ')) return { ...RAW, title: 'Vize kahvesi 2' };
    return RAW;
  }]);
}

test('Reels fikir havuzu: elle ekle, tekrar reddedilir, AI ile genişlet, beğen/beğenme, benzer fikir', async () => {
  const provider = scriptedProvider();
  const s = await startServer({ aiProvider: provider });
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Kahve Evi', tone: 'Samimi' })).data.brand;
    const add = await s.request('POST', `/api/brands/${brand.id}/reels/pool`, { text: 'Sabah ilk kahve anı', category: 'eglenceli' });
    assert.equal(add.status, 201);
    assert.equal((await s.request('POST', `/api/brands/${brand.id}/reels/pool`, { text: 'sabah ilk kahve anı!' })).status, 400);
    const ex = await s.request('POST', `/api/brands/${brand.id}/reels/pool/expand`, {});
    assert.equal(ex.status, 201, JSON.stringify(ex.data));
    assert.equal(ex.data.added.length, 2);
    assert.match(provider.calls.at(-1).prompt, /Kahve Evi/);
    assert.match(provider.calls.at(-1).prompt, /Sabah ilk kahve anı/, 'mevcut fikirler tekrar etmemesi için istemde olmalı');
    await s.request('PATCH', `/api/brands/${brand.id}/reels/pool/${add.data.item.id}`, { rating: 1 });
    await s.request('PATCH', `/api/brands/${brand.id}/reels/pool/${ex.data.added[0].id}`, { rating: -1 });
    const sim = await s.request('POST', `/api/brands/${brand.id}/reels/pool/expand`, { similarTo: add.data.item.id });
    assert.equal(sim.status, 201);
    const last = provider.calls.at(-1).prompt;
    assert.match(last, /BENZER/);
    assert.match(last, /BEĞENİLMEYENLER[\s\S]*Yeni fikir/, 'beğenilmeyen fikir olumsuz örnek olarak gitmeli');
    const pool = (await s.request('GET', `/api/brands/${brand.id}/reels/pool`)).data.pool;
    assert.equal(pool.length, 5);
    assert.equal(pool.find(p => p.id === add.data.item.id).rating, 1);
  } finally { await s.stop(); }
});

test('Reels senaryosu: havuzdan üret, tek sahneyi yeniden yaz, Türkçe düzeltip çevir, sürüme dön, takvime ekle', async () => {
  const provider = scriptedProvider();
  const s = await startServer({ aiProvider: provider });
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Kahve Evi' })).data.brand;
    await s.request('PUT', `/api/brands/${brand.id}/reels/settings`, { character: 'Kahveci', style: '3d', titleStyle: 'pop' });
    const item = (await s.request('POST', `/api/brands/${brand.id}/reels/pool`, { text: 'Vize haftası kahve', category: 'eglenceli' })).data.item;
    const c = await s.request('POST', `/api/brands/${brand.id}/reels`, { poolId: item.id });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    const r = c.data.reels;
    assert.equal(r.title, 'Vize kahvesi');
    assert.equal(r.poolId, item.id);
    assert.equal(r.data.titleStyle, 'pop');
    assert.equal(r.prompts.length, 2);
    assert.match(r.prompts[0].flowEn, /Kahveci says in Turkish/);
    assert.match(r.srt, /-->/);
    assert.equal(r.versions.length, 1);
    assert.ok(r.ai.modelLabel, 'hangi modelle yazıldığı dönmeli');
    const prompt = provider.calls.at(-1).prompt;
    assert.match(prompt, /Kahveci/);
    assert.match(prompt, /Vize haftası kahve/);
    assert.match(prompt, /KONUŞMA ÖNCE GELİR/);
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/reels/pool`)).data.pool[0].scenarioId, r.id);

    const re = await s.request('POST', `/api/brands/${brand.id}/reels/${r.id}/regenerate`, { sceneIndex: 1 });
    assert.equal(re.status, 200, JSON.stringify(re.data));
    assert.match(re.data.reels.data.scenes[1].line, /Yepyeni ikinci sahne/);
    assert.equal(re.data.reels.data.scenes[0].line, r.data.scenes[0].line, 'diğer sahne değişmemeli');
    assert.equal(re.data.reels.versions[0].note, 'Sahne 2 yeniden yazıldı');
    assert.equal((await s.request('POST', `/api/brands/${brand.id}/reels/${r.id}/regenerate`, { sceneIndex: 9 })).status, 400);

    // Türkçe tarifi düzelt → İngilizce eskidi uyarısı → çevir
    const ed = await s.request('PATCH', `/api/brands/${brand.id}/reels/${r.id}`, { data: { scenes: [{ flowSceneTr: '0-3 sn: Kahveci fincanı hızla kaldırır. 3-6 sn: Kahveci güler.' }], screenTitle: 'Kahve molası şart', caption: 'Yeni açıklama', hashtags: 'kahve vize' } });
    assert.equal(ed.status, 200);
    assert.ok(ed.data.reels.issues.some(i => /İngilizce prompt henüz güncellenmedi/.test(i)));
    assert.deepEqual(ed.data.reels.data.hashtags, ['#kahve', '#vize']);
    const tr = await s.request('POST', `/api/brands/${brand.id}/reels/${r.id}/translate`, { sceneIndex: 0, to: 'en' });
    assert.equal(tr.status, 200, JSON.stringify(tr.data));
    assert.match(tr.data.reels.data.scenes[0].flowScene, /lifts the cup quickly/);
    assert.ok(!tr.data.reels.issues.some(i => /henüz güncellenmedi/.test(i)));
    assert.match(provider.calls.at(-1).prompt, /fincanı hızla kaldırır/);

    // İlk sürüme dön
    const first = tr.data.reels.versions.at(-1);
    assert.equal(first.note, 'İlk senaryo');
    const back = await s.request('POST', `/api/brands/${brand.id}/reels/${r.id}/restore`, { versionId: first.id });
    assert.equal(back.data.reels.data.scenes[1].line, r.data.scenes[1].line);
    assert.match(back.data.reels.versions[0].note, /Önceki sürüme dönüldü/);

    // Takvime ekle: Reels türünde, senaryoya bağlı
    const sch = await s.request('POST', `/api/brands/${brand.id}/reels/${r.id}/schedule`, { scheduledAt: new Date(Date.now() + 86400000).toISOString() });
    assert.equal(sch.status, 201);
    assert.equal(sch.data.content.type, 'reels');
    assert.equal(sch.data.content.reelsId, r.id);
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/reels/${r.id}`)).data.reels.content.id, sch.data.content.id);
    await s.request('PATCH', `/api/brands/${brand.id}/reels/${r.id}`, { status: 'cekildi' });
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/reels`)).data.reels[0].status, 'cekildi');
  } finally { await s.stop(); }
});

test('her üretimde model seçilebilir; seçilmezse işin atanmış modeli çalışır', async () => {
  const seen = [];
  const fakeAnthropic = {
    id: 'anthropic', label: 'Anthropic Claude',
    async generate({ model, prompt, json }) { seen.push(model); return { output: json ? RAW : 'çeviri', usage: { input: 10, output: 10 }, model }; },
    async listModels() { return [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }]; }
  };
  const s = await startServer({ aiProviders: { anthropic: fakeAnthropic } });
  try {
    await s.request('PUT', '/api/ai/keys/anthropic', { apiKey: 'sk-ant-TEST-0123456789abcdefghijklmn' });
    const brand = (await s.request('POST', '/api/brands', { name: 'M' })).data.brand;
    const a = await s.request('POST', `/api/brands/${brand.id}/reels`, { topic: 'Konu' });
    assert.equal(a.status, 201, JSON.stringify(a.data));
    assert.equal(seen.at(-1), 'claude-sonnet-5-5', 'varsayılan: metin yazımına atanan model');
    const b = await s.request('POST', `/api/brands/${brand.id}/reels/${a.data.reels.id}/regenerate`, { model: 'anthropic:claude-opus-5-5' });
    assert.equal(b.status, 200);
    assert.equal(seen.at(-1), 'claude-opus-5-5', 'seçilen model kullanılmadı');
    assert.equal(b.data.reels.modelLabel, 'Claude Opus 5.5');
    assert.equal((await s.request('POST', `/api/brands/${brand.id}/reels`, { topic: 'x', model: 'openai:gpt-5' })).status, 409, 'bağlı olmayan sağlayıcı reddedilmeli');
    // Harcama işe göre kaydedilir
    const usage = (await s.request('GET', '/api/ai/usage')).data;
    assert.ok(usage.byTask.some(t => t.k === 'yazim' && t.calls === 2));
  } finally { await s.stop(); }
});

test('post stüdyosu: konudan carousel, düzenleme, başka markanın görseli reddedilir, yeniden yazdırma, takvim', async () => {
  const provider = scriptedProvider();
  const s = await startServer({ aiProvider: provider });
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Kahve Evi', colors: { primary: '#c2410c', secondary: [], backgrounds: ['#ffffff'], heading: '#1b1f3b', body: '#3a3f63' } })).data.brand;
    const other = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    const logo = (await s.request('POST', `/api/brands/${brand.id}/assets?category=logo`, PNG_1PX, { 'Content-Type': 'image/png' })).data.asset;
    const otherLogo = (await s.request('POST', `/api/brands/${other.id}/assets?category=logo`, PNG_1PX, { 'Content-Type': 'image/png' })).data.asset;
    const c = await s.request('POST', `/api/brands/${brand.id}/posts`, { topic: 'Sınav haftası', kind: 'carousel', format: '4:5', slides: 3 });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    const post = c.data.post;
    assert.equal(post.data.slides.length, 3);
    assert.equal(post.data.slides[0].bg, '#c2410c');
    assert.ok(post.data.slides[0].layers.some(l => l.src === logo.url), 'logo eklenmedi');
    assert.equal(post.data.caption, 'Açıklama');

    const data = JSON.parse(JSON.stringify(post.data));
    data.slides[1].layers.find(l => l.role === 'title').text = 'Elle değişti';
    const up = await s.request('PUT', `/api/brands/${brand.id}/posts/${post.id}`, { title: 'Yeni ad', data });
    assert.equal(up.status, 200, JSON.stringify(up.data));
    assert.equal(up.data.post.data.slides[1].layers.find(l => l.role === 'title').text, 'Elle değişti');
    data.slides[0].layers.push({ type: 'image', src: otherLogo.url, x: 0, y: 0, w: 10, h: 10 });
    assert.equal((await s.request('PUT', `/api/brands/${brand.id}/posts/${post.id}`, { data })).status, 400);

    const rw = await s.request('POST', `/api/brands/${brand.id}/posts/${post.id}/rewrite`, {});
    assert.equal(rw.status, 200);
    assert.match(provider.calls.at(-1).prompt, /ÖNCEKİ METİN/);
    const sch = await s.request('POST', `/api/brands/${brand.id}/posts/${post.id}/schedule`, {});
    assert.equal(sch.data.content.type, 'carousel');
    assert.equal(sch.data.content.postId, post.id);
    const blank = await s.request('POST', `/api/brands/${brand.id}/posts`, { blank: true, title: 'Boş post', kind: 'post', format: '1:1' });
    assert.equal(blank.status, 201);
    assert.equal(blank.data.post.data.slides.length, 1);
    assert.equal((await s.request('GET', `/api/brands/${other.id}/posts/${post.id}`)).status, 404);
  } finally { await s.stop(); }
});

test('AI içerik denetçisi: kod kuralları ve model değerlendirmesi birlikte', async () => {
  const provider = scriptedProvider();
  const s = await startServer({ aiProvider: provider });
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Kahve Evi', tone: 'Sen diliyle samimi' })).data.brand;
    const r = await s.request('POST', `/api/brands/${brand.id}/review`, { text: 'Kısa metin #a #b #c #d #e #f', kind: 'caption' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const rv = r.data.review;
    assert.equal(rv.score, 72);
    assert.ok(rv.issues.some(i => i.source === 'kural' && /kısa/.test(i.problem)));
    assert.ok(rv.issues.some(i => i.source === 'kural' && /hashtag/.test(i.problem)));
    assert.ok(rv.issues.some(i => i.source === 'ai' && /İlk cümle/.test(i.problem)));
    assert.match(provider.calls.at(-1).prompt, /Sen diliyle samimi/);
    assert.equal((await s.request('POST', `/api/brands/${brand.id}/review`, { text: '', kind: 'caption' })).status, 400);
  } finally { await s.stop(); }
});
