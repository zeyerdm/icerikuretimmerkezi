// Kişisel notlar (yönetim merkezi): hızlı not, kategori, markaya bağlama, sabitleme, arama
import { api } from '../api.js';
import { esc, icon, toast, timeAgo } from '../ui.js';
import { state } from '../app.js';
import { noteModal } from './forms.js';

export async function renderNotes(view) {
  const filter = { q: '', category: '', brandId: '' };
  let notes = [];
  let categories = [];

  const card = n => `
    <article class="note-card ${n.pinned ? 'pinned' : ''}">
      <div class="nc-head">
        <b>${esc(n.title || 'Başlıksız not')}</b>
        <button class="btn btn-ghost icon-btn pin-btn ${n.pinned ? 'on' : ''}" data-pin="${esc(n.id)}" aria-pressed="${n.pinned}" aria-label="${n.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}">${icon('pin')}</button>
      </div>
      <p class="nc-body">${esc(n.body)}</p>
      <div class="nc-foot">
        ${n.category ? `<span class="tag">${esc(n.category)}</span>` : ''}
        ${n.brandName ? `<span class="brand-dot"><i style="background:${esc(n.brandColor || '#999')}"></i>${esc(n.brandName)}</span>` : ''}
        <span class="small muted" style="margin-left:auto">${timeAgo(n.updatedAt)}</span>
        <button class="btn btn-ghost icon-btn" data-edit="${esc(n.id)}" aria-label="Düzenle">${icon('edit')}</button>
      </div>
    </article>`;

  async function draw() {
    const res = await api.notes(filter);
    notes = res.notes;
    categories = res.categories;
    const pinned = notes.filter(n => n.pinned);
    const rest = notes.filter(n => !n.pinned);
    const filtered = filter.q || filter.category || filter.brandId;
    view.querySelector('#note-results').innerHTML = notes.length ? `
      ${pinned.length ? `<h3 class="sec-label">📌 Sabitlenenler</h3><div class="note-grid">${pinned.map(card).join('')}</div>` : ''}
      ${rest.length ? `${pinned.length ? '<h3 class="sec-label">Diğer notlar</h3>' : ''}<div class="note-grid">${rest.map(card).join('')}</div>` : ''}`
      : `<div class="card empty"><div class="em-icon">📝</div><h4>${filtered ? 'Bu filtreye uyan not yok' : 'Henüz not yok'}</h4><p>${filtered ? 'Filtreleri temizleyip tekrar bak.' : 'Yukarıdaki alana yazıp hızlıca not alabilirsin.'}</p></div>`;
    view.querySelector('#note-cats').innerHTML = `<button class="chip ${!filter.category ? 'active' : ''}" data-cat="">Tümü</button>` +
      categories.map(c => `<button class="chip ${filter.category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    view.querySelector('#quick-cats').innerHTML = categories.map(c => `<option value="${esc(c)}">`).join('');
  }

  view.innerHTML = `
    <div class="page-head"><div><h1>Notlar</h1><p class="muted">Fikirlerin, toplantı notların, hatırlatmaların. Markaya bağlayabilir, sabitleyebilirsin.</p></div></div>
    <form class="card quick-note" id="quick-note">
      <input class="input" name="title" placeholder="Başlık (isteğe bağlı)" maxlength="120" aria-label="Not başlığı">
      <textarea class="textarea" name="body" placeholder="Hızlı not al…" maxlength="5000" required aria-label="Not"></textarea>
      <div class="row">
        <input class="input" name="category" placeholder="Kategori" maxlength="40" list="quick-cats" aria-label="Kategori" style="max-width:180px"><datalist id="quick-cats"></datalist>
        <select class="select" name="brandId" aria-label="İlgili marka" style="width:auto"><option value="">Markasız</option>${state.brands.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" name="pinned"> Sabitle</label>
        <span style="flex:1"></span>
        <button class="btn btn-primary" type="submit">Notu kaydet</button>
      </div>
    </form>
    <div class="filter-row">
      <input class="input" id="note-q" type="search" placeholder="Notlarda ara" aria-label="Notlarda ara" style="max-width:260px">
      <select class="select" id="note-brand" aria-label="Marka filtresi" style="width:auto"><option value="">Bütün markalar</option>${state.brands.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select>
      <div class="chips" id="note-cats"></div>
    </div>
    <div id="note-results"></div>`;

  view.querySelector('#quick-note').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.createNote({ title: fd.get('title'), body: fd.get('body'), category: fd.get('category'), brandId: fd.get('brandId') || null, pinned: fd.get('pinned') === 'on' });
      e.target.reset();
      toast('Not kaydedildi.', 'success');
      draw();
    } catch (err) { toast(err.message, 'error'); }
  });
  let timer;
  view.querySelector('#note-q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { filter.q = e.target.value.trim(); draw(); }, 250); });
  view.querySelector('#note-brand').addEventListener('change', e => { filter.brandId = e.target.value; draw(); });

  view.onclick = async e => {
    const cat = e.target.closest('[data-cat]');
    if (cat) { filter.category = cat.dataset.cat; return draw(); }
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      const n = notes.find(x => x.id === pin.dataset.pin);
      try { await api.updateNote(n.id, { pinned: !n.pinned }); draw(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) noteModal({ note: notes.find(x => x.id === ed.dataset.edit), categories, onSaved: draw });
  };

  await draw();
}
