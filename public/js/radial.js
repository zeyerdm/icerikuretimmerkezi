// 8.20 Dairesel hızlı menü (kullanıcının fikri): imlecin olduğu yerde açılan, en çok 8 dilimli menü.
// Açma: Alt+Q, farenin orta tuşu (boş alanda) ya da sağ alttaki ◎ düğmesi (dokunmatikte de).
// Dilimler komut paletinin (Ctrl+K) komut listesinden kişinin seçtikleridir; seçim ve sıra bu bilgisayarda saklanır.
// Klavye: ok tuşları dilimler arasında gezer, Enter çalıştırır, 1–8 doğrudan seçer, Esc kapatır.
import { esc, icon, openModal, toast } from './ui.js';
import { commands } from './palette.js';

const KEY = 'ium.radial';
export const MAX_SLICES = 8;
const DEFAULTS = ['plan', 'task', 'note', 'brand:/prompt', 'brand:/youtube', 'go:#/gorevler', 'brand:/takvim'];
const RADIUS = 118;

export function loadChoice() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(v)) return v.map(String).slice(0, MAX_SLICES); } catch { /* depolama kapalı olabilir */ }
  return DEFAULTS.slice();
}
function saveChoice(ids) { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_SLICES))); } catch { /* yoksa yalnız bu oturum */ } }

// Seçilen kimliklerden şu an çalışabilen komutlar (ör. marka sayfası komutu yalnız bir marka açıkken)
export function slicesFor(ids, all) {
  return ids.map(id => all.find(c => c.id === id)).filter(Boolean).slice(0, MAX_SLICES);
}

let wrap = null;
let last = { x: innerWidth / 2, y: innerHeight / 2 };

export function openRadial(x = last.x, y = last.y) {
  if (wrap) return closeRadial();
  if (document.querySelector('.modal-backdrop')) return; // açık form varken açılmaz
  const items = slicesFor(loadChoice(), commands());
  const prev = document.activeElement;
  // Halka ekrana sığsın
  const pad = RADIUS + 60;
  const cx = Math.min(Math.max(x, pad), innerWidth - pad);
  const cy = Math.min(Math.max(y, pad), innerHeight - pad);
  wrap = document.createElement('div');
  wrap.className = 'radial-backdrop';
  wrap.innerHTML = `<div class="radial" role="menu" aria-label="Hızlı menü" style="left:${cx}px;top:${cy}px">
      ${items.map((c, i) => {
        const a = (-90 + (360 / items.length) * i) * Math.PI / 180;
        return `<button type="button" class="radial-item" role="menuitem" data-i="${i}" style="transform:translate(${Math.round(Math.cos(a) * RADIUS)}px,${Math.round(Math.sin(a) * RADIUS)}px)" title="${esc(c.label)} (${i + 1})">${icon(c.icon || 'sparkle')}<span>${esc(c.label)}</span></button>`;
      }).join('')}
      <button type="button" class="radial-center" data-edit title="Kısa yolları düzenle" aria-label="Kısa yolları düzenle">${items.length ? '⚙' : '+'}</button>
    </div>`;
  document.body.appendChild(wrap);
  const btns = [...wrap.querySelectorAll('.radial-item')];
  let sel = 0;
  const focus = i => { sel = (i + btns.length) % btns.length; btns[sel].focus(); };
  const run = i => { const c = items[i]; closeRadial(false); if (c) Promise.resolve(c.run()).catch(err => toast(err.message, 'error')); };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); return closeRadial(); }
    if (!btns.length) return;
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); focus(sel + 1); }
    else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); focus(sel - 1); }
    else if (e.key === 'Enter' && document.activeElement && document.activeElement.dataset.i != null) { e.preventDefault(); run(+document.activeElement.dataset.i); }
    else if (/^[1-8]$/.test(e.key) && btns[+e.key - 1]) { e.preventDefault(); run(+e.key - 1); }
  };
  document.addEventListener('keydown', onKey, true);
  wrap._cleanup = restore => { document.removeEventListener('keydown', onKey, true); if (restore && prev && prev.focus) prev.focus(); };
  wrap.addEventListener('click', e => {
    const it = e.target.closest('[data-i]');
    if (it) return run(+it.dataset.i);
    if (e.target.closest('[data-edit]')) { closeRadial(false); return editRadial(); }
    if (e.target === wrap) closeRadial();
  });
  if (btns.length) focus(0); else wrap.querySelector('[data-edit]').focus();
}

export function closeRadial(restore = true) {
  if (!wrap) return;
  const w = wrap; wrap = null;
  w._cleanup(restore);
  w.remove();
}

// Düzenleme: komut listesinden en çok 8 seçim, sürükleyerek (ya da ↑↓ düğmeleriyle) sıralama
export function editRadial() {
  const all = commands();
  let chosen = loadChoice().filter(id => all.some(c => c.id === id));
  const label = id => (all.find(c => c.id === id) || {}).label || id;
  const m = openModal({
    title: 'Hızlı menü kısa yolları', submitLabel: 'Kaydet',
    body: `<p class="small muted mb-3">En çok ${MAX_SLICES} kısa yol seç ve sırala. Menü Alt+Q, farenin orta tuşu ya da sağ alttaki ◎ düğmesiyle açılır. Seçim bu bilgisayarda saklanır.</p>
      <div class="radial-edit"><ol class="radial-order" id="rd-order"></ol>
      <div class="radial-all" id="rd-all">${[...new Set(all.map(c => c.group))].map(g => `<div class="xsmall muted mt-2">${esc(g)}</div>${all.filter(c => c.group === g).map(c => `<label class="check small"><input type="checkbox" value="${esc(c.id)}"> ${esc(c.label)}</label>`).join('')}`).join('')}</div></div>
      <p class="xsmall muted mt-2" id="rd-count"></p>`,
    onSubmit: async () => { saveChoice(chosen); toast('Hızlı menü kaydedildi.', 'success'); }
  });
  const order = m.form.querySelector('#rd-order');
  const draw = () => {
    order.innerHTML = chosen.map((id, i) => `<li draggable="true" data-id="${esc(id)}"><span class="grow">${i + 1}. ${esc(label(id))}</span><button type="button" class="btn btn-sm btn-ghost icon-btn" data-up="${i}" aria-label="Yukarı">↑</button><button type="button" class="btn btn-sm btn-ghost icon-btn" data-down="${i}" aria-label="Aşağı">↓</button></li>`).join('') || '<li class="small muted">Henüz seçim yok.</li>';
    m.form.querySelectorAll('#rd-all input').forEach(cb => { cb.checked = chosen.includes(cb.value); cb.disabled = !cb.checked && chosen.length >= MAX_SLICES; });
    m.form.querySelector('#rd-count').textContent = `${chosen.length} / ${MAX_SLICES} seçildi`;
  };
  draw();
  m.form.querySelector('#rd-all').addEventListener('change', e => {
    const v = e.target.value;
    chosen = e.target.checked ? [...chosen, v].slice(0, MAX_SLICES) : chosen.filter(x => x !== v);
    draw();
  });
  order.addEventListener('click', e => {
    const up = e.target.closest('[data-up]'); const dn = e.target.closest('[data-down]');
    const i = up ? +up.dataset.up : dn ? +dn.dataset.down : -1;
    const j = up ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= chosen.length) return;
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
    draw();
  });
  let drag = null;
  order.addEventListener('dragstart', e => { const li = e.target.closest('[data-id]'); drag = li && li.dataset.id; });
  order.addEventListener('dragover', e => e.preventDefault());
  order.addEventListener('drop', e => {
    e.preventDefault();
    const li = e.target.closest('[data-id]');
    if (!drag || !li || li.dataset.id === drag) return;
    const to = chosen.indexOf(li.dataset.id);
    chosen = chosen.filter(x => x !== drag);
    chosen.splice(to, 0, drag);
    drag = null;
    draw();
  });
}

export function initRadial() {
  document.addEventListener('mousemove', e => { last = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyQ' || e.key.toLowerCase() === 'q')) { e.preventDefault(); openRadial(); }
  });
  // Orta tuş: bağlantı, alan ya da kaydırılabilir öğe üstünde değilse (tarayıcının kendi davranışı bozulmasın)
  document.addEventListener('mousedown', e => {
    if (e.button !== 1 || e.target.closest('a, input, textarea, select, [contenteditable], .ed-doc, .table-wrap')) return;
    e.preventDefault();
    openRadial(e.clientX, e.clientY);
  });
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'radial-fab';
  fab.setAttribute('aria-label', 'Hızlı menü (Alt+Q)');
  fab.title = 'Hızlı menü (Alt+Q)';
  fab.textContent = '◎';
  fab.addEventListener('click', () => { const r = fab.getBoundingClientRect(); openRadial(r.left + r.width / 2, r.top + r.height / 2); });
  document.body.appendChild(fab);
}
