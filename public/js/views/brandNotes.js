// Markaya özel yönetici notları: kendi çalışma notların (eksikler, iş verene sorulacaklar, nereden başlayıp devam
// edeceğin) ve marka sahibinin sunum sonrası istek ve önerileri. Genel Notlar altyapısını (/api/notes) markaya ve
// kategoriye bağlı kullanır; marka kılavuzunda "Yönetici notları" bölümünde görünür.
import { api } from '../api.js';
import { esc, icon, toast } from '../ui.js';

export const NOTE_KINDS = {
  yonetici: { label: 'Çalışma notlarım', hint: 'Eksikler, iş verene sorulacaklar, nereden başlayıp nereden devam edeceğin…', placeholder: 'Ör. Logonun vektör dosyası eksik, iş verene sor. Önce Instagram şablonlarından başla.' },
  'marka-sahibi': { label: 'Marka sahibi istekleri', hint: 'Sunumdan sonra marka sahibinin istek ve önerileri; anında kaydet.', placeholder: 'Ör. Mavi tonu biraz daha koyu olsun; Reels\'lerde maskot daha çok görünsün.' }
};

export async function brandNotes(brandId) {
  const all = await Promise.all(Object.keys(NOTE_KINDS).map(k => api.notes({ brandId, category: k }).then(r => [k, r.notes.sort((a, b) => (a.pinned - b.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)))])));
  return Object.fromEntries(all);
}

const fmt = iso => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

export async function mountBrandNotes(el, brand) {
  if (!el) return;
  let notes;
  try { notes = await brandNotes(brand.id); } catch (err) { el.innerHTML = `<p class="small muted">${esc(err.message)}</p>`; return; }
  // Liste sınırsız uzamaz: açık notlardan ilk SHOW tanesi görünür, gerisi "+n not daha" ile açılır; yapılanlar ayrı ve kapalı
  const SHOW = 3;
  const open = el._bnOpen || (el._bnOpen = {});
  const item = n => `<li class="${n.pinned ? 'done' : ''}"><label class="bn-check" title="Yapıldı"><input type="checkbox" data-bn-done="${esc(n.id)}" ${n.pinned ? 'checked' : ''} aria-label="Yapıldı olarak işaretle"></label><p class="grow">${esc(n.body)}<span class="bn-date">${esc(fmt(n.createdAt))}</span></p><button type="button" class="btn btn-ghost icon-btn btn-sm" data-bn-del="${esc(n.id)}" aria-label="Notu sil">${icon('x')}</button></li>`;
  const col = k => {
    const todo = notes[k].filter(n => !n.pinned); const done = notes[k].filter(n => n.pinned);
    const all = open[k + ':todo']; const rest = todo.length - SHOW;
    return `<div class="bn-col" data-kind="${k}">
      <div class="row-between"><h4>${esc(NOTE_KINDS[k].label)}</h4><span class="xsmall muted">${todo.length ? `${todo.length} açık` : ''}${done.length ? ` · ${done.length} yapıldı` : ''}</span></div>
      <p class="xsmall muted">${esc(NOTE_KINDS[k].hint)}</p>
      <form class="bn-add" novalidate><textarea class="textarea" rows="1" maxlength="5000" aria-label="${esc(NOTE_KINDS[k].label)}: yeni not" placeholder="${esc(NOTE_KINDS[k].placeholder)}"></textarea><button type="submit" class="btn btn-sm">${icon('plus')}Ekle</button></form>
      <ul class="bn-list">${(all ? todo : todo.slice(0, SHOW)).map(item).join('') || (done.length ? '' : '<li class="bn-empty xsmall muted">Henüz not yok.</li>')}</ul>
      ${rest > 0 ? `<button type="button" class="bn-more" data-bn-toggle="${k}:todo">${all ? 'Daha az göster' : `+${rest} not daha`}</button>` : ''}
      ${done.length ? `<button type="button" class="bn-more" data-bn-toggle="${k}:done">${open[k + ':done'] ? 'Yapılanları gizle' : `Yapılanlar (${done.length})`}</button>${open[k + ':done'] ? `<ul class="bn-list bn-done">${done.map(item).join('')}</ul>` : ''}` : ''}
    </div>`;
  };
  el.innerHTML = `<section class="card mb-4 bn-card"><div class="card-head"><h3>Yönetici notları</h3><span class="xsmall muted">Marka kılavuzunda da yer alır</span></div>
    <div class="bn-grid">${Object.keys(NOTE_KINDS).map(col).join('')}</div></section>`;
  el.onsubmit = async e => {
    e.preventDefault();
    const form = e.target.closest('.bn-add'); if (!form) return;
    const ta = form.querySelector('textarea'); const body = ta.value.trim();
    if (!body) return ta.focus();
    try { await api.createNote({ brandId: brand.id, category: form.closest('[data-kind]').dataset.kind, body }); mountBrandNotes(el, brand); } catch (err) { toast(err.message, 'error'); }
  };
  // Enter ekler, Shift+Enter yeni satır; kutu yazdıkça uzar
  el.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.bn-add textarea')) { e.preventDefault(); e.target.form.requestSubmit(); } };
  el.oninput = e => { if (e.target.matches('.bn-add textarea')) { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; } };
  el.onchange = async e => {
    const id = e.target.dataset.bnDone; if (!id) return;
    // "Yapıldı" işareti notun sabitleme alanında tutulur (ayrı tablo gerekmez)
    try { await api.updateNote(id, { pinned: e.target.checked }); mountBrandNotes(el, brand); } catch (err) { toast(err.message, 'error'); }
  };
  el.onclick = async e => {
    const tg = e.target.closest('[data-bn-toggle]');
    if (tg) { open[tg.dataset.bnToggle] = !open[tg.dataset.bnToggle]; return mountBrandNotes(el, brand); }
    const b = e.target.closest('[data-bn-del]'); if (!b) return;
    if (!confirm('Bu not silinsin mi? (Çöp kutusundan geri alınabilir)')) return;
    try { await api.deleteNote(b.dataset.bnDel); mountBrandNotes(el, brand); } catch (err) { toast(err.message, 'error'); }
  };
}
