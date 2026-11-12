// 8.18 Kısmi toplu testlerin tamamlanması (sunucu tarafı): T.7, T.8, T.9, T.13, T.22, T.33'te kalan kısımlar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';
import { specialDays } from '../server/services/specialDays.js';

const png = { 'Content-Type': 'image/png' };
const scene = { duration: 6, start: 'Kafe', endFrame: 'Masa', beats: [{ from: 0, to: 6, action: 'Gülümser', camera: 'Yakın', sound: '' }], line: 'Kahve hazır, sakin ol ve nefes al biraz arkadaşım', lineFrom: 0, lineTo: 6, flowScene: 'smiles', flowSceneTr: 'gülümser' };
const REELS = { title: 'Senaryo', format: 'skec', topic: 'x', why: 'y', punchline: 'z', setting: 'Kafe', screenTitle: 'Başlık', titleKeyword: 'kahve', scenes: [scene], ending: { twist: 't', lastFrame: 'l' }, caption: 'c', hashtags: [], music: 'm' };
const PATTERN = { title: 'Aksilikle başla', hookType: 'soru', hook: 'Herkesin yaşadığı aksilik', theme: 'Gündelik', structure: ['Aksilik', 'Çözüm'], cta: 'Kaydet', why: 'Özdeşleşme', reuse: 'Kahve dökülmesiyle başla' };
const CAPTION = { caption: 'Açıklama', hashtags: ['#kahve'], firstComment: 'İlk yorum' };
const dbOf = s => new DatabaseSync(path.join(s.dataDir, fs.readdirSync(s.dataDir).find(f => f.endsWith('.db'))));

test('T.7 kalan: marka hafızasında en çok ve en az tutan içerikler (en az 6 ölçümle)', async () => {
  const provider = fakeProvider([{ reply: 'tamam', actions: [] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Ölçülü' })).data.brand;
    const views = [1000, 1000, 1000, 1000, 1000, 1000];
    const likes = [400, 300, 200, 50, 20, 5];
    for (let i = 0; i < 6; i++) {
      const c = (await s.request('POST', '/api/contents', { brandId: b.id, title: `İçerik ${i}`, type: 'post', scheduledAt: `2026-10-0${i + 1}T10:00:00.000Z` })).data.content;
      await s.request('PATCH', `/api/contents/${c.id}`, { metrics: { views: views[i], likes: likes[i] }, hook: `Giriş ${i}`, theme: i < 3 ? 'kampanya' : 'kulis' });
    }
    await s.request('POST', `/api/brands/${b.id}/chat`, { message: 'merhaba' });
    const p = provider.calls.at(-1).prompt;
    assert.match(p, /EN ÇOK TUTAN içerikler[\s\S]*- İçerik 0 \(post, etkileşim %40\) · giriş: "Giriş 0" · tema: kampanya/);
    assert.match(p, /En az tutan içerikler \(bu yaklaşımlardan kaçın\):\n- İçerik 5 \(post, etkileşim %0\.5\)/);
  } finally { await s.stop(); }
});

test('T.8 kalan: içerik kartı AI yazımında bağlı senaryo ve tasarım metni isteme girer', async () => {
  const provider = fakeProvider([p => (p.includes('Instagram içerik yazarısın') ? CAPTION : REELS)]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Bağlı' })).data.brand;
    const r = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Kahve' })).data.reels;
    const rc = (await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/schedule`, { scheduledAt: '2026-11-20T10:00:00.000Z' })).data.content;
    assert.equal((await s.request('POST', `/api/contents/${rc.id}/write`, {})).status, 200);
    assert.match(provider.calls.at(-1).prompt, /BAĞLI REELS SENARYOSU:\n[\s\S]*Kahve hazır, sakin ol/);
    const post = (await s.request('POST', `/api/brands/${b.id}/posts`, { blank: true, title: 'Duyuru', kind: 'post' })).data.post;
    await s.request('PUT', `/api/brands/${b.id}/posts/${post.id}`, { data: { format: '1:1', slides: [{ bg: '#ffffff', layers: [{ type: 'text', role: 'title', text: 'Yeni menü geldi', x: 0, y: 0, w: 800, size: 60, color: '#000000', font: 'Inter' }] }] } });
    const pc = (await s.request('POST', `/api/brands/${b.id}/posts/${post.id}/schedule`, { scheduledAt: '2026-11-21T10:00:00.000Z' })).data.content;
    await s.request('POST', `/api/contents/${pc.id}/write`, {});
    assert.match(provider.calls.at(-1).prompt, /BAĞLI TASARIMDAKİ METİNLER:\n1\. Yeni menü geldi/);
  } finally { await s.stop(); }
});

test('T.9 kalan: dini bayramlar tablodan gelir, tablo dışı yılda uydurulmaz; asistan istemine yaklaşan günler girer', async () => {
  const y26 = specialDays('2026-01-01', '2026-12-31');
  assert.equal(y26.find(d => d.name === 'Ramazan Bayramı').date, '2026-03-20');
  assert.equal(y26.find(d => d.name === 'Ramazan Bayramı').end, '2026-03-22');
  assert.ok(y26.some(d => d.name === 'Kurban Bayramı' && d.date === '2026-05-27'));
  const y35 = specialDays('2035-01-01', '2035-12-31');
  assert.equal(y35.some(d => d.category === 'dini' && /Bayram/.test(d.name)), false, 'tablo dışı yıl');
  assert.ok(y35.some(d => d.name === 'Öğretmenler Günü'), 'sabit günler her yıl var');
  const provider = fakeProvider([{ reply: 'tamam', actions: [] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Günlü' })).data.brand;
    await s.request('POST', `/api/brands/${b.id}/chat`, { message: 'öneri' });
    assert.match(provider.calls.at(-1).prompt, /YAKLAŞAN ÖZEL GÜNLER VE DÖNEMLER[^\n]*\n(- \d{4}-\d\d-\d\d|\(yok\))/);
  } finally { await s.stop(); }
});

test('T.13 kalan: ortak şablonda sticker ve maskot rolleri hedef markanın dosyalarıyla eşlenir; yoksa yer tutucu', async () => {
  const s = await startServer();
  try {
    const src = (await s.request('POST', '/api/brands', { name: 'Kaynak' })).data.brand;
    const dst = (await s.request('POST', '/api/brands', { name: 'Hedef' })).data.brand;
    const st = (await s.request('POST', `/api/brands/${src.id}/assets?category=sticker`, PNG_1PX, png)).data.asset;
    const ms = (await s.request('POST', `/api/brands/${src.id}/assets?category=mascot`, PNG_1PX, png)).data.asset;
    const dstSticker = (await s.request('POST', `/api/brands/${dst.id}/assets?category=sticker`, PNG_1PX, png)).data.asset;
    const p = (await s.request('POST', `/api/brands/${src.id}/posts`, { blank: true, title: 'Şablonlu', kind: 'post' })).data.post;
    await s.request('PUT', `/api/brands/${src.id}/posts/${p.id}`, { data: { format: '1:1', slides: [{ bg: '#ffffff', layers: [
      { type: 'image', src: st.url, assetId: st.id, x: 10, y: 10, w: 100, h: 100 },
      { type: 'image', src: ms.url, assetId: ms.id, x: 200, y: 10, w: 100, h: 100 }
    ] }] } });
    const tpl = (await s.request('POST', `/api/brands/${src.id}/posts/${p.id}/share-template`, { name: 'Sticker şablonu' })).data.template;
    const usedRef = (await s.request('POST', `/api/brands/${dst.id}/shared-templates/${tpl.id}/use`, { title: 'Hedefte' })).data.post;
    const used = (await s.request('GET', `/api/brands/${dst.id}/posts/${usedRef.id}`)).data.post;
    const layers = used.data.slides[0].layers;
    const sticker = layers.find(l => l.type === 'image');
    assert.equal(sticker.assetId, dstSticker.id, 'sticker rolü hedefin sticker\'ı olur');
    assert.ok(layers.some(l => l.type === 'text' && l.text === 'Maskot alanı'), 'hedefte maskot yoksa yer tutucu');
    assert.ok(!JSON.stringify(used).includes(ms.id) && !JSON.stringify(used).includes(st.id), 'kaynağın dosyası taşınmaz');
  } finally { await s.stop(); }
});

test('T.22 kalan: prompt ve Reels sürümleriyle geri gelir; 30 günlük temizlik; marka silinince çöp de silinir', async () => {
  const provider = fakeProvider([p => (p.startsWith('PROMPT') ? { title: 'P', prompt: 'Bir prompt metni' } : REELS)]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Çöplü' })).data.brand;
    const p = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'metin', brief: 'x' })).data.prompt;
    await s.request('PUT', `/api/brands/${b.id}/prompts/${p.id}`, { text: 'Elle değişti' });
    const pv = (await s.request('GET', `/api/brands/${b.id}/prompts/${p.id}`)).data.prompt.versions.length;
    const r = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Kahve' })).data.reels;
    const rv = (await s.request('GET', `/api/brands/${b.id}/reels/${r.id}`)).data.reels.versions.length;
    const del = async url => (await fetch(s.base + url, { method: 'DELETE' })).headers.get('x-trash-id');
    const t1 = await del(`/api/brands/${b.id}/prompts/${p.id}`);
    const t2 = await del(`/api/brands/${b.id}/reels/${r.id}`);
    await s.request('POST', `/api/trash/${t1}/restore`);
    await s.request('POST', `/api/trash/${t2}/restore`);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/prompts/${p.id}`)).data.prompt.versions.length, pv);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/reels/${r.id}`)).data.reels.versions.length, rv);
    // 30 günü geçen kayıt listelenirken temizlenir
    const t3 = await del(`/api/brands/${b.id}/prompts/${p.id}`);
    const db = dbOf(s);
    db.prepare('UPDATE trash SET deleted_at = ? WHERE id = ?').run(new Date(Date.now() - 31 * 864e5).toISOString(), t3);
    db.close();
    assert.equal((await s.request('GET', '/api/trash')).data.items.some(i => i.id === t3), false);
    // Marka silinince o markanın çöpü de gider
    const t4 = await del(`/api/brands/${b.id}/reels/${r.id}`);
    await s.request('DELETE', `/api/brands/${b.id}`);
    assert.equal((await s.request('GET', '/api/trash')).data.items.some(i => i.id === t4), false);
  } finally { await s.stop(); }
});

test('T.33 kalan: Reels kalıbından tarif; başka markaya uygulanınca yeni kalıp oluşur', async () => {
  const provider = fakeProvider([PATTERN]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kalıp kaynağı' })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Kalıp hedefi' })).data.brand;
    const pat = (await s.request('POST', `/api/brands/${a.id}/patterns`, { text: 'Kahvemi döktüm', sourceType: 'kendi' })).data.pattern;
    assert.equal((await s.request('POST', `/api/brands/${b.id}/patterns/${pat.id}/recipe`)).status, 404, 'başka markanın kalıbı');
    const rec = (await s.request('POST', `/api/brands/${a.id}/patterns/${pat.id}/recipe`)).data.recipe;
    assert.equal(rec.kind, 'pattern');
    assert.match(rec.preview, /Herkesin yaşadığı aksilik/);
    const applied = (await s.request('POST', `/api/recipes/${rec.id}/apply`, { brandId: b.id })).data;
    const list = (await s.request('GET', `/api/brands/${b.id}/patterns`)).data.patterns;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, applied.patternId);
    assert.equal(list[0].title, 'Aksilikle başla');
  } finally { await s.stop(); }
});
