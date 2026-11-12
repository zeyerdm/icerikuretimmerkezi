// Aşama 5.9: Komut paleti (Ctrl+K / ⌘K). Her yerden sayfaya gitme, markaya geçme, içerik planlama, not ve görev ekleme.
// Komutlar yalnızca var olan sayfalara ve gerçek kayıt formlarına gider; kayıttan sonra açık sayfa yeniden çizilir.
import { api } from './api.js';
import { esc, icon, toast } from './ui.js';
import { state, activeBrand, go, route, CENTER_NAV, BRAND_NAV } from './app.js';
import { contentModal, taskModal, noteModal } from './views/forms.js';

const norm = s => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');

// Her komutun sabit kimliği var (8.20 dairesel menü kişinin seçtiği kısa yolları bu kimlikle saklar)
export function commands() {
  const brand = activeBrand();
  const out = [];
  const act = (id, label, iconName, run, keys = '') => out.push({ id, group: 'Eylemler', label, icon: iconName, run, keys });
  const saved = () => { toast('Kaydedildi.'); route(); };
  if (state.brands.length) {
    act('plan', brand ? `İçerik planla (${brand.name})` : 'İçerik planla', 'calendar', () => contentModal({ brandId: brand && brand.id, onSaved: saved }), 'takvim yayin gonderi ekle yeni');
    act('task', 'Görev ekle', 'tasks', () => taskModal({ brandId: brand && brand.id, onSaved: saved }), 'yapilacak is yeni');
  }
  act('note', 'Not al', 'notes', async () => {
    let categories = [];
    try { categories = (await api.notes()).categories || []; } catch { /* kategoriler olmadan da not alınır */ }
    noteModal({ brandId: brand && brand.id, categories, onSaved: saved });
  }, 'yeni not yaz');
  act('new-brand', 'Yeni marka oluştur', 'plus', () => go('#/marka/yeni'), 'marka ekle');
  act('tour', 'Tanıtım turunu başlat', 'sparkle', async () => { const { startTour } = await import('./tour.js'); if (location.hash !== '#/' && location.hash !== '') { location.hash = '#/'; setTimeout(startTour, 700); } else startTour(); }, 'tur yardim rehber nasil kullanilir');
  if (brand) BRAND_NAV.filter(n => !n.soon).forEach(n => out.push({ id: 'brand:' + n.path, group: brand.name, label: n.label, icon: n.icon, run: () => go(`#/m/${brand.id}${n.path}`), keys: 'git ac sayfa' }));
  [['Görevler', 'tasks', '#/gorevler'], ['Notlar', 'notes', '#/notlar'], ['Yapay zekâ ayarları', 'sparkle', '#/ai/modeller'], ['Model karşılaştır', 'sparkle', '#/ai'], ['AI harcaması', 'chart', '#/ai/harcama']]
    .forEach(([label, ic, hash]) => out.push({ id: 'go:' + hash, group: 'Yönetim Merkezi', label, icon: ic, run: () => go(hash), keys: 'git ac sayfa' }));
  CENTER_NAV.forEach(n => out.push({ id: 'go:' + n.hash, group: 'Yönetim Merkezi', label: n.label, icon: n.icon, run: () => go(n.hash), keys: 'git ac sayfa' }));
  state.brands.filter(b => !brand || b.id !== brand.id).forEach(b => out.push({ id: 'open:' + b.id, group: 'Markaya geç', label: b.name + (b.isDemo ? ' (örnek)' : ''), icon: 'brands', run: () => go('#/m/' + b.id), keys: 'marka gec degistir calisma alani' }));
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
      <div class="palette-in">${icon('search')}<input id="palette-q" type="text" placeholder="Komut ya da arama (ör. içerik planla, kampanya, marka adı)" autocomplete="off" aria-controls="palette-list"></div>
      <div class="palette-list" id="palette-list" role="listbox" aria-label="Komutlar" tabindex="0"></div>
      <div class="palette-foot xsmall muted"><span><kbd>↑</kbd><kbd>↓</kbd> seç</span><span><kbd>Enter</kbd> çalıştır</span><span><kbd>Esc</kbd> kapat</span></div>
    </div>`;
  document.body.appendChild(wrap);
  const input = wrap.querySelector('#palette-q');
  const listEl = wrap.querySelector('#palette-list');
  let shown = all;
  let found = [];
  let sel = 0;

  const close = (restore = true) => { if (!wrap) return; wrap.remove(); wrap = null; document.removeEventListener('keydown', onKey, true); if (restore && prev && prev.focus) prev.focus(); };
  function draw() {
    const words = norm(input.value).split(/\s+/).filter(Boolean);
    shown = all.filter(c => { const hay = norm(c.label + ' ' + c.group + ' ' + c.keys); return words.every(w => hay.includes(w)); }).concat(found);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let g = null;
    listEl.innerHTML = shown.length ? shown.map((c, i) => {
      const head = c.group !== g ? `<div class="palette-group">${esc(g = c.group)}</div>` : '';
      return `${head}<div class="palette-item ${i === sel ? 'is-sel' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}">${icon(c.icon)}<span class="pi-text"><span>${esc(c.label)}</span>${c.sub ? `<em>${esc(c.sub)}</em>` : ''}</span></div>`;
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
  // Genel arama: 2+ karakterde bütün markaların kayıtları komutların altına eklenir
  const ICONS = { idea: 'idea', content: 'calendar', post: 'palette', reels: 'film', prompt: 'wand', note: 'notes', task: 'tasks' };
  let timer;
  input.addEventListener('input', () => {
    sel = 0;
    found = [];
    draw();
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      try {
        const { results } = await api.search(q);
        if (!wrap || input.value.trim() !== q) return;
        found = results.map(r => ({ group: 'Arama sonuçları', label: r.title + (r.brandName ? ' · ' + r.brandName : ''), sub: r.typeLabel + (r.snippet ? ' — ' + r.snippet : ''), icon: ICONS[r.type] || 'search', run: () => go(r.href), keys: '', always: true }));
        draw();
      } catch { /* arama yapılamazsa komutlar yine çalışır */ }
    }, 200);
  });
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
