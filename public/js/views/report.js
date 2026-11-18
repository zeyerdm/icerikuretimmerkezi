// Aşama 5.18: Aylık rapor. Marka başına seçilen ayın üretim ve performans özeti; "PDF olarak kaydet" tarayıcının
// yazdırma penceresini açar (Hedef: PDF olarak kaydet). Bütün sayılar gerçek kayıtlardan hesaplanır.
import { api } from '../api.js';
import { esc, icon, emptyState, TR_MONTHS, toast, busy } from '../ui.js';
import { aiModels, modelSelect } from '../aiPicker.js';

export async function renderReport(view, brand) {
  view.onclick = null;
  const now = new Date();
  let month = new Date(now.getFullYear(), now.getMonth(), 1);
  const [{ contents }, dash, models] = await Promise.all([api.contents({ brandId: brand.id, limit: 10000 }), api.dashboard(brand.id), aiModels()]);
  const aiReady = models.ov.providers.some(p => p.configured);
  const mkey = m => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  let perf = { entries: [], report: null, kinds: {}, metrics: {} };
  const loadPerf = async () => { perf = await api.perf(brand.id, mkey(month)); };
  await loadPerf();
  const inMonth = (iso, m) => { if (!iso) return false; const d = new Date(iso); return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); };
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

  // Bu ayın en çok tutan içerikleri (elle giriş + ekran görüntüsü) ve AI'ın sonraki ay önerileri
  const fmtN = n => Number(n).toLocaleString('tr-TR');
  function perfSection() {
    const { entries, report: rep, kinds, metrics } = perf;
    const mk = Object.keys(metrics);
    const applied = (rep && rep.applied) || {};
    const ideaRow = (kind, key, title, sub, why) => `<label class="perf-idea ${applied[`${kind}:${key}`] ? 'done' : ''}"><input type="checkbox" data-apply="${kind}" value="${esc(key)}" ${applied[`${kind}:${key}`] ? 'checked disabled' : 'checked'}><span><b>${esc(title)}</b>${sub ? `<span class="xsmall muted"> · ${esc(sub)}</span>` : ''}${why ? `<br><span class="xsmall muted">${esc(why)}</span>` : ''}</span></label>`;
    return `<section class="perf">
      <h2>Bu ayın en çok tutanları</h2>
      ${entries.length ? `<table class="table rep-table perf-table"><thead><tr><th>İçerik</th><th>Tür</th>${mk.map(k => `<th>${esc(metrics[k])}</th>`).join('')}<th>Etkileşim</th><th class="no-print"></th></tr></thead><tbody>
        ${entries.map(e => `<tr><td>${e.url ? `<a class="link" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}${e.note ? `<div class="xsmall muted">${esc(e.note)}</div>` : ''}${e.assets.length ? `<div class="perf-shots">${e.assets.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="Ekran görüntüsü"></a>`).join('')}</div>` : ''}</td>
          <td>${esc(e.kindLabel)}</td>${mk.map(k => `<td>${e.metrics[k] != null ? fmtN(e.metrics[k]) : '—'}</td>`).join('')}<td>${e.rate != null ? `<b>%${e.rate}</b>` : '—'}</td>
          <td class="no-print"><button class="btn btn-sm btn-ghost icon-btn" data-perf-del="${esc(e.id)}" aria-label="Kaydı sil">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="small muted">Bu ay en çok izlenen, beğenilen ya da takipçi getiren içerikleri gir; istersen istatistik ekranının görüntüsünü ekle. Yapay zekâ bunlara bakıp sonraki ay için öneri verir.</p>'}
      <form class="perf-form no-print" id="perf-form">
        <div class="perf-grid">
          <div class="field perf-title"><label for="pf-title">İçerik</label><input class="input input-sm" id="pf-title" name="title" maxlength="200" placeholder="Ör. Yapay zekâ ile kod yazmanın 5 kuralı"></div>
          <div class="field"><label for="pf-kind">Tür</label><select class="select input-sm" id="pf-kind" name="kind">${Object.entries(kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          ${mk.map(k => `<div class="field"><label for="pf-${k}">${esc(metrics[k])}</label><input class="input input-sm" id="pf-${k}" name="m-${k}" type="number" min="0" step="1" inputmode="numeric"></div>`).join('')}
          <div class="field perf-title"><label for="pf-url">Bağlantı</label><input class="input input-sm" id="pf-url" name="url" maxlength="400" placeholder="https://instagram.com/p/…"></div>
          <div class="field perf-title"><label for="pf-note">Not</label><input class="input input-sm" id="pf-note" name="note" maxlength="1000" placeholder="Neden tuttuğunu düşünüyorsun?"></div>
          <div class="field perf-title"><label for="pf-shots">Ekran görüntüsü (en fazla 4)</label><input class="input input-sm" id="pf-shots" name="shots" type="file" accept="image/png,image/jpeg,image/webp" multiple></div>
        </div>
        <button class="btn btn-sm" type="submit">${icon('plus')}Ekle</button>
      </form>
      <div class="perf-ai no-print">
        ${aiReady ? `<div class="row">${modelSelect(models, 'yazim', { id: 'perf-model' })}<button class="btn btn-primary" data-perf-analyze ${entries.length ? '' : 'disabled'}>${icon('sparkle')}${rep ? 'Yeniden analiz et' : 'Yapay zekâ ile analiz et ve öneri al'}</button></div>`
          : '<div class="notice"><div>AI bağlı değil. Kayıtlar saklanır; öneri almak için bir sağlayıcı bağla.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>'}
      </div>
      ${rep ? `<div class="perf-report">
        <div class="row perf-rep-head"><h3 class="grow">Yapay zekâ önerileri: sonraki ay</h3><label class="check no-print"><input type="checkbox" id="perf-active" ${rep.active ? 'checked' : ''}> Sonraki ay üretimde bu odakları kullan</label></div>
        ${rep.summary ? `<p>${esc(rep.summary)}</p>` : ''}
        <div class="perf-cols">
          ${[['Odaklan', rep.focus], ['Neden tuttu', rep.worked], ['Zayıf kalanlar', rep.weak], ['Tasarımı böyle geliştir', rep.design], ['Format ve yayın', rep.formats]].filter(([, v]) => v && v.length).map(([t, v]) => `<div><h4>${t}</h4><ul class="rep-list">${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
        </div>
        ${rep.ideas && (rep.ideas.add.length || rep.ideas.revise.length || rep.ideas.archive.length) ? `<div class="perf-ideas">
          <h4>Fikir havuzunu revize et</h4>
          ${rep.ideas.add.length ? `<div class="xsmall muted mt-2">Havuza eklenecek</div>${rep.ideas.add.map((x, i) => ideaRow('add', i, x.title, x.description, x.why)).join('')}` : ''}
          ${rep.ideas.revise.length ? `<div class="xsmall muted mt-2">Revize edilecek</div>${rep.ideas.revise.map(x => ideaRow('revise', x.id, x.title, `önce: ${x.before}`, x.why)).join('')}` : ''}
          ${rep.ideas.archive.length ? `<div class="xsmall muted mt-2">Arşivlenecek</div>${rep.ideas.archive.map(x => ideaRow('archive', x.id, x.title, '', x.why)).join('')}` : ''}
          <button class="btn btn-sm btn-primary mt-2 no-print" data-perf-apply>${icon('check')}Seçilenleri fikir havuzuna uygula</button>
        </div>` : ''}
        <div class="xsmall muted mt-2">${esc(new Date(rep.createdAt).toLocaleString('tr-TR'))}${rep.model ? ` · ${esc(rep.model)}` : ''}</div>
      </div>` : ''}
    </section>`;
  }

  function draw() {
    const label = `${TR_MONTHS[month.getMonth()]} ${month.getFullYear()}`;
    const planned = contents.filter(c => inMonth(c.scheduledAt, month));
    const created = contents.filter(c => inMonth(c.createdAt, month));
    const completed = contents.filter(c => inMonth(c.completedAt, month));
    const published = planned.filter(c => c.status === 'yayinlandi');
    const ideas = dash.ideas.filter(x => inMonth(x.createdAt, month));
    const rated = planned.filter(c => c.rate != null).sort((a, b) => b.rate - a.rate);
    const avg = rated.length ? Math.round(rated.reduce((n, c) => n + c.rate, 0) / rated.length * 10) / 10 : null;
    const byType = Object.values(planned.reduce((m, c) => { (m[c.type] = m[c.type] || { label: c.typeLabel, n: 0, done: 0 }).n++; if (c.done) m[c.type].done++; return m; }, {})).sort((a, b) => b.n - a.n);
    const late = planned.filter(c => !c.done && new Date(c.scheduledAt) < now);
    const highlights = [
      published.length ? `${published.length} içerik yayınlandı.` : 'Bu ay yayınlanan içerik yok.',
      rated[0] ? `En yüksek etkileşim: "${rated[0].title}" (%${rated[0].rate}).` : null,
      avg != null ? `Ölçülen ${rated.length} içeriğin ortalama etkileşim oranı %${avg}.` : null,
      byType[0] ? `En çok üretilen tür: ${byType[0].label} (${byType[0].n}).` : null,
      late.length ? `${late.length} içerik tarihi geçtiği halde tamamlanmadı.` : null,
      ideas.length ? `Fikir havuzuna ${ideas.length} yeni fikir eklendi.` : null
    ].filter(Boolean);
    view.innerHTML = `
      <div class="rep-tools no-print">
        <button class="btn icon-btn" data-m="-1" aria-label="Önceki ay">${icon('chevronLeft')}</button>
        <b class="rep-month">${esc(label)}</b>
        <button class="btn icon-btn" data-m="1" aria-label="Sonraki ay" ${month >= new Date(now.getFullYear(), now.getMonth(), 1) ? 'disabled' : ''}>${icon('chevronRight')}</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-print>${icon('download')}PDF olarak kaydet</button>
      </div>
      <article class="report card" style="--rep:${esc(brand.colors.primary || '#7d6bf0')}">
        <header class="rep-head">
          ${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="">` : ''}
          <div><div class="rep-kicker">Aylık içerik raporu</div><h1>${esc(brand.name)} · ${esc(label)}</h1><div class="xsmall muted">Oluşturuldu: ${esc(now.toLocaleString('tr-TR'))} · KREATİFHANE</div></div>
        </header>
        <section class="rep-kpis">
          ${[['Planlanan', planned.length], ['Yayınlanan', published.length], ['Tamamlanan', completed.length], ['Yeni içerik kaydı', created.length], ['Yeni fikir', ideas.length], ['Ort. etkileşim', avg != null ? '%' + avg : '—']].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}
        </section>
        ${perfSection()}
        <section><h2>Öne çıkanlar</h2><ul class="rep-list">${highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul></section>
        ${planned.length ? `
        <section><h2>Türe göre</h2><table class="table rep-table"><thead><tr><th>Tür</th><th>Planlanan</th><th>Tamamlanan</th><th>Oran</th></tr></thead>
          <tbody>${byType.map(t => `<tr><td>${esc(t.label)}</td><td>${t.n}</td><td>${t.done}</td><td><span class="rep-bar"><i style="width:${pct(t.done, t.n)}%"></i></span> %${pct(t.done, t.n)}</td></tr>`).join('')}</tbody></table></section>
        ${rated.length ? `<section><h2>En iyi performans</h2><table class="table rep-table"><thead><tr><th>İçerik</th><th>Tür</th><th>Tarih</th><th>Etkileşim</th></tr></thead>
          <tbody>${rated.slice(0, 5).map(c => `<tr><td>${esc(c.title)}</td><td>${esc(c.typeLabel)}</td><td>${esc(new Date(c.scheduledAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))}</td><td><b>%${c.rate}</b></td></tr>`).join('')}</tbody></table></section>` : ''}
        <section><h2>Bu ayın içerikleri</h2><table class="table rep-table"><thead><tr><th>Tarih</th><th>İçerik</th><th>Tür</th><th>Durum</th></tr></thead>
          <tbody>${planned.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).map(c => `<tr><td>${esc(new Date(c.scheduledAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))}</td><td>${esc(c.title)}</td><td>${esc(c.typeLabel)}</td><td><span class="status-badge status-${esc(c.status)}">${esc(c.statusLabel)}</span></td></tr>`).join('')}</tbody></table></section>`
        : `<section>${emptyState({ icon: 'calendar', title: 'Bu ay için planlanmış içerik yok', text: 'Takvime içerik ekledikçe rapor dolar.', compact: true })}</section>`}
        <footer class="rep-foot xsmall muted">Etkileşim oranı, içeriklere girilen metriklerden (beğeni, yorum, kaydetme, paylaşım / erişim) hesaplanır.</footer>
      </article>`;
  }
  view.onsubmit = async e => {
    if (e.target.id !== 'perf-form') return;
    e.preventDefault();
    const f = new FormData(e.target); const btn = e.target.querySelector('[type=submit]');
    const metrics = Object.fromEntries(Object.keys(perf.metrics).map(k => [k, f.get(`m-${k}`)]).filter(([, v]) => v !== '' && v != null));
    const files = [...(e.target.querySelector('#pf-shots').files || [])].slice(0, 4);
    try {
      await busy(btn, async () => {
        const assetIds = [];
        for (const file of files) assetIds.push((await api.uploadAsset(brand.id, file, 'insight', `Performans ${mkey(month)}: ${String(f.get('title') || '').slice(0, 40)}`)).asset.id);
        await api.addPerfEntry(brand.id, mkey(month), { title: f.get('title'), kind: f.get('kind'), metrics, url: f.get('url'), note: f.get('note'), assetIds });
      });
      await loadPerf(); draw(); toast('Eklendi.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  view.onchange = async e => {
    if (e.target.id !== 'perf-active') return;
    try { await api.setPerfActive(brand.id, mkey(month), e.target.checked); toast(e.target.checked ? 'Sonraki üretimlerde bu odaklar dikkate alınacak.' : 'Odaklar üretimde kullanılmayacak.', 'success'); await loadPerf(); }
    catch (err) { toast(err.message, 'error'); }
  };
  view.onclick = async e => {
    const m = e.target.closest('[data-m]');
    if (m && !m.disabled) { month = new Date(month.getFullYear(), month.getMonth() + Number(m.dataset.m), 1); await loadPerf(); return draw(); }
    const del = e.target.closest('[data-perf-del]');
    if (del) { if (!confirm('Bu kayıt silinsin mi?')) return; try { await api.deletePerfEntry(brand.id, del.dataset.perfDel); await loadPerf(); draw(); } catch (err) { toast(err.message, 'error'); } return; }
    const an = e.target.closest('[data-perf-analyze]');
    if (an) {
      try { await busy(an, () => api.analyzePerf(brand.id, mkey(month), { model: (view.querySelector('#perf-model') || {}).value || null })); await loadPerf(); draw(); toast('Öneriler hazır.', 'success'); }
      catch (err) { toast(err.message, 'error'); }
      return;
    }
    const ap = e.target.closest('[data-perf-apply]');
    if (ap) {
      const pick = k => [...view.querySelectorAll(`[data-apply="${k}"]:checked:not(:disabled)`)].map(x => x.value);
      try {
        const r = await busy(ap, () => api.applyPerf(brand.id, mkey(month), { add: pick('add'), revise: pick('revise'), archive: pick('archive') }));
        toast(`${r.done.add.length} fikir eklendi, ${r.done.revise.length} revize edildi, ${r.done.archive.length} arşivlendi.`, 'success');
        await loadPerf(); draw();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('[data-print]')) { const t = document.title; document.title = `${brand.name} - ${TR_MONTHS[month.getMonth()]} ${month.getFullYear()} raporu`; window.print(); document.title = t; }
  };
  draw();
}
