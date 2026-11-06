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
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'
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

export function errorBox(err) {
  return `<div class="notice notice-error"><div><strong>Bir sorun oluştu.</strong> ${esc(err.message || err)}</div></div>`;
}
