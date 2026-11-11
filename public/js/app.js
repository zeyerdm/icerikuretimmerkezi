// Uygulama çekirdeği: iki katmanlı mimari
//   Katman 1 — Yönetim Merkezi: bütün kullanıcılarda aynı, sabit renkli; takvim, görevler, notlar, analizler, markalar
//   Katman 2 — Marka çalışma alanı (#/m/<markaId>/...): markanın kendi renkleri, logosu, maskotu ve alt menüsü
// Bir markanın teması yalnızca kendi çalışma alanında uygulanır; yönetim merkezine dönünce sabit renklere geçilir.
import { api } from './api.js';
import { esc, icon, toast, brandAvatar, applyBrandTheme, errorBox, emptyState, skeletonPage } from './ui.js';
import { renderCenter } from './views/center.js';
import { renderHome } from './views/home.js';
import { renderBrands } from './views/brands.js';
import { renderBrandEditor } from './views/brandEditor.js';
import { renderSettings } from './views/settings.js';
import { renderCalendar } from './views/calendar.js';
import { renderTasks } from './views/tasks.js';
import { renderNotes } from './views/notes.js';
import { renderAnalytics } from './views/analytics.js';
import { renderIdeas } from './views/ideas.js';
import { renderArchive } from './views/archive.js';
import { renderAi } from './views/ai.js';
import { renderReels } from './views/reels.js';
import { renderPosts } from './views/posts.js';
import { renderPrompts } from './views/prompts.js';
import { renderMemory } from './views/memory.js';
import { renderCompetitors } from './views/competitors.js';
import { bellHtml, openSummary, showDailyOnce, startNotifier } from './reminders.js';
import { initPalette, openPalette } from './palette.js';
import { initInspiration } from './inspiration.js';
import { renderTrash, initTrashUndo } from './views/trash.js';
import { renderExporter } from './views/exporter.js';
import { renderDesk } from './views/desk.js';
import { renderVideo } from './views/video.js';
import { renderCampaigns } from './views/campaigns.js';
import { renderReport } from './views/report.js';
import { mountAssistant } from './assistantWidget.js';
import { initFx } from './fx.js';
import { enhanceMics, dictationSupported } from './dictation.js';
import { maybeStartTour } from './tour.js';
import { initTheme, toggleTheme, applyTheme } from './theme.js';

// activeBrandId: en son çalışılan marka (yönetim merkezinde "kaldığın yerden devam")
// workspaceBrandId: şu an içinde bulunulan marka çalışma alanı (yoksa yönetim merkezindeyiz)
export const state = { meta: null, settings: null, brands: [], activeBrandId: null, workspaceBrandId: null };

export function activeBrand() {
  return state.brands.find(b => b.id === (state.workspaceBrandId || state.activeBrandId)) || null;
}
export const brandById = id => state.brands.find(b => b.id === id) || null;

// Hangi sürümün açık olduğu kenar çubuğunun altında küçük yazıyla görünür
export async function showVersion() {
  try {
    const s = await api.system();
    const el = document.getElementById('app-version');
    if (el) el.textContent = 'Sürüm ' + s.version + (s.sha ? ' · ' + s.sha.slice(0, 7) : '');
  } catch { /* sürüm bilgisi alınamazsa gizli kalır */ }
}

export async function refreshBrands() {
  const [{ brands }, settings] = await Promise.all([api.brands(), api.settings()]);
  state.brands = brands;
  state.settings = settings;
  state.activeBrandId = brands.some(b => b.id === settings.activeBrandId) ? settings.activeBrandId : null;
  renderChrome();
}

// En son çalışılan markayı kaydeder (yönetim merkezindeki "devam et" kartı için)
export async function selectBrand(brandId) {
  if (state.activeBrandId === brandId) return;
  await api.setActiveBrand(brandId);
  state.activeBrandId = brandId;
}

// Örnek markayı ekler (varsa açar) ve onun çalışma alanına götürür
export async function openDemoBrand() {
  const { brand, created } = await api.createDemoBrand();
  await refreshBrands();
  toast(created ? 'Örnek marka hazır. Çalışma alanındaki rehberle keşfetmeye başla.' : 'Örnek marka zaten var, onu açtım.', 'success');
  go('#/m/' + brand.id);
}

export const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

export const CENTER_NAV = [
  { hash: '#/', label: 'Yönetim Merkezi', icon: 'home', page: 'center' },
  { hash: '#/markalar', label: 'Markalar', icon: 'brands', page: 'brands' },
  { hash: '#/masa', label: 'Çalışma masası', icon: 'calendar', page: 'desk' },
  { hash: '#/analizler', label: 'Analizler', icon: 'chart', page: 'analytics' },
  { hash: '#/cop', label: 'Çöp kutusu', icon: 'trash', page: 'trash' },
  { hash: '#/ayarlar', label: 'Ayarlar', icon: 'settings', page: 'settings' }
];

// Marka çalışma alanı alt menüsü. "Yakında" olanlar tıklanamaz; bitmiş gibi gösterilmez.
export const BRAND_NAV = [
  { page: 'home', path: '', label: 'Marka ana sayfası', icon: 'home', group: 'yonetim' },
  { page: 'kimlik', path: '/kimlik', label: 'Dijital kimlik', icon: 'identity', group: 'yonetim' },
  { page: 'hafiza', path: '/hafiza', label: 'Hafıza', icon: 'notes', group: 'yonetim' },
  { page: 'fikirler', path: '/fikirler', label: 'İçerik fikirleri', icon: 'idea', group: 'uretim' },
  { page: 'reels', path: '/reels', label: 'Reels', icon: 'film', group: 'uretim' },
  { page: 'post', path: '/post', label: 'Post stüdyosu', icon: 'palette', group: 'uretim' },
  { page: 'prompt', path: '/prompt', label: 'Prompt Studio', icon: 'wand', group: 'uretim' },
  { page: 'takvim', path: '/takvim', label: 'Takvim', icon: 'calendar', group: 'uretim' },
  { page: 'arsiv', path: '/arsiv', label: 'Arşiv', icon: 'archive', group: 'uretim' },
  { page: 'kampanya', path: '/kampanya', label: 'Kampanya kanvası', icon: 'grid', group: 'uretim' },
  { page: 'rakipler', path: '/rakipler', label: 'Rakipler', icon: 'brands', group: 'arastirma' },
  { page: 'analiz', path: '/analiz', label: 'Analizler', icon: 'chart', group: 'arastirma' },
  { page: 'rapor', path: '/rapor', label: 'Aylık rapor', icon: 'archive', group: 'arastirma' },
  { page: 'kutuphane', path: '/kutuphane', label: 'Kütüphane', icon: 'image', group: 'varlik' },
  { page: 'disa', path: '/disa-aktar', label: 'Dışa aktar', icon: 'download', group: 'varlik' },
  { page: 'video', path: '/video', label: 'Video ve altyazı', icon: 'film', group: 'varlik' }
];
// U.6: marka menüsü grupları (açılıp kapanır; tercih hatırlanır, açık sayfanın grubu her zaman açık)
const BRAND_GROUPS = [['yonetim', 'Marka yönetimi'], ['uretim', 'İçerik üretimi'], ['arastirma', 'Araştırma'], ['varlik', 'Varlıklar']];
const GROUP_KEY = 'ium.nav.closed';
function closedGroups() { try { return JSON.parse(localStorage.getItem(GROUP_KEY) || '[]'); } catch { return []; } }

const CENTER_TITLES = { center: 'Genel bakış', brands: 'Markalar', calendar: 'İçerik Takvimi', tasks: 'Görevler', notes: 'Notlar', analytics: 'Analizler', settings: 'Ayarlar', desk: 'Çalışma masası', trash: 'Çöp kutusu', newBrand: 'Yeni marka', ai: 'Yapay zekâ' };

export function parseRoute(hash = location.hash || '#/') {
  let m;
  if ((m = hash.match(/^#\/m\/([^/]+)(\/[^?]*)?$/))) {
    const rest = (m[2] || '').replace(/\/$/, '');
    const id = decodeURIComponent(m[1]);
    if (rest === '') return { layer: 'brand', page: 'home', brandId: id };
    if (rest === '/kimlik') return { layer: 'brand', page: 'kimlik', brandId: id, tab: 'profil' };
    if (rest === '/kimlik/gorsel') return { layer: 'brand', page: 'kimlik', brandId: id, tab: 'gorsel' };
    // Reels: /reels (fikir havuzu), /reels/liste (senaryolar), /reels/<id> (senaryo); Post: /post, /post/<id>
    let mm;
    if ((mm = rest.match(/^\/reels(?:\/(liste|kaliplar|[A-Za-z0-9-]{8,}))?$/))) return { layer: 'brand', page: 'reels', brandId: id, sub: mm[1] || null };
    if ((mm = rest.match(/^\/post(?:\/(izgara|[A-Za-z0-9-]{8,}))?$/))) return { layer: 'brand', page: 'post', brandId: id, sub: mm[1] || null };
    if ((mm = rest.match(/^\/kampanya(?:\/([A-Za-z0-9-]{8,}))?$/))) return { layer: 'brand', page: 'kampanya', brandId: id, sub: mm[1] || null };
    if ((mm = rest.match(/^\/prompt(?:\/([A-Za-z0-9-]{8,}))?$/))) return { layer: 'brand', page: 'prompt', brandId: id, sub: mm[1] || null };
    const sub = BRAND_NAV.find(n => n.path === rest && !n.soon);
    if (sub) return { layer: 'brand', page: sub.page, brandId: id };
    return { layer: 'brand', page: 'notfound', brandId: id };
  }
  // Eski adresler (#/marka/<id>/<sekme>) çalışma alanına yönlendirilir
  if ((m = hash.match(/^#\/marka\/([^/]+)(?:\/(profil|gorsel|varliklar))?$/)) && m[1] !== 'yeni') {
    return { redirect: '#/m/' + m[1] + ({ gorsel: '/kimlik/gorsel', varliklar: '/kutuphane' }[m[2]] || '/kimlik') };
  }
  if (hash === '#/marka/yeni') return { layer: 'center', page: 'newBrand' };
  if ((m = hash.match(/^#\/ai(?:\/(modeller|harcama))?$/))) return { layer: 'center', page: 'ai', tab: m[1] || 'karsilastir' };
  // Görevler ve Notlar tam sayfa olarak da açılır (eski bağlantılar); menüde Çalışma masası altında
  if (hash === '#/takvim') return { layer: 'center', page: 'desk' }; // takvim artık Çalışma masasının ortasında
  if (hash === '#/gorevler') return { layer: 'center', page: 'tasks' };
  if (hash === '#/notlar') return { layer: 'center', page: 'notes' };
  const nav = CENTER_NAV.find(n => n.hash === hash || (n.hash === '#/' && hash === ''));
  return { layer: 'center', page: nav ? nav.page : 'notfound' };
}

function navLink(href, label, iconName, active) {
  return `<a href="${href}" class="${active ? 'active' : ''}" aria-label="${esc(label)}" title="${esc(label)}" ${active ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${esc(label)}</span></a>`;
}

export function renderChrome() {
  const r = parseRoute();
  const sidebar = document.querySelector('.sidebar');
  const brand = r.layer === 'brand' ? brandById(r.brandId) : null;
  const nav = document.getElementById('nav');
  const head = document.getElementById('side-head');
  const foot = document.getElementById('side-brand');
  sidebar.classList.toggle('is-brand', Boolean(brand));

  if (brand) {
    const base = '#/m/' + encodeURIComponent(brand.id);
    head.innerHTML = `
      <a class="back-link" href="#/" aria-label="Yönetim Merkezine dön">${icon('back')}<span>Yönetim Merkezi</span></a>
      <div class="ws-brand">${brandAvatar(brand, brand.logoUrl)}<div style="min-width:0"><div class="ws-name">${esc(brand.name)}</div><div class="ws-sub">Marka çalışma alanı</div></div></div>`;
    // Hazır modüller üstte; sıradaki aşamalarda gelecekler altta "Yakında" başlığıyla, tıklanamaz
    const closed = closedGroups();
    const activeGroup = (BRAND_NAV.find(n => n.page === r.page) || {}).group;
    nav.innerHTML = BRAND_GROUPS.map(([g, label]) => {
      const open = g === activeGroup || !closed.includes(g);
      return `<div class="nav-sec ${open ? 'open' : ''}"><button type="button" class="nav-sec-head" data-nav-group="${g}" aria-expanded="${open}">${esc(label)}${icon('chevronDown')}</button>
        <div class="nav-sec-body">${BRAND_NAV.filter(n => n.group === g).map(n => navLink(base + n.path, n.label, n.icon, r.page === n.page)).join('')}</div></div>`;
    }).join('');
    nav.onclick = e => {
      const h = e.target.closest('[data-nav-group]');
      if (!h) return;
      const sec = h.parentElement;
      const open = !sec.classList.contains('open');
      sec.classList.toggle('open', open);
      h.setAttribute('aria-expanded', String(open));
      const list = closedGroups().filter(x => x !== h.dataset.navGroup);
      if (!open) list.push(h.dataset.navGroup);
      try { localStorage.setItem(GROUP_KEY, JSON.stringify(list)); } catch { /* tercih kaydedilemezse sorun değil */ }
    };
    // Kimlik tamamlanma oranı marka ana sayfasındaki Dijital kimlik kartında; menünün altı sade kalır
    foot.innerHTML = '';
  } else {
    nav.onclick = null;
    head.innerHTML = '<div class="logo"><img class="logo-mark" src="/img/logo.svg" alt=""><div>KREATİFHANE<small>Kreatif Yönetim Platformu</small></div></div>';
    // Görev/not tam sayfaları Çalışma masası, Yapay zekâ sayfaları Ayarlar altında sayılır
    const owner = { newBrand: 'brands', tasks: 'desk', notes: 'desk', ai: 'settings' }[r.page] || r.page;
    nav.innerHTML = CENTER_NAV.map(n => navLink(n.hash, n.label, n.icon, owner === n.page)).join('');
    const last = state.brands.find(b => b.id === state.activeBrandId);
    foot.innerHTML = last ? `<div class="side-last"><div class="small">Son çalıştığın marka</div>
        <a class="side-last-link" href="#/m/${esc(last.id)}">${brandAvatar(last, last.logoUrl)}<span>${esc(last.name)}</span>${icon('chevronRight')}</a></div>` : '';
  }

  // Üst çubuk: konum (yönetim merkezi › marka › sayfa), marka değiştirici, AI durumu
  const ai = state.settings && state.settings.ai;
  const b = ai && ai.budget;
  const aiPill = ai && ai.configured
    ? (b && b.warning
      ? `<a class="pill pill-warn" href="#/ai/harcama" title="Bu ay ${b.spent.toFixed(2)} $ / ${b.monthlyUsd} $"><span class="dot"></span>${b.blocked ? 'AI sınırı doldu' : 'AI harcaması %' + b.percent}</a>`
      : `<a class="pill pill-ok" href="#/ai/modeller" title="${esc(ai.providerLabel)} · ${esc(ai.model)}"><span class="dot"></span>AI bağlı</a>`)
    : `<a class="pill pill-warn" href="#/ai/modeller"><span class="dot"></span>AI bağlı değil</a>`;
  const pageLabel = brand ? ((BRAND_NAV.find(n => n.page === r.page) || {}).label || '') : (CENTER_TITLES[r.page] || '');
  const crumbs = brand
    ? `<a href="#/">Yönetim Merkezi</a><span>›</span><a href="#/m/${esc(brand.id)}">${esc(brand.name)}</a>${r.page !== 'home' ? `<span>›</span><b>${esc(pageLabel)}</b>` : ''}`
    : `<a href="#/">Yönetim Merkezi</a>${{ ai: '<span>›</span><a href="#/ayarlar">Ayarlar</a>', tasks: '<span>›</span><a href="#/masa">Çalışma masası</a>', notes: '<span>›</span><a href="#/masa">Çalışma masası</a>' }[r.page] || ''}${r.page !== 'center' && pageLabel ? `<span>›</span><b>${esc(pageLabel)}</b>` : ''}`;
  document.getElementById('topbar').innerHTML = `
    <nav class="crumbs" aria-label="Konum">${crumbs}</nav>
    <div class="spacer"></div>
    ${state.brands.length ? `
      <select id="brand-switch" class="select" aria-label="${brand ? 'Marka değiştir' : 'Markaya geç'}">
        ${brand ? '' : '<option value="">Markaya geç…</option>'}
        ${state.brands.map(b => `<option value="${esc(b.id)}" ${brand && b.id === brand.id ? 'selected' : ''}>${esc(b.name)}${b.isDemo ? ' (örnek)' : ''}</option>`).join('')}
        ${brand ? '<option value="__center">← Yönetim Merkezi</option>' : ''}
      </select>` : ''}
    <button type="button" class="btn btn-ghost btn-sm icon-btn theme-btn" id="theme-toggle" aria-label="Tema değiştir"></button>
    <button type="button" class="btn btn-ghost btn-sm kbd-btn" id="palette-open" title="Komut paleti (Ctrl+K)">${icon('search')}<span>Ara / komut</span><kbd>Ctrl K</kbd></button>
    <span id="bell-slot"></span>
    ${aiPill}`;
  // Zil (bekleyen iş rozeti) ayrı yüklenir; üst çubuğu bekletmez
  bellHtml().then(({ html, summary }) => {
    const slot = document.getElementById('bell-slot');
    if (!slot || !html) return;
    slot.innerHTML = html;
    slot.querySelector('#bell').addEventListener('click', () => openSummary(summary));
  });
  document.getElementById('palette-open').addEventListener('click', openPalette);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  applyTheme();
  const sw = document.getElementById('brand-switch');
  if (sw) sw.addEventListener('change', () => {
    if (!sw.value) return;
    if (sw.value === '__center') return go('#/');
    // Markadan markaya geçerken aynı alt sayfada kalınır (ör. takvimden takvime)
    const sub = brand ? (location.hash.replace(/^#\/m\/[^/]+/, '') || '') : '';
    go('#/m/' + sw.value + sub);
  });
}

export async function route() {
  const view = document.getElementById('view');
  let r = parseRoute();
  if (r.redirect) { location.replace(r.redirect); return; }
  // Tam ekran düzenleyiciden çıkınca normal yerleşime dönülür
  document.body.classList.remove('editor-mode');
  // Sayfa değişince önceki sayfadan kalan pencereler kapanır
  document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
  window.onbeforeunload = null;
  // Önceki sayfanın olay dinleyicileri temizlenir; her sayfa kendininkini atar
  view.onclick = view.oninput = view.onchange = view.onsubmit = view.onkeydown = null;
  window.scrollTo(0, 0);

  if (r.layer === 'brand' && !brandById(r.brandId)) await refreshBrands().catch(() => {});
  const brand = r.layer === 'brand' ? brandById(r.brandId) : null;
  state.workspaceBrandId = brand ? brand.id : null;
  applyBrandTheme(brand); // marka yoksa yönetim merkezinin sabit renkleri
  renderChrome();
  mountAssistant(brand, { page: r.page });

  try {
    if (r.layer === 'brand') {
      if (!brand) { view.innerHTML = emptyState({ icon: 'brands', title: 'Marka bulunamadı', text: 'Silinmiş olabilir.', action: '<a class="btn btn-sm" href="#/">Yönetim Merkezine dön</a>', card: true }); return; }
      selectBrand(brand.id).catch(() => {});
      if (r.page === 'home') await renderHome(view, brand);
      else if (r.page === 'kimlik') await renderBrandEditor(view, brand.id, r.tab);
      else if (r.page === 'kutuphane') await renderBrandEditor(view, brand.id, 'varliklar');
      else if (r.page === 'fikirler') await renderIdeas(view, brand);
      else if (r.page === 'takvim') await renderCalendar(view, { brand });
      else if (r.page === 'arsiv') await renderArchive(view, brand);
      else if (r.page === 'analiz') await renderAnalytics(view, { brand });
      else if (r.page === 'reels') await renderReels(view, brand, r.sub);
      else if (r.page === 'post') await renderPosts(view, brand, r.sub);
      else if (r.page === 'prompt') await renderPrompts(view, brand, r.sub);
      else if (r.page === 'hafiza') await renderMemory(view, brand);
      else if (r.page === 'rakipler') await renderCompetitors(view, brand);
      else if (r.page === 'disa') await renderExporter(view, brand);
      else if (r.page === 'video') await renderVideo(view, brand);
      else if (r.page === 'kampanya') await renderCampaigns(view, brand, r.sub);
      else if (r.page === 'rapor') await renderReport(view, brand);
      else view.innerHTML = emptyState({ icon: 'search', title: 'Sayfa bulunamadı', action: `<a class="btn btn-sm" href="#/m/${esc(brand.id)}">Marka ana sayfasına dön</a>`, card: true });
      return;
    }
    if (r.page === 'center') { await renderCenter(view); maybeStartTour(); }
    else if (r.page === 'brands') await renderBrands(view);
    else if (r.page === 'newBrand') await renderBrandEditor(view, 'yeni', 'profil');
    else if (r.page === 'calendar') await renderCalendar(view, {});
    else if (r.page === 'tasks') await renderTasks(view);
    else if (r.page === 'notes') await renderNotes(view);
    else if (r.page === 'trash') await renderTrash(view);
    else if (r.page === 'desk') await renderDesk(view);
    else if (r.page === 'analytics') await renderAnalytics(view, {});
    else if (r.page === 'settings') await renderSettings(view);
    else if (r.page === 'ai') await renderAi(view, r.tab);
    else view.innerHTML = emptyState({ icon: 'search', title: 'Sayfa bulunamadı', action: '<a class="btn btn-sm" href="#/">Yönetim Merkezine dön</a>', card: true });
  } catch (err) {
    view.innerHTML = errorBox(err);
  }
}

async function start() {
  initTheme();
  const view = document.getElementById('view');
  view.innerHTML = skeletonPage();
  // Bir sayfa yüklenemediyse "Tekrar dene" aynı sayfayı yeniden çizer
  view.addEventListener('click', e => { if (e.target.closest('[data-retry]')) route(); }, true);
  try {
    state.meta = await api.meta();
    await refreshBrands();
    showVersion();
  } catch (err) {
    view.innerHTML = errorBox(err);
    return;
  }
  window.addEventListener('hashchange', route);
  initPalette();
  initInspiration();
  initTrashUndo();
  initFx();
  // S.5: [data-mic] alanlarına mikrofon düğmesi (sayfa her çizildiğinde)
  // Gözlemci geri çağrısı mikro görevdir: alan, kullanıcı (ya da test) ona yazmadan önce sarılır; yazarken taşınıp odak kaybolmaz.
  if (dictationSupported) { new MutationObserver(() => enhanceMics(document)).observe(document.getElementById('view') || document.body, { childList: true, subtree: true }); }
  await route();
  showDailyOnce();
  startNotifier();
}

start();
