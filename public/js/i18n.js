// 6.3 Arayüz dili (TR / EN). Kaynak dil Türkçe; arayüz metinleri kodda Türkçe yazılı kalır. İngilizce seçiliyken
// çizilen her sayfada metin düğümleri ve placeholder / title / aria-label öznitelikleri sözlükten çevrilir; sayı içeren
// cümleler kalıp kurallarıyla (locales/en.js → PATTERNS) çevrilir. Kullanıcının ve AI'ın ürettiği içerik çevrilmez:
// [data-no-i18n] işaretli alanlar (sohbet mesajları, notlar, fikirler, tasarım içerikleri…) ve form alanlarının değerleri atlanır.
// LANG_ENABLED false iken Ayarlar'da dil seçimi gösterilmez (kullanıcı için uygulama Türkçedir); çeviri kapsamı
// tamamlanınca açılır. Kapsam denetimi (scripts/i18n-check) dili localStorage'dan doğrudan seçer.
export const LANG_ENABLED = false;
const KEY = 'ium.lang';
const ATTRS = ['placeholder', 'title', 'aria-label'];
let dict = null;
let patterns = [];
let observer = null;

export function getLang() {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'tr'; } catch { return 'tr'; }
}
export function setLang(lang) {
  try { localStorage.setItem(KEY, lang === 'en' ? 'en' : 'tr'); } catch { /* tercih kaydedilemezse sorun değil */ }
  location.reload();
}

// Tek bir metni çevirir (sözlük → kalıplar); bulunamazsa olduğu gibi döner. Baştaki/sondaki boşluk korunur.
export function tr(text) {
  if (!dict) return text;
  const s = String(text);
  const core = s.trim();
  if (!core || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(core)) return s;
  let out = dict.get(core);
  if (out == null) {
    for (const [re, rep] of patterns) { const m = core.match(re); if (m) { out = typeof rep === 'function' ? rep(m, tr) : core.replace(re, rep); break; } }
  }
  if (out == null) return s;
  return s.replace(core, out);
}

const skip = el => el && el.closest && el.closest('[data-no-i18n], script, style, textarea, [contenteditable="true"]');

export function translate(root = document.body) {
  if (!dict || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (skip(n.parentElement)) continue;
    const next = tr(n.nodeValue);
    if (next !== n.nodeValue) n.nodeValue = next;
  }
  const els = root.querySelectorAll ? root.querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')) : [];
  for (const el of [root, ...els]) {
    if (!el.getAttribute || skip(el)) continue;
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const next = tr(v); if (next !== v) el.setAttribute(a, next); } }
  }
}

// İngilizce seçiliyse sözlüğü yükler ve sayfadaki her değişikliği çevirir
export async function initI18n() {
  const lang = getLang();
  document.documentElement.lang = lang;
  if (lang !== 'en') return;
  const m = await import('./locales/en.js');
  dict = new Map(Object.entries(m.EN));
  patterns = m.PATTERNS || [];
  translate(document.body);
  document.title = tr(document.title);
  // Tarayıcının kendi onay/soru pencereleri de çevrilir
  const [c, p, a] = [window.confirm, window.prompt, window.alert];
  window.confirm = m => c.call(window, tr(m));
  window.prompt = (m, d) => p.call(window, tr(m), d);
  window.alert = m => a.call(window, tr(m));
  let busy = false;
  observer = new MutationObserver(muts => {
    if (busy) return;
    busy = true;
    try {
      for (const mu of muts) {
        if (mu.type === 'characterData') { const n = mu.target; if (!skip(n.parentElement)) { const next = tr(n.nodeValue); if (next !== n.nodeValue) n.nodeValue = next; } }
        else if (mu.type === 'attributes') { const el = mu.target; if (!skip(el)) { const v = el.getAttribute(mu.attributeName); const next = v && tr(v); if (v && next !== v) el.setAttribute(mu.attributeName, next); } }
        else mu.addedNodes.forEach(n => { if (n.nodeType === 1) translate(n); else if (n.nodeType === 3 && !skip(n.parentElement)) { const next = tr(n.nodeValue); if (next !== n.nodeValue) n.nodeValue = next; } });
      }
    } finally { busy = false; }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
