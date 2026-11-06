// Ortak HTTP yardımcıları: tutarlı hata yanıtı, doğrulama, kimlik ve zaman
import { randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'VALIDATION_ERROR', message, details);
export const notFound = (message = 'Kayıt bulunamadı.') => new HttpError(404, 'NOT_FOUND', message);

export const newId = () => randomUUID();
export const now = () => new Date().toISOString();

// Express 5 async hataları kendisi yakalar; bu sarmalayıcı yalnızca okunabilirlik için
export const route = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Metin alanı: kırpılır, uzunluk sınırı uygulanır
export function text(value, { field, max = 2000, required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`${field} zorunlu.`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${field} metin olmalı.`);
  const v = value.trim();
  if (required && !v) throw badRequest(`${field} zorunlu.`);
  if (v.length > max) throw badRequest(`${field} en fazla ${max} karakter olabilir.`);
  return v;
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw badRequest(`${field} geçersiz. Geçerli değerler: ${allowed.join(', ')}`);
  return value;
}

export const HEX = /^#[0-9a-fA-F]{6}$/;

export function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Gönderilen dosya veya veri çok büyük.' } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'İstek gövdesi geçerli JSON değil.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Beklenmeyen bir sunucu hatası oluştu.' } });
}
