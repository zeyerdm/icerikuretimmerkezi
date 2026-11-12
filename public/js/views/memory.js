// Akıllı marka hafızası: yapay zekânın bu marka hakkında bildiği her şey tek yerde.
// Marka kimliğinin "Ses ve hafıza" sekmesi. Kimlik alanları (dil, kitle, renk, font) Profil sekmesinde düzenlenir; burada yasaklı kelimeler, tercih edilen ifadeler
// ve bilgi kartları yönetilir. Hepsi her AI üretimine (asistan, Reels, post, prompt, denetçi) otomatik girer.
import { api } from '../api.js';
import { esc, icon, toast, emptyState, openModal } from '../ui.js';
import { identityHead, bindIdentityActions } from './identity.js';

export async function renderMemory(view, brand) {
  view.onclick = view.onkeydown = null;
  let { memory, categories } = await api.memory(brand.id);

  const chips = (key, list, placeholder) => `
    <div class="chips mem-chips">${list.map((w, i) => `<span class="chip mem-chip">${esc(w)}<button type="button" data-chip-del="${key}" data-i="${i}" aria-label="${esc(w)} kaldır">×</button></span>`).join('') || '<span class="small muted">Henüz yok.</span>'}</div>
    <div class="row mt-2"><input class="input grow" data-chip-input="${key}" maxlength="${key === 'banned' ? 60 : 160}" placeholder="${esc(placeholder)}"><button type="button" class="btn btn-sm" data-chip-add="${key}">Ekle</button></div>`;

  function draw() {
    const byCat = Object.keys(categories).map(k => [k, memory.facts.filter(f => f.category === k)]).filter(([, l]) => l.length);
    view.innerHTML = `
      ${identityHead(brand, 'ses', `Yapay zekânın ${esc(brand.name)} hakkında bildikleri: kaçınılacak kelimeler, sevilen ifadeler ve bilgi kartları. Hepsi her üretime (asistan, Reels, post, prompt, denetçi) kendiliğinden eklenir.`)}
      <div class="grid-2 mb-5">
        <section class="card"><div class="card-head"><h3>Kullanılmaması gereken kelimeler</h3><span class="small muted">${memory.banned.length}</span></div>
          <p class="small muted mb-3">Üretimlerde kaçınılır; içerik denetçisi metinde geçerse "yüksek" uyarı verir.</p>
          ${chips('banned', memory.banned, 'Ör. ucuz, kampanya fırsatı, abla')}</section>
        <section class="card"><div class="card-head"><h3>Tercih edilen ifadeler</h3><span class="small muted">${memory.preferred.length}</span></div>
          <p class="small muted mb-3">Markanın imza cümleleri ve sevdiği kalıplar; uygun yerde kullanılır.</p>
          ${chips('preferred', memory.preferred, 'Ör. Kahven hazır, sen hazır mısın?')}</section>
      </div>
      <section class="card mb-5"><div class="card-head"><h3>Marka hakkında bilgiler</h3><button class="btn btn-sm btn-primary" data-fact-new>${icon('plus')}Bilgi ekle</button></div>
        <p class="small muted mb-3">Ürünler, fiyatlar, adres ve çalışma saatleri, kampanyalar, sık sorulanlar… Yapay zekâ bunları doğru kabul eder ve burada olmayan bilgileri uydurmaz. Asistana "bunu hatırla" diyerek de ekleyebilirsin.</p>
        ${byCat.length ? byCat.map(([k, list]) => `<h4 class="mem-cat">${esc(categories[k])}</h4><div class="mem-facts">${list.map(f => `
          <div class="mem-fact"><div class="grow"><div class="strong">${esc(f.title)}${f.source === 'assistant' ? ' <span class="tag">asistan</span>' : ''}</div><div class="small">${esc(f.content)}</div></div>
            <button class="btn btn-sm btn-ghost icon-btn" data-fact-edit="${esc(f.id)}" aria-label="Düzenle">${icon('edit')}</button><button class="btn btn-sm btn-ghost icon-btn" data-fact-del="${esc(f.id)}" aria-label="Sil">${icon('trash')}</button></div>`).join('')}</div>`).join('')
          : emptyState({ icon: 'notes', title: 'Henüz bilgi kartı yok', text: 'Ör. "Menü fiyatları: filtre kahve 85 TL, latte 110 TL" ya da "Adres: Kampüs girişi, B blok yanı; hafta içi 08:00–22:00".', compact: true })}
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
        <div class="field full"><label for="mf-content">Bilgi *</label><textarea class="textarea" id="mf-content" name="content" required maxlength="2000" rows="5" placeholder="Ör. Filtre kahve 85 TL, latte 110 TL, öğrenci kartıyla %10 indirim">${esc(f ? f.content : '')}</textarea></div></div>`,
      onSubmit: async fd => {
        const body = { category: fd.get('category'), title: fd.get('title'), content: fd.get('content') };
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
    const add = t.closest('[data-chip-add]');
    if (add) return addChip(add.dataset.chipAdd);
    const del = t.closest('[data-chip-del]');
    if (del) { const k = del.dataset.chipDel; const list = memory[k].slice(); list.splice(Number(del.dataset.i), 1); return saveLists({ [k]: list }); }
    if (t.closest('[data-fact-new]')) return factModal(null);
    const ed = t.closest('[data-fact-edit]');
    if (ed) return factModal(memory.facts.find(f => f.id === ed.dataset.factEdit));
    const fd = t.closest('[data-fact-del]');
    if (fd) {
      if (!confirm('Bu bilgi hafızadan silinsin mi?')) return;
      try { await api.deleteFact(brand.id, fd.dataset.factDel); memory = (await api.memory(brand.id)).memory; draw(); } catch (err) { toast(err.message, 'error'); }
    }
  };
  draw();
}
