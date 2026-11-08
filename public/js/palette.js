// Aşama 5.9: Komut paleti (Ctrl+K / ⌘K). Her yerden sayfaya gitme, markaya geçme, içerik planlama, not ve görev ekleme.
// Komutlar yalnızca var olan sayfalara ve gerçek kayıt formlarına gider; kayıttan sonra açık sayfa yeniden çizilir.
import { api } from './api.js';
import { esc, icon, toast } from './ui.js';
import { state, activeBrand, go, route, CENTER_NAV, BRAND_NAV } from './app.js';
import { contentModal, taskModal, noteModal } from './views/forms.js';

const norm = s => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');

function commands() {
  const brand = activeBrand();
  const out = [];
  const act = (label, iconName, run, keys = '') => out.push({ group: 'Eylemler', label, icon: iconName, run, keys });
  const saved = () => { toast('Kaydedildi.'); route(); };
  if (state.brands.length) {
    act(brand ? `İçerik planla (${brand.name})` : 'İçerik planla', 'calendar', () => contentModal({ brandId: brand && brand.id, onSaved: saved }), 'takvim yayin gonderi ekle yeni');
    act('Görev ekle', 'tasks', () => taskModal({ brandId: brand && brand.id, onSaved: saved }), 'yapilacak is yeni');
  }
  act('Not al', 'notes', async () => {
    let categories = [];
    try { categories = (await api.notes()).categories || []; } catch { /* kategoriler olmadan da not alınır */ }
    noteModal({ brandId: brand && brand.id, categories, onSaved: saved });
  }, 'yeni not yaz');
  act('Yeni marka oluştur', 'plus', () => go('#/marka/yeni'), 'marka ekle');
  if (brand) BRAND_NAV.filter(n => !n.soon).forEach(n => out.push({ group: brand.name, label: n.label, icon: n.icon, run: () => go(`#/m/${brand.id}${n.path}`), keys: 'git ac sayfa' }));
  CENTER_NAV.forEach(n => out.push({ group: 'Yönetim Merkezi', label: n.label, icon: n.icon, run: () => go(n.hash), keys: 'git ac sayfa' }));
  state.brands.filter(b => !brand || b.id !== brand.id).forEach(b => out.push({ group: 'Markaya geç', label: b.name + (b.isDemo ? ' (örnek)' : ''), icon: 'brands', run: () => go('#/m/' + b.id), keys: 'marka gec degistir calisma alani' }));
  return out;
}

let wrap = null;

export function openPalette() {
  if (wrap && !wrap.isConnected) wrap = null; // sayfa değişimi açık pencereleri kaldırmış olabilir
  if (wrap) return;
  if (document.querySelector('.modal-backdrop')) return; // açık bir form varken palet açılmaz
  const all = commands();
  const prev = document.activeElement;
  wrap = document.createElement('div');
  wrap.className = 'modal-backdrop palette-backdrop';
  wrap.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Komut paleti">
      <div class="palette-in">${icon('search')}<input id="palette-q" type="text" placeholder="Ne yapmak istersin? (ör. içerik planla, takvim, marka adı)" autocomplete="off" aria-controls="palette-list"></div>
      <div class="palette-list" id="palette-list" role="listbox"></div>
      <div class="palette-foot xsmall muted"><span><kbd>↑</kbd><kbd>↓</kbd> seç</span><span><kbd>Enter</kbd> çalıştır</span><span><kbd>Esc</kbd> kapat</span></div>
    </div>`;
  document.body.appendChild(wrap);
  const input = wrap.querySelector('#palette-q');
  const listEl = wrap.querySelector('#palette-list');
  let shown = all;
  let sel = 0;

  const close = (restore = true) => { if (!wrap) return; wrap.remove(); wrap = null; document.removeEventListener('keydown', onKey, true); if (restore && prev && prev.focus) prev.focus(); };
  function draw() {
    const words = norm(input.value).split(/\s+/).filter(Boolean);
    shown = all.filter(c => { const hay = norm(c.label + ' ' + c.group + ' ' + c.keys); return words.every(w => hay.includes(w)); });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let g = null;
    listEl.innerHTML = shown.length ? shown.map((c, i) => {
      const head = c.group !== g ? `<div class="palette-group">${esc(g = c.group)}</div>` : '';
      return `${head}<div class="palette-item ${i === sel ? 'is-sel' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}">${icon(c.icon)}<span>${esc(c.label)}</span></div>`;
    }).join('') : '<div class="palette-empty muted small">Eşleşen komut yok.</div>';
    const cur = listEl.querySelector('.is-sel');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  async function run(i) {
    const c = shown[i];
    if (!c) return;
    close(false);
    try { await c.run(); } catch (err) { toast(err.message, 'error'); }
  }
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  };
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', () => { sel = 0; draw(); });
  listEl.addEventListener('mousemove', e => { const it = e.target.closest('[data-i]'); if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; draw(); } });
  listEl.addEventListener('click', e => { const it = e.target.closest('[data-i]'); if (it) run(+it.dataset.i); });
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  draw();
  input.focus();
}

export function initPalette() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    }
  });
}
