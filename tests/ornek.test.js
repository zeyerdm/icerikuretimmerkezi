// 7.9 Beğenilen örneği sabitleme: prompt ya da görsel "marka örneği" olur; sonraki üretimlere örnek olarak girer (en çok 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, PNG_1PX } from './helpers.js';

const B64 = PNG_1PX.toString('base64');
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const LONG = 'Bir barista sıcak bir kafede latte art yapıyor, yakın plan çekim, sıcak altın saat ışığı, 50mm lens, sığ alan derinliği, krem ve kahve tonlarında renk paleti, samimi ve davetkâr bir his, gerçekçi fotoğraf stili, arka planda bulanık ahşap raflar, temiz kompozisyon, yazı yok, harf yok, kelime yok, filigran yok, logo yok, altyazı yok';

function gemini() {
  const calls = [];
  let n = 0;
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash-image'].map(m => ({ name: 'models/' + m, supportedGenerationMethods: ['generateContent'] })) });
    const model = decodeURIComponent(u.pathname.split('/').pop().split(':')[0]);
    const body = JSON.parse(init.body);
    calls.push({ model, body, text: body.contents[0].parts.map(p => p.text || '').join('\n') });
    if (model.includes('image')) return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }], usageMetadata: {} });
    n++;
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: `Prompt ${n}`, prompt: `${LONG} ${n}`, promptTr: '' }) }] } }], usageMetadata: {} });
  };
  return { impl, calls };
}

test('7.9 marka örneği: prompt ve görsel örnek olur, sonraki üretimlerin istemine girer; en çok 3', async () => {
  const g = gemini();
  const s = await startServer({ fetchImpl: g.impl });
  try {
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' })).status, 200);
    const b = (await s.request('POST', '/api/brands', { name: 'Örnekli' })).data.brand;
    const url = `/api/brands/${b.id}/prompts`;
    const mk = async kind => (await s.request('POST', url, { kind, brief: 'Latte' })).data.prompt;

    const first = await mk('gorsel');
    assert.equal(first.example, false);
    assert.doesNotMatch(g.calls.at(-1).text, /MARKANIN BEĞENDİĞİ ÖRNEKLER/);
    const ex = (await s.request('PUT', `${url}/${first.id}`, { example: true })).data.prompt;
    assert.equal(ex.example, true);
    assert.equal((await s.request('GET', url)).data.prompts.find(p => p.id === first.id).example, true);

    await mk('gorsel');
    assert.match(g.calls.at(-1).text, /MARKANIN BEĞENDİĞİ ÖRNEKLER[\s\S]*ÖRNEK 1 — Prompt 1:\n[\s\S]*latte art/);
    await mk('metin');
    assert.doesNotMatch(g.calls.at(-1).text, /BEĞENDİĞİ ÖRNEKLER/, 'başka türün üretimine girmez');

    // Türe göre en çok 3
    const more = [await mk('gorsel'), await mk('gorsel'), await mk('gorsel')];
    for (const p of more.slice(0, 2)) assert.equal((await s.request('PUT', `${url}/${p.id}`, { example: true })).status, 200);
    const over = await s.request('PUT', `${url}/${more[2].id}`, { example: true });
    assert.equal(over.status, 400);
    assert.match(over.data.error.message, /en çok 3/);
    await s.request('PUT', `${url}/${first.id}`, { example: false });
    assert.equal((await s.request('PUT', `${url}/${more[2].id}`, { example: true })).status, 200, 'biri çıkınca yer açılır');

    // Görsel örneği: tarifi görsel türündeki prompt üretimine girer (prompt örnekleri 3'ten azsa)
    await s.request('PUT', `${url}/${more[2].id}`, { example: false });
    await s.request('PUT', `${url}/${more[1].id}`, { example: false });
    const gen = (await s.request('POST', `/api/brands/${b.id}/images`, { prompt: 'Turuncu fincanlı vitrin', model: 'gemini:gemini-2.5-flash-image' })).data;
    assert.ok(gen.asset);
    const hist = (await s.request('GET', `/api/brands/${b.id}/images`)).data.images;
    assert.equal(hist[0].example, false);
    assert.equal((await s.request('PUT', `/api/brands/${b.id}/images/${hist[0].id}/example`, { example: true })).data.example, true);
    assert.equal((await s.request('GET', `/api/brands/${b.id}/images`)).data.images[0].example, true);
    assert.equal((await s.request('PUT', `/api/brands/${b.id}/images/yok/example`, { example: true })).status, 404);
    await mk('urun');
    assert.match(g.calls.at(-1).text, /ÖRNEK 1 — Beğenilen görselin tarifi:\nTuruncu fincanlı vitrin/);

    // Başka markanın görselini işaretleyemez
    const other = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    assert.equal((await s.request('PUT', `/api/brands/${other.id}/images/${hist[0].id}/example`, { example: true })).status, 404);
  } finally { await s.stop(); }
});
