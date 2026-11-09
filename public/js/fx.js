// Ses ve görüntü efektleri: kısa sesler Web Audio ile üretilir (dosya yok), görev tamamlanınca konfeti, masaüstü bildirimi.
// Ses tercihi Ayarlar → Hatırlatmalar'dan kapatılabilir.
const PREF = 'ium.reminders';
const prefs = () => { try { return Object.assign({ sound: true }, JSON.parse(localStorage.getItem(PREF) || '{}')); } catch { return { sound: true }; } };

let ctx = null;
const TONES = {
  ok: [[660, 0, 0.09], [990, 0.08, 0.14]],          // tamamlandı / kaydedildi: yükselen iki nota
  done: [[523, 0, 0.08], [659, 0.07, 0.08], [784, 0.14, 0.18]], // görev bitti: kısa arpej
  ping: [[880, 0, 0.12]],                            // bildirim
  err: [[220, 0, 0.12], [180, 0.1, 0.16]]            // hata: alçalan
};
export function sound(kind = 'ok') {
  if (!prefs().sound || !TONES[kind]) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime + 0.01;
    TONES[kind].forEach(([f, at, len]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(0.07, t0 + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.02);
    });
  } catch { /* ses çalınamıyorsa sessiz devam */ }
}

// Konfeti patlaması (x, y ekrandaki nokta)
export function confetti(x = innerWidth / 2, y = innerHeight / 3) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#7d6bf0', '#12a48f', '#f2b23a', '#e5486b', '#3b6fd8'];
  const box = document.createElement('div');
  box.className = 'fx-confetti';
  box.style.left = x + 'px'; box.style.top = y + 'px';
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4; const d = 40 + Math.random() * 50;
    p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
    p.style.background = colors[i % colors.length];
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 900);
}

// Masaüstü bildirimi (izin varsa) + uygulama içi ses
export function notify(title, body = '', tag) {
  sound('ping');
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, tag, icon: '/img/logo.svg' }); } catch { /* yok */ }
}

// Görev tamamlama düğmelerine (Yönetim Merkezi, Çalışma masası, Görevler) konfeti + ses
export function initFx() {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-task-done], [data-done], [data-toggle]');
    if (!b || b.classList.contains('on')) return; // geri alma (tamamlanmadı yapma) kutlanmaz
    confetti(e.clientX, e.clientY);
    sound('done');
  }, true);
}
