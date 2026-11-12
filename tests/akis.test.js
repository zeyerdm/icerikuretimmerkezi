// 8.4 Uzun üretimde akış: ?stream=1 ile metin parça parça gelir, sonuç normal yanıtla aynıdır; bağlantı kapanınca
// üretim iptal edilir. Sağlayıcıların akış biçimleri (Gemini SSE, OpenAI uyumlu SSE, Anthropic SDK) sahte fetch ile denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';
import { createGeminiProvider } from '../server/services/ai/providers/gemini.js';
import { createOpenAiCompatibleProvider } from '../server/services/ai/providers/openai.js';
import { createAnthropicProvider } from '../server/services/ai/providers/anthropic.js';

const sse = lines => new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l)); c.close(); } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const TR_OK = 'Barista kafede latte art yapıyor, ahşap tezgâhlı sıcak bir kafe içinde, yakın plan çekim, sıcak altın saat ışığı yandan vuruyor, 50mm lens ve sığ alan derinliği, krem ve kahve tonlarında renk paleti, samimi ve davetkâr bir atmosfer, gerçekçi fotoğraf stili, fincandan yükselen buhar ve arka planda bulanık raflar, temiz kompozisyon, yazı yok, harf yok, kelime yok, filigran yok, logo yok, altyazı yok, arayüz öğesi yok';

async function readEvents(res) {
  const text = await res.text();
  return text.split('\n\n').filter(Boolean).map(b => ({ event: (/^event: (.+)$/m.exec(b) || [])[1], data: JSON.parse((/^data: (.*)$/m.exec(b) || [])[1] || '{}') }));
}

test('8.4 akışlı istek: parçalar "delta", sonuç "done"; hata "error" olayı; akışsız istek değişmez', async () => {
  const out = { title: 'Latte', prompt: TR_OK };
  const provider = fakeProvider([async (p, opts = {}) => out]);
  // fakeProvider generate(prompt, opts) → yanıt; burada parçaları da gönderen sürüm
  const streaming = { label: 'Akış', calls: [], async generate(prompt, opts) {
    const txt = JSON.stringify(out);
    if (opts.onDelta) for (let i = 0; i < txt.length; i += 40) opts.onDelta(txt.slice(i, i + 40));
    return out;
  }, async test() { return { ok: true, modelCount: 1, modelAvailable: true }; } };
  const s = await startServer({ aiProvider: streaming });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Akışlı' })).data.brand;
    const res = await fetch(`${s.base}/api/brands/${b.id}/prompts?stream=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'gorsel', brief: 'Latte' }) });
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const evs = await readEvents(res);
    const deltas = evs.filter(e => e.event === 'delta');
    assert.ok(deltas.length > 5, 'birden çok parça');
    assert.equal(deltas.map(d => d.data.t).join(''), JSON.stringify(out));
    const done = evs.at(-1);
    assert.equal(done.event, 'done');
    assert.equal(done.data.status, 201);
    assert.equal(done.data.body.prompt.text, TR_OK);
    // Hata: doğrulama hatası "error" olayı olur
    const bad = await readEvents(await fetch(`${s.base}/api/brands/${b.id}/prompts?stream=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'yok', brief: 'x' }) }));
    assert.equal(bad.at(-1).event, 'error');
    assert.equal(bad.at(-1).data.status, 400);
    assert.match(bad.at(-1).data.error.message, /Prompt türü/);
    // Akışsız istek eskisi gibi JSON
    const plain = await s.request('POST', `/api/brands/${b.id}/prompts`, { kind: 'gorsel', brief: 'Latte' });
    assert.equal(plain.status, 201);
    assert.equal(plain.data.prompt.text, TR_OK);
    assert.equal(provider.calls.length, 0);
  } finally { await s.stop(); }
});

test('8.4 iptal: istemci bağlantıyı kapatınca sağlayıcıya giden sinyal kesilir, yeniden deneme ve kayıt olmaz', async () => {
  let seen = null;
  let calls = 0;
  const slow = { label: 'Yavaş', async generate(prompt, opts) {
    calls++;
    seen = opts.signal;
    opts.onDelta('{"title":"Uzun');
    await new Promise((resolve, reject) => { const t = setTimeout(resolve, 5000); opts.signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { transient: true, retryable: true })); }); });
    return { title: 'x', prompt: TR_OK };
  }, async test() { return { ok: true, modelCount: 1, modelAvailable: true }; } };
  const s = await startServer({ aiProvider: slow });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'İptal' })).data.brand;
    const ac = new AbortController();
    const res = await fetch(`${s.base}/api/brands/${b.id}/prompts?stream=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'gorsel', brief: 'Latte' }), signal: ac.signal });
    const reader = res.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /event: delta/);
    ac.abort();
    reader.cancel().catch(() => {});
    for (let i = 0; i < 50 && !(seen && seen.aborted); i++) await new Promise(r => setTimeout(r, 20));
    assert.equal(seen.aborted, true, 'sağlayıcı iptali gördü');
    await new Promise(r => setTimeout(r, 100));
    assert.equal(calls, 1, 'iptalden sonra yeniden denenmez');
    assert.equal((await s.request('GET', `/api/brands/${b.id}/prompts`)).data.prompts.length, 0, 'yarım üretim kaydedilmez');
  } finally { await s.stop(); }
});

test('8.4 sağlayıcı akışları: Gemini, OpenAI uyumlu ve Anthropic parçaları sırayla verir, kullanımı toplar', async () => {
  // Gemini: streamGenerateContent?alt=sse, düşünce parçaları atlanır
  let gUrl = '';
  const gemini = createGeminiProvider({ getApiKey: () => 'k', fetchImpl: async url => { gUrl = String(url); return sse([
    'data: {"candidates":[{"content":{"parts":[{"text":"düşünüyor","thought":true}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"Mer"}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"haba"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\n']); } });
  const gd = [];
  const g = await gemini.generate({ model: 'gemini-flash-latest', prompt: 'x', onDelta: t => gd.push(t) });
  assert.match(gUrl, /:streamGenerateContent\?alt=sse$/);
  assert.deepEqual(gd, ['Mer', 'haba']);
  assert.equal(g.output, 'Merhaba');
  assert.deepEqual(g.usage, { input: 5, output: 2 });

  // OpenAI uyumlu: stream:true, [DONE] ile biter; JSON çıktı sonda ayrıştırılır
  let oBody = null;
  const openai = createOpenAiCompatibleProvider({ id: 'openai', label: 'OpenAI', shortLabel: 'OpenAI', baseURL: 'https://api.openai.com/v1', getApiKey: () => 'k', fetchImpl: async (url, init) => { oBody = JSON.parse(init.body); return sse([
    'data: {"choices":[{"delta":{"content":"{\\"a\\":"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"1}"}}]}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n',
    'data: [DONE]\n\n']); } });
  const od = [];
  const o = await openai.generate({ model: 'gpt-5', prompt: 'x', json: true, onDelta: t => od.push(t) });
  assert.equal(oBody.stream, true);
  assert.deepEqual(oBody.stream_options, { include_usage: true });
  assert.deepEqual(od, ['{"a":', '1}']);
  assert.deepEqual(o.output, { a: 1 });
  assert.deepEqual(o.usage, { input: 7, output: 3 });

  // Anthropic: resmî SDK'nın messages.stream'i ("text" olayları, finalMessage)
  const anthropic = createAnthropicProvider({ getApiKey: () => 'sk-ant-x', fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.stream, true);
    const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify(Object.assign({ type }, data))}\n\n`;
    return sse([
      ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 4, output_tokens: 0 } } }),
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Sel' } }),
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'am' } }),
      ev('content_block_stop', { index: 0 }),
      ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }),
      ev('message_stop', {})]);
  } });
  const ad = [];
  const a = await anthropic.generate({ model: 'claude-haiku-4-5', prompt: 'x', onDelta: t => ad.push(t) });
  assert.deepEqual(ad, ['Sel', 'am']);
  assert.equal(a.output, 'Selam');
  assert.equal(a.usage.output, 2);

  // İptal: kesilmiş sinyal "AI_CANCELLED" olur
  const ac = new AbortController(); ac.abort();
  await assert.rejects(gemini.generate({ model: 'm', prompt: 'x', onDelta: () => {}, signal: ac.signal }), e => e.code === 'AI_CANCELLED' || /iptal/i.test(e.message));
});
