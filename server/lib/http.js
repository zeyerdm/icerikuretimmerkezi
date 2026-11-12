// Ortak HTTP yardımcıları: tutarlı hata yanıtı, doğrulama, kimlik ve zaman
import { randomUUID } from 'node:crypto';
import { streamCtx } from './streamCtx.js';

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

// Express 5 async hataları kendisi yakalar; bu sarmalayıcı yalnızca okunabilirlik için.
// 8.4: ?stream=1 ile çağrılınca yanıt Server-Sent Events olur: "delta" (metin parçası), "reset" (yedek modele/yeniden
// denemeye geçildi), sonunda "done" ({ status, body }) ya da "error" ({ status, error }). Bağlantı kapanırsa üretim iptal edilir.
export const route = fn => (req, res, next) => {
  if (req.query && req.query.stream === '1') return streamRoute(fn, req, res);
  return Promise.resolve(fn(req, res, next)).catch(next);
};

function errorBody(err) {
  if (err instanceof HttpError) return { status: err.status, error: { code: err.code, message: err.message } };
  console.error(err);
  return { status: 500, error: { code: 'INTERNAL', message: 'Beklenmeyen bir sunucu hatası oluştu.' } };
}

async function streamRoute(fn, req, res) {
  res.status(200);
  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const ac = new AbortController();
  let finished = false;
  res.on('close', () => { if (!finished) ac.abort(); });
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const finish = (event, data) => { if (finished) return; finished = true; send(event, data); res.end(); };
  let code = 200;
  // İşleyicinin res.status(...).json(...) çağrıları "done" olayına çevrilir
  const shim = {
    status(c) { code = c; return shim; },
    json(body) { finish('done', { status: code, body }); return shim; },
    end() { finish('done', { status: code, body: null }); return shim; },
    set() { return shim; }, setHeader() { return shim; }, get locals() { return res.locals; }
  };
  try {
    await streamCtx.run({ signal: ac.signal, onDelta: t => (t === null ? send('reset', {}) : send('delta', { t })) }, () => fn(req, shim, err => { throw err; }));
    if (!finished) finish('done', { status: code, body: null });
  } catch (err) {
    if (ac.signal.aborted) { finished = true; return; } // istemci gitti; yazılacak yer yok
    finish('error', errorBody(err));
  }
}

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
