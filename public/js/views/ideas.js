// Marka çalışma alanı: içerik havuzu (10.4–10.6). Fikirler türe (Reels, Post, YouTube, Hikâye, Genel) ve kategoriye ayrılır.
// Fikir işlemleri: benzerlerini üret (adetli), favori, kullanıldı, arşivle, sil; kullanılanları toplu arşivle ya da sil.
// Kullanılan fikir işaretli durur ve stüdyoların "rastgele fikir çek"ine girmez; çok benzer fikir eklenince uyarı çıkar.
import { api } from '../api.js';
import { esc, icon, toast, timeAgo, pageHead, emptyState, busy, openModal } from '../ui.js';
import { state } from '../app.js';
import { contentModal } from './forms.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';

const SOURCE = { assistant: 'AI asistanı', manual: 'Elle eklendi', demo: 'Örnek', benzer: 'Benzerinden üretildi' };
const STATUSES = [['aktif', 'Hepsi'], ['kullanilmamis', 'Kullanılmamış'], ['kullanildi', 'Kullanıldı'], ['arsiv', 'Arşiv']];
const PREF = 'ium.ideas.format';

export async function renderIdeas(view, brand) {
  const cats = state.meta.ideaCategories;
  const formats = state.meta.ideaFormats;
  let format = '';
  try { const v = sessionStorage.getItem(PREF); if (v === '' || formats[v]) format = v || ''; } catch { /* tercih yoksa Hepsi */ }
  let category = '';
  let status = 'aktif';
  let favOnly = false;
  let ideas = [];
  const aiReady = Boolean(state.settings && state.settings.ai && state.settings.ai.configured);

  async function draw() {
    const q = new URLSearchParams({ status });
    if (favOnly) q.set('favorite', '1');
    ideas = (await api.ideas(brand.id, '?' + q)).ideas;
    if (!view.isConnected) return;
    const byFormat = format ? ideas.filter(i => i.format === format) : ideas;
    const list = category ? byFormat.filter(i => i.category === category) : byFormat;
    view.querySelector('#idea-formats').innerHTML = `<button type="button" class="${!format ? 'active' : ''}" data-format="">Tümü <span class="muted">${ideas.length}</span></button>` +
      Object.entries(formats).map(([k, v]) => `<button type="button" class="${format === k ? 'active' : ''}" data-format="${k}">${esc(v)} <span class="muted">${ideas.filter(i => i.format === k).length}</span></button>`).join('');
    view.querySelector('#idea-filters').innerHTML =
      `<div class="seg" role="group" aria-label="Duruma göre">${STATUSES.map(([k, v]) => `<button type="button" class="${status === k ? 'active' : ''}" data-status="${k}">${v}</button>`).join('')}</div>` +
      `<button class="chip ${!category ? 'active' : ''}" data-cat="">Bütün kategoriler</button>` +
      Object.entries(cats).map(([k, v]) => { const n = byFormat.filter(i => i.category === k).length; return n ? `<button class="chip ${category === k ? 'active' : ''}" data-cat="${k}">${esc(v)} (${n})</button>` : ''; }).join('') +
      `<label class="check ml-auto"><input type="checkbox" id="fav-only" ${favOnly ? 'checked' : ''}> Yalnızca favoriler</label>` +
      (status === 'kullanildi' && list.length ? `<span class="row"><button type="button" class="btn btn-sm" data-bulk="arsivle">${icon('archive')}Kullanılanları arşivle</button><button type="button" class="btn btn-sm btn-ghost" data-bulk="sil">${icon('trash')}Kullanılanları sil</button></span>` : '');
    view.querySelector('#idea-results').innerHTML = list.length ? `<div class="idea-grid">${list.map(i => `
      <article class="idea-card${i.used ? ' is-used' : ''}${i.archived ? ' is-archived' : ''}">
        <div class="ic-head"><span class="row"><span class="tag">${esc(i.formatLabel)}</span><span class="tag tag-soft">${esc(i.categoryLabel)}</span>${i.used ? `<span class="pill pill-ok" title="${esc(i.usedInLabels.join(', '))}"><span class="dot"></span>Kullanıldı</span>` : ''}</span>
          <button class="star ${i.favorite ? 'on' : ''}" data-fav="${esc(i.id)}" aria-pressed="${i.favorite}" aria-label="${i.favorite ? 'Favoriden çıkar' : 'Favorilere ekle'}">★</button></div>
        <h4>${esc(i.title)}</h4>
        ${i.description ? `<p class="small muted">${esc(i.description)}</p>` : ''}
        ${i.used ? `<p class="xsmall muted">Kullanıldığı yer: ${esc(i.usedInLabels.join(', '))}</p>` : ''}
        <div class="ic-foot"><span class="small muted">${esc(SOURCE[i.source] || i.source)} · ${timeAgo(i.createdAt)}</span>
          <span class="row">
            ${i.archived ? '' : `<button class="btn btn-sm" data-plan="${esc(i.id)}">${icon('calendar')}Takvime ekle</button>`}
            <button class="btn btn-sm btn-ghost icon-btn" data-more="${esc(i.id)}" aria-label="Diğer işlemler" aria-haspopup="menu" title="Diğer işlemler">⋯</button>
          </span></div>
        <div class="idea-menu" data-menu="${esc(i.id)}" role="menu" hidden>
          ${aiReady ? `<button type="button" role="menuitem" data-similar="${esc(i.id)}">${icon('sparkle')}Benzerlerini üret…</button>` : ''}
          <button type="button" role="menuitem" data-used="${esc(i.id)}">${icon('check')}${i.used ? 'Kullanılmadı olarak işaretle' : 'Kullanıldı olarak işaretle'}</button>
          <button type="button" role="menuitem" data-archive="${esc(i.id)}">${icon('archive')}${i.archived ? 'Arşivden çıkar' : 'Arşivle'}</button>
          <label class="idea-menu-row" role="menuitem">Tür <select class="select input-sm" data-set-format="${esc(i.id)}">${Object.entries(formats).map(([k, v]) => `<option value="${k}" ${i.format === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <button type="button" role="menuitem" class="danger" data-del="${esc(i.id)}">${icon('trash')}Sil</button>
        </div>
      </article>`).join('')}</div>`
      : emptyState({ icon: 'idea', title: ideas.length ? 'Bu filtrede fikir yok' : (status === 'arsiv' ? 'Arşiv boş' : 'İçerik havuzu boş'), text: ideas.length ? 'Başka bir tür, durum ya da kategori seç.' : `Yukarıdan fikir ekle ya da <a class="link" href="#/m/${esc(brand.id)}">asistandan fikir iste</a>.`, card: true });
    view.querySelector('#fav-only').addEventListener('change', e => { favOnly = e.target.checked; draw(); });
  }

  view.innerHTML = `
    ${pageHead({
      title: 'İçerik fikirleri',
      desc: `${esc(brand.name)} içerik havuzu: bütün üretimin kaynağı. Fikirleri türüne göre ayır; Post stüdyosu, Prompt Studio ve Reels kendi türünden fikir çeker. Kullanılan fikir işaretlenir, tekrar seçilmez.`,
      actions: `<a class="btn btn-primary" href="#/m/${esc(brand.id)}">${icon('sparkle')}Asistandan fikir iste</a>`
    })}
    <nav class="tabs idea-formats" id="idea-formats" aria-label="Fikir türü"></nav>
    <form class="card quick-row" id="quick-idea">
      <input class="input" name="title" placeholder="Yeni fikir başlığı" required maxlength="200" aria-label="Fikir başlığı">
      <select class="select" name="format" aria-label="Tür">${Object.entries(formats).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <select class="select" name="category" aria-label="Kategori">${Object.entries(cats).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <input class="input" name="description" placeholder="Kısa açıklama (isteğe bağlı)" maxlength="2000" aria-label="Açıklama">
      <button class="btn" type="submit">${icon('plus')}Ekle</button>
    </form>
    <div class="filter-row" id="idea-filters"></div>
    <div id="idea-results"></div>`;

  const quick = view.querySelector('#quick-idea');
  const syncQuickFormat = () => { if (format) quick.format.value = format; };
  syncQuickFormat();
  quick.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { idea } = await busy(e.submitter, () => api.createIdea(brand.id, { title: fd.get('title'), format: fd.get('format'), category: fd.get('category'), description: fd.get('description') }));
      e.target.reset();
      syncQuickFormat();
      if (idea.similarTo) toast(`Fikir eklendi, ama çok benzer bir fikir zaten var: "${idea.similarTo.title}"${idea.similarTo.used ? ' (kullanılmış)' : ''}. Tekrar olmamasına dikkat et.`, 'info', 7000);
      else toast('Fikir eklendi.', 'success');
      draw();
    } catch (err) { toast(err.message, 'error'); }
  });

  const closeMenus = () => view.querySelectorAll('.idea-menu').forEach(m => { m.hidden = true; });
  const find = id => ideas.find(x => x.id === id);
  async function patch(id, body, msg) {
    try { await api.updateIdea(brand.id, id, body); if (msg) toast(msg, 'success'); draw(); } catch (err) { toast(err.message, 'error'); }
  }

  async function similarModal(i) {
    let models;
    try { models = await aiModels(); } catch (err) { return toast(err.message, 'error'); }
    openModal({
      title: 'Benzerlerini üret', submitLabel: 'Üret',
      body: `<p class="small muted mb-3">"${esc(i.title)}" fikrine benzeyen yeni ${esc(i.formatLabel)} fikirleri üretilir ve havuza eklenir. Var olanların aynısı ya da çok benzeri eklenmez.</p>
        <div class="form-grid"><div class="field"><label for="sim-n">Kaç tane?</label><select class="select" id="sim-n" name="count">${[1, 2, 3, 5, 8, 10].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label for="sim-model">Model</label>${modelSelect(models, 'fikir', { id: 'sim-model' })}</div></div>`,
      onSubmit: async (fd, form) => {
        const r = await busyTimer(form.querySelector('[type=submit]'), () => api.similarIdeas(brand.id, i.id, { count: Number(fd.get('count')), model: form.querySelector('#sim-model').value || null }), 'Üretiyor');
        toast(`${r.ideas.length} yeni fikir eklendi${r.skipped ? `, ${r.skipped} benzer fikir atlandı` : ''} (${aiNote(r.ai)}).`, r.ideas.length ? 'success' : 'info', 6000);
        draw();
      }
    });
  }

  view.onchange = e => {
    const f = e.target.closest('[data-set-format]');
    if (f) { closeMenus(); patch(f.dataset.setFormat, { format: f.value }, 'Tür değişti.'); }
  };
  view.onclick = async e => {
    const fm = e.target.closest('[data-format]');
    if (fm) { format = fm.dataset.format; category = ''; try { sessionStorage.setItem(PREF, format); } catch { /* yok */ } syncQuickFormat(); return draw(); }
    const st = e.target.closest('[data-status]');
    if (st) { status = st.dataset.status; return draw(); }
    const cat = e.target.closest('[data-cat]');
    if (cat) { category = cat.dataset.cat; return draw(); }
    const more = e.target.closest('[data-more]');
    if (more) {
      const m = view.querySelector(`[data-menu="${CSS.escape(more.dataset.more)}"]`);
      const open = m.hidden;
      closeMenus();
      m.hidden = !open;
      return;
    }
    if (!e.target.closest('.idea-menu')) closeMenus();
    const fav = e.target.closest('[data-fav]');
    if (fav) { const i = find(fav.dataset.fav); return patch(i.id, { favorite: !i.favorite }); }
    const sim = e.target.closest('[data-similar]');
    if (sim) { closeMenus(); return similarModal(find(sim.dataset.similar)); }
    const used = e.target.closest('[data-used]');
    if (used) { closeMenus(); const i = find(used.dataset.used); return patch(i.id, { used: !i.used }, i.used ? 'Kullanılmadı olarak işaretlendi.' : 'Kullanıldı olarak işaretlendi; rastgele seçimlere girmez.'); }
    const arc = e.target.closest('[data-archive]');
    if (arc) { closeMenus(); const i = find(arc.dataset.archive); return patch(i.id, { archived: !i.archived }, i.archived ? 'Arşivden çıkarıldı.' : 'Arşivlendi.'); }
    const bulk = e.target.closest('[data-bulk]');
    if (bulk) {
      const del = bulk.dataset.bulk === 'sil';
      if (!confirm(del ? 'Kullanılmış bütün fikirler kalıcı olarak silinsin mi? Bu geri alınamaz.' : 'Kullanılmış bütün fikirler arşive taşınsın mı?')) return;
      try { const r = await busy(bulk, () => api.bulkUsedIdeas(brand.id, bulk.dataset.bulk)); toast(`${r.changed} fikir ${del ? 'silindi' : 'arşivlendi'}.`, 'success'); draw(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const plan = e.target.closest('[data-plan]');
    if (plan) {
      const i = find(plan.dataset.plan);
      if (i.used && !confirm(`Bu fikir daha önce kullanıldı (${i.usedInLabels.join(', ')}). Yine de takvime eklensin mi?`)) return;
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(12, 0, 0, 0);
      return contentModal({ brandId: brand.id, lockBrand: true, title: i.title, ideaId: i.id, date: tomorrow, onSaved: () => { toast('Takvime eklendi. Fikir kullanıldı olarak işaretlendi.', 'success'); draw(); } });
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      closeMenus();
      if (!confirm('Bu fikir silinsin mi? Çöp kutusundan geri alabilirsin.')) return;
      try { await api.deleteIdea(brand.id, del.dataset.del); draw(); } catch (err) { toast(err.message, 'error'); }
    }
  };
  await draw();
}
