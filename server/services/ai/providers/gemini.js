// Google Gemini sağlayıcısı. Anahtar yalnızca sunucuda kullanılır; istekte başlık olarak gönderilir.
import { aiError, notConfigured, describeStatus, parseJsonOutput, TIMEOUT_MS } from './common.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const LABEL = 'Gemini';

export function createGeminiProvider({ getApiKey, fetchImpl = fetch }) {
  async function request(path, init) {
    const key = getApiKey();
    if (!key) throw notConfigured('Google Gemini');
    let res;
    try {
      res = await fetchImpl(BASE_URL + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      throw aiError('AI_UNAVAILABLE', err.name === 'TimeoutError' ? 'Gemini 3 dakika içinde yanıt vermedi.' : 'Gemini sunucusuna bağlanılamadı.', { retryable: true });
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const d = describeStatus(LABEL, res.status, data && data.error && data.error.message);
      throw aiError('AI_ERROR', d.msg, { retryable: d.retryable });
    }
    return data;
  }

  return {
    id: 'gemini',
    label: 'Google Gemini',

    async generate({ model, prompt, json = false, temperature = 0.8 }) {
      const generationConfig = { temperature };
      if (json) generationConfig.responseMimeType = 'application/json';
      const data = await request(encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
      });
      const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const text = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim();
      const u = (data && data.usageMetadata) || {};
      const usage = { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
      if (!text) throw aiError('AI_EMPTY', 'Gemini boş yanıt döndürdü (içerik filtresi olabilir).', { retryable: true });
      return { output: json ? parseJsonOutput(LABEL, text) : text, usage, model };
    },

    // Görsel üretimi: Imagen modelleri predict, Gemini görsel modelleri generateContent (referans görsel gönderilebilir)
    async image({ model, prompt, aspect = '1:1', refs = [] }) {
      if (/^imagen/.test(model)) {
        const ar = aspect === '4:5' ? '3:4' : aspect;
        const data = await request(encodeURIComponent(model) + ':predict', { method: 'POST', body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: ar } }) });
        const p = data && data.predictions && data.predictions[0];
        if (!p || !p.bytesBase64Encoded) throw aiError('AI_EMPTY', 'Imagen görsel döndürmedi (içerik filtresine takılmış olabilir; tarifi değiştirip tekrar dene).', { retryable: false });
        return { buffer: Buffer.from(p.bytesBase64Encoded, 'base64'), mime: p.mimeType || 'image/png', model };
      }
      const parts = [{ text: prompt }, ...refs.map(r => ({ inline_data: { mime_type: r.mime, data: r.data.toString('base64') } }))];
      const data = await request(encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspect } } })
      });
      const out = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const img = out.map(p => p.inlineData || p.inline_data).find(Boolean);
      if (!img || !img.data) throw aiError('AI_EMPTY', 'Gemini görsel döndürmedi (içerik filtresine takılmış olabilir; tarifi değiştirip tekrar dene).', { retryable: false });
      const u = (data && data.usageMetadata) || {};
      return { buffer: Buffer.from(img.data, 'base64'), mime: img.mimeType || img.mime_type || 'image/png', model, usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0 } };
    },

    async listModels() {
      const data = await request('?pageSize=200', { method: 'GET' });
      return ((data && data.models) || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => ({ id: String(m.name || '').replace(/^models\//, ''), label: m.displayName || '' }));
    }
  };
}
