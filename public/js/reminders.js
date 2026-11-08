// Hatırlatmalar: günün özeti (günde bir kez açılışta; üst çubuktaki zilden her zaman), geciken iş sayısı rozeti ve
// isteğe bağlı bilgisayar bildirimi (uygulama açıkken, yayın saatinden 30 dk önce). Tercihler bu tarayıcıda saklanır.
import { api } from './api.js';
import { esc, openModal, timeStr, fmtDate, icon } from './ui.js';

const PREF = 'ium.reminders';
const SHOWN = 'ium.summary.shown';
const NOTIFIED = 'ium.notified';
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* tercih kaydedilemezse sorun değil */ } }
};

export const reminderPrefs = () => Object.assign({ summary: true, notify: false }, store.get(PREF, {}));
export function setReminderPrefs(p) { store.set(PREF, Object.assign(reminderPrefs(), p)); startNotifier(); }

export async function todaySummary(now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const DONE = ['tamamlandi', 'yayinlandi'];
  const [today, past, tasks, sd] = await Promise.all([
    api.contents({ from: start.toISOString(), to: end.toISOString() }),
    api.contents({ from: new Date(start.getTime() - 60 * 86400000).toISOString(), to: start.toISOString() }),
    api.tasks({}),
    api.specialDays(iso(start), iso(new Date(start.getTime() + 3 * 86400000))).catch(() => ({ days: [] }))
  ]);
  const todayKey = iso(start);
  const open = tasks.tasks.filter(t => !t.done && t.dueDate);
  return {
    today: today.contents.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
    overdueContents: past.contents.filter(c => !DONE.includes(c.status)),
    tasksToday: open.filter(t => t.dueDate === todayKey),
    overdueTasks: open.filter(t => t.dueDate < todayKey),
    special: sd.days.filter(d => !d.end || d.date >= todayKey)
  };
}
export const pendingCount = s => s.today.filter(c => !['tamamlandi', 'yayinlandi'].includes(c.status)).length + s.overdueContents.length + s.tasksToday.length + s.overdueTasks.length;

export const clearSummaryCache = () => { cache = null; };

export function openSummary(s) {
  const item = c => `<li><a href="#/m/${esc(c.brandId)}/takvim" data-close><span class="sum-dot" style="background:${esc(c.brandColor || '#7d6bf0')}"></span><b>${c.scheduledAt ? timeStr(c.scheduledAt) : ''}</b> ${esc(c.title)} <span class="muted small">· ${esc(c.brandName)} · ${esc(c.typeLabel)} · ${esc(c.statusLabel)}</span></a></li>`;
  const task = t => `<li><a href="#/gorevler" data-close>${esc(t.title)} <span class="muted small">${t.brandName ? '· ' + esc(t.brandName) : ''} · son tarih ${esc(fmtDate(t.dueDate + 'T12:00:00', { day: 'numeric', month: 'short' }))}</span></a></li>`;
  const sec = (title, list, fn, empty) => `<section class="sum-sec"><h4>${title} <span class="muted">${list.length}</span></h4>${list.length ? `<ul class="sum-list">${list.slice(0, 8).map(fn).join('')}</ul>${list.length > 8 ? `<div class="xsmall muted">+${list.length - 8} daha</div>` : ''}` : `<p class="small muted">${empty}</p>`}</section>`;
  openModal({
    title: `Günün özeti · ${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}`, submitLabel: 'Tamam',
    body: `${sec('Bugün yayında', s.today, item, 'Bugün planlanmış içerik yok.')}
      ${s.overdueContents.length ? sec('Tarihi geçmiş, bitmemiş içerikler', s.overdueContents, item, '') : ''}
      ${sec('Bugün biten görevler', s.tasksToday, task, 'Bugün son günü olan görev yok.')}
      ${s.overdueTasks.length ? sec('Geciken görevler', s.overdueTasks, task, '') : ''}
      ${s.special.length ? `<section class="sum-sec"><h4>Yaklaşan özel günler</h4><ul class="sum-list">${s.special.map(d => `<li><a href="#/takvim" data-close>★ ${esc(d.name)} <span class="muted small">· ${esc(fmtDate(d.date + 'T12:00:00', { day: 'numeric', month: 'long', weekday: 'short' }))}</span></a></li>`).join('')}</ul></section>` : ''}
      <p class="xsmall muted mt-3">Uygulama günde ilk açıldığında üstte özet şeridi çıkar; bu pencereyi üst çubuktaki zilden her zaman açabilirsin. Ayarlar → Hatırlatmalar'dan şerit kapatılabilir, bilgisayar bildirimi açılabilir.</p>`,
    onSubmit: async () => {}
  });
}

// Üst çubuktaki zil: bekleyen iş sayısı rozetiyle
let cache = null;
export async function bellHtml() {
  try {
    if (!cache || Date.now() - cache.at > 60000) cache = { at: Date.now(), s: await todaySummary() };
    const s = cache.s; const n = pendingCount(s); return { html: `<button type="button" class="bell" id="bell" aria-label="Günün özeti${n ? `: ${n} bekleyen iş` : ''}" title="Günün özeti">${icon('bell')}${n ? `<span class="bell-badge">${n > 99 ? '99+' : n}</span>` : ''}</button>`, summary: s };
  } catch { return { html: '', summary: null }; }
}

// Açılışta günde bir kez: sayfanın üstünde kapatılabilir ince şerit (ekranı kapatmaz); ayrıntı "Özeti aç" ile
export async function showDailyOnce() {
  const slot = document.getElementById('daily-slot');
  if (!slot || !reminderPrefs().summary) return;
  const key = iso(new Date());
  if (store.get(SHOWN, '') === key) return;
  try {
    const s = await todaySummary();
    const live = s.today.filter(c => !['tamamlandi', 'yayinlandi'].includes(c.status)).length;
    const parts = [
      live ? `bugün <b>${live}</b> içerik yayında` : '',
      s.overdueContents.length ? `<b>${s.overdueContents.length}</b> içeriğin tarihi geçti` : '',
      s.tasksToday.length ? `<b>${s.tasksToday.length}</b> görevin son günü bugün` : '',
      s.overdueTasks.length ? `<b>${s.overdueTasks.length}</b> görevin süresi doldu` : '',
      s.special.length ? `yaklaşan: ${esc(s.special[0].name)} (${esc(fmtDate(s.special[0].date + 'T12:00:00', { day: 'numeric', month: 'long' }))})` : ''
    ].filter(Boolean);
    if (!parts.length) return;
    slot.innerHTML = `<div class="daily" role="status">${icon('bell')}<span><b>Günün özeti:</b> ${parts.join(' · ')}</span>
      <button type="button" class="btn btn-sm" data-daily-open>Özeti aç</button><button type="button" class="btn btn-sm btn-ghost icon-btn" data-daily-close aria-label="Kapat">${icon('x')}</button></div>`;
    const close = () => { store.set(SHOWN, key); slot.innerHTML = ''; };
    slot.querySelector('[data-daily-open]').addEventListener('click', () => { close(); openSummary(s); });
    slot.querySelector('[data-daily-close]').addEventListener('click', close);
  } catch { /* özet alınamazsa açılış engellenmez */ }
}

// Bilgisayar bildirimi: uygulama açıkken dakikada bir bakılır; yayın saatine 30 dk kala bir kez bildirilir
let timer = null;
export function startNotifier() {
  clearInterval(timer);
  if (!reminderPrefs().notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const tick = async () => {
    try {
      const now = new Date();
      const soon = new Date(now.getTime() + 30 * 60000);
      const { contents } = await api.contents({ from: now.toISOString(), to: soon.toISOString() });
      const done = store.get(NOTIFIED, []);
      for (const c of contents.filter(x => !['tamamlandi', 'yayinlandi'].includes(x.status) && !done.includes(x.id))) {
        new Notification(`${timeStr(c.scheduledAt)} · ${c.title}`, { body: `${c.brandName} · ${c.typeLabel} · ${c.statusLabel}`, tag: c.id, icon: '/img/logo.svg' });
        done.push(c.id);
      }
      store.set(NOTIFIED, done.slice(-200));
    } catch { /* bağlantı yoksa bir sonraki denemede */ }
  };
  tick();
  timer = setInterval(tick, 60000);
}
