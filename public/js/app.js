// Uygulama çekirdeği: ortak durum, yönlendirme, gezinme ve üst çubuk
import { api } from './api.js';
import { esc, icon, toast, brandAvatar, applyBrandTheme, errorBox } from './ui.js';
import { renderHome } from './views/home.js';
import { renderBrands } from './views/brands.js';
import { renderBrandEditor } from './views/brandEditor.js';
import { renderSettings } from './views/settings.js';

export const state = { meta: null, settings: null, brands: [], activeBrandId: null };

export function activeBrand() {
  return state.brands.find(b => b.id === state.activeBrandId) || null;
}

export async function refreshBrands() {
  const [{ brands }, settings] = await Promise.all([api.brands(), api.settings()]);
  state.brands = brands;
  state.settings = settings;
  state.activeBrandId = brands.some(b => b.id === settings.activeBrandId) ? settings.activeBrandId : (brands[0] ? brands[0].id : null);
  applyBrandTheme(activeBrand());
  renderChrome();
}

export async function selectBrand(brandId) {
  await api.setActiveBrand(brandId);
  state.activeBrandId = brandId;
  applyBrandTheme(activeBrand());
  renderChrome();
}

// Örnek markayı ekler (varsa açar) ve ana ekrana götürür
export async function openDemoBrand() {
  const { created } = await api.createDemoBrand();
  await refreshBrands();
  toast(created ? 'Örnek marka hazır. Ana ekrandaki rehberle keşfetmeye başla.' : 'Örnek marka zaten var, onu açtım.', 'success');
  go('#/');
}

export const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

const NAV = [
  { hash: '#/', label: 'Ana ekran', icon: 'home', match: h => h === '#/' || h === '' },
  { hash: '#/markalar', label: 'Markalar', icon: 'brands', match: h => h.startsWith('#/marka') },
  { hash: '#/ayarlar', label: 'Ayarlar', icon: 'settings', match: h => h.startsWith('#/ayarlar') }
];

export function renderChrome() {
  const hash = location.hash || '#/';
  document.getElementById('nav').innerHTML = NAV.map(n =>
    `<a href="${n.hash}" class="${n.match(hash) ? 'active' : ''}" aria-label="${n.label}" ${n.match(hash) ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a>`).join('');

  const brand = activeBrand();
  document.getElementById('side-brand').innerHTML = brand
    ? `<div class="side-brand">${brandAvatar(brand, brand.logoUrl)}<div><div class="name">${esc(brand.name)}</div><div class="sub">Kimlik %${brand.completeness.percent}</div></div></div>`
    : '';

  const ai = state.settings && state.settings.ai;
  const aiPill = ai && ai.configured
    ? `<a class="pill pill-ok" href="#/ayarlar" title="${esc(ai.providerLabel)} · ${esc(ai.model)}"><span class="dot"></span>AI bağlı</a>`
    : `<a class="pill pill-warn" href="#/ayarlar"><span class="dot"></span>AI bağlı değil</a>`;
  document.getElementById('topbar').innerHTML = `
    ${state.brands.length ? `
      <label class="small muted" for="brand-switch">Marka</label>
      <select id="brand-switch" class="select" style="width:auto;min-width:200px">
        ${state.brands.map(b => `<option value="${esc(b.id)}" ${b.id === state.activeBrandId ? 'selected' : ''}>${esc(b.name)}${b.isDemo ? ' (örnek)' : ''}</option>`).join('')}
      </select>
      <a class="btn btn-sm" href="#/marka/yeni">${icon('plus')}Yeni marka</a>` : ''}
    <div class="spacer"></div>
    ${aiPill}`;
  const sw = document.getElementById('brand-switch');
  if (sw) sw.addEventListener('change', async () => {
    try {
      await selectBrand(sw.value);
      // Marka değişince açık sayfa o markaya göre yeniden çizilir
      const m = location.hash.match(/^#\/marka\/([^/]+)$/);
      if (m && m[1] !== 'yeni') go('#/marka/' + sw.value); else route();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function route() {
  const hash = location.hash || '#/';
  const view = document.getElementById('view');
  renderChrome();
  window.scrollTo(0, 0);
  // Önceki sayfanın olay dinleyicileri temizlenir; her sayfa kendininkini atar
  view.onclick = view.oninput = view.onchange = null;
  try {
    let m;
    if (hash === '#/' || hash === '') await renderHome(view);
    else if (hash === '#/markalar') await renderBrands(view);
    else if ((m = hash.match(/^#\/marka\/([^/]+)(?:\/(profil|gorsel|varliklar))?$/))) await renderBrandEditor(view, m[1], m[2] || 'profil');
    else if (hash === '#/ayarlar') await renderSettings(view);
    else view.innerHTML = '<div class="card empty"><h4>Sayfa bulunamadı</h4><p><a href="#/">Ana ekrana dön</a></p></div>';
  } catch (err) {
    view.innerHTML = errorBox(err);
  }
}

async function start() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="skeleton" style="height:160px"></div>';
  try {
    state.meta = await api.meta();
    await refreshBrands();
  } catch (err) {
    view.innerHTML = errorBox(err);
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

start();
