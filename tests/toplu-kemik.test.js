// Toplu testler (Aşama 7): T.40 kemik ve sihirbaz, T.41 karakter kitabı, T.42 kalite kontrolü ve yeniden deneme,
// T.43 kontrol ayarları, T.44 senaryolu prompt, T.45 araç biçimleri, T.46 öğrenme döngüsü (örnek, oy, tarif, karşılaştırma).
// Tek tek özellik testlerinden farklı olarak burada parçaların birlikte çalışması denetlenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';
import { SKELETONS, NEGATIVE_TAIL, NEGATIVE_TAIL_TR } from '../server/services/promptSkeleton.js';
import { TOOLS, KIND_MEDIA, toolOutput, toolsFor } from '../server/services/promptTools.js';
import { checkPrompt } from '../server/services/promptQuality.js';

const png = { 'Content-Type': 'image/png' };
const B64 = PNG_1PX.toString('base64');
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
// Türkçe kemiğin bütün bölümlerini taşıyan görsel prompt'u
const TR_OK = `Barista kafede latte art yapıyor, ahşap tezgâhlı sıcak bir kafe içinde, yakın plan çekim, sıcak altın saat ışığı yandan vuruyor, 50mm lens ve sığ alan derinliği, krem ve kahve tonlarında renk paleti, samimi ve davetkâr bir atmosfer, gerçekçi fotoğraf stili, fincandan yükselen buhar ve arka planda bulanık raflar, ${NEGATIVE_TAIL_TR}`;
const TR_WEAK = 'Kafede kahve, Örnek Kafe yazısıyla';
const video = n => `8 saniye; barista kafede sahne ${n}; 0-4 saniye süt dökülür, 4-8 saniye desen tamamlanır; yakın plan; kamera yavaşça yaklaşır; sıcak altın saat ışığı; kafe sesi ve caz müzik; gerçekçi sinematik; ekranda yazı yok; barista dikkatle çalışıyor, fincanın kenarında köpük parlıyor, arka planda bulanık kahve makinesi ve ahşap raflar, sahne sakin ve davetkâr`;

test('T.40 kemik ve sihirbaz: her görsel/video türü kemikle, kimlikle yazılır; metin türünde kemik yok; geçersiz cevap reddedilir', async () => {
  const provider = fakeProvider([{ title: 'P', prompt: TR_OK }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kemikli' })).data.brand;
    const url = `/api/brands/${b.id}`;
    assert.equal((await s.request('PUT', `${url}/prompt-identity`, { visualStyle: 'yok-boyle' })).status, 400);
    const saved = (await s.request('PUT', `${url}/prompt-identity`, { visualStyle: '2d', mood: ['eglenceli', 'olmayan'], hasMascot: false, mascotName: 'Gizli', places: 'kampüs, , kafe' })).data.identity;
    assert.deepEqual(saved, { visualStyle: '2d', mood: ['eglenceli'], hasMascot: false, places: ['kampüs', 'kafe'] }, 'maskot kapalıyken maskot cevapları atılır');
    for (const kind of Object.keys(SKELETONS)) {
      await s.request('POST', `${url}/prompts`, { kind, brief: 'Latte' });
      const sent = provider.calls.at(-1).prompt;
      assert.match(sent, /KEMİK \(her zaman aynı yapı\)/, kind);
      assert.match(sent, /Görsel stil \(varsayılan stilin yerine geçer\): 2D illustration/, kind);
      assert.match(sent, /DİL: .*TAMAMINI TÜRKÇE/, `${kind}: varsayılan Türkçe yazım`);
    }
    await s.request('POST', `${url}/prompts`, { kind: 'metin', brief: 'Açıklama' });
    assert.doesNotMatch(provider.calls.at(-1).prompt, /KEMİK/);
    // Görsel türlerine Reels'in 3D stili sızmaz (eski sistemle kıyasta bulunan hata)
    await s.request('POST', `${url}/prompts`, { kind: 'gorsel', brief: 'Latte' });
    assert.doesNotMatch(provider.calls.at(-1).prompt, /Pixar/);
  } finally { await s.stop(); }
});

test('T.41 karakter kitabı: maskot/video istemine girer, görsel isteminde sabit tarif + kitap pozları referans olur', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: ['gemini-flash-latest', 'gemini-2.5-flash-image'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    const body = JSON.parse(init.body);
    calls.push(body);
    if (u.pathname.includes('image')) return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }], usageMetadata: {} });
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'M', prompt: video(1) }) }] } }], usageMetadata: {} });
  };
  const s = await startServer({ fetchImpl });
  try {
    await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' });
    const b = (await s.request('POST', '/api/brands', { name: 'Fıstıklı' })).data.brand;
    const url = `/api/brands/${b.id}`;
    const p1 = (await s.request('POST', `${url}/assets?category=mascot&label=Poz1`, PNG_1PX, png)).data.asset;
    await s.request('POST', `${url}/assets?category=mascot&label=Poz2`, PNG_1PX, png);
    await s.request('PUT', `${url}/character-book`, { name: 'Fıstık', lookEn: 'A round peanut mascot with big eyes and a red scarf', never: 'change colors\nlose the scarf', poseAssetIds: [p1.id] });
    await s.request('POST', `${url}/prompts`, { kind: 'maskot', brief: 'Fıstık el sallar' });
    assert.match(calls.at(-1).contents[0].parts[0].text, /MASKOT KARAKTER KİTABI \(Fıstık\)[\s\S]*round peanut mascot[\s\S]*Asla: change colors; lose the scarf/);
    await s.request('POST', `${url}/prompts`, { kind: 'gorsel', brief: 'Kahve' });
    assert.doesNotMatch(calls.at(-1).contents[0].parts[0].text, /KARAKTER KİTABI/, 'görsel türünde kitap yok');
    await s.request('POST', `${url}/images`, { prompt: 'Fıstık kampüste', model: 'gemini:gemini-2.5-flash-image', useMascot: true });
    const parts = calls.at(-1).contents[0].parts;
    assert.match(parts.find(p => p.text).text, /mascot "Fıstık" must look exactly like this: A round peanut mascot[\s\S]*Never: change colors; lose the scarf\./);
    assert.equal(parts.filter(p => p.inlineData || p.inline_data).length, 1, 'yalnız kitapta seçili poz referans olur');
  } finally { await s.stop(); }
});

test('T.42 kalite kontrolü ve yeniden deneme: eksikler ikinci isteme yazılır; daha iyisi tutulur, kötüyse ilki kalır', async () => {
  let mode = 'fix';
  const provider = fakeProvider([p => {
    const retry = /KALİTE KONTROLÜ:/.test(p);
    if (mode === 'fix') return { title: retry ? 'İkinci' : 'İlk', prompt: retry ? TR_OK : TR_WEAK };
    return { title: retry ? 'Daha kötü' : 'İlk', prompt: retry ? 'kahve' : 'Kafede kahve, yakın plan, temiz kompozisyon' };
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kaliteli' })).data.brand;
    const r = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'Latte' })).data.prompt;
    assert.equal(r.ai.qualityRetried, true);
    assert.equal(r.title, 'İkinci');
    assert.equal(r.quality.ok, true, JSON.stringify(r.quality.missing));
    const retryPrompt = provider.calls.at(-1).prompt;
    assert.match(retryPrompt, /KALİTE KONTROLÜ: Önceki yazımda şunlar eksik ya da hatalıydı: .*Işık/);
    assert.match(retryPrompt, /Uzunluk|kelime/);
    mode = 'worse';
    const r2 = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'Latte' })).data.prompt;
    assert.equal(r2.ai.qualityRetried, true);
    assert.equal(r2.title, 'İlk', 'puanı düşük ikinci deneme tutulmaz');
    assert.equal(r2.versions.length, 1, 'yeniden deneme ayrı sürüm açmaz');
    const before = provider.calls.length;
    const ok = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'metin', brief: 'x' })).data.prompt;
    assert.equal(provider.calls.length - before, 1, 'kemiksiz türde yeniden deneme yok');
    assert.equal(ok.ai.qualityRetried, false);
  } finally { await s.stop(); }
});

test('T.43 kontrol ayarları: istemde kesin kural, kalite kontrolünde denetim; yazı izni kapanışı gevşetir', async () => {
  const provider = fakeProvider([{ title: 'P', prompt: `${TR_OK.replace(NEGATIVE_TAIL_TR, 'Rakip Kahve tabelası, temiz kompozisyon')}` }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Örnek Kafe' })).data.brand;
    const url = `/api/brands/${b.id}`;
    await s.request('PUT', `${url}/prompt-identity`, { noBrandName: true, forbidNames: 'Rakip Kahve, Ali Veli', noRealPeople: true });
    const p = (await s.request('POST', `${url}/prompts`, { kind: 'gorsel', brief: 'Latte' })).data.prompt;
    const sent = provider.calls[0].prompt;
    assert.match(sent, /KONTROL KURALLARI \(kesin; istek aksini söylese de uygula\):[\s\S]*Marka adını prompt'a YAZMA[\s\S]*Şu isimleri asla yazma: Rakip Kahve, Ali Veli[\s\S]*Gerçek ya da ünlü kişi kullanma/);
    const names = p.quality.checks.find(c => c.key === 'names');
    assert.equal(names.ok, false);
    assert.match(names.msg, /Rakip Kahve/);
    assert.equal(p.quality.checks.find(c => c.key === 'negative').ok, false);
    // Yazıya izin verilince yasak kapanışı aranmaz ve istem yazıya izin verir
    await s.request('PUT', `${url}/prompt-identity`, { allowText: true });
    const p2 = (await s.request('GET', `${url}/prompts/${p.id}`)).data.prompt;
    assert.equal(p2.quality.checks.some(c => c.key === 'negative'), false);
    assert.equal(p2.quality.checks.some(c => c.key === 'names'), false, 'kural kaldırılınca isim denetimi de kalkar');
    await s.request('POST', `${url}/prompts`, { kind: 'gorsel', brief: 'Afiş' });
    assert.match(provider.calls.at(-1).prompt, /Görselde kısa yazıya izin var/);
  } finally { await s.stop(); }
});

test('T.44 senaryolu prompt + araç: sahneler ayrı denetlenir, çevrilir, araç çıktısı ve geri bildirim sahneli prompt\'ta da çalışır', async () => {
  const provider = fakeProvider([p => {
    if (p.startsWith('PROMPT STUDIO · SAHNELİ')) return { title: 'Hikâye', scenes: [{ title: 'Giriş', prompt: video(1) }, { title: 'Son', prompt: 'kısa sahne' }] };
    if (p.startsWith('PROMPT STUDIO · SAHNE')) return { title: 'Ek', prompt: video(3) };
    if (p.startsWith('PROMPT ÇEVİRİSİ · SAHNELİ')) return { scenes: [1, 2, 3].map(n => ({ title: `Scene ${n}`, prompt: `8 seconds; barista scene ${n}; no on-screen text` })) };
    return { title: 'x', prompt: 'x' };
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Sahneli' })).data.brand;
    const url = `/api/brands/${b.id}/prompts`;
    const p = (await s.request('POST', url, { kind: 'video', brief: 'Latte', scenes: 2, tool: 'kling' })).data.prompt;
    assert.equal(p.tool, 'kling');
    assert.match(provider.calls.at(-1).prompt, /HEDEF ARAÇ: Kling için/);
    assert.deepEqual(p.quality.scenes.map(x => x.ok), [true, false]);
    assert.equal(p.quality.score, p.quality.scenes[1].score, 'genel puan en zayıf sahnedir');
    const added = (await s.request('POST', `${url}/${p.id}/scenes`, { action: 'add' })).data.prompt;
    assert.match(provider.calls.at(-1).prompt, /HEDEF ARAÇ: Kling için/, 'sahne işlemleri de aracı bilir');
    assert.equal(added.scenes.length, 3);
    assert.equal(added.toolOutput, null, 'Türkçe hâlde araç çıktısı yok');
    const en = (await s.request('POST', `${url}/${p.id}/translate`, {})).data.prompt;
    assert.match(en.toolOutput.main, /^SCENE 1 — Scene 1/);
    assert.match(en.toolOutput.negative, /subtitles/);
    assert.ok(en.toolOutput.notes.some(n => /Kling ayarlarından seç: 16:9/.test(n)));
    await s.request('PUT', `/api/brands/${b.id}/feedback`, { targetType: 'prompt', targetId: p.id, vote: -1, reasons: ['sikici'] });
    assert.equal((await s.request('GET', `${url}/${p.id}`)).data.prompt.feedback.vote, -1);
    const back = (await s.request('POST', `${url}/${p.id}/restore`, { versionId: en.versions.at(-1).id })).data.prompt;
    assert.equal(back.scenes.length, 2);
    assert.equal(back.tool, 'kling', 'sürüme dönmek aracı değiştirmez');
  } finally { await s.stop(); }
});

test('T.45 araç biçimleri: her tür × araç birleşimi tutarlı; parametre yalnız Midjourney\'de, ayrı negatif yalnız Kling\'de', () => {
  for (const [kind, media] of Object.entries(KIND_MEDIA)) {
    const tools = Object.keys(toolsFor(kind));
    assert.ok(tools.length >= 2, kind);
    for (const tool of Object.keys(TOOLS)) {
      const text = media === 'video' ? `8 seconds; a barista smiles; slow push-in; no on-screen text` : `A barista pours latte art, close-up, warm light, photorealistic, ${NEGATIVE_TAIL}`;
      const out = toolOutput(kind, tool, text, '');
      if (!tools.includes(tool)) { assert.equal(out, null, `${kind}/${tool}`); continue; }
      assert.equal(Boolean(out.params), tool === 'midjourney', `${kind}/${tool} params`);
      assert.equal(Boolean(out.negative), tool === 'kling', `${kind}/${tool} negative`);
      assert.equal(out.full.includes('--'), tool === 'midjourney');
      if (tool === 'midjourney') assert.doesNotMatch(out.main, /no logo/, 'yasaklar --no\'ya taşınır');
      if (tool === 'imagen' || tool === 'gptimage') assert.ok(out.main.endsWith(NEGATIVE_TAIL), 'metin içinde kalır');
    }
  }
  // İngilizce kalite kontrolü Midjourney parametresini hâlâ reddeder (parametre metne değil çıktıya eklenir)
  const q = checkPrompt('gorsel', `A barista, close-up, warm light, 50mm f/1.8, cream palette, cozy mood, photorealistic, ${NEGATIVE_TAIL} --ar 1:1`, 'en');
  assert.equal(q.checks.find(c => c.key === 'params').ok, false);
});

test('T.46 öğrenme döngüsü: örnek prompt istemlere girer; 👎 önerisi kimliği değiştirir; kimlik tarifle taşınır; karşılaştırma aynı istemi kullanır', async () => {
  const provider = fakeProvider([{ title: 'P', prompt: TR_OK }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Öğrenen' })).data.brand;
    const url = `/api/brands/${a.id}`;
    const ps = [];
    for (let i = 0; i < 3; i++) ps.push((await s.request('POST', `${url}/prompts`, { kind: 'gorsel', brief: `Latte ${i}` })).data.prompt);
    await s.request('PUT', `${url}/prompts/${ps[0].id}`, { example: true });
    for (const p of ps) await s.request('PUT', `${url}/feedback`, { targetType: 'prompt', targetId: p.id, vote: -1, reasons: ['karanlik'] });
    const sug = (await s.request('GET', `${url}/feedback/suggestions`)).data.suggestions;
    assert.deepEqual(sug.map(x => x.reason), ['karanlik']);
    await s.request('POST', `${url}/feedback/suggestions/karanlik/apply`);
    await s.request('POST', `${url}/prompts`, { kind: 'gorsel', brief: 'Yeni' });
    const sent = provider.calls.at(-1).prompt;
    assert.match(sent, /Işık: bright natural daylight/, 'öneri sonraki üretime yansır');
    assert.match(sent, /MARKANIN BEĞENDİĞİ ÖRNEKLER[\s\S]*ÖRNEK 1/);

    // Kimlik tarifi: başka markada boş cevaplar dolar; örnekler ve oylar taşınmaz
    const r = (await s.request('POST', `${url}/prompt-identity/recipe`, {})).data.recipe;
    const b = (await s.request('POST', '/api/brands', { name: 'Yeni marka' })).data.brand;
    await s.request('POST', `/api/recipes/${r.id}/apply`, { brandId: b.id });
    await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'Yeni' });
    const sentB = provider.calls.at(-1).prompt;
    assert.match(sentB, /Işık: bright natural daylight/);
    assert.doesNotMatch(sentB, /BEĞENDİĞİ ÖRNEKLER/);
    assert.deepEqual((await s.request('GET', `/api/brands/${b.id}/feedback/suggestions`)).data.suggestions, []);
  } finally { await s.stop(); }
});
