// Üretim ekranlarındaki model seçici: varsayılan olarak işe atanmış model, istenirse o an bağlı herhangi bir model.
// Seçim kalıcı atamayı değiştirmez; yalnızca o üretim için gönderilir.
import { api } from './api.js';
import { esc } from './ui.js';

let cache = null;
let cacheAt = 0;
let orModels = null;

// Bağlı sağlayıcıların önerilen modelleri (+ OpenRouter bağlıysa canlı listesi). 30 sn önbellek.
export async function aiModels() {
  if (cache && Date.now() - cacheAt < 30000) return cache;
  const ov = await api.aiOverview();
  if (ov.providers.some(p => p.id === 'openrouter' && p.configured) && !orModels) {
    try { orModels = (await api.aiModels('openrouter')).models; } catch { orModels = []; }
  }
  cache = { ov, openrouter: orModels || [] };
  cacheAt = Date.now();
  return cache;
}
export const resetAiModels = () => { cache = null; orModels = null; };

// <select> HTML'i: ilk seçenek "İşe atanan: X" (değeri boş → sunucu işin modelini kullanır)
export function modelSelect({ ov, openrouter }, task, { id = 'model-pick', label = 'Model' } = {}) {
  const t = ov.tasks.find(x => x.id === task);
  if (!t || !t.primary) return '';
  const groups = ov.providers.filter(p => p.configured).map(p => {
    const list = p.id === 'openrouter'
      ? openrouter.map(m => ({ ref: m.ref, label: m.label || m.id }))
      : ov.models.filter(m => m.provider === p.id).map(m => ({ ref: m.ref, label: m.label }));
    return list.length ? `<optgroup label="${esc(p.label)}">${list.map(m => `<option value="${esc(m.ref)}">${esc(m.label)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return `<select class="select w-auto model-pick" id="${id}" aria-label="${esc(label)}" title="Bu üretim için model">
    <option value="">${esc(t.primaryLabel || 'Atanmış model')} (${esc(t.label.toLocaleLowerCase('tr-TR'))})</option>${groups}</select>`;
}

// Uzun AI işlerinde düğmede geçen süre: "Yazıyor… 12 sn". İş bitince eski hâline döner.
export async function busyTimer(btn, fn, verb = 'Yazıyor') {
  if (!btn) return fn();
  if (btn.dataset.busy) return undefined;
  const html = btn.innerHTML;
  const started = Date.now();
  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  const tick = () => { btn.textContent = `${verb}… ${Math.floor((Date.now() - started) / 1000)} sn`; };
  tick();
  const timer = setInterval(tick, 1000);
  try { return await fn(); } finally {
    clearInterval(timer);
    if (btn.isConnected) { btn.innerHTML = html; btn.disabled = false; delete btn.dataset.busy; btn.removeAttribute('aria-busy'); }
  }
}

// Üretim sonucu notu: "Claude Opus 5.5 ile yazıldı · 14 sn · 0,04 $"
export function aiNote(meta) {
  if (!meta) return '';
  const cost = meta.cost ? (meta.cost < 0.01 ? '< 0,01 $' : meta.cost.toFixed(3).replace('.', ',') + ' $') : '';
  return `${meta.modelLabel} ile yazıldı · ${Math.round((meta.ms || 0) / 1000)} sn${cost ? ' · ' + cost : ''}${meta.fallbackUsed ? ' · yedek model kullanıldı' : ''}`;
}
