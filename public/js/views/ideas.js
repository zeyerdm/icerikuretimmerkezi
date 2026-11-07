// Marka çalışma alanı: içerik fikir havuzu. Fikirler kategorilere ayrılır, favorilenir ve takvime aktarılır.
import { api } from '../api.js';
import { esc, icon, toast, timeAgo, pageHead, emptyState, busy } from '../ui.js';
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
      `<label class="check ml-auto"><input type="checkbox" id="fav-only" ${favOnly ? 'checked' : ''}> Yalnızca favoriler</label>`;
    view.querySelector('#idea-results').innerHTML = list.length ? `<div class="idea-grid">${list.map(i => `
      <article class="idea-card">
        <div class="ic-head"><span class="tag">${esc(i.categoryLabel)}</span>
          <button class="star ${i.favorite ? 'on' : ''}" data-fav="${esc(i.id)}" aria-pressed="${i.favorite}" aria-label="${i.favorite ? 'Favoriden çıkar' : 'Favorilere ekle'}">★</button></div>
        <h4>${esc(i.title)}</h4>
        ${i.description ? `<p class="small muted">${esc(i.description)}</p>` : ''}
        <div class="ic-foot"><span class="small muted">${esc(SOURCE[i.source] || i.source)} · ${timeAgo(i.createdAt)}</span>
          <span class="row"><button class="btn btn-sm" data-plan="${esc(i.id)}">${icon('calendar')}Takvime ekle</button>
          <button class="btn btn-sm btn-ghost icon-btn" data-del="${esc(i.id)}" aria-label="Sil">${icon('trash')}</button></span></div>
      </article>`).join('')}</div>`
      : emptyState({ icon: 'idea', title: ideas.length ? 'Bu filtrede fikir yok' : 'Fikir havuzu boş', text: ideas.length ? 'Başka bir kategori seç ya da favori filtresini kaldır.' : `Yukarıdan fikir ekle ya da <a class="link" href="#/m/${esc(brand.id)}">marka ana sayfasındaki</a> AI asistanından fikir iste.`, card: true });
    view.querySelector('#fav-only').addEventListener('change', e => { favOnly = e.target.checked; draw(); });
  }

  view.innerHTML = `
    ${pageHead({
      title: 'İçerik fikirleri',
      desc: `${esc(brand.name)} için kaydedilen fikirler. Beğendiğini favorile, hazır olduğunda takvime ekle.`,
      actions: `<a class="btn btn-primary" href="#/m/${esc(brand.id)}">${icon('sparkle')}Asistandan fikir iste</a>`
    })}
    <form class="card quick-row" id="quick-idea">
      <input class="input" name="title" placeholder="Yeni fikir başlığı" required maxlength="200" aria-label="Fikir başlığı">
      <select class="select" name="category" aria-label="Kategori">${Object.entries(cats).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <input class="input" name="description" placeholder="Kısa açıklama (isteğe bağlı)" maxlength="2000" aria-label="Açıklama">
      <button class="btn" type="submit">${icon('plus')}Ekle</button>
    </form>
    <div class="filter-row" id="idea-filters"></div>
    <div id="idea-results"></div>`;

  view.querySelector('#quick-idea').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await busy(e.submitter, () => api.createIdea(brand.id, { title: fd.get('title'), category: fd.get('category'), description: fd.get('description') }));
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
