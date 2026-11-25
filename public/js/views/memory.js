// Akıllı marka hafızası: yapay zekânın bu marka hakkında bildiği her şey tek yerde.
// Marka kimliğinin "Ses ve hafıza" sekmesi. Kimlik alanları (dil, kitle, renk, font) Profil sekmesinde düzenlenir; burada yasaklı kelimeler, tercih edilen ifadeler
// ve bilgi kartları yönetilir. Hepsi her AI üretimine (asistan, Reels, post, prompt, denetçi) otomatik girer.
import { api } from '../api.js';
import { esc, icon, toast, emptyState, openModal } from '../ui.js';
import { state } from '../app.js';
import { identityHead, bindIdentityActions } from './identity.js';

export async function renderMemory(view, brand) {
  view.onclick = view.onkeydown = null;
  let { memory, categories, layers = { sabit: 'Sabit bilgi', ogrenilen: 'Öğrenilen tercih', donemsel: 'Dönemsel bilgi' } } = await api.memory(brand.id);
  const fmtD = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  const chips = (key, list, placeholder) => `
    <div class="chips mem-chips">${list.map((w, i) => `<span class="chip mem-chip">${esc(w)}<button type="button" data-chip-del="${key}" data-i="${i}" aria-label="${esc(w)} kaldır">×</button></span>`).join('') || '<span class="small muted">Henüz yok.</span>'}</div>
    <div class="row mt-2"><input class="input grow" data-chip-input="${key}" maxlength="${key === 'banned' ? 60 : 160}" placeholder="${esc(placeholder)}"><button type="button" class="btn btn-sm" data-chip-add="${key}">Ekle</button></div>`;

  function draw() {
    const live = memory.facts.filter(f => f.status === 'onayli');
    const pending = memory.facts.filter(f => f.status === 'oneri');
    const archived = memory.facts.filter(f => f.status === 'arsiv');
    const validity = f => (f.validFrom || f.validTo ? `<span class="tag">${f.validFrom ? fmtD(f.validFrom) : '…'} – ${f.validTo ? fmtD(f.validTo) : '…'}</span>` : '');
    const factRow = f => `
          <div class="mem-fact"><div class="grow"><div class="strong">${esc(f.title)} ${f.source && f.source !== 'manual' ? `<span class="tag">${esc(f.sourceLabel || f.source)}</span>` : ''}${validity(f)}</div><div class="small">${esc(f.content)}</div></div>
            <button class="btn btn-sm btn-ghost icon-btn" data-fact-edit="${esc(f.id)}" aria-label="Düzenle" title="Düzenle">${icon('edit')}</button><button class="btn btn-sm btn-ghost icon-btn" data-fact-hist="${esc(f.id)}" aria-label="Geçmiş" title="Değişiklik geçmişi">${icon('refresh')}</button><button class="btn btn-sm btn-ghost icon-btn" data-fact-archive="${esc(f.id)}" aria-label="Arşivle" title="Arşivle (yapay zekâya gitmez, silinmez)">${icon('archive')}</button></div>`;
    const byLayer = Object.keys(layers).map(l => [l, live.filter(f => (f.layer || 'sabit') === l)]).filter(([, list]) => list.length);
    view.innerHTML = `
      ${identityHead(brand, 'ses', `Yapay zekânın ${esc(brand.name)} hakkında bildikleri: kaçınılacak kelimeler, sevilen ifadeler ve bilgi kartları. Onaylı ve geçerli olanlar her üretime (asistan, Reels, post, prompt, denetçi) kendiliğinden eklenir.`)}
      ${pending.length ? `<section class="card mb-5 mem-pending"><div class="card-head"><h3>Onay bekleyenler</h3><span class="pill pill-warn"><span class="dot"></span>${pending.length}</span></div>
        <p class="small muted mb-3">Web sitesinden ya da yapay zekâdan gelen bilgiler. Sen onaylamadan üretimlerde kullanılmaz; düzenleyip kaydedersen de onaylanmış olur.</p>
        ${pending.map(f => `<div class="mem-fact"><div class="grow"><div class="strong">${esc(f.title)} <span class="tag">${esc(f.sourceLabel || f.source)}</span> <span class="tag">güven: ${esc(f.confidenceLabel || f.confidence)}</span></div><div class="small">${esc(f.content)}</div>${f.conflictWith ? `<div class="xsmall mem-conflict">Çelişki: onaylı bilgide "${esc(f.conflictWith.content.slice(0, 140))}" yazıyor. Onaylarsan eskisi arşive geçer.</div>` : ''}</div>
          <button class="btn btn-sm btn-primary" data-fact-approve="${esc(f.id)}">${icon('check')}Onayla</button><button class="btn btn-sm btn-ghost" data-fact-edit="${esc(f.id)}">Düzenle</button><button class="btn btn-sm btn-ghost" data-fact-archive="${esc(f.id)}">Reddet</button></div>`).join('')}
      </section>` : ''}
      <div class="grid-2 mb-5">
        <section class="card"><div class="card-head"><h3>Kullanılmaması gereken kelimeler</h3><span class="small muted">${memory.banned.length}</span></div>
          <p class="small muted mb-3">Üretimlerde kaçınılır; içerik denetçisi metinde geçerse "yüksek" uyarı verir.</p>
          ${chips('banned', memory.banned, 'Diğer: ör. ucuz, kampanya fırsatı')}
          <div class="suggest mt-2" aria-label="Hazır seçenekler">${((state.meta.choices || {}).banned || []).filter(o => !memory.banned.includes(o)).map(o => `<button type="button" class="chip chip-sm" data-ban-add="${esc(o)}">+ ${esc(o)}</button>`).join('')}</div></section>
        <section class="card"><div class="card-head"><h3>Tercih edilen ifadeler</h3><span class="small muted">${memory.preferred.length}</span></div>
          <p class="small muted mb-3">Markanın imza cümleleri ve sevdiği kalıplar; uygun yerde kullanılır.</p>
          ${chips('preferred', memory.preferred, 'Ör. Kahven hazır, sen hazır mısın?')}
          <p class="xsmall muted mt-2">Kullanılmaması gereken kelimeler yalnız burada tutulur; kurulum, Prompt Studio, Reels ve içerik denetçisi buradakini kullanır.</p></section>
      </div>
      <section class="card mb-5"><div class="card-head"><h3>Marka hakkında bilgiler</h3><button class="btn btn-sm btn-primary" data-fact-new>${icon('plus')}Bilgi ekle</button></div>
        <p class="small muted mb-3">Üç katman: <b>sabit bilgi</b> (ürün, fiyat, adres, hikâye), <b>öğrenilen tercih</b> (işe yarayan kalıplar, tekrar eden düzeltmeler) ve <b>dönemsel bilgi</b> (kampanya, sezon; bitiş tarihi geçince kendiliğinden arşive geçer). Yapay zekâ bunları doğru kabul eder, burada olmayanı uydurmaz.</p>
        ${byLayer.length ? byLayer.map(([l, list]) => `<h4 class="mem-cat">${esc(layers[l])} <span class="muted xsmall">${list.length}</span></h4><div class="mem-facts">${list.map(factRow).join('')}</div>`).join('')
          : emptyState({ icon: 'notes', title: 'Henüz onaylı bilgi yok', text: 'Ör. "Menü fiyatları: filtre kahve 85 TL, latte 110 TL" ya da "Adres: Kampüs girişi, B blok yanı; hafta içi 08:00–22:00".', compact: true })}
        ${archived.length ? `<details class="disclosure mt-3"><summary>Arşiv (${archived.length}): yapay zekâya gitmez</summary><div class="mem-facts mt-2">${archived.map(f => `<div class="mem-fact is-archived"><div class="grow"><div class="strong">${esc(f.title)} ${validity(f)}</div><div class="small">${esc(f.content)}</div></div><button class="btn btn-sm btn-ghost" data-fact-restore="${esc(f.id)}">Geri al</button><button class="btn btn-sm btn-ghost icon-btn" data-fact-hist="${esc(f.id)}" aria-label="Geçmiş">${icon('refresh')}</button><button class="btn btn-sm btn-ghost icon-btn" data-fact-del="${esc(f.id)}" aria-label="Kalıcı sil">${icon('trash')}</button></div>`).join('')}</div></details>` : ''}
      </section>
      <section class="card"><div class="card-head"><h3>Yapay zekâya giden hafıza</h3><span class="small muted">Her üretimde isteme eklenen metin</span></div>
        <details class="disclosure"><summary>Metnin tamamını göster</summary><pre class="mem-preview">${esc(memory.preview)}</pre></details></section>`;
    bindIdentityActions(view, brand);
  }

  async function saveLists(body, msg) {
    try { memory = (await api.saveMemoryLists(brand.id, body)).memory; draw(); if (msg) toast(msg, 'success'); } catch (err) { toast(err.message, 'error'); }
  }
  function factModal(f) {
    openModal({
      title: f ? 'Bilgiyi düzenle' : 'Bilgi ekle', submitLabel: 'Kaydet',
      body: `<div class="form-grid">
        <div class="field"><label for="mf-cat">Kategori</label><select class="select" id="mf-cat" name="category">${Object.entries(categories).map(([k, v]) => `<option value="${k}" ${f && f.category === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="field"><label for="mf-title">Başlık *</label><input class="input" id="mf-title" name="title" required maxlength="120" value="${esc(f ? f.title : '')}" placeholder="Ör. Menü fiyatları"></div>
        <div class="field"><label for="mf-layer">Katman</label><select class="select" id="mf-layer" name="layer">${Object.entries(layers).map(([k, v]) => `<option value="${k}" ${(f ? f.layer : 'sabit') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="field"><span class="field-label">Geçerlilik (isteğe bağlı)</span><div class="row"><input class="input" type="date" name="validFrom" aria-label="Başlangıç" value="${esc(f && f.validFrom ? f.validFrom : '')}"><input class="input" type="date" name="validTo" aria-label="Bitiş" value="${esc(f && f.validTo ? f.validTo : '')}"></div></div>
        <div class="field full"><label for="mf-content">Bilgi *</label><textarea class="textarea" id="mf-content" name="content" required maxlength="2000" rows="5" placeholder="Ör. Filtre kahve 85 TL, latte 110 TL, öğrenci kartıyla %10 indirim">${esc(f ? f.content : '')}</textarea></div></div>`,
      onSubmit: async fd => {
        const body = { category: fd.get('category'), title: fd.get('title'), content: fd.get('content'), layer: fd.get('layer'), validFrom: fd.get('validFrom') || null, validTo: fd.get('validTo') || null };
        if (f) await api.saveFact(brand.id, f.id, body); else await api.addFact(brand.id, body);
        memory = (await api.memory(brand.id)).memory; draw();
        toast('Hafızaya kaydedildi.', 'success');
      }
    });
  }
  const addChip = key => {
    const inp = view.querySelector(`[data-chip-input="${key}"]`);
    const v = inp.value.trim();
    if (!v) return;
    saveLists({ [key]: memory[key].concat(v.split(',').map(x => x.trim()).filter(Boolean)) }, 'Kaydedildi.');
  };

  view.onkeydown = e => { const k = e.target.dataset && e.target.dataset.chipInput; if (k && e.key === 'Enter') { e.preventDefault(); addChip(k); } };
  view.onclick = async e => {
    const t = e.target;
    const ba = t.closest('[data-ban-add]');
    if (ba) return saveLists({ banned: memory.banned.concat(ba.dataset.banAdd) }, 'Eklendi.');
    const add = t.closest('[data-chip-add]');
    if (add) return addChip(add.dataset.chipAdd);
    const del = t.closest('[data-chip-del]');
    if (del) { const k = del.dataset.chipDel; const list = memory[k].slice(); list.splice(Number(del.dataset.i), 1); return saveLists({ [k]: list }); }
    if (t.closest('[data-fact-new]')) return factModal(null);
    const ed = t.closest('[data-fact-edit]');
    if (ed) return factModal(memory.facts.find(f => f.id === ed.dataset.factEdit));
    const ap = t.closest('[data-fact-approve]');
    if (ap) { try { await api.approveFact(brand.id, ap.dataset.factApprove); memory = (await api.memory(brand.id)).memory; draw(); toast('Onaylandı; artık üretimlerde kullanılıyor.', 'success'); } catch (err) { toast(err.message, 'error'); } return; }
    const ar = t.closest('[data-fact-archive]') || t.closest('[data-fact-restore]');
    if (ar) { try { await api.saveFact(brand.id, ar.dataset.factArchive || ar.dataset.factRestore, { status: ar.dataset.factArchive ? 'arsiv' : 'onayli' }); memory = (await api.memory(brand.id)).memory; draw(); } catch (err) { toast(err.message, 'error'); } return; }
    const hi = t.closest('[data-fact-hist]');
    if (hi) {
      const ACT = { eklendi: 'Eklendi', duzenlendi: 'Düzenlendi', onaylandi: 'Onaylandı', arsivlendi: 'Arşivlendi', oneriye_alindi: 'Öneriye alındı', sure_doldu: 'Süresi doldu, arşive geçti', yerine_gecildi: 'Yeni bilgiyle değiştirildi', silindi: 'Silindi' };
      try {
        const { history } = await api.factHistory(brand.id, hi.dataset.factHist);
        openModal({ title: 'Değişiklik geçmişi', submitLabel: 'Kapat', onSubmit: async () => {},
          body: history.length ? `<ul class="issue-list">${history.map(h => `<li><b>${esc(ACT[h.action] || h.action)}</b> <span class="xsmall muted">· ${esc(new Date(h.at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${esc(h.actor)}</span>${h.after && h.before && h.after.content !== h.before.content ? `<div class="small">Önce: ${esc(h.before.content.slice(0, 160))}<br>Sonra: ${esc(h.after.content.slice(0, 160))}</div>` : ''}</li>`).join('')}</ul>` : '<p class="small muted">Kayıt yok.</p>' });
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const fd = t.closest('[data-fact-del]');
    if (fd) {
      if (!confirm('Bu bilgi kalıcı olarak silinsin mi? (Arşivde kalması yeterliyse vazgeç)')) return;
      try { await api.deleteFact(brand.id, fd.dataset.factDel); memory = (await api.memory(brand.id)).memory; draw(); } catch (err) { toast(err.message, 'error'); }
    }
  };
  draw();
}
