// Aşama 5.10: İlham rafı (Ctrl+V). Bir marka çalışma alanındayken, yazı alanı dışında yapıştırılan içerik o markaya kaydedilir:
// görsel → Kütüphane / İlham rafı (dosya olarak), link ya da metin → "İlham" kategorili marka notu. Yazı alanlarındaki yapıştırma etkilenmez.
import { api } from './api.js';
import { toast } from './ui.js';
import { state, go } from './app.js';

export const INSPIRATION_NOTE = 'İlham';
const LIB_CAT_KEY = 'ium.lib.cat';

function editable(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

// Kütüphane açıldığında hangi kategoriyle başlayacağı (yapıştırma sonrası "İlham rafına git")
export function takeLibraryCategory() {
  try { const c = sessionStorage.getItem(LIB_CAT_KEY); sessionStorage.removeItem(LIB_CAT_KEY); return c; } catch { return null; }
}

function stamp() {
  return new Date().toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function savedToast(brandId, what) {
  document.dispatchEvent(new CustomEvent('ium:inspiration'));
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast toast-success';
  el.innerHTML = `<span></span> <button type="button" class="btn btn-sm">İlham rafına git</button>`;
  el.firstChild.textContent = what + ' ilham rafına eklendi.';
  el.querySelector('button').addEventListener('click', () => {
    try { sessionStorage.setItem(LIB_CAT_KEY, 'inspiration'); } catch { /* varsayılan kategoriyle açılır */ }
    el.remove();
    go(`#/m/${brandId}/kutuphane`);
  });
  host.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

async function onPaste(e) {
  if (editable(e.target) || editable(document.activeElement)) return;
  if (document.querySelector('.modal-backdrop')) return;
  const brandId = state.workspaceBrandId;
  const dt = e.clipboardData;
  if (!dt) return;
  const file = [...dt.items].filter(i => i.kind === 'file' && /^image\/(png|jpeg|webp|gif)$/.test(i.type)).map(i => i.getAsFile()).find(Boolean);
  const textValue = (dt.getData('text/plain') || '').trim();
  if (!file && !textValue) return;
  e.preventDefault();
  if (!brandId) return toast('İlham rafı için önce bir markanın çalışma alanına gir; yapıştırılanlar o markaya kaydedilir.', 'error', 5000);
  try {
    if (file) {
      if (file.size > state.meta.maxAssetBytes) throw new Error(`Görsel ${Math.round(state.meta.maxAssetBytes / 1048576)} MB'tan büyük.`);
      await api.uploadAsset(brandId, file, 'inspiration', 'Yapıştırılan görsel · ' + stamp());
      return savedToast(brandId, 'Görsel');
    }
    const isLink = /^https?:\/\/\S+$/i.test(textValue);
    let title = textValue.split('\n')[0].slice(0, 120);
    if (isLink) { try { const u = new URL(textValue); title = u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.slice(0, 60) : ''); } catch { /* başlık metin olarak kalır */ } }
    await api.createNote({ brandId, category: INSPIRATION_NOTE, title, body: textValue.slice(0, 5000) });
    savedToast(brandId, isLink ? 'Link' : 'Metin');
  } catch (err) { toast(err.message, 'error'); }
}

export function initInspiration() {
  document.addEventListener('paste', onPaste);
}
