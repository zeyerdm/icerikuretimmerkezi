// Aşama 5.18: Aylık rapor. Marka başına seçilen ayın üretim ve performans özeti; "PDF olarak kaydet" tarayıcının
// yazdırma penceresini açar (Hedef: PDF olarak kaydet). Bütün sayılar gerçek kayıtlardan hesaplanır.
import { api } from '../api.js';
import { esc, icon, emptyState, TR_MONTHS } from '../ui.js';

export async function renderReport(view, brand) {
  view.onclick = null;
  const now = new Date();
  let month = new Date(now.getFullYear(), now.getMonth(), 1);
  const [{ contents }, dash] = await Promise.all([api.contents({ brandId: brand.id }), api.dashboard(brand.id)]);
  const inMonth = (iso, m) => { if (!iso) return false; const d = new Date(iso); return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); };
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

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
  view.onclick = e => {
    const m = e.target.closest('[data-m]');
    if (m && !m.disabled) { month = new Date(month.getFullYear(), month.getMonth() + Number(m.dataset.m), 1); return draw(); }
    if (e.target.closest('[data-print]')) { const t = document.title; document.title = `${brand.name} - ${TR_MONTHS[month.getMonth()]} ${month.getFullYear()} raporu`; window.print(); document.title = t; }
  };
  draw();
}
