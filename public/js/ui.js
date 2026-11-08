// Arayüz yardımcıları: güvenli HTML, bildirimler, ikonlar, marka teması
export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function toast(message, type = 'info', ms = 3800) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'az önce';
  if (s < 3600) return Math.floor(s / 60) + ' dk önce';
  if (s < 86400) return Math.floor(s / 3600) + ' sa önce';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' gün önce';
  return new Date(iso).toLocaleDateString('tr-TR');
}

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  brands: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tasks: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  notes: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  idea: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><path d="M12 2a10 10 0 1 0 0 20c1 0 1.5-.8 1.5-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H16a6 6 0 0 0 6-6C22 6 17.5 2 12 2z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>',
  identity: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 1.8-2 3-2s2.4.5 3 2M14 10h4M14 13h3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

export function brandAvatar(brand, logoUrl, size = '') {
  const initial = esc((brand.name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR'));
  const bg = brand.colors && brand.colors.primary ? ` style="background:${esc(brand.colors.primary)}"` : '';
  return `<div class="avatar ${size}"${bg}>${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : initial}</div>`;
}

// WCAG göreli parlaklık: açık renklerde yazı koyu, koyu renklerde beyaz olur
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const DEFAULT_BRAND = '#5b55e6';

// Seçili markanın ana rengi kenar çubuğuna, düğmelere ve vurgulara uygulanır.
// --on-brand: marka rengi üzerindeki yazı rengi; --brand-ink: beyaz zemin üzerindeki marka rengi yazı (gerekirse koyulaştırılır)
export function applyBrandTheme(brand) {
  const raw = brand && brand.colors && brand.colors.primary;
  const color = /^#[0-9a-fA-F]{6}$/.test(raw || '') ? raw.toLowerCase() : DEFAULT_BRAND;
  const lum = luminance(color);
  const root = document.documentElement.style;
  root.setProperty('--brand', color);
  root.setProperty('--on-brand', lum > 0.45 ? '#1b1f3b' : '#ffffff');
  root.setProperty('--brand-ink', lum > 0.3 ? `color-mix(in srgb, ${color} 45%, #000)` : color);
}

// Yüzde halkası (SVG)
export function ring(percent, size = 92) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return `<div class="ring ${percent >= 100 ? 'done' : ''}" style="width:${size}px;height:${size}px" role="img" aria-label="Yüzde ${percent}">
    <svg viewBox="0 0 92 92"><circle class="track" cx="46" cy="46" r="${r}" fill="none" stroke-width="10"/>
    <circle class="value" cx="46" cy="46" r="${r}" fill="none" stroke-width="10" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - percent / 100)).toFixed(1)}"/></svg>
    <div class="num">%${percent}</div></div>`;
}

// Son N günün her biri için sayım: zamanlar yerel saate göre günlere bölünür
export function bucketByDay(isoTimes, days = 14) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({ date: d, count: 0 });
  }
  isoTimes.forEach(t => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    const slot = out.find(o => o.date.getTime() === d.getTime());
    if (slot) slot.count++;
  });
  return out;
}

// Marka fontlarını Google Fonts'tan yükler (aynı font iki kez yüklenmez)
const loadedFonts = new Set();
export function loadFonts(families) {
  families.filter(f => f && !loadedFonts.has(f)).forEach(f => {
    loadedFonts.add(f);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;600;700;800&display=swap';
    document.head.appendChild(link);
  });
}

// Hata kutusu: sayfa yüklenemezse anlaşılır mesaj ve "Tekrar dene" (app.js bütün [data-retry] düğmelerini dinler)
export function errorBox(err, { retry = true } = {}) {
  return `<div class="card error-card" role="alert"><div class="empty-icon">${icon('alert')}</div><h4>Bir sorun oluştu</h4>
    <p class="small muted">${esc((err && err.message) || err)}</p>${retry ? '<button class="btn btn-sm mt-2" type="button" data-retry>Tekrar dene</button>' : ''}</div>`;
}

// Satır içi küçük hata (liste veya kart içinde)
export function errorNotice(err) {
  return `<div class="notice notice-error" role="alert"><div><strong>Bir sorun oluştu.</strong> ${esc((err && err.message) || err)}</div></div>`;
}

// --- Sayfa düzeni: her sayfada aynı başlık yapısı (başlık + açıklama solda, işlemler sağda) ---
export function pageHead({ title, desc = '', actions = '' }) {
  return `<header class="page-head"><div class="ph-text"><h1>${esc(title)}</h1>${desc ? `<p>${desc}</p>` : ''}</div>${actions ? `<div class="ph-actions">${actions}</div>` : ''}</header>`;
}

// Boş durum: ikon, başlık, açıklama ve isteğe bağlı tek işlem. compact: kart içindeki küçük listeler için
export function emptyState({ icon: iconName = 'inbox', title, text = '', action = '', compact = false, card = false }) {
  return `<div class="${card ? 'card ' : ''}empty${compact ? ' compact' : ''}"><div class="empty-icon">${icon(iconName)}</div><h4>${esc(title)}</h4>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

// Yükleniyor iskeleti: sayfa başlığı + kartlar (sayfanın son hâline benzer yerleşim, ekran zıplamaz)
export function skeletonPage({ cards = 3, height = 180, head = true } = {}) {
  return `<div class="sk-page" aria-busy="true" aria-label="Yükleniyor">${head ? '<div class="skeleton sk-head"></div>' : ''}
    <div class="sk-grid">${`<div class="skeleton" style="height:${height}px"></div>`.repeat(cards)}</div></div>`;
}

// Düğmede işlem sürerken yükleniyor durumu: çift tıklamayı engeller, bitince eski hâline döner
export async function busy(btn, fn) {
  if (!btn) return fn();
  if (btn.classList.contains('is-loading')) return undefined;
  btn.classList.add('is-loading');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally {
    if (btn.isConnected) { btn.classList.remove('is-loading'); btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }
}

// --- Tarih yardımcıları (yerel saat) ---
export const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const TR_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// Haftanın başı pazartesi
export const startOfWeek = d => { const x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); };
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const dateKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const timeStr = d => { const x = new Date(d); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
export const fmtDate = (d, opts = { day: 'numeric', month: 'long' }) => new Date(d).toLocaleDateString('tr-TR', opts);

// --- Pencere (modal) ---
// fields html'i bir <form> içine konur; onSubmit(FormData) hata fırlatırsa pencere açık kalır
export function openModal({ title, body, submitLabel = 'Kaydet', onSubmit, danger }) {
  const prev = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <form class="modal-form" novalidate>
        <div class="modal-head"><h3 id="modal-title">${esc(title)}</h3><button type="button" class="btn btn-ghost icon-btn btn-sm" data-close aria-label="Kapat">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          ${danger ? `<button type="button" class="btn btn-danger" data-danger>${esc(danger.label)}</button>` : ''}
          <span style="flex:1"></span>
          <button type="button" class="btn" data-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector('form');
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
  // Esc kapatır; Tab odağı pencerenin içinde tutar
  const onKey = e => {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    const items = [...wrap.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  if (danger) wrap.querySelector('[data-danger]').addEventListener('click', async e => {
    if (danger.confirm && !confirm(danger.confirm)) return;
    try { await busy(e.currentTarget, () => danger.onClick()); close(); } catch (err) { toast(err.message, 'error'); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    // Zorunlu alanlar pencere içinde gösterilir (bildirim yerine alanın altında)
    const missing = [...form.querySelectorAll('[required]')].filter(el => !String(el.value).trim());
    form.querySelectorAll('.field-error').forEach(el => el.remove());
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    if (missing.length) {
      missing.forEach(el => {
        el.setAttribute('aria-invalid', 'true');
        el.insertAdjacentHTML('afterend', '<span class="field-error">Bu alan zorunlu.</span>');
      });
      missing[0].focus();
      return;
    }
    try { await busy(form.querySelector('[type=submit]'), () => onSubmit(new FormData(form), form)); close(); } catch (err) { toast(err.message, 'error'); }
  });
  const first = form.querySelector('input:not([type=hidden]), textarea, select');
  if (first) first.focus();
  return { close, form };
}

// --- Grafikler (gerçek verilerle; boşsa açıklayıcı boş durum) ---
// Gruplu sütun grafiği: groups = [{ label, values: [n, n] }], series = [{ name, color }]
export function columnChart(groups, series, { height = 160, empty = 'Henüz veri yok.' } = {}) {
  const max = Math.max(0, ...groups.flatMap(g => g.values));
  if (!max) return `<div class="chart-empty" style="height:${height}px">${esc(empty)}</div>`;
  return `
    <div class="col-chart" style="height:${height}px">
      ${groups.map(g => `
        <div class="col-group" title="${esc(g.label)}: ${g.values.map((v, i) => `${series[i].name} ${v}`).join(', ')}">
          <div class="col-bars">${g.values.map((v, i) => `<i style="height:${v ? Math.max(4, Math.round((v / max) * 100)) : 0}%;background:${series[i].color}"><span>${v || ''}</span></i>`).join('')}</div>
          <div class="col-label">${esc(g.label)}</div>
        </div>`).join('')}
    </div>
    <div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

// Yatay çubuklar: items = [{ label, value, color, sub }]
export function hbarChart(items, { empty = 'Henüz veri yok.' } = {}) {
  const max = Math.max(0, ...items.map(i => i.value));
  if (!max) return `<div class="chart-empty">${esc(empty)}</div>`;
  return `<div class="hbars">${items.map(i => `
    <div class="hbar"><div class="hbar-top"><span>${esc(i.label)}</span><b>${i.value}</b></div>
      <div class="hbar-track"><i style="width:${Math.max(3, Math.round((i.value / max) * 100))}%;background:${i.color || 'var(--brand)'}"></i></div>
      ${i.sub ? `<div class="small muted">${esc(i.sub)}</div>` : ''}</div>`).join('')}</div>`;
}

// Halka grafik: segments = [{ label, value, color }]
export function donutChart(segments, { center = '', empty = 'Henüz veri yok.' } = {}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  if (!total) return `<div class="chart-empty">${esc(empty)}</div>`;
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.filter(s => s.value).map(s => {
    const len = (s.value / total) * c;
    const arc = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${s.color}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    offset += len;
    return arc;
  }).join('');
  return `<div class="donut-wrap">
    <div class="donut"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(segments.map(s => s.label + ' ' + s.value).join(', '))}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="16"/>${arcs}</svg><div class="donut-center"><span>${center || total}</span></div></div>
    <ul class="donut-legend">${segments.map(s => `<li><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${s.value}</b></li>`).join('')}</ul></div>`;
}

export const SERIES_COLORS = ['#7d6bf0', '#ff8a65', '#12a48f', '#f6b93b', '#e5486b', '#4a90e2', '#9b7bd4', '#2bb3c0'];
