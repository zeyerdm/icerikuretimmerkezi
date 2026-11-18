// İşlem bitti bildirimi: uzun süren işler (yapay zekâ üretimi, toplu üretim, analiz) bitince ses çalar (fx.js);
// sekme arka plandaysa masaüstü bildirimi gösterir ve sekme başlığı yanıp söner. Ses tercihi: Ayarlar → Hatırlatmalar.
import { sound } from './fx.js';

export const LONG_MS = 4000;

// İşlem başlatılırken (tıklama anında) masaüstü bildirim izni bir kez istenir
export function askPermissionOnce() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'default' || localStorage.getItem('ium.notify.asked')) return;
    localStorage.setItem('ium.notify.asked', '1');
    Notification.requestPermission().catch(() => {});
  } catch { /* desteklenmiyor */ }
}

let titleTimer = null;
function flashTitle(text) {
  if (titleTimer) return;
  const orig = document.title; let on = false;
  titleTimer = setInterval(() => { document.title = (on = !on) ? `${text} · ${orig}` : orig; }, 1000);
  const stop = () => { if (document.hidden) return; clearInterval(titleTimer); titleTimer = null; document.title = orig; window.removeEventListener('focus', stop); document.removeEventListener('visibilitychange', stop); };
  window.addEventListener('focus', stop); document.addEventListener('visibilitychange', stop);
}

export function notifyDone(title, { body = '', ok = true } = {}) {
  sound(ok ? 'done' : 'err');
  if (!document.hidden) return;
  flashTitle(ok ? '✓ Hazır' : '⚠ Hata');
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(`${ok ? '✓' : '⚠'} ${title}`, { body: body || (ok ? 'İşlem tamamlandı. Sekmeye dönebilirsin.' : 'İşlem tamamlanamadı.'), tag: 'ium-done', icon: '/img/logo.svg' });
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch { /* bildirim gösterilemedi */ }
}

// Bir işin süresini ölçer; uzun sürdüyse bitişte bildirir (iptal edilen işte bildirim yok)
export async function timed(label, fn) {
  const started = Date.now();
  askPermissionOnce();
  try { const r = await fn(); if (Date.now() - started >= LONG_MS) notifyDone(label); return r; }
  catch (err) { if (Date.now() - started >= LONG_MS && !(err && err.code === 'AI_CANCELLED')) notifyDone(label, { ok: false, body: err && err.message }); throw err; }
}
