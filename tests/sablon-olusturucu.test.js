// Şablon oluşturucu: mecra, süre, başlık/altyazı stili, palet, ton, betimleme, maskot, kısıtlar seçilir; kural şablonu
// kurulur (sabit bölümler hazır, [alanlar] doldurulur). Kendi stiller bütün markalarda; ortak kural şablonu ve örnek
// prompt; uygulamayla gelen hazır post tasarımları.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, fakeProvider } from './helpers.js';
import { composeRule, PLATFORMS, TITLE_STYLES } from '../server/services/promptPresets.js';
import { ruleHeadings } from '../server/services/prompts.js';

test('composeRule: video, carousel ve görsel için hook-olay-bitiş; seçimler şablona yazılır', () => {
  const v = composeRule({ platform: 'reels', duration: 20, title: 'karisik-vurgu', subtitle: 'kelime-vurgu', palette: 'pastel-pembe', tone: 'enerjik', details: 'detayli', mascot: 'var', noBrand: true, cta: 'kaydet', camera: 'hareketli', music: 'trend', scenes: true });
  assert.equal(v.kind, 'reels', 'Reels mecrası Reels türüne');
  assert.match(v.body, /^SAHNE \[NUMARASI\]/);
  assert.match(v.body, /9:16 video, 20 saniye/);
  assert.match(v.body, /\* Hook \(0–3 saniye\)/); assert.match(v.body, /\* Olay \(3–16 saniye\)/); assert.match(v.body, /\* Bitiş \(16–20 saniye\).*Kaydet/);
  assert.ok(v.body.includes(TITLE_STYLES[0].text));
  assert.match(v.body, /kelime kelime belirir.*#c084fc/);
  assert.match(v.body, /Marka, kurum ya da ürün adı yazılmayacak/);
  assert.match(v.body, /Sahne devamlılığı:/);
  assert.ok(ruleHeadings(v.body).includes('Yapı (hook, olay, bitiş)'));
  // Süre mecra sınırına çekilir; altyazı yok; başlık yok; maskot yok; marka adı serbest
  const s = composeRule({ platform: 'shorts', duration: 500, title: '', subtitle: 'yok', palette: '', details: 'yok', mascot: 'yok', noBrand: false });
  assert.match(s.body, /60 saniye/);
  assert.match(s.body, /Ekranda başlık yazısı olmayacak/);
  assert.match(s.body, /Kesinlikle altyazı oluşturulmayacak/);
  assert.match(s.body, /Maskot ya da karakter kullanılmaz/);
  assert.doesNotMatch(s.body, /Marka, kurum/);
  assert.doesNotMatch(s.body, /Renk paleti:/);
  assert.equal(s.kind, 'video');
  // Carousel ve tek görsel: süre/altyazı yok, kapak-ara-son
  const c = composeRule({ platform: 'carousel', title: 'zarif-serif', palette: 'marka', details: 'kisa', mascot: 'yok', cta: 'takip' }, { brand: { colors: { primary: '#ff6b00', secondary: ['#111111'] } } });
  assert.equal(c.kind, 'post');
  assert.match(c.body, /Hook \(kapak slaytı\)/); assert.match(c.body, /Bitiş \(son slayt\).*takip/);
  assert.match(c.body, /Marka renkleri: #ff6b00, #111111/);
  assert.doesNotMatch(c.body, /Altyazı:|saniye/);
  const g = composeRule({ platform: 'post', title: 'minimal', mascot: 'insan' });
  assert.equal(g.kind, 'gorsel'); assert.match(g.body, /\* Hook: /); assert.match(g.body, /insan sunucu/);
  assert.ok(Object.keys(PLATFORMS).length >= 8);
});

test('Stiller ve ortak kural şablonları: kendi stil, oluştur, ortak şablon başka markada, örnek prompt istemde', async () => {
  const provider = fakeProvider([{ title: 'Kahve', prompt: 'x' }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Bir' })).data.brand;
    const b2 = (await s.request('POST', '/api/brands', { name: 'İki' })).data.brand;
    const all = (await s.request('GET', '/api/prompt-presets')).data;
    assert.ok(all.title.length >= 8 && all.subtitle.length >= 5 && all.palette.length >= 8 && all.platforms.reels);
    // Kendi stil
    assert.equal((await s.request('POST', '/api/prompt-presets', { type: 'palette', name: 'Tek', colors: ['#ffffff'] })).status, 400);
    const pal = (await s.request('POST', '/api/prompt-presets', { type: 'palette', name: 'Benim paletim', colors: ['#112233', '#ffeedd', 'yanlış'] })).data.preset;
    assert.deepEqual(pal.colors, ['#112233', '#ffeedd']);
    const ts = (await s.request('POST', '/api/prompt-presets', { type: 'title', name: 'Benim başlığım', text: 'Mor kalın başlık, sarı gölge.', sample: ['Merhaba', '*dünya*'], preview: { bg: '#220033', color: '#ffffff', accent: '#ffcc00', fonts: ['Anton'], weight: 800, evil: '<script>' } })).data.preset;
    assert.equal(ts.preview.evil, undefined);
    const after = (await s.request('GET', '/api/prompt-presets')).data;
    assert.ok(after.title.some(t => t.id === ts.id && t.custom) && after.palette.some(p => p.id === pal.id));
    // Oluştur: kendi stillerle
    const comp = (await s.request('POST', `/api/brands/${a.id}/prompt-rules/compose`, { spec: { platform: 'tiktok', duration: 30, title: ts.id, palette: pal.id, subtitle: 'klasik', mascot: 'yok' } })).data;
    assert.match(comp.body, /Mor kalın başlık, sarı gölge/); assert.match(comp.body, /Benim paletim: #112233, #ffeedd/); assert.match(comp.body, /TikTok için 9:16 video, 30 saniye/);
    // Ortak şablon + örnek prompt; ikinci markada görünür ve varsayılan olarak kullanılır
    const rule = (await s.request('POST', `/api/brands/${a.id}/prompt-rules`, { name: comp.name, kind: comp.kind, body: comp.body, shared: true, isDefault: true, example: 'ÖRNEK: Kedi sabah kahvesini içiyor, yumuşak ışık.', spec: { platform: 'tiktok', duration: 30 } })).data.rule;
    assert.equal(rule.shared, true); assert.equal(rule.spec.platform, 'tiktok');
    const seen = (await s.request('GET', `/api/brands/${b2.id}/prompt-rules`)).data.rules;
    assert.ok(seen.some(r => r.id === rule.id && r.shared));
    await s.request('POST', `/api/brands/${b2.id}/prompts`, { kind: comp.kind, brief: 'Kedi videosu' });
    assert.match(provider.calls[0].prompt, /KURAL ŞABLONU/);
    assert.match(provider.calls[0].prompt, /ÖRNEK PROMPT[\s\S]*Kedi sabah kahvesini/);
    // Stil silme
    assert.equal((await s.request('DELETE', `/api/prompt-presets/${ts.id}`)).status, 204);
    assert.equal((await s.request('DELETE', `/api/prompt-presets/${ts.id}`)).status, 404);
  } finally { await s.stop(); }
});

test('Hazır post tasarımları: her markada listelenir, açılır, markanın şablonlarına eklenir, silinemez', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Hazır', colors: { primary: '#22aa55' } })).data.brand;
    const list = (await s.request('GET', `/api/brands/${b.id}/shared-templates`)).data.templates;
    const built = list.filter(t => t.builtin);
    assert.ok(built.length >= 7);
    assert.ok(built.every(t => t.data.slides.length === 3 && t.kind === 'carousel'));
    const dark = built.find(t => t.id === 'hazir-koyu-kart');
    const title = dark.data.slides[0].layers.find(l => l.role === 'title');
    assert.equal(title.highlight, '#22aa55', 'vurgu rengi markanın ana rengi');
    assert.ok(dark.data.slides[1].layers.some(l => l.role === 'num') && dark.data.slides[0].layers.some(l => l.role === 'bubble'));
    // Kutu vurgu: siyah kutudaki beyaz yazı beyaz kalır
    const box = built.find(t => t.id === 'hazir-kutu-vurgu').data.slides[0].layers.find(l => l.role === 'title');
    assert.equal(box.color, '#ffffff'); assert.equal(box.bgColor, '#111111');
    const used = (await s.request('POST', `/api/brands/${b.id}/shared-templates/hazir-pastel/use`, {})).data.post;
    assert.ok(used.id);
    const tb = await s.request('POST', `/api/brands/${b.id}/shared-templates/hazir-zarif-serif/to-brand`, {});
    assert.equal(tb.status, 201);
    const mine = (await s.request('GET', `/api/brands/${b.id}/post-templates`)).data.templates;
    assert.ok(mine.some(t => t.id === tb.data.template.id && t.data.slides.length === 3));
    assert.equal((await s.request('DELETE', '/api/shared-templates/hazir-pastel')).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/shared-templates/hazir-yok/use`, {})).status, 404);
  } finally { await s.stop(); }
});

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('Arayüz: şablon oluşturucuda kartlarla seçim, önizleme güncellenir, kaydedilir; hazır tasarım şablonlara eklenir', { skip: !chromium && 'Playwright yok' }, async () => {
  const s = await startServer({ aiProvider: fakeProvider([{ title: 'x', prompt: 'x' }]) });
  const b = (await s.request('POST', '/api/brands', { name: 'Oluşturucu' })).data.brand;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  try {
    await page.goto(`${s.base}/#/m/${b.id}/prompt`);
    await page.locator('[data-builder]').click();
    await page.waitForFunction(() => /Instagram Reels için 9:16/.test(document.querySelector('#rb-body').value));
    await page.locator('[data-rb="platform"][data-v="tiktok"]').click();
    await page.waitForFunction(() => /TikTok için 9:16/.test(document.querySelector('#rb-body').value));
    await page.locator('[data-rb="title"][data-v="zarif-serif"]').click();
    await page.locator('[data-rb="subtitle"][data-v="kutulu"]').click();
    await page.locator('[data-rb="mascot"][data-v="yok"]').click();
    await page.waitForFunction(() => { const v = document.querySelector('#rb-body').value; return /zarif dekoratif serif/.test(v) && /yarı saydam koyu kutu/.test(v) && /Maskot ya da karakter kullanılmaz/.test(v); });
    // Tür, şablon metniyle birlikte yeniden kurulur: yük altında bir an geç gelebilir, beklenir
    await page.waitForFunction(() => document.querySelector('#rb-kind').value === 'video');
    // Elle düzenleme korunur, istenirse yeniden kurulur
    await page.locator('#rb-body').fill((await page.locator('#rb-body').inputValue()) + '\nBenim notum:\nek kural');
    await page.locator('[data-rb="tone"][data-v="mizahi"]').click();
    await page.locator('[data-rb-regen]').waitFor();
    assert.match(await page.locator('#rb-body').inputValue(), /Benim notum/);
    await page.locator('[data-rb-check="noBrand"]').uncheck();
    await page.locator('input[name="shared"]').check();
    await page.locator('.modal [type=submit]').click();
    await page.locator('.toast', { hasText: 'Şablon kaydedildi' }).waitFor();
    const rules = (await s.request('GET', `/api/brands/${b.id}/prompt-rules`)).data.rules;
    assert.equal(rules.length, 1);
    assert.equal(rules[0].shared, true); assert.equal(rules[0].spec.platform, 'tiktok'); assert.equal(rules[0].spec.noBrand, false);
    assert.match(rules[0].body, /Benim notum/);
    // Video türünde üretim satırında seçili gelir
    await page.locator('[data-kind="video"]').click();
    await page.waitForFunction(() => !document.querySelector('#ps-rule').hidden);
    // Hazır tasarımı şablonlarına ekle
    await page.goto(`${s.base}/#/m/${b.id}/post`);
    await page.locator('[data-shared-tobrand="hazir-koyu-kart"]').click();
    await page.locator('.toast', { hasText: 'şablonlarına eklendi' }).waitFor();
    await page.locator('#qp-tpl option', { hasText: 'Koyu kart' }).waitFor({ state: 'attached' });
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});

test('Şablon oluşturucu: sabit kısımlar (mekân, karakter, stil) şablona köşeli alansız girer, üretimde kelimesi kelimesine kalır', async () => {
  const { composeRule } = await import('../server/services/promptPresets.js');
  const { compactTemplate, restoreFixed, ruleCheck: check } = await import('../server/services/prompts.js');
  const place = 'Modern yazılım ofisi; ahşap masa, iki monitör, arkada büyük pencere. Yumuşak gün ışığı soldan.';
  const r = composeRule({ platform: 'reels', duration: 15, details: 'detayli', mascot: 'var', fixedPlace: place + ' [silinir]', fixedCharacter: 'DEO: mavi peluş ayı, lacivert ceket.', fixedStyle: 'Sinematik 3D animasyon.' });
  assert.match(r.body, /Mekân ve ışık:\nModern yazılım ofisi; ahşap masa, iki monitör, arkada büyük pencere\. Yumuşak gün ışığı soldan\. silinir/);
  assert.match(r.body, /Konuya özel ayrıntılar:\n\[/);
  assert.match(r.body, /Görsel stil:\nSinematik 3D animasyon\./);
  assert.match(r.body, /aynı kalmalı\. DEO: mavi peluş ayı, lacivert ceket\./);
  const compact = compactTemplate(r.body);
  assert.ok(!compact.includes('ahşap masa'), 'sabit mekân modele yazdırılmaz');
  const out = restoreFixed(compact.replace(/\n\(SABİT BÖLÜM[^\n]*/g, '').replace(/\[[^\]\n]+\]/g, 'dolu'), r.body);
  assert.ok(out.includes(place));
  assert.equal(check(r.body, out).ok, true);
});
