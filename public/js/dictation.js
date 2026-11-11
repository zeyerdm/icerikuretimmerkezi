// S.5: Sesli not / dikte. Tarayıcının konuşma tanıma özelliğiyle (Türkçe) yazı alanına yazdırır.
// Desteklenmeyen tarayıcıda (ör. Firefox) mikrofon düğmesi hiç gösterilmez. Ses sunucuya gönderilmez; tanıma tarayıcıda yapılır.
import { icon, toast } from './ui.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const dictationSupported = Boolean(SR);

// [data-mic] işaretli giriş alanlarının yanına mikrofon düğmesi ekler
export function enhanceMics(root = document) {
  if (!SR) return;
  root.querySelectorAll('[data-mic]:not([data-mic-ready])').forEach(el => {
    el.dataset.micReady = '1';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mic-btn'; b.title = 'Sesle yaz (Türkçe)'; b.setAttribute('aria-label', 'Sesle yaz');
    b.innerHTML = icon('mic');
    const wrap = document.createElement('span'); wrap.className = 'mic-wrap';
    el.parentNode.insertBefore(wrap, el); wrap.appendChild(el); wrap.appendChild(b);
    let rec = null;
    b.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'tr-TR'; rec.interimResults = true; rec.continuous = true;
      const start = el.value ? el.value.replace(/\s*$/, ' ') : '';
      let final = '';
      rec.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) final += t + ' '; else interim += t; }
        el.value = (start + final + interim).trimStart();
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      rec.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') toast(e.error === 'not-allowed' ? 'Mikrofon izni verilmedi.' : 'Ses tanınamadı: ' + e.error, 'error'); };
      rec.onend = () => { rec = null; b.classList.remove('on'); el.focus(); };
      b.classList.add('on');
      try { rec.start(); } catch { rec = null; b.classList.remove('on'); }
    });
  });
}
