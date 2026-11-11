// Toplu testler (yol haritası "Toplu test" listesi): sunucu tarafı.
// T.9 özel günler, T.22 çöp kutusu, T.27 genel arama, T.31 kampanya kanvası, T.33 tarifler, T.36 aylık hedef.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { specialDays } from '../server/services/specialDays.js';

const brand = async (s, name) => (await s.request('POST', '/api/brands', { name })).data.brand;

test('T.9 özel günler: hesaplanan tarihler, aralık filtresi, uç nokta doğrulaması', async () => {
  const d2026 = specialDays('2026-01-01', '2026-12-31');
  const find = name => d2026.find(d => d.name.startsWith(name));
  assert.equal(find('Anneler Günü').date, '2026-05-10'); // mayısın 2. pazarı
  assert.equal(find('Black Friday').date, '2026-11-27'); // kasımın son cuması
  assert.equal(specialDays('2027-05-01', '2027-05-31').find(d => d.name === 'Anneler Günü').date, '2027-05-09');
  // Aralık dışı gün gelmez; sonuç sıralıdır
  const may = specialDays('2026-05-01', '2026-05-31');
  assert.ok(may.length && may.every(d => d.date >= '2026-05-01' && d.date <= '2026-05-31'));
  assert.deepEqual(may.map(d => d.date), [...may.map(d => d.date)].sort());

  const s = await startServer();
  try {
    const ok = await s.request('GET', '/api/special-days?from=2026-11-01&to=2026-11-30');
    assert.equal(ok.status, 200);
    assert.ok(ok.data.days.some(d => d.date === '2026-11-27'));
    assert.equal((await s.request('GET', '/api/special-days?from=2026-12-01&to=2026-11-01')).status, 400);
    assert.equal((await s.request('GET', '/api/special-days?from=2026-01-01&to=2030-01-01')).status, 400);
  } finally { await s.stop(); }
});

test('T.22 çöp kutusu: sil → listede → geri al; alt kayıt, takvim bağlantısı ve hatalı silme', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Çöp A');
    const idea = (await s.request('POST', `/api/brands/${a.id}/ideas`, { title: 'Kış menüsü', category: 'guncel' })).data.idea;
    const content = (await s.request('POST', '/api/contents', { brandId: a.id, title: 'Kış menüsü postu', type: 'post', ideaId: idea.id })).data.content;
    const task = (await s.request('POST', '/api/tasks', { title: 'Silinecek görev' })).data.task;
    const note = (await s.request('POST', '/api/notes', { body: 'Silinecek not' })).data.note;

    // Fikir silinir: içerikteki bağlantı boşalır, çöpe düşer
    const del = await s.request('DELETE', `/api/brands/${a.id}/ideas/${idea.id}`);
    assert.equal(del.status, 204);
    const trashId = del.headers.get('x-trash-id');
    assert.ok(trashId);
    const c1 = (await s.request('GET', '/api/contents')).data.contents.find(c => c.id === content.id);
    assert.equal(c1.ideaId, null);
    // Geri alınca fikir ve içerikteki bağlantısı geri gelir
    assert.equal((await s.request('POST', `/api/trash/${trashId}/restore`)).status, 200);
    assert.ok((await s.request('GET', `/api/brands/${a.id}/ideas`)).data.ideas.some(i => i.id === idea.id));
    assert.equal((await s.request('GET', '/api/contents')).data.contents.find(c => c.id === content.id).ideaId, idea.id);
    // İkinci kez geri alma reddedilir (kayıt artık çöpte değil)
    assert.notEqual((await s.request('POST', `/api/trash/${trashId}/restore`)).status, 200);

    // Görev ve not
    const tDel = await s.request('DELETE', `/api/tasks/${task.id}`);
    const nDel = await s.request('DELETE', `/api/notes/${note.id}`);
    const list = (await s.request('GET', '/api/trash')).data;
    assert.equal(list.days, 30);
    assert.deepEqual(new Set(list.items.map(i => i.kind)), new Set(['task', 'note']));
    assert.equal((await s.request('POST', `/api/trash/${tDel.headers.get('x-trash-id')}/restore`)).status, 200);
    assert.ok((await s.request('GET', '/api/tasks')).data.tasks.some(t => t.id === task.id));
    // Kalıcı silme
    assert.equal((await s.request('DELETE', `/api/trash/${nDel.headers.get('x-trash-id')}`)).status, 204);
    assert.equal((await s.request('GET', '/api/trash')).data.items.length, 0);

    // Olmayan kaydı silme denemesi çöpe bir şey düşürmez
    const bad = await s.request('DELETE', '/api/tasks/yok-boyle-bir-gorev');
    assert.notEqual(bad.status, 204);
    assert.equal(bad.headers.get('x-trash-id'), null);
    assert.equal((await s.request('GET', '/api/trash')).data.items.length, 0);

    // Bağlı fikir silinmişken içerik geri alınabilir (bağlantı boşalır)
    const cDel = await s.request('DELETE', `/api/contents/${content.id}`);
    await s.request('DELETE', `/api/brands/${a.id}/ideas/${idea.id}`);
    assert.equal((await s.request('POST', `/api/trash/${cDel.headers.get('x-trash-id')}/restore`)).status, 200);
    assert.equal((await s.request('GET', '/api/contents')).data.contents.find(c => c.id === content.id).ideaId, null);

    // Çöpü boşalt
    const emptied = await s.request('DELETE', '/api/trash');
    assert.ok(emptied.data.removed >= 1);
    assert.equal((await s.request('GET', '/api/trash')).data.items.length, 0);
  } finally { await s.stop(); }
});

test('T.27 genel arama: türler, Türkçe karaktersiz eşleşme, çok kelime, kısa sorgu', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Arama Kafe');
    await s.request('POST', `/api/brands/${a.id}/ideas`, { title: 'Şükran günü kurabiyesi', description: 'Tarçınlı özel seri', category: 'guncel' });
    await s.request('POST', '/api/notes', { title: 'Toplantı', body: 'Çikolatalı kurabiye fiyatı konuşulacak' });
    await s.request('POST', '/api/tasks', { title: 'Kurabiye fotoğrafı çek' });
    await s.request('POST', '/api/contents', { brandId: a.id, title: 'Kurabiye reels', type: 'reels' });

    const r = (await s.request('GET', '/api/search?q=kurabiye')).data.results;
    assert.deepEqual(new Set(r.map(x => x.type)), new Set(['idea', 'note', 'task', 'content']));
    assert.ok(r.every(x => x.href && x.href.startsWith('#/')));
    // Türkçe karaktersiz yazım bulur
    assert.ok((await s.request('GET', '/api/search?q=sukran')).data.results.some(x => x.type === 'idea'));
    assert.ok((await s.request('GET', '/api/search?q=CIKOLATALI')).data.results.some(x => x.type === 'note'));
    // Çok kelime: hepsi geçmeli
    const multi = (await s.request('GET', '/api/search?q=kurabiye fotoğraf')).data.results;
    assert.deepEqual(multi.map(x => x.type), ['task']);
    // Açıklamadan eşleşmede kesit döner
    assert.match((await s.request('GET', '/api/search?q=tarcinli')).data.results[0].snippet, /Tarçınlı/);
    // 2 karakter altı boş
    assert.deepEqual((await s.request('GET', '/api/search?q=k')).data.results, []);
    assert.deepEqual((await s.request('GET', '/api/search?q=')).data.results, []);
  } finally { await s.stop(); }
});

test('T.31 kampanya kanvası: pano, kartlar, başka markanın kaydı reddi, bağlantılar, silinmiş kayıt', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Kampanya A');
    const b = await brand(s, 'Kampanya B');
    const idea = (await s.request('POST', `/api/brands/${a.id}/ideas`, { title: 'Yaz kampanyası', category: 'guncel' })).data.idea;
    const otherIdea = (await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'B fikri', category: 'guncel' })).data.idea;

    assert.equal((await s.request('POST', `/api/brands/${a.id}/campaigns`, { name: '' })).status, 400);
    const camp = (await s.request('POST', `/api/brands/${a.id}/campaigns`, { name: 'Yaz', goal: 'Satış', color: 'bozuk' })).data.campaign;
    assert.match(camp.color, /^#[0-9a-f]{6}$/i);
    const base = `/api/brands/${a.id}/campaigns/${camp.id}`;

    const ideaCard = (await s.request('POST', base + '/items', { kind: 'idea', refId: idea.id, x: 99999, y: -5 })).data.item;
    assert.equal(ideaCard.title, 'Yaz kampanyası');
    assert.equal(ideaCard.x, 6000); // sınıra kırpılır
    assert.equal(ideaCard.y, 0);
    const noteCard = (await s.request('POST', base + '/items', { kind: 'note', text: 'Hikâyede geri sayım' })).data.item;
    assert.equal((await s.request('POST', base + '/items', { kind: 'idea', refId: otherIdea.id })).status, 400);
    assert.equal((await s.request('POST', base + '/items', { kind: 'bilinmeyen' })).status, 400);
    assert.equal((await s.request('POST', base + '/items', { kind: 'note', text: '' })).status, 400);
    // Başka markanın panosuna o markanın adresinden erişilemez
    assert.equal((await s.request('GET', `/api/brands/${b.id}/campaigns/${camp.id}`)).status, 404);

    // Konum ve not güncelleme
    const moved = (await s.request('PATCH', `${base}/items/${noteCard.id}`, { x: 300, y: 120, text: 'Geri sayım 3 gün' })).data.item;
    assert.deepEqual([moved.x, moved.y, moved.text], [300, 120, 'Geri sayım 3 gün']);

    // Bağlantılar: yalnız panodaki kartlar, tekrarsız, kendine bağlantı yok
    const linked = (await s.request('PATCH', base, { links: [[ideaCard.id, noteCard.id], [noteCard.id, ideaCard.id], [ideaCard.id, ideaCard.id], [ideaCard.id, 'yabanci']] })).data.campaign;
    assert.deepEqual(linked.links, [[ideaCard.id, noteCard.id]]);
    // Kart silinince bağlantısı da silinir
    assert.equal((await s.request('DELETE', `${base}/items/${noteCard.id}`)).status, 204);
    assert.deepEqual((await s.request('GET', base)).data.campaign.links, []);

    // Bağlı kayıt silinirse kart "silinmiş kayıt" olarak kalır
    await s.request('DELETE', `/api/brands/${a.id}/ideas/${idea.id}`);
    const after = (await s.request('GET', base)).data.campaign;
    assert.equal(after.items.length, 1);
    assert.equal(after.items[0].missing, true);

    assert.equal((await s.request('GET', `/api/brands/${a.id}/campaigns`)).data.campaigns[0].itemCount, 1);
    assert.equal((await s.request('DELETE', base)).status, 204);
    assert.equal((await s.request('GET', base)).status, 404);
  } finally { await s.stop(); }
});

test('T.33 tarifler: prompttan tarif, başka markaya uygulama, kullanım sayısı, silme', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Tarif A');
    const b = await brand(s, 'Tarif B');
    const p = (await s.request('POST', `/api/brands/${a.id}/prompts`, { manual: true, kind: 'gorsel', text: 'Soft morning light, latte art close-up', title: 'Latte' })).data.prompt;
    // Kayıt başka markanın adresinden tarife çevrilemez
    assert.equal((await s.request('POST', `/api/brands/${b.id}/prompts/${p.id}/recipe`)).status, 404);
    const rec = (await s.request('POST', `/api/brands/${a.id}/prompts/${p.id}/recipe`)).data.recipe;
    assert.equal(rec.kind, 'prompt');
    assert.equal(rec.sourceBrand, 'Tarif A');
    assert.equal(rec.uses, 0);

    const applied = (await s.request('POST', `/api/recipes/${rec.id}/apply`, { brandId: b.id })).data;
    assert.ok(applied.prompt && applied.prompt.id !== p.id);
    const bPrompts = (await s.request('GET', `/api/brands/${b.id}/prompts`)).data.prompts;
    assert.ok(bPrompts.some(x => x.id === applied.prompt.id));
    assert.equal((await s.request('GET', '/api/recipes?kind=prompt')).data.recipes[0].uses, 1);
    assert.equal((await s.request('POST', `/api/recipes/${rec.id}/apply`, { brandId: 'yok' })).status, 404);

    // Tarif silinince kopyalar kalır
    assert.equal((await s.request('DELETE', `/api/recipes/${rec.id}`)).status, 204);
    assert.deepEqual((await s.request('GET', '/api/recipes')).data.recipes, []);
    assert.ok((await s.request('GET', `/api/brands/${b.id}/prompts`)).data.prompts.some(x => x.id === applied.prompt.id));
  } finally { await s.stop(); }
});

test('T.36 aylık hedef: kaydetme, 0–200 sınırı, diğer alanlara dokunmama', async () => {
  const s = await startServer();
  try {
    const a = await brand(s, 'Hedef');
    assert.equal(a.monthlyGoal, 0);
    const set = (await s.request('PATCH', `/api/brands/${a.id}`, { monthlyGoal: 12 })).data.brand;
    assert.equal(set.monthlyGoal, 12);
    assert.equal(set.name, 'Hedef');
    assert.equal((await s.request('PATCH', `/api/brands/${a.id}`, { monthlyGoal: 999 })).data.brand.monthlyGoal, 200);
    assert.equal((await s.request('PATCH', `/api/brands/${a.id}`, { monthlyGoal: -4 })).data.brand.monthlyGoal, 0);
    assert.equal((await s.request('PATCH', `/api/brands/${a.id}`, { monthlyGoal: 'abc' })).data.brand.monthlyGoal, 0);
    await s.request('PATCH', `/api/brands/${a.id}`, { monthlyGoal: 7.6 });
    // Hedef gönderilmeyen güncelleme hedefi silmez
    const other = (await s.request('PATCH', `/api/brands/${a.id}`, { slogan: 'Yeni slogan' })).data.brand;
    assert.equal(other.monthlyGoal, 8);
    assert.equal(other.slogan, 'Yeni slogan');
    assert.equal((await s.request('GET', '/api/brands')).data.brands.find(b => b.id === a.id).monthlyGoal, 8);
  } finally { await s.stop(); }
});
