// Prompt Studio: marka hafızasıyla prompt üretme, düzenleme, kopyalama, kaydetme; geliştirme işlemleri ve sürüm geçmişi.
// Her üretim/geliştirme düğmesinin yanında model seçici var; seçilmezse "Metin yazımı" işine atanmış model çalışır.
import { api } from '../api.js';
import { openRecipes } from '../recipes.js';
import { esc, icon, toast, pageHead, emptyState, openModal, timeAgo, busy } from '../ui.js';
import { downloadBlob, safeName, titleBlob } from '../titlePng.js';
import { settingsModal as reelsSettingsModal } from './reels.js';
import { state, go } from '../app.js';
import { aiModels, modelSelect, busyTimer, streamBusy, aiNote, bindCostHint } from '../aiPicker.js';
import { imageBox, templateBox } from './imageGen.js';
import { feedbackButtons, handleFeedbackClick } from '../feedback.js';
import { RULE_EXAMPLES } from '../ruleExamples.js';
import { openRuleBuilder } from './ruleBuilder.js';
import { notifyDone, askPermissionOnce } from '../notify.js';

// Havuzdan fikir çekerken fikir türü, seçili prompt türünden çıkarılır (ikinci bir tür seçimi gerekmez)
const POOL_OF = { gorsel: 'post', post: 'post', urun: 'post', reklam: 'genel', metin: 'genel', video: 'reels', reels: 'reels', maskot: 'reels' };
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
  let kind = 'reels'; // Prompt Studio'nun ana odağı: Google Flow için Reels senaryosu
  const kindList = Object.entries(meta.kinds).sort(([a], [b]) => (b === 'reels') - (a === 'reels'));
  let filter = '';
  let q = '';
  let picked = null;      // havuzdan çekilen fikir
  const pickedSeen = [];  // aynı ziyarette tekrar çekilmesin
  let plan = null;        // Reels: onay bekleyen senaryo planı

  view.innerHTML = `
    ${pageHead({
      title: 'Prompt Studio', desc: `${esc(brand.name)} için Google Flow'da üretilecek Reels senaryoları: saniye saniye, sahne sahne, sabit şablona bağlı. Görsel, video, metin, reklam ve post prompt'ları da yazılır; marka kimliği her prompt'a otomatik eklenir.`,
      actions: `${aiReady ? `<button class="btn" data-bulk-reels title="Havuzdan birkaç Reels fikri seç; senaryoları arka planda yazılır, bitince haber verilir">${icon('grid')}Toplu Reels</button>` : ''}<button class="btn" data-builder>${icon('sparkle')}Şablon oluşturucu</button>
        <details class="menu-dd"><summary class="btn">${icon('notes')}Kütüphanem ▾</summary><div class="menu-dd-list" role="menu">
          <button type="button" role="menuitem" data-rules><b>Kural şablonlarım</b><span class="xsmall muted">Bu markanın uzun prompt iskeletleri</span></button>
          <button type="button" role="menuitem" data-recipes><b>Tariflerim</b><span class="xsmall muted">Kaydettiğin hazır prompt'lar; başka markadan da kopyalanır</span></button>
          <button type="button" role="menuitem" data-reels-settings><b>Reels ayarları</b><span class="xsmall muted">Konuşan karakterin adı, görsel stil, kapak yazısı stili</span></button>
          <button type="button" role="menuitem" data-manual><b>Elle prompt kaydet</b><span class="xsmall muted">Başka yerde yazdığın prompt'u buraya ekle</span></button>
        </div></details>`
    })}
    <section class="card mb-4">
      <div class="tabs mb-3" role="tablist" aria-label="Prompt Studio"><button type="button" role="tab" class="active" aria-selected="true" data-ps-tab="yeni">Yeni prompt</button><button type="button" role="tab" aria-selected="false" data-ps-tab="hizli">Hızlı görsel</button></div>
      <div id="ps-pane-hizli" hidden><p class="small muted mb-2">İki soruyla tek parça AI görseli: prompt yazılır, Prompt Studio'ya kaydedilir ve görsel üretilir. Görsel kütüphaneye "AI görseli" olarak düşer; Post stüdyosunda Yüklemeler ya da Zemin panelinden kullanabilirsin.</p><div id="ps-tpl"></div></div>
      <div id="ps-pane-yeni">
      <div class="ps-step">Ne için prompt?</div>
      <div class="chips mb-3" role="radiogroup" aria-label="Prompt türü">${kindList.map(([k, v]) => `<button type="button" class="chip ${k === kind ? 'active' : ''}" role="radio" aria-checked="${k === kind}" data-kind="${k}">${esc(v.label)}</button>`).join('')}</div>
      ${aiReady ? `
        <div class="ps-compose">
          <div class="ps-compose-top"><span class="small muted grow" id="ps-hint"></span>
            <button type="button" class="btn btn-sm" data-pick-idea id="ps-pick-btn" title="Fikir türü seçili prompt türünden gelir">${icon('idea')}Havuzdan fikir</button></div>
          <div class="ps-picked small" id="ps-picked" hidden></div>
          <label class="sr-only" for="ps-brief">İstek</label>
          <textarea class="textarea ps-brief" id="ps-brief" maxlength="2000" placeholder="Kısaca ne istediğini yaz. Ör. Maskotumuz sabah kampüste elinde kahveyle koşuyor, enerjik ve komik"></textarea>
          <div class="ps-compose-foot">${modelSelect(models, 'yazim', { id: 'ps-model' })}
            <select class="select w-auto" id="ps-scenes" aria-label="Sahne sayısı" title="Birbirinin devamı olan sahneler"><option value="0">Tek sahne</option>${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n} sahne</option>`).join('')}</select>
            <select class="select w-auto" id="ps-tool" aria-label="Hedef araç" title="Prompt bu araca uygun biçimde yazılır"></select>
            <select class="select w-auto" id="ps-rule" aria-label="Kural şablonu" title="Prompt bu şablonun yapısına birebir uyar"></select>
            <span class="spacer"></span><span class="xsmall muted cost-hint" id="ps-cost"></span>
            <button class="btn btn-primary" data-create>${icon('sparkle')}<span id="ps-create-label">Senaryo yaz</span></button></div>
        </div>
        <div id="ps-plan" class="mt-4"></div>
        <details class="ps-bs-dd mt-3"><summary class="small">${icon('grid')}Kararsız mısın? <b>Beyin fırtınası</b> ile aynı isteğe birkaç farklı konsept al</summary>
          <div class="row mt-2"><select class="select w-auto" id="bs-c" aria-label="Konsept sayısı">${[2, 3, 4, 5].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n} konsept</option>`).join('')}</select>
            <select class="select w-auto" id="bs-v" aria-label="Varyasyon sayısı">${[1, 2, 3].map(n => `<option value="${n}" ${n === 2 ? 'selected' : ''}>× ${n} varyasyon</option>`).join('')}</select>
            <button class="btn" data-brainstorm>${icon('grid')}Beyin fırtınası</button></div></details>
        <div id="ps-bs" class="mt-4"></div>`
      : '<div class="notice"><div><strong>AI bağlı değil.</strong> Prompt üretmek ve geliştirmek için bir sağlayıcı bağla; o zamana kadar kendi prompt\'larını elle kaydedebilirsin.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>'}
      </div>
    </section>
    <section class="card mb-4" id="ps-batch" hidden aria-live="polite"></section>
    <section class="card">
      <div class="card-head"><h3>Kayıtlı prompt'lar</h3>
        <input class="input w-auto" type="search" id="ps-q" placeholder="Ara" aria-label="Prompt ara"></div>
      <div class="chips mb-3" aria-label="Türe göre filtre"><button type="button" class="chip active" data-filter="">Tümü</button>${Object.entries(meta.kinds).map(([k, v]) => `<button type="button" class="chip" data-filter="${k}">${esc(v.label)}</button>`).join('')}</div>
      <div id="ps-list"></div>
    </section>`;
  // Hızlı görsel (eski adıyla hazır görsel şablonları): "Yeni prompt" kartında ikinci sekme
  templateBox(view.querySelector('#ps-tpl'), brand, () => loadList());

  // Kural şablonları: seçili türün şablonları; varsayılan olan önceden seçili
  let ruleList = [];
  async function loadRules() { try { ruleList = (await api.promptRules(brand.id)).rules; } catch { ruleList = []; } syncRules(); }
  function syncRules() {
    const sel = view.querySelector('#ps-rule');
    if (!sel) return;
    const mine = ruleList.filter(r => r.kind === kind);
    // Hazır Google Flow sahne şablonu: Reels'te kendi varsayılanın yoksa seçili gelir; video ve maskotta da seçilebilir
    const flowOk = ['reels', 'video', 'maskot'].includes(kind);
    sel.hidden = !mine.length && !flowOk;
    const def = mine.find(r => r.isDefault);
    const flowSel = kind === 'reels' && !def;
    sel.innerHTML = `<option value="none">Kural şablonu yok</option>${flowOk ? `<option value="hazir-flow" ${flowSel ? 'selected' : ''}>Şablon: Google Flow sahnesi (hazır)</option>` : ''}${mine.map(r => `<option value="${esc(r.id)}" ${def && def.id === r.id ? 'selected' : ''}>Şablon: ${esc(r.name)}${r.isDefault ? ' (varsayılan)' : ''}</option>`).join('')}`;
  }
  const hint = () => {
    syncRules();
    const k = meta.kinds[kind];
    const lb = view.querySelector('#ps-create-label');
    if (lb) lb.textContent = kind === 'reels' ? 'Senaryo yaz' : 'Prompt üret';
    if (kind !== 'reels' && plan) { plan = null; drawPlan(); }
    const hn = view.querySelector('#ps-hint');
    if (hn) hn.textContent = `${k.hint}.${k.english ? ' Prompt önce Türkçe yazılır; hazır olunca tek tıkla İngilizceye çevrilir.' : ' Prompt Türkçe yazılır.'}`;
    const ts = view.querySelector('#ps-tool');
    if (ts) {
      const tools = Object.entries(k.tools || {});
      ts.hidden = !tools.length;
      ts.innerHTML = `<option value="">Araç: genel</option>${tools.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}`;
    }
  };
  hint();
  loadRules();
  // 8.5 tahmini tutar (sahneli üretimde sahne sayısıyla; kalite kontrolü bir kez daha yazdırabilir)
  if (aiReady) bindCostHint(view.querySelector('#ps-cost'), models, () => { const n = Number(view.querySelector('#ps-scenes').value) || 1; return { task: 'yazim', ref: view.querySelector('#ps-model').value, job: 'prompt', times: n, suffix: n > 1 ? ` (${n} sahne)` : ' (eksik çıkarsa bir kez daha yazılır)' }; }, [view.querySelector('#ps-model'), view.querySelector('#ps-scenes')]);

  // Reels senaryo planı: önce espri, akış, süreler ve replikler (eski Reels bölümünün kuralları ve süre ölçümü);
  // replik ya da kapak yazısı düzenlenince plan yeniden ölçülür, onaylanınca Flow şablonuna dökülür.
  const fmt = v => String(v).replace('.', ',');
  const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
  function drawPlan(issues = null) {
    const box = view.querySelector('#ps-plan');
    if (!box) return;
    if (!plan) { box.innerHTML = ''; return; }
    if (issues) box._issues = issues;
    const iss = box._issues || [];
    const total = plan.scenes.reduce((n, sc) => n + sc.duration, 0);
    box.innerHTML = `<section class="ps-plan" aria-label="Senaryo planı">
      <div class="ps-plan-head"><div class="grow"><div class="xsmall muted">Senaryo planı · ${plan.scenes.length} sahne · ${fmt(total)} sn${total > 30 ? ' (hedef 30 sn civarı, üst sınır 40 sn)' : ''}</div><div class="strong">${esc(plan.title)}</div></div>
        <button type="button" class="btn btn-sm btn-ghost" data-plan-redo>${icon('refresh')}Yeniden yaz</button></div>
      <div class="form-grid mt-2"><div class="field"><label for="pl-punch">Asıl espri (son sahnede söylenir)</label><input class="input" id="pl-punch" data-pl="punchline" maxlength="300" value="${esc(plan.punchline || '')}"></div>
        <div class="field"><label for="pl-title">Kapak yazısı (yalnız 1. sahnede, en çok 5 kelime)</label><input class="input" id="pl-title" data-pl="screenTitle" maxlength="80" value="${esc(plan.screenTitle || '')}"></div></div>
      <div class="ps-plan-check ${iss.length ? 'warn' : 'ok'}" role="status">${iss.length ? `<b>Süre ve akış kontrolü: ${iss.length} uyarı</b><ul>${iss.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<b>Süre ve akış kontrolü: sorun yok ✓</b> <span class="xsmall">Replikler süreye sığıyor, saniyeler boşluksuz.</span>'}</div>
      <ol class="ps-plan-scenes">${plan.scenes.map((sc, i) => `<li class="ps-plan-scene">
        <div class="row-between"><b>Sahne ${i + 1}</b><span class="tag">${fmt(sc.duration)} sn</span></div>
        <ul class="ps-beats small">${(sc.beats || []).map(b => `<li><span class="muted">${fmt(b.from)}–${fmt(b.to)} sn</span> ${esc(b.action)}${b.camera ? ` <span class="muted">· ${esc(b.camera)}</span>` : ''}</li>`).join('')}</ul>
        <label class="xsmall muted" for="pl-line-${i}">Replik${sc.lineFrom != null ? ` · ${fmt(sc.lineFrom)}–${fmt(sc.lineTo)} sn` : ''} · ${words(sc.line)} kelime</label>
        <textarea class="textarea" id="pl-line-${i}" data-pl-line="${i}" rows="2" maxlength="400">${esc(sc.line || '')}</textarea>
      </li>`).join('')}</ol>
      <div class="ps-plan-foot"><span class="xsmall muted grow">Planı beğendiysen sahneler seçili şablona (${esc((view.querySelector('#ps-rule option:checked') || {}).textContent || 'şablonsuz')}) dökülür; replikler birebir kalır, kapak yazısı yalnız ilk sahnede.</span>
        <button type="button" class="btn btn-primary" data-plan-ok>${icon('sparkle')}Flow prompt'larına dönüştür</button></div>
    </section>`;
  }
  async function writePlan(btn, brief) {
    try {
      const r = await busyTimer(btn, () => api.reelsPlan(brand.id, { brief, scenes: Number((view.querySelector('#ps-scenes') || {}).value || 0) || 1, model: view.querySelector('#ps-model').value || null }), 'Senaryo yazıyor');
      plan = r.plan; drawPlan(r.issues);
      toast(aiNote(r.ai), 'success', 4000);
      const box = view.querySelector('#ps-plan'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { toast(err.message, 'error'); }
  }
  async function recheckPlan() {
    try { const r = await api.checkReelsPlan(brand.id, plan); plan = r.plan; drawPlan(r.issues); } catch (err) { toast(err.message, 'error'); }
  }

  // Toplu Reels: seçilen fikirlerin senaryo planı + Flow sahneleri arka planda yazılır; ilerleme burada, bitince bildirim
  let batchTimer = null; let batchBusy = false;
  async function drawBatch() {
    clearTimeout(batchTimer);
    const box = view.querySelector('#ps-batch');
    if (!box || !box.isConnected) return;
    let res; try { res = await api.genJobs(brand.id, '', 'reels'); } catch { return; }
    const bt = res.batches[0];
    if (!bt) { box.hidden = true; return; }
    const jobs = res.jobs.filter(j => j.batchId === bt.batchId);
    const active = bt.waiting || bt.working;
    const recent = Date.now() - new Date(bt.createdAt).getTime() < 6 * 3600000;
    box.hidden = !active && !recent;
    box.innerHTML = `<div class="card-head"><h3>Toplu Reels · ${bt.done}/${bt.total} hazır${bt.failed ? ` · ${bt.failed} hata` : ''}</h3>${active ? '<span class="small muted">Arka planda yazılıyor; başka sayfaya geçebilirsin, bitince haber verilir.</span>' : `<button type="button" class="btn btn-sm btn-ghost" data-batch-hide>Gizle</button>`}</div>
      <ul class="pool-list">${jobs.map(j => `<li class="pool-item"><span class="status-badge">${esc(j.statusLabel)}</span><span class="grow">${j.promptId ? `<a class="link" href="${base(brand)}/${esc(j.promptId)}">${esc(j.promptTitle || j.ideaTitle)}</a>` : esc(j.ideaTitle)}${j.error ? `<div class="xsmall muted">${esc(j.error)}</div>` : ''}</span>${j.status === 'hata' ? `<button type="button" class="btn btn-sm" data-batch-retry="${esc(j.id)}">Tekrar dene</button>` : ''}</li>`).join('')}</ul>`;
    if (batchBusy && !active) { notifyDone('Toplu Reels hazır', { body: `${bt.done}/${bt.total} senaryo yazıldı${bt.failed ? `, ${bt.failed} hata` : ''}.`, ok: !bt.failed }); loadList(); }
    batchBusy = Boolean(active);
    if (active) batchTimer = setTimeout(drawBatch, 4000);
  }
  async function bulkModal() {
    let ideas = [];
    try { ideas = (await api.ideas(brand.id, '?format=reels&status=kullanilmamis')).ideas; } catch (err) { return toast(err.message, 'error'); }
    if (!ideas.length) return toast('Kullanılmamış Reels fikri yok. İçerik fikirlerine Reels türünde fikir ekle.', 'info', 6000);
    openModal({
      title: 'Toplu Reels', submitLabel: 'Başlat',
      body: `<p class="small muted mb-3">Seçtiğin her fikir için senaryo planı ve Google Flow sahne prompt'ları yazılır (seçili kural şablonuyla). İş arka planda sürer; bitince ses ve bildirimle haber verilir. 3-5 fikir önerilir.</p>
        <div class="field"><label for="bk-scenes">Sahne sayısı</label><select class="select w-auto" id="bk-scenes" name="scenes">${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n} sahne</option>`).join('')}</select></div>
        <fieldset class="field mt-3"><legend class="field-label">Fikirler (en çok 10)</legend><div class="stack-sm bk-list">${ideas.slice(0, 30).map((x, i) => `<label class="check"><input type="checkbox" name="idea" value="${esc(x.id)}" ${i < 3 ? 'checked' : ''}> ${esc(x.title)}</label>`).join('')}</div></fieldset>`,
      onSubmit: async fd => {
        const ids = fd.getAll('idea').slice(0, 10);
        if (!ids.length) throw new Error('En az bir fikir seç.');
        askPermissionOnce();
        const r = await api.genBatch(brand.id, { type: 'reels', ideaIds: ids, scenes: Number(fd.get('scenes')) || 4, model: (view.querySelector('#ps-model') || {}).value || null });
        toast(`${r.added.length} Reels kuyruğa alındı${r.skipped.length ? `, ${r.skipped.length} atlandı (${r.skipped.map(x => x.reason).join(', ')})` : ''}.`, 'success', 6000);
        batchBusy = true; drawBatch();
      }
    });
  }

  async function loadList() {
    const box = view.querySelector('#ps-list');
    const { prompts } = await api.prompts(brand.id, { kind: filter, q });
    if (!box.isConnected) return;
    box.innerHTML = prompts.length ? `<ul class="pool-list">${prompts.map(p => `
      <li class="pool-item">
        <span class="status-badge">${esc(p.kindLabel)}</span>
        <a class="grow prompt-link" href="${base(brand)}/${esc(p.id)}"><div class="strong truncate">${p.favorite ? '★ ' : ''}${p.example ? '<span class="badge" title="Marka örneği: sonraki üretimlere örnek olarak girer">Örnek</span> ' : ''}${esc(p.title)}</div><div class="xsmall muted truncate">${esc(p.text.slice(0, 160))}</div></a>
        <span class="xsmall muted">${timeAgo(p.updatedAt)}</span>
        <button class="btn btn-sm btn-ghost" data-copy="${esc(p.id)}" title="Kopyala">Kopyala</button>
        <button class="btn btn-sm btn-ghost" data-ptxt="${esc(p.id)}" title="Metin dosyası olarak indir">İndir</button>
        ${state.settings && state.settings.drive && state.settings.drive.configured && brand.driveFolderId ? `<button class="btn btn-sm btn-ghost" data-pdrive="${esc(p.id)}" title="Markanın Drive klasörüne gönder">Drive</button>` : ''}
      </li>`).join('')}</ul>`
      : emptyState({ icon: 'wand', title: q || filter ? 'Eşleşen prompt yok' : 'Henüz prompt yok', text: q || filter ? 'Aramayı ya da filtreyi değiştir.' : 'Yukarıdan bir tür seçip kısaca ne istediğini yaz.', compact: true });
    box._prompts = prompts;
  }
  await loadList();
  drawBatch();

  view.onchange = e => {
    if (!plan) return;
    const pl = e.target.closest('[data-pl]'); const ln = e.target.closest('[data-pl-line]');
    if (pl) { plan[pl.dataset.pl] = e.target.value.trim(); recheckPlan(); }
    else if (ln) { plan.scenes[Number(ln.dataset.plLine)].line = e.target.value.trim(); recheckPlan(); }
  };
  let timer = null;
  view.oninput = e => {
    if (e.target.id === 'ps-q') { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); loadList(); }, 250); }
  };
  view.onclick = async e => {
    const pst = e.target.closest('[data-ps-tab]');
    if (pst) { const hz = pst.dataset.psTab === 'hizli'; view.querySelectorAll('[data-ps-tab]').forEach(b => { b.classList.toggle('active', b === pst); b.setAttribute('aria-selected', String(b === pst)); }); view.querySelector('#ps-pane-hizli').hidden = !hz; view.querySelector('#ps-pane-yeni').hidden = hz; return; }
    if (e.target.closest('.menu-dd-list button')) { const d = e.target.closest('details'); if (d) d.open = false; }
    if (e.target.closest('[data-rules]')) return rulesModal(brand, meta, kind, loadRules);
    if (e.target.closest('[data-reels-settings]')) return reelsSettingsModal(brand, state.meta.reels);
    if (e.target.closest('[data-bulk-reels]')) return bulkModal();
    if (e.target.closest('[data-batch-hide]')) { view.querySelector('#ps-batch').hidden = true; return; }
    const brt = e.target.closest('[data-batch-retry]');
    if (brt) { try { await api.genRetry(brand.id, brt.dataset.batchRetry); batchBusy = true; drawBatch(); } catch (err) { toast(err.message, 'error'); } return; }
    if (e.target.closest('[data-builder]')) return openRuleBuilder(brand, meta, { onSaved: loadRules });
    if (e.target.closest('[data-recipes]')) return openRecipes('prompt', brand, res => go(`#/m/${brand.id}/prompt/${res.prompt.id}`));
    const k = e.target.closest('[data-kind]');
    if (k) {
      kind = k.dataset.kind;
      view.querySelectorAll('[data-kind]').forEach(b => { b.classList.toggle('active', b === k); b.setAttribute('aria-checked', String(b === k)); });
      // Reels senaryosu varsayılan 4 sahne (her biri en çok 8 sn'lik Flow klibi); diğer türler tek prompt
      const sc = view.querySelector('#ps-scenes'); if (sc) { sc.value = kind === 'reels' ? '4' : '0'; sc.dispatchEvent(new Event('change', { bubbles: true })); }
      return hint();
    }
    const f = e.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      view.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === f));
      return loadList();
    }
    const px = e.target.closest('[data-ptxt],[data-pdrive]');
    if (px) {
      const p = (view.querySelector('#ps-list')._prompts || []).find(x => x.id === (px.dataset.ptxt || px.dataset.pdrive));
      if (!p) return;
      const blob = new Blob([p.text], { type: 'text/plain;charset=utf-8' });
      if (px.dataset.ptxt) return downloadBlob(blob, `${safeName(p.title || 'prompt')}.txt`);
      try { await busy(px, () => api.driveUpload(brand.id, blob, p.title || 'prompt', 'text/plain')); toast('Prompt Drive klasörüne gönderildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const c = e.target.closest('[data-copy]');
    if (c) {
      const p = (view.querySelector('#ps-list')._prompts || []).find(x => x.id === c.dataset.copy);
      if (p) copy(p.text, 'Prompt kopyalandı.');
      return;
    }
    const bs = e.target.closest('[data-brainstorm]');
    if (bs) {
      const brief = view.querySelector('#ps-brief').value.trim();
      if (!brief) return toast('Önce ne istediğini kısaca yaz.', 'error');
      try {
        const r = await busyTimer(bs, () => api.brainstormPrompts(brand.id, { kind, brief, concepts: Number(view.querySelector('#bs-c').value), variations: Number(view.querySelector('#bs-v').value), model: view.querySelector('#ps-model').value || null }), 'Düşünüyor');
        const box = view.querySelector('#ps-bs');
        box._bs = r;
        box.innerHTML = `<div class="row-between mb-2"><b>${r.concepts.length} konsept</b><span class="xsmall muted">${esc(aiNote(r.ai))} · beğendiğini kaydet</span></div>
          <div class="bs-grid">${r.concepts.map((c, ci) => `<div class="bs-concept"><div class="strong">${esc(c.name)}</div><div class="small muted mb-2">${esc(c.idea)}</div>
            ${c.variations.map((v, vi) => `<div class="bs-var"><div class="small prompt-text">${esc(v.prompt)}</div>${v.promptTr ? `<div class="xsmall muted mt-1">${esc(v.promptTr)}</div>` : ''}
              <div class="row mt-2"><button class="btn btn-sm" data-bs-save="${ci}:${vi}">Kaydet</button><button class="btn btn-sm btn-ghost" data-bs-copy="${ci}:${vi}">Kopyala</button></div></div>`).join('')}</div>`).join('')}</div>`;
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const bsv = e.target.closest('[data-bs-save],[data-bs-copy]');
    if (bsv) {
      const r = view.querySelector('#ps-bs')._bs;
      const [ci, vi] = (bsv.dataset.bsSave || bsv.dataset.bsCopy).split(':').map(Number);
      const c = r.concepts[ci]; const v = c.variations[vi];
      if (bsv.dataset.bsCopy) return copy(v.prompt, 'Kopyalandı.');
      try { await api.createPrompt(brand.id, { manual: true, kind: r.kind, title: `${c.name} · ${vi + 1}`.slice(0, 80), text: v.prompt, textTr: v.promptTr }); bsv.disabled = true; bsv.textContent = 'Kaydedildi ✓'; loadList(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    // 10.7: içerik havuzundan rastgele (kullanılmamış) fikir; üretim olunca fikir "kullanıldı" olur
    const pick = e.target.closest('[data-pick-idea]');
    if (pick) {
      try {
        const { idea } = await busy(pick, () => api.randomIdea(brand.id, { format: POOL_OF[kind] || 'genel', exclude: pickedSeen }));
        const note = view.querySelector('#ps-picked');
        note.hidden = false;
        if (!idea) { picked = null; view.querySelector('#ps-pick-btn').hidden = false; note.innerHTML = `Bu türde kullanılmamış fikir kalmadı. <a class="link" href="#/m/${esc(brand.id)}/fikirler">İçerik fikirlerine</a> fikir ekle.`; return; }
        picked = idea; pickedSeen.push(idea.id);
        view.querySelector('#ps-brief').value = idea.title + (idea.description ? `\n${idea.description}` : '');
        view.querySelector('#ps-pick-btn').hidden = true;
        note.innerHTML = `${icon('idea')}<span class="grow">Havuzdan gelen <b>${esc(idea.formatLabel)}</b> fikri; istersen metni değiştir</span><button type="button" class="btn btn-sm btn-ghost" data-pick-idea>Başka fikir</button><button type="button" class="btn btn-sm btn-ghost" data-pick-clear title="Fikri bırak; metin elle yazılmış sayılır">Bırak</button>`;
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('[data-pick-clear]')) { picked = null; view.querySelector('#ps-picked').hidden = true; view.querySelector('#ps-pick-btn').hidden = false; return; }
    const create = e.target.closest('[data-create]');
    if (create) {
      const brief = view.querySelector('#ps-brief').value.trim();
      if (!brief) return toast('Önce ne istediğini kısaca yaz.', 'error');
      if (kind === 'reels') return writePlan(create, brief);
      try {
        const { prompt } = await streamBusy(create, st => api.createPrompt(brand.id, { kind, brief, model: view.querySelector('#ps-model').value || null, scenes: Number((view.querySelector('#ps-scenes') || {}).value || 0), tool: (view.querySelector('#ps-tool') || {}).value || '', ruleId: (view.querySelector('#ps-rule') || {}).value || 'none' }, st));
        toast(aiNote(prompt.ai), 'success', 5000);
        if (picked) { try { const u = await api.useIdea(brand.id, picked.id, 'prompt'); if (u && u.warning) toast(u.warning, 'info', 6000); } catch { /* fikir silinmiş olabilir */ } picked = null; }
        go(base(brand) + '/' + prompt.id);
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const redo = e.target.closest('[data-plan-redo]');
    if (redo) return writePlan(redo, view.querySelector('#ps-brief').value.trim() || plan.title);
    const ok = e.target.closest('[data-plan-ok]');
    if (ok) {
      try {
        const { prompt } = await streamBusy(ok, st => api.createPrompt(brand.id, { kind, brief: view.querySelector('#ps-brief').value.trim() || plan.title, plan, model: view.querySelector('#ps-model').value || null, ruleId: (view.querySelector('#ps-rule') || {}).value || 'none' }, st));
        toast(aiNote(prompt.ai), 'success', 5000);
        if (picked) { try { const u = await api.useIdea(brand.id, picked.id, 'prompt'); if (u && u.warning) toast(u.warning, 'info', 6000); } catch { /* fikir silinmiş olabilir */ } picked = null; }
        plan = null;
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
          <div class="field full"><label for="pm-text">Prompt *</label><textarea class="textarea" id="pm-text" name="text" required maxlength="30000" rows="6"></textarea></div>
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
  let panel = p.plan ? 'yayin' : 'gelistir';

  function draw() {
    const panelBox = (k, title, inner) => `<div class="ed-pane" data-pane="${k}" ${panel === k ? '' : 'hidden'}><h3 class="ed-panel-title">${title}</h3>${inner}</div>`;
    const toolMap = (meta.kinds[p.kind] || {}).tools || {};
    const hasTools = Object.keys(toolMap).length > 0;
    const rails = [...(p.plan ? [['yayin', 'Yayın', 'film']] : []), ['gelistir', 'Geliştir', 'sparkle'], ...(hasTools ? [['arac', 'Hedef araç', 'wand']] : []), ...(IMAGE_KINDS[p.kind] ? [['gorsel', 'Görsel üret', 'image']] : []), ['surumler', 'Sürümler', 'refresh']];
    const to = p.toolOutput;
    const outBox = (label, key, value, rows) => `<div class="field mt-2"><div class="row"><span class="field-label grow">${label}</span><button type="button" class="btn btn-sm btn-ghost" data-copy-tool="${key}">Kopyala</button></div><textarea class="textarea" rows="${rows}" readonly data-tool-out="${key}">${esc(value)}</textarea></div>`;
    const toolPane = hasTools ? panelBox('arac', 'Hedef araç', `<p class="small muted mb-3">Aynı prompt seçtiğin araca göre biçimlenir: oran yazımı, negatif prompt alanı ve uzunluk. Araç seçiliyken yapılan geliştirmeler de bu araca göre yazılır.</p>
      <div class="form-grid"><div class="field"><label for="pp-tool">Araç</label><select class="select" id="pp-tool"><option value="">Seçilmedi</option>${Object.entries(toolMap).map(([v, l]) => `<option value="${esc(v)}" ${p.tool === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label for="pp-aspect">Oran</label><select class="select" id="pp-aspect"><option value="">Türün varsayılanı</option>${(meta.aspects || []).map(a => `<option value="${a}" ${p.aspect === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div></div>
      ${!p.tool ? '<p class="small muted mt-3">Bir araç seç; kopyalamaya hazır çıktı burada görünür.</p>'
        : p.lang === 'tr' ? '<div class="notice mt-3"><div>Araç çıktısı İngilizce prompt\'tan hazırlanır. Önce prompt\'u İngilizceye çevir.</div></div>'
          : to ? `${outBox(to.params ? 'Prompt (parametrelerle)' : 'Prompt', 'full', to.full, 6)}${to.negative ? outBox('Negatif prompt', 'negative', to.negative, 2) : ''}${to.notes.length ? `<ul class="small muted mt-2 tool-notes">${to.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}` : ''}`) : '';
    view.innerHTML = `
      <div class="ed ed-doc-mode">
        <header class="ed-top">
          <a class="ed-top-btn" href="${base(brand)}" title="Prompt'lar">${icon('back')}<span>Prompt'lar</span></a>
          <div class="ed-menu"><button type="button" class="ed-top-btn" data-menu="dosya" aria-haspopup="true">Dosya</button>
            <div class="ed-drop" data-drop="dosya" hidden>
              <div class="ed-drop-head"><b>${esc(p.title)}</b><span class="xsmall">${esc(p.kindLabel)} prompt'u${p.brief ? ` · İstek: ${esc(p.brief.slice(0, 80))}` : ''}</span></div>
              <button type="button" data-fav>${p.favorite ? '★ Favorilerden çıkar' : '☆ Favorilere ekle'}</button>
              <button type="button" data-example>${p.example ? '✓ Marka örneğinden çıkar' : '👍 Marka örneği yap (sonraki üretimlere örnek olur)'}</button>
              <button type="button" data-recipe-save>📌 Tariflere kaydet (başka markalarda kullan)</button>
              <button type="button" data-rail="surumler">${icon('refresh')}Sürüm geçmişi</button>
              <hr><button type="button" class="danger" data-delete>${icon('trash')}Prompt'u sil</button>
            </div></div>
          <span class="spacer"></span>
          <h1 class="ed-title" title="${esc(p.title)}">${esc(p.title)}</h1>
          <button type="button" class="ed-top-btn ed-save" data-save>Kaydet</button>
          <button type="button" class="ed-share" data-copy="text">Prompt'u kopyala</button>
        </header>
        <div class="ed-body ${panel ? 'has-panel' : ''}">
          <nav class="ed-rail" aria-label="Araçlar">${rails.map(([k, label, ic]) => `<button type="button" class="${panel === k ? 'active' : ''}" data-rail="${k}" aria-pressed="${panel === k}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
          <aside class="ed-panel" ${panel ? '' : 'hidden'}>
            ${panelBox('gelistir', 'Geliştir', aiReady ? `<div class="field">${modelSelect(models, 'yazim', { id: 'pp-model' })}</div>
              <p class="small muted mt-2 mb-2">Her işlem yeni bir sürüm oluşturur; beğenmezsen Sürümler'den önceki sürüme dönebilirsin.</p>
              <div class="chips">${Object.entries(meta.actions).map(([k, v]) => `<button type="button" class="chip" data-improve="${k}">${esc(v)}</button>`).join('')}</div>
              <hr class="sep">
              <div class="field"><label for="pp-instr">Seçili bölümü yeniden yaz</label>
                <input class="input" id="pp-instr" maxlength="500" placeholder="Nasıl değişsin? Ör. gece sahnesi olsun">
                <button class="btn btn-sm mt-2" data-selected>Seçili bölümü yaz</button>
                <div class="xsmall muted mt-1">Önce ortadaki prompt kutusunda değiştirmek istediğin kısmı fareyle seç.</div></div>
              <div class="field mt-3"><label for="pp-brief">Girişi değiştir</label>
                <textarea class="textarea" id="pp-brief" rows="3" maxlength="2000" placeholder="Yeni isteği yaz; prompt baştan yazılır">${esc(p.brief)}</textarea>
                <button class="btn btn-sm mt-2" data-rebrief>Yeni girişe göre yeniden yaz</button></div>`
              : '<div class="notice"><div><strong>AI bağlı değil.</strong> Geliştirme işlemleri için bir sağlayıcı bağla. Elle düzenleyip kaydedebilirsin.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>')}
            ${toolPane}
            ${p.plan ? panelBox('yayin', 'Yayın paketi', `<div class="field"><label for="pp-status">Durum</label><select class="select" id="pp-status">${Object.entries(meta.statuses || {}).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
              <div class="stack-sm mt-3">${p.content ? `<a class="btn btn-sm" href="#/m/${esc(brand.id)}/takvim">${icon('calendar')}Takvimde · ${esc(when(p.content.scheduledAt || p.updatedAt))}</a>` : `<button type="button" class="btn btn-sm" data-rl-schedule>${icon('calendar')}Takvime ekle</button>`}
                <button type="button" class="btn btn-sm" data-rl-srt ${p.srt ? '' : 'disabled'}>${icon('download')}Altyazı indir (.srt)</button>
                <button type="button" class="btn btn-sm" data-rl-png ${p.plan.screenTitle ? '' : 'disabled'}>${icon('download')}Kapak yazısı PNG</button></div>
              <p class="xsmall muted mt-1">Altyazı plandaki konuşma saniyelerinden hazırlanır; CapCut'ta Metin → Altyazı içe aktar ile eklenir. Kapak yazısı Reels ayarlarındaki stille çizilir.</p>
              <hr class="sep">
              <div class="field"><label for="pp-caption">Instagram açıklaması</label><textarea class="textarea" id="pp-caption" rows="8" maxlength="2200">${esc(p.plan.caption || '')}</textarea></div>
              <div class="field mt-2"><label for="pp-tags">Hashtag'ler</label><input class="input" id="pp-tags" maxlength="400" value="${esc((p.plan.hashtags || []).join(' '))}"></div>
              <div class="row mt-2"><button type="button" class="btn btn-sm" data-rl-cap-save>Kaydet</button><button type="button" class="btn btn-sm btn-ghost" data-rl-cap-copy>Kopyala</button></div>`) : ''}
            ${IMAGE_KINDS[p.kind] ? panelBox('gorsel', "Bu prompt'la görsel üret", '<p class="small muted mb-3">Prompt kutusundaki metin seçtiğin görsel modeline gönderilir; sonuç kütüphaneye kaydedilir.</p><div id="pp-image"></div>') : ''}
            ${panelBox('surumler', `Sürümler <span class="small muted">${p.versions.length}</span>`, `<ul class="version-list">${p.versions.map((v, i) => `<li><div class="grow"><div class="small strong">${esc(v.note)}</div><div class="xsmall muted">${esc(when(v.createdAt))}${v.modelLabel ? ` · ${esc(v.modelLabel)}` : ''}</div></div>
              <button class="btn btn-sm btn-ghost" data-show="${esc(v.id)}">Göster</button>
              ${i === 0 ? '<span class="xsmall muted">Şu anki</span>' : `<button class="btn btn-sm btn-ghost" data-restore="${esc(v.id)}">Geri dön</button>`}</li>`).join('')}</ul>`)}
            <button type="button" class="ed-collapse" data-rail-close aria-label="Paneli kapat">${icon('chevronLeft')}</button>
          </aside>
          <main class="ed-doc">
            <div class="ed-doc-inner">
              <section class="card">
                <div class="field"><label for="pp-title">Başlık</label><input class="input" id="pp-title" maxlength="80" value="${esc(p.title)}"></div>
                ${p.english && p.lang === 'tr' ? `<div class="notice mt-3"><div><strong>Prompt Türkçe.</strong> Oku, gerekirse düzelt; hazır olunca üretim aracı için İngilizceye çevir (Türkçesi aşağıda saklanır).</div><button class="btn btn-sm btn-primary" type="button" data-translate>İngilizceye çevir</button></div>` : ''}
                <div class="field mt-3"><label for="pp-text">${p.english ? (p.lang === 'tr' ? 'Prompt (Türkçe)' : 'Prompt (İngilizce, üretim aracına bu verilir)') : 'Prompt'}</label>
                  ${p.scenes && p.scenes.length ? `<div class="scene-list" id="pp-scenes">${p.scenes.map((s, i) => `<article class="scene-card" data-scene="${i}">
                      <div class="row"><b>Sahne ${i + 1}</b><input class="input input-sm" data-scene-title="${i}" maxlength="80" value="${esc(s.title)}" aria-label="Sahne ${i + 1} adı">${p.quality && p.quality.scenes && p.quality.scenes[i] ? `<span class="q-badge ${p.quality.scenes[i].ok ? 'ok' : 'bad'}" title="${esc(p.quality.scenes[i].missing.join(', '))}">%${p.quality.scenes[i].score}</span>` : ''}</div>
                      <textarea class="textarea" data-scene-text="${i}" rows="5" maxlength="12000" aria-label="Sahne ${i + 1} metni">${esc(s.text)}</textarea>
                      <div class="row"><button type="button" class="btn btn-sm" data-scene-act="extend" data-i="${i}">Uzat</button><input class="input input-sm" data-scene-how="${i}" maxlength="500" placeholder="Beğenmediğin kısmı nasıl değiştireyim?" aria-label="Sahne ${i + 1} için talimat"><button type="button" class="btn btn-sm" data-scene-act="rewrite" data-i="${i}">Değiştir</button></div>
                    </article>`).join('')}
                    <div class="row"><button type="button" class="btn btn-sm btn-primary" data-scene-act="add">${icon('plus')}Bir sahne daha üret (devamı)</button><span class="xsmall muted">Sahneleri elle de düzenleyebilirsin; Kaydet'e bas.</span></div></div>
                  <textarea class="textarea prompt-text" id="pp-text" rows="6" maxlength="30000" readonly hidden>${esc(p.text)}</textarea>` : `<textarea class="textarea prompt-text" id="pp-text" rows="12" maxlength="30000">${esc(p.text)}</textarea>`}</div>
                ${p.english && p.lang !== 'tr' ? `<div class="field mt-3"><label for="pp-tr">Türkçesi (okumak için)</label><textarea class="textarea" id="pp-tr" rows="7" maxlength="30000">${esc(p.textTr)}</textarea></div>` : ''}
                ${p.plan ? `<div class="ps-plan-check mt-2 ${p.planIssues.length ? 'warn' : 'ok'}" role="status"><b>Senaryo planına uyum${p.planIssues.length ? `: ${p.planIssues.length} uyarı` : ': replikler ve süreler birebir ✓'}</b>${p.planIssues.length ? `<ul>${p.planIssues.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>` : ''}
                ${p.quality && p.quality.checks.length ? `<div class="q-badges mt-2" aria-label="Kalite kontrolü"><span class="xsmall muted">Kalite kontrolü %${p.quality.score}${p.ai && p.ai.qualityRetried ? ' · eksikler için bir kez daha yazıldı' : ''}:</span>${p.quality.checks.map(c => `<span class="q-badge ${c.ok ? 'ok' : 'bad'}" title="${esc(c.msg || '')}">${c.ok ? '✓' : '✗'} ${esc(c.label)}</span>`).join('')}</div>` : ''}
                <div class="row mt-3">
                  ${p.english && p.lang !== 'tr' ? '<button class="btn btn-sm btn-ghost" data-copy="tr">Türkçesini kopyala</button>' : ''}
                  <span class="xsmall muted" id="pp-note">${lastAi ? esc(aiNote(lastAi)) : p.modelLabel ? `Son yazan model: ${esc(p.modelLabel)}` : ''}</span>
                </div>
              </section>
            </div>
          </main>
        </div>
        <footer class="ed-bottom"><span class="small muted">${esc(p.kindLabel)}${p.rule ? ` · Kural şablonu: ${esc(p.rule.name)}` : ''} · ${p.text.length} karakter · ${p.versions.length} sürüm</span><span class="spacer"></span>${feedbackButtons(p.feedback, 'prompt', p.id)}${p.example ? '<span class="small">👍 Marka örneği</span> ' : ''}${p.favorite ? '<span class="small">★ Favori</span>' : ''}</footer>
      </div>`;
    document.body.classList.add('editor-mode');
    if (IMAGE_KINDS[p.kind]) imageBox(view.querySelector('#pp-image'), brand, { getPrompt: () => val('#pp-text'), promptId: p.id, aspect: IMAGE_KINDS[p.kind], mentionTarget: () => view.querySelector('#pp-text') });
  }
  draw();

  const val = sel => { const el = view.querySelector(sel); return el ? el.value : null; };
  const hasTr = () => p.english && p.lang !== 'tr';
  const readScenes = () => (p.scenes || []).map((s, i) => ({ title: val(`[data-scene-title="${i}"]`) || '', text: val(`[data-scene-text="${i}"]`) || '' }));
  const scenesDirty = () => p.scenes && p.scenes.length && JSON.stringify(readScenes()) !== JSON.stringify(p.scenes);
  const dirty = () => (p.scenes && p.scenes.length ? scenesDirty() : val('#pp-text').trim() !== p.text) || (hasTr() && val('#pp-tr').trim() !== p.textTr) || val('#pp-title').trim() !== p.title;
  async function save() {
    const body = p.scenes && p.scenes.length ? { title: val('#pp-title'), scenes: readScenes() } : { title: val('#pp-title'), text: val('#pp-text') };
    if (hasTr()) body.textTr = val('#pp-tr');
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

  // 7.10: araç ya da oran değişince kaydedilir, çıktı yeniden hazırlanır
  view.onchange = async e => {
    if (e.target.matches('#pp-status')) {
      try { p = (await api.savePrompt(brand.id, p.id, { status: e.target.value })).prompt; toast(`Durum: ${p.statusLabel}`, 'success'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (!e.target.matches('#pp-tool, #pp-aspect')) return;
    try {
      if (dirty()) await save();
      p = (await api.savePrompt(brand.id, p.id, { tool: val('#pp-tool'), aspect: val('#pp-aspect') })).prompt;
      draw();
    } catch (err) { toast(err.message, 'error'); }
  };

  view.onclick = async e => {
    const t = e.target;
    // Reels yayın paketi
    const name = safeName(p.title || 'reels');
    if (t.closest('[data-rl-srt]')) { downloadBlob(new Blob([p.srt], { type: 'text/plain;charset=utf-8' }), `${name}_altyazi.srt`); return toast('Altyazı indirildi. CapCut\'ta Metin → Altyazı içe aktar ile ekleyebilirsin.', 'success', 5000); }
    const png = t.closest('[data-rl-png]');
    if (png) return busy(png, async () => downloadBlob(await titleBlob({ title: p.plan.screenTitle, keyword: p.plan.titleKeyword, style: p.plan.titleStyle, colors: brand.colors }), `${name}_kapak.png`));
    if (t.closest('[data-rl-cap-copy]')) return copy([val('#pp-caption'), val('#pp-tags')].filter(Boolean).join('\n\n'), 'Açıklama kopyalandı.');
    const cs = t.closest('[data-rl-cap-save]');
    if (cs) { try { p = (await busy(cs, () => api.savePrompt(brand.id, p.id, { caption: val('#pp-caption'), hashtags: val('#pp-tags') }))).prompt; toast('Açıklama kaydedildi.', 'success'); } catch (err) { toast(err.message, 'error'); } return; }
    const sch = t.closest('[data-rl-schedule]');
    if (sch) {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
      try { await busy(sch, () => api.schedulePrompt(brand.id, p.id, d.toISOString())); p = (await api.prompt(brand.id, p.id)).prompt; toast('Takvime yarın 12:00 için eklendi; takvimden tarihini değiştirebilirsin.', 'success', 5000); draw(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const menu = t.closest('[data-menu]');
    if (menu) { const dd = view.querySelector(`[data-drop="${menu.dataset.menu}"]`); const was = dd.hidden; view.querySelectorAll('[data-drop]').forEach(x => { x.hidden = true; }); dd.hidden = !was; return; }
    if (!t.closest('.ed-drop') || t.closest('button')) view.querySelectorAll('[data-drop]').forEach(x => { x.hidden = true; });
    const rail = t.closest('[data-rail]');
    if (rail || t.closest('[data-rail-close]')) {
      const k = rail ? rail.dataset.rail : panel;
      panel = panel === k && !(rail && rail.closest('.ed-drop')) ? null : k; // aynı araca tekrar tıklayınca kapanır
      view.querySelectorAll('.ed-rail [data-rail]').forEach(b => { b.classList.toggle('active', b.dataset.rail === panel); b.setAttribute('aria-pressed', String(b.dataset.rail === panel)); });
      view.querySelectorAll('[data-pane]').forEach(x => { x.hidden = x.dataset.pane !== panel; });
      view.querySelector('.ed-panel').hidden = !panel;
      view.querySelector('.ed-body').classList.toggle('has-panel', Boolean(panel));
      return;
    }
    if (t.closest('[data-save]')) {
      try { await save(); lastAi = null; draw(); toast('Kaydedildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (await handleFeedbackClick(e, brand.id, p.feedback, fb => { p.feedback = fb; })) return;
    const ct = t.closest('[data-copy-tool]');
    if (ct) return copy(val(`[data-tool-out="${ct.dataset.copyTool}"]`), 'Kopyalandı.');
    const c = t.closest('[data-copy]');
    if (c) return copy(c.dataset.copy === 'tr' ? val('#pp-tr') : val('#pp-text'), 'Kopyalandı.');
    const imp = t.closest('[data-improve]');
    if (imp) return improve(imp, { action: imp.dataset.improve });
    const sa = t.closest('[data-scene-act]');
    if (sa) {
      const i = sa.dataset.i != null ? Number(sa.dataset.i) : null;
      const instruction = i != null ? val(`[data-scene-how="${i}"]`) : '';
      if (sa.dataset.sceneAct === 'rewrite' && !String(instruction || '').trim()) return toast('Önce bu sahnede neyi değiştirmek istediğini yaz.', 'error');
      try {
        if (dirty()) await save();
        const res = await busyTimer(sa, () => api.promptScene(brand.id, p.id, { action: sa.dataset.sceneAct, index: i, instruction, model: val('#pp-model') || null }), 'Yazıyor');
        p = res.prompt; lastAi = p.ai; draw();
        toast(aiNote(p.ai), 'success', 4000);
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const trBtn = t.closest('[data-translate]');
    if (trBtn) {
      try {
        if (dirty()) await save();
        const res = await busyTimer(trBtn, () => api.translatePrompt(brand.id, p.id, {}), 'Çeviriyor');
        p = res.prompt; lastAi = p.ai; draw();
        toast('İngilizceye çevrildi; Türkçesi aşağıda.', 'success');
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
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
    if (t.closest('[data-recipe-save]')) {
      try { await api.promptToRecipe(brand.id, p.id); toast('Tariflere kaydedildi. Başka bir markanın Prompt Studio\'sunda "Tariflerden ekle" ile kullanabilirsin.', 'success', 5000); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (t.closest('[data-example]')) {
      try {
        p = (await api.savePrompt(brand.id, p.id, { example: !p.example })).prompt; draw();
        toast(p.example ? 'Marka örneği yapıldı; bu türdeki sonraki üretimlerde modele örnek olarak gider (en çok 3).' : 'Marka örneğinden çıkarıldı.', 'success');
      } catch (err) { toast(err.message, 'error'); }
      return;
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

// ------------------------------------------------------------ Kural şablonları
// Kullanıcının kendi prompt yapısı: başlıklar ve sabit cümleler aynen kalır, [köşeli] alanları yapay zekâ doldurur.
function rulesModal(brand, meta, kind, onChange) {
  const m = openModal({
    title: 'Kural şablonları', submitLabel: 'Kapat',
    body: `<p class="small muted mb-3">Prompt'ların hep aynı yapıda yazılmasını istiyorsan şablonunu buraya kaydet. <b>[Köşeli parantez]</b> içindeki alanları yapay zekâ isteğine göre doldurur; başlıklar ve diğer bütün cümleler kelimesi kelimesine aynen kalır. Sahneli üretimde her sahne bu şablonun bir kopyası olur.</p>
      <div id="rl-list"><p class="small muted">Yükleniyor…</p></div>
      <div class="row mt-3"><button type="button" class="btn btn-primary" data-rl-builder>${icon('sparkle')}Şablon oluşturucu</button><button type="button" class="btn" data-rl-new>${icon('plus')}Boş şablon</button>${RULE_EXAMPLES.map(x => `<button type="button" class="btn btn-ghost" data-rl-example="${esc(x.id)}">${icon('notes')}Hazır örnek: ${esc(x.name)}</button>`).join('')}</div>`,
    onSubmit: async () => {}
  });
  const box = m.form.querySelector('#rl-list');
  let list = [];
  async function draw() {
    try { list = (await api.promptRules(brand.id)).rules; } catch (err) { box.innerHTML = `<p class="small">${esc(err.message)}</p>`; return; }
    box.innerHTML = list.length ? `<ul class="pool-list">${list.map(r => `<li class="pool-item">
        <span class="status-badge">${esc(r.kindLabel)}</span>
        <div class="grow"><div class="strong">${esc(r.name)}${r.isDefault ? ' <span class="badge">Varsayılan</span>' : ''}${r.shared ? ' <span class="badge">Bütün markalar</span>' : ''}</div><div class="xsmall muted">${r.headings.length} bölüm · ${r.fields} doldurulacak alan · ${r.lang === 'en' ? 'İngilizce' : 'Türkçe'}</div></div>
        ${r.isDefault ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-rl-default="${esc(r.id)}">Varsayılan yap</button>`}
        ${r.spec && r.spec.platform ? `<button type="button" class="btn btn-sm btn-ghost" data-rl-build="${esc(r.id)}">Oluşturucuda aç</button>` : ''}
        <button type="button" class="btn btn-sm btn-ghost" data-rl-edit="${esc(r.id)}">Düzenle</button>
        <button type="button" class="btn btn-sm btn-ghost icon-btn" data-rl-del="${esc(r.id)}" aria-label="${esc(r.name)} şablonunu sil">${icon('trash')}</button></li>`).join('')}</ul>`
      : '<p class="small muted">Henüz şablon yok. "Yeni şablon" ile kendi yapını yaz ya da hazır örnekle başla.</p>';
  }
  draw();
  m.form.addEventListener('click', async e => {
    const bl = e.target.closest('[data-rl-builder],[data-rl-build]');
    if (bl) { e.preventDefault(); return openRuleBuilder(brand, meta, { rule: bl.dataset.rlBuild ? list.find(x => x.id === bl.dataset.rlBuild) : null, onSaved: async () => { await draw(); onChange(); } }); }
    const nw = e.target.closest('[data-rl-new]');
    const ex = e.target.closest('[data-rl-example]');
    const edt = e.target.closest('[data-rl-edit]');
    if (nw || ex || edt) {
      e.preventDefault();
      const r = edt ? list.find(x => x.id === edt.dataset.rlEdit) : ex ? Object.assign({}, RULE_EXAMPLES.find(x => x.id === ex.dataset.rlExample), { id: null }) : { kind, name: '', body: '', lang: 'tr' };
      return editRule(brand, meta, r, async () => { await draw(); onChange(); });
    }
    const df = e.target.closest('[data-rl-default]');
    if (df) { e.preventDefault(); try { await api.savePromptRule(brand.id, df.dataset.rlDefault, { isDefault: true }); await draw(); onChange(); } catch (err) { toast(err.message, 'error'); } return; }
    const del = e.target.closest('[data-rl-del]');
    if (del) {
      e.preventDefault();
      const r = list.find(x => x.id === del.dataset.rlDel);
      if (!confirm(`"${r.name}" şablonu silinsin mi? Onunla yazılmış prompt'lar silinmez.`)) return;
      try { await api.deletePromptRule(brand.id, r.id); await draw(); onChange(); } catch (err) { toast(err.message, 'error'); }
    }
  });
}

function editRule(brand, meta, r, done) {
  const m = openModal({
    title: r.id ? 'Kural şablonunu düzenle' : 'Yeni kural şablonu', submitLabel: 'Kaydet',
    body: `<div class="form-grid">
        <div class="field"><label for="rl-name">Şablon adı *</label><input class="input" id="rl-name" name="name" maxlength="80" required value="${esc(r.name || '')}" placeholder="Ör. Dikey video sahnesi"></div>
        <div class="field"><label for="rl-kind">Prompt türü</label><select class="select" id="rl-kind" name="kind">${Object.entries(meta.kinds).map(([k, v]) => `<option value="${k}" ${k === r.kind ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
        <div class="field"><label for="rl-lang">Yazım dili</label><select class="select" id="rl-lang" name="lang"><option value="tr" ${r.lang !== 'en' ? 'selected' : ''}>Türkçe</option><option value="en" ${r.lang === 'en' ? 'selected' : ''}>İngilizce</option></select></div>
        <label class="chip-check field"><input type="checkbox" name="isDefault" ${r.isDefault || !r.id ? 'checked' : ''}><span>Bu türde varsayılan olsun</span></label>
        <div class="field full"><label for="rl-body">Şablon *</label><textarea class="textarea mono" id="rl-body" name="body" rows="18" maxlength="20000" required placeholder="Başlık:\nSabit cümle... [doldurulacak alan] ...">${esc(r.body || '')}</textarea>
          <span class="hint" id="rl-stat"></span></div>
      </div>`,
    onSubmit: async fd => {
      await api.savePromptRule(brand.id, r.id, { name: fd.get('name'), kind: fd.get('kind'), lang: fd.get('lang'), body: fd.get('body'), isDefault: fd.get('isDefault') === 'on' });
      toast('Kural şablonu kaydedildi.', 'success');
      await done();
    }
  });
  const ta = m.form.querySelector('#rl-body');
  const stat = () => {
    const v = ta.value;
    const heads = v.split('\n').map(l => l.trim().replace(/^[*•-]\s*/, '')).filter(l => /:$/.test(l) && l.length >= 3 && l.length <= 70 && !l.includes('[')).length;
    const fields = (v.match(/\[[^\]\n]+\]/g) || []).length;
    m.form.querySelector('#rl-stat').textContent = `${heads} bölüm başlığı · ${fields} doldurulacak [alan] · ${v.length} karakter. ":" ile biten satırlar bölüm başlığı sayılır ve üretimde aranır.`;
  };
  ta.addEventListener('input', stat);
  stat();
}
