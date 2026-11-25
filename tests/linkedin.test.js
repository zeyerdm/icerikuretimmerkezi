// LinkedIn: marka hafızasıyla LinkedIn yazısı, hazır içerikten uyarlama, kural denetimi, takvime kayıt;
// fikir havuzunda LinkedIn türü; Post stüdyosunda LinkedIn belgesi (carousel düzeni, LinkedIn dili).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, fakeProvider } from './helpers.js';
import { checkLinkedin } from '../server/services/linkedin.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

const LONG = 'Hukukta aradığınız kararı bulmak saatler sürmemeli.\n\n' + 'Avukatların en çok zaman kaybettiği yer içtihat taraması. Bunu ekip olarak yıllarca yaşadık ve çözümü ararken çok şey öğrendik.\n\n'.repeat(10) + 'Siz içtihat ararken en çok nerede zorlanıyorsunuz?\n\n#hukuk #legaltech';

test('Kural denetimi: uzun ilk satır, kısa metin, hashtag sayısı', () => {
  assert.deepEqual(checkLinkedin(LONG, ['#a', '#b', '#c']), []);
  const issues = checkLinkedin('x'.repeat(250) + '\n\nkısa', ['#a']);
  assert.ok(issues.some(i => /İlk satır 250/.test(i)));
  assert.ok(issues.some(i => /karakter; LinkedIn'de/.test(i)));
  assert.ok(issues.some(i => /Hashtag sayısı 1/.test(i)));
});

test('LinkedIn yazısı: marka hafızası ve ses; uyarlama; hashtag temizliği; takvime kaydetme; fikir ve belge', async () => {
  const provider = fakeProvider([p => (/LinkedIn içerik yazarısın\. Profesyonel/.test(p)
    ? { title: 'Belge', slides: [{ title: 'Kapak *kanca*', body: 'a' }, { title: 'İki', body: 'b' }, { title: 'Üç', body: 'c' }, { title: 'Son', body: 'd' }], caption: 'LinkedIn metni', hashtags: ['#hukuk'] }
    : { title: 'İçtihat aramada zaman', text: LONG, hashtags: ['hukuk', '#LegalTech', '#hukuk', 'yapay zeka', '#avukat'] })]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Lexonomi', sector: 'Hukuk teknolojisi' })).data.brand;
    const url = `/api/brands/${b.id}/linkedin/write`;
    assert.equal((await s.request('POST', url, {})).status, 400, 'konu ya da kaynak gerekir');
    assert.equal((await s.request('POST', url, { brief: 'x', voice: 'yok' })).status, 400);
    const r = (await s.request('POST', url, { brief: 'İçtihat aramada zaman kaybı', voice: 'kisisel', person: 'Ayşe Yılmaz, Kurucu' })).data;
    const p0 = provider.calls[0].prompt;
    assert.match(p0, /LinkedIn içerik yazarısın/);
    assert.match(p0, /MARKA HAFIZASI:[\s\S]*Lexonomi/);
    assert.match(p0, /Ayşe Yılmaz, Kurucu adına, birinci tekil/);
    assert.match(p0, /İlk satır kanca/);
    assert.equal(r.text.endsWith('nerede zorlanıyorsunuz?'), true, 'metnin sonuna yazılmış hashtag satırı atılır');
    assert.deepEqual(r.hashtags, ['#hukuk', '#LegalTech', '#yapayzeka', '#avukat'], 'tekrar atılır, boşluk birleşir');
    assert.deepEqual(r.issues, []);

    // Uyarlama: fikirden (fikir LinkedIn'de kullanıldı olarak işaretlenir) ve tasarımdan
    const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'LinkedIn için içtihat ipuçları', category: 'egitici', format: 'linkedin' })).data.idea;
    assert.equal(idea.formatLabel, 'LinkedIn');
    await s.request('POST', url, { source: { kind: 'idea', id: idea.id } });
    assert.match(provider.calls.at(-1).prompt, /UYARLANACAK İÇERİK[\s\S]*FİKİR: LinkedIn için içtihat ipuçları/);
    const ideas = (await s.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas;
    assert.ok(ideas.find(i => i.id === idea.id).usedInLabels.includes('LinkedIn'));

    // Takvime kaydet → içerik türü LinkedIn yazısı; güncelleme aynı içeriğe yazar
    const sv = (await s.request('POST', `/api/brands/${b.id}/linkedin/save`, { title: r.title, text: r.text, hashtags: r.hashtags, scheduledAt: '2026-12-01T06:00:00.000Z', voice: 'kisisel' })).data;
    assert.equal(sv.content.type, 'linkedin'); assert.equal(sv.content.typeLabel, 'LinkedIn yazısı');
    assert.equal(sv.content.caption, r.text); assert.deepEqual(sv.content.hashtags, r.hashtags);
    assert.match(sv.content.notes, /Kurucu \/ yönetici adına/);
    const up = (await s.request('POST', `/api/brands/${b.id}/linkedin/save`, { contentId: sv.content.id, text: 'Yeni metin', hashtags: '#a #b #c' })).data;
    assert.equal(up.content.id, sv.content.id); assert.equal(up.content.caption, 'Yeni metin');
    assert.equal(up.content.scheduledAt, '2026-12-01T06:00:00.000Z', 'tarih verilmezse korunur');
    assert.equal((await s.request('GET', `/api/contents?brandId=${b.id}&type=linkedin`)).data.contents.length, 1);

    // Post stüdyosunda LinkedIn belgesi: carousel düzeni (çok sayfa), LinkedIn dili, takvimde "LinkedIn belgesi"
    const meta = (await s.request('GET', '/api/meta')).data;
    assert.equal(meta.posts.kinds.linkedin, 'LinkedIn belgesi');
    assert.equal(meta.contentTypes.linkedin_belge, 'LinkedIn belgesi');
    const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { topic: 'İçtihat arama rehberi', kind: 'linkedin', slides: 4 })).data.post;
    const pp = provider.calls.at(-1).prompt;
    assert.match(pp, /LinkedIn belge \(PDF\) carousel/);
    assert.match(pp, /LinkedIn paylaşım metni/);
    assert.doesNotMatch(pp, /Instagram içerik yazarısın/);
    assert.equal(post.kind, 'linkedin');
    assert.equal(post.data.slides.filter(x => !x.frame).length, 4);
    // Tasarımdan uyarlama: sayfa metinleri istemde
    await s.request('POST', url, { source: { kind: 'post', id: post.id } });
    assert.match(provider.calls.at(-1).prompt, /POST TASARIMI[\s\S]*1\. sayfa:/);
  } finally { await s.stop(); }
});

test('Arayüz: LinkedIn sayfası — yaz, önizle, kopyala, takvime kaydet; fikirden uyarlama bağlantısı', { skip: !chromium && 'Playwright yok' }, async () => {
  const provider = fakeProvider([{ title: 'İçtihat aramada zaman', text: LONG, hashtags: ['#hukuk', '#legaltech', '#avukat'] }]);
  const s = await startServer({ aiProvider: provider });
  const b = (await s.request('POST', '/api/brands', { name: 'Lexonomi' })).data.brand;
  const idea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Avukatlar için zaman', category: 'egitici', format: 'linkedin' })).data.idea;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
  const problems = []; page.on('pageerror', e => problems.push(e.message));
  try {
    await page.goto(`${s.base}/#/m/${b.id}/linkedin/idea-${idea.id}`);
    await page.locator('#li-write').waitFor();
    assert.equal(await page.locator('[data-src="idea"]').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('#li-pick').inputValue(), idea.id);
    await page.locator('#li-write').click();
    await page.locator('.li-more').waitFor();
    assert.match(await page.locator('#li-count').textContent(), /karakter · ilk satır \d+\/210/);
    assert.equal(await page.locator('#li-issues li').count(), 0);
    await page.locator('.li-more').click();
    assert.ok(await page.locator('.li-rest').isVisible());
    await page.locator('#li-copy').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /zorlanıyorsunuz\?\n\n#hukuk #legaltech #avukat/);
    await page.locator('#li-save').click();
    await page.locator('.li-item').first().waitFor();
    const cs = (await s.request('GET', `/api/contents?brandId=${b.id}&type=linkedin`)).data.contents;
    assert.equal(cs.length, 1); assert.ok(cs[0].scheduledAt, 'iş günü sabahına tarihlendi');
    const d = new Date(cs[0].scheduledAt); assert.ok(d.getDay() >= 1 && d.getDay() <= 5);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
