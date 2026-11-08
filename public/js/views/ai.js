// Yapay zekâ: model karşılaştırma, sağlayıcılar ve işe göre model ataması, harcama takibi.
// Anahtarlar sunucuya yazılır ve bir daha tarayıcıya gönderilmez; burada yalnızca "bağlı mı" ve son 4 karakter görünür.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, busy, errorNotice } from '../ui.js';
import { state, refreshBrands, renderChrome, go } from '../app.js';
import { settingsTabs } from './settings.js';

const TABS = [['karsilastir', 'Karşılaştır', '#/ai'], ['modeller', 'Sağlayıcılar ve modeller', '#/ai/modeller'], ['harcama', 'Harcama', '#/ai/harcama']];
const SOURCE_LABEL = { resmi: 'resmî fiyat', yaklasik: 'yaklaşık', canli: 'canlı (OpenRouter)', elle: 'elle girildi' };
// "Bir Reels senaryosu" tahmini: marka hafızası + şablon ≈ 2.000 girdi, senaryo ≈ 1.500 çıktı token
const EST = { input: 2000, output: 1500 };

export function usd(v) {
  const n = Number(v) || 0;
  if (n === 0) return '0 $';
  if (n < 0.01) return '< 0,01 $';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 }) + ' $';
}
const perMillion = p => p ? `${String(p.input).replace('.', ',')} / ${String(p.output).replace('.', ',')}` : '—';
const estimate = p => p ? usd((EST.input * p.input + EST.output * p.output) / 1e6) : '—';

async function refreshChrome() {
  await refreshBrands().catch(() => {});
  renderChrome();
}

export async function renderAi(view, tab = 'karsilastir') {
  const ov = await api.aiOverview();
  const connected = ov.providers.filter(p => p.configured);
  view.innerHTML = `
    ${pageHead({ title: 'Yapay zekâ', desc: 'Hangi işte hangi modelin çalışacağını sen seçersin: modelleri aynı istekle karşılaştır, işlere ata, harcamayı takip et.' })}
    ${settingsTabs('ai')}
    <div class="tabs tabs-sub" role="tablist">${TABS.map(([id, label]) => `<button role="tab" data-go="${id}" class="${tab === id ? 'active' : ''}" aria-selected="${tab === id}">${label}</button>`).join('')}</div>
    <div id="ai-body"></div>`;
  view.onclick = e => {
    const t = e.target.closest('[data-go]');
    if (t) go(TABS.find(x => x[0] === t.dataset.go)[2]);
  };
  const body = view.querySelector('#ai-body');
  if (tab === 'modeller') return renderProviders(body, ov, view);
  if (tab === 'harcama') return renderSpend(body, ov, view);
  return renderCompare(body, ov, connected, view);
}

// Bağlı sağlayıcıların canlı model listeleri (hata olursa katalogla devam edilir)
async function liveLists(connected) {
  const out = {};
  await Promise.all(connected.map(async p => { try { out[p.id] = (await api.aiModels(p.id)).models; } catch { out[p.id] = []; } }));
  return out;
}

function modelOptions(ov, lists, selected, { allowNone = false, noneLabel = 'Yedek yok' } = {}) {
  const groups = ov.providers.filter(p => p.configured).map(p => {
    const catalog = ov.models.filter(m => m.provider === p.id);
    const extra = (lists[p.id] || []).filter(m => !catalog.some(c => c.id === m.id));
    const opts = [...catalog.map(m => ({ ref: m.ref, label: `${m.label} — önerilen` })), ...extra.map(m => ({ ref: m.ref, label: m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id }))];
    if (selected && selected.startsWith(p.id + ':') && !opts.some(o => o.ref === selected)) opts.unshift({ ref: selected, label: selected.slice(p.id.length + 1) });
    return opts.length ? `<optgroup label="${esc(p.label)}">${opts.map(o => `<option value="${esc(o.ref)}" ${o.ref === selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return (allowNone ? `<option value="">${esc(noneLabel)}</option>` : '') + groups;
}

// ---------------------------------------------------------------- Karşılaştır
async function renderCompare(body, ov, connected, view) {
  if (!connected.length) {
    body.innerHTML = emptyState({ icon: 'sparkle', title: 'Önce bir yapay zekâ sağlayıcısı bağla', text: 'Karşılaştırma için en az bir sağlayıcının anahtarı gerekiyor. Tek anahtarla birçok modeli denemek için OpenRouter pratik bir başlangıç.', action: '<a class="btn btn-primary" href="#/ai/modeller">Sağlayıcı bağla</a>', card: true }) + optionsTable(ov);
    return;
  }
  const kinds = ov.kinds;
  let kind = 'reels';
  const picked = new Set();
  const available = ov.models.filter(m => m.available);
  available.slice(0, 2).forEach(m => picked.add(m.ref));
  let extraLoaded = false;
  let lists = {};

  body.innerHTML = `
    <section class="card">
      <div class="card-head"><h3>Aynı isteği modellere yazdır</h3><span class="small muted">2 ya da 3 model</span></div>
      <form id="cmp-form" class="stack-sm">
        <div class="row-between" style="flex-wrap:wrap">
          <div class="seg" role="tablist" aria-label="İstek türü">${Object.entries(kinds).map(([k, v]) => `<button type="button" role="tab" data-kind="${k}" class="${k === kind ? 'active' : ''}" aria-selected="${k === kind}">${esc(v)}</button>`).join('')}</div>
          <select class="select w-auto" id="cmp-brand" aria-label="Marka"><option value="">Markasız (genel)</option>${state.brands.map(b => `<option value="${esc(b.id)}" ${b.id === state.activeBrandId ? 'selected' : ''}>${esc(b.name)} (marka diliyle)</option>`).join('')}</select>
        </div>
        <div class="field"><label for="cmp-brief">İstek</label>
          <textarea class="textarea" id="cmp-brief" rows="4" maxlength="3000" placeholder="Ör. Vize haftasında öğrencilere %20 indirimli menü"></textarea>
          <span class="hint" id="cmp-kind-hint"></span></div>
        <div class="field"><span class="field-label">Modeller</span>
          <div class="chips" id="cmp-models"></div>
          <div class="row mt-2"><select class="select w-auto" id="cmp-extra" aria-label="Başka model ekle" hidden></select><button type="button" class="btn btn-sm btn-ghost" id="cmp-more">${icon('plus')}Başka model ekle</button></div>
          <span class="hint" id="cmp-est"></span></div>
        <div class="card-actions" style="margin-top:0"><button class="btn btn-primary" type="submit">${icon('sparkle')}Karşılaştır</button><span class="small muted">Her model ayrı ücretlendirilir; tutarlar Harcama sekmesine işlenir.</span></div>
      </form>
    </section>
    <div id="cmp-results" class="mt-5"></div>
    <section class="card mt-5" id="cmp-history"></section>
    ${optionsTable(ov)}`;

  const kindHints = { serbest: 'İstek modele olduğu gibi gönderilir.', reels: 'Sahne sahne, süreli ve konuşma metinli 30-45 saniyelik senaryo istenir.', aciklama: 'İlk cümle, kısa paragraflar, çağrı ve hashtag\'li açıklama istenir.', fikir: '5 farklı içerik fikri ve önerilen format istenir.' };
  const labelOf = ref => { const m = ov.models.find(x => x.ref === ref); if (m) return m.label; for (const l of Object.values(lists)) { const x = l.find(y => y.ref === ref); if (x) return x.label || x.id; } return ref.split(':').slice(1).join(':'); };
  const priceOf = ref => { const m = ov.models.find(x => x.ref === ref); if (m) return m.price; for (const l of Object.values(lists)) { const x = l.find(y => y.ref === ref); if (x) return x.price; } return null; };

  function drawModels() {
    const refs = [...new Set([...available.map(m => m.ref), ...picked])];
    body.querySelector('#cmp-models').innerHTML = refs.map(ref => `<button type="button" class="chip ${picked.has(ref) ? 'active' : ''}" data-pick="${esc(ref)}" aria-pressed="${picked.has(ref)}">${picked.has(ref) ? '✓ ' : ''}${esc(labelOf(ref))}</button>`).join('');
    const est = [...picked].map(ref => priceOf(ref) ? `${labelOf(ref)} ≈ ${estimate(priceOf(ref))}` : `${labelOf(ref)}: fiyat bilinmiyor`).join(' · ');
    body.querySelector('#cmp-est').textContent = picked.size ? `Tahmini tutar (bir Reels senaryosu kadar metin): ${est}` : '';
    body.querySelector('#cmp-kind-hint').textContent = kindHints[kind];
  }
  drawModels();

  async function drawHistory(showId) {
    const box = body.querySelector('#cmp-history');
    try {
      const { comparisons, scoreboard } = await api.aiComparisons();
      box.innerHTML = `<div class="card-head"><h3>Önceki karşılaştırmalar</h3>${scoreboard.length ? `<span class="small muted">En çok seçtiğin: ${scoreboard.slice(0, 3).map(s => `${esc(s.label)} ×${s.wins}`).join(', ')}</span>` : ''}</div>
        ${comparisons.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Tarih</th><th>Tür</th><th>İstek</th><th>Seçtiğin</th><th></th></tr></thead><tbody>
          ${comparisons.map(c => `<tr><td class="nowrap">${esc(new Date(c.createdAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td class="nowrap">${esc(c.kindLabel)}</td><td>${esc(c.brief.slice(0, 80))}${c.brief.length > 80 ? '…' : ''}</td>
            <td>${c.winner ? esc(labelOf(c.winner)) : '<span class="muted">—</span>'}</td><td class="row-actions"><button class="btn btn-sm" data-show="${esc(c.id)}">Aç</button></td></tr>`).join('')}</tbody></table></div>`
          : emptyState({ icon: 'sparkle', title: 'Henüz karşılaştırma yok', text: 'Yukarıdan bir istek yaz ve 2-3 model seç.', compact: true })}`;
      if (showId) drawResults(comparisons.find(c => c.id === showId));
      box.onclick = e => { const b = e.target.closest('[data-show]'); if (b) { drawResults(comparisons.find(c => c.id === b.dataset.show)); body.querySelector('#cmp-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
    } catch (err) { box.innerHTML = errorNotice(err); }
  }

  function drawResults(c) {
    const box = body.querySelector('#cmp-results');
    if (!c) { box.innerHTML = ''; return; }
    const taskOptions = ov.tasks.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    box.innerHTML = `
      <div class="section-head"><h2>Sonuçlar</h2><span class="small muted">${esc(c.kindLabel)} · ${esc(c.brief.slice(0, 60))}${c.brief.length > 60 ? '…' : ''}</span></div>
      <div class="cmp-grid" style="--cols:${c.results.length}">${c.results.map(r => `
        <section class="card cmp-col ${c.winner === r.ref ? 'is-winner' : ''}">
          <div class="card-head"><h3>${esc(r.label)}</h3>${c.winner === r.ref ? '<span class="pill pill-ok"><span class="dot"></span>Seçtiğin</span>' : ''}</div>
          ${r.ok ? `<div class="xsmall muted">${(r.ms / 1000).toFixed(1).replace('.', ',')} sn · ${((r.usage.input || 0) + (r.usage.output || 0)).toLocaleString('tr-TR')} token · ${usd(r.cost)}</div>
            <div class="cmp-text">${esc(r.text)}</div>
            <div class="card-foot row">
              <button class="btn btn-sm ${c.winner === r.ref ? '' : 'btn-primary'}" data-win="${esc(r.ref)}">${c.winner === r.ref ? 'Seçimi kaldır' : 'Bunu seçtim'}</button>
              <select class="select w-auto tr-status" data-assign="${esc(r.ref)}" aria-label="Bu modeli bir işe ata"><option value="">İşe ata…</option>${taskOptions}</select>
              <button class="btn btn-sm btn-ghost" data-copy="${esc(r.ref)}">Kopyala</button>
            </div>` : `<div class="notice notice-error"><div><strong>Yanıt alınamadı.</strong> ${esc(r.error)}</div></div>`}
        </section>`).join('')}</div>`;
    box.onclick = async e => {
      const win = e.target.closest('[data-win]');
      if (win) {
        try { const { comparison } = await api.aiSetWinner(c.id, c.winner === win.dataset.win ? '' : win.dataset.win); drawResults(comparison); drawHistory(); } catch (err) { toast(err.message, 'error'); }
        return;
      }
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const r = c.results.find(x => x.ref === cp.dataset.copy);
        try { await navigator.clipboard.writeText(r.text); toast('Metin kopyalandı.', 'success'); } catch { toast('Kopyalanamadı; metni seçip Ctrl+C ile kopyala.', 'error'); }
      }
    };
    box.onchange = async e => {
      const sel = e.target.closest('[data-assign]');
      if (!sel || !sel.value) return;
      const task = ov.tasks.find(t => t.id === sel.value);
      try {
        await api.aiSaveTasks({ [task.id]: { primary: sel.dataset.assign, fallback: task.fallback || '' } });
        toast(`${labelOf(sel.dataset.assign)} artık "${task.label}" işinde kullanılacak.`, 'success');
        await refreshChrome();
      } catch (err) { toast(err.message, 'error'); }
      sel.value = '';
    };
  }

  body.querySelector('#cmp-form').addEventListener('click', async e => {
    const k = e.target.closest('[data-kind]');
    if (k) { kind = k.dataset.kind; body.querySelectorAll('[data-kind]').forEach(b => { b.classList.toggle('active', b === k); b.setAttribute('aria-selected', String(b === k)); }); drawModels(); return; }
    const p = e.target.closest('[data-pick]');
    if (p) {
      const ref = p.dataset.pick;
      if (picked.has(ref)) picked.delete(ref);
      else if (picked.size >= 3) return toast('En fazla 3 model seçebilirsin.', 'error');
      else picked.add(ref);
      return drawModels();
    }
    if (e.target.closest('#cmp-more')) {
      const sel = body.querySelector('#cmp-extra');
      if (!extraLoaded) {
        await busy(e.target.closest('#cmp-more'), async () => { lists = await liveLists(connected); });
        extraLoaded = true;
        sel.innerHTML = '<option value="">Model seç…</option>' + modelOptions(ov, lists, null);
      }
      sel.hidden = false;
      sel.focus();
    }
  });
  body.querySelector('#cmp-extra').addEventListener('change', e => {
    if (!e.target.value) return;
    if (picked.size >= 3) toast('En fazla 3 model seçebilirsin; önce birini kaldır.', 'error');
    else picked.add(e.target.value);
    e.target.value = '';
    drawModels();
  });
  body.querySelector('#cmp-form').addEventListener('submit', async e => {
    e.preventDefault();
    const brief = body.querySelector('#cmp-brief');
    if (!brief.value.trim()) { brief.focus(); return toast('Önce isteği yaz.', 'error'); }
    if (picked.size < 2) return toast('Karşılaştırmak için en az 2 model seç.', 'error');
    const out = body.querySelector('#cmp-results');
    out.innerHTML = `<div class="cmp-grid" style="--cols:${picked.size}">${[...picked].map(ref => `<section class="card"><div class="card-head"><h3>${esc(labelOf(ref))}</h3></div><div class="skeleton" style="height:220px"></div><p class="small muted mt-3">Yazıyor…</p></section>`).join('')}</div>`;
    try {
      const { comparison } = await busy(e.submitter, () => api.aiCompare({ brief: brief.value, kind, brandId: body.querySelector('#cmp-brand').value || null, models: [...picked] }));
      drawResults(comparison);
      drawHistory();
      refreshChrome();
    } catch (err) { out.innerHTML = errorNotice(err); }
  });
  drawHistory();
}

function optionsTable(ov) {
  return `
    <section class="card mt-5">
      <div class="card-head"><h3>Seçenekler ve maliyetler</h3><span class="small muted">USD, 1 milyon token başına (girdi / çıktı)</span></div>
      <p class="card-text mb-4">Öneri: Türkçe metin yazımında Claude modelleri öne çıkıyor; karar vermeden önce kendi markanla karşılaştır. "Yaklaşık" fiyatlar Kasım 2026 kaynaklarından; sağlayıcılar fiyat değiştirdikçe Harcama sekmesinden düzeltebilirsin. OpenRouter fiyatları canlı gelir.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Model</th><th>Sağlayıcı</th><th>Güçlü yanı</th><th>Fiyat</th><th>Bir Reels senaryosu ≈</th></tr></thead>
        <tbody>${ov.models.map(m => `<tr><td><b>${esc(m.label)}</b><div class="xsmall muted">${esc(m.tier)}</div></td><td>${esc(ov.providers.find(p => p.id === m.provider).label)}</td><td>${esc(m.strengths)}</td>
          <td class="nowrap">${perMillion(m.price)}<div class="xsmall muted">${esc(SOURCE_LABEL[m.price.source] || '')}</div></td><td class="nowrap">${estimate(m.price)}</td></tr>`).join('')}</tbody>
      </table></div>
      <details class="disclosure"><summary>Görsel ve video modelleri (Aşama 4'te bağlanacak)</summary>
        <div class="table-wrap mt-3"><table class="table"><thead><tr><th>Tür</th><th>Model</th><th>Yaklaşık fiyat</th><th>Not</th></tr></thead>
          <tbody>${MEDIA.map(x => `<tr><td>${esc(x[0])}</td><td><b>${esc(x[1])}</b></td><td>${esc(x[2])}</td><td class="small">${esc(x[3])}</td></tr>`).join('')}</tbody></table></div>
      </details>
    </section>`;
}

const MEDIA = [
  ['Görsel', 'Google Nano Banana 2 (Gemini Flash Image)', '≈ 0,045–0,15 $ / görsel', 'Referans görselle düzenleme ve karakter tutarlılığı güçlü; maskot pozları için uygun.'],
  ['Görsel', 'Google Nano Banana Pro (Gemini Pro Image)', '≈ 0,13–0,24 $ / görsel', 'Görsel içinde Türkçe yazı ve detayda daha iyi.'],
  ['Görsel', 'OpenAI GPT Image', '≈ 0,006–0,21 $ / görsel', 'Talimata sadakat ve yazı yerleştirme iyi.'],
  ['Görsel', 'FLUX.2', '≈ 0,014–0,07 $ / görsel', 'Fotoğraf gerçekçiliği.'],
  ['Görsel', 'Ideogram 4', '≈ 0,03–0,10 $ / görsel', 'Afiş ve tipografi ağırlıklı tasarımlar.'],
  ['Video', 'Google Veo 3.1 (Flow)', '≈ 0,05–0,40 $ / saniye', 'Eski sistemdeki Flow/Veo akışı; sesli, sinematik.'],
  ['Video', 'Kling 3.0', '≈ 0,07–0,14 $ / saniye', 'Genelde en uygun fiyatlı.'],
  ['Video', 'OpenAI Sora 2', '≈ 0,10–0,50 $ / saniye', 'API erişimi değişken.']
];

// ---------------------------------------------------------------- Sağlayıcılar ve modeller
async function renderProviders(body, ov, view) {
  const connected = ov.providers.filter(p => p.configured);
  body.innerHTML = `
    <div class="grid-2">${ov.providers.filter(p => !p.test).map(p => `
      <section class="card" data-provider="${p.id}">
        <div class="card-head"><h3>${esc(p.label)}</h3>${p.configured ? '<span class="pill pill-ok"><span class="dot"></span>Bağlı</span>' : '<span class="pill">Bağlı değil</span>'}</div>
        <p class="card-text">${esc(p.note)}</p>
        ${p.configured ? `<dl class="kv mt-3"><dt>Anahtar</dt><dd>${esc(p.keyHint)}${p.source === 'env' ? ' <span class="muted xsmall">(ortam değişkeninden)</span>' : ''}</dd></dl>` : ''}
        <form class="stack-sm card-section" data-key-form="${p.id}">
          <div class="field"><label for="key-${p.id}">${p.configured ? 'Anahtarı değiştir' : 'API anahtarı'}</label>
            <input class="input" id="key-${p.id}" type="password" autocomplete="off" maxlength="300" placeholder="${esc(p.keyPlaceholder)}">
            <span class="hint">Anahtarı <a class="link" href="${esc(p.keyUrl)}" target="_blank" rel="noopener">buradan</a> alabilirsin. Bağlan'a basınca denenir; çalışmazsa kaydedilmez. Anahtar yalnızca bu bilgisayarda saklanır.</span></div>
          <div class="row"><button class="btn btn-primary" type="submit">Bağlan</button>${p.configured && p.source === 'settings' ? `<button class="btn btn-danger" type="button" data-remove="${p.id}">Kaldır</button>` : ''}</div>
        </form>
      </section>`).join('')}</div>
    <section class="card mt-5" id="task-card">
      <div class="card-head"><h3>İşe göre model</h3></div>
      ${connected.length ? `<p class="card-text mb-4">Her iş için bir model ve isteğe bağlı bir yedek seç. Seçili model geçici bir hata verirse (bağlantı, kota, sunucu) istek kendiliğinden yedek modelle tekrarlanır.</p>
        <div class="stack-sm" id="task-rows"><div class="skeleton" style="height:120px"></div></div>
        <div class="card-actions"><button class="btn btn-primary" id="save-tasks">Atamaları kaydet</button></div>`
        : emptyState({ icon: 'sparkle', title: 'Önce bir sağlayıcı bağla', text: 'Yukarıdan en az bir anahtar ekleyince işlere model atayabilirsin.', compact: true })}
    </section>
    <section class="card mt-5" id="image-card"><div class="card-head"><h3>Görsel üretimi</h3></div><div id="image-default"><div class="skeleton" style="height:60px"></div></div></section>`;
  api.imageOverview().then(io => {
    const box = body.querySelector('#image-default');
    if (!box) return;
    if (!io.configured) { box.innerHTML = '<p class="card-text">Görsel üretmek için Gemini, OpenAI ya da OpenRouter anahtarı ekle. Claude görsel üretmez.</p>'; return; }
    box.innerHTML = `<p class="card-text mb-3">Prompt Studio ve Kütüphane'de varsayılan olarak seçilecek görsel modeli. Ücret görsel başınadır; harcama "Görsel üretimi" işi olarak izlenir.</p>
      <table class="table"><thead><tr><th>Model</th><th>Sağlayıcı</th><th>Görsel başı</th><th>Maskot referansı</th><th>Not</th></tr></thead><tbody>${io.models.filter(m => m.available).map(m => `<tr><td><label class="check"><input type="radio" name="img-default" value="${esc(m.ref)}" ${m.ref === io.default ? 'checked' : ''}> ${esc(m.label)}</label></td><td>${esc(m.providerLabel)}</td><td>~${m.perImage.toFixed(3).replace('.', ',')} $</td><td>${m.refs ? 'Var' : '—'}</td><td class="small muted">${esc(m.note)}</td></tr>`).join('')}</tbody></table>`;
    box.addEventListener('change', async e => {
      if (e.target.name !== 'img-default') return;
      try { await api.setImageDefault(e.target.value); toast('Varsayılan görsel modeli kaydedildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
    });
  }).catch(() => {});

  body.querySelectorAll('[data-key-form]').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    const id = form.dataset.keyForm;
    const input = form.querySelector('input');
    if (!input.value.trim()) { input.focus(); return toast('Önce anahtarı yapıştır.', 'error'); }
    try {
      const r = await busy(e.submitter, () => api.aiSaveKey(id, input.value));
      toast(`${r.providers.find(p => p.id === id).label} bağlandı (${r.modelCount} model).`, 'success');
      await refreshChrome();
      renderAi(view, 'modeller');
    } catch (err) { toast(err.message, 'error'); }
  }));
  body.onclick = async e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      if (!confirm('Bu sağlayıcının anahtarı kaldırılsın mı? Bu sağlayıcıya atanmış işler başka bir bağlı sağlayıcıya geçer.')) return;
      try { await api.aiRemoveKey(rm.dataset.remove); toast('Anahtar kaldırıldı.', 'success'); await refreshChrome(); renderAi(view, 'modeller'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const save = e.target.closest('#save-tasks');
    if (save) {
      const tasks = {};
      body.querySelectorAll('[data-task]').forEach(row => {
        tasks[row.dataset.task] = { primary: row.querySelector('[data-role=primary]').value, fallback: row.querySelector('[data-role=fallback]').value };
      });
      try { await busy(save, () => api.aiSaveTasks(tasks)); toast('Atamalar kaydedildi.', 'success'); await refreshChrome(); renderAi(view, 'modeller'); } catch (err) { toast(err.message, 'error'); }
    }
  };

  if (!connected.length) return;
  const lists = await liveLists(connected);
  const rows = body.querySelector('#task-rows');
  if (!rows) return;
  rows.innerHTML = ov.tasks.map(t => `
    <div class="task-assign" data-task="${t.id}">
      <div><div class="strong">${esc(t.label)}</div><div class="xsmall muted">${esc(t.hint)}${t.auto && t.primary ? ' Şu an otomatik seçildi.' : ''}</div></div>
      <div class="field"><label for="tp-${t.id}">Model</label><select class="select" id="tp-${t.id}" data-role="primary">${modelOptions(ov, lists, t.primary)}</select></div>
      <div class="field"><label for="tf-${t.id}">Yedek model</label><select class="select" id="tf-${t.id}" data-role="fallback">${modelOptions(ov, lists, t.fallback, { allowNone: true })}</select></div>
    </div>`).join('');
}

// ---------------------------------------------------------------- Harcama
async function renderSpend(body, ov, view, month) {
  let u;
  try { u = await api.aiUsage(month); } catch (err) { body.innerHTML = errorNotice(err); return; }
  const b = u.budget;
  const pct = b.monthlyUsd > 0 ? Math.min(100, Math.round((b.spent / b.monthlyUsd) * 100)) : 0;
  // Dar kartlara sığsın diye token sayısı adın altında
  const table = (rows, label) => rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${label}</th><th>Çağrı</th><th style="text-align:right">Tutar</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${esc(r.label || r.k)}</b><div class="xsmall muted">${(r.input || 0).toLocaleString('tr-TR')} / ${(r.output || 0).toLocaleString('tr-TR')} token${r.failed ? ` · ${r.failed} hatalı` : ''}</div></td><td>${r.calls}</td><td class="nowrap" style="text-align:right"><b>${usd(r.cost)}</b></td></tr>`).join('')}</tbody></table></div>`
    : emptyState({ icon: 'chart', title: 'Bu ay kayıt yok', compact: true });
  const isCurrent = !month || month === u.month;

  body.innerHTML = `
    <div class="toolbar"><label class="small muted" for="spend-month">Ay</label><input class="input w-auto" type="month" id="spend-month" value="${esc(u.month)}"></div>
    <div class="kpis">
      <div class="kpi k1"><div class="kpi-icon">${icon('chart')}</div><div class="kpi-num">${usd(u.total.cost)}</div><div class="kpi-label">${isCurrent ? 'Bu ay harcanan' : 'Harcanan'}</div><div class="kpi-sub">${esc(u.month)}</div></div>
      <div class="kpi k4"><div class="kpi-icon">${icon('sparkle')}</div><div class="kpi-num">${u.total.calls}</div><div class="kpi-label">AI çağrısı</div><div class="kpi-sub">${u.total.failed} tanesi hatalı</div></div>
      <div class="kpi ${b.warning ? 'k3' : 'k2'}"><div class="kpi-icon">${icon('alert')}</div><div class="kpi-num">${b.monthlyUsd > 0 ? usd(b.monthlyUsd) : 'Yok'}</div><div class="kpi-label">Aylık sınır</div><div class="kpi-sub">${b.monthlyUsd > 0 ? `%${b.percent} kullanıldı` : 'sınırsız'}</div></div>
    </div>
    <section class="card mt-5">
      <div class="card-head"><h3>Aylık sınır</h3>${b.blocked ? '<span class="pill pill-warn"><span class="dot"></span>Sınır doldu</span>' : b.warning ? '<span class="pill pill-warn"><span class="dot"></span>Sınıra yaklaşıldı</span>' : ''}</div>
      ${b.monthlyUsd > 0 ? `<div class="progress"><span style="width:${pct}%;${b.warning ? 'background:var(--c-orange)' : ''}"></span></div><p class="small muted mt-2">${usd(b.spent)} / ${usd(b.monthlyUsd)} · sınıra ulaşılınca yeni AI istekleri yapılmaz, sınırı artırınca devam eder.</p>` : '<p class="card-text">Sınır yok. Bir tutar girersen o tutara ulaşıldığında yeni AI istekleri durdurulur; uyarı eşiğinde üst çubukta uyarı çıkar.</p>'}
      <form id="budget-form" class="row card-section">
        <div class="field"><label for="b-limit">Aylık sınır ($, 0 = sınırsız)</label><input class="input w-sm" id="b-limit" type="number" min="0" step="0.5" value="${b.monthlyUsd}"></div>
        <div class="field"><label for="b-warn">Uyarı eşiği (%)</label><input class="input w-sm" id="b-warn" type="number" min="10" max="100" step="5" value="${b.warnPercent}"></div>
        <button class="btn btn-primary" type="submit" style="align-self:flex-end">Kaydet</button>
      </form>
    </section>
    <div class="grid-3 mt-5">
      <section class="card"><div class="card-head"><h3>Markaya göre</h3></div>${table(u.byBrand, 'Marka')}</section>
      <section class="card"><div class="card-head"><h3>İşe göre</h3></div>${table(u.byTask, 'İş')}</section>
      <section class="card"><div class="card-head"><h3>Modele göre</h3></div>${table(u.byModel, 'Model')}</section>
    </div>
    <section class="card mt-5">
      <div class="card-head"><h3>Fiyatlar</h3><span class="small muted">USD / 1 milyon token</span></div>
      <p class="card-text mb-4">Tutarlar bu fiyatlarla hesaplanır (OpenRouter gerçek tutarı kendisi bildirir). Sağlayıcı fiyat değiştirirse buradan düzelt.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Model</th><th>Girdi</th><th>Çıktı</th><th>Kaynak</th><th></th></tr></thead><tbody>
        ${ov.models.map(m => `<tr data-price="${esc(m.ref)}"><td><b>${esc(m.label)}</b></td>
          <td><input class="input w-auto" style="width:96px" type="number" min="0" step="0.01" value="${m.price.input}" aria-label="${esc(m.label)} girdi fiyatı" data-in></td>
          <td><input class="input w-auto" style="width:96px" type="number" min="0" step="0.01" value="${m.price.output}" aria-label="${esc(m.label)} çıktı fiyatı" data-out></td>
          <td class="small muted">${esc(SOURCE_LABEL[m.price.source] || '')}</td>
          <td class="row-actions"><button class="btn btn-sm" data-save-price>Kaydet</button>${m.price.source === 'elle' ? '<button class="btn btn-sm btn-ghost" data-reset-price>Varsayılan</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div>
    </section>`;

  body.querySelector('#spend-month').addEventListener('change', e => renderSpend(body, ov, view, e.target.value || null));
  body.querySelector('#budget-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await busy(e.submitter, () => api.aiSaveBudget({ monthlyUsd: Number(body.querySelector('#b-limit').value || 0), warnPercent: Number(body.querySelector('#b-warn').value || 80) }));
      toast('Sınır kaydedildi.', 'success');
      await refreshChrome();
      renderAi(view, 'harcama');
    } catch (err) { toast(err.message, 'error'); }
  });
  body.onclick = async e => {
    const row = e.target.closest('[data-price]');
    if (!row) return;
    const save = e.target.closest('[data-save-price]');
    const reset = e.target.closest('[data-reset-price]');
    if (!save && !reset) return;
    try {
      await busy(save || reset, () => api.aiSavePrice(row.dataset.price, reset ? null : { input: Number(row.querySelector('[data-in]').value), output: Number(row.querySelector('[data-out]').value) }));
      toast(reset ? 'Varsayılan fiyata dönüldü.' : 'Fiyat kaydedildi.', 'success');
      renderAi(view, 'harcama');
    } catch (err) { toast(err.message, 'error'); }
  };
}
