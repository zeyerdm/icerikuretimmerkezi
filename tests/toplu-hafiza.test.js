// Toplu testler: T.10 kimlik taslağı, T.12 marka hafızası, T.14 kalıp arşivi, T.15 rakipler (sunucu tarafı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

const brand = async (s, name, extra = {}) => (await s.request('POST', '/api/brands', Object.assign({ name }, extra))).data.brand;

test('T.10 kimlik taslağı: kısa metin reddi, alan sınırları, geçersiz renk/font, boş alanlar, harcama markaya', async () => {
  const provider = fakeProvider([{
    profile: { name: '  Kahve Durağı  ', sector: 'Kafe', description: 'x'.repeat(5000), audience: '', tone: 'Samimi, emojili' },
    colors: { primary: '#C2410C', secondary: ['#fff7ed', 'kırmızı', '#12'] },
    fonts: { heading: 'poppins', body: 'Comic Sans' },
    notes: 'Fiyat bilgisi metinde yok.'
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = await brand(s, 'Taslak');
    assert.equal((await s.request('POST', '/api/identity-draft', { text: 'Kısa metin' })).status, 400);
    const source = 'Kahve Durağı, kampüsün yanında öğrencilere uygun fiyatlı üçüncü dalga kahve sunan samimi bir kafedir. Ana rengimiz #C2410C.';
    const r = await s.request('POST', '/api/identity-draft', { text: source, brandId: b.id });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const d = r.data;
    assert.equal(d.profile.name, 'Kahve Durağı');
    assert.ok(d.profile.description.length < 5000, 'alan uzunluğu sınırlanmalı');
    assert.equal('audience' in d.profile, false, 'boş alan boş kalmalı (taslağa girmez)');
    assert.equal(d.colors.primary, '#c2410c');
    assert.deepEqual(d.colors.secondary, ['#fff7ed'], 'geçersiz HEX atılır');
    assert.equal(d.fonts.heading, 'Poppins', 'listedeki font eşlenir');
    assert.equal(d.fonts.body, undefined, 'listede olmayan font atılır');
    assert.match(provider.calls[0].prompt, /üçüncü dalga kahve/);
    // Taslak kaydedilmez
    assert.equal((await s.request('GET', '/api/brands')).data.brands.find(x => x.id === b.id).name, 'Taslak');
    // Harcama markaya yazılır
    const usage = (await s.request('GET', '/api/ai/usage')).data;
    assert.deepEqual(usage.byBrand.map(r => [r.k, r.calls]), [['Taslak', 1]], 'harcama markaya yazılmalı');
    assert.deepEqual(usage.byTask.map(r => r.k), ['yazim']);
  } finally { await s.stop(); }
});

test('T.12 marka hafızası: liste temizleme ve sınırlar, bilgi kartları, hafıza metni, denetçi, asistan işlemleri', async () => {
  const provider = fakeProvider([prompt => {
    if (prompt.startsWith('İÇERİK DENETİMİ')) return { score: 80, summary: 'İyi', issues: [], improved: '' };
    return { reply: 'Not aldım.', actions: [{ type: 'remember', category: 'saat', title: 'Hafta sonu', content: 'Cumartesi 10–22 açık' }, { type: 'forbid_words', words: ['ucuz', 'Ucuz', 'bedava'] }] };
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = await brand(s, 'Hafıza A');
    const b = await brand(s, 'Hafıza B');
    const url = `/api/brands/${a.id}/memory`;
    // Virgül/satır ayrımı, boşluk sadeleştirme, tekrar ve 60 kelime sınırı
    const m = (await s.request('PUT', url, { banned: ' indirim ,  süper   fırsat\nindirim,,', preferred: ['Kahven hazır!', '', 'Kahven hazır!'] })).data.memory;
    assert.deepEqual(m.banned, ['indirim', 'süper fırsat']);
    assert.deepEqual(m.preferred, ['Kahven hazır!']);
    const many = (await s.request('PUT', url, { banned: Array.from({ length: 80 }, (_, i) => 'k' + i) })).data.memory;
    assert.equal(many.banned.length, 60);
    assert.deepEqual(many.preferred, ['Kahven hazır!'], 'gönderilmeyen liste korunur');
    await s.request('PUT', url, { banned: ['indirim'] });

    // Bilgi kartları
    assert.equal((await s.request('POST', `${url}/facts`, { title: '', content: 'x' })).status, 400);
    assert.equal((await s.request('POST', `${url}/facts`, { title: 'x', content: 'y', category: 'yok' })).status, 400);
    const fact = (await s.request('POST', `${url}/facts`, { category: 'fiyat', title: 'Latte', content: '85 TL' })).data.fact;
    assert.equal(fact.categoryLabel, 'Fiyat');
    const upd = (await s.request('PUT', `${url}/facts/${fact.id}`, { content: '90 TL' })).data.fact;
    assert.equal(upd.content, '90 TL');
    assert.equal(upd.title, 'Latte');
    // Başka marka kartı göremez, değiştiremez, silemez
    assert.deepEqual((await s.request('GET', `/api/brands/${b.id}/memory`)).data.memory.facts, []);
    assert.equal((await s.request('PUT', `/api/brands/${b.id}/memory/facts/${fact.id}`, { content: 'z' })).status, 404);
    assert.equal((await s.request('DELETE', `/api/brands/${b.id}/memory/facts/${fact.id}`)).status, 404);

    // Hafıza metni (AI'ya giden) yasaklıları, tercihleri ve kartları içerir
    const preview = (await s.request('GET', url)).data.memory.preview;
    assert.match(preview, /ASLA KULLANMA[^\n]*indirim/);
    assert.match(preview, /Kahven hazır!/);
    assert.match(preview, /Latte/);
    assert.match(preview, /90 TL/);
    assert.doesNotMatch((await s.request('GET', `/api/brands/${b.id}/memory`)).data.memory.preview, /Latte/);

    // Denetçi yasaklı kelimeyi (büyük harf ve Türkçe karakterle) yakalar
    const rev = (await s.request('POST', `/api/brands/${a.id}/review`, { text: 'Bu hafta İNDİRİM var, kaçırma!', kind: 'serbest' })).data.review;
    assert.ok(rev.issues.some(i => /Yasaklı ifade.*indirim/.test(i.problem)), JSON.stringify(rev.issues));

    // Asistanın remember / forbid_words işlemleri
    const chat = (await s.request('POST', `/api/brands/${a.id}/chat`, { message: 'Hafta sonu saatlerini hatırla, ucuz kelimesini yasakla' })).data.assistantMessage.actions;
    assert.equal(chat.find(x => x.type === 'remember').ok, true);
    assert.equal(chat.find(x => x.type === 'forbid_words').ok, true);
    const after = (await s.request('GET', url)).data.memory;
    assert.ok(after.facts.some(f => f.title === 'Hafta sonu' && f.source === 'assistant' && f.category === 'saat'));
    assert.deepEqual(after.banned, ['indirim', 'ucuz', 'Ucuz', 'bedava'].filter((w, i, arr) => arr.indexOf(w) === i));
    assert.equal((await s.request('DELETE', `${url}/facts/${fact.id}`)).status, 204);
  } finally { await s.stop(); }
});

test('T.14 kalıp arşivi: çıktının temizlenmesi, kaynak doğrulaması, favori/düzenleme/silme, senaryo istemine girmesi, izolasyon', async () => {
  const PATTERN = { title: '  Aksilikle başla ', hookType: 'uydurma', hook: 'Herkesin yaşadığı bir aksilik', theme: 'Gündelik', structure: ['Aksilik', '', 'Çözüm', 'Ters köşe'], cta: '', why: 'Özdeşleşme', reuse: 'Kahve dökülmesiyle başla' };
  const scene = { duration: 6, start: 'Kafe', endFrame: 'Masa', beats: [{ from: 0, to: 6, action: 'Gülümser', camera: 'Yakın', sound: '' }], line: 'Kahve hazır, sakin ol ve nefes al biraz arkadaşım', lineFrom: 0, lineTo: 6, flowScene: 'smiles', flowSceneTr: 'gülümser' };
  const REELS = { title: 'Senaryo', format: 'skec', topic: 'x', why: 'y', punchline: 'z', setting: 'Kafe', screenTitle: 'Başlık', titleKeyword: 'kahve', scenes: [scene], ending: { twist: 't', lastFrame: 'l' }, caption: 'c', hashtags: [], music: 'm' };
  const provider = fakeProvider([p => (p.startsWith('REELS KALIBI') ? PATTERN : REELS)]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = await brand(s, 'Kalıp A');
    const b = await brand(s, 'Kalıp B');
    const url = `/api/brands/${a.id}/patterns`;
    assert.equal((await s.request('POST', url, { text: 'Metin', sourceType: 'gecersiz' })).status, 400);
    assert.equal((await s.request('POST', url, { text: '' })).status, 400);
    const p = (await s.request('POST', url, { text: 'Kahvemi döktüm, bunu yaşayan var mı?', sourceType: 'rakip', sourceNote: '@rakip' })).data.pattern;
    assert.equal(p.title, 'Aksilikle başla');
    assert.equal(p.hookType, 'diger', 'bilinmeyen giriş türü "diğer" olur');
    assert.deepEqual(p.structure, ['Aksilik', 'Çözüm', 'Ters köşe']);
    assert.equal(p.sourceLabel, 'Rakip');

    const fav = (await s.request('PUT', `${url}/${p.id}`, { favorite: true, hook: 'Yeni giriş', structure: 'Bir\nİki' })).data.pattern;
    assert.equal(fav.favorite, true);
    assert.equal(fav.hook, 'Yeni giriş');
    assert.deepEqual(fav.structure, ['Bir', 'İki']);
    assert.equal((await s.request('PUT', `/api/brands/${b.id}/patterns/${p.id}`, { favorite: false })).status, 404);

    // Seçilen kalıp senaryo istemine "izlenecek" olarak girer; seçilmezse favoriler örnek olur
    await s.request('POST', `/api/brands/${a.id}/reels`, { topic: 'Sınav haftası', patternId: p.id });
    assert.match(provider.calls.at(-1).prompt, /İZLENECEK KALIP[\s\S]*Yeni giriş/);
    await s.request('POST', `/api/brands/${a.id}/reels`, { topic: 'Yaz menüsü' });
    assert.match(provider.calls.at(-1).prompt, /KALIP ARŞİVİNDEKİ FAVORİLER[\s\S]*Yeni giriş/);
    await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'B konusu' });
    assert.doesNotMatch(provider.calls.at(-1).prompt, /Yeni giriş/, 'başka markanın kalıbı girmemeli');

    assert.equal((await s.request('DELETE', `${url}/${p.id}`)).status, 204);
    assert.deepEqual((await s.request('GET', url)).data.patterns, []);
  } finally { await s.stop(); }
});

test('T.15 rakipler: CRUD ve doğrulama, örneksiz analiz reddi, analiz temizliği, boşlukların hafızaya girmesi', async () => {
  const provider = fakeProvider([{ summary: 'Güçlü görsel dil', pillars: ['Ürün', '', 'Kampüs'], tone: 'Resmî', formats: ['Reels'], hooks: ['Soru'], strengths: ['Tutarlı renk'], weaknesses: ['Az etkileşim'],
    gaps: ['Öğrenci indirimi anlatılmıyor', 'Sabah rutini yok'], ideas: Array.from({ length: 9 }, (_, i) => 'Fikir ' + i) }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = await brand(s, 'Rakip A');
    const b = await brand(s, 'Rakip B');
    const url = `/api/brands/${a.id}/competitors`;
    assert.equal((await s.request('POST', url, { name: '' })).status, 400);
    const c = (await s.request('POST', url, { name: 'Komşu Kafe', handle: 'komsukafe', url: 'javascript:alert(1)' })).data.competitor;
    assert.equal(c.handle, '@komsukafe');
    assert.equal(c.url, '', 'http(s) olmayan bağlantı atılır');
    const u = (await s.request('PUT', `${url}/${c.id}`, { url: 'https://instagram.com/komsukafe', handle: '@komsukafe' })).data.competitor;
    assert.equal(u.url, 'https://instagram.com/komsukafe');
    assert.equal(u.handle, '@komsukafe');
    assert.equal(u.name, 'Komşu Kafe');

    // Örneksiz analiz reddedilir
    assert.equal((await s.request('POST', `${url}/${c.id}/analyze`, {})).status, 400);
    await s.request('PUT', `${url}/${c.id}`, { samples: 'Sabah kahvesi kampanyası! '.repeat(5) });
    const an = (await s.request('POST', `${url}/${c.id}/analyze`, {})).data.competitor.analysis;
    assert.deepEqual(an.pillars, ['Ürün', 'Kampüs']);
    assert.equal(an.ideas.length, 6, 'fikirler 6 ile sınırlı');
    assert.match(provider.calls[0].prompt, /Sabah kahvesi kampanyası/);
    // Boşluklar marka hafızasına girer (yalnız bu markanın)
    assert.match((await s.request('GET', `/api/brands/${a.id}/memory`)).data.memory.preview, /Komşu Kafe: Öğrenci indirimi anlatılmıyor/);
    assert.doesNotMatch((await s.request('GET', `/api/brands/${b.id}/memory`)).data.memory.preview, /Komşu Kafe/);
    // İzolasyon
    assert.equal((await s.request('POST', `/api/brands/${b.id}/competitors/${c.id}/analyze`, {})).status, 404);
    assert.deepEqual((await s.request('GET', `/api/brands/${b.id}/competitors`)).data.competitors, []);
    assert.equal((await s.request('DELETE', `${url}/${c.id}`)).status, 204);
  } finally { await s.stop(); }
});
