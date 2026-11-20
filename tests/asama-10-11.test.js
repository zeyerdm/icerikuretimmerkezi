// Aşama 10–11 sunucu testleri: içerik havuzu (türler, kullanıldı, arşiv, rastgele, benzerini üret, tekrar uyarısı),
// fikirden ve şablondan post, sabit açılış/kapanış, şablon adları, YouTube kapağı (kendi çekiminden), karşılama sohbeti
// (önce yükle, yalnız eksikleri sor, bitiş), kurulumun yeni adımları (YouTube, seslendirme), dışa aktarmanın kaldırılması.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';

const png = { 'Content-Type': 'image/png' };
const B64 = PNG_1PX.toString('base64');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const upload = async (s, brandId, category, label = 'x') => (await s.request('POST', `/api/brands/${brandId}/assets?category=${category}&label=${encodeURIComponent(label)}`, PNG_1PX, png)).data.asset;
// Arka plandaki yapay zekâ işinin bitmesini bekler
async function waitAi(s, brandId, ms = 5000) {
  const t0 = Date.now();
  for (;;) {
    const st = (await s.request('GET', `/api/brands/${brandId}/onboard`)).data.state;
    if (st.ai && st.ai.status !== 'calisiyor') return st.ai;
    if (Date.now() - t0 > ms) throw new Error('yapay zekâ işi bitmedi');
    await new Promise(r => setTimeout(r, 50));
  }
}
const postTexts = (n = 1) => ({ title: 'Başlık', caption: 'Açıklama', hashtags: ['#kahve'], slides: Array.from({ length: n }, (_, i) => ({ title: `Slayt ${i + 1} başlık`, body: `Gövde ${i + 1}`, items: [], cta: i === n - 1 ? 'Hemen gel' : '' })) });

test('10.4–10.6 içerik havuzu: tür, durum filtreleri, kullanıldı, arşiv, toplu işlem, rastgele seçim ve tekrar uyarısı', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Havuz' })).data.brand;
    const url = `/api/brands/${b.id}/ideas`;
    const a = (await s.request('POST', url, { title: 'Barista ipucu süt köpürtme', category: 'egitici', format: 'reels' })).data.idea;
    const p = (await s.request('POST', url, { title: 'Haftanın menüsü', category: 'bilgilendirici', format: 'post' })).data.idea;
    const g = (await s.request('POST', url, { title: 'Kampüs anketi', category: 'eglenceli' })).data.idea;
    assert.equal(a.format, 'reels'); assert.equal(g.format, 'genel');
    assert.equal((await s.request('POST', url, { title: 'X', category: 'egitici', format: 'yok' })).status, 400);
    // Çok benzer başlık uyarısı
    const dup = (await s.request('POST', url, { title: 'Barista ipucu: süt köpürtme', category: 'egitici' })).data.idea;
    assert.equal(dup.similarTo.id, a.id);
    // Rastgele: tür verilince o tür, yoksa Genel; kullanılan ve arşivdeki girmez
    for (let i = 0; i < 5; i++) assert.equal((await s.request('POST', `${url}/random`, { format: 'post' })).data.idea.id, p.id);
    const used = (await s.request('POST', `${url}/${p.id}/use`, { place: 'post' })).data;
    assert.equal(used.idea.used, true); assert.deepEqual(used.idea.usedIn, ['post']); assert.equal(used.warning, null);
    const r2 = (await s.request('POST', `${url}/random`, { format: 'post' })).data.idea;
    assert.ok(r2 && r2.format === 'genel', 'post kalmayınca Genel fikirden seçilir');
    const again = (await s.request('POST', `${url}/${p.id}/use`, { place: 'prompt' })).data;
    assert.match(again.warning, /Post stüdyosu/, 'başka yerde kullanılınca uyarı');
    await s.request('PATCH', `${url}/${g.id}`, { archived: true });
    await s.request('PATCH', `${url}/${dup.id}`, { archived: true });
    const exclude = [];
    for (let i = 0; i < 6; i++) { const r = (await s.request('POST', `${url}/random`, { exclude })).data.idea; if (r) exclude.push(r.id); }
    assert.deepEqual(exclude, [a.id], 'yalnız kullanılmamış ve arşivde olmayan; exclude sonrası boş');
    // Durum filtreleri
    const ids = async q => (await s.request('GET', `${url}?status=${q}`)).data.ideas.map(i => i.id).sort();
    assert.deepEqual(await ids('kullanildi'), [p.id]);
    assert.deepEqual(await ids('kullanilmamis'), [a.id]);
    assert.deepEqual(await ids('arsiv'), [dup.id, g.id].sort());
    assert.equal((await s.request('GET', url)).data.ideas.length, 2, 'varsayılan liste arşivi göstermez');
    assert.equal((await s.request('GET', `${url}?format=reels`)).data.ideas.length, 1);
    // Elle kullanılmadı yapılabilir
    assert.equal((await s.request('PATCH', `${url}/${p.id}`, { used: false })).data.idea.used, false);
    await s.request('PATCH', `${url}/${p.id}`, { used: true });
    // Toplu: arşivle sonra sil
    assert.equal((await s.request('POST', `${url}/bulk-used`, { action: 'arsivle' })).data.changed, 1);
    assert.equal((await s.request('POST', `${url}/bulk-used`, { action: 'sil' })).data.changed, 1);
    assert.equal((await s.request('POST', `${url}/bulk-used`, { action: 'yok' })).status, 400);
    // Takvime giren fikir kullanıldı olur
    await s.request('POST', '/api/contents', { brandId: b.id, title: a.title, type: 'reels', ideaId: a.id, scheduledAt: '2026-12-01T10:00:00.000Z' });
    const after = (await s.request('GET', `${url}?status=hepsi`)).data.ideas.find(i => i.id === a.id);
    assert.deepEqual(after.usedIn, ['takvim']);
    assert.equal((await s.request('POST', `${url}/random`, {})).data.idea, null, 'havuzda kullanılmamış fikir kalmadı');
  } finally { await s.stop(); }
});

test('10.5 benzerlerini üret: aynı tür ve kategoride kaydeder, var olanın benzerini atlar; AI yoksa açık hata', async () => {
  const off = await startServer();
  try {
    const b0 = (await off.request('POST', '/api/brands', { name: 'AI yok' })).data.brand;
    const i0 = (await off.request('POST', `/api/brands/${b0.id}/ideas`, { title: 'Bir fikir', category: 'egitici' })).data.idea;
    assert.ok((await off.request('POST', `/api/brands/${b0.id}/ideas/${i0.id}/similar`, { count: 2 })).status >= 400);
  } finally { await off.stop(); }
  const provider = fakeProvider([{ ideas: [{ title: 'Latte sanatı için 3 ipucu', description: 'Kısa video' }, { title: 'Barista ipucu süt köpürtme', description: 'aynısı' }, { title: 'Evde soğuk kahve', description: '' }] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Benzer' })).data.brand;
    const src = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Barista ipucu süt köpürtme', category: 'egitici', format: 'reels' })).data.idea;
    const r = await s.request('POST', `/api/brands/${b.id}/ideas/${src.id}/similar`, { count: 3 });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.deepEqual(r.data.ideas.map(i => i.title), ['Latte sanatı için 3 ipucu', 'Evde soğuk kahve']);
    assert.equal(r.data.skipped, 1);
    assert.ok(r.data.ideas.every(i => i.format === 'reels' && i.category === 'egitici' && i.source === 'benzer'));
    assert.match(provider.calls[0].prompt, /Barista ipucu süt köpürtme/);
    assert.match(provider.calls[0].prompt, /aynısını ya da çok benzerini YAZMA/);
  } finally { await s.stop(); }
});

test('10.8 / 11.10 / 11.12 post: şablon eşleşmesi, fikirden ve konudan şablonla üretim, sabit açılış/kapanış, şablon adları', async () => {
  const provider = fakeProvider([p => (/GÖREV/.test(p) || /slayt/i.test(p) ? postTexts(3) : postTexts(3))]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Şablonlu', colors: { primary: '#c2410c' } })).data.brand;
    const url = `/api/brands/${b.id}`;
    // Şablon kaynağı: 3 slaytlık boş carousel → şablon (ad verilmeyince "Şablon 1")
    const blank = (await s.request('POST', `${url}/posts`, { blank: true, kind: 'carousel', title: 'Kaynak' })).data.post;
    const data = blank.data; data.slides = [data.slides[0], JSON.parse(JSON.stringify(data.slides[0])), JSON.parse(JSON.stringify(data.slides[0]))];
    await s.request('PUT', `${url}/posts/${blank.id}`, { data });
    const t1 = (await s.request('POST', `${url}/posts/${blank.id}/template`, { name: '' })).data.template;
    assert.equal(t1.name, 'Şablon 1');
    const t2 = (await s.request('POST', `${url}/posts/${blank.id}/template`, {})).data.template;
    assert.equal(t2.name, 'Şablon 2');
    // Eşleşme: Post + Bilgilendirici
    const m = (await s.request('PUT', `${url}/post-templates/${t1.id}/match`, { formats: ['post', 'yok'], categories: ['bilgilendirici'] })).data.template;
    assert.deepEqual(m.match, { formats: ['post'], categories: ['bilgilendirici'], frame: '', autoTitle: false, isDefault: false });
    const idea = (await s.request('POST', `${url}/ideas`, { title: 'Haftanın menüsü', category: 'bilgilendirici', format: 'post' })).data.idea;
    const r = await s.request('POST', `${url}/posts/from-idea`, { ideaId: idea.id });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.template.id, t1.id, 'eşleşen şablon seçildi');
    assert.equal(r.data.post.data.slides.length, 3);
    const titles = r.data.post.data.slides.map(sl => sl.layers.find(l => l.role === 'title').text);
    assert.deepEqual(titles, ['Slayt 1 başlık', 'Slayt 2 başlık', 'Slayt 3 başlık'], 'metin şablonun katmanlarına yerleşti');
    assert.match(provider.calls.at(-1).prompt, /Haftanın menüsü/);
    const usedIdea = (await s.request('GET', `${url}/ideas?status=hepsi`)).data.ideas.find(i => i.id === idea.id);
    assert.deepEqual(usedIdea.usedIn, ['post']);
    // Konudan üretimde şablon seçimi
    const c = await s.request('POST', `${url}/posts`, { topic: 'Kış içecekleri', kind: 'carousel', templateId: t2.id });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    assert.equal(c.data.post.template.id, t2.id);
    // Sabit açılış (başlık konuya göre) ve kapanış; tek açılış kuralı
    await s.request('PUT', `${url}/post-templates/${t2.id}/match`, { frame: 'acilis', autoTitle: true });
    const k = (await s.request('POST', `${url}/posts/${blank.id}/template`, { name: 'Kapanış' })).data.template;
    await s.request('PUT', `${url}/post-templates/${k.id}/match`, { frame: 'kapanis' });
    const withFrames = (await s.request('POST', `${url}/posts`, { topic: 'Yeni menü', kind: 'carousel', slides: 3 })).data.post;
    assert.equal(withFrames.data.slides.length, 5, 'açılış + 3 içerik + kapanış');
    assert.equal(withFrames.data.slides[0].frame, 'acilis');
    assert.equal(withFrames.data.slides[0].layers.find(l => l.role === 'title').text, 'Başlık', 'açılış başlığı post başlığı oldu');
    assert.equal(withFrames.data.slides[4].frame, 'kapanis');
    // Yeni açılış seçilince eskisi normal şablona döner
    await s.request('PUT', `${url}/post-templates/${t1.id}/match`, { formats: ['post'], frame: 'acilis' });
    const list = (await s.request('GET', `${url}/post-templates`)).data.templates;
    assert.equal(list.filter(t => t.match.frame === 'acilis').length, 1);
    assert.equal(list.find(t => t.id === t2.id).match.frame, '');
    // Açılış şablonu fikir eşleşmesinde içerik şablonu olarak seçilmez
    const idea2 = (await s.request('POST', `${url}/ideas`, { title: 'Başka menü', category: 'bilgilendirici', format: 'post' })).data.idea;
    const r2 = (await s.request('POST', `${url}/posts/from-idea`, { ideaId: idea2.id })).data;
    assert.equal(r2.template, null);
    // Tekil post (carousel değil) açılış/kapanış almaz
    const single = (await s.request('POST', `${url}/posts`, { topic: 'Tek', kind: 'post' })).data.post;
    assert.equal(single.data.slides.length, 1);
    assert.equal((await s.request('POST', `${url}/posts/from-idea`, { ideaId: 'yok' })).status, 404);
  } finally { await s.stop(); }
});

test('10.9 YouTube kapağı: çekim zorunlu, referans almayan model reddedilir, çekim + referans + yazı modele gider', async () => {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, body });
    if (u.host === 'generativelanguage.googleapis.com') {
      if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] });
      return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1290 } });
    }
    return json({}, 404);
  };
  const s = await startServer({ fetchImpl: impl });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kanal', colors: { primary: '#e11d48' } })).data.brand;
    const url = `/api/brands/${b.id}/youtube/cover`;
    assert.equal((await s.request('POST', url, { shotIds: [], text: 'X' })).status, 400, 'çekimsiz kapak yok');
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' })).status, 200);
    const shot = await upload(s, b.id, 'brand_image', 'Kare 1');
    const ref = await upload(s, b.id, 'reference', 'Pinterest kapak');
    const other = (await s.request('POST', '/api/brands', { name: 'Başka' })).data.brand;
    const foreign = await upload(s, other.id, 'brand_image');
    assert.equal((await s.request('POST', url, { shotIds: [foreign.id] })).status, 400, 'başka markanın görseli olmaz');
    const r = await s.request('POST', url, { shotIds: [shot.id], refIds: [ref.id], text: '3 MALZEME YETER', composition: 'yazı solda', emotion: 'şaşkın' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.asset.category, 'ai_image');
    assert.match(r.data.asset.label, /YouTube kapağı: 3 MALZEME YETER/);
    const call = calls.filter(c => c.path.endsWith(':generateContent')).at(-1);
    const parts = call.body.contents[0].parts;
    assert.match(parts[0].text, /creator's OWN footage/);
    assert.match(parts[0].text, /typography style/);
    assert.match(parts[0].text, /"3 MALZEME YETER"/);
    assert.match(parts[0].text, /#e11d48/);
    assert.equal(parts.filter(p => p.inline_data).length, 2, 'çekim ve referans görselleri gider');
    assert.deepEqual(call.body.generationConfig.imageConfig, { aspectRatio: '16:9' });
  } finally { await s.stop(); }
});

test('11.1–11.4 karşılama sohbeti: atılanlar yerine konur, yalnız eksikler sorulur, cevap/geç tekrar sorulmaz, bitiş', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Sohbet' })).data.brand;
    const url = `/api/brands/${b.id}/onboard`;
    let st = (await s.request('GET', url)).data;
    assert.equal(st.state.absorbed, false);
    assert.deepEqual(st.questions, [], 'atma adımı bitmeden soru yok');
    const logo = await upload(s, b.id, 'other', 'logo');
    const mascot = await upload(s, b.id, 'other', 'maskot');
    const ref = await upload(s, b.id, 'other', 'ref');
    const pal = await upload(s, b.id, 'other', 'palet');
    st = (await s.request('POST', `${url}/absorb`, {
      files: [{ id: logo.id, kind: 'logo' }, { id: mascot.id, kind: 'maskot' }, { id: ref.id, kind: 'referans' }, { id: pal.id, kind: 'palet' }],
      colors: { palette: ['#c2410c', '#ffffff', 'kötü'], logo: ['#000000'] },
      text: 'Kısa metin', ideas: '- Barista ipucu Reels\n2) Haftanın menüsü post\nYouTube vlog bölümü'
    })).data;
    const cats = Object.fromEntries((await s.request('GET', `/api/brands/${b.id}/assets`)).data.assets.map(a => [a.id, a.category]));
    assert.equal(cats[logo.id], 'logo'); assert.equal(cats[mascot.id], 'mascot'); assert.equal(cats[ref.id], 'reference'); assert.equal(cats[pal.id], 'reference');
    const brand = (await s.request('GET', `/api/brands/${b.id}`)).data.brand;
    assert.equal(brand.colors.primary, '#c2410c', 'palet logodan önce');
    assert.deepEqual(brand.colors.secondary, ['#ffffff']);
    assert.equal(brand.description, 'Kısa metin', 'AI yokken metin açıklama olur');
    const ideas = (await s.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas;
    assert.deepEqual(ideas.map(i => i.format).sort(), ['post', 'reels', 'youtube']);
    assert.ok(st.found.some(f => /Logo/.test(f)) && st.found.some(f => /Maskot/.test(f)));
    assert.equal((await s.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity.hasMascot, true);
    const keys = st.questions.map(q => q.key);
    for (const k of ['logo', 'hasMascot', 'colors', 'description', 'ideas', 'mascotUpload']) assert.ok(!keys.includes(k), `${k} sorulmamalı`);
    for (const k of ['sector', 'mascotName', 'channels', 'contentKinds', 'audience', 'tone', 'banned', 'hasPlace']) assert.ok(keys.includes(k), `${k} sorulmalı`);
    assert.ok(st.questions.find(q => q.key === 'banned').options.includes('Ünlü ve gerçek kişi adları'), 'hazır seçenek');
    // Cevaplar asıl kayıtlara yazılır; cevaplanan ve geçilen soru tekrar gelmez
    st = (await s.request('PUT', `${url}/answer/sector`, { value: 'Kafe / restoran' })).data;
    st = (await s.request('PUT', `${url}/answer/channels`, { value: ['instagram', 'youtube'] })).data;
    st = (await s.request('PUT', `${url}/answer/banned`, { value: ['Ünlü ve gerçek kişi adları', 'ucuz'] })).data;
    st = (await s.request('PUT', `${url}/answer/mascotName`, { value: 'Çekirdek' })).data;
    st = (await s.request('PUT', `${url}/answer/audience`, { skip: true })).data;
    const left = st.questions.map(q => q.key);
    for (const k of ['sector', 'channels', 'banned', 'mascotName', 'audience']) assert.ok(!left.includes(k), `${k} tekrar sorulmamalı`);
    assert.equal((await s.request('GET', `/api/brands/${b.id}`)).data.brand.sector, 'Kafe / restoran');
    const mem = (await s.request('GET', `/api/brands/${b.id}/memory`)).data.memory;
    assert.deepEqual(mem.banned, ['Ünlü ve gerçek kişi adları', 'ucuz']);
    const idt = (await s.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity;
    assert.equal(idt.noRealPeople, true); assert.equal(idt.mascotName, 'Çekirdek');
    assert.equal((await s.request('GET', `/api/brands/${b.id}/character-book`)).data.book.name, 'Çekirdek');
    const setup = (await s.request('GET', `/api/brands/${b.id}/setup`)).data;
    assert.deepEqual(setup.setup.channels, ['instagram', 'youtube']);
    assert.ok(setup.steps.some(x => x.id === 'youtube'), 'YouTube kanalı YouTube adımını açar');
    assert.equal((await s.request('PUT', `${url}/answer/colors`, { value: ['kötü'] })).status, 400);
    assert.equal((await s.request('PUT', `${url}/answer/yok`, { value: 1 })).status, 404);
    // Bitiş (AI yok): dürüst not, sahte üretim yok
    const fin = (await s.request('POST', `${url}/finish`, {})).data;
    assert.equal(fin.state.finished, true);
    assert.equal(fin.done.length, 0);
    assert.match(fin.notes.join(' '), /Yapay zekâ bağlı olmadığı için/);
    assert.equal(fin.state.ai, undefined, 'AI yokken arka plan işi başlamaz');
  } finally { await s.stop(); }
});

test('11.4 bitiş (AI var): fikir havuzu benzerleriyle dolar, referanstan örnek şablon çıkar', async () => {
  const provider = fakeProvider([p => {
    const w = () => Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) + 'x';
    if (p.startsWith('BENZER İÇERİK')) return { ideas: [0, 1, 2].map(() => ({ title: `${w()} ${w()} ${w()}`, description: '' })) };
    if (p.startsWith('TASARIM REFERANSI')) return { summary: 'Sade', mood: 'sade', format: '4:5', background: '#ffffff', palette: [{ hex: '#c2410c', role: 'vurgu' }], fonts: { heading: 'Poppins', body: 'Inter' }, blocks: [{ type: 'text', role: 'title', text: 'Başlık buraya', x: 0.1, y: 0.1, w: 0.8, size: 0.08, weight: 800, align: 'left', color: '#1b1f3b' }], tips: [] };
    return { reply: 'x' };
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Dolu' })).data.brand;
    const url = `/api/brands/${b.id}/onboard`;
    const ref = await upload(s, b.id, 'other', 'ref');
    await s.request('POST', `${url}/absorb`, { files: [{ id: ref.id, kind: 'referans' }], ideas: 'Kahve molası\nSınav haftası' });
    const fin = await s.request('POST', `${url}/finish`, {});
    assert.equal(fin.status, 200, JSON.stringify(fin.data));
    assert.equal(fin.data.state.finished, true, 'bitiş anında');
    assert.equal(fin.data.state.ai.status, 'calisiyor', 'yapay zekâ arka planda');
    const ai = await waitAi(s, b.id);
    assert.equal(ai.status, 'bitti');
    assert.ok((await s.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas.length >= 8, 'havuz dolu');
    assert.ok(ai.found.some(d => /şablonu hazırlandı/.test(d)), JSON.stringify(ai));
    assert.ok((await s.request('GET', `/api/brands/${b.id}/setup`)).data.onboardAi.found.length, 'Marka dosyası durumu görür');
    assert.equal((await s.request('GET', `/api/brands/${b.id}/post-templates`)).data.templates[0].name, 'Örnek tasarım (referanstan)');
  } finally { await s.stop(); }
});

test('9.5 kurulum: Reels sesi ve YouTube kapak tarzı asıl yerlere yazılır; kapak fikri istemi tarzı içerir', async () => {
  const provider = fakeProvider([{ summary: '', ideas: [{ name: 'A', text: 'KAHVE', promise: 'p', emotion: '', composition: 'c', imagePrompt: 'cup', colors: [] }] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Ses' })).data.brand;
    const url = `/api/brands/${b.id}/setup`;
    assert.equal((await s.request('PUT', `${url}/youtube`, { thumbStyle: 'yuz' })).status, 400, 'YouTube yokken adım kapalı');
    await s.request('PUT', `${url}/yapi`, { channels: ['youtube'], contentKinds: ['reels'], hasMascot: false, hasPlace: false });
    assert.equal((await s.request('PUT', `${url}/video`, { camera: 'yakin', voice: 'Puck', voiceStyle: 'Samimi' })).status, 200);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/reels/settings`)).data.settings.voice, 'Puck');
    assert.equal((await s.request('PUT', `${url}/youtube`, { thumbStyle: 'yuz' })).status, 200);
    await s.request('PUT', `${url}/gorseldil`, { productStyle: 'flatlay' });
    const idt = (await s.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity;
    assert.equal(idt.thumbStyle, 'yuz'); assert.equal(idt.productStyle, 'flatlay');
    await s.request('POST', `/api/brands/${b.id}/youtube/ideas`, { topic: 'Latte yapımı' });
    assert.match(provider.calls.at(-1).prompt, /KANALIN KAPAK TARZI.*yakın yüz/);
    const d = (await s.request('GET', url)).data;
    assert.ok(d.voices.Puck && d.voice.voice === 'Puck');
  } finally { await s.stop(); }
});

test('10.1 marka geneli dışa aktarma kaldırıldı; takvim aktarımı duruyor', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Aktar' })).data.brand;
    assert.equal((await s.request('GET', '/api/export/types')).status, 404);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/export.json`)).status, 404);
    const ics = await s.request('GET', `/api/brands/${b.id}/calendar.ics`);
    assert.equal(ics.status, 200);
    assert.match(String(ics.data), /BEGIN:VCALENDAR/);
  } finally { await s.stop(); }
});

test('11.1 hız: atma adımı yapay zekâ beklemez; okumalar bitişte arka planda ve paralel; süre sınırı; küçük resim gider', async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const seen = [];
  const spans = []; // her yavaş okumanın başlangıç/bitiş zamanı: paralellik süre eşiğiyle değil, çakışmayla ölçülür
  const slowRead = async ms => { const sp = { start: Date.now() }; spans.push(sp); await sleep(ms); sp.end = Date.now(); };
  const provider = {
    id: 'fake', label: 'Yavaş', calls: [],
    async generate(prompt, opts) {
      seen.push({ prompt: prompt.slice(0, 40), images: (opts && opts.images || []).map(i => i.data.length) });
      if (/MASKOT KARAKTER KİTABI/.test(prompt)) { await slowRead(700); return { name: 'Ayıcık', lookEn: 'A blue bear', colors: [], personality: 'Meraklı', speech: [], never: [] }; }
      if (/MARKA KİMLİĞİ/.test(prompt)) { await slowRead(700); return { profile: { sector: 'Teknoloji', audience: 'Gençler' }, colors: {}, fonts: {}, notes: '' }; }
      return { reply: 'x' };
    },
    async test() { return { ok: true, modelCount: 1, modelAvailable: true }; }
  };
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Hızlı' })).data.brand;
    const big = Buffer.concat([PNG_1PX, Buffer.alloc(300000)]); // büyük dosya gibi
    const m = (await s.request('POST', `/api/brands/${b.id}/assets?category=other&label=m`, big, png)).data.asset;
    await s.request('PUT', `/api/brands/${b.id}/assets/${m.id}/thumb`, PNG_1PX, png); // tarayıcının ürettiği küçük resim
    let t0 = Date.now();
    await s.request('POST', `/api/brands/${b.id}/onboard/absorb`, { files: [{ id: m.id, kind: 'maskot' }], text: 'Hızlı, gençlere teknoloji anlatan bir içerik markası. Her gün kısa videolar ve postlar paylaşıyoruz.' });
    assert.ok(Date.now() - t0 < 500, 'atma adımı yapay zekâ beklemez');
    assert.equal(seen.length, 0, 'atma adımında yapay zekâ çağrılmaz');
    t0 = Date.now();
    const fin = (await s.request('POST', `/api/brands/${b.id}/onboard/finish`, {})).data;
    assert.ok(Date.now() - t0 < 500, 'bitiş anında');
    assert.equal(fin.state.ai.status, 'calisiyor');
    const ai = await waitAi(s, b.id);
    // Paralel: ikinci okuma birincisi bitmeden başlar (sıralı olsaydı biri bittikten sonra başlardı). Yavaş CI makinesinde de kararlı.
    assert.equal(spans.length, 2, 'iki yavaş okuma');
    const [a1, a2] = [...spans].sort((x, y) => x.start - y.start);
    assert.ok(a2.start < a1.end, `iki okuma paralel (ikinci ${a2.start - a1.start} ms sonra başladı, birincisi ${a1.end - a1.start} ms sürdü)`);
    assert.ok(ai.found.some(f => /karakter kitabı/.test(f)) && ai.found.some(f => /Metinden/.test(f)), JSON.stringify(ai));
    const br = (await s.request('GET', `/api/brands/${b.id}`)).data.brand;
    assert.equal(br.audience, 'Gençler', 'boş alan dolduruldu');
    const mascotCall = seen.find(c => /MASKOT/.test(c.prompt));
    assert.equal(mascotCall.images[0], PNG_1PX.length, 'büyük dosya değil küçük resim gönderildi');
  } finally { await s.stop(); }
  // Süre sınırı
  const slow = { id: 'fake', label: 'Çok yavaş', async generate() { await sleep(1500); return { profile: {}, colors: {}, fonts: {} }; }, async test() { return { ok: true, modelCount: 1, modelAvailable: true }; } };
  const s2 = await startServer({ aiProvider: slow, onboardReadMs: 200 });
  try {
    const b = (await s2.request('POST', '/api/brands', { name: 'Sınır' })).data.brand;
    await s2.request('POST', `/api/brands/${b.id}/onboard/absorb`, { text: 'Uzun bir tanıtım metni; markamız çocuklara kodlama öğreten bir eğitim kurumudur ve her hafta atölye yapar.' });
    const t0 = Date.now();
    await s2.request('POST', `/api/brands/${b.id}/onboard/finish`, {});
    const ai = await waitAi(s2, b.id);
    assert.ok(Date.now() - t0 < 1200, 'sınırda kesildi');
    assert.match(ai.notes.join(' '), /bitmedi/);
  } finally { await s2.stop(); }
});

test('Post kart düzeni (eski sistem tarzı): vurgulu başlık, slayta uygun maskot pozu ve balon, rozet, kapak büyük harf; hızlı (düşük çaba) istek', async () => {
  const calls = [];
  const provider = { id: 'fake', label: 'Hızlı', async generate(prompt, opts) { calls.push({ prompt, opts }); return { title: 'Kahve rehberi', caption: 'x', hashtags: [], slides: [
    { title: 'Sınavda *kahve* nasıl içilir?', body: 'Kısa açıklama', speech: 'Kaydırarak incele', pose: 'Mutlu' },
    { title: 'Önce *su* iç', body: 'Bir bardak su', speech: 'Önce su!', pose: 'Şaşkın' },
    { title: 'Kaydet', body: 'Son', speech: '', pose: 'yok-boyle-poz' }] }; }, async test() { return { ok: true, modelCount: 1, modelAvailable: true }; } };
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Kart', colors: { primary: '#c2410c' } })).data.brand;
    const mutlu = await upload(s, b.id, 'mascot', 'Mutlu');
    const saskin = await upload(s, b.id, 'mascot', 'Şaşkın');
    await upload(s, b.id, 'logo', 'Logo');
    const r = await s.request('POST', `/api/brands/${b.id}/posts`, { topic: 'Kahve rehberi', kind: 'carousel', slides: 3 });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.match(calls[0].prompt, /\*yıldız\*/);
    assert.match(calls[0].prompt, /Mutlu, Şaşkın/, 'pozlar isteme girer');
    const sl = r.data.post.data.slides;
    const L = (i, role) => sl[i].layers.find(l => l.role === role);
    assert.equal(L(0, 'title').text, 'SINAVDA *KAHVE* NASIL IÇILIR?'.replace('IÇILIR', 'İÇİLİR'), 'kapak büyük harf, vurgu korunur');
    assert.equal(L(0, 'title').highlight, '#c2410c');
    assert.equal(L(0, 'num'), undefined, 'kapakta rozet yok');
    assert.equal(L(1, 'num').text, '02'); assert.equal(L(1, 'page').text, '/ 03');
    const img = i => sl[i].layers.filter(l => l.type === 'image').map(l => l.assetId);
    assert.ok(img(0).includes(mutlu.id), 'kapakta Mutlu pozu');
    assert.ok(img(1).includes(saskin.id), '2. slaytta Şaşkın pozu');
    assert.equal(L(1, 'speech').text, 'Önce su!');
    assert.equal(L(2, 'speech').text, 'Kaydet, lazım olur! 🚀', 'son slaytta varsayılan kapanış balonu');
    assert.ok(sl.every(x => x.bg === sl[0].bg), 'bütün slaytlar aynı koyu zemin');
    // Kaydedilip yeniden açılınca vurgu rengi ve logo hizası korunur
    const saved = (await s.request('PUT', `/api/brands/${b.id}/posts/${r.data.post.id}`, { data: r.data.post.data })).data.post;
    assert.equal(saved.data.slides[0].layers.find(l => l.role === 'title').highlight, '#c2410c');
    assert.ok(saved.data.slides[0].layers.some(l => l.type === 'image' && l.align === 'left'), 'logo sola yaslı');
  } finally { await s.stop(); }
});

test('Toplu fikir ekleme: satır satır ayrı fikir, işaretler silinir, tür/kategori satır satır (AI ile ya da anahtar kelimeyle), tekrarlar eklenmez', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Toplu' })).data.brand;
    const u = `/api/brands/${b.id}/ideas`;
    await s.request('POST', u, { title: 'Barista ipucu süt köpürtme', category: 'egitici' });
    const text = ['1. Kahve nasıl demlenir rehberi (Reels)', '- Yılbaşı kampanya indirimi postu', '• Barista ipucu: süt köpürtme', 'Komik barista anları video', 'Kahve nasıl demlenir rehberi Reels', '', 'Kampüs gündemi bu hafta'].join('\n');
    const r = await s.request('POST', `${u}/bulk`, { text });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const t = Object.fromEntries(r.data.added.map(i => [i.title, i]));
    assert.deepEqual(Object.keys(t).sort(), ['Kahve nasıl demlenir rehberi (Reels)', 'Komik barista anları video', 'Kampüs gündemi bu hafta', 'Yılbaşı kampanya indirimi postu'].sort());
    assert.equal(t['Kahve nasıl demlenir rehberi (Reels)'].format, 'reels'); assert.equal(t['Kahve nasıl demlenir rehberi (Reels)'].category, 'egitici');
    assert.equal(t['Yılbaşı kampanya indirimi postu'].format, 'post'); assert.equal(t['Yılbaşı kampanya indirimi postu'].category, 'ozel_gun');
    assert.equal(t['Komik barista anları video'].category, 'eglenceli');
    assert.equal(t['Kampüs gündemi bu hafta'].category, 'guncel');
    assert.equal(r.data.skipped.length, 2);
    assert.ok(r.data.skipped.some(x => /havuzda/.test(x.reason)) && r.data.skipped.some(x => /listede/.test(x.reason)));
    // Sabit tür ve kategori
    const r2 = (await s.request('POST', `${u}/bulk`, { text: 'Bir\nİki farklı fikir', format: 'youtube', category: 'trend' })).data;
    assert.ok(r2.added.every(i => i.format === 'youtube' && i.category === 'trend'));
    assert.equal((await s.request('POST', `${u}/bulk`, { text: '   ' })).status, 400);
    assert.equal((await s.request('POST', `${u}/bulk`, { text: 'x', format: 'yok' })).status, 400);
  } finally { await s.stop(); }
  // AI ile satır satır sınıflandırma
  const provider = fakeProvider([{ items: [{ n: 1, format: 'story', category: 'satis' }, { n: 2, format: 'youtube', category: 'egitici' }] }]);
  const s2 = await startServer({ aiProvider: provider });
  try {
    const b = (await s2.request('POST', '/api/brands', { name: 'Toplu AI' })).data.brand;
    const r = (await s2.request('POST', `/api/brands/${b.id}/ideas/bulk`, { text: 'Hafta sonu menüsü\nSıfırdan latte art' })).data;
    assert.deepEqual(r.added.map(i => [i.format, i.category]), [['story', 'satis'], ['youtube', 'egitici']]);
    assert.match(provider.calls[0].prompt, /1\. Hafta sonu menüsü\n2\. Sıfırdan latte art/);
  } finally { await s2.stop(); }
});
