// AI servis katmanı: sağlayıcı seçimi ve ayarlar tek yerde.
// Yeni bir sağlayıcı (ör. başka bir metin veya görsel modeli) buraya kaydedilerek eklenir.
import { createGeminiProvider, GEMINI_TEXT_MODELS } from './gemini.js';

const KEY_SETTING = 'ai.gemini.apiKey';
const MODEL_SETTING = 'ai.gemini.model';

export function createAiService(settings, { provider, fetchImpl } = {}) {
  const getApiKey = () => process.env.GEMINI_API_KEY || settings.get(KEY_SETTING) || '';
  const getModel = () => settings.get(MODEL_SETTING) || GEMINI_TEXT_MODELS[0];
  const active = provider || createGeminiProvider({ getApiKey, getModel, fetchImpl });

  return {
    provider: active,
    models: GEMINI_TEXT_MODELS,

    // İstemciye gönderilecek durum: anahtarın kendisi değil, yalnızca bağlı olup olmadığı ve son 4 karakteri
    status() {
      const key = getApiKey();
      return {
        provider: active.id,
        providerLabel: active.label,
        configured: provider ? true : Boolean(key),
        source: process.env.GEMINI_API_KEY ? 'env' : (settings.get(KEY_SETTING) ? 'settings' : null),
        keyHint: key ? '••••' + key.slice(-4) : null,
        model: getModel(),
        models: GEMINI_TEXT_MODELS
      };
    },

    setApiKey(key) { settings.set(KEY_SETTING, key); },
    clearApiKey() { settings.remove(KEY_SETTING); },
    setModel(model) { settings.set(MODEL_SETTING, model); },

    generate: (prompt, opts) => active.generate(prompt, opts),
    test: () => active.test()
  };
}
