// 9.1 Yarım kalan yazının korunması. Forma, pencereye ya da sohbet kutusuna yazılan metin, başka sayfaya
// geçip dönünce yerinde olur. Taslaklar yalnız bu sayfanın belleğinde durur (diske, tarayıcı deposuna, sunucuya yazılmaz);
// bu yüzden sayfa yenilenince (F5) kendiliğinden silinir. Kaydedince ya da Vazgeç'e basınca da silinir:
// alanın bulunduğu form/kart/pencerede bir düğmeye basılması, form gönderimi ya da tek satırlık alanda Enter.
// Anahtar: adres (marka kimliği adreste olduğundan iki marka karışmaz) + pencere başlığı + alanın kimliği.
// Asistan kutusu sayfadan bağımsızdır: markaya göre saklanır.
import { state } from './app.js';
import { toast } from './ui.js';

const drafts = new Map();        // anahtar → metin
let restored = new Set();        // bu ziyarette geri konmuş anahtarlar (aynı ziyarette ikinci kez konmaz)
let told = false;                // bu ziyarette "geri getirildi" bilgisi verildi mi

const TEXT_TYPES = new Set(['text', 'url', 'email', 'number', 'tel', '']);
function eligible(el) {
  if (!el || el.disabled || el.readOnly || el.closest('[data-no-draft], .palette, .radial-backdrop')) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_TYPES.has((el.getAttribute('type') || '').toLowerCase());
}

const routeKey = () => (location.hash || '#/').split('?')[0];
function fieldId(el) {
  if (el.id) return '#' + el.id;
  if (el.name) return 'n:' + el.name;
  for (const a of el.attributes) if (a.name.startsWith('data-')) return `d:${a.name}=${a.value}`;
  return 'p:' + (el.getAttribute('placeholder') || el.getAttribute('aria-label') || '');
}
function keyOf(el) {
  if (el.closest('.ai-panel')) return `asistan|${state.workspaceBrandId || ''}|${fieldId(el)}`;
  const modal = el.closest('.modal');
  const title = modal ? (modal.querySelector('#modal-title') || {}).textContent || '' : '';
  const base = `${routeKey()}|${title}|${fieldId(el)}`;
  // Aynı kimlikli birden çok alan (liste satırları): sırasıyla ayrılır
  const same = [...document.querySelectorAll('input, textarea')].filter(x => eligible(x) && x.closest('.modal') === modal && fieldId(x) === fieldId(el));
  return same.length > 1 ? `${base}|${same.indexOf(el)}` : base;
}

function save(el) {
  const k = keyOf(el);
  const initial = el.dataset.draftInitial ?? el.defaultValue;
  if (el.value === initial) drafts.delete(k); else drafts.set(k, el.value);
}
function clearIn(container) {
  if (!container) return;
  container.querySelectorAll('input, textarea').forEach(el => { if (eligible(el)) { const k = keyOf(el); drafts.delete(k); restored.add(k); } });
}
const containerOf = el => el.closest('form, .modal, .card, section, .ai-panel') || el.parentElement;

// Yeni çizilen alanlara taslak geri konur; sayfanın kendi durumu da güncellensin diye "input" olayı gönderilir
function restoreIn(root) {
  if (!drafts.size) return;
  let restoredAny = false;
  const els = root.matches && root.matches('input, textarea') ? [root] : [...root.querySelectorAll('input, textarea')];
  for (const el of els) {
    if (!eligible(el)) continue;
    const k = keyOf(el);
    if (!drafts.has(k) || restored.has(k)) continue;
    restored.add(k);
    const v = drafts.get(k);
    if (el.value === v) { drafts.delete(k); continue; } // yazılan zaten kaydedilmiş
    restoredAny = true;
    el.dataset.draftInitial = el.value;
    el.value = v;
    el.classList.add('draft-restored');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (restoredAny && !told) { told = true; toast('Yarım kalan yazın geri getirildi. Kaydetmeyi unutma; sayfa yenilenince silinir.', 'info', 4500); }
}

// Her sayfa geçişinde: bu ziyarette yeniden geri konabilir
export function draftsOnRoute() { restored = new Set(); told = false; }
export const draftCount = () => drafts.size;

export function initDrafts() {
  document.addEventListener('input', e => { if (eligible(e.target) && e.isTrusted) save(e.target); }, true);
  // Kaydet / Vazgeç / Ekle gibi bir düğme: o bölümün taslakları silinir (kayıt başarısızsa yazı zaten ekranda durur)
  document.addEventListener('click', e => {
    const b = e.target.closest('button, [role="button"]');
    if (!b || b.closest('.id-tabs, .tabs, .seg, .chip-row')) return;
    if (b.matches('[data-close]')) return clearIn(b.closest('.modal'));
    // Kaydet düğmesi formun dışında olabilir (ör. alttaki kayıt çubuğu): o sayfanın bütün taslakları silinir
    if (!b.closest('.modal, .ai-panel') && (b.matches('[type="submit"], [data-action="save"]') || /^\s*Kaydet/.test(b.textContent))) {
      const prefix = routeKey() + '|';
      for (const k of [...drafts.keys()]) if (k.startsWith(prefix)) { drafts.delete(k); restored.add(k); }
      return;
    }
    clearIn(containerOf(b));
  }, true);
  document.addEventListener('submit', e => clearIn(e.target), true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || !eligible(e.target)) return;
    if (e.target.tagName === 'INPUT' || e.target.id === 'chat-input') { const k = keyOf(e.target); drafts.delete(k); restored.add(k); }
  }, true);
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) restoreIn(n);
  }).observe(document.body, { childList: true, subtree: true });
}
