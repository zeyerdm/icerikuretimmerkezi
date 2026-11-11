// S.1: Seri ve rozetler. Üretim günleri (içerik oluşturma, fikir ekleme, içerik tamamlama) kayıtlardan hesaplanır.
const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function productionDays(contents, ideas) {
  const days = new Set();
  [...contents.map(c => c.createdAt), ...contents.map(c => c.completedAt), ...ideas.map(i => i.createdAt)].filter(Boolean).forEach(t => days.add(key(new Date(t))));
  return days;
}

// Bugünden (bugün henüz üretim yoksa dünden) geriye kesintisiz üretim günü sayısı
export function streak(days, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(key(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function badges({ contents, ideas, weekCreated = 0 }) {
  const days = productionDays(contents, ideas);
  const s = streak(days);
  const done = contents.filter(c => c.done).length;
  const published = contents.filter(c => c.status === 'yayinlandi').length;
  const list = [];
  if (s >= 2) list.push({ icon: '🔥', text: `${s} gün üst üste üretim`, tone: 'fire' });
  if (weekCreated >= 5) list.push({ icon: '⚡', text: `Bu hafta ${weekCreated} üretim`, tone: 'bolt' });
  if (published >= 10) list.push({ icon: '🏆', text: `${published} yayın`, tone: 'gold' });
  else if (published >= 1) list.push({ icon: '📣', text: `${published} yayın`, tone: 'pub' });
  if (done >= 10) list.push({ icon: '✅', text: `${done} tamamlanan içerik`, tone: 'done' });
  if (ideas.length >= 25) list.push({ icon: '💡', text: `${ideas.length} fikirlik havuz`, tone: 'idea' });
  return { streak: s, list };
}
