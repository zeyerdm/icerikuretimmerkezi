// 8.7 Kütüphane görselleri için çöp kutusu: silinen görsel 30 gün geri alınabilir; dosyası .trash klasöründe bekler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, PNG_1PX } from './helpers.js';

const png = { 'Content-Type': 'image/png' };
const filesOf = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f !== '.trash') : []);

test('8.7 görsel çöp kutusu: sil → çöpte, dosya saklanır; geri al → dosya ve kayıt döner; kalıcı sil → dosya da gider', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Görselli' })).data.brand;
    const url = `/api/brands/${b.id}`;
    const dir = path.join(s.dataDir, 'uploads', b.id);
    const a = (await s.request('POST', `${url}/assets?category=mascot&label=Poz`, PNG_1PX, png)).data.asset;
    assert.equal(filesOf(dir).length, 1);

    const res = await fetch(`${s.base}${url}/assets/${a.id}`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    const tid = res.headers.get('X-Trash-Id');
    assert.ok(tid, 'geri al bildirimi için çöp kimliği döner');
    assert.equal((await s.request('GET', `${url}/assets`)).data.assets.length, 0);
    assert.equal(filesOf(dir).length, 0);
    assert.equal(fs.readdirSync(path.join(dir, '.trash')).length, 1, 'dosya saklanır');
    const item = (await s.request('GET', '/api/trash')).data.items.find(t => t.id === tid);
    assert.equal(item.kind, 'asset');
    assert.equal(item.kindLabel, 'Kütüphane görseli');
    assert.equal(item.title, 'Poz');

    const r = (await s.request('POST', `/api/trash/${tid}/restore`)).data.restored;
    assert.equal(r.kind, 'asset');
    const back = (await s.request('GET', `${url}/assets`)).data.assets;
    assert.deepEqual(back.map(x => x.id), [a.id]);
    const file = await fetch(`${s.base}${url}/assets/${a.id}/file`);
    assert.equal(file.status, 200);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG_1PX);
    assert.equal(fs.readdirSync(path.join(dir, '.trash')).length, 0);

    // Kalıcı silme saklanan dosyayı da siler
    const res2 = await fetch(`${s.base}${url}/assets/${a.id}`, { method: 'DELETE' });
    const tid2 = res2.headers.get('X-Trash-Id');
    assert.equal((await s.request('DELETE', `/api/trash/${tid2}`)).status, 204);
    assert.equal(fs.readdirSync(path.join(dir, '.trash')).length, 0);

    // Paket silme: her görsel ayrı çöp kaydı; çöpü boşaltınca dosyalar gider
    for (let i = 0; i < 3; i++) await s.request('POST', `${url}/assets?category=sticker&label=K${i}&pack=Kış`, PNG_1PX, png);
    const packs = (await s.request('GET', `${url}/asset-packs`)).data.packs;
    assert.deepEqual(packs, [{ name: 'Kış', category: 'sticker', count: 3 }]);
    const del = (await s.request('DELETE', `${url}/asset-packs?pack=${encodeURIComponent('Kış')}`)).data;
    assert.equal(del.removed, 3);
    assert.equal((await s.request('GET', '/api/trash')).data.items.filter(t => t.kind === 'asset').length, 3);
    assert.equal(fs.readdirSync(path.join(dir, '.trash')).length, 3);
    await s.request('DELETE', '/api/trash');
    assert.equal(fs.readdirSync(path.join(dir, '.trash')).length, 0);

    // Başka markanın görseli silinemez ve çöpe bir şey düşmez
    const c = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    const x = (await s.request('POST', `/api/brands/${c.id}/assets?category=mascot`, PNG_1PX, png)).data.asset;
    const before = (await s.request('GET', '/api/trash')).data.items.length;
    assert.equal((await s.request('DELETE', `${url}/assets/${x.id}`)).status, 404);
    assert.equal((await s.request('GET', '/api/trash')).data.items.length, before);
  } finally { await s.stop(); }
});
