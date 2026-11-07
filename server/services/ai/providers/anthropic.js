// Anthropic Claude sağlayıcısı (resmî @anthropic-ai/sdk ile). Anahtar yalnızca sunucuda kullanılır.
import Anthropic from '@anthropic-ai/sdk';
import { aiError, notConfigured, describeStatus, parseJsonOutput, TIMEOUT_MS } from './common.js';

const LABEL = 'Claude';
// Bu modellerde Anthropic'in sunucu tarafı yedeği açılır: model bir isteği güvenlik nedeniyle
// geri çevirirse aynı istek uygun bir Claude modelinde yeniden denenir.
const SERVER_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-fable-5-1']);
// Düşünme derinliği (effort) yalnızca 5. nesil modellerde gönderilir
const supportsEffort = model => /^claude-(opus|sonnet|haiku|fable)-5/.test(model);

// Adres sabit verilir: ortamdaki ANTHROPIC_BASE_URL gibi bir değişken anahtarı başka bir sunucuya yönlendiremez
export function createAnthropicProvider({ getApiKey, fetchImpl, baseURL = 'https://api.anthropic.com' }) {
  let cached = null;
  const client = () => {
    const key = getApiKey();
    if (!key) throw notConfigured('Anthropic Claude');
    if (!cached || cached.key !== key) {
      cached = { key, sdk: new Anthropic({ apiKey: key, maxRetries: 1, timeout: TIMEOUT_MS, baseURL, ...(fetchImpl ? { fetch: fetchImpl } : {}) }) };
    }
    return cached.sdk;
  };

  function mapError(err) {
    if (err instanceof Anthropic.APIConnectionError) {
      return aiError('AI_UNAVAILABLE', /timeout/i.test(err.message) ? 'Claude 2 dakika içinde yanıt vermedi.' : 'Claude sunucusuna bağlanılamadı.', { retryable: true });
    }
    if (err instanceof Anthropic.APIError) {
      const d = describeStatus(LABEL, err.status, err.message);
      return aiError('AI_ERROR', d.msg, { retryable: d.retryable });
    }
    return err;
  }

  return {
    id: 'anthropic',
    label: 'Anthropic Claude',

    async generate({ model, prompt, json = false, effort = 'medium' }) {
      const sdk = client();
      const params = {
        model,
        max_tokens: 16000,
        system: json ? 'Yanıtı yalnızca geçerli JSON olarak ver; JSON dışında metin, açıklama veya kod bloğu ekleme.' : undefined,
        messages: [{ role: 'user', content: prompt }]
      };
      if (supportsEffort(model)) params.output_config = { effort };
      let res;
      try {
        res = SERVER_FALLBACK.has(model)
          ? await sdk.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
          : await sdk.messages.create(params);
      } catch (err) { throw mapError(err); }
      const u = res.usage || {};
      const usage = { input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens || 0 };
      if (res.stop_reason === 'refusal') throw aiError('AI_REFUSED', 'Claude bu isteği güvenlik nedeniyle yanıtlamadı. İsteği farklı ifade etmeyi dene.', { retryable: true });
      const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      if (!text) throw aiError('AI_EMPTY', 'Claude boş yanıt döndürdü.', { retryable: true });
      return { output: json ? parseJsonOutput(LABEL, text) : text, usage, model: res.model || model };
    },

    async listModels() {
      const sdk = client();
      const out = [];
      try {
        for await (const m of sdk.models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name || m.id });
      } catch (err) { throw mapError(err); }
      return out;
    }
  };
}
