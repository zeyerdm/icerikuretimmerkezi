// Renk seçici: seçili renk büyük önizlemede ayrı görünür (seçim alanıyla karışmaz). HEX / RGB / HSL girişi, doygunluk-
// parlaklık alanı ve ton çubuğu, damlalık (tarayıcı destekliyorsa), marka renkleri, son kullanılanlar, kayıtlı paletler.
// Gradyan desteklenen yerlerde (zemin, şekil) doğrusal/dairesel gradyan, açı ve 2-5 renk durağı.
import { esc, icon } from './ui.js';
import { api } from './api.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const hexToRgb = h => { const n = parseInt(String(h).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function rgbToHsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx]; }
function hsvToRgb(h, s, v) { const c = v * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = v - c; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; }
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; let h = 0; const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)]; }
function hslToRgb(h, s, l) { s /= 100; l /= 100; const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; }
const HEXRE = /^#[0-9a-f]{6}$/i;

// Varsayılan tek renkler (Canva'daki gibi): siyahtan beyaza griler ve canlı tonlar
const DEFAULTS = ['#000000', '#545454', '#737373', '#a6a6a6', '#d9d9d9', '#ffffff', '#ff3131', '#ff5757', '#ff66c4', '#cb6ce6', '#8c52ff', '#5e17eb', '#0097b2', '#0cc0df', '#5ce1e6', '#38b6ff', '#5271ff', '#004aad', '#00bf63', '#7ed957', '#c1ff72', '#ffde59', '#ffbd59', '#ff914d'];
// Türkçe renk adıyla arama
const NAMED = { siyah: ['#000000', '#1b1f3b'], beyaz: ['#ffffff', '#f8f8f8'], gri: ['#737373', '#a6a6a6', '#d9d9d9'], kırmızı: ['#ff3131', '#c62828', '#e53935'], pembe: ['#ff66c4', '#f48fb1', '#ec407a'], mor: ['#8c52ff', '#5e17eb', '#9c27b0'], lila: ['#cb6ce6', '#ce93d8'], mavi: ['#38b6ff', '#5271ff', '#004aad', '#1e88e5'], lacivert: ['#0b132b', '#1a237e', '#004aad'], turkuaz: ['#0cc0df', '#5ce1e6', '#00bcd4'], yeşil: ['#00bf63', '#7ed957', '#2e7d32'], sarı: ['#ffde59', '#fdd835', '#ffeb3b'], turuncu: ['#ff914d', '#ff6a13', '#fb8c00'], kahverengi: ['#795548', '#8d6e63', '#5d4037'], bej: ['#f5f0e6', '#e8dcc8'], krem: ['#fff8e7', '#f3e9d2'], altın: ['#d4af37', '#c9a227'], gümüş: ['#c0c0c0', '#b0b7bf'], bordo: ['#800020', '#7b1e3a'], haki: ['#8b8b5c', '#6b8e23'], mint: ['#98ff98', '#3eb489'], somon: ['#fa8072', '#ff8a65'] };
const RECENT = 'ium.recentColors';
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT) || '[]').filter(c => HEXRE.test(c)); } catch { return []; } };
const pushRecent = c => { try { localStorage.setItem(RECENT, JSON.stringify([c, ...recent().filter(x => x !== c)].slice(0, 14))); } catch { /* gizli pencere */ } };
let palCache = null;

export const gradCss = g => (g.type === 'radial' ? `radial-gradient(circle, ${g.stops.map(s => `${s.c} ${s.p}%`).join(', ')})` : `linear-gradient(${(g.angle || 0) + 90}deg, ${g.stops.map(s => `${s.c} ${s.p}%`).join(', ')})`);

// anchor: açan düğme. onChange(hex) düz renkte, onGradient(g|null) gradyanda çağrılır
export function openColorPicker(anchor, { value = '#000000', gradient = null, allowGradient = false, brandColors = [], designColors = [], brandHref = '', title = 'Renk', onChange = () => {}, onGradient = () => {} }) {
  document.querySelectorAll('.cp-pop').forEach(p => p._close && p._close());
  let hsv = rgbToHsv(...hexToRgb(HEXRE.test(value) ? value : '#000000'));
  let mode = gradient && allowGradient ? 'grad' : 'solid';
  let grad = gradient ? JSON.parse(JSON.stringify(gradient)) : { type: 'linear', angle: 90, stops: [{ c: HEXRE.test(value) ? value : '#5b55e6', p: 0 }, { c: '#ffffff', p: 100 }] };
  let stopIdx = 0;
  const pop = document.createElement('div');
  pop.className = 'cp-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', title);
  document.body.appendChild(pop);
  const hex = () => rgbToHex(...hsvToRgb(...hsv));
  function place() {
    const r = anchor.getBoundingClientRect(); const pr = pop.getBoundingClientRect();
    let x = r.left; let y = r.bottom + 6;
    if (x + pr.width > innerWidth - 8) x = innerWidth - pr.width - 8;
    if (y + pr.height > innerHeight - 8) y = Math.max(8, r.top - pr.height - 6);
    pop.style.left = `${Math.max(8, x)}px`; pop.style.top = `${y}px`;
  }
  // Canva benzeri düzen: önce hazır renk listeleri; "+" ile gelişmiş seçici (alan, ton, HEX/RGB/HSL) açılır
  let adv = false; let query = '';
  const chip = (c, h) => `<button type="button" class="cp-chip${c.toLowerCase() === h ? ' on' : ''}" style="background:${c}" data-cp-pick="${c}" aria-label="${c}" title="${c}"></button>`;
  const sec = (label, list, h, extra = '') => (list.length ? `<div class="cp-sec"><div class="cp-sec-h"><span>${label}</span>${extra}</div><div class="cp-sw">${list.map(c => chip(c, h)).join('')}</div></div>` : '');
  function render() {
    const h = hex(); const [r, g, b] = hexToRgb(h); const [hh, ss, ll] = rgbToHsl(r, g, b);
    const q = query.trim().toLocaleLowerCase('tr');
    const qHex = (q.startsWith('#') ? q : '#' + q);
    const found = q ? [...(HEXRE.test(qHex) ? [qHex] : []), ...Object.entries(NAMED).filter(([n]) => n.includes(q)).flatMap(([, cs]) => cs)] : [];
    const advHtml = `<div class="cp-sv" style="background:hsl(${Math.round(hsv[0])},100%,50%)"><div class="cp-sv-w"></div><div class="cp-sv-b"></div><span class="cp-dot" style="left:${hsv[1] * 100}%;top:${(1 - hsv[2]) * 100}%"></span></div>
      <input type="range" class="cp-hue" min="0" max="359" value="${Math.round(hsv[0])}" data-cp-hue aria-label="Ton">
      <div class="cp-inputs">
        <label>HEX<input class="input input-sm" data-cp-hex value="${h}" maxlength="7"></label>
        <label>R<input class="input input-sm" type="number" min="0" max="255" data-cp-rgb="0" value="${r}"></label><label>G<input class="input input-sm" type="number" min="0" max="255" data-cp-rgb="1" value="${g}"></label><label>B<input class="input input-sm" type="number" min="0" max="255" data-cp-rgb="2" value="${b}"></label>
        <label>H<input class="input input-sm" type="number" min="0" max="359" data-cp-hsl="0" value="${hh}"></label><label>S<input class="input input-sm" type="number" min="0" max="100" data-cp-hsl="1" value="${ss}"></label><label>L<input class="input input-sm" type="number" min="0" max="100" data-cp-hsl="2" value="${ll}"></label>
      </div>`;
    pop.innerHTML = `<div class="cp-head"><b>${esc(title)}</b><button type="button" class="btn btn-sm btn-ghost icon-btn" data-cp-close aria-label="Kapat">${icon('x')}</button></div>
      ${allowGradient ? `<div class="seg seg-sm mb-2"><button type="button" class="${mode === 'solid' ? 'active' : ''}" data-cp-mode="solid">Düz renk</button><button type="button" class="${mode === 'grad' ? 'active' : ''}" data-cp-mode="grad">Gradyan</button></div>` : ''}
      ${mode === 'grad' ? `<div class="cp-grad-prev" style="background:${gradCss(grad)}"></div>
        <div class="row mt-2"><div class="seg seg-sm"><button type="button" class="${grad.type === 'linear' ? 'active' : ''}" data-cp-gtype="linear">Doğrusal</button><button type="button" class="${grad.type === 'radial' ? 'active' : ''}" data-cp-gtype="radial">Dairesel</button></div>
        ${grad.type === 'linear' ? `<label class="small grow">Açı: <span data-cp-angle-v>${grad.angle}°</span><input type="range" min="0" max="359" value="${grad.angle}" data-cp-angle aria-label="Gradyan açısı"></label>` : ''}</div>
        <div class="cp-stops">${grad.stops.map((s2, i) => `<div class="cp-stop ${i === stopIdx ? 'on' : ''}"><button type="button" class="cp-chip" style="background:${s2.c}" data-cp-stop="${i}" aria-label="Durak ${i + 1}: ${s2.c}"></button><input type="range" min="0" max="100" value="${s2.p}" data-cp-stop-p="${i}" aria-label="Durak ${i + 1} konumu"><span class="xsmall">${s2.p}%</span>${grad.stops.length > 2 ? `<button type="button" class="btn btn-ghost icon-btn btn-sm" data-cp-stop-del="${i}" aria-label="Durağı sil">${icon('x')}</button>` : ''}</div>`).join('')}
          ${grad.stops.length < 5 ? `<button type="button" class="btn btn-sm btn-ghost" data-cp-stop-add>${icon('plus')}Durak ekle</button>` : ''}</div>
        <p class="xsmall muted">Seçili durağın rengi aşağıdan değişir.</p>` : ''}
      <div class="cp-search"><input class="input input-sm" data-cp-q value="${esc(query)}" placeholder="“mavi” ya da “#00c4cc” yaz" aria-label="Renk ara"></div>
      ${q ? `<div class="cp-sec"><div class="cp-sec-h"><span>Sonuçlar</span></div>${found.length ? `<div class="cp-sw">${found.map(c => chip(c, h)).join('')}</div>` : '<span class="xsmall muted">Eşleşen renk yok.</span>'}</div>` : ''}
      <div class="cp-sec"><div class="cp-sec-h"><span>${mode === 'grad' ? 'Durak rengi' : 'Yeni renk'}</span></div><div class="cp-sw">
        <button type="button" class="cp-chip cp-add ${adv ? 'on' : ''}" data-cp-adv aria-label="Gelişmiş renk seçici" title="Gelişmiş seçici (HEX, RGB, HSL)">+</button>
        ${'EyeDropper' in window ? `<button type="button" class="cp-chip cp-eye" data-cp-eye aria-label="Ekrandan renk al" title="Damlalık">${icon('eye')}</button>` : ''}
        <span class="cp-chip cp-cur" style="background:${h}" title="Seçili renk ${h}"></span><b class="xsmall">${h.toUpperCase()}</b></div></div>
      ${adv || mode === 'grad' ? advHtml : ''}
      ${sec('Bu tasarımdaki renkler', [...new Set(designColors.filter(c => HEXRE.test(c)).map(c => c.toLowerCase()))].slice(0, 16), h)}
      ${sec('Marka kiti', brandColors, h, brandHref ? `<a class="link xsmall" href="${esc(brandHref)}" data-cp-close>Düzenle</a>` : '')}
      ${sec('Son kullanılanlar', recent(), h)}
      ${sec('Varsayılan tek renkler', DEFAULTS, h)}
      <div class="cp-sec" data-cp-pals>${palCache ? palHtml(h) : '<span class="xsmall muted">Paletler yükleniyor…</span>'}</div>`;
    place();
    const qi = pop.querySelector('[data-cp-q]'); if (qi && query) { qi.focus(); qi.setSelectionRange(query.length, query.length); }
  }
  const palHtml = h => (palCache.length ? `<span class="xsmall muted">Kayıtlı paletler</span>${palCache.map(p => `<div class="cp-pal"><span class="xsmall">${esc(p.name)}</span><div class="cp-sw">${p.colors.map(c => `<button type="button" class="cp-chip${c.toLowerCase() === h ? ' on' : ''}" style="background:${c}" data-cp-pick="${c}" aria-label="${c}" title="${c}"></button>`).join('')}</div></div>`).join('')}` : '');
  if (!palCache) api.promptPresets().then(p => { palCache = (p.palette || []).filter(x => Array.isArray(x.colors) && x.colors.length).map(x => ({ name: x.name, colors: x.colors })); const box = pop.querySelector('[data-cp-pals]'); if (box) box.innerHTML = palHtml(hex()); }).catch(() => { palCache = []; });

  let commitT = null;
  function emit(final = false) {
    const h = hex();
    if (mode === 'grad') { grad.stops[stopIdx].c = h; onGradient(JSON.parse(JSON.stringify(grad))); }
    else onChange(h);
    if (final) { clearTimeout(commitT); commitT = setTimeout(() => pushRecent(h), 400); }
  }
  function setHex(h, rerender = true) { if (!HEXRE.test(h)) return; hsv = rgbToHsv(...hexToRgb(h)); emit(true); if (rerender) render(); }

  // Doygunluk/parlaklık alanında sürükleme
  let svDrag = false;
  const sv = e => { const box = pop.querySelector('.cp-sv').getBoundingClientRect(); hsv = [hsv[0], clamp((e.clientX - box.left) / box.width, 0, 1), clamp(1 - (e.clientY - box.top) / box.height, 0, 1)]; emit(); render(); };
  pop.addEventListener('pointerdown', e => { if (e.target.closest('.cp-sv')) { svDrag = true; pop.setPointerCapture(e.pointerId); sv(e); } });
  pop.addEventListener('pointermove', e => { if (svDrag) sv(e); });
  pop.addEventListener('pointerup', () => { if (svDrag) { svDrag = false; pushRecent(hex()); } });
  pop.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-cp-q]')) { query = t.value; const v = query.trim(); const hx = v.startsWith('#') ? v : '#' + v; if (HEXRE.test(hx)) { hsv = rgbToHsv(...hexToRgb(hx.toLowerCase())); emit(true); } return render(); }
    if (t.matches('[data-cp-hue]')) { hsv = [Number(t.value), hsv[1], hsv[2]]; emit(); pop.querySelector('.cp-sv').style.background = `hsl(${t.value},100%,50%)`; { const cur = pop.querySelector('.cp-cur'); if (cur) cur.style.background = hex(); } return; }
    if (t.matches('[data-cp-hex]')) { const v = t.value.startsWith('#') ? t.value : '#' + t.value; if (HEXRE.test(v)) setHex(v.toLowerCase(), false); return; }
    if (t.matches('[data-cp-rgb]')) { const v = [0, 1, 2].map(i => Number(pop.querySelector(`[data-cp-rgb="${i}"]`).value) || 0); hsv = rgbToHsv(...v); emit(true); return; }
    if (t.matches('[data-cp-hsl]')) { const v = [0, 1, 2].map(i => Number(pop.querySelector(`[data-cp-hsl="${i}"]`).value) || 0); hsv = rgbToHsv(...hslToRgb(...v)); emit(true); return; }
    if (t.matches('[data-cp-angle]')) { grad.angle = Number(t.value); pop.querySelector('[data-cp-angle-v]').textContent = `${t.value}°`; pop.querySelector('.cp-grad-prev').style.background = gradCss(grad); onGradient(JSON.parse(JSON.stringify(grad))); return; }
    if (t.matches('[data-cp-stop-p]')) { grad.stops[Number(t.dataset.cpStopP)].p = Number(t.value); t.nextElementSibling.textContent = `${t.value}%`; pop.querySelector('.cp-grad-prev').style.background = gradCss(grad); onGradient(JSON.parse(JSON.stringify(Object.assign({}, grad, { stops: grad.stops.slice().sort((a, b) => a.p - b.p) })))); }
  });
  pop.addEventListener('change', e => { if (e.target.matches('[data-cp-hue],[data-cp-rgb],[data-cp-hsl]')) render(); });
  pop.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-cp-close]')) return close();
    if (t.closest('[data-cp-adv]')) { adv = !adv; return render(); }
    const pk = t.closest('[data-cp-pick]'); if (pk) return setHex(pk.dataset.cpPick.toLowerCase());
    const md = t.closest('[data-cp-mode]');
    if (md) { mode = md.dataset.cpMode; if (mode === 'solid') { onGradient(null); emit(true); } else { stopIdx = 0; hsv = rgbToHsv(...hexToRgb(grad.stops[0].c)); onGradient(JSON.parse(JSON.stringify(grad))); } return render(); }
    const gt = t.closest('[data-cp-gtype]'); if (gt) { grad.type = gt.dataset.cpGtype; onGradient(JSON.parse(JSON.stringify(grad))); return render(); }
    const st = t.closest('[data-cp-stop]'); if (st) { stopIdx = Number(st.dataset.cpStop); hsv = rgbToHsv(...hexToRgb(grad.stops[stopIdx].c)); return render(); }
    const sd = t.closest('[data-cp-stop-del]'); if (sd) { grad.stops.splice(Number(sd.dataset.cpStopDel), 1); stopIdx = 0; onGradient(JSON.parse(JSON.stringify(grad))); return render(); }
    if (t.closest('[data-cp-stop-add]')) { grad.stops.push({ c: hex(), p: 50 }); grad.stops.sort((a, b) => a.p - b.p); onGradient(JSON.parse(JSON.stringify(grad))); return render(); }
    if (t.closest('[data-cp-eye]')) { try { const r = await new window.EyeDropper().open(); setHex(r.sRGBHex.toLowerCase()); } catch { /* vazgeçildi */ } }
  });
  const outside = e => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function close() { pop.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true); pushRecent(hex()); }
  pop._close = close;
  setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', onKey, true); }, 0);
  render();
  return { close };
}
