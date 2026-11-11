// 7.11 Beğen/beğenme ile öğrenme: oylar ve nedenler; tekrar eden 👎 nedeni prompt kimliğine öneri olarak düşer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

test('7.11 geri bildirim: oy, neden, öneri, uygula, geç', async () => {
  const s = await startServer();
  try {
    const meta = (await s.request('GET', '/api/meta')).data;
    assert.equal(meta.feedbackReasons.karanlik, 'Çok karanlık');
    const b = (await s.request('POST', '/api/brands', { name: 'Oylu' })).data.brand;
    const url = `/api/brands/${b.id}`;
    const mk = async n => (await s.request('POST', `${url}/prompts`, { manual: true, kind: 'gorsel', title: `P${n}`, text: `Prompt ${n}` })).data.prompt;
    const ps = [await mk(1), await mk(2), await mk(3), await mk(4)];
    const vote = (p, v, reasons = [], note = '') => s.request('PUT', `${url}/feedback`, { targetType: 'prompt', targetId: p.id, vote: v, reasons, note });

    const up = (await vote(ps[0], 1, ['karanlik'])).data;
    assert.deepEqual(up.feedback.reasons, [], '👍 nedenleri saklanmaz');
    assert.equal((await s.request('GET', `${url}/prompts/${ps[0].id}`)).data.prompt.feedback.vote, 1);
    // Aynı hedefe yeniden oy güncellenir
    await vote(ps[0], -1, ['karanlik', 'maskot', 'yok-boyle'], '  çok   koyu ');
    const f0 = (await s.request('GET', `${url}/prompts/${ps[0].id}`)).data.prompt.feedback;
    assert.deepEqual(f0, { vote: -1, reasons: ['karanlik', 'maskot'], note: 'çok koyu' });
    assert.equal((await vote(ps[1], 1)).status, 200);
    assert.equal((await vote(ps[1], 5)).status, 400);
    assert.equal((await s.request('PUT', `${url}/feedback`, { targetType: 'prompt', targetId: 'yok', vote: 1 })).status, 404);

    // 3 kez "çok karanlık" → öneri
    await vote(ps[1], -1, ['karanlik', 'maskot']);
    assert.equal((await s.request('GET', `${url}/feedback/suggestions`)).data.suggestions.length, 0, 'eşik 3');
    const third = (await vote(ps[2], -1, ['karanlik', 'maskot', 'kalabalik'])).data;
    assert.deepEqual(third.suggestions.map(x => x.reason), ['karanlik', 'maskot']);
    assert.equal(third.suggestions[0].count, 3);
    assert.match(third.suggestions[0].text, /Aydınlık, doğal gün ışığı/);
    assert.equal(third.suggestions[1].canApply, false);
    assert.equal((await s.request('POST', `${url}/feedback/suggestions/maskot/apply`)).status, 400);

    // Uygula: kimlik değişir, öneri kaybolur
    await s.request('PUT', `${url}/prompt-identity`, { avoid: ['alkol'], mood: ['sakin'] });
    const ap = (await s.request('POST', `${url}/feedback/suggestions/karanlik/apply`)).data;
    assert.equal(ap.identity.lighting, 'dogal');
    assert.deepEqual(ap.identity.avoid, ['alkol'], 'diğer cevaplar korunur');
    assert.deepEqual(ap.suggestions.map(x => x.reason), ['maskot']);

    // Geç: öneri kaybolur, 3 yeni tekrardan sonra geri gelir
    assert.deepEqual((await s.request('POST', `${url}/feedback/suggestions/maskot/dismiss`)).data.suggestions, []);
    await vote(ps[3], -1, ['maskot']);
    assert.deepEqual((await s.request('GET', `${url}/feedback/suggestions`)).data.suggestions, []);

    // Görsel oyu: başka markanın görseline oy verilemez; vote 0 oyu kaldırır
    await vote(ps[3], 0);
    assert.equal((await s.request('GET', `${url}/prompts/${ps[3].id}`)).data.prompt.feedback, null);
    assert.equal((await s.request('PUT', `${url}/feedback`, { targetType: 'image', targetId: 'yok', vote: 1 })).status, 404);
    assert.equal((await s.request('PUT', `${url}/feedback`, { targetType: 'video', targetId: 'x', vote: 1 })).status, 400);
  } finally { await s.stop(); }
});
