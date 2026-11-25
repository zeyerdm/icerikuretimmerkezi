// Yüzen düğmeler (Asistan, ◎ hızlı menü): sürükleyerek taşınır; ekranın sol ya da sağ kenarına bırakılınca kenara saklanır
// (yalnız küçük bir ucu görünür, tıklayınca son yerine döner). Konum bu tarayıcıda hatırlanır; çift tıklama varsayılan yere
// döndürür. Sürükleme bitince oluşan tıklama yutulur (düğme yanlışlıkla açılmaz). Fare, dokunmatik ve kalem çalışır.
const EDGE = 28;      // kenara bu kadar yaklaşınca saklanır
const MOVE = 6;       // bu kadar oynamadan sürükleme sayılmaz (tıklama bozulmaz)

const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, v) => { try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* tarayıcı izin vermiyor */ } };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function makeFloating(el, key, { label = 'Düğme' } = {}) {
  if (!el || el.dataset.floating) return;
  el.dataset.floating = '1';
  el.classList.add('fd');
  const baseTitle = el.title || label;
  el.title = `${baseTitle} · Sürükleyerek taşı; sol ya da sağ kenara bırakırsan saklanır. Çift tık: eski yerine.`;
  let st = read(key); // { x, y } ya da { hidden: 'left'|'right', y, x?, last? }

  function apply() {
    el.classList.remove('fd-hidden', 'fd-left', 'fd-right');
    if (!st) { el.classList.remove('fd-moved'); ['left', 'top', 'right', 'bottom'].forEach(k => { el.style[k] = ''; }); return; }
    const w = el.offsetWidth || 48; const h = el.offsetHeight || 48;
    const vw = window.innerWidth; const vh = window.innerHeight;
    el.classList.add('fd-moved');
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.top = `${clamp(st.y, 8, vh - h - 8)}px`;
    if (st.hidden) {
      el.classList.add('fd-hidden', st.hidden === 'left' ? 'fd-left' : 'fd-right');
      el.style.left = st.hidden === 'left' ? '0px' : `${vw - w}px`;
    } else el.style.left = `${clamp(st.x, 8, vw - w - 8)}px`;
  }
  apply();
  window.addEventListener('resize', apply);

  let start = null; let dragged = false; let swallow = false;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const r = el.getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top };
    dragged = false;
  });
  window.addEventListener('pointermove', e => {
    if (!start) return;
    if (!dragged && Math.hypot(e.clientX - start.px, e.clientY - start.py) < MOVE) return;
    if (!dragged) { dragged = true; el.classList.add('fd-dragging'); el.classList.remove('fd-hidden', 'fd-left', 'fd-right'); try { el.setPointerCapture(e.pointerId); } catch { /* yok */ } }
    e.preventDefault();
    el.classList.add('fd-moved');
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = `${clamp(e.clientX - start.ox, 0, window.innerWidth - el.offsetWidth)}px`;
    el.style.top = `${clamp(e.clientY - start.oy, 0, window.innerHeight - el.offsetHeight)}px`;
  }, { passive: false });
  window.addEventListener('pointerup', () => {
    if (!start) return;
    start = null;
    if (!dragged) return;
    el.classList.remove('fd-dragging');
    swallow = true; setTimeout(() => { swallow = false; }, 0);
    const r = el.getBoundingClientRect();
    const last = { x: r.left, y: r.top };
    if (r.left <= EDGE) st = { hidden: 'left', y: r.top, last: st && st.last ? st.last : null };
    else if (r.right >= window.innerWidth - EDGE) st = { hidden: 'right', y: r.top, last: st && st.last ? st.last : null };
    else st = { x: last.x, y: last.y, last };
    write(key, st); apply();
  });
  // Sürüklemenin sonundaki tıklama ve saklıyken tıklama: düğmenin kendi işi çalışmaz
  el.addEventListener('click', e => {
    if (swallow) { e.stopImmediatePropagation(); e.preventDefault(); swallow = false; return; }
    if (st && st.hidden) {
      e.stopImmediatePropagation(); e.preventDefault();
      st = st.last ? Object.assign({}, st.last, { last: st.last }) : null;
      write(key, st); apply();
    }
  }, true);
  el.addEventListener('dblclick', e => { e.preventDefault(); st = null; write(key, null); apply(); });
}
