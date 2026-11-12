// Test yardımcıları: geçici veri klasörüyle uygulamayı rastgele bir portta başlatır.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

export const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Sahte AI sağlayıcısı: verilen yanıtları sırayla döndürür ve gelen prompt'ları saklar
export function fakeProvider(responses = []) {
  const calls = [];
  return {
    id: 'fake', label: 'Test sağlayıcısı', calls,
    async generate(prompt, opts) {
      calls.push({ prompt, opts });
      const next = responses.length > 1 ? responses.shift() : responses[0];
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(prompt) : next;
    },
    async test() { return { ok: true, modelCount: 1, modelAvailable: true }; }
  };
}

export async function startServer(options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-test-'));
  const { app, close } = createApp(Object.assign({ dataDir, aiRetryDelays: [0, 0] }, options)); // testlerde yeniden deneme beklemesiz
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://localhost:${server.address().port}`;

  async function request(method, url, body, headers = {}) {
    const init = { method, headers: Object.assign({}, headers) };
    if (Buffer.isBuffer(body)) { init.body = body; init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/octet-stream'; }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(base + url, init);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : (res.status === 204 ? null : Buffer.from(await res.arrayBuffer()));
    return { status: res.status, data, headers: res.headers };
  }

  return {
    base, dataDir, request,
    async stop() {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

const gjson = b => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
const scene = (o = {}) => Object.assign({
  duration: 6, start: 'Karakter kafede', endFrame: 'Fincan masada',
  beats: [{ from: 0, to: 3, action: 'Fincanı kaldırır', camera: 'Yakın plan', sound: '' }, { from: 3, to: 6, action: 'Gülümser', camera: 'Geniş plan', sound: 'zil' }],
  line: 'Vize haftası geldi ama kahven hazır, sakin ol ve nefes al biraz', lineFrom: 0.5, lineTo: 6,
  flowScene: '0-3s: Kahveci lifts the cup. 3-6s: Kahveci smiles.', flowSceneTr: '0-3 sn: Kahveci fincanı kaldırır. 3-6 sn: Kahveci gülümser.'
}, o);
const RAW = { title: 'Vize kahvesi', format: 'skec', topic: 'Vize', why: 'Herkes yaşar', punchline: 'Kahve', setting: 'Kafe', screenTitle: 'Vize haftası kahve molası', titleKeyword: 'kahve',
  scenes: [scene(), scene({ start: 'Önceki kareden devam', line: 'İkinci sahnenin repliği de burada akıcı biçimde söyleniyor şimdi' })], ending: { twist: 'Fincan konuşur', lastFrame: 'Logo' }, caption: 'Açıklama', hashtags: ['vize'], music: 'Neşeli' };

// Sahte Gemini: senaryo yazımı (Reels JSON) ve TTS (1 sn PCM) — 8.13/8.14 testleri
export function fakeGeminiReels() {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.replace(/\/$/, '').endsWith('/models')) return gjson({ models: ['gemini-flash-latest', 'gemini-flash-lite-latest'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    const model = decodeURIComponent(u.pathname.split('/').pop().split(':')[0]);
    const body = JSON.parse(init.body);
    calls.push({ model, body });
    if (model.includes('tts')) {
      const pcm = Buffer.alloc(24000 * 2, 1); // 1 sn
      return gjson({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 100 } });
    }
    return gjson({ candidates: [{ content: { parts: [{ text: JSON.stringify(RAW) }] } }], usageMetadata: {} });
  };
  return { impl, calls };
}

