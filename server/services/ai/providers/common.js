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
