// Yönetim merkezi ve analizlerin ortak hesapları. Girdi: /api/dashboard yanıtı (gerçek kayıtlar).
// Günler ve haftalar kullanıcının yerel saatine göre hesaplanır.
import { startOfDay, startOfWeek, addDays, TR_MONTHS, TR_DAYS_SHORT, SERIES_COLORS } from './ui.js';

export const DONE = c => c.done;
const inRange = (iso, from, to) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= from.getTime() && t < to.getTime(); };

export function counts(d) {
  return {
    brands: d.brands.length,
    contents: d.contents.length,
    reels: d.contents.filter(c => c.type === 'reels').length,
    designsDone: d.contents.filter(c => c.done && c.type !== 'reels').length,
    pending: d.contents.filter(c => !c.done).length,
    ideas: d.ideas.length,
    // U.2: yönetici özeti (yalnızca mevcut kayıtlardan; ayrı bir "onay" durumu olmadığı için tamamlanıp yayınlanmamışlar "yayına hazır" sayılır)
    thisMonth: d.contents.filter(c => { const t = new Date(c.createdAt); const n = new Date(); return t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth(); }).length,
    published: d.contents.filter(c => c.status === 'yayinlandi').length,
    ready: d.contents.filter(c => c.status === 'tamamlandi').length,
    approval: d.contents.filter(c => c.status === 'onay').length,
    planned: d.contents.filter(c => !c.done && c.scheduledAt && new Date(c.scheduledAt) >= new Date()).length,
    openTasks: d.tasks.filter(t => !t.done).length,
    overdueTasks: d.tasks.filter(t => !t.done && t.dueDate && new Date(t.dueDate + 'T23:59:59') < new Date()).length
  };
}

// Bu hafta (pazartesi-pazar): her gün planlanan/oluşturulan ve tamamlanan içerik sayısı
export function thisWeek(d, now = new Date()) {
  const start = startOfWeek(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = addDays(start, i);
    const to = addDays(start, i + 1);
    return {
      label: TR_DAYS_SHORT[i], date: from,
      created: d.contents.filter(c => inRange(c.createdAt, from, to)).length + d.ideas.filter(x => inRange(x.createdAt, from, to)).length,
      completed: d.contents.filter(c => inRange(c.completedAt, from, to)).length,
      scheduled: d.contents.filter(c => inRange(c.scheduledAt, from, to)).length
    };
  });
  const end = addDays(start, 7);
  return {
    start, days,
    created: days.reduce((n, x) => n + x.created, 0),
    completed: days.reduce((n, x) => n + x.completed, 0),
    scheduled: d.contents.filter(c => inRange(c.scheduledAt, start, end)).length,
    scheduledPending: d.contents.filter(c => !c.done && inRange(c.scheduledAt, start, end)).length
  };
}

// Son N hafta: üretilen (içerik + fikir) ve tamamlanan içerik
export function weeks(d, n = 8, now = new Date()) {
  const first = addDays(startOfWeek(now), -7 * (n - 1));
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(first, 7 * i);
    const to = addDays(from, 7);
    return {
      label: `${from.getDate()} ${TR_MONTHS[from.getMonth()].slice(0, 3)}`,
      values: [
        d.contents.filter(c => inRange(c.createdAt, from, to)).length + d.ideas.filter(x => inRange(x.createdAt, from, to)).length,
        d.contents.filter(c => inRange(c.completedAt, from, to)).length
      ]
    };
  });
}

// Son N ay: oluşturulan içerik sayısı
export function months(d, n = 6, now = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const from = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    return {
      label: TR_MONTHS[from.getMonth()].slice(0, 3),
      values: [d.contents.filter(c => inRange(c.createdAt, from, to)).length, d.contents.filter(c => inRange(c.completedAt, from, to)).length]
    };
  });
}

export function byBrand(d) {
  return d.brands.map(b => ({
    label: b.name, color: (b.colors && b.colors.primary) || '#7d6bf0',
    value: d.contents.filter(c => c.brandId === b.id).length,
    sub: `${d.contents.filter(c => c.brandId === b.id && c.done).length} tamamlandı · ${d.ideas.filter(x => x.brandId === b.id).length} fikir`
  })).sort((a, b) => b.value - a.value);
}

export function byType(d, types) {
  return Object.entries(types).map(([id, label], i) => ({ label, value: d.contents.filter(c => c.type === id).length, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
}

export function byStatus(d, statuses) {
  const colors = { taslak: '#c9cce0', hazirlaniyor: '#f6b93b', onay: '#e8590c', tamamlandi: '#12a48f', yayinlandi: '#7d6bf0' };
  return Object.entries(statuses).map(([id, label]) => ({ label, value: d.contents.filter(c => c.status === id).length, color: colors[id] || '#999' }));
}

export function ideasByCategory(d, categories) {
  return Object.entries(categories).map(([id, label], i) => ({ label, value: d.ideas.filter(x => x.category === id).length, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
    .filter(x => x.value).sort((a, b) => b.value - a.value);
}

// Üretim performansı
export function performance(d, now = new Date()) {
  const total = d.contents.length;
  const done = d.contents.filter(DONE);
  const withDate = done.filter(c => c.scheduledAt && c.completedAt);
  const onTime = withDate.filter(c => new Date(c.completedAt) <= addDays(startOfDay(c.scheduledAt), 1)).length;
  const eightWeeksAgo = addDays(startOfWeek(now), -49);
  const recent = d.contents.filter(c => new Date(c.createdAt) >= eightWeeksAgo).length;
  return {
    completionRate: total ? Math.round((done.length / total) * 100) : 0,
    onTimeRate: withDate.length ? Math.round((onTime / withDate.length) * 100) : null,
    weeklyAverage: Math.round((recent / 8) * 10) / 10,
    overdue: d.contents.filter(c => !c.done && c.scheduledAt && new Date(c.scheduledAt) < startOfDay(now)).length
  };
}

// Önümüzdeki N gün planlı içerikler (bugün dahil, saat sırasıyla)
export function upcoming(d, days = 7, now = new Date()) {
  const from = startOfDay(now);
  const to = addDays(from, days);
  return d.contents.filter(c => inRange(c.scheduledAt, from, to)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}
