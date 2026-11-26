// O2 · Yapay zekâ harcamasının içeriğe bağlanması: istek bağlamı (AsyncLocalStorage). Servisler değişmez.
// Bağlam istek adresinden çıkarılır (ör. /contents/<id>/write → içerik, /brands/<m>/posts/<id>/rewrite → post:<id>);
// yeni kayıt oluşturan isteklerde (ör. POST /brands/<m>/posts) yanıttaki kaydın kimliği sonradan yazılır.
// AI katmanı her kullanım satırını bu bağlamla kaydeder (ai_usage.content_id, ai_usage.ref).
import { AsyncLocalStorage } from 'node:async_hooks';

export const usageCtx = new AsyncLocalStorage();
export const usageScope = () => usageCtx.getStore() || null;
// Ücretli işlem onayı (Aşama 04): istek bağlamında kullanıcı bu işlemin tutarını onayladı mı (confirmCost).
// Bağlam yoksa (arka plan işi, toplu kuyruk) onay istenmez; onay kuyruğa alınırken alınır.
export const costCtx = new AsyncLocalStorage();
// Yanıt gövdesi (akışlı ya da akışsız) bağlama bildirilir: yeni oluşan kaydın kimliği buradan okunur
export function noteBody(body) {
  const s = usageScope();
  if (s && s.onBody) { try { s.onBody(body); } catch { /* bağlama yazılamazsa yanıt etkilenmez */ } }
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND = { posts: 'post', prompts: 'prompt', reels: 'reels' };
// API yolundan (router'a göre) bağlam
export function scopeFromPath(path, body) {
  const p = String(path || '').split('/').filter(Boolean);
  if (p[0] === 'contents' && ID.test(p[1] || '')) return { contentId: p[1], ref: null, create: null };
  if (p[0] === 'brands' && KIND[p[2]]) {
    if (ID.test(p[3] || '')) return { contentId: null, ref: `${KIND[p[2]]}:${p[3]}`, create: null };
    return { contentId: null, ref: null, create: KIND[p[2]] };
  }
  if (p[0] === 'brands' && p[2] === 'images' && body && ID.test(String(body.promptId || ''))) return { contentId: null, ref: `prompt:${body.promptId}`, create: null };
  return null;
}
