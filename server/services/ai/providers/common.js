// Sağlayıcılar için ortak yardımcılar: tutarlı hata ve JSON ayrıştırma
import { HttpError } from '../../../lib/http.js';

// retryable: yedek modele geçmeye değer hata mı (bağlantı, zaman aşımı, kota, sunucu hatası)
// transient: aynı modelle kısa bekleyip yeniden denemeye değer geçici hata (yoğunluk 503, kota/hız 429, bağlantı kopması)
export function aiError(code, message, { retryable = false, transient = false, status = 502 } = {}) {
  const err = new HttpError(status, code, message);
  err.retryable = retryable;
  err.transient = transient;
  return err;
}

export const notConfigured = label => aiError('AI_NOT_CONFIGURED', `${label} bağlı değil. Yapay zekâ → Sağlayıcılar bölümünden anahtar ekle.`, { status: 409 });

export function describeStatus(label, status, message) {
  if (status === 401 || status === 403) return { msg: `${label} anahtarı reddedildi. Anahtarı kontrol et.`, retryable: false };
  if (status === 402) return { msg: `${label} bakiyesi yetersiz. Hesabına bakiye ekle.`, retryable: true };
  if (status === 404) return { msg: `Seçilen model ${label} hesabında bulunamadı. Başka bir model seç.`, retryable: true };
  if (status === 429) return { msg: `${label} kotası doldu ya da çok sık istek gönderildi. Biraz sonra tekrar dene.`, retryable: true, transient: true };
  if (status >= 500) return { msg: `${label} şu an yanıt vermiyor (yoğunluk). Biraz sonra tekrar dene.`, retryable: true, transient: true };
  if (status === 400 && /api key|apikey/i.test(message || '')) return { msg: `${label} anahtarı geçersiz.`, retryable: false };
  return { msg: `${label}: ${String(message || 'istek başarısız oldu').slice(0, 240)}`, retryable: false };
}

export function parseJsonOutput(label, text) {
  try {
    return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw aiError('AI_BAD_JSON', `${label} geçerli bir yanıt biçimi döndürmedi. Tekrar dene.`, { retryable: true });
  }
}

// Uzun Reels senaryoları özenli modellerde 1-2 dakika sürebilir
export const TIMEOUT_MS = 180000;

// 8.4 İptal ve akış yardımcıları
export const cancelled = () => aiError('AI_CANCELLED', 'Üretim iptal edildi.', { status: 499 });
// Zaman aşımı + (varsa) kullanıcının iptal sinyali
export const requestSignal = signal => (signal ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), signal]) : AbortSignal.timeout(TIMEOUT_MS));
// Server-Sent Events gövdesini satır satır okur; her "data:" satırının içeriğini verir
export async function* sseData(res, signal) {
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
    }
    if (buf.startsWith('data:')) yield buf.slice(5).trim();
  } catch (err) {
    if (signal && signal.aborted) throw cancelled();
    throw aiError('AI_UNAVAILABLE', 'Yanıt akışı yarıda kesildi.', { retryable: true, transient: true });
  }
}
