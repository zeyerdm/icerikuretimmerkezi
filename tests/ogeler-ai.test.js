// Öğe kütüphanesi (D1-D5), vektör katmanı ve döndürme, editörde AI komutları (A6), asistan görünümü,
// Prompt Studio'da tek tür seçimi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';
import { writeZip } from '../server/lib/zip.js';
import { prepareSvg } from '../server/services/elements.js';

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }
const skip = !chromium && 'Playwright yok';
const svgH = { 'Content-Type': 'image/svg+xml' };
const SVG = '<svg width="24" height="24"><path fill="#ff0000" d="M0 0h24v24z"/></svg>';
const read = n => JSON.parse(fs.readFileSync(new URL(`../public/vendor/packs/${n}`, import.meta.url), 'utf8'));

test('Öğe kaydı: paketler, lisanslar ve kategori ağacı tutarlı; yeni paketler güvenli SVG içerir', () => {
  const reg = read('registry.json');
  const ids = reg.packs.map(p => p.id);
  for (const id of ['temel', 'iconpark', 'sosyal', 'tabler', 'emoji', 'stickers']) assert.ok(ids.includes(id), id);
  for (const p of reg.packs) {
    assert.ok(p.license && p.license.spdx && p.license.commercial === true, `${p.id} ticari lisans`);
    assert.ok(fs.existsSync(new URL(`../public/vendor/packs/${p.file}`, import.meta.url)), p.file);
    assert.ok(!/SA|NC|ND|GPL/.test(p.license.spdx), `${p.id} süzgeçten geçer`);
  }
  assert.ok(reg.packs.reduce((n, p) => n + p.count, 0) > 9000, 'yaklaşık 10.000 öğe');
  assert.ok(reg.skipped.some(s => s.name === 'OpenMoji') && reg.skipped.some(s => s.name === 'unDraw'), 'alınmayanlar nedeniyle listelenir');
  const temel = read('temel.json'); const park = read('iconpark.json'); const sos = read('sosyal.json');
  assert.ok(temel.items.length >= 100 && park.items.length > 2000 && sos.items.length >= 30);
  const groups = new Set(temel.items.map(i => i.g));
  for (const g of ['sekiller', 'oklar', 'cizgiler', 'cerceveler', 'balonlar', 'etiketler', 'rozetler', 'susler', 'desenler', 'dokular']) assert.ok(groups.has(g), g);
  for (const it of [...temel.items, ...park.items, ...sos.items]) assert.ok(!/<script|javascript:|\son[a-z]+=|<foreignObject|href="http/i.test(it.b), it.i);
  assert.ok(park.items.every(i => !/#(000|2F88FF)\b/i.test(i.b)), 'IconPark tek renge indirildi');
  // Kategori alt kümeleri gerçek gruplara işaret eder
  const byPack = { temel: groups, iconpark: new Set(park.items.map(i => i.g)), sosyal: new Set(['sosyal']) };
  for (const c of reg.categories) for (const s of c.subs) if (byPack[s.pack]) assert.ok(byPack[s.pack].has(s.group), `${s.id} grubu var`);
  assert.ok(fs.readFileSync(new URL('../public/vendor/packs/LICENSE-Apache-2.0.txt', import.meta.url), 'utf8').includes('Apache License'));
  assert.ok(fs.readFileSync(new URL('../public/vendor/packs/LICENSES.txt', import.meta.url), 'utf8').includes('iconpark.json'));
});

test('SVG hazırlama: görünüm kutusu eklenir, tek renk renk değiştirilebilir olur, güvensiz SVG reddedilir', () => {
  const a = prepareSvg('<?xml version="1.0"?><!-- yorum --><svg width="10" height="20"><path fill="#123456" d="M0 0"/><path stroke="#123456" d="M1 1"/></svg>');
  assert.equal(a.viewBox, '0 0 10 20'); assert.equal(a.recolor, true);
  assert.ok(/fill="currentColor"/.test(a.svg) && /stroke="currentColor"/.test(a.svg) && /xmlns=/.test(a.svg));
  const b = prepareSvg('<svg viewBox="0 0 4 4"><path fill="#ff0000" d="M0 0"/><path fill="#00ff00" d="M1 1"/></svg>');
  assert.equal(b.recolor, false, 'çok renkli öğe olduğu gibi kalır');
  for (const bad of ['<svg><script>x</script></svg>', '<svg onload="x()"></svg>', '<svg><image href="http://a/b.png"/></svg>', '<svg><a xlink:href="javascript:x"/></svg>']) assert.throws(() => prepareSvg(bad), /güvenlik/);
});

test('Öğe yönetimi: lisans süzgeci, tekli ve ZIP yükleme, yayın, paket işlemleri, dosya ve lisans özeti', async () => {
  const s = await startServer();
  try {
    let r = await s.request('POST', '/api/elements?name=K&category=sekiller&license=CC0-1.0&tags=sevgi,Kırmızı', Buffer.from(SVG), svgH);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const el = r.data.element;
    assert.equal(el.recolor, true); assert.deepEqual(el.tags, ['sevgi', 'kırmızı']); assert.equal(el.categoryLabel, 'Şekiller');
    for (const [lic, msg] of [['CC-BY-SA-4.0', /aynı lisans/], ['CC-BY-NC-4.0', /ticari/], ['AGPL-3.0', /kaynak açma/], ['', /Lisans seç/], ['Bilmem', /listede yok/], ['MIT', /hak sahibinin/]]) {
      r = await s.request('POST', `/api/elements?name=X&license=${lic}`, Buffer.from(SVG), svgH);
      assert.equal(r.status, 400, lic); assert.match(r.data.error.message, msg);
    }
    r = await s.request('POST', '/api/elements?name=M&license=MIT&author=Ada', Buffer.from(SVG), svgH);
    assert.equal(r.status, 201, 'atıf isteyen lisans hak sahibiyle kabul edilir');
    r = await s.request('POST', '/api/elements?name=P&category=cikartmalar&license=LicenseRef-own', PNG_1PX, { 'Content-Type': 'image/png' });
    assert.equal(r.status, 201); assert.equal(r.data.element.kind, 'png'); assert.equal(r.data.element.width, 1);
    r = await s.request('POST', '/api/elements?name=J&license=CC0-1.0', Buffer.from([0xff, 0xd8, 0xff, 0x00]), { 'Content-Type': 'image/jpeg' });
    assert.equal(r.status, 400, 'JPEG öğe olarak alınmaz');
    // ZIP: klasör adı kategori, elements.json ad ve etiket; güvensiz dosya atlanır
    const zip = writeZip([
      { name: 'oklar/ok-bir.svg', data: Buffer.from(SVG) },
      { name: 'cerceveler/cer.svg', data: Buffer.from(SVG) },
      { name: 'kotu.svg', data: Buffer.from('<svg onload="x()"></svg>') },
      { name: '__MACOSX/._ok.svg', data: Buffer.from('x') },
      { name: 'elements.json', data: Buffer.from(JSON.stringify([{ file: 'ok-bir.svg', name: 'Kıvrık ok', tags: ['yön'] }])) }
    ]);
    r = await s.request('POST', '/api/elements/import?license=LicenseRef-purchased&pack=Bahar&published=0', zip, { 'Content-Type': 'application/zip' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.added, 2); assert.equal(r.data.failed.length, 1); assert.equal(r.data.failed[0].file, 'kotu.svg');
    const ok = r.data.elements.find(e => e.name === 'Kıvrık ok');
    assert.equal(ok.category, 'oklar'); assert.deepEqual(ok.tags, ['yön']); assert.equal(ok.published, false);
    assert.equal(r.data.elements.find(e => e.name === 'cer').category, 'cerceveler');
    // Yayında olmayanlar düzenleyici listesinde ve dosya adresinde görünmez
    let list = (await s.request('GET', '/api/elements')).data.elements;
    assert.ok(!list.some(e => e.pack === 'Bahar'));
    assert.equal((await s.request('GET', `/api/elements/${ok.id}/file`)).status, 404);
    assert.equal((await s.request('GET', '/api/elements?all=1')).data.elements.length, 5);
    r = await s.request('POST', '/api/elements/packs/publish', { pack: 'Bahar' });
    assert.equal(r.data.changed, 2);
    const f = await s.request('GET', `/api/elements/${ok.id}/file`);
    assert.equal(f.status, 200); assert.match(f.headers.get('content-type'), /svg/); assert.match(f.headers.get('content-security-policy'), /sandbox/);
    r = await s.request('PATCH', `/api/elements/${el.id}`, { name: 'Kalp', category: 'susler', published: false });
    assert.equal(r.data.element.name, 'Kalp'); assert.equal(r.data.element.published, false);
    assert.equal((await s.request('PATCH', `/api/elements/${el.id}`, { license: 'CC-BY-NC-4.0' })).status, 400);
    const sum = (await s.request('GET', '/api/elements/licenses')).data.custom;
    assert.ok(sum.some(x => x.license === 'LicenseRef-purchased' && x.pack === 'Bahar' && x.count === 2));
    r = await s.request('POST', '/api/elements/packs/delete', { pack: 'Bahar' });
    assert.equal(r.data.removed, 2);
    assert.equal((await s.request('DELETE', `/api/elements/${el.id}`)).status, 200);
    assert.equal((await s.request('GET', '/api/elements?all=1')).data.elements.length, 2);
    assert.equal((await s.request('POST', '/api/elements/packs/yok', { pack: 'x' })).status, 400);
  } finally { await s.stop(); }
});

test('Vektör katmanı, döndürme ve yüklenen öğe görseli kayıtta korunur; güvensiz SVG reddedilir', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Vektör' })).data.brand;
    const png = (await s.request('POST', '/api/elements?name=P&license=CC0-1.0', PNG_1PX, { 'Content-Type': 'image/png' })).data.element;
    const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'V', kind: 'post' })).data.post;
    const put = layers => s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#ffffff', layers }] } });
    let r = await put([
      { id: 'v1', type: 'vector', svg: '<svg viewBox="0 0 10 10"><path fill="currentColor" d="M0 0"/></svg>', x: 10, y: 10, w: 300, h: 300, color: '#e4572e', recolor: true, elementId: 'temel:sekiller-kalp', flipX: true, rot: 45, fit: 'cover', opacity: 20, evil: 1 },
      { id: 'i1', type: 'image', src: png.url, elementId: `custom:${png.id}`, x: 0, y: 0, w: 100, h: 100, rot: 400 }
    ]);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const [v, im] = r.data.post.data.slides[0].layers;
    assert.equal(v.type, 'vector'); assert.equal(v.color, '#e4572e'); assert.equal(v.recolor, true); assert.equal(v.elementId, 'temel:sekiller-kalp');
    assert.equal(v.flipX, true); assert.equal(v.rot, 45); assert.equal(v.fit, 'cover'); assert.equal(v.opacity, 20); assert.equal(v.evil, undefined);
    assert.equal(im.src, png.url); assert.equal(im.elementId, `custom:${png.id}`);
    assert.ok(im.rot >= -180 && im.rot <= 360, 'döndürme sınırlanır');
    r = await put([{ type: 'vector', svg: '<svg><script>alert(1)</script></svg>', x: 0, y: 0, w: 10, h: 10 }]);
    assert.equal(r.status, 400);
    r = await put([{ type: 'vector', svg: '<svg><image href="https://x.y/a.png"/></svg>', x: 0, y: 0, w: 10, h: 10 }]);
    assert.equal(r.status, 400, 'dış bağlantılı SVG reddedilir');
  } finally { await s.stop(); }
});

test('Editörde AI komutu: yalnızca gönderilen metinler değişir, sınır aşılırsa kısaltılır, bilinmeyen kimlik atılır', async () => {
  const provider = fakeProvider([{ changes: [{ id: 't1', text: 'Kısa başlık' }, { id: 't2', text: 'Bu metin çok çok çok uzun olduğu için kelime sınırında kısaltılmalı' }, { id: 'yok', text: 'x' }, { id: 't3', text: 'Aynı' }], note: 'Kısaltıldı' }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Komut' })).data.brand;
    const texts = [{ id: 't1', role: 'title', text: 'Uzun bir başlık metni', max: 20, slide: 0 }, { id: 't2', role: 'body', text: 'Gövde', max: 30, slide: 1 }, { id: 't3', role: 'cta', text: 'Aynı', max: 10 }];
    const r = await s.request('POST', `/api/brands/${b.id}/posts/ai-edit`, { command: 'kisalt', texts, topic: 'Kahve' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.changes.length, 2, 'değişmeyen ve bilinmeyen atılır');
    assert.deepEqual(r.data.changes[0], { id: 't1', before: 'Uzun bir başlık metni', text: 'Kısa başlık' });
    assert.ok(r.data.changes[1].text.length <= 30 && !r.data.changes[1].text.endsWith(' '), 'sınırda kelimeyle kesilir');
    assert.equal(r.data.note, 'Kısaltıldı');
    const p = provider.calls[0].prompt;
    assert.match(p, /Metinleri kısalt/); assert.match(p, /Yalnızca metinleri değiştir/); assert.match(p, /"max":20/);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/posts/ai-edit`, { command: 'serbest', texts })).status, 400, 'serbest komut istek ister');
    assert.equal((await s.request('POST', `/api/brands/${b.id}/posts/ai-edit`, { command: 'kisalt', texts: [] })).status, 400);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/posts/ai-edit`, { command: 'sil', texts })).status, 400);
  } finally { await s.stop(); }
});

test('Arayüz: Öğeler paneli, sürükle-bırak, favori, AI hızlı düzen ve önizlemeli AI komutu, yönetim ve lisans sayfaları, asistan görünümü', { skip }, async () => {
  const s = await startServer({ aiProvider: fakeProvider([{ changes: [{ id: 'tt1', text: 'Yeni kanca' }], note: '' }]) });
  const b = (await s.request('POST', '/api/brands', { name: 'Öğe UI', colors: { primary: '#e4572e' } })).data.brand;
  await s.request('POST', '/api/elements?name=Pırıltım&category=susler&license=CC0-1.0&tags=ışıltı', Buffer.from(SVG), svgH);
  const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'UI', kind: 'carousel' })).data.post;
  await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '4:5', slides: [{ bg: '#ffffff', layers: [{ id: 'tt1', type: 'text', role: 'title', text: 'Eski başlık', x: 90, y: 200, w: 800, size: 80, color: '#111111', font: 'Inter', weight: 800, align: 'left' }] }] } });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  const saved = async () => (await s.request('GET', `/api/brands/${b.id}/posts/${post.id}`)).data.post.data;
  try {
    await page.goto(`${s.base}/#/m/${b.id}/post/${post.id}`);
    await page.locator('#stage').waitFor();
    await page.locator('[data-rail="ogeler"]').click();
    await page.locator('.el-cat').first().waitFor();
    assert.ok(await page.locator('.el-cat', { hasText: 'Konuşma balonları' }).count());
    assert.ok(await page.locator('.el-cat', { hasText: 'Yüklenen öğeler' }).count(), 'yönetimden yüklenen kategori');
    // Kategori → alt kategori → tıkla: vektör katmanı
    await page.locator('.el-cat', { hasText: 'Oklar' }).click();
    await page.locator('[data-el-sub]').nth(1).click();
    await page.locator('.el-item').first().click();
    await page.waitForFunction(() => document.querySelector('.ed-save').textContent.includes('•') || true);
    // Türkçe arama (aksansız da bulur) ve yüklenen öğe
    await page.fill('#ed-el-q', 'piriltim');
    await page.waitForFunction(() => document.querySelectorAll('.el-item').length === 1);
    // Favori
    await page.locator('.el-cell').first().hover();
    await page.locator('[data-el-fav]').first().click();
    assert.equal(await page.locator('[data-el-fav].on').count(), 1);
    // Renk seç ve tuvale sürükle-bırak
    await page.locator('[data-el-color="#e4572e"]').click();
    await page.waitForTimeout(200);
    const box = await page.locator('#stage').boundingBox();
    await page.locator('.el-item').first().dragTo(page.locator('#stage'), { targetPosition: { x: box.width * 0.8, y: box.height * 0.8 } });
    await page.waitForTimeout(200);
    // Ana görünüm: son kullanılanlar ve favoriler
    await page.fill('#ed-el-q', '');
    await page.waitForSelector('text=Son kullanılanlar');
    assert.ok(await page.locator('text=Favoriler').count());
    // Desen tuvali kaplar ve en alta girer
    await page.locator('.el-cat', { hasText: 'Desenler' }).click();
    await page.locator('.el-item').first().click();
    await page.locator('.ed-save').click();
    await page.waitForFunction(() => document.querySelector('.ed-save').textContent.trim() === 'Kaydet');
    let d = await saved();
    const L = d.slides[0].layers;
    const vec = L.filter(l => l.type === 'vector');
    assert.ok(vec.length >= 3, JSON.stringify(L.map(l => l.type)));
    assert.equal(L[0].type, 'vector'); assert.equal(L[0].fit, 'cover'); assert.equal(L[0].x, 0); assert.equal(L[0].opacity, 20);
    assert.ok(vec.some(l => l.elementId && l.elementId.startsWith('custom:') && l.color === '#e4572e' && l.x > 540), 'sürüklenen öğe bırakılan yerde, seçilen renkte');
    // AI paneli: hızlı düzen (AI'sız) ve önizlemeli komut
    await page.locator('[data-rail="ai"]').click();
    await page.locator('[data-quick="dup"]').click();
    await page.waitForFunction(() => /2\s*\/\s*2/.test(document.body.textContent));
    await page.locator('[data-ai-scope="all"]').click();
    await page.locator('[data-ai-cmd="kanca"]').click();
    await page.locator('.ai-diff').waitFor();
    assert.ok(await page.locator('.ai-diff s', { hasText: 'Eski başlık' }).count());
    await page.locator('[data-ai-apply]').click();
    await page.locator('.ed-save').click();
    await page.waitForFunction(() => document.querySelector('.ed-save').textContent.trim() === 'Kaydet');
    d = await saved();
    assert.equal(d.slides.length, 2);
    assert.ok(d.slides.flatMap(sl => sl.layers).some(l => l.text === 'Yeni kanca'));
    // Asistan marka rengini kullanır
    assert.equal(await page.locator('.ai-widget.branded').count(), 1);
    // Yönetim ve lisans sayfaları
    await page.goto(`${s.base}/#/ayarlar/ogeler`);
    await page.locator('#el-up').waitFor();
    assert.ok(await page.locator('tr[data-id]').count() >= 1);
    await page.goto(`${s.base}/#/ayarlar/lisanslar`);
    await page.waitForSelector('text=IconPark ikonları');
    assert.ok(await page.locator('text=Apache License 2.0').count());
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});

test('Arayüz: kendi tasarımı silinir (çöp kutusuna gider), hazır şablonlarda silme düğmesi yok', { skip }, async () => {
  const s = await startServer();
  const b = (await s.request('POST', '/api/brands', { name: 'Silme' })).data.brand;
  const p1 = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Silinecek', kind: 'post' })).data.post;
  await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Kalacak', kind: 'post' });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  try {
    await page.goto(`${s.base}/#/m/${b.id}/post`);
    await page.locator('.post-card-wrap').nth(1).waitFor();
    assert.equal(await page.locator('.tpl-card [data-post-menu]').count(), 0, 'şablon kartlarında tasarım menüsü yok');
    page.once('dialog', d => d.accept());
    await page.locator(`[data-post-menu="${p1.id}"]`).click(); // kartın sol üstündeki ⋯ menüsü
    assert.equal(await page.locator('.post-menu [role=menuitem]').count(), 4, 'Aç, Çoğalt, Arşivle, Sil');
    await page.locator(`.post-menu [data-del-post="${p1.id}"]`).click();
    await page.waitForFunction(() => document.querySelectorAll('.post-card-wrap').length === 1);
    const list = (await s.request('GET', `/api/brands/${b.id}/posts`)).data.posts;
    assert.deepEqual(list.map(p => p.title), ['Kalacak']);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
