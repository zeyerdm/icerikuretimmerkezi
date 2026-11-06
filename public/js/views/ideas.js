// Marka çalışma alanı: içerik fikir havuzu. Fikirler kategorilere ayrılır, favorilenir ve takvime aktarılır.
import { api } from '../api.js';
import { esc, icon, toast, timeAgo } from '../ui.js';
import { state } from '../app.js';
import { contentModal } from './forms.js';

const SOURCE = { assistant: 'AI asistanı', manual: 'Elle eklendi', demo: 'Örnek' };

export async function renderIdeas(view, brand) {
  let category = '';
  let favOnly = false;
  let ideas = [];
  const cats = state.meta.ideaCategories;

  async function draw() {
    ideas = (await api.ideas(brand.id, favOnly ? '?favorite=1' : '')).ideas;
    const list = category ? ideas.filter(i => i.category === category) : ideas;
    view.querySelector('#idea-filters').innerHTML =
      `<button class="chip ${!category ? 'active' : ''}" data-cat="">Tümü (${ideas.length})</button>` +
      Object.entries(cats).map(([k, v]) => { const n = ideas.filter(i => i.category === k).length; return n ? `<button class="chip ${category === k ? 'active' : ''}" data-cat="${k}">${esc(v)} (${n})</button>` : ''; }).join('') +
      `<label class="check" style="margin-left:auto"><input type="checkbox" id="fav-only" ${favOnly ? 'checked' : ''}> Yalnızca favoriler</label>`;
    view.querySelector('#idea-results').innerHTML = list.length ? `<div class="idea-grid">${list.map(i => `
      <article class="idea-card">
        <div class="ic-head"><span class="tag">${esc(i.categoryLabel)}</span>
          <button class="star ${i.favorite ? 'on' : ''}" data-fav="${esc(i.id)}" aria-pressed="${i.favorite}" aria-label="${i.favorite ? 'Favoriden çıkar' : 'Favorilere ekle'}">★</button></div>
        <h4>${esc(i.title)}</h4>
        ${i.description ? `<p class="small muted">${esc(i.description)}</p>` : ''}
        <div class="ic-foot"><span class="small muted">${esc(SOURCE[i.source] || i.source)} · ${timeAgo(i.createdAt)}</span>
          <span class="row" style="gap:4px"><button class="btn btn-sm" data-plan="${esc(i.id)}">${icon('calendar')}Takvime ekle</button>
          <button class="btn btn-sm btn-ghost icon-btn" data-del="${esc(i.id)}" aria-label="Sil">${icon('trash')}</button></span></div>
      </article>`).join('')}</div>`
      : `<div class="card empty"><div class="em-icon">💡</div><h4>${ideas.length ? 'Bu filtrede fikir yok' : 'Fikir havuzu boş'}</h4><p>Yukarıdan fikir ekle ya da <a href="#/m/${esc(brand.id)}">marka ana sayfasındaki</a> AI asistanından fikir iste.</p></div>`;
    view.querySelector('#fav-only').addEventListener('change', e => { favOnly = e.target.checked; draw(); });
  }

  view.innerHTML = `
    <div class="page-head">
      <div><h1>İçerik fikirleri</h1><p class="muted">${esc(brand.name)} için kaydedilen fikirler. Beğendiğini favorile, hazır olduğunda takvime ekle.</p></div>
      <a class="btn" href="#/m/${esc(brand.id)}">✦ Asistandan fikir iste</a>
    </div>
    <form class="card quick-idea" id="quick-idea">
      <input class="input" name="title" placeholder="Yeni fikir başlığı" required maxlength="200" aria-label="Fikir başlığı">
      <select class="select" name="category" aria-label="Kategori">${Object.entries(cats).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <input class="input" name="description" placeholder="Kısa açıklama (isteğe bağlı)" maxlength="2000" aria-label="Açıklama">
      <button class="btn btn-primary" type="submit">${icon('plus')}Ekle</button>
    </form>
    <div class="filter-row" id="idea-filters"></div>
    <div id="idea-results"></div>`;

  view.querySelector('#quick-idea').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.createIdea(brand.id, { title: fd.get('title'), category: fd.get('category'), description: fd.get('description') });
      e.target.reset();
      toast('Fikir eklendi.', 'success');
      draw();
    } catch (err) { toast(err.message, 'error'); }
  });

  view.onclick = async e => {
    const cat = e.target.closest('[data-cat]');
    if (cat) { category = cat.dataset.cat; return draw(); }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const i = ideas.find(x => x.id === fav.dataset.fav);
      try { await api.updateIdea(brand.id, i.id, { favorite: !i.favorite }); draw(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const plan = e.target.closest('[data-plan]');
    if (plan) {
      const i = ideas.find(x => x.id === plan.dataset.plan);
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(12, 0, 0, 0);
      return contentModal({ brandId: brand.id, lockBrand: true, title: i.title, ideaId: i.id, date: tomorrow, onSaved: () => { toast('Takvime eklendi.', 'success'); } });
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!confirm('Bu fikir silinsin mi?')) return;
      try { await api.deleteIdea(brand.id, del.dataset.del); draw(); } catch (err) { toast(err.message, 'error'); }
    }
  };
  await draw();
}
