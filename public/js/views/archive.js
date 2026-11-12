// Marka arşivi: markanın bütün içerikleri (planlanan, hazırlanan, tamamlanan, yayınlanan); süzme ve arama
import { api } from '../api.js';
import { esc, icon, fmtDate, timeStr, pageHead, emptyState, openModal, toast } from '../ui.js';
import { state } from '../app.js';
import { contentModal } from './forms.js';

export async function renderArchive(view, brand) {
  const filter = { status: '', type: '', q: '' };
  let all = [];
  let truncated = false;
  // 8.9: büyük arşivde tablo 200'er satır çizilir ("Daha fazla göster")
  const PAGE = 200;
  let shown = PAGE;

  function drawList() {
    const q = filter.q.toLocaleLowerCase('tr-TR');
    const list = all.filter(c => (!filter.status || c.status === filter.status) && (!filter.type || c.type === filter.type) && (!q || c.title.toLocaleLowerCase('tr-TR').includes(q)));
    view.querySelector('#arch-count').textContent = `${list.length} içerik${truncated ? ' (en yeni 10.000)' : ''}`;
    const more = list.length - shown;
    view.querySelector('#arch-list').innerHTML = list.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Tarih</th><th>Başlık</th><th>Tür</th><th>Durum</th><th></th></tr></thead>
        <tbody>${list.slice(0, shown).map(c => `<tr>
          <td class="nowrap">${c.scheduledAt ? `${esc(fmtDate(c.scheduledAt, { day: 'numeric', month: 'short', year: 'numeric' }))} <span class="muted">${timeStr(c.scheduledAt)}</span>` : '<span class="muted">Tarihsiz</span>'}</td>
          <td><b>${esc(c.title)}</b>${c.notes ? `<div class="small muted">${esc(c.notes.slice(0, 90))}</div>` : ''}${c.reelsId ? `<div><a class="link small" href="#/m/${esc(brand.id)}/reels/${esc(c.reelsId)}">Senaryoyu aç</a></div>` : ''}${c.postId ? `<div><a class="link small" href="#/m/${esc(brand.id)}/post/${esc(c.postId)}">Tasarımı aç</a></div>` : ''}</td>
          <td>${esc(c.typeLabel)}</td>
          <td><span class="status-badge status-${esc(c.status)}">${esc(c.statusLabel)}</span>${c.checklist && c.checklist.length ? `<div class="xsmall muted mt-1" title="Yapılacaklar">✓ ${c.checklist.filter(i => i.done).length}/${c.checklist.length}${c.caption ? ' · açıklama hazır' : ''}</div>` : ''}${c.rate != null ? `<div class="xsmall muted">etkileşim %${String(c.rate).replace('.', ',')}</div>` : ''}</td>
          <td><button class="btn btn-sm btn-ghost icon-btn" data-edit="${esc(c.id)}" aria-label="Düzenle">${icon('edit')}</button></td></tr>`).join('')}</tbody>
      </table></div>${more > 0 ? `<div class="row mt-3"><button class="btn" data-more>Daha fazla göster (${more} kaldı)</button></div>` : ''}`
      : emptyState({ icon: all.length ? 'search' : 'archive', title: all.length ? 'Bu filtrede içerik yok' : 'Arşiv boş', text: all.length ? 'Aramayı ya da filtreleri değiştir.' : 'Takvimden ya da fikirlerden içerik planladıkça burada birikir.' });
  }

  async function load() {
    const r = await api.contents({ brandId: brand.id, limit: 10000 });
    all = r.contents;
    truncated = Boolean(r.truncated);
    drawList();
  }

  view.innerHTML = `
    ${pageHead({
      title: 'Arşiv',
      desc: `${esc(brand.name)} markasının bütün içerikleri: taslaklar, hazırlananlar, tamamlananlar ve yayınlananlar.`,
      actions: `<button class="btn" data-ig>${icon('upload')}Instagram sonuçlarını içe aktar</button><button class="btn btn-primary" data-new>${icon('plus')}İçerik planla</button>`
    })}
    <div class="toolbar">
      <input class="input w-md" type="search" id="arch-q" placeholder="Başlıkta ara" aria-label="Başlıkta ara">
      <select class="select w-auto" id="arch-status" aria-label="Durum"><option value="">Bütün durumlar</option>${Object.entries(state.meta.contentStatuses).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <select class="select w-auto" id="arch-type" aria-label="Tür"><option value="">Bütün türler</option>${Object.entries(state.meta.contentTypes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <span class="small muted ml-auto" id="arch-count"></span>
    </div>
    <section class="card" id="arch-list"></section>`;

  // Filtre değişince ilk sayfadan başlanır
  view.querySelector('#arch-q').addEventListener('input', e => { filter.q = e.target.value.trim(); shown = PAGE; drawList(); });
  view.querySelector('#arch-status').addEventListener('change', e => { filter.status = e.target.value; shown = PAGE; drawList(); });
  view.querySelector('#arch-type').addEventListener('change', e => { filter.type = e.target.value; shown = PAGE; drawList(); });
  view.onclick = e => {
    if (e.target.closest('[data-more]')) { shown += PAGE; return drawList(); }
    if (e.target.closest('[data-ig]')) return igImportModal(brand, load);
    const ed = e.target.closest('[data-edit]');
    if (ed) return contentModal({ content: all.find(c => c.id === ed.dataset.edit), lockBrand: true, onSaved: load });
    if (e.target.closest('[data-new]')) {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
      contentModal({ brandId: brand.id, lockBrand: true, date: d, onSaved: load });
    }
  };
  await load();
}

// 8.12 Instagram sonuçlarını içe aktarma: Meta İstatistikler CSV'si → ön izleme ve eşleştirme → onaylanınca metrikler yazılır
function igImportModal(brand, onDone) {
  const M = { views: 'Görüntüleme', reach: 'Erişim', likes: 'Beğeni', comments: 'Yorum', saves: 'Kaydetme', shares: 'Paylaşım', follows: 'Takip' };
  const day = iso => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  let items = [];
  const m = openModal({
    title: 'Instagram sonuçlarını içe aktar', submitLabel: 'Eşleşenleri kaydet',
    body: `<p class="small muted mb-3">Meta Business Suite ya da Instagram'da <b>İstatistikler → Dışa aktar</b> ile indirdiğin CSV dosyasını seç. Satırlar ${esc(brand.name)} takvimindeki içeriklerle yayın tarihi ve metne göre eşleştirilir; kaydetmeden önce kontrol edebilirsin.</p>
      <input class="input" type="file" id="ig-file" accept=".csv,text/csv">
      <div id="ig-preview" class="mt-3"></div>`,
    onSubmit: async () => {
      const chosen = [...m.form.querySelectorAll('[data-ig-row]')].map(sel => ({ contentId: sel.value, metrics: items[Number(sel.dataset.igRow)].metrics })).filter(x => x.contentId);
      if (!chosen.length) throw new Error('Kaydedilecek eşleşme yok; önce dosya seç ya da satırları bir içerikle eşleştir.');
      const r = await api.igImportApply(brand.id, chosen);
      toast(`${r.updated} içeriğe paylaşım sonuçları yazıldı.`, 'success');
      onDone && onDone();
    }
  });
  m.form.querySelector('#ig-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    const box = m.form.querySelector('#ig-preview');
    if (!f) return;
    box.innerHTML = '<div class="skeleton" style="height:80px"></div>';
    try {
      const p = await api.igImportPreview(brand.id, f);
      items = p.items;
      box.innerHTML = `<p class="small mb-2"><b>${p.matched}</b> / ${p.total} satır eşleşti. Tanınan sütunlar: ${esc(Object.values(p.columns).join(', '))}</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Yayın</th><th>Gönderi</th><th>Sonuç</th><th>İçerik</th></tr></thead><tbody>
        ${items.map((it, i) => `<tr><td class="nowrap">${esc(day(it.date))}</td><td class="small">${esc(it.caption.slice(0, 60) || '—')}</td>
          <td class="xsmall">${Object.entries(it.metrics).map(([k, v]) => `${esc(M[k] || k)} ${v.toLocaleString('tr-TR')}`).join(' · ')}</td>
          <td><select class="select input-sm" data-ig-row="${i}" aria-label="Eşleşen içerik"><option value="">Eşleştirme</option>${(it.match && !it.candidates.some(c => c.id === it.match.contentId) ? [{ id: it.match.contentId, title: it.match.title, scheduledAt: it.match.scheduledAt }] : []).concat(it.candidates).map(c => `<option value="${esc(c.id)}" ${it.match && it.match.contentId === c.id ? 'selected' : ''}>${esc(c.title.slice(0, 40))} · ${esc(day(c.scheduledAt))}</option>`).join('')}</select>
            ${it.match && it.match.confidence === 'dusuk' ? '<div class="xsmall cost-warn">Emin değilim; kontrol et</div>' : ''}${it.match && it.match.hasMetrics ? '<div class="xsmall muted">Var olan sonuçların üzerine yazılır</div>' : ''}</td></tr>`).join('')}
        </tbody></table></div>`;
    } catch (err) { box.innerHTML = `<div class="notice notice-error"><div>${esc(err.message)}</div></div>`; }
  });
}
