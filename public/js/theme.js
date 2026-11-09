// Aşama 5.20: Koyu tema. Tercih: açık / koyu / sistem (işletim sisteminin ayarını izler). Bu tarayıcıda saklanır.
const KEY = 'ium.theme';
// Kullanıcının isteğiyle koyu tema şimdilik kapalı: her zaman açık tema. Yeniden açmak için true yap.
export const THEME_ENABLED = false;
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
export const THEMES = { acik: 'Açık', koyu: 'Koyu', sistem: 'Sistem' };
export function themePref() { try { const v = localStorage.getItem(KEY); return THEMES[v] ? v : 'acik'; } catch { return 'acik'; } }
export function isDark() { if (!THEME_ENABLED) return false; const p = themePref(); return p === 'koyu' || (p === 'sistem' && mq && mq.matches); }
export function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const b = document.getElementById('theme-toggle');
  if (b) b.hidden = !THEME_ENABLED;
  if (b) { b.setAttribute('aria-pressed', String(dark)); b.title = dark ? 'Açık temaya geç' : 'Koyu temaya geç'; b.innerHTML = dark ? '☀️' : '🌙'; }
}
export function setTheme(v) { try { localStorage.setItem(KEY, v); } catch { /* tercih kaydedilemezse yalnız bu oturum */ } applyTheme(); }
export function toggleTheme() { setTheme(isDark() ? 'acik' : 'koyu'); }
export function initTheme() { applyTheme(); if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (themePref() === 'sistem') applyTheme(); }); }
