// 8.19 Hata günlüğü: son sunucu, arayüz ve AI hataları (zaman, tür, kaynak, model, ileti); "Destek için kopyala".
// Tarayıcıda yakalanmayan hatalar da sunucuya bildirilir (aynı ileti 1 dakikada bir kez).
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState } from '../ui.js';
import { settingsTabs } from './settings.js';

const KIND = { sunucu: 'Sunucu', arayuz: 'Arayüz', ai: 'Yapay zekâ' };
const when = iso => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function supportText(errors, system) {
  const head = [`İçerik Üretim Merkezi ${system.version || ''} (${(system.sha || '').slice(0, 7) || 'sürüm bilinmiyor'})`, `Node ${system.node || '?'} · ${system.platform || '?'} · ${navigator.userAgent}`, `${errors.length} kayıt`, ''];
  return head.concat(errors.map(e => `[${e.at}] ${KIND[e.kind] || e.kind}${e.source ? ' · ' + e.source : ''}${e.model ? ' · ' + e.model : ''}\n  ${e.message}${e.detail ? '\n  ' + e.detail.replace(/\n/g, '\n  ') : ''}`)).join('\n');
}

export async function renderErrors(view) {
  const { errors, system } = await api.errors();
  view.innerHTML = `
    ${pageHead({ title: 'Ayarlar', desc: 'Son sunucu, arayüz ve yapay zekâ hataları. Anahtar ve e-posta gibi bilgiler iletilerden gizlenir.' })}
    ${settingsTabs('hatalar')}
    <section class="card mt-4">
      <div class="card-head"><h3>Hata günlüğü <span class="small muted">${errors.length}</span></h3>
        <div class="row">${errors.length ? `<button class="btn btn-sm" data-copy-errors>${icon('notes')}Destek için kopyala</button><button class="btn btn-sm btn-ghost" data-clear-errors>${icon('trash')}Temizle</button>` : ''}</div></div>
      ${errors.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Hata kayıtları"><table class="table"><thead><tr><th>Zaman</th><th>Tür</th><th>Kaynak</th><th>İleti</th></tr></thead><tbody>
        ${errors.map(e => `<tr><td class="nowrap">${esc(when(e.at))}</td><td><span class="tag">${esc(KIND[e.kind] || e.kind)}</span></td><td class="small">${esc(e.source || '—')}${e.model ? `<div class="xsmall muted">${esc(e.model)}</div>` : ''}</td>
          <td class="small">${esc(e.message)}${e.detail ? `<details class="xsmall muted"><summary>Ayrıntı</summary><pre class="err-detail">${esc(e.detail)}</pre></details>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState({ icon: 'check', title: 'Hata yok', text: 'Bir şey ters giderse burada zamanı ve nedeniyle görünür.', compact: true })}
    </section>`;
  view.onclick = async e => {
    if (e.target.closest('[data-copy-errors]')) {
      try { await navigator.clipboard.writeText(supportText(errors, system)); toast('Hata raporu kopyalandı; destek mesajına yapıştırabilirsin.', 'success'); } catch { toast('Kopyalanamadı.', 'error'); }
    }
    if (e.target.closest('[data-clear-errors]')) {
      if (!confirm('Hata günlüğü temizlensin mi?')) return;
      try { await api.clearErrors(); renderErrors(view); } catch (err) { toast(err.message, 'error'); }
    }
  };
}

export function initClientErrors() {
  const seen = new Map();
  const send = (message, source, detail) => {
    const key = message + source;
    if (Date.now() - (seen.get(key) || 0) < 60000) return;
    seen.set(key, Date.now());
    fetch('/api/errors/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: String(message).slice(0, 500), source: String(source || location.hash).slice(0, 200), detail: String(detail || '').slice(0, 2000) }) }).catch(() => {});
  };
  window.addEventListener('error', e => send(e.message || 'Bilinmeyen hata', `${location.hash} · ${(e.filename || '').split('/').pop()}:${e.lineno || ''}`, e.error && e.error.stack));
  window.addEventListener('unhandledrejection', e => { const r = e.reason || {}; if (r.status && r.status < 500) return; send(r.message || String(r), location.hash, r.stack); });
}
