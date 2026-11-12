// 9.3–9.10 Tek akışta marka kurulumu ve Marka dosyası: dallanan adımlar, cevapların var olan kaynaklara yazılması
// (profil, hafıza, prompt kimliği, karakter kitabı), eksikler, kaldığı yerden devam ve arayüz akışı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, PNG_1PX } from './helpers.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }
const skip = !chromium && 'Playwright yok';
const png = { 'Content-Type': 'image/png' };
const ids = s => s.steps.map(x => x.id);

test('kurulum: adımlar cevaplara göre açılır, cevaplar kimliğin asıl yerlerine yazılır', async () => {
  const srv = await startServer();
  try {
    const b = (await srv.request('POST', '/api/brands', { name: 'Kurulum' })).data.brand;
    const url = `/api/brands/${b.id}/setup`;
    let d = (await srv.request('GET', url)).data;
    assert.deepEqual(ids(d), ['temel', 'yapi', 'kitle', 'ses', 'gorsel', 'bilgiler'], 'cevap yokken koşullu adımlar kapalı');
    assert.equal(d.started, false);
    assert.equal(d.next, 'temel');

    let r = await srv.request('PUT', `${url}/temel`, { name: 'Kurulum Kafe', sector: 'Kafe', description: 'Kampüs kafesi' });
    assert.equal(r.status, 200);
    assert.equal(r.data.next, 'yapi', 'kaldığı yerden devam: sıradaki adım');

    // Maskot var + görsel ve video içerik + mekân → maskot, görsel dil, video adımları açılır
    r = await srv.request('PUT', `${url}/yapi`, { channels: ['instagram', 'tiktok', 'yok'], contentKinds: ['post', 'reels'], hasMascot: true, hasPlace: true });
    assert.deepEqual(ids(r.data), ['temel', 'yapi', 'kitle', 'ses', 'gorsel', 'maskot', 'gorseldil', 'video', 'bilgiler']);
    assert.deepEqual(r.data.setup.channels, ['instagram', 'tiktok'], 'bilinmeyen kanal alınmaz');
    assert.equal((await srv.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity.hasMascot, true, 'maskot cevabı prompt kimliğine de yazılır');

    await srv.request('PUT', `${url}/kitle`, { audience: 'Öğrenciler', goals: 'Bilinirlik', monthlyGoal: 12 });
    await srv.request('PUT', `${url}/ses`, { character: 'Samimi', tone: 'Sen diliyle', banned: 'ucuz, bedava', preferred: 'Kahven hazır\nMola zamanı' });
    await srv.request('PUT', `${url}/gorsel`, { primary: '#c2410c', secondary: ['#ffffff', 'kötü'], font_heading: 'Poppins', font_body: 'Inter' });
    await srv.request('PUT', `${url}/maskot`, { name: 'Çekirdek', look: 'Turuncu kahve çekirdeği', personality: 'Meraklı', voice: 'Esprili', speech: 'Selam kanka!\nKahve?', never: 'Kötü söz\nÜzgün görünmek' });
    await srv.request('PUT', `${url}/gorseldil`, { visualStyle: 'gercekci', lighting: 'dogal', mood: ['samimi', 'enerjik'], avoid: 'alkol, kalabalık' });
    await srv.request('PUT', `${url}/video`, { camera: 'yakin', places: 'kafe içi, bahçe' });
    r = await srv.request('PUT', `${url}/bilgiler`, { urunler: 'Latte 110 TL', hikaye: '', adres: 'Kampüs girişi', saatler: '08–22' });
    assert.equal(r.data.complete, true);
    assert.equal(r.data.percent, 100);

    // Tek doğru: veriler profil, hafıza, prompt kimliği ve karakter kitabında
    const brand = (await srv.request('GET', `/api/brands/${b.id}`)).data.brand;
    assert.equal(brand.name, 'Kurulum Kafe');
    assert.equal(brand.audience, 'Öğrenciler');
    assert.equal(brand.monthlyGoal, 12);
    assert.equal(brand.colors.primary, '#c2410c');
    assert.deepEqual(brand.colors.secondary, ['#ffffff']);
    assert.deepEqual(brand.fonts, { heading: 'Poppins', body: 'Inter' });
    const mem = (await srv.request('GET', `/api/brands/${b.id}/memory`)).data.memory;
    assert.deepEqual(mem.banned, ['ucuz', 'bedava']);
    assert.deepEqual(mem.preferred, ['Kahven hazır', 'Mola zamanı']);
    assert.deepEqual(mem.facts.map(f => f.title).sort(), ['Adres ve iletişim', 'Ürün ve hizmetler', 'Çalışma saatleri'].sort(), 'boş hikâye kart açmaz');
    const idt = (await srv.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity;
    assert.equal(idt.mascotName, 'Çekirdek');
    assert.equal(idt.visualStyle, 'gercekci');
    assert.deepEqual(idt.mood, ['samimi', 'enerjik']);
    assert.deepEqual(idt.avoid, ['alkol', 'kalabalık']);
    assert.equal(idt.camera, 'yakin');
    const book = (await srv.request('GET', `/api/brands/${b.id}/character-book`)).data.book;
    assert.equal(book.name, 'Çekirdek');
    assert.deepEqual(book.speech, ['Selam kanka!', 'Kahve?']);

    // Bilgiler yeniden kaydedilince kart çoğalmaz; boşaltılan kart silinir
    await srv.request('PUT', `${url}/bilgiler`, { urunler: 'Latte 120 TL', adres: '', saatler: '08–22' });
    const facts = (await srv.request('GET', `/api/brands/${b.id}/memory`)).data.memory.facts;
    assert.equal(facts.length, 2);
    assert.equal(facts.find(f => f.title === 'Ürün ve hizmetler').content, 'Latte 120 TL');

    // Eksikler veriden hesaplanır: logo ve maskot pozu yüklenmedi
    d = (await srv.request('GET', url)).data;
    assert.ok(d.steps.find(s => s.id === 'gorsel').needs.includes('Logo'));
    assert.ok(d.steps.find(s => s.id === 'maskot').needs.includes('Maskot pozları'));
    await srv.request('POST', `/api/brands/${b.id}/assets?category=logo&label=Logo`, PNG_1PX, png);
    await srv.request('POST', `/api/brands/${b.id}/assets?category=mascot&label=Mutlu`, PNG_1PX, png);
    d = (await srv.request('GET', url)).data;
    assert.ok(!d.steps.find(s => s.id === 'gorsel').needs.includes('Logo'));
    assert.equal(d.mascots.length, 1);
    assert.ok(d.logo && d.logo.url);

    // Maskot "yok" olunca maskot adımı kapanır ve tamamlanmış sayılmaz; prompt kimliği de maskotsuz olur
    r = await srv.request('PUT', `${url}/yapi`, { channels: ['linkedin'], contentKinds: ['yazi'], hasMascot: false, hasPlace: false });
    assert.deepEqual(ids(r.data), ['temel', 'yapi', 'kitle', 'ses', 'gorsel', 'bilgiler']);
    assert.ok(!r.data.setup.done.includes('maskot'));
    assert.equal((await srv.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity.hasMascot, false);
    assert.equal((await srv.request('PUT', `${url}/maskot`, { name: 'X' })).status, 400, 'kapalı adım kaydedilmez');
    assert.equal((await srv.request('PUT', `${url}/yok`, {})).status, 404);
    assert.equal((await srv.request('PUT', `${url}/temel`, { name: '' })).status, 400, 'marka adı zorunlu');
    // Prompt kimliğinde maskot açılırsa kurulum da "var" görür (tek doğru)
    await srv.request('PUT', `/api/brands/${b.id}/prompt-identity`, { hasMascot: true });
    d = (await srv.request('GET', url)).data;
    assert.equal(d.setup.hasMascot, true);
    assert.ok(ids(d).includes('maskot'));
  } finally { await srv.stop(); }
});

test('kurulum arayüzü: yeni marka → adım adım (dallanma, yükleme) → Marka dosyası; Düzenle ve eski adresler', { skip }, async () => {
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|status of (400|404|409)/.test(m.text())) problems.push('console: ' + m.text()); });
  try {
    await page.goto(srv.base + '/#/marka/yeni');
    await page.getByLabel('Marka adı *').fill('Akış Kafe');
    await page.getByLabel('Ne markası? (sektör)').fill('Kafe');
    await page.getByRole('button', { name: 'Markayı oluştur ve devam et' }).click();
    await page.waitForURL(/\/kimlik\/kurulum\/yapi$/);
    const brandId = page.url().match(/#\/m\/([^/]+)\//)[1];
    await page.locator('#su-form').waitFor();
    assert.equal(await page.locator('.setup-steps li').count(), 6, 'cevap yokken 6 adım');
    assert.ok(await page.locator('.setup-steps li.done').first().isVisible(), 'ilk adım tamamlandı işaretli');

    // Yapı: maskot var + reels → maskot, görsel dil ve video adımları eklenir
    await page.locator('.chip-check', { hasText: 'Instagram' }).click();
    await page.locator('.chip-check', { hasText: 'Reels / kısa video' }).click();
    await page.locator('.chip-check', { hasText: 'Evet, maskot var' }).click();
    await page.locator('.chip-check', { hasText: 'Hayır, çevrim içi' }).click();
    await page.getByRole('button', { name: 'Kaydet ve devam et' }).click();
    await page.waitForURL(/\/kurulum\/kitle$/);
    await page.getByLabel('Hedef kitle').waitFor();
    assert.equal(await page.locator('.setup-steps li').count(), 9, 'dallanan adımlar eklendi');
    await page.getByLabel('Hedef kitle').fill('Öğrenciler');
    await page.getByRole('button', { name: 'Kaydet ve devam et' }).click();
    await page.waitForURL(/\/kurulum\/ses$/);
    await page.getByRole('link', { name: 'Şimdilik atla' }).click();
    await page.waitForURL(/\/kurulum\/gorsel$/);

    // Logo yükleme yazılanları silmez
    await page.locator('#su-primary').fill('#aa3300');
    await page.locator('[data-upload="logo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1PX });
    await page.locator('img.ds-logo').waitFor();
    assert.equal(await page.locator('#su-primary').inputValue(), '#aa3300');
    await page.getByRole('button', { name: 'Kaydet ve devam et' }).click();
    await page.waitForURL(/\/kurulum\/maskot$/);
    await page.getByLabel('Maskotun adı').fill('Çekirdek');
    await page.locator('[data-upload="mascot"]').setInputFiles({ name: 'mutlu.png', mimeType: 'image/png', buffer: PNG_1PX });
    await page.locator('.ds-poses img').waitFor();
    await page.getByRole('button', { name: 'Kaydet ve devam et' }).click();
    await page.waitForURL(/\/kurulum\/gorseldil$/);
    await page.locator('.chip-check', { hasText: 'Gerçekçi fotoğraf' }).click();
    await page.getByRole('button', { name: 'Kaydet ve devam et' }).click();
    await page.waitForURL(/\/kurulum\/video$/);
    await page.getByRole('button', { name: 'Kaydet ve devam et' }).click();
    await page.waitForURL(/\/kurulum\/bilgiler$/);
    assert.equal(await page.getByLabel('Adres ve iletişim').count(), 0, 'mekân yoksa adres sorulmaz');
    await page.getByLabel('Ürün ve hizmetler (fiyatlarla)').fill('Latte 110 TL');
    await page.getByRole('button', { name: 'Kaydet ve devam et' }).click(); // ses atlandığı için "bitir" değil
    // Atlanan adım var: bitirince atlanan adıma (ses) döner
    await page.waitForURL(/\/kurulum\/ses$/);
    await page.getByLabel('Marka bir insan olsaydı nasıl biri olurdu?').fill('Samimi');
    await page.getByLabel('Kullanılmaması gereken kelimeler').fill('ucuz');
    await page.getByRole('button', { name: 'Kaydet ve devam et' }).click(); // ileride tamamlanmamış adım yok → Marka dosyası
    await page.waitForURL(new RegExp(`#/m/${brandId}/kimlik$`));
    await page.locator('.toast', { hasText: 'Kurulum tamamlandı' }).waitFor();

    // Marka dosyası: hepsi tek yerde
    for (const t of ['Marka', 'Kanallar ve içerikler', 'Ses ve dil', 'Logo, renk ve font', 'Maskot', 'Görsel dil', 'Video', 'Bilgiler']) {
      assert.ok(await page.getByRole('heading', { name: t, exact: true }).isVisible(), t);
    }
    assert.match(await page.locator('#ds-ses').innerText(), /ucuz/);
    assert.match(await page.locator('#ds-maskot').innerText(), /Çekirdek/);
    assert.match(await page.locator('#ds-bilgiler').innerText(), /Latte 110 TL/);
    assert.equal(await page.locator('.sidebar a[href$="/hafiza"], .sidebar a[href$="/prompt-kimligi"]').count(), 0, 'menüde tek Marka kimliği');

    // Düzenle: aynı sayfa, kaydedince Marka dosyasına döner
    await page.locator('#ds-temel').getByRole('link', { name: 'Düzenle' }).click();
    await page.waitForURL(/\/kimlik\/duzenle\/temel$/);
    await page.getByLabel('Sloganı var mı?').fill('Her yudum bir mola');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await page.waitForURL(new RegExp(`#/m/${brandId}/kimlik$`));
    assert.match(await page.locator('#ds-temel').innerText(), /Her yudum bir mola/);

    // Sekmeler ve eski adresler
    await page.getByRole('link', { name: 'Ses ve hafıza' }).click();
    await page.getByRole('heading', { name: 'Kullanılmaması gereken kelimeler' }).waitFor();
    await page.goto(`${srv.base}/#/m/${brandId}/hafiza`);
    await page.waitForURL(/\/kimlik\/ses$/);
    await page.goto(`${srv.base}/#/m/${brandId}/prompt-kimligi`);
    await page.waitForURL(/\/kimlik\/prompt$/);
    assert.equal(await page.locator('[data-q="mascotName"]').count(), 0, 'maskot soruları Maskot sekmesinde');
    await page.getByRole('link', { name: 'Maskot', exact: true }).click();
    await page.locator('#cb-card').waitFor();
    assert.match(await page.locator('.dossier-dl').innerText(), /Çekirdek/);
    // Profil ↔ Görsel kimlik geçişinde kaydedilmemiş yazı kaybolmaz
    await page.getByRole('link', { name: 'Profil', exact: true }).click();
    await page.getByLabel('Hedef kitle').fill('Kaydedilmemiş yazı');
    await page.getByRole('link', { name: 'Görsel kimlik' }).click();
    await page.waitForURL(/\/kimlik\/gorsel$/);
    await page.getByRole('link', { name: 'Profil', exact: true }).click();
    assert.equal(await page.getByLabel('Hedef kitle').inputValue(), 'Kaydedilmemiş yazı');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await srv.stop(); }
});
