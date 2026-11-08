// Prompt Studio: marka hafızasıyla prompt üretme, düzenleme, kopyalama, kaydetme; geliştirme işlemleri ve sürüm geçmişi.
// Her üretim/geliştirme düğmesinin yanında model seçici var; seçilmezse "Çeviri ve prompt" işine atanmış model çalışır.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, openModal, timeAgo } from '../ui.js';
import { state, go } from '../app.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';
import { imageBox } from './imageGen.js';

// Görsel üretilebilen prompt türleri (video ve metin türleri için görsel üretilmez)
const IMAGE_KINDS = { gorsel: '1:1', urun: '1:1', reklam: '4:5', post: '4:5' };

const base = brand => `#/m/${encodeURIComponent(brand.id)}/prompt`;
const when = iso => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg, 'success'); } catch { toast('Kopyalanamadı; metni seçip Ctrl+C ile kopyala.', 'error'); }
}

export async function renderPrompts(view, brand, sub) {
  view.onclick = view.oninput = view.onchange = null;
  const models = await aiModels();
  if (sub) return renderDetail(view, brand, sub, models);
  const aiReady = models.ov.providers.some(p => p.configured);
  const meta = state.meta.prompts;
  let kind = 'gorsel';
  let filter = '';
  let q = '';

  view.innerHTML = `
    ${pageHead({
      title: 'Prompt Studio', desc: `${esc(brand.name)} için görsel, video, Reels, metin, reklam, ürün fotoğrafı, maskot animasyonu ve post tasarımı prompt'ları. Marka kimliği her prompt'a otomatik eklenir.`,
      actions: `<button class="btn" data-manual>${icon('plus')}Elle prompt kaydet</button>`
    })}
    <section class="card mb-4">
      <div class="card-head"><h3>Yeni prompt</h3></div>
      <div class="chips mb-3" role="radiogroup" aria-label="Prompt türü">${Object.entries(meta.kinds).map(([k, v]) => `<button type="button" class="chip ${k === kind ? 'active' : ''}" role="radio" aria-checked="${k === kind}" data-kind="${k}">${esc(v.label)}</button>`).join('')}</div>
      <p class="small muted mb-3" id="ps-hint"></p>
      ${aiReady ? `
        <label class="sr-only" for="ps-brief">İstek</label>
        <textarea class="textarea" id="ps-brief" maxlength="2000" placeholder="Kısaca ne istediğini yaz. Ör. Maskotumuz sabah kampüste elinde kahveyle koşuyor, enerjik ve komik"></textarea>
        <div class="row mt-3"><button class="btn btn-primary" data-create>${icon('sparkle')}Prompt üret</button>${modelSelect(models, 'ceviri', { id: 'ps-model' })}</div>`
      : '<div class="notice"><div><strong>AI bağlı değil.</strong> Prompt üretmek ve geliştirmek için bir sağlayıcı bağla; o zamana kadar kendi prompt\'larını elle kaydedebilirsin.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>'}
    </section>
    <section class="card">
      <div class="card-head"><h3>Kayıtlı prompt'lar</h3>
        <input class="input w-auto" type="search" id="ps-q" placeholder="Ara" aria-label="Prompt ara"></div>
      <div class="chips mb-3" aria-label="Türe göre filtre"><button type="button" class="chip active" data-filter="">Tümü</button>${Object.entries(meta.kinds).map(([k, v]) => `<button type="button" class="chip" data-filter="${k}">${esc(v.label)}</button>`).join('')}</div>
      <div id="ps-list"></div>
    </section>`;

  const hint = () => {
    const k = meta.kinds[kind];
    view.querySelector('#ps-hint').textContent = `${k.hint}.${k.english ? ' Prompt İngilizce yazılır, Türkçesi yanında durur.' : ' Prompt Türkçe yazılır.'}`;
  };
  hint();

  async function loadList() {
    const box = view.querySelector('#ps-list');
    const { prompts } = await api.prompts(brand.id, { kind: filter, q });
    if (!box.isConnected) return;
    box.innerHTML = prompts.length ? `<ul class="pool-list">${prompts.map(p => `
      <li class="pool-item">
        <span class="status-badge">${esc(p.kindLabel)}</span>
        <a class="grow prompt-link" href="${base(brand)}/${esc(p.id)}"><div class="strong truncate">${p.favorite ? '★ ' : ''}${esc(p.title)}</div><div class="xsmall muted truncate">${esc(p.text.slice(0, 160))}</div></a>
        <span class="xsmall muted">${timeAgo(p.updatedAt)}</span>
        <button class="btn btn-sm btn-ghost" data-copy="${esc(p.id)}" title="Kopyala">Kopyala</button>
      </li>`).join('')}</ul>`
      : emptyState({ icon: 'wand', title: q || filter ? 'Eşleşen prompt yok' : 'Henüz prompt yok', text: q || filter ? 'Aramayı ya da filtreyi değiştir.' : 'Yukarıdan bir tür seçip kısaca ne istediğini yaz.', compact: true });
    box._prompts = prompts;
  }
  await loadList();

  let timer = null;
  view.oninput = e => {
    if (e.target.id === 'ps-q') { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); loadList(); }, 250); }
  };
  view.onclick = async e => {
    const k = e.target.closest('[data-kind]');
    if (k) {
      kind = k.dataset.kind;
      view.querySelectorAll('[data-kind]').forEach(b => { b.classList.toggle('active', b === k); b.setAttribute('aria-checked', String(b === k)); });
      return hint();
    }
    const f = e.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      view.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === f));
      return loadList();
    }
    const c = e.target.closest('[data-copy]');
    if (c) {
      const p = (view.querySelector('#ps-list')._prompts || []).find(x => x.id === c.dataset.copy);
      if (p) copy(p.text, 'Prompt kopyalandı.');
      return;
    }
    const create = e.target.closest('[data-create]');
    if (create) {
      const brief = view.querySelector('#ps-brief').value.trim();
      if (!brief) return toast('Önce ne istediğini kısaca yaz.', 'error');
      try {
        const { prompt } = await busyTimer(create, () => api.createPrompt(brand.id, { kind, brief, model: view.querySelector('#ps-model').value || null }));
        toast(aiNote(prompt.ai), 'success', 5000);
        go(base(brand) + '/' + prompt.id);
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('[data-manual]')) {
      openModal({
        title: 'Elle prompt kaydet', submitLabel: 'Kaydet',
        body: `<div class="form-grid">
          <div class="field"><label for="pm-kind">Tür</label><select class="select" id="pm-kind" name="kind">${Object.entries(meta.kinds).map(([k2, v]) => `<option value="${k2}" ${k2 === kind ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="pm-title">Başlık</label><input class="input" id="pm-title" name="title" maxlength="80"></div>
          <div class="field full"><label for="pm-text">Prompt *</label><textarea class="textarea" id="pm-text" name="text" required maxlength="8000" rows="6"></textarea></div>
        </div>`,
        onSubmit: async fd => {
          const { prompt } = await api.createPrompt(brand.id, { manual: true, kind: fd.get('kind'), title: fd.get('title'), text: fd.get('text') });
          toast('Prompt kaydedildi.', 'success');
          go(base(brand) + '/' + prompt.id);
        }
      });
    }
  };
}

async function renderDetail(view, brand, id, models) {
  const aiReady = models.ov.providers.some(p => p.configured);
  const meta = state.meta.prompts;
  let p = (await api.prompt(brand.id, id)).prompt;
  let lastAi = null;

  function draw() {
    view.innerHTML = `
      ${pageHead({ title: esc(p.title), desc: `${esc(p.kindLabel)} prompt'u${p.brief ? ` · İstek: ${esc(p.brief.slice(0, 140))}` : ''}`, actions: `<a class="btn btn-ghost" href="${base(brand)}">${icon('back')}Prompt'lar</a>` })}
      <div class="reels-layout">
        <div class="stack">
          <section class="card">
            <div class="field"><label for="pp-title">Başlık</label><input class="input" id="pp-title" maxlength="80" value="${esc(p.title)}"></div>
            <div class="field mt-3"><label for="pp-text">${p.english ? 'Prompt (İngilizce, üretim aracına bu verilir)' : 'Prompt'}</label>
              <textarea class="textarea prompt-text" id="pp-text" rows="9" maxlength="8000">${esc(p.text)}</textarea></div>
            ${p.english ? `<div class="field mt-3"><label for="pp-tr">Türkçesi (okumak için)</label><textarea class="textarea" id="pp-tr" rows="6" maxlength="8000">${esc(p.textTr)}</textarea></div>` : ''}
            <div class="row mt-3">
              <button class="btn btn-primary" data-save>Kaydet</button>
              <button class="btn" data-copy="text">${icon('notes')}Prompt'u kopyala</button>
              ${p.english ? '<button class="btn btn-ghost" data-copy="tr">Türkçesini kopyala</button>' : ''}
              <span class="xsmall muted" id="pp-note">${lastAi ? esc(aiNote(lastAi)) : p.modelLabel ? `Son yazan model: ${esc(p.modelLabel)}` : ''}</span>
            </div>
          </section>
          ${aiReady ? `
          <section class="card">
            <div class="card-head"><h3>Geliştir</h3>${modelSelect(models, 'ceviri', { id: 'pp-model' })}</div>
            <p class="small muted mb-3">Her işlem yeni bir sürüm oluşturur; beğenmezsen sağdaki geçmişten önceki sürüme dönebilirsin.</p>
            <div class="chips">${Object.entries(meta.actions).map(([k, v]) => `<button type="button" class="chip" data-improve="${k}">${esc(v)}</button>`).join('')}</div>
            <hr class="sep">
            <div class="field"><label for="pp-instr">Seçili bölümü yeniden yaz</label>
              <div class="row"><input class="input grow" id="pp-instr" maxlength="500" placeholder="Prompt'ta bir bölümü seç; nasıl değişsin? Ör. gece sahnesi olsun">
              <button class="btn" data-selected>Seçili bölümü yaz</button></div>
              <div class="xsmall muted mt-1">Önce yukarıdaki prompt kutusunda değiştirmek istediğin kısmı fareyle seç.</div></div>
            <div class="field mt-3"><label for="pp-brief">Girişi değiştir</label>
              <textarea class="textarea" id="pp-brief" rows="3" maxlength="2000" placeholder="Yeni isteği yaz; prompt baştan yazılır">${esc(p.brief)}</textarea>
              <div class="row mt-2"><button class="btn" data-rebrief>Yeni girişe göre yeniden yaz</button></div></div>
          </section>` : '<div class="notice"><div><strong>AI bağlı değil.</strong> Geliştirme işlemleri için bir sağlayıcı bağla. Elle düzenleyip kaydedebilirsin.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>'}
          ${IMAGE_KINDS[p.kind] ? `<section class="card"><div class="card-head"><h3>Bu prompt'la görsel üret</h3></div>
            <p class="small muted mb-3">Prompt kutusundaki metin seçtiğin görsel modeline gönderilir; sonuç kütüphaneye kaydedilir.</p><div id="pp-image"></div></section>` : ''}
        </div>
        <aside class="stack reels-side">
          <section class="card"><button class="btn w-full" data-fav>${p.favorite ? '★ Favorilerden çıkar' : '☆ Favorilere ekle'}</button></section>
          <section class="card">
            <div class="card-head"><h3>Sürümler</h3><span class="small muted">${p.versions.length}</span></div>
            <ul class="version-list">${p.versions.map((v, i) => `<li><div class="grow"><div class="small strong">${esc(v.note)}</div><div class="xsmall muted">${esc(when(v.createdAt))}${v.modelLabel ? ` · ${esc(v.modelLabel)}` : ''}</div></div>
              <button class="btn btn-sm btn-ghost" data-show="${esc(v.id)}">Göster</button>
              ${i === 0 ? '<span class="xsmall muted">Şu anki</span>' : `<button class="btn btn-sm btn-ghost" data-restore="${esc(v.id)}">Geri dön</button>`}</li>`).join('')}</ul>
          </section>
          <section class="card"><button class="btn btn-danger w-full" data-delete>${icon('trash')}Prompt'u sil</button></section>
        </aside>
      </div>`;
    if (IMAGE_KINDS[p.kind]) imageBox(view.querySelector('#pp-image'), brand, { getPrompt: () => val('#pp-text'), promptId: p.id, aspect: IMAGE_KINDS[p.kind] });
  }
  draw();

  const val = sel => { const el = view.querySelector(sel); return el ? el.value : null; };
  const dirty = () => val('#pp-text').trim() !== p.text || (p.english && val('#pp-tr').trim() !== p.textTr) || val('#pp-title').trim() !== p.title;
  async function save() {
    const body = { title: val('#pp-title'), text: val('#pp-text') };
    if (p.english) body.textTr = val('#pp-tr');
    p = (await api.savePrompt(brand.id, p.id, body)).prompt;
  }
  async function improve(btn, body) {
    try {
      if (dirty()) await save(); // elle yapılan değişiklik kaybolmasın: önce sürüm olarak kaydedilir
      const res = await busyTimer(btn, () => api.improvePrompt(brand.id, p.id, Object.assign({ model: val('#pp-model') || null }, body)));
      p = res.prompt;
      lastAi = p.ai;
      draw();
      toast(aiNote(p.ai), 'success', 5000);
    } catch (err) { toast(err.message, 'error'); }
  }

  view.onclick = async e => {
    const t = e.target;
    if (t.closest('[data-save]')) {
      try { await save(); lastAi = null; draw(); toast('Kaydedildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const c = t.closest('[data-copy]');
    if (c) return copy(c.dataset.copy === 'tr' ? val('#pp-tr') : val('#pp-text'), 'Kopyalandı.');
    const imp = t.closest('[data-improve]');
    if (imp) return improve(imp, { action: imp.dataset.improve });
    const selBtn = t.closest('[data-selected]');
    if (selBtn) {
      const ta = view.querySelector('#pp-text');
      const selection = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
      if (!selection) return toast('Önce prompt kutusunda değiştirmek istediğin bölümü seç.', 'error');
      return improve(selBtn, { action: 'secili', selection, instruction: val('#pp-instr') });
    }
    const rb = t.closest('[data-rebrief]');
    if (rb) {
      const brief = val('#pp-brief').trim();
      if (!brief) return toast('Yeni isteği yaz.', 'error');
      return improve(rb, { action: 'girdi', brief });
    }
    if (t.closest('[data-fav]')) {
      try { p = (await api.savePrompt(brand.id, p.id, { favorite: !p.favorite })).prompt; draw(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const show = t.closest('[data-show]');
    if (show) {
      try {
        const { version: v } = await api.promptVersion(brand.id, p.id, show.dataset.show);
        openModal({
          title: `${v.note} · ${when(v.createdAt)}`, submitLabel: 'Kopyala',
          body: `${v.brief ? `<p class="small muted">İstek: ${esc(v.brief)}</p>` : ''}<div class="cmp-text">${esc(v.text)}</div>${v.textTr ? `<div class="cmp-text mt-3">${esc(v.textTr)}</div>` : ''}`,
          onSubmit: async () => copy(v.text, 'Bu sürüm kopyalandı.')
        });
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const rs = t.closest('[data-restore]');
    if (rs) {
      if (!confirm('Bu sürüme dönülsün mü? Şu anki hâl de geçmişte kalır, istersen ona da dönebilirsin.')) return;
      try { p = (await api.restorePrompt(brand.id, p.id, rs.dataset.restore)).prompt; lastAi = null; draw(); toast('Önceki sürüme dönüldü.', 'success'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (t.closest('[data-delete]')) {
      if (!confirm('Bu prompt ve bütün sürümleri silinsin mi?')) return;
      try { await api.deletePrompt(brand.id, p.id); toast('Prompt silindi.', 'success'); go(base(brand)); } catch (err) { toast(err.message, 'error'); }
    }
  };
}
