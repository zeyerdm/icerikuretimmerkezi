// 8.13 Seslendirme (TTS): Gemini ses isteği biçimi, PCM → WAV, sahne sahne dosyalar ve altyazı zamanlamasında tek iz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './helpers.js';
import { wav, assemble } from '../server/services/voiceover.js';

const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
const scene = (o = {}) => Object.assign({
  duration: 6, start: 'Karakter kafede', endFrame: 'Fincan masada',
  beats: [{ from: 0, to: 3, action: 'Fincanı kaldırır', camera: 'Yakın plan', sound: '' }, { from: 3, to: 6, action: 'Gülümser', camera: 'Geniş plan', sound: 'zil' }],
  line: 'Vize haftası geldi ama kahven hazır, sakin ol ve nefes al biraz', lineFrom: 0.5, lineTo: 6,
  flowScene: '0-3s: Kahveci lifts the cup. 3-6s: Kahveci smiles.', flowSceneTr: '0-3 sn: Kahveci fincanı kaldırır. 3-6 sn: Kahveci gülümser.'
}, o);
const RAW = { title: 'Vize kahvesi', format: 'skec', topic: 'Vize', why: 'Herkes yaşar', punchline: 'Kahve', setting: 'Kafe', screenTitle: 'Vize haftası kahve molası', titleKeyword: 'kahve',
  scenes: [scene(), scene({ start: 'Önceki kareden devam', line: 'İkinci sahnenin repliği de burada akıcı biçimde söyleniyor şimdi' })], ending: { twist: 'Fincan konuşur', lastFrame: 'Logo' }, caption: 'Açıklama', hashtags: ['vize'], music: 'Neşeli' };

export function gemini() {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return json({ models: ['gemini-flash-latest', 'gemini-flash-lite-latest'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    const model = decodeURIComponent(u.pathname.split('/').pop().split(':')[0]);
    const body = JSON.parse(init.body);
    calls.push({ model, body });
    if (model.includes('tts')) {
      const pcm = Buffer.alloc(24000 * 2, 1); // 1 sn
      return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 100 } });
    }
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(RAW) }] } }], usageMetadata: {} });
  };
  return { impl, calls };
}

test('8.13 WAV başlığı ve zaman çizelgesine yerleştirme', () => {
  const w = wav(Buffer.alloc(48000), 24000);
  assert.equal(w.toString('ascii', 0, 4), 'RIFF');
  assert.equal(w.toString('ascii', 8, 12), 'WAVE');
  assert.equal(w.readUInt32LE(24), 24000);
  assert.equal(w.readUInt32LE(40), 48000);
  const a = Buffer.alloc(4, 1); const b = Buffer.alloc(4, 2);
  const out = assemble([{ at: 0, pcm: a }, { at: 1 / 24000, pcm: b }], 24000);
  assert.deepEqual([...out], [1, 1, 1, 1, 2, 2, 2, 2], 'çakışan parça bir öncekinin bitişinden başlar');
  assert.equal(assemble([{ at: 1, pcm: a }], 4).length, 8 + 4, 'başta sessizlik');
});

test('8.13 seslendirme: Gemini yokken açık hata; varken sahne sahne ses, tek iz, tek sahne yenileme, maliyet', async () => {
  const g = gemini();
  const s = await startServer({ fetchImpl: g.impl });
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Sesli' })).data.brand;
    assert.equal((await s.request('GET', '/api/tts')).data.configured, false);
    assert.equal((await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' })).status, 200);
    const r = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Vize kahvesi' })).data.reels;
    assert.ok(r.id, 'senaryo oluştu');
    assert.equal((await s.request('GET', `/api/brands/${b.id}/reels/${r.id}/voice`)).data.voiceover, null);
    assert.equal((await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/voice`, { voice: 'Yok' })).status, 400);

    const v = (await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/voice`, { voice: 'Puck', style: 'samimi ve enerjik' })).data;
    const tts = g.calls.filter(c => c.model.includes('tts'));
    assert.equal(tts.length, 2, 'her replik ayrı');
    assert.deepEqual(tts[0].body.generationConfig, { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } });
    assert.match(tts[0].body.contents[0].parts[0].text, /^Read aloud in natural Turkish, samimi ve enerjik:\nVize haftası geldi/);
    assert.equal(tts[0].model, 'gemini-2.5-flash-preview-tts');
    assert.equal(v.voiceover.voice, 'Puck');
    assert.deepEqual(v.voiceover.scenes.map(x => [x.i, x.seconds]), [[0, 1], [1, 1]]);
    // Tek iz: 2. sahnenin repliği 6 + 0,5 = 6,5. saniyede başlar → toplam 7,5 sn
    assert.equal(v.voiceover.seconds, 7.5);
    assert.ok(v.ai.cost > 0);
    const full = await fetch(s.base + v.voiceover.url);
    assert.equal(full.headers.get('content-type'), 'audio/wav');
    const buf = Buffer.from(await full.arrayBuffer());
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.readUInt32LE(40), 7.5 * 24000 * 2);
    assert.equal((await fetch(s.base + v.voiceover.scenes[1].url)).status, 200);
    assert.equal((await fetch(`${s.base}/api/brands/${b.id}/reels/${r.id}/voice/..%2Fx.wav`)).status, 404);

    // Tek sahne yeniden: yalnız bir istek, diğer sahne korunur
    const before = g.calls.length;
    const one = (await s.request('POST', `/api/brands/${b.id}/reels/${r.id}/voice`, { voice: 'Kore', sceneIndex: 1 })).data;
    assert.equal(g.calls.length - before, 1);
    assert.equal(one.voiceover.scenes.length, 2);
    const usage = (await s.request('GET', '/api/ai/usage')).data;
    assert.ok(JSON.stringify(usage).includes('Seslendirme'), 'harcamada ayrı iş olarak görünür');
    // Başka marka erişemez
    const o = (await s.request('POST', '/api/brands', { name: 'Diğer' })).data.brand;
    assert.equal((await s.request('GET', `/api/brands/${o.id}/reels/${r.id}/voice`)).status, 404);
  } finally { await s.stop(); }
});

let chromium = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { chromium = null; }

test('8.13 arayüz: Reels editöründe Seslendirme paneli; seslendirince ses izleri görünür, ses markaya kaydedilir', { skip: !chromium && 'Playwright yok' }, async () => {
  const g = gemini();
  const s = await startServer({ fetchImpl: g.impl });
  const browser = await chromium.launch();
  try {
    await s.request('PUT', '/api/ai/keys/gemini', { apiKey: 'AIzaTEST0123456789abcdefghijklmnop' });
    const b = (await s.request('POST', '/api/brands', { name: 'Ses UI' })).data.brand;
    const r = (await s.request('POST', `/api/brands/${b.id}/reels`, { topic: 'Vize' })).data.reels;
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    const problems = [];
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(`${s.base}/#/m/${b.id}/reels/${r.id}`);
    await page.locator('.ed-rail [data-rail="ses"]').click();
    await page.selectOption('#vo-voice', 'Achird');
    await page.locator('#vo-style').fill('sıcak ve samimi');
    await page.locator('[data-voice-all]').click();
    await page.locator('.vo-scenes li').nth(1).waitFor();
    assert.equal(await page.locator('audio.vo-audio').count(), 3, 'tam iz + 2 sahne');
    assert.equal(await page.locator('#vo-voice').inputValue(), 'Achird');
    const st = (await s.request('GET', `/api/brands/${b.id}/reels/settings`)).data.settings;
    assert.equal(st.voice, 'Achird');
    assert.equal(st.voiceStyle, 'sıcak ve samimi');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); await s.stop(); }
});
