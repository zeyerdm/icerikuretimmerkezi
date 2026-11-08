// Marka arşivi: markanın bütün içerikleri (planlanan, hazırlanan, tamamlanan, yayınlanan); süzme ve arama
import { api } from '../api.js';
import { esc, icon, fmtDate, timeStr, pageHead, emptyState } from '../ui.js';
import { state } from '../app.js';
import { contentModal } from './forms.js';

export async function renderArchive(view, brand) {
  const filter = { status: '', type: '', q: '' };
  let all = [];

  function drawList() {
    const q = filter.q.toLocaleLowerCase('tr-TR');
    const list = all.filter(c => (!filter.status || c.status === filter.status) && (!filter.type || c.type === filter.type) && (!q || c.title.toLocaleLowerCase('tr-TR').includes(q)));
    view.querySelector('#arch-count').textContent = `${list.length} içerik`;
    view.querySelector('#arch-list').innerHTML = list.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Tarih</th><th>Başlık</th><th>Tür</th><th>Durum</th><th></th></tr></thead>
        <tbody>${list.map(c => `<tr>
          <td class="nowrap">${c.scheduledAt ? `${esc(fmtDate(c.scheduledAt, { day: 'numeric', month: 'short', year: 'numeric' }))} <span class="muted">${timeStr(c.scheduledAt)}</span>` : '<span class="muted">Tarihsiz</span>'}</td>
          <td><b>${esc(c.title)}</b>${c.notes ? `<div class="small muted">${esc(c.notes.slice(0, 90))}</div>` : ''}${c.reelsId ? `<div><a class="link small" href="#/m/${esc(brand.id)}/reels/${esc(c.reelsId)}">Senaryoyu aç</a></div>` : ''}${c.postId ? `<div><a class="link small" href="#/m/${esc(brand.id)}/post/${esc(c.postId)}">Tasarımı aç</a></div>` : ''}</td>
          <td>${esc(c.typeLabel)}</td>
          <td><span class="status-badge status-${esc(c.status)}">${esc(c.statusLabel)}</span>${c.checklist && c.checklist.length ? `<div class="xsmall muted mt-1" title="Yapılacaklar">✓ ${c.checklist.filter(i => i.done).length}/${c.checklist.length}${c.caption ? ' · açıklama hazır' : ''}</div>` : ''}${c.rate != null ? `<div class="xsmall muted">etkileşim %${String(c.rate).replace('.', ',')}</div>` : ''}</td>
          <td><button class="btn btn-sm btn-ghost icon-btn" data-edit="${esc(c.id)}" aria-label="Düzenle">${icon('edit')}</button></td></tr>`).join('')}</tbody>
      </table></div>`
      : emptyState({ icon: all.length ? 'search' : 'archive', title: all.length ? 'Bu filtrede içerik yok' : 'Arşiv boş', text: all.length ? 'Aramayı ya da filtreleri değiştir.' : 'Takvimden ya da fikirlerden içerik planladıkça burada birikir.' });
  }

  async function load() {
    all = (await api.contents({ brandId: brand.id })).contents;
    drawList();
  }

  view.innerHTML = `
    ${pageHead({
      title: 'Arşiv',
      desc: `${esc(brand.name)} markasının bütün içerikleri: taslaklar, hazırlananlar, tamamlananlar ve yayınlananlar.`,
      actions: `<button class="btn btn-primary" data-new>${icon('plus')}İçerik planla</button>`
    })}
    <div class="toolbar">
      <input class="input w-md" type="search" id="arch-q" placeholder="Başlıkta ara" aria-label="Başlıkta ara">
      <select class="select w-auto" id="arch-status" aria-label="Durum"><option value="">Bütün durumlar</option>${Object.entries(state.meta.contentStatuses).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <select class="select w-auto" id="arch-type" aria-label="Tür"><option value="">Bütün türler</option>${Object.entries(state.meta.contentTypes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <span class="small muted ml-auto" id="arch-count"></span>
    </div>
    <section class="card" id="arch-list"></section>`;

  view.querySelector('#arch-q').addEventListener('input', e => { filter.q = e.target.value.trim(); drawList(); });
  view.querySelector('#arch-status').addEventListener('change', e => { filter.status = e.target.value; drawList(); });
  view.querySelector('#arch-type').addEventListener('change', e => { filter.type = e.target.value; drawList(); });
  view.onclick = e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return contentModal({ content: all.find(c => c.id === ed.dataset.edit), lockBrand: true, onSaved: load });
    if (e.target.closest('[data-new]')) {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
      contentModal({ brandId: brand.id, lockBrand: true, date: d, onSaved: load });
    }
  };
  await load();
}
