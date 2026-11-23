// Marka kılavuzu ekleri: AI renk paleti önerisi (kişinin rengi sabit, yazı renkleri okunaklı), yönetici profili
// (kılavuz kapağında "Hazırlayan") ve markaya özel yönetici notları (çalışma notları, marka sahibi istekleri).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';
import { contrast } from '../server/services/identity.js';

test('Palet önerisi: en az 1 renk ister; kişinin rengi ana renk kalır, okunmayan yazı rengi kodla düzeltilir', async () => {
  const provider = fakeProvider([{ palettes: [
    { name: 'Sakin', why: 'Güven verir', primary: { hex: '#000000', name: 'Siyah' }, secondary: { hex: '#88AACC', name: 'Gök' }, accent: { hex: '#ff8800', name: 'Turuncu' }, background: { hex: '#ffffff', name: 'Beyaz' }, heading: '#eeeeee', body: '#333333' },
    { name: 'Eksik', secondary: { hex: 'mavi' }, accent: { hex: '#123456' } },
    { name: 'Koyu', primary: { hex: '#8bc4d0' }, secondary: { hex: '#224466' }, accent: { hex: '#f0c040' }, background: { hex: '#101820' }, heading: '#ffffff', body: '#101820' }
  ] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    assert.equal((await s.request('POST', '/api/palette-suggest', { colors: [] })).status, 400);
    assert.equal((await s.request('POST', '/api/palette-suggest', { colors: ['kırmızı'] })).status, 400);
    const r = await s.request('POST', '/api/palette-suggest', { colors: ['#8BC4D0'], brand: { name: 'Lexonomi', sector: 'Hukuk teknolojisi' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(provider.calls[0].prompt, /#8bc4d0/);
    assert.match(provider.calls[0].prompt, /Lexonomi/);
    assert.equal(r.data.palettes.length, 2, 'geçersiz HEX içeren palet atılır');
    const [a, b] = r.data.palettes;
    assert.equal(a.primary.hex, '#8bc4d0', 'kişinin rengi ana renk');
    assert.equal(a.secondary.hex, '#88aacc');
    assert.equal(a.heading, '#1b1f3b', 'açık zeminde okunmayan başlık rengi koyuya çevrilir');
    assert.equal(a.body, '#333333');
    assert.equal(b.heading, '#ffffff');
    assert.ok(contrast(b.body, b.background.hex) >= 4.5, 'koyu zeminde gövde yazısı açık renge çevrilir');
  } finally { await s.stop(); }
});

test('Yönetici profili ayarlardan kaydedilir; marka notları kategoriye göre ayrılır', async () => {
  const s = await startServer();
  try {
    assert.deepEqual((await s.request('GET', '/api/settings')).data.profile, { managerName: '', managerTitle: '' });
    const p = (await s.request('PUT', '/api/settings/profile', { managerName: 'Ayşe Yılmaz', managerTitle: 'Sosyal Medya Yöneticisi' })).data.profile;
    assert.equal(p.managerName, 'Ayşe Yılmaz');
    assert.equal((await s.request('GET', '/api/settings')).data.profile.managerTitle, 'Sosyal Medya Yöneticisi');
    assert.equal((await s.request('PUT', '/api/settings/profile', { managerName: 'x'.repeat(81) })).status, 400);

    const b = (await s.request('POST', '/api/brands', { name: 'Notlu' })).data.brand;
    await s.request('POST', '/api/notes', { brandId: b.id, category: 'yonetici', body: 'Logonun vektörü eksik, iş verene sor' });
    await s.request('POST', '/api/notes', { brandId: b.id, category: 'marka-sahibi', body: 'Mavi biraz daha koyu olsun' });
    await s.request('POST', '/api/notes', { category: 'yonetici', body: 'Başka markasız not' });
    const mine = (await s.request('GET', `/api/notes?brandId=${b.id}&category=yonetici`)).data.notes;
    assert.deepEqual(mine.map(n => n.body), ['Logonun vektörü eksik, iş verene sor']);
    const owner = (await s.request('GET', `/api/notes?brandId=${b.id}&category=marka-sahibi`)).data.notes;
    assert.equal(owner.length, 1);
    const done = (await s.request('PATCH', `/api/notes/${owner[0].id}`, { pinned: true })).data.note;
    assert.equal(done.pinned, true);
  } finally { await s.stop(); }
});
