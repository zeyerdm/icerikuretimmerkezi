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
  const { app, close } = createApp(Object.assign({ dataDir }, options));
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
      await new Promise(resolve => server.close(resolve));
      close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}
