// 7.8 Senaryolu (çok sahneli) prompt: üretim, bir sahne daha, uzat, değiştir, elle düzenleme, çeviri, sürüme dönme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

const sc = (n, extra = '') => ({ title: `Sahne ${n}`, prompt: `8 saniye; barista kafede ${extra}; 0-4 saniye süt dökülür, 4-8 saniye desen tamamlanır; yakın plan; kamera yavaşça yaklaşır; sıcak altın saat ışığı; kafe sesi ve caz müzik; gerçekçi sinematik; ekranda yazı yok; barista dikkatle çalışıyor, fincanın kenarında köpük parlıyor, arka planda bulanık kahve makinesi ve ahşap raflar, müşteri tezgâhın önünde bekliyor, sahne sakin ve davetkâr bir hava taşıyor` });

test('7.8 sahneli prompt: üret, devamını üret, uzat, değiştir, elle düzenle, çevir, sürüme dön', async () => {
  let step = 0;
  const provider = fakeProvider([p => {
    if (p.startsWith('PROMPT STUDIO · SAHNELİ')) return { title: 'Latte hikâyesi', scenes: [sc(1), sc(2), sc(3)] };
    if (p.startsWith('PROMPT STUDIO · SAHNE')) { step++; return { title: `Yeni ${step}`, prompt: sc(9, `yeni yazım ${step}`).prompt }; }
    if (p.startsWith('PROMPT ÇEVİRİSİ · SAHNELİ')) return { scenes: [1, 2, 3, 4].map(n => ({ title: `Scene ${n}`, prompt: `8 seconds; barista scene ${n}; no on-screen text` })) };
    return { title: 'x', prompt: 'x' };
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Sahneli' })).data.brand;
    const url = `/api/brands/${b.id}/prompts`;
    const p = (await s.request('POST', url, { kind: 'video', brief: 'Barista latte art yapıyor', scenes: 3 })).data.prompt;
    assert.equal(p.scenes.length, 3);
    assert.match(provider.calls.at(-1).prompt, /birbirinin devamı olan 3 sahne/);
    assert.match(p.text, /^SAHNE 1 — Sahne 1\n8 saniye[\s\S]*SAHNE 3 — Sahne 3/);
    assert.equal(p.quality.scenes.length, 3);
    assert.equal(p.quality.ok, true, JSON.stringify(p.quality.missing));

    const added = (await s.request('POST', `${url}/${p.id}/scenes`, { action: 'add' })).data.prompt;
    assert.equal(added.scenes.length, 4);
    assert.match(provider.calls.at(-1).prompt, /MEVCUT SAHNELER:[\s\S]*SAHNE 3[\s\S]*Son sahnenin bittiği yerden devam eden YENİ bir sahne yaz \(sahne 4\)/);
    const ext = (await s.request('POST', `${url}/${p.id}/scenes`, { action: 'extend', index: 1 })).data.prompt;
    assert.match(ext.scenes[1].text, /yeni yazım 2/);
    assert.equal(ext.scenes[1].title, 'Yeni 2');
    assert.equal(ext.scenes[0].text, added.scenes[0].text, 'diğer sahneler değişmez');
    assert.equal((await s.request('POST', `${url}/${p.id}/scenes`, { action: 'rewrite', index: 0 })).status, 400, 'talimat zorunlu');
    const rw = (await s.request('POST', `${url}/${p.id}/scenes`, { action: 'rewrite', index: 0, instruction: 'gece olsun' })).data.prompt;
    assert.match(provider.calls.at(-1).prompt, /YALNIZCA sahne 1'i şu talimata göre yeniden yaz: gece olsun/);
    assert.match(rw.scenes[0].text, /yeni yazım 3/);
    assert.equal((await s.request('POST', `${url}/${p.id}/scenes`, { action: 'extend', index: 9 })).status, 400);
    assert.equal((await s.request('POST', `${url}/${p.id}/improve`, { action: 'kisalt' })).status, 400, 'genel geliştirme sahneli prompt\'ta sahne işlemlerine yönlendirir');

    // Elle düzenleme: metin sahnelerden yeniden kurulur
    const edited = (await s.request('PUT', `${url}/${p.id}`, { scenes: rw.scenes.map((x, i) => (i === 3 ? { title: 'Son', text: 'Elle yazılan son sahne' } : x)) })).data.prompt;
    assert.match(edited.text, /SAHNE 4 — Son\nElle yazılan son sahne$/);
    assert.equal((await s.request('PUT', `${url}/${p.id}`, { scenes: [] })).status, 400);

    // Çeviri: sahneler sırasıyla İngilizce olur, Türkçesi saklanır
    const tr = (await s.request('POST', `${url}/${p.id}/translate`, {})).data.prompt;
    assert.equal(tr.lang, 'en');
    assert.deepEqual(tr.scenes.map(x => x.title), ['Scene 1', 'Scene 2', 'Scene 3', 'Scene 4']);
    assert.match(tr.text, /^SCENE 1 — Scene 1/);
    assert.match(tr.textTr, /SAHNE 4 — Son/);

    // İlk sürüme dönünce 3 Türkçe sahne geri gelir
    const first = tr.versions.find(v => /İlk üretim/.test(v.note));
    const back = (await s.request('POST', `${url}/${p.id}/restore`, { versionId: first.id })).data.prompt;
    assert.equal(back.scenes.length, 3);
    assert.equal(back.lang, 'tr');
  } finally { await s.stop(); }
});
