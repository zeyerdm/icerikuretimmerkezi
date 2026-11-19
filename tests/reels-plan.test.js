// Prompt Studio Reels senaryo planı: önce espri, akış, süreler ve replikler (eski Reels kuralları ve süre ölçümü);
// onaylanan plan Flow şablonuna dökülür, replikler birebir kalır, kapak yazısı yalnız ilk sahnede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';
import { coverOnlyFirst, planBlock } from '../server/services/prompts.js';
import { RULE_EXAMPLES } from '../public/js/ruleExamples.js';

const FLOW = RULE_EXAMPLES[0].body;
const beats = d => [{ from: 0, to: 2, action: 'Dev bilgisayar odayı kaplıyor', camera: 'geniş plan' }, { from: 2, to: d, action: 'Karakter kabloların arasından çıkıyor', camera: 'yakın plan' }];
const goodPlan = {
  title: 'Cebe sığan dev', format: 'bilgi', punchline: 'Eskiden bir oda, şimdi bir avuç', setting: 'Eski laboratuvar, sıcak ışık',
  screenTitle: 'Oda kadar bilgisayar', titleKeyword: 'Oda',
  scenes: [
    { duration: 8, start: 'Laboratuvar', beats: beats(8), line: 'İlk bilgisayarlar koca bir odayı kaplıyordu ve otuz ton ağırlığındaydı inanabiliyor musun', lineFrom: 0.5, lineTo: 7.5, endFrame: 'Karakter çipi tutuyor' },
    { duration: 8, start: 'Karakter çipi tutuyor', beats: beats(8), line: 'Bugün aynı gücün binlercesi şu küçücük çipin içinde avucumda duruyor bak', lineFrom: 0.5, lineTo: 7.5, endFrame: 'Telefon ekranı' }
  ],
  ending: { twist: 'Telefon karakteri çağırıyor' },
  caption: 'Bir zamanlar bir oda büyüklüğündeydi. Bugün cebinde.', hashtags: ['#teknoloji', 'tarih']
};
const filled = (n, line, d) => FLOW.replace('[NUMARASI]', String(n)).replace('[X] saniye', `${d} saniye`).replace('"[Seslendirme metni birebir buraya yazılır.]"', `"${line}"`).replace(/\[[^\]\n]+\]/g, 'dolu');

test('Kapak yazısı yalnız ilk sahnede; plan bloğu süre, saniye ve replikleri taşır', () => {
  const sc = [1, 2].map(n => ({ title: '', text: filled(n, 'x', 8) }));
  const out = coverOnlyFirst(sc, FLOW);
  assert.match(out[0].text, /Tam olarak şu metin kullanılmalı/);
  assert.doesNotMatch(out[1].text, /Tam olarak şu metin kullanılmalı/);
  assert.match(out[1].text, /Kapak yazısı:\nBu sahnede kapak yazısı yok; ekranda hiçbir yazı olmayacak\.\nEkran kısıtlamaları:/);
  const blk = planBlock(goodPlan);
  assert.match(blk, /SAHNE 2 \(8 saniye\)/);
  assert.match(blk, /\* 0–2 saniye: Dev bilgisayar/);
  assert.match(blk, /0,5\. saniyede başlar, 7,5\. saniyede biter: "Bugün aynı gücün/);
  assert.match(blk, /Kapak yazısı \(yalnız 1\. sahnede\): "Oda kadar bilgisayar"/);
});

test('Senaryo planı: eski Reels kurallarıyla yazılır, süre sorunu varsa bir kez daha yazılır; düzenlenen plan ölçülür; plan Flow şablonuna birebir dökülür', async () => {
  const bad = JSON.parse(JSON.stringify(goodPlan));
  bad.scenes[0].line = 'Kısa'; // 7 saniyelik konuşma için çok kısa
  const provider = fakeProvider([bad, goodPlan, { title: 'X', scenes: [1, 2].map(n => ({ title: 'S' + n, prompt: filled(n, goodPlan.scenes[n - 1].line, 8) })) }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Plan' })).data.brand;
    await s.request('PUT', `/api/brands/${b.id}/reels/settings`, { character: 'Bitbit' });
    const url = `/api/brands/${b.id}/prompts/reels-plan`;
    assert.equal((await s.request('POST', url, { brief: '' })).status, 400);
    const r = (await s.request('POST', url, { brief: 'Bilgisayarlar nasıl küçüldü?', scenes: 2 })).data;
    assert.match(provider.calls[0].prompt, /TAM 2 sahnelik/);
    assert.match(provider.calls[0].prompt, /KONUŞMA ÖNCE GELİR/);
    assert.match(provider.calls[0].prompt, /Bitbit/);
    assert.doesNotMatch(provider.calls[0].prompt, /flowScene/, 'planda Flow tarifi istenmez (kısa ve hızlı)');
    assert.match(provider.calls[1].prompt, /ÖNCEKİ DENEMEDEKİ SORUNLAR[\s\S]*kısa/);
    assert.equal(r.ai.qualityRetried, true);
    assert.equal(r.plan.scenes.length, 2);
    assert.equal(r.totalSeconds, 16);
    assert.deepEqual(r.issues, []);

    // Düzenlenen replik ölçülür: süreye sığmayan uzun replik uyarı verir
    const edited = JSON.parse(JSON.stringify(r.plan));
    edited.scenes[1].line = Array(40).fill('kelime').join(' ');
    const chk = (await s.request('POST', `${url}/check`, { plan: edited })).data;
    assert.ok(chk.issues.some(t => /Sahne 2: replik/.test(t)), chk.issues.join(' | '));

    // Onaylanan plan → Flow şablonlu sahneler; replik birebir, kapak yazısı yalnız 1. sahnede
    const p = (await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'reels', brief: 'Bilgisayarlar', plan: r.plan })).data.prompt;
    const ask = provider.calls[2].prompt;
    assert.match(ask, /ONAYLANAN SENARYO PLANI/);
    assert.ok(ask.includes(FLOW), 'hazır Flow şablonu');
    assert.match(ask, /2 sahnenin HER BİRİ/);
    assert.equal(p.title, 'Cebe sığan dev');
    assert.equal(p.scenes.length, 2);
    assert.match(p.scenes[1].text, /Bu sahnede kapak yazısı yok/);
    assert.equal(p.quality.ok, true, 'kapak yazısı bilerek sadeleşen sahne eksik sayılmaz');
    assert.deepEqual(p.plan.scenes.map(x => x.line), r.plan.scenes.map(x => x.line));
    assert.deepEqual(p.planIssues, []);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/prompts/${p.id}`)).data.prompt.planIssues.length, 0);

    // Yayın paketi: açıklama ve hashtag'ler, plandaki konuşma saniyelerinden altyazı, durum, takvim
    assert.match(provider.calls[0].prompt, /'caption' alanına Instagram açıklaması/);
    assert.equal(p.plan.caption, goodPlan.caption);
    assert.deepEqual(p.plan.hashtags, ['#teknoloji', '#tarih']);
    assert.match(p.srt, /^1\n00:00:00,500 --> 00:00:07,500\nİlk bilgisayarlar/);
    assert.match(p.srt, /2\n00:00:08,500 --> 00:00:15,500\nBugün aynı gücün/);
    assert.equal(p.status, 'taslak');
    const pu = `/api/brands/${b.id}/prompts/${p.id}`;
    assert.equal((await s.request('PUT', pu, { status: 'yok' })).status, 400);
    const up = (await s.request('PUT', pu, { status: 'hazir', caption: 'Yeni açıklama', hashtags: 'reels #kod' })).data.prompt;
    assert.equal(up.statusLabel, 'Çekime hazır');
    assert.equal(up.plan.caption, 'Yeni açıklama');
    assert.deepEqual(up.plan.hashtags, ['#reels', '#kod']);
    assert.equal(up.content, null);
    const c = (await s.request('POST', `${pu}/schedule`, { scheduledAt: '2026-11-25T09:00:00.000Z' })).data.content;
    assert.equal(c.type, 'reels'); assert.equal(c.caption, 'Yeni açıklama');
    assert.deepEqual((await s.request('GET', pu)).data.prompt.content, { id: c.id, scheduledAt: '2026-11-25T09:00:00.000Z' });
  } finally { await s.stop(); }
});
