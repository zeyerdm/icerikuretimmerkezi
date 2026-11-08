// Reels: marka başına fikir havuzu, senaryolar, senaryo ayrıntısı (sahneler, Flow/Veo prompt'ları, başlık, altyazı,
// sürümler, dışa aktarma, telepromter). Her üretimde model seçilebilir; seçilmezse işin atanmış modeli çalışır.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, busy, openModal, errorNotice, timeAgo } from '../ui.js';
import { state, go } from '../app.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';
import { drawTitle, ensureTitleFonts, titleBlob, downloadBlob, safeName } from '../titlePng.js';
import { reviewBox } from './review.js';

const fmt = s => { const v = Math.max(0, Number(s) || 0); const w = Math.floor(v); return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}${v - w >= 0.5 ? '.5' : ''}`; };
const base = brand => `#/m/${encodeURIComponent(brand.id)}/reels`;

async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg, 'success'); } catch { toast('Kopyalanamadı; metni seçip Ctrl+C ile kopyala.', 'error'); }
}

function tabs(brand, active) {
  return `<div class="tabs" role="tablist">${[['havuz', 'Fikir havuzu', base(brand)], ['liste', 'Senaryolar', base(brand) + '/liste'], ['kaliplar', 'Kalıp arşivi', base(brand) + '/kaliplar']].map(([id, label, href]) =>
    `<button role="tab" data-href="${href}" class="${active === id ? 'active' : ''}" aria-selected="${active === id}">${label}</button>`).join('')}</div>`;
}

export async function renderReels(view, brand, sub) {
  view.onclick = null;
  const models = await aiModels();
  const aiReady = models.ov.providers.some(p => p.configured);
  if (sub && sub !== 'liste' && sub !== 'kaliplar') return renderDetail(view, brand, sub, models);
  const meta = state.meta.reels;
  const head = pageHead({
    title: 'Reels', desc: `${esc(brand.name)} için Reels fikir havuzu ve saniye saniye senaryolar. Senaryodan Flow/Veo prompt'u, başlık görseli ve altyazı çıkar.`,
    actions: `<button class="btn" data-settings>${icon('settings')}Reels ayarları</button>${aiReady ? `<button class="btn btn-primary" data-new>${icon('plus')}Yeni senaryo</button>` : ''}`
  });
  const notice = aiReady ? '' : `<div class="notice mb-4"><div><strong>AI bağlı değil.</strong> Fikirleri elle ekleyebilirsin; senaryo yazdırmak ve havuzu genişletmek için bir yapay zekâ sağlayıcısı bağla.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>`;
  if (sub === 'liste') return renderList(view, brand, models, head + notice + tabs(brand, 'liste'), meta, aiReady);
  if (sub === 'kaliplar') return renderPatterns(view, brand, models, head + notice + tabs(brand, 'kaliplar'), meta, aiReady);
  return renderPool(view, brand, models, head + notice + tabs(brand, 'havuz'), meta, aiReady);
}

// Reels ayarları: karakter adı, görsel stil, varsayılan başlık stili
async function settingsModal(brand, meta) {
  const { settings } = await api.reelsSettings(brand.id);
  openModal({
    title: 'Reels ayarları',
    submitLabel: 'Kaydet',
    body: `<div class="form-grid">
      <div class="field full"><label for="rs-char">Konuşan karakterin adı *</label><input class="input" id="rs-char" name="character" required maxlength="40" value="${esc(settings.character)}">
        <span class="hint">Senaryolarda kameraya konuşan karakter (ör. maskotun adı). Flow/Veo prompt'larında bu adla anılır; görünümü video aracında tanımlı olmalı.</span></div>
      <div class="field"><label for="rs-style">Görsel stil</label><select class="select" id="rs-style" name="style">${Object.entries(meta.styles).map(([k, v]) => `<option value="${k}" ${k === settings.style ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="rs-title">Varsayılan başlık stili</label><select class="select" id="rs-title" name="titleStyle">${Object.entries(meta.titleStyles).map(([k, v]) => `<option value="${k}" ${k === settings.titleStyle ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    </div>`,
    onSubmit: async fd => { await api.saveReelsSettings(brand.id, { character: fd.get('character'), style: fd.get('style'), titleStyle: fd.get('titleStyle') }); toast('Reels ayarları kaydedildi.', 'success'); }
  });
}

// Senaryo yazdırma penceresi (havuzdaki fikirden ya da serbest konudan)
async function scenarioModal(brand, models, meta, { poolItem = null, patternId = null } = {}) {
  let pats = [];
  try { pats = (await api.patterns(brand.id)).patterns; } catch { /* kalıp listesi gelmezse seçim gösterilmez */ }
  openModal({
    title: poolItem ? 'Fikirden senaryo yaz' : 'Yeni senaryo',
    submitLabel: 'Senaryoyu yaz',
    body: `<div class="form-grid">
      ${poolItem ? `<div class="field full"><span class="field-label">Fikir</span><p class="card-text">${esc(poolItem.text)}</p></div>`
        : '<div class="field full"><label for="sc-topic">Konu *</label><textarea class="textarea" id="sc-topic" name="topic" required maxlength="1000" placeholder="Ör. Sınav haftasında gece yarısı kahve kuyruğu"></textarea></div>'}
      <div class="field"><label for="sc-format">Format</label><select class="select" id="sc-format" name="format"><option value="">Otomatik (fikre en uygun)</option>${Object.entries(meta.formats).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="model-pick-modal">Model</label>${modelSelect(models, 'yazim', { id: 'model-pick-modal' })}</div>
      ${pats.length ? `<div class="field full"><label for="sc-pattern">Kalıp (isteğe bağlı)</label><select class="select" id="sc-pattern" name="patternId"><option value="">Seçme (favori kalıplar örnek olarak kullanılır)</option>${pats.map(p => `<option value="${esc(p.id)}" ${p.id === patternId ? 'selected' : ''}>${p.favorite ? '★ ' : ''}${esc(p.title)} · ${esc(p.hookTypeLabel)}</option>`).join('')}</select></div>` : ''}
      <p class="hint full">Özenli modeller uzun senaryoyu 1-2 dakikada yazabilir; düğmede geçen süre görünür.</p>
    </div>`,
    onSubmit: async (fd, form) => {
      const btn = form.querySelector('[type=submit]');
      const res = await busyTimer(btn, () => api.createReels(brand.id, { topic: fd.get('topic'), poolId: poolItem ? poolItem.id : null, format: fd.get('format') || null, patternId: fd.get('patternId') || null, model: fd.get('model-pick-modal') || form.querySelector('#model-pick-modal').value || null }));
      toast(aiNote(res.reels.ai), 'success', 6000);
      go(base(brand) + '/' + res.reels.id);
    }
  });
}

// ------------------------------------------------------------ Fikir havuzu
async function renderPool(view, brand, models, header, meta, aiReady) {
  let pool = (await api.reelsPool(brand.id)).pool;
  let filter = '';
  let showDisliked = false;
  let picked = null;
  const cats = meta.categories;

  function draw() {
    const visible = pool.filter(p => (!filter || p.category === filter) && (showDisliked || p.rating >= 0));
    view.innerHTML = `${header}
      <form class="card quick-row" id="pool-add">
        <input class="input" name="text" placeholder="Yeni Reels fikri (tek cümle)" maxlength="300" aria-label="Fikir">
        <select class="select" name="category" aria-label="Kategori">${Object.entries(cats).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
        <button class="btn" type="submit">${icon('plus')}Ekle</button>
      </form>
      <div class="toolbar">
        <div class="chips"><button class="chip ${!filter ? 'active' : ''}" data-cat="">Tümü (${pool.filter(p => p.rating >= 0).length})</button>${Object.entries(cats).map(([k, v]) => { const n = pool.filter(p => p.category === k && p.rating >= 0).length; return n ? `<button class="chip ${filter === k ? 'active' : ''}" data-cat="${k}">${esc(v)} (${n})</button>` : ''; }).join('')}</div>
        <label class="check ml-auto"><input type="checkbox" id="show-disliked" ${showDisliked ? 'checked' : ''}> Beğenilmeyenleri göster</label>
      </div>
      <section class="card mb-4">
        <div class="row-between" style="flex-wrap:wrap">
          <div class="row"><button class="btn" data-random ${visible.length ? '' : 'disabled'}>${icon('refresh')}Rastgele fikir seç</button>
            ${aiReady ? `<button class="btn" data-expand>${icon('sparkle')}Havuzu genişlet (${filter ? '5 fikir, bu kategoride' : '5 fikir'})</button>` : ''}</div>
          ${aiReady ? `<div class="row"><span class="small muted">Model:</span>${modelSelect(models, 'fikir', { id: 'pool-model' })}</div>` : ''}
        </div>
        ${picked ? `<div class="notice notice-info mt-3"><div><strong>Seçilen fikir:</strong> ${esc(picked.text)}</div>${aiReady ? `<button class="btn btn-sm btn-primary" data-write="${esc(picked.id)}">Senaryo yaz</button>` : ''}</div>` : ''}
      </section>
      ${visible.length ? `<section class="card"><ul class="pool-list">${visible.map(p => `
        <li class="pool-item ${p.rating < 0 ? 'is-disliked' : ''} ${picked && picked.id === p.id ? 'is-picked' : ''}" data-id="${esc(p.id)}">
          <div class="grow"><div class="strong">${esc(p.text)}</div><div class="row mt-1"><span class="tag">${esc(p.categoryLabel)}</span>${p.source === 'ai' ? '<span class="xsmall muted">AI</span>' : ''}${p.scenarioId ? '<span class="xsmall muted">· senaryosu var</span>' : ''}</div></div>
          <div class="row pool-actions">
            <button class="btn btn-sm btn-ghost icon-btn ${p.rating > 0 ? 'is-on' : ''}" data-rate="1" aria-pressed="${p.rating > 0}" aria-label="Beğen" title="Beğen: benzerleri örnek alınır">👍</button>
            <button class="btn btn-sm btn-ghost icon-btn ${p.rating < 0 ? 'is-on' : ''}" data-rate="-1" aria-pressed="${p.rating < 0}" aria-label="Beğenme" title="Beğenme: bu tarzda fikir önerilmez">👎</button>
            ${aiReady ? `<button class="btn btn-sm" data-similar>Benzer üret</button>` : ''}
            ${p.scenarioId ? `<a class="btn btn-sm" href="${base(brand)}/${esc(p.scenarioId)}">Senaryoyu aç</a>` : (aiReady ? `<button class="btn btn-sm btn-primary" data-write="${esc(p.id)}">Senaryo yaz</button>` : '')}
            <button class="btn btn-sm btn-ghost icon-btn" data-del aria-label="Sil">${icon('trash')}</button>
          </div></li>`).join('')}</ul></section>`
        : emptyState({ icon: 'film', title: pool.length ? 'Bu filtrede fikir yok' : 'Reels fikir havuzu boş', text: pool.length ? 'Başka bir kategori seç.' : 'Yukarıdan fikir ekle ya da AI ile havuzu genişlet. Beğendiğin fikirler sonraki önerilere örnek olur.', card: true })}`;

    view.querySelector('#pool-add').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!String(fd.get('text')).trim()) return e.target.text.focus();
      try { const { item } = await busy(e.submitter, () => api.addReelsPool(brand.id, { text: fd.get('text'), category: fd.get('category') })); pool.unshift(item); toast('Fikir eklendi.', 'success'); draw(); }
      catch (err) { toast(err.message, 'error'); }
    });
    view.querySelector('#show-disliked').addEventListener('change', e => { showDisliked = e.target.checked; draw(); });
  }

  view.onclick = async e => {
    const tab = e.target.closest('[data-href]');
    if (tab) return go(tab.dataset.href);
    if (e.target.closest('[data-settings]')) return settingsModal(brand, meta);
    if (e.target.closest('[data-new]')) return scenarioModal(brand, models, meta);
    const cat = e.target.closest('[data-cat]');
    if (cat) { filter = cat.dataset.cat; picked = null; return draw(); }
    if (e.target.closest('[data-random]')) {
      const list = pool.filter(p => (!filter || p.category === filter) && p.rating >= 0 && (!picked || p.id !== picked.id));
      picked = list[Math.floor(Math.random() * list.length)] || picked;
      return draw();
    }
    const model = () => (view.querySelector('#pool-model') || {}).value || null;
    const exp = e.target.closest('[data-expand]');
    if (exp) {
      try {
        const r = await busyTimer(exp, () => api.expandReelsPool(brand.id, { category: filter || null, model: model() }), 'Üretiyor');
        pool = r.added.concat(pool); toast(`${r.added.length} yeni fikir eklendi · ${aiNote(r.ai)}`, 'success', 5000); draw();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const write = e.target.closest('[data-write]');
    if (write) return scenarioModal(brand, models, meta, { poolItem: pool.find(p => p.id === write.dataset.write) });
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const item = pool.find(p => p.id === li.dataset.id);
    const rate = e.target.closest('[data-rate]');
    if (rate) {
      const v = Number(rate.dataset.rate);
      try { const { item: up } = await api.updateReelsPool(brand.id, item.id, { rating: item.rating === v ? 0 : v }); Object.assign(item, up); draw(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const sim = e.target.closest('[data-similar]');
    if (sim) {
      try {
        const r = await busyTimer(sim, () => api.expandReelsPool(brand.id, { similarTo: item.id, model: model() }), 'Üretiyor');
        pool = r.added.concat(pool); toast(`${r.added.length} benzer fikir eklendi.`, 'success'); draw();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('[data-del]')) {
      if (!confirm('Bu fikir silinsin mi?')) return;
      try { await api.deleteReelsPool(brand.id, item.id); pool = pool.filter(p => p.id !== item.id); if (picked && picked.id === item.id) picked = null; draw(); } catch (err) { toast(err.message, 'error'); }
    }
  };
  draw();
}

// ------------------------------------------------------------ Senaryo listesi
async function renderList(view, brand, models, header, meta, aiReady) {
  const { reels } = await api.reelsList(brand.id);
  view.innerHTML = `${header}
    ${reels.length ? `<section class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Senaryo</th><th>Format</th><th>Süre</th><th>Kalite</th><th>Durum</th><th>Güncellendi</th><th></th></tr></thead>
      <tbody>${reels.map(r => `<tr>
        <td><a class="link" href="${base(brand)}/${esc(r.id)}">${esc(r.title)}</a><div class="xsmall muted">${esc(r.screenTitle || '')}${r.modelLabel ? ` · ${esc(r.modelLabel)}` : ''}</div></td>
        <td class="nowrap">${esc(r.formatLabel)}</td><td class="nowrap">${r.totalSeconds} sn · ${r.sceneCount} sahne</td>
        <td class="nowrap">${r.issueCount ? `<span class="status-badge status-hazirlaniyor">${r.issueCount} uyarı</span>` : '<span class="status-badge status-tamamlandi">Sorun yok</span>'}</td>
        <td class="nowrap">${esc(r.statusLabel)}</td><td class="nowrap small muted">${timeAgo(r.updatedAt)}</td>
        <td class="row-actions"><a class="btn btn-sm" href="${base(brand)}/${esc(r.id)}">Aç</a></td></tr>`).join('')}</tbody></table></div></section>`
      : emptyState({ icon: 'film', title: 'Henüz senaryo yok', text: 'Fikir havuzundan bir fikir seçip "Senaryo yaz"a bas ya da serbest bir konu yaz.', action: aiReady ? `<button class="btn btn-primary" data-new>${icon('plus')}Yeni senaryo</button>` : '', card: true })}`;
  view.onclick = e => {
    const tab = e.target.closest('[data-href]');
    if (tab) return go(tab.dataset.href);
    if (e.target.closest('[data-settings]')) return settingsModal(brand, meta);
    if (e.target.closest('[data-new]')) return scenarioModal(brand, models, meta);
  };
}

// ------------------------------------------------------------ Kalıp arşivi
// Beğenilen/rakip/kendi Reels metnini yapıştır → giriş tipi, tema, akış, CTA ve neden işe yaradığı çıkarılır.
async function renderPatterns(view, brand, models, header, meta, aiReady) {
  let { patterns, sources } = await api.patterns(brand.id);
  const draw = () => {
    view.innerHTML = header + `
      ${aiReady ? `<section class="card mb-4"><div class="card-head"><h3>Kalıp çıkar</h3></div>
        <p class="small muted mb-3">Beğendiğin ya da rakip bir Reels'in konuşma metnini / altyazısını / açıklamasını ya da kendi tutan videonun metnini yapıştır. Yapısı (giriş, tema, akış, kapanış) çıkarılıp arşive kaydedilir; senaryo yazarken bu kalıbı seçebilirsin. Metin ve espriler kopyalanmaz.</p>
        <div class="field"><label for="pt-text">Metin *</label><textarea class="textarea" id="pt-text" rows="6" maxlength="8000" placeholder="Ör. 'Sınav sabahı kahve kuyruğunda bekleyen herkes aynı soruyu çalışıyorsa…' diye başlayan videonun konuşma metni"></textarea></div>
        <div class="form-grid mt-3">
          <div class="field"><label for="pt-src">Kaynak</label><select class="select" id="pt-src">${Object.entries(sources).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label for="pt-note">Kaynak notu</label><input class="input" id="pt-note" maxlength="200" placeholder="Ör. @hesapadi, video linki"></div>
          <div class="field"><label for="pt-model">Model</label>${modelSelect(models, 'fikir', { id: 'pt-model' })}</div>
        </div>
        <div class="row mt-3"><button class="btn btn-primary" data-pt-analyze>${icon('sparkle')}Kalıbı çıkar</button></div></section>` : ''}
      ${patterns.length ? `<div class="pattern-grid">${patterns.map(p => `
        <section class="card pattern-card">
          <div class="card-head"><h3>${p.favorite ? '★ ' : ''}${esc(p.title)}</h3><span class="tag">${esc(p.sourceLabel)}</span></div>
          ${p.sourceNote ? `<div class="xsmall muted mb-2">${esc(p.sourceNote)}</div>` : ''}
          <dl class="kv"><dt>Giriş (${esc(p.hookTypeLabel)})</dt><dd>${esc(p.hook)}</dd><dt>Tema</dt><dd>${esc(p.theme)}</dd>
            <dt>Akış</dt><dd><ol class="pattern-steps">${(p.structure || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol></dd>
            ${p.cta ? `<dt>Kapanış / CTA</dt><dd>${esc(p.cta)}</dd>` : ''}<dt>Neden işe yarıyor</dt><dd>${esc(p.why)}</dd>
            ${p.reuse ? `<dt>Uyarlama</dt><dd>${esc(p.reuse)}</dd>` : ''}${p.format || p.duration ? `<dt>Format</dt><dd>${esc([p.format, p.duration].filter(Boolean).join(' · '))}</dd>` : ''}</dl>
          <div class="row mt-3">${aiReady ? `<button class="btn btn-sm btn-primary" data-pt-use="${esc(p.id)}">Bu kalıpla senaryo yaz</button>` : ''}
            <button class="btn btn-sm" data-pt-fav="${esc(p.id)}">${p.favorite ? 'Favoriden çıkar' : '☆ Favori'}</button>
            <button class="btn btn-sm btn-ghost icon-btn" data-pt-del="${esc(p.id)}" aria-label="Sil">${icon('trash')}</button></div>
          <details class="disclosure"><summary>Kaynak metin</summary><div class="cmp-text">${esc(p.rawText)}</div></details>
        </section>`).join('')}</div>`
        : emptyState({ icon: 'film', title: 'Kalıp arşivi boş', text: 'Tutan Reels metinlerinden kalıp çıkardıkça burada birikir. Favori kalıplar senaryo yazarken kendiliğinden örnek alınır.', compact: true, card: true })}`;
  };
  draw();
  view.onclick = async e => {
    const tab = e.target.closest('[data-href]');
    if (tab) return go(tab.dataset.href);
    if (e.target.closest('[data-settings]')) return settingsModal(brand, meta);
    if (e.target.closest('[data-new]')) return scenarioModal(brand, models, meta);
    const an = e.target.closest('[data-pt-analyze]');
    if (an) {
      const t = view.querySelector('#pt-text').value.trim();
      if (t.length < 40) return toast('Biraz daha uzun bir metin yapıştır (en az birkaç cümle).', 'error');
      try {
        const { pattern } = await busyTimer(an, () => api.analyzePattern(brand.id, { text: t, sourceType: view.querySelector('#pt-src').value, sourceNote: view.querySelector('#pt-note').value, model: view.querySelector('#pt-model').value || null }), 'Çıkarıyor');
        toast(`Kalıp arşive eklendi: ${pattern.title} (${aiNote(pattern.ai)})`, 'success', 6000);
        patterns = (await api.patterns(brand.id)).patterns; draw();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const use = e.target.closest('[data-pt-use]');
    if (use) return scenarioModal(brand, models, meta, { patternId: use.dataset.ptUse });
    const fav = e.target.closest('[data-pt-fav]');
    if (fav) { const p = patterns.find(x => x.id === fav.dataset.ptFav); try { await api.savePattern(brand.id, p.id, { favorite: !p.favorite }); patterns = (await api.patterns(brand.id)).patterns; draw(); } catch (err) { toast(err.message, 'error'); } return; }
    const del = e.target.closest('[data-pt-del]');
    if (del) { if (!confirm('Bu kalıp arşivden silinsin mi?')) return; try { await api.deletePattern(brand.id, del.dataset.ptDel); patterns = (await api.patterns(brand.id)).patterns; draw(); } catch (err) { toast(err.message, 'error'); } }
  };
}

// ------------------------------------------------------------ Senaryo ayrıntısı
async function renderDetail(view, brand, id, models) {
  const meta = state.meta.reels;
  let r;
  try { r = (await api.reels(brand.id, id)).reels; } catch (err) { view.innerHTML = errorNotice(err); return; }
  const settings = (await api.reelsSettings(brand.id)).settings;
  const aiReady = models.ov.providers.some(p => p.configured);
  const driveReady = Boolean(state.settings && state.settings.drive && state.settings.drive.configured && brand.driveFolderId);
  let lastAi = null;
  let panel = 'ozet';

  function draw() {
    const d = r.data;
    let offset = 0;
    const panelBox = (k, title, inner) => `<div class="ed-pane" data-pane="${k}" ${panel === k ? '' : 'hidden'}><h3 class="ed-panel-title">${title}</h3>${inner}</div>`;
    let t0 = 0;
    const chips = d.scenes.map((sc, i) => { const a = t0; t0 += sc.duration; return `<button type="button" class="ed-scene-chip" data-goto="${i}"><b>Sahne ${i + 1}</b><span>${fmt(a)}–${fmt(t0)}</span></button>`; }).join('');
    view.innerHTML = `
      <div class="ed ed-doc-mode">
        <header class="ed-top">
          <a class="ed-top-btn" href="${base(brand)}/liste" title="Senaryolar">${icon('back')}<span>Senaryolar</span></a>
          <div class="ed-menu"><button type="button" class="ed-top-btn" data-menu="dosya" aria-haspopup="true">Dosya</button>
            <div class="ed-drop" data-drop="dosya" hidden>
              <div class="ed-drop-head"><b>${esc(r.title)}</b><span class="xsmall">${esc(meta.formats[d.format] || '')} · ${r.totalSeconds} saniye · ${d.scenes.length} sahne${r.modelLabel ? ` · ${esc(r.modelLabel)}` : ''}</span></div>
              <button type="button" data-rail="surumler">${icon('refresh')}Sürüm geçmişi</button>
              <button type="button" data-rail="yaz">${icon('sparkle')}Senaryoyu yeniden yaz</button>
              <hr><button type="button" class="danger" data-delete>${icon('trash')}Senaryoyu sil</button>
            </div></div>
          <select class="select w-auto ed-top-select" id="rs-status" aria-label="Durum">${Object.entries(meta.statuses).map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
          <span class="spacer"></span>
          <h1 class="ed-title" title="${esc(r.title)}">${esc(r.title)}</h1>
          ${r.content ? `<a class="ed-top-btn ed-save" href="#/m/${esc(brand.id)}/takvim">${icon('calendar')}Takvimde</a>` : `<button type="button" class="ed-top-btn ed-save" data-schedule>${icon('calendar')}Takvime ekle</button>`}
          <div class="ed-menu"><button type="button" class="ed-share" data-menu="disari" aria-haspopup="true">Dışa aktar</button>
            <div class="ed-drop right" data-drop="disari" hidden>
              <div class="ed-drop-head"><b>Senaryoyu dışa aktar</b></div>
              <div class="ed-share-grid">
                <button type="button" data-export="script">${icon('notes')}<span>Senaryoyu kopyala</span></button>
                <button type="button" data-export="txt">${icon('download')}<span>Senaryo metni indir (.txt)</span></button>
                <button type="button" data-export="srt" ${r.srt ? '' : 'disabled'}>${icon('download')}<span>Altyazı indir (.srt)</span></button>
                <button type="button" data-export="png">${icon('image')}<span>Başlık PNG'si indir</span></button>
                <button type="button" data-export="prompter">${icon('film')}<span>Telepromter</span></button>
                ${driveReady ? `<button type="button" data-drive="png">${icon('upload')}<span>Başlık PNG'si → Drive</span></button><button type="button" data-drive="srt" ${r.srt ? '' : 'disabled'}>${icon('upload')}<span>Altyazı → Drive</span></button><button type="button" data-drive="txt">${icon('upload')}<span>Senaryo → Drive</span></button>` : ''}
              </div>
            </div></div>
        </header>
        <div class="ed-body ${panel ? 'has-panel' : ''}">
          <nav class="ed-rail" aria-label="Araçlar">${[['ozet', 'Özet', 'notes'], ['yaz', 'Yeniden yaz', 'sparkle'], ['baslik', 'Başlık', 'edit'], ['aciklama', 'Açıklama', 'palette'], ['kalite', `Kalite${r.issues.length ? ` (${r.issues.length})` : ''}`, 'check'], ['surumler', 'Sürümler', 'refresh']].map(([k, label, ic]) => `<button type="button" class="${panel === k ? 'active' : ''}" data-rail="${k}" aria-pressed="${panel === k}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
          <aside class="ed-panel" ${panel ? '' : 'hidden'}>
            ${panelBox('ozet', 'Özet', `<dl class="kv">
              <dt>Konu</dt><dd>${esc(d.topic || '-')}</dd><dt>Asıl espri</dt><dd>${esc(d.punchline || '-')}</dd><dt>Neden paylaşılır</dt><dd>${esc(d.why || '-')}</dd>
              <dt>Görsel ortam</dt><dd>${esc(d.setting || '-')}</dd><dt>Müzik</dt><dd>${esc(d.music || '-')}</dd></dl>
              <h4 class="ed-sub">Final</h4><dl class="kv"><dt>Tamamlanma</dt><dd>${esc((d.ending || {}).resolution || '-')}</dd><dt>Kapanış</dt><dd>${esc((d.ending || {}).twist || '-')}</dd><dt>Son kare</dt><dd>${esc((d.ending || {}).lastFrame || '-')}${(d.ending || {}).loop ? ` · Döngü: ${esc(d.ending.loop)}` : ''}</dd></dl>`)}
            ${panelBox('yaz', 'Yeniden yaz', aiReady ? `<p class="small muted mb-2">Seçtiğin modelle; her yeniden yazma yeni bir sürüm olur.</p><div class="stack-sm">${modelSelect(models, 'yazim', { id: 'rg-model' })}<button class="btn btn-primary" data-regen>${icon('refresh')}Senaryoyu baştan yaz</button></div>
              <p class="hint mt-2">Tek bir sahneyi değiştirmek için sahnenin üstündeki "Bu sahneyi yeniden yaz"ı kullan; diğer sahneler korunur.</p>` : '<div class="notice"><div>AI bağlı değil.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>')}
            ${panelBox('baslik', 'Ekran başlığı', `<div class="field"><label for="rs-title">Başlık (en fazla 5 kelime)</label><input class="input" id="rs-title" value="${esc(d.screenTitle || '')}" maxlength="80"></div>
              <div class="form-grid mt-3"><div class="field"><label for="rs-key">Vurgulu kelime</label><input class="input" id="rs-key" value="${esc(d.titleKeyword || '')}" maxlength="40"></div>
              <div class="field"><label for="rs-tstyle">Stil</label><select class="select" id="rs-tstyle">${Object.entries(meta.titleStyles).map(([k, v]) => `<option value="${k}" ${k === d.titleStyle ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div></div>
              <div class="title-preview mt-3"><canvas id="title-canvas" aria-label="Başlık önizlemesi"></canvas></div>
              <p class="hint mt-2">Başlık Flow prompt'una yalnızca ilk sahnede girer. Bütün videoda aynı görünmesi için PNG'yi kurguda videonun üstüne koy.</p>`)}
            ${panelBox('aciklama', 'Açıklama ve hashtag', `<div class="field"><label for="rs-caption">Instagram açıklaması</label><textarea class="textarea" id="rs-caption" rows="8" maxlength="3000">${esc(d.caption || '')}</textarea></div>
              <div class="field mt-3"><label for="rs-tags">Hashtag'ler</label><input class="input" id="rs-tags" value="${esc((d.hashtags || []).join(' '))}" maxlength="400"></div><div id="rs-review" class="mt-3"></div>`)}
            ${panelBox('kalite', 'Kalite kontrolü', `<div class="reels-side">${r.issues.length ? `<span class="status-badge status-hazirlaniyor">${r.issues.length} uyarı</span><ul class="issue-list mt-2">${r.issues.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<span class="status-badge status-tamamlandi">Sorun yok</span><p class="card-text mt-2">Kodla denetlenen kurallar (zamanlama, konuşma süresi, süreklilik, çağrı, gerçek isim, başlık uzunluğu) sağlanıyor.</p>'}</div>`)}
            ${panelBox('surumler', `Sürümler <span class="small muted">${r.versions.length}</span>`, `<ul class="version-list">${r.versions.map((v, i) => `<li><div class="grow"><div class="small strong">${esc(v.note)}</div><div class="xsmall muted">${esc(new Date(v.createdAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}${v.modelLabel ? ` · ${esc(v.modelLabel)}` : ''}</div></div>
              ${i === 0 ? '<span class="xsmall muted">Şu anki</span>' : `<button class="btn btn-sm btn-ghost" data-restore="${esc(v.id)}">Geri dön</button>`}</li>`).join('')}</ul>`)}
            <button type="button" class="ed-collapse" data-rail-close aria-label="Paneli kapat">${icon('chevronLeft')}</button>
          </aside>
          <main class="ed-doc" id="ed-doc">
            <div class="ed-doc-inner">
              ${lastAi ? `<div class="notice notice-ok mb-4"><div>${esc(aiNote(lastAi))}</div></div>` : ''}
              ${d.scenes.map((sc, i) => { const from = offset; offset += sc.duration; const p = r.prompts[i]; return `
          <section class="card scene-card" data-scene="${i}">
            <div class="card-head"><h3>Sahne ${i + 1} <span class="muted small">· ${fmt(from)}–${fmt(offset)} · ${sc.duration} sn</span></h3>
              ${aiReady ? `<button class="btn btn-sm" data-regen-scene="${i}">${icon('refresh')}Bu sahneyi yeniden yaz</button>` : ''}</div>
            ${sc.start ? `<p class="small"><b>${i === 0 ? 'Başlangıç' : 'Önceki sahneden'}:</b> ${esc(sc.start)}</p>` : ''}
            <div class="table-wrap mt-2"><table class="table beats"><thead><tr><th>Zaman</th><th>Aksiyon</th><th>Kamera</th><th>Ses</th></tr></thead>
              <tbody>${(sc.beats || []).map(b => `<tr><td class="nowrap">${fmt(from + b.from)}–${fmt(from + b.to)}</td><td>${esc(b.action)}</td><td class="small">${esc(b.camera || '-')}</td><td class="small">${esc(b.sound || '-')}</td></tr>`).join('')}</tbody></table></div>
            <div class="field mt-3"><label for="line-${i}">${esc(settings.character)} konuşuyor ${sc.lineFrom != null ? `<span class="muted xsmall">(${fmt(from + sc.lineFrom)}–${fmt(from + sc.lineTo)})</span>` : ''}</label>
              <textarea class="textarea" id="line-${i}" data-line="${i}" rows="2" maxlength="400">${esc(sc.line)}</textarea></div>
            ${sc.endFrame ? `<p class="small mt-2"><b>Bitiş karesi:</b> ${esc(sc.endFrame)}</p>` : ''}
            <details class="disclosure"><summary>Sahne tarifi (Türkçe düzenle → İngilizceye çevir)${sc.enOutdated ? ' · <span class="status-badge status-hazirlaniyor">İngilizce güncel değil</span>' : ''}</summary>
              <div class="field mt-3"><label for="tr-${i}">Türkçe tarif</label><textarea class="textarea" id="tr-${i}" data-tr="${i}" rows="4" maxlength="3000">${esc(sc.flowSceneTr)}</textarea></div>
              <div class="row mt-2"><button class="btn btn-sm" data-save-tr="${i}">Kaydet${aiReady ? ' ve İngilizceye çevir' : ''}</button>${aiReady ? `${modelSelect(models, 'ceviri', { id: `tr-model-${i}` })}` : ''}</div>
              <div class="field mt-3"><span class="field-label">İngilizce tarif</span><div class="cmp-text">${esc(sc.flowScene)}</div></div>
            </details>
            <div class="row mt-3">
              <button class="btn btn-sm" data-copy="flowEn" data-i="${i}">${icon('notes')}Flow prompt'u (EN)</button>
              <button class="btn btn-sm btn-ghost" data-copy="flowTr" data-i="${i}">Türkçesi</button>
              <button class="btn btn-sm" data-copy="cleanEn" data-i="${i}">Yazısız video prompt'u (Veo)</button>
            </div>
            <details class="disclosure"><summary>Prompt önizlemesi</summary><div class="cmp-text">${esc(p.flowEn)}</div></details>
          </section>`; }).join('')}

            </div>
          </main>
        </div>
        <footer class="ed-bottom"><div class="ed-pages">${chips}</div><span class="spacer"></span><span class="small muted">${r.totalSeconds} sn · ${d.scenes.length} sahne</span></footer>
      </div>`;
    document.body.classList.add('editor-mode');
    drawPreview();
    reviewBox(view.querySelector('#rs-review'), brand, models, () => `${view.querySelector('#rs-caption').value}\n\n${view.querySelector('#rs-tags').value}`, 'caption',
      improved => { view.querySelector('#rs-caption').value = improved; saveFields(); });
  }

  async function drawPreview() {
    const c = view.querySelector('#title-canvas');
    if (!c) return;
    await ensureTitleFonts();
    drawTitle(c, { title: r.data.screenTitle, keyword: r.data.titleKeyword, style: r.data.titleStyle, colors: brand.colors });
  }

  const apply = (res, note) => { r = res.reels || res; lastAi = (res.reels && res.reels.ai) || res.ai || null; if (note) toast(note, 'success'); draw(); };
  async function saveFields() {
    try {
      apply(await api.updateReels(brand.id, r.id, { data: { caption: view.querySelector('#rs-caption').value, hashtags: view.querySelector('#rs-tags').value } }));
      toast('Açıklama kaydedildi.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  }

  view.onchange = async e => {
    const t = e.target;
    try {
      if (t.id === 'rs-status') { r = (await api.updateReels(brand.id, r.id, { status: t.value })).reels; toast('Durum güncellendi.', 'success'); return; }
      if (t.id === 'rs-caption' || t.id === 'rs-tags') return saveFields();
      if (['rs-title', 'rs-key', 'rs-tstyle'].includes(t.id)) {
        const res = await api.updateReels(brand.id, r.id, { data: { screenTitle: view.querySelector('#rs-title').value, titleKeyword: view.querySelector('#rs-key').value, titleStyle: view.querySelector('#rs-tstyle').value } });
        r = res.reels; lastAi = null; draw(); toast('Başlık güncellendi.', 'success'); return;
      }
      if (t.dataset.line != null) {
        const scenes = r.data.scenes.map(() => ({}));
        scenes[Number(t.dataset.line)] = { line: t.value };
        r = (await api.updateReels(brand.id, r.id, { data: { scenes } })).reels; lastAi = null; draw(); toast('Replik kaydedildi.', 'success');
      }
    } catch (err) { toast(err.message, 'error'); }
  };

  view.onclick = async e => {
    const menu = e.target.closest('[data-menu]');
    if (menu) { const dd = view.querySelector(`[data-drop="${menu.dataset.menu}"]`); const was = dd.hidden; view.querySelectorAll('[data-drop]').forEach(x => { x.hidden = true; }); dd.hidden = !was; return; }
    if (!e.target.closest('.ed-drop') || e.target.closest('button')) view.querySelectorAll('[data-drop]').forEach(x => { x.hidden = true; });
    const rail = e.target.closest('[data-rail]');
    if (rail || e.target.closest('[data-rail-close]')) {
      const k = rail ? rail.dataset.rail : panel;
      panel = panel === k && !rail?.closest('.ed-drop') ? null : k; // aynı araca tekrar tıklayınca kapanır
      view.querySelectorAll('.ed-rail [data-rail]').forEach(b => { b.classList.toggle('active', b.dataset.rail === panel); b.setAttribute('aria-pressed', String(b.dataset.rail === panel)); });
      view.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== panel; });
      view.querySelector('.ed-panel').hidden = !panel;
      view.querySelector('.ed-body').classList.toggle('has-panel', Boolean(panel));
      if (panel === 'baslik') drawPreview();
      return;
    }
    const go2 = e.target.closest('[data-goto]');
    if (go2) { const el = view.querySelector(`[data-scene="${go2.dataset.goto}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const model = sel => (view.querySelector(sel) || {}).value || null;
    const regen = e.target.closest('[data-regen]');
    if (regen) {
      try { apply(await busyTimer(regen, () => api.regenerateReels(brand.id, r.id, { model: model('#rg-model') }))); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const rs = e.target.closest('[data-regen-scene]');
    if (rs) {
      try { apply(await busyTimer(rs, () => api.regenerateReels(brand.id, r.id, { sceneIndex: Number(rs.dataset.regenScene), model: model('#rg-model') }))); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const tr = e.target.closest('[data-save-tr]');
    if (tr) {
      const i = Number(tr.dataset.saveTr);
      const scenes = r.data.scenes.map(() => ({}));
      scenes[i] = { flowSceneTr: view.querySelector(`#tr-${i}`).value };
      try {
        let res = await api.updateReels(brand.id, r.id, { data: { scenes } });
        if (aiReady && res.reels.data.scenes[i].enOutdated) res = await busyTimer(tr, () => api.translateReels(brand.id, r.id, { sceneIndex: i, to: 'en', model: model(`#tr-model-${i}`) }), 'Çeviriyor');
        apply(res, 'Sahne tarifi kaydedildi.');
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) return copy(r.prompts[Number(cp.dataset.i)][cp.dataset.copy], `Sahne ${Number(cp.dataset.i) + 1} prompt'u kopyalandı.`);
    const ex = e.target.closest('[data-export]');
    if (ex) {
      const name = safeName(r.title);
      if (ex.dataset.export === 'script') return copy(r.script, 'Senaryo kopyalandı.');
      if (ex.dataset.export === 'txt') return downloadBlob(new Blob([r.script], { type: 'text/plain;charset=utf-8' }), `${name}_senaryo.txt`);
      if (ex.dataset.export === 'srt') { downloadBlob(new Blob([r.srt], { type: 'text/plain;charset=utf-8' }), `${name}_altyazi.srt`); return toast('Altyazı indirildi. CapCut\'ta Metin → Altyazı içe aktar ile ekleyebilirsin.', 'success', 5000); }
      if (ex.dataset.export === 'png') return busy(ex, async () => downloadBlob(await titleBlob({ title: r.data.screenTitle, keyword: r.data.titleKeyword, style: r.data.titleStyle, colors: brand.colors }), `${name}_baslik.png`));
      if (ex.dataset.export === 'prompter') return teleprompter(r, settings);
    }
    const dr = e.target.closest('[data-drive]');
    if (dr) {
      const name = r.title;
      try {
        await busy(dr, async () => {
          if (dr.dataset.drive === 'png') await api.driveUpload(brand.id, await titleBlob({ title: r.data.screenTitle, keyword: r.data.titleKeyword, style: r.data.titleStyle, colors: brand.colors }), `${name} başlık`, 'image/png');
          if (dr.dataset.drive === 'srt') await api.driveUpload(brand.id, new Blob([r.srt]), `${name} altyazı`, 'application/x-subrip');
          if (dr.dataset.drive === 'txt') await api.driveUpload(brand.id, new Blob([r.script]), `${name} senaryo`, 'text/plain');
        });
        toast('Google Drive klasörüne gönderildi.', 'success');
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const restore = e.target.closest('[data-restore]');
    if (restore) {
      if (!confirm('Bu sürüme dönülsün mü? Şu anki hâl de geçmişte kalır, istersen ona da dönebilirsin.')) return;
      try { apply(await api.restoreReels(brand.id, r.id, restore.dataset.restore), 'Önceki sürüme dönüldü.'); lastAi = null; } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const sch = e.target.closest('[data-schedule]');
    if (sch) {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
      try { await busy(sch, () => api.scheduleReels(brand.id, r.id, d.toISOString())); r = (await api.reels(brand.id, r.id)).reels; toast('Takvime yarın 12:00 için eklendi; takvimden tarihini değiştirebilirsin.', 'success', 5000); draw(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('[data-delete]')) {
      if (!confirm(`"${r.title}" senaryosu ve bütün sürümleri silinsin mi?`)) return;
      try { await api.deleteReels(brand.id, r.id); toast('Senaryo silindi.', 'success'); go(base(brand) + '/liste'); } catch (err) { toast(err.message, 'error'); }
    }
  };
  draw();
}

// Telepromter: replikler büyük yazıyla, ayarlanabilir hızda kayar. Esc kapatır.
function teleprompter(r, settings) {
  const wrap = document.createElement('div');
  wrap.className = 'prompter';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Telepromter');
  wrap.innerHTML = `
    <div class="prompter-bar"><b>${esc(r.title)}</b><span class="spacer"></span>
      <label class="small">Hız <input type="range" id="pr-speed" min="10" max="120" value="40" aria-label="Kayma hızı"></label>
      <label class="small">Yazı <input type="range" id="pr-size" min="28" max="96" value="56" aria-label="Yazı boyutu"></label>
      <button class="btn btn-sm" id="pr-play">Başlat</button><button class="btn btn-sm" id="pr-close">Kapat (Esc)</button></div>
    <div class="prompter-body" id="pr-body"><div class="prompter-pad"></div>${r.data.scenes.map((sc, i) => `<p><span>Sahne ${i + 1}</span>${esc(sc.line || '—')}</p>`).join('')}<div class="prompter-pad"></div></div>`;
  document.body.appendChild(wrap);
  const body = wrap.querySelector('#pr-body');
  let playing = false;
  let last = 0;
  const step = t => {
    if (!wrap.isConnected) return;
    if (playing) { body.scrollTop += ((t - last) / 1000) * Number(wrap.querySelector('#pr-speed').value); }
    last = t;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); if (e.key === ' ') { e.preventDefault(); toggle(); } };
  const toggle = () => { playing = !playing; wrap.querySelector('#pr-play').textContent = playing ? 'Durdur' : 'Başlat'; };
  document.addEventListener('keydown', onKey);
  wrap.querySelector('#pr-play').addEventListener('click', toggle);
  wrap.querySelector('#pr-close').addEventListener('click', close);
  wrap.querySelector('#pr-size').addEventListener('input', e => body.style.fontSize = e.target.value + 'px');
  wrap.querySelector('#pr-play').focus();
}
