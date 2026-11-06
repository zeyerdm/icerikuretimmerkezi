// Marka yönetimi (yönetim merkezi katmanı): bütün markalar tek yerde; karta tıklayınca markanın çalışma alanı açılır
import { api } from '../api.js';
import { esc, icon, toast, brandAvatar, timeAgo } from '../ui.js';
import { go, openDemoBrand } from '../app.js';

// Marka kartı: logo, ad, kategori, kısa açıklama, renkler, son çalışma ve içerik üretim durumu
export function brandCard(b) {
  const colors = [b.colors.primary, ...(b.colors.secondary || [])].filter(Boolean);
  const pct = b.contentTotal ? Math.round((b.contentDone / b.contentTotal) * 100) : 0;
  return `
    <article class="card brand-card" data-open="${esc(b.id)}" tabindex="0" role="link" aria-label="${esc(b.name)} çalışma alanını aç">
      <div class="b-top">${brandAvatar(b, b.logoUrl, 'avatar-lg')}
        <div style="min-width:0;flex:1">
          <div class="b-name">${esc(b.name)}${b.isDemo ? ' <span class="pill" style="margin-left:4px">Örnek</span>' : ''}</div>
          ${b.sector ? `<span class="tag">${esc(b.sector)}</span>` : '<span class="small muted">Kategori belirtilmedi</span>'}
        </div>
        ${colors.length ? `<div class="b-colors">${colors.slice(0, 4).map(c => `<span style="background:${esc(c)}"></span>`).join('')}</div>` : ''}
      </div>
      <p class="b-desc">${esc(b.description || 'Henüz açıklama eklenmedi.')}</p>
      <div>
        <div class="row" style="justify-content:space-between"><span class="small muted">İçerik üretimi</span><span class="small"><b>${b.contentPending}</b> bekleyen · <b>${b.contentDone}</b> tamamlandı</span></div>
        <div class="progress" style="margin-top:6px"><span style="width:${pct}%"></span></div>
      </div>
      <div class="b-foot"><span class="small muted">Son çalışma: ${b.lastWorkedAt ? timeAgo(b.lastWorkedAt) : '—'}</span><span class="small muted">${b.ideaCount} fikir · kimlik %${b.completeness.percent}</span></div>
    </article>`;
}

export async function renderBrands(view) {
  view.innerHTML = '<div class="brand-grid">' + '<div class="card skeleton" style="height:220px"></div>'.repeat(3) + '</div>';
  const d = await api.dashboard();
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Markalar</h1><p class="muted">Her markanın kimliği, dosyaları, içerikleri ve takvimi birbirinden tamamen ayrı tutulur. Çalışmak istediğin markaya tıkla.</p></div>
      <div class="row">
        ${d.brands.some(b => b.isDemo) ? '' : '<button class="btn" data-demo>☕ Örnek marka ekle</button>'}
        <a class="btn btn-primary" href="#/marka/yeni">${icon('plus')}Yeni marka</a>
      </div>
    </div>
    <div class="brand-grid">
      ${d.brands.map(brandCard).join('')}
      <a class="card brand-new" href="#/marka/yeni"><div><div style="font-size:26px">＋</div>Yeni marka oluştur</div></a>
    </div>`;

  const open = id => go('#/m/' + id);
  view.onclick = async e => {
    const demo = e.target.closest('[data-demo]');
    if (demo) {
      demo.disabled = true;
      try { await openDemoBrand(); } catch (err) { toast(err.message, 'error'); demo.disabled = false; }
      return;
    }
    const card = e.target.closest('[data-open]');
    if (card) open(card.dataset.open);
  };
  view.onkeydown = e => {
    const card = e.target.closest && e.target.closest('[data-open]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(card.dataset.open); }
  };
}
