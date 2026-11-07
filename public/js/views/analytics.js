// Analizler: yönetim merkezinde bütün markalar, marka çalışma alanında yalnızca o marka.
// Bütün grafikler gerçek kayıtlardan hesaplanır; veri yoksa açıklayıcı boş durum gösterilir.
import { api } from '../api.js';
import { esc, columnChart, hbarChart, donutChart, pageHead, skeletonPage } from '../ui.js';
import { state } from '../app.js';
import * as S from '../stats.js';

export async function renderAnalytics(view, { brand } = {}) {
  view.innerHTML = skeletonPage({ cards: 4, height: 260 });
  const d = await api.dashboard(brand ? brand.id : null);
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
    </div>`;
}
