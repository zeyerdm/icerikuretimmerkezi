// Markalar: kayıtlı markalara hızlı erişim ve yeni marka
import { esc, icon, toast, brandAvatar } from '../ui.js';
import { state, selectBrand, go, openDemoBrand } from '../app.js';

export async function renderBrands(view) {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Markalar</h1><p class="muted">Her markanın kimliği, dosyaları ve içerikleri birbirinden tamamen ayrı tutulur.</p></div>
      <div class="row">
        ${state.brands.some(b => b.isDemo) ? '' : '<button class="btn" data-demo>☕ Örnek marka ekle</button>'}
        <a class="btn btn-primary" href="#/marka/yeni">${icon('plus')}Yeni marka</a>
      </div>
    </div>
    <div class="brand-grid">
      ${state.brands.map(b => {
        const colors = [b.colors.primary, ...b.colors.secondary].filter(Boolean);
        return `
        <article class="card brand-card ${b.id === state.activeBrandId ? 'is-active' : ''}">
          <div class="b-top">${brandAvatar(b, b.logoUrl, 'avatar-lg')}<div style="min-width:0"><div class="b-name">${esc(b.name)} ${b.isDemo ? '<span class="pill" style="margin-left:4px">Örnek</span>' : ''}</div><div class="small muted">${esc(b.sector || 'Sektör belirtilmedi')}</div></div></div>
          ${colors.length ? `<div class="swatches">${colors.map(c => `<span class="swatch" style="background:${esc(c)}"></span>`).join('')}</div>` : ''}
          <div><div class="row" style="justify-content:space-between"><span class="small muted">Dijital kimlik</span><span class="small" style="font-weight:700">%${b.completeness.percent}</span></div>
          <div class="progress" style="margin-top:6px"><span style="width:${b.completeness.percent}%"></span></div></div>
          <div class="row">
            <button class="btn btn-sm btn-primary" data-open="${esc(b.id)}">${b.id === state.activeBrandId ? 'Çalışmaya devam et' : 'Bu markayla çalış'}</button>
            <a class="btn btn-sm" href="#/marka/${esc(b.id)}">Kimliği düzenle</a>
          </div>
        </article>`;
      }).join('')}
      <a class="card brand-new" href="#/marka/yeni" style="text-decoration:none"><div><div style="font-size:26px">＋</div>Yeni marka oluştur</div></a>
    </div>`;

  view.onclick = async e => {
    const demo = e.target.closest('[data-demo]');
    if (demo) {
      demo.disabled = true;
      try { await openDemoBrand(); } catch (err) { toast(err.message, 'error'); demo.disabled = false; }
      return;
    }
    const open = e.target.closest('[data-open]');
    if (!open) return;
    try { await selectBrand(open.dataset.open); go('#/'); } catch (err) { toast(err.message, 'error'); }
  };
}
