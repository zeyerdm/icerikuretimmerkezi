// Toplu testler: T.1 asistan işlemleri (sunucu tarafı).
// Sahte model istemin türüne göre yanıt verir: asistan sohbeti sıradaki işlem listesini, üretim istemleri kendi biçimlerini döndürür.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

const scene = (o = {}) => Object.assign({
  duration: 6, start: 'Karakter kafede', endFrame: 'Fincan masada',
  beats: [{ from: 0, to: 3, action: 'Fincanı kaldırır', camera: 'Yakın plan', sound: '' }, { from: 3, to: 6, action: 'Gülümser', camera: 'Geniş plan', sound: '' }],
  line: 'Vize haftası geldi ama kahven hazır, sakin ol ve nefes al biraz', lineFrom: 0.5, lineTo: 6,
  flowScene: '0-3s: lifts the cup. 3-6s: smiles.', flowSceneTr: '0-3 sn: fincanı kaldırır. 3-6 sn: gülümser.'
}, o);
const REELS = {
  title: 'Vize kahvesi', format: 'skec', topic: 'Vize haftasında kahve', why: 'Herkes yaşar', punchline: 'Kahve ilaç', setting: 'Kafe',
  screenTitle: 'Vize molası', titleKeyword: 'kahve', scenes: [scene(), scene({ start: 'Devam' })], ending: { twist: 'Fincan konuşur', lastFrame: 'Logo' },
  caption: 'Açıklama', hashtags: ['#kahve'], music: 'Neşeli'
};

function assistantProvider(turns) {
  return fakeProvider([prompt => {
    if (prompt.startsWith("Sen 'KREATİFHANE'")) return turns.shift() || { reply: 'Tamam.', actions: [] };
    if (prompt.includes('Instagram içerik yazarısın')) return { title: 'Sınav kahvesi', slides: [{ title: 'Kapak', body: 'Alt' }, { title: 'İpucu', body: 'Su iç' }, { title: 'Son', body: 'Mola' }], caption: 'Açıklama', hashtags: ['#sinav'] };
    if (prompt.startsWith('PROMPT STUDIO')) return { title: 'Kafe sabahı', prompt: 'a cheerful coffee bean mascot on campus', promptTr: 'Kampüste neşeli kahve çekirdeği' };
    return REELS;
  }]);
}
const chat = async (s, brandId, message) => {
  const r = await s.request('POST', `/api/brands/${brandId}/chat`, { message });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.assistantMessage.actions;
};
const byType = (actions, type) => actions.filter(a => a.type === type);

test('T.1 asistan: fikir güncelleme, Reels havuzu, görev, içerik planı; başka markanın kaydına erişilemez', async () => {
  const turns = [];
  const s = await startServer({ aiProvider: assistantProvider(turns) });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kahve A' })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Kahve B' })).data.brand;
    const idea = (await s.request('POST', `/api/brands/${a.id}/ideas`, { title: 'Eski başlık', category: 'guncel' })).data.idea;
    const otherIdea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'B fikri', category: 'guncel' })).data.idea;

    turns.push({ reply: 'Yaptım.', actions: [
      { type: 'update_idea', id: idea.id, title: 'Yeni başlık', description: 'Güncel açıklama' },
      { type: 'update_idea', id: otherIdea.id, title: 'Ele geçirildi' },
      { type: 'add_reels_ideas', ideas: [{ text: 'Sabah ilk yudum', category: 'eglenceli' }, { text: '' }, { title: 'Barista hatası' }] },
      { type: 'add_task', title: 'Fotoğraf çekimi', dueDate: '2026-12-01', priority: 'yuksek' },
      { type: 'add_task', title: 'Tarihsiz iş', dueDate: 'yarın', priority: 'acil' },
      { type: 'plan_content', items: [
        { title: 'Kış menüsü', type: 'reels', date: '2026-12-05', time: '18:30', ideaId: idea.id },
        { title: 'Tarihsiz içerik', type: 'bilinmeyen' },
        { title: '' }
      ] },
      { type: 'bilinmeyen_islem' }
    ] });
    const res = await chat(s, a.id, 'Şunları yap');

    const upd = byType(res, 'update_idea');
    assert.equal(upd[0].ok, true);
    assert.equal(upd[0].idea.title, 'Yeni başlık');
    assert.equal(upd[1].ok, false, 'başka markanın fikri güncellenmemeli');
    assert.ok(upd[1].error);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas[0].title, 'B fikri');

    const pool = byType(res, 'add_reels_ideas')[0];
    assert.deepEqual(pool.items.map(i => i.text), ['Sabah ilk yudum', 'Barista hatası'], 'boş fikir atlanır, title da kabul edilir');

    const tasks = byType(res, 'add_task');
    assert.deepEqual(tasks.map(t => [t.task.title, t.task.dueDate]), [['Fotoğraf çekimi', '2026-12-01'], ['Tarihsiz iş', null]]);
    const all = (await s.request('GET', '/api/tasks')).data.tasks;
    assert.equal(all.find(t => t.title === 'Fotoğraf çekimi').priority, 'yuksek');
    assert.equal(all.find(t => t.title === 'Tarihsiz iş').priority, 'orta');
    assert.ok(all.every(t => t.brandId === a.id));

    const plan = byType(res, 'plan_content')[0];
    assert.equal(plan.items.length, 2, 'başlıksız satır atlanır');
    const contents = (await s.request('GET', '/api/contents')).data.contents;
    const winter = contents.find(c => c.title === 'Kış menüsü');
    assert.equal(winter.type, 'reels');
    assert.equal(winter.ideaId, idea.id);
    const at = new Date(winter.scheduledAt);
    assert.deepEqual([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()], [2026, 11, 5, 18, 30]);
    const undated = contents.find(c => c.title === 'Tarihsiz içerik');
    assert.equal(undated.scheduledAt, null);
    assert.equal(undated.type, 'post');
    assert.equal(res.some(r => r.type === 'bilinmeyen_islem'), false, 'bilinmeyen işlem sessizce atlanır');

    // Başka markanın fikrine bağlanarak içerik planlanamaz
    turns.push({ reply: 'Planladım.', actions: [{ type: 'plan_content', items: [{ title: 'Sızma denemesi', date: '2026-12-06', ideaId: otherIdea.id }] }] });
    const leak = await chat(s, a.id, 'B fikrini planla');
    assert.equal(byType(leak, 'plan_content').length, 0);
    assert.equal((await s.request('GET', '/api/contents')).data.contents.some(c => c.title === 'Sızma denemesi'), false);

    // İşlem sonuçları sohbet geçmişinde saklanır
    const hist = (await s.request('GET', `/api/brands/${a.id}/chat`)).data.messages;
    assert.equal(hist.filter(m => m.role === 'assistant').length, 2);
    assert.ok(hist.find(m => m.role === 'assistant').actions.some(x => x.type === 'add_task'));
  } finally { await s.stop(); }
});

test('T.1 asistan: Reels/post/prompt üretimi, Reels\'ten post, en çok 3 ağır üretim, hatanın sonuçta görünmesi', async () => {
  const turns = [];
  const provider = assistantProvider(turns);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Üretim A' })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Üretim B' })).data.brand;

    turns.push({ reply: 'Üretiyorum.', actions: [
      { type: 'create_reels', topic: 'Vize haftası' },
      { type: 'create_prompt', kind: 'olmayan-tur', brief: 'Kampüste maskot' },
      { type: 'create_post', topic: 'Sınav ipuçları', kind: 'garip', slides: 50 },
      { type: 'create_reels', topic: 'Dördüncü üretim' }
    ] });
    const res = await chat(s, a.id, 'Üç şey üret');
    const reels = byType(res, 'create_reels');
    assert.equal(reels[0].ok, true);
    assert.equal(reels[0].title, 'Vize kahvesi');
    assert.equal(reels[1].ok, false, 'dördüncü ağır üretim reddedilmeli');
    assert.match(reels[1].error, /en çok 3/);
    const pr = byType(res, 'create_prompt')[0];
    assert.equal(pr.ok, true);
    assert.equal(pr.kindLabel, 'Görsel', 'bilinmeyen tür görsele düşer');
    const post = byType(res, 'create_post')[0];
    assert.equal(post.ok, true);
    const saved = (await s.request('GET', `/api/brands/${a.id}/posts/${post.id}`)).data.post;
    assert.ok(saved.data.slides.length >= 1);
    assert.equal(saved.kind, 'carousel', 'bilinmeyen tür carousel olur');

    // Reels senaryosundan post: senaryo başlığı isteme girer
    turns.push({ reply: 'Posta çevirdim.', actions: [{ type: 'create_post', fromReelsId: reels[0].id, kind: 'story' }] });
    const fromReels = await chat(s, a.id, 'Bu senaryodan post yap');
    assert.equal(byType(fromReels, 'create_post')[0].ok, true);
    const postPrompt = provider.calls.map(c => c.prompt).filter(p => p.includes('Instagram içerik yazarısın')).at(-1);
    assert.match(postPrompt, /Şu Reels senaryosuna dayanarak: Vize kahvesi/);
    // Başka markanın senaryosundan post üretilemez
    const bReels = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'B senaryosu' })).data.reels;
    turns.push({ reply: 'Denedim.', actions: [{ type: 'create_post', fromReelsId: bReels.id }] });
    const leak = byType(await chat(s, a.id, 'B senaryosunu kullan'), 'create_post')[0];
    assert.equal(leak.ok, false);
    assert.ok(leak.error);
  } finally { await s.stop(); }
});

test('T.1 asistan: işlem listesi bozuksa ya da yoksa yanıt yine kaydedilir', async () => {
  const turns = [{ reply: '', actions: 'bozuk' }, { reply: 'Sadece sohbet.' }];
  const s = await startServer({ aiProvider: assistantProvider(turns) });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Sohbet' })).data.brand;
    const r1 = await s.request('POST', `/api/brands/${a.id}/chat`, { message: 'Merhaba' });
    assert.match(r1.data.assistantMessage.content, /Yanıt oluşturulamadı/);
    assert.deepEqual(r1.data.assistantMessage.actions || [], []);
    const r2 = await s.request('POST', `/api/brands/${a.id}/chat`, { message: 'Nasılsın' });
    assert.equal(r2.data.assistantMessage.content, 'Sadece sohbet.');
    assert.equal((await s.request('POST', `/api/brands/${a.id}/chat`, { message: '   ' })).status, 400);
  } finally { await s.stop(); }
});
