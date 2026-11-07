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

    async generate({ model, prompt, json = false }) {
      const body = { model, messages: [{ role: 'user', content: json ? prompt + '\n\nYanıtı yalnızca geçerli JSON olarak ver.' : prompt }] };
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
