// Google Gemini sağlayıcısı. Anahtar yalnızca sunucuda kullanılır; istekte başlık olarak gönderilir.
import { aiError, notConfigured, describeStatus, parseJsonOutput, cancelled, requestSignal, sseData } from './common.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const LABEL = 'Gemini';

export function createGeminiProvider({ getApiKey, fetchImpl = fetch }) {
  async function request(path, init, { signal = null, raw = false } = {}) {
    const key = getApiKey();
    if (!key) throw notConfigured('Google Gemini');
    if (signal && signal.aborted) throw cancelled();
    let res;
    try {
      res = await fetchImpl(BASE_URL + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: requestSignal(signal)
      });
    } catch (err) {
      if (signal && signal.aborted) throw cancelled();
      throw aiError('AI_UNAVAILABLE', err.name === 'TimeoutError' ? 'Gemini 3 dakika içinde yanıt vermedi.' : 'Gemini sunucusuna bağlanılamadı.', { retryable: true, transient: err.name !== 'TimeoutError' });
    }
    if (raw && res.ok) return res;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const d = describeStatus(LABEL, res.status, data && data.error && data.error.message);
      throw aiError('AI_ERROR', d.msg, { retryable: d.retryable, transient: Boolean(d.transient) });
    }
    return data;
  }

  return {
    id: 'gemini',
    label: 'Google Gemini',

    async generate({ model, prompt, json = false, temperature = 0.8, images = [], videoUrl = null, onDelta = null, signal = null }) {
      const generationConfig = { temperature };
      if (json) generationConfig.responseMimeType = 'application/json';
      // YouTube bağlantısı Gemini'ye doğrudan video girdisi olarak verilir (herkese açık videolar)
      const video = videoUrl ? [{ file_data: { file_uri: videoUrl } }] : [];
      const reqBody = JSON.stringify({ contents: [{ parts: [...video, ...images.map(i => ({ inline_data: { mime_type: i.mime, data: i.data.toString('base64') } })), { text: prompt }] }], generationConfig });
      if (onDelta) {
        // 8.4 akış: her olay bir parça; düşünce parçaları gösterilmez, kullanım son olayda
        const res = await request(encodeURIComponent(model) + ':streamGenerateContent?alt=sse', { method: 'POST', body: reqBody }, { signal, raw: true });
        let text = ''; let u = {};
        for await (const d of sseData(res, signal)) {
          let ev; try { ev = JSON.parse(d); } catch { continue; }
          const ps = (ev.candidates && ev.candidates[0] && ev.candidates[0].content && ev.candidates[0].content.parts) || [];
          for (const p of ps) if (!p.thought && typeof p.text === 'string' && p.text) { text += p.text; onDelta(p.text); }
          if (ev.usageMetadata) u = ev.usageMetadata;
        }
        text = text.trim();
        if (!text) throw aiError('AI_EMPTY', 'Gemini boş yanıt döndürdü (içerik filtresi olabilir).', { retryable: true });
        return { output: json ? parseJsonOutput(LABEL, text) : text, usage: { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) }, model };
      }
      const data = await request(encodeURIComponent(model) + ':generateContent', { method: 'POST', body: reqBody }, { signal });
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
        body: JSON.stringify({ contents: [{ parts }], generationConfig: Object.assign({ responseModalities: ['TEXT', 'IMAGE'] }, aspect ? { imageConfig: { aspectRatio: aspect } } : {}) })
      });
      const out = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const img = out.map(p => p.inlineData || p.inline_data).find(Boolean);
      if (!img || !img.data) throw aiError('AI_EMPTY', 'Gemini görsel döndürmedi (içerik filtresine takılmış olabilir; tarifi değiştirip tekrar dene).', { retryable: false });
      const u = (data && data.usageMetadata) || {};
      return { buffer: Buffer.from(img.data, 'base64'), mime: img.mimeType || img.mime_type || 'image/png', model, usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0 } };
    },

    // 8.14 Metinden video (Veo): uzun süren işlem başlatılır, adıyla sorgulanır, bitince video indirilir
    async videoStart({ model, prompt, aspect = '9:16' }) {
      const data = await request(encodeURIComponent(model) + ':predictLongRunning', { method: 'POST', body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: aspect } }) });
      if (!data || !data.name) throw aiError('AI_EMPTY', 'Veo üretimi başlatılamadı.', { retryable: false });
      return { operation: data.name };
    },
    async videoPoll(operation) {
      if (!/^[\w./-]+$/.test(operation)) throw aiError('AI_ERROR', 'Geçersiz işlem adı.');
      const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/' + operation, { headers: { 'x-goog-api-key': getApiKey() }, signal: requestSignal(null) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { const d = describeStatus(LABEL, res.status, data && data.error && data.error.message); throw aiError('AI_ERROR', d.msg, { retryable: d.retryable, transient: Boolean(d.transient) }); }
      if (!data.done) return { done: false };
      if (data.error) return { done: true, error: String(data.error.message || 'Veo üretimi başarısız oldu.') };
      const r = data.response || {};
      const s = (r.generateVideoResponse && r.generateVideoResponse.generatedSamples) || r.generatedVideos || [];
      const uri = s[0] && s[0].video && s[0].video.uri;
      if (!uri) return { done: true, error: 'Veo video döndürmedi (içerik filtresine takılmış olabilir; prompt\'u değiştirip tekrar dene).' };
      return { done: true, uri };
    },
    async videoDownload(uri) {
      const u = new URL(uri);
      if (u.hostname !== 'generativelanguage.googleapis.com') throw aiError('AI_ERROR', 'Beklenmeyen video adresi.');
      const res = await fetchImpl(u.toString(), { headers: { 'x-goog-api-key': getApiKey() }, signal: requestSignal(null) });
      if (!res.ok) throw aiError('AI_ERROR', 'Video indirilemedi.', { retryable: true, transient: true });
      return Buffer.from(await res.arrayBuffer());
    },

    // 8.13 Seslendirme: yanıt 16 bit tek kanallı PCM (genelde 24 kHz); mime türünden örnekleme hızı okunur
    async speech({ model, text, voice = 'Kore' }) {
      const data = await request(encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } })
      });
      const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const a = parts.map(p => p.inlineData || p.inline_data).find(x => x && x.data);
      if (!a) throw aiError('AI_EMPTY', 'Gemini ses döndürmedi (metin içerik filtresine takılmış olabilir).', { retryable: false });
      const mime = a.mimeType || a.mime_type || '';
      const rate = Number((/rate=(\d+)/.exec(mime) || [])[1]) || 24000;
      const u = (data && data.usageMetadata) || {};
      return { pcm: Buffer.from(a.data, 'base64'), rate, mime, usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0 }, model };
    },

    async listModels() {
      const data = await request('?pageSize=200', { method: 'GET' });
      return ((data && data.models) || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => ({ id: String(m.name || '').replace(/^models\//, ''), label: m.displayName || '' }));
    }
  };
}
