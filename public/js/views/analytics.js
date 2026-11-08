// Analizler: yönetim merkezinde bütün markalar, marka çalışma alanında yalnızca o marka.
// Bütün grafikler gerçek kayıtlardan hesaplanır; veri yoksa açıklayıcı boş durum gösterilir.
import { api } from '../api.js';
import { esc, columnChart, hbarChart, donutChart, pageHead, skeletonPage } from '../ui.js';
import { state } from '../app.js';
import * as S from '../stats.js';

export async function renderAnalytics(view, { brand } = {}) {
  view.innerHTML = skeletonPage({ cards: 4, height: 260 });
  const [d, pf] = await Promise.all([api.dashboard(brand ? brand.id : null), api.performance(brand ? brand.id : null)]);
  const perf = S.performance(d);
  const k = S.counts(d);
  const series = [{ name: 'Üretilen (içerik + fikir)', color: 'var(--c-violet)' }, { name: 'Tamamlanan içerik', color: 'var(--c-teal)' }];
  const metric = (value, label, sub) => `<div class="metric"><b>${value}</b><span>${esc(label)}</span>${sub ? `<em>${esc(sub)}</em>` : ''}</div>`;
  const statusSegs = S.byStatus(d, state.meta.contentStatuses);

  view.innerHTML = `
    ${pageHead({ title: brand ? 'Marka analizleri' : 'Analizler', desc: `${brand ? esc(brand.name) + ' markasının üretim verileri.' : 'Bütün markaların içerik üretim verileri.'} Grafikler gerçek kayıtlardan hesaplanır.` })}

    <section class="card metrics">
      ${metric('%' + perf.completionRate, 'Tamamlanma oranı', `${d.contents.filter(c => c.done).length} / ${k.contents} içerik`)}
      ${metric(perf.onTimeRate == null ? '—' : '%' + perf.onTimeRate, 'Zamanında tamamlanan', 'yayın tarihine kadar biten')}
      ${metric(perf.weeklyAverage, 'Haftalık ortalama', 'son 8 haftada eklenen içerik')}
      ${metric(perf.overdue, 'Geciken içerik', 'tarihi geçmiş, bitmemiş')}
      ${metric(k.ideas, 'Fikir havuzu', 'kaydedilen fikir')}
    </section>

    <div class="grid-2 mb-5">
      <section class="card"><div class="card-head"><h3>Haftalık üretim</h3><span class="small muted">Son 8 hafta</span></div>
        ${columnChart(S.weeks(d, 8), series, { height: 180, empty: 'Son 8 haftada üretim yok.' })}</section>
      <section class="card"><div class="card-head"><h3>Aylık içerik sayısı</h3><span class="small muted">Son 6 ay</span></div>
        ${columnChart(S.months(d, 6), [{ name: 'Eklenen içerik', color: 'var(--c-violet)' }, { name: 'Tamamlanan', color: 'var(--c-teal)' }], { height: 180, empty: 'Son 6 ayda içerik eklenmedi.' })}</section>
    </div>

    <div class="grid-3">
      ${brand
        ? `<section class="card"><div class="card-head"><h3>Fikirler: kategorilere göre</h3></div>${hbarChart(S.ideasByCategory(d, state.meta.ideaCategories), { empty: 'Henüz fikir yok.' })}</section>`
        : `<section class="card"><div class="card-head"><h3>Marka bazında üretim</h3></div>${hbarChart(S.byBrand(d), { empty: 'Henüz marka veya içerik yok.' })}</section>`}
      <section class="card"><div class="card-head"><h3>İçerik türlerine göre</h3></div>${donutChart(S.byType(d, state.meta.contentTypes), { center: `${k.contents}<small>içerik</small>`, empty: 'Henüz içerik yok.' })}</section>
      <section class="card"><div class="card-head"><h3>Tamamlanan ve bekleyen</h3></div>${donutChart(statusSegs, { center: `%${perf.completionRate}<small>tamam</small>`, empty: 'Henüz içerik yok.' })}</section>
    </div>
    ${worked(pf)}`;
}

// "Ne işe yaradı": paylaşım sonucu girilmiş içeriklerden; gün/saat yerel saate göre burada hesaplanır
const pct = v => (v == null ? '—' : '%' + String(v).replace('.', ','));
const fmtN = n => Number(n || 0).toLocaleString('tr-TR');
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
function worked(pf) {
  if (!pf.count) {
    return `<section class="card mt-5"><div class="card-head"><h3>Ne işe yaradı?</h3></div>
      <p class="card-text">Henüz paylaşım sonucu girilmedi. Takvimde ya da arşivde yayınlanan bir içeriği açıp "Paylaşım sonucu" bölümüne izlenme, beğeni, kaydetme ve paylaşım sayılarını gir; en çok tutan içerikler, türler, temalar, giriş cümleleri ve paylaşım saatleri burada görünür.</p></section>`;
  }
  const bucket = (fn, labels) => {
    const m = new Map();
    pf.times.forEach(t => { const k = fn(new Date(t.at)); if (!m.has(k)) m.set(k, []); m.get(k).push(t.rate); });
    return [...m.entries()].map(([k, list]) => ({ label: labels(k), value: Math.round(list.reduce((a, b) => a + b, 0) / list.length * 10) / 10, count: list.length })).sort((a, b) => b.value - a.value);
  };
  const days = bucket(d => d.getDay(), k => DAYS[k]);
  const hours = bucket(d => Math.floor(d.getHours() / 3) * 3, k => `${String(k).padStart(2, '0')}:00–${String(k + 3).padStart(2, '0')}:00`);
  const bars = list => hbarChart(list.map(x => ({ label: `${x.label} (${x.count})`, value: x.value })), { empty: 'Yeterli veri yok.' });
  const row = c => `<tr><td><div class="strong">${esc(c.title)}</div>${c.hook ? `<div class="xsmall muted">"${esc(c.hook)}"</div>` : ''}</td><td>${esc(c.typeLabel)}</td><td>${fmtN(c.metrics.views)}</td><td>${fmtN(c.metrics.saves)}</td><td>${fmtN(c.metrics.shares)}</td><td class="strong">${pct(c.rate)}</td></tr>`;
  return `
    <section class="card metrics mt-5">
      <div class="metric"><b>${pf.count}</b><span>Sonucu girilen içerik</span></div>
      <div class="metric"><b>${fmtN(pf.totals.views)}</b><span>Toplam izlenme</span></div>
      <div class="metric"><b>${pct(pf.averageRate)}</b><span>Ortalama etkileşim</span><em>(beğeni+yorum+2×kaydetme+3×paylaşım) / izlenme</em></div>
      <div class="metric"><b>${fmtN(pf.totals.saves)}</b><span>Kaydetme</span></div>
      <div class="metric"><b>${fmtN(pf.totals.follows)}</b><span>Yeni takipçi</span></div>
    </section>
    <section class="card mt-5"><div class="card-head"><h3>Ne işe yaradı? En çok tutanlar</h3><span class="small muted">Asistan bunlardan öğrenir</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>İçerik</th><th>Tür</th><th>İzlenme</th><th>Kaydetme</th><th>Paylaşım</th><th>Etkileşim</th></tr></thead><tbody>${pf.top.map(row).join('')}</tbody></table></div>
      ${pf.bottom.length ? `<h4 class="mt-4 mb-2">En az tutanlar</h4><div class="table-wrap"><table class="table"><tbody>${pf.bottom.map(row).join('')}</tbody></table></div>` : ''}
    </section>
    <div class="grid-3 mt-5">
      <section class="card"><div class="card-head"><h3>Türe göre etkileşim</h3></div>${hbarChart(pf.byType.map(x => ({ label: `${x.label} (${x.count})`, value: x.rate })), { empty: 'Yeterli veri yok.' })}</section>
      <section class="card"><div class="card-head"><h3>Güne göre</h3></div>${bars(days)}</section>
      <section class="card"><div class="card-head"><h3>Saate göre</h3></div>${bars(hours)}</section>
    </div>
    <div class="grid-2 mt-5">
      <section class="card"><div class="card-head"><h3>Tutan giriş cümleleri</h3></div>
        ${pf.hooks.length ? `<ul class="issue-list">${pf.hooks.map(h => `<li>"${esc(h.hook)}" <span class="xsmall muted">· ${esc(h.type)} · ${pct(h.rate)}</span></li>`).join('')}</ul>` : '<p class="card-text">İçeriklere giriş cümlesi yazdıkça burada sıralanır.</p>'}</section>
      <section class="card"><div class="card-head"><h3>Temalar</h3></div>${hbarChart(pf.byTheme.map(x => ({ label: `${x.key} (${x.count})`, value: x.rate })), { empty: 'İçeriklere tema yazdıkça burada karşılaştırılır.' })}</section>
    </div>`;
}
