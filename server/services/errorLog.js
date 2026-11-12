// 8.19 Hata günlüğü: son sunucu hataları, arayüz hataları ve başarısız AI istekleri tek listede (Ayarlar → Hata günlüğü).
// İletilerden anahtar/belirteç benzeri dizgiler silinir; "Destek için kopyala" bu temizlenmiş metni verir.
import { newId, now, text, badRequest } from '../lib/http.js';

const KEEP = 500;
// API anahtarı, belirteç, e-posta ve uzun gizli dizgileri gizler
export function redact(s) {
  return String(s || '')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,})\b/g, '[gizlendi]')
    .replace(/\b(Bearer|key=|apiKey=|token=)\s*[A-Za-z0-9._-]{12,}/gi, '$1 [gizlendi]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-posta]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[gizlendi]');
}

export function createErrorLogService({ db, settings, ai }) {
  let clientCount = 0; let clientWindow = Date.now();
  const add = (kind, source, message, detail = '') => {
    db.prepare('INSERT INTO error_log (id, created_at, kind, source, message, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId(), now(), kind, redact(source).slice(0, 200), redact(message).slice(0, 500), redact(detail).slice(0, 2000));
    db.prepare('DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY created_at DESC LIMIT ?)').run(KEEP);
  };
  return {
    server(err, source) { add('sunucu', source, err && err.message ? err.message : String(err), err && err.stack ? String(err.stack).split('\n').slice(0, 4).join('\n') : ''); },
    // Tarayıcı hataları (dakikada en çok 20; uydurma yükü sınırlı)
    client(body = {}) {
      if (Date.now() - clientWindow > 60000) { clientWindow = Date.now(); clientCount = 0; }
      const message = text(body.message, { field: 'İleti', max: 500 });
      if (!message) throw badRequest('İleti gerekli.');
      if (++clientCount > 20) return { ok: false };
      add('arayuz', text(body.source, { field: 'Kaynak', max: 200 }) || '', message, text(body.detail, { field: 'Ayrıntı', max: 2000 }) || '');
      return { ok: true };
    },
    list(limit = 100) {
      const since = settings.get('errors.clearedAt') || '';
      const n = Math.min(300, Math.max(1, Number(limit) || 100));
      const own = db.prepare('SELECT created_at, kind, source, message, detail FROM error_log WHERE created_at > ? ORDER BY created_at DESC LIMIT ?').all(since, n)
        .map(r => ({ at: r.created_at, kind: r.kind, source: r.source, model: '', message: r.message, detail: r.detail }));
      const aiRows = db.prepare('SELECT created_at, provider, model, task, error FROM ai_usage WHERE ok = 0 AND created_at > ? ORDER BY created_at DESC LIMIT ?').all(since, n)
        .map(r => ({ at: r.created_at, kind: 'ai', source: r.task, model: ai.labelOf(`${r.provider}:${r.model}`), message: redact(r.error), detail: '' }));
      return [...own, ...aiRows].sort((a, z) => z.at.localeCompare(a.at)).slice(0, n);
    },
    clear() { settings.set('errors.clearedAt', now()); db.prepare('DELETE FROM error_log').run(); }
  };
}
