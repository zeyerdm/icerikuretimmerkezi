// OpenAI uyumlu sağlayıcılar: OpenAI ve OpenRouter (aynı sohbet API'si, farklı adres ve anahtar).
// OpenRouter model listesi fiyatlarla birlikte gelir; yanıtta harcanan tutarı da bildirir.
import { aiError, notConfigured, describeStatus, parseJsonOutput, TIMEOUT_MS } from './common.js';

export function createOpenAiCompatibleProvider({ id, label, shortLabel, baseURL, getApiKey, fetchImpl = fetch, extraHeaders = {} }) {
  async function request(path, init) {
    const key = getApiKey();
    if (!key) throw notConfigured(label);
    let res;
    try {
      res = await fetchImpl(baseURL + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      throw aiError('AI_UNAVAILABLE', err.name === 'TimeoutError' ? `${shortLabel} 3 dakika içinde yanıt vermedi.` : `${shortLabel} sunucusuna bağlanılamadı.`, { retryable: true });
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const d = describeStatus(shortLabel, res.status, data && data.error && (data.error.message || data.error));
      throw aiError('AI_ERROR', d.msg, { retryable: d.retryable });
    }
    return data;
  }

  return {
    id,
    label,

    async generate({ model, prompt, json = false, images = [] }) {
      const textPart = json ? prompt + '\n\nYanıtı yalnızca geçerli JSON olarak ver.' : prompt;
      const content = images.length ? [{ type: 'text', text: textPart }, ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data.toString('base64')}` } }))] : textPart;
      const body = { model, messages: [{ role: 'user', content }] };
      if (json) body.response_format = { type: 'json_object' };
      if (id === 'openrouter') body.usage = { include: true };
      const data = await request('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
      const choice = data && data.choices && data.choices[0];
      const text = String((choice && choice.message && choice.message.content) || '').trim();
      const u = (data && data.usage) || {};
      const usage = { input: u.prompt_tokens || 0, output: u.completion_tokens || 0 };
      // OpenRouter gerçek tutarı bildirir (USD)
      const cost = typeof u.cost === 'number' ? u.cost : undefined;
      if (!text) throw aiError('AI_EMPTY', `${shortLabel} boş yanıt döndürdü.`, { retryable: true });
      return { output: json ? parseJsonOutput(shortLabel, text) : text, usage, cost, model: (data && data.model) || model };
    },

    // Görsel üretimi. OpenAI: images API (b64). OpenRouter: sohbet API'si, görsel çıktı kipi; referans görsel gönderilebilir.
    async image({ model, prompt, aspect = '1:1', refs = [] }) {
      if (id === 'openrouter') {
        const content = [{ type: 'text', text: prompt }, ...refs.map(r => ({ type: 'image_url', image_url: { url: `data:${r.mime};base64,${r.data.toString('base64')}` } }))];
        const data = await request('/chat/completions', { method: 'POST', body: JSON.stringify({ model, messages: [{ role: 'user', content }], modalities: ['image', 'text'], image_config: { aspect_ratio: aspect }, usage: { include: true } }) });
        const msg = data && data.choices && data.choices[0] && data.choices[0].message;
        const url = msg && msg.images && msg.images[0] && msg.images[0].image_url && msg.images[0].image_url.url;
        const m = /^data:([^;]+);base64,(.+)$/.exec(String(url || ''));
        if (!m) throw aiError('AI_EMPTY', 'OpenRouter görsel döndürmedi (model görsel üretmiyor olabilir ya da içerik filtresine takıldı).', { retryable: false });
        return { buffer: Buffer.from(m[2], 'base64'), mime: m[1], cost: data.usage && typeof data.usage.cost === 'number' ? data.usage.cost : undefined, model: data.model || model };
      }
      const size = aspect === '1:1' ? '1024x1024' : aspect === '16:9' ? '1536x1024' : '1024x1536';
      const data = await request('/images/generations', { method: 'POST', body: JSON.stringify({ model, prompt, n: 1, size }) });
      const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
      if (!b64) throw aiError('AI_EMPTY', 'OpenAI görsel döndürmedi (içerik politikasına takılmış olabilir).', { retryable: false });
      return { buffer: Buffer.from(b64, 'base64'), mime: 'image/png', model };
    },

    async listModels() {
      const data = await request('/models', { method: 'GET' });
      const list = (data && data.data) || [];
      if (id === 'openrouter') {
        return list.filter(m => !m.architecture || !m.architecture.output_modalities || m.architecture.output_modalities.includes('text')).map(m => {
          const p = m.pricing || {};
          const input = Number(p.prompt) * 1e6;
          const output = Number(p.completion) * 1e6;
          return { id: m.id, label: m.name || m.id, price: Number.isFinite(input) && Number.isFinite(output) ? { input, output, source: 'canli' } : undefined };
        });
      }
      // OpenAI listesi fiyat içermez; yalnızca sohbet modelleri gösterilir
      return list.map(m => ({ id: m.id, label: m.id })).filter(m => /^(gpt-|o\d|chatgpt)/.test(m.id) && !/(audio|realtime|transcribe|tts|image|search|embedding)/.test(m.id));
    }
  };
}
