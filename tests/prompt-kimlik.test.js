// 7.2 Marka prompt kimliği: sihirbaz cevaplarının doğrulanması, saklanması ve Prompt Studio istemine girmesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';
import { cleanIdentity, identityBlock } from '../server/services/promptIdentity.js';

test('7.2 temizleme: geçersiz seçim reddedilir, listeler ayrılır, maskot yoksa maskot cevapları atılır', () => {
  assert.throws(() => cleanIdentity({ visualStyle: 'yok' }), /geçersiz seçim/);
  const c = cleanIdentity({ visualStyle: 'gercekci', mood: ['samimi', 'olmayan', 'samimi'], places: 'kafe içi,  kampüs ,', hasMascot: false, mascotName: 'Kahveci' });
  assert.deepEqual(c, { visualStyle: 'gercekci', mood: ['samimi'], places: ['kafe içi', 'kampüs'], hasMascot: false });
  const m = cleanIdentity({ hasMascot: true, mascotName: 'Kahveci', mascotVoice: 'Esprili, kısa cümleler' });
  assert.equal(m.mascotName, 'Kahveci');
  const block = identityBlock(Object.assign(c, { lighting: 'altin' }));
  assert.match(block, /MARKA PROMPT KİMLİĞİ/);
  assert.match(block, /photorealistic photography/);
  assert.match(block, /warm golden hour light/);
  assert.match(block, /kafe içi, kampüs/);
  assert.equal(identityBlock({}), '');
  assert.match(identityBlock(m, 'maskot'), /Maskot[\s\S]*Kahveci[\s\S]*Esprili/);
  assert.doesNotMatch(identityBlock(m, 'metin'), /Kahveci/, 'metin prompt\'larına maskot girmez');
});

test('7.2 API ve Prompt Studio: kimlik kaydedilir, başka markaya karışmaz, istemde görünür', async () => {
  const provider = fakeProvider([{ title: 'T', prompt: 'A photorealistic cafe scene, clean composition, no text, no logo', promptTr: 'x' }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kimlikli' })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'Kimliksiz' })).data.brand;
    const g = (await s.request('GET', `/api/brands/${a.id}/prompt-identity`)).data;
    assert.deepEqual(g.identity, {});
    assert.ok(g.questions.length >= 10);
    assert.equal((await s.request('PUT', `/api/brands/${a.id}/prompt-identity`, { lighting: 'mor' })).status, 400);
    const saved = (await s.request('PUT', `/api/brands/${a.id}/prompt-identity`, { visualStyle: 'sinematik', lighting: 'dramatik', avoid: 'alkol, kalabalık' })).data.identity;
    assert.deepEqual(saved.avoid, ['alkol', 'kalabalık']);
    assert.deepEqual((await s.request('GET', `/api/brands/${b.id}/prompt-identity`)).data.identity, {});

    await s.request('POST', `/api/brands/${a.id}/prompts`, { kind: 'gorsel', brief: 'Kafede sabah' });
    const pa = provider.calls.at(-1).prompt;
    assert.match(pa, /MARKA PROMPT KİMLİĞİ[\s\S]*cinematic film still[\s\S]*cinematic high-contrast lighting[\s\S]*alkol, kalabalık/);
    await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'Kafede sabah' });
    assert.doesNotMatch(provider.calls.at(-1).prompt, /MARKA PROMPT KİMLİĞİ/);
  } finally { await s.stop(); }
});

test('7.7 kontrol kuralları: isteme kesin kural olarak girer, kalite kontrolü marka adı ve isimleri yakalar, görsel istemi buna uyar', async () => {
  const { identityImageLine, identityBlock: block } = await import('../server/services/promptIdentity.js');
  const idt = cleanIdentity({ noBrandName: true, forbidNames: 'Rakip Kafe, Ahmet', noRealPeople: true });
  assert.match(block(idt), /KONTROL KURALLARI[\s\S]*Marka adını prompt'a YAZMA[\s\S]*Rakip Kafe, Ahmet[\s\S]*Gerçek ya da ünlü kişi/);
  assert.match(identityImageLine(idt), /No real or famous people[\s\S]*Rakip Kafe, Ahmet/);

  const provider = fakeProvider([{ title: 'T', prompt: 'Kahve Durağı içinde Ahmet kahve içiyor, orta plan, sabah ışığı, 35mm f/1.8, sıcak tonlar, samimi atmosfer, gerçekçi fotoğraf, temiz kompozisyon, yazı yok, logo yok' }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kahve Durağı' })).data.brand;
    await s.request('PUT', `/api/brands/${a.id}/prompt-identity`, { noBrandName: true, forbidNames: 'Ahmet' });
    const p = (await s.request('POST', `/api/brands/${a.id}/prompts`, { kind: 'gorsel', brief: 'Kafede sabah' })).data.prompt;
    assert.match(provider.calls[0].prompt, /KONTROL KURALLARI[\s\S]*Marka adını prompt'a YAZMA[\s\S]*Ahmet/);
    const names = p.quality.checks.find(c => c.key === 'names');
    assert.equal(names.ok, false);
    assert.match(names.msg, /Ahmet[\s\S]*Kahve Durağı|Kahve Durağı[\s\S]*Ahmet/);
    assert.equal(p.ai.qualityRetried, true, 'isim geçtiği için bir kez daha yazılmalı');
    // Yazıya izin verilince "yazı yok" kapanışı aranmaz
    await s.request('PUT', `/api/brands/${a.id}/prompt-identity`, { allowText: true });
    const p2 = (await s.request('GET', `/api/brands/${a.id}/prompts/${p.id}`)).data.prompt;
    assert.equal(p2.quality.checks.some(c => c.key === 'negative'), false);
  } finally { await s.stop(); }
});
