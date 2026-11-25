// Intent Router (Aşama 04): kayıtlardan cevaplanan kısa bilgi soruları yapay zekâya gitmez; öneri/üretim isteyenler gider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

test('Asistan: bilgi soruları kayıtlardan (yapay zekâsız), öneri istekleri yapay zekâya', async () => {
  const provider = fakeProvider([{ reply: 'Yapay zekâ cevabı', actions: [] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Yönlendirme' })).data.brand;
    const today = new Date(); today.setHours(15, 0, 0, 0);
    const c = (await s.request('POST', '/api/contents', { brandId: b.id, title: 'Bugünkü carousel', type: 'carousel', scheduledAt: today.toISOString() })).data.content;
    await s.request('PATCH', `/api/contents/${c.id}`, { status: 'onay' });
    const y = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    await s.request('POST', '/api/tasks', { brandId: b.id, title: 'Logo iste', dueDate: y });
    await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Kahve rehberi', category: 'egitici' });
    const ask = async m => (await s.request('POST', `/api/brands/${b.id}/chat`, { message: m })).data.assistantMessage.content;
    assert.match(await ask('Bugün ne var?'), /Bugün 1 içerik planlı:[\s\S]*Bugünkü carousel \(Carousel, Onay bekliyor\)[\s\S]*yapay zekâ kullanılmadı/);
    assert.match(await ask('Yarın ne var'), /Yarın planlı içerik yok/);
    assert.match(await ask('Onay bekleyen içerikler hangileri?'), /Onay bekleyen 1 içerik var/);
    assert.match(await ask('Geciken görevler?'), /Geciken 1 görev:[\s\S]*Logo iste/);
    assert.match(await ask('Kaç fikir var?'), /Fikir havuzunda 1 fikir var; 1 tanesi henüz kullanılmadı/);
    assert.equal(provider.calls.length, 0, 'hiçbiri yapay zekâya gitmedi');
    // Öneri/üretim isteyen mesaj yapay zekâya gider
    assert.equal(await ask('Bu hafta ne paylaşalım?'), 'Yapay zekâ cevabı');
    assert.equal(await ask('Bugün için 3 fikir öner'), 'Yapay zekâ cevabı');
    assert.equal(provider.calls.length, 2);
    // Sohbet geçmişine kaydedilir
    const msgs = (await s.request('GET', `/api/brands/${b.id}/chat`)).data.messages;
    assert.equal(msgs.length, 14);
  } finally { await s.stop(); }
});
