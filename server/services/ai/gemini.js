// Google Gemini sağlayıcısı. Anahtar yalnızca sunucuda kullanılır; istekte başlık olarak gönderilir.
import { HttpError } from '../../lib/http.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const TIMEOUT_MS = 120000;

export const GEMINI_TEXT_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'];

function describeError(status, message) {
  if (status === 400 && /api key/i.test(message)) return 'Gemini API anahtarı geçersiz.';
  if (status === 401 || status === 403) return 'Gemini API anahtarı reddedildi: anahtarı veya API erişimini kontrol et.';
  if (status === 404) return 'Seçilen Gemini modeli bu anahtarla kullanılamıyor.';
  if (status === 429) return 'Gemini kotası doldu veya çok sık istek gönderildi. Biraz sonra tekrar dene.';
  if (status >= 500) return 'Gemini şu an yanıt vermiyor. Biraz sonra tekrar dene.';
  return message || 'Gemini isteği başarısız oldu.';
}

export function createGeminiProvider({ getApiKey, getModel, fetchImpl = fetch }) {
  async function request(path, init) {
    const key = getApiKey();
    if (!key) throw new HttpError(409, 'AI_NOT_CONFIGURED', "AI bağlı değil. Ayarlar'dan Gemini API anahtarını ekle.");
    let res;
    try {
      res = await fetchImpl(BASE_URL + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, ...(init && init.headers) },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      const msg = err.name === 'TimeoutError' ? 'Gemini 2 dakika içinde yanıt vermedi.' : 'Gemini sunucusuna bağlanılamadı.';
      throw new HttpError(502, 'AI_UNAVAILABLE', msg);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new HttpError(502, 'AI_ERROR', describeError(res.status, data && data.error && data.error.message));
    return data;
  }

  return {
    id: 'gemini',
    label: 'Google Gemini',

    // Metin üretir; json: true ise yanıtın JSON olması istenir ve ayrıştırılmış nesne döner
    async generate(prompt, { json = false, temperature = 0.8 } = {}) {
      const generationConfig = { temperature };
      if (json) generationConfig.responseMimeType = 'application/json';
      const data = await request(encodeURIComponent(getModel()) + ':generateContent', {
        method: 'POST',
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
      });
      const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const out = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim();
      if (!out) throw new HttpError(502, 'AI_EMPTY', 'Gemini boş yanıt döndürdü (içerik filtresi olabilir).');
      if (!json) return out;
      try {
        return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      } catch {
        throw new HttpError(502, 'AI_BAD_JSON', 'Gemini geçerli bir yanıt biçimi döndürmedi. Tekrar dene.');
      }
    },

    // Anahtarı doğrular: hesabın erişebildiği modelleri listeler
    async test() {
      const data = await request('?pageSize=200', { method: 'GET' });
      const models = ((data && data.models) || []).map(m => String(m.name || '').replace(/^models\//, ''));
      return { ok: true, modelCount: models.length, modelAvailable: models.includes(getModel()) || models.length === 0 };
    }
  };
}
