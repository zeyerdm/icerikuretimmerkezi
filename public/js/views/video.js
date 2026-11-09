// Aşama 5.14: Video kesme, birleştirme ve altyazı gömme — tarayıcıda, ek program ya da yükleme olmadan.
// Klipler sırayla oynatılır, her kare (seçilen orana ortadan kırpılarak) tuvale çizilir, altyazı üstüne basılır ve
// tuval + ses MediaRecorder ile kaydedilir. Kayıt gerçek zamanlıdır: çıktı süresi kadar sürer. Çıktı MP4 (destekleyen
// tarayıcıda) ya da WebM olur. Altyazı .srt metninden ya da markanın bir Reels senaryosundan alınır.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState } from '../ui.js';
import { downloadBlob, safeName } from '../titlePng.js';

const RATIOS = { orijinal: 'Orijinal oran', '9:16': '9:16 Reels / story', '1:1': '1:1 kare', '4:5': '4:5 gönderi', '16:9': '16:9 yatay' };
const fmt = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

export function parseSrt(text) {
  const t = v => { const m = String(v).trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, '0').slice(0, 3)) / 1000 : null; };
  return String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => {
    const lines = b.split('\n').filter(Boolean);
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) return null;
    const [a, z] = lines[i].split('-->');
    const start = t(a); const end = t(z);
    return start == null || end == null ? null : { start, end, text: lines.slice(i + 1).join('\n') };
  }).filter(Boolean);
}

function pickMime() {
  const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return (typeof MediaRecorder !== 'undefined' && list.find(m => MediaRecorder.isTypeSupported(m))) || '';
}

export async function renderVideo(view, brand) {
  view.onclick = view.onchange = view.oninput = null;
  const clips = []; // { id, name, url, duration, start, end, w, h }
  let srt = '';
  let opts = { ratio: '9:16', width: 1080, size: 6, pos: 82, box: true };
  let busyRec = null;
  const mime = pickMime();
  const { reels } = await api.reelsList(brand.id).catch(() => ({ reels: [] }));
  const supported = Boolean(mime && HTMLCanvasElement.prototype.captureStream);

  const total = () => clips.reduce((n, c) => n + Math.max(0, c.end - c.start), 0);

  function draw() {
    view.innerHTML = `
      ${pageHead({ title: 'Video ve altyazı', desc: 'Klipleri kes, sırayla birleştir, Reels oranına kırp ve altyazıyı videoya bas. İşlem bu tarayıcıda yapılır; dosyalar sunucuya yüklenmez. Kayıt gerçek zamanlıdır (çıktı süresi kadar sürer).' })}
      ${supported ? '' : '<div class="notice mb-4"><div><strong>Bu tarayıcı video kaydını desteklemiyor.</strong> Chrome, Edge ya da güncel Firefox ile aç.</div></div>'}
      <div class="vid-layout">
        <section class="card">
          <div class="card-head"><h3>Klipler <span class="muted small">${clips.length} · toplam ${fmt(total())}</span></h3>
            <label class="btn btn-sm">${icon('upload')}Klip ekle<input type="file" id="vid-file" accept="video/*" multiple class="sr-only"></label></div>
          ${clips.length ? `<div class="vid-clips">${clips.map((c, i) => `
            <div class="vid-clip" data-clip="${esc(c.id)}">
              <video src="${esc(c.url)}" preload="metadata" controls muted playsinline data-prev="${esc(c.id)}"></video>
              <div class="vid-clip-body">
                <div class="row"><b class="small">${i + 1}. ${esc(c.name)}</b><span class="spacer"></span>
                  <button class="btn btn-sm btn-ghost icon-btn" data-up="${esc(c.id)}" ${i ? '' : 'disabled'} aria-label="Yukarı taşı">${icon('chevronUp')}</button>
                  <button class="btn btn-sm btn-ghost icon-btn" data-rm="${esc(c.id)}" aria-label="Çıkar">${icon('x')}</button></div>
                <div class="vid-trim">
                  <label class="xsmall">Başlangıç <input class="input input-sm" type="number" step="0.1" min="0" max="${c.duration.toFixed(1)}" value="${c.start.toFixed(1)}" data-start="${esc(c.id)}"></label>
                  <label class="xsmall">Bitiş <input class="input input-sm" type="number" step="0.1" min="0" max="${c.duration.toFixed(1)}" value="${c.end.toFixed(1)}" data-end="${esc(c.id)}"></label>
                  <button class="btn btn-sm" data-mark-start="${esc(c.id)}" title="Önizlemedeki anı başlangıç yap">Bu an: başla</button>
                  <button class="btn btn-sm" data-mark-end="${esc(c.id)}" title="Önizlemedeki anı bitiş yap">Bu an: bitir</button>
                </div>
                <div class="xsmall muted">Klip ${fmt(c.duration)} · kullanılacak bölüm ${fmt(c.end - c.start)}</div>
              </div>
            </div>`).join('')}</div>`
            : emptyState({ icon: 'film', title: 'Henüz klip yok', text: 'Flow ya da telefondan aldığın videoları ekle; sırayla birleştirilir.', compact: true })}
        </section>
        <section class="card">
          <div class="card-head"><h3>Altyazı ve çıktı</h3></div>
          <div class="form-grid">
            <div class="field full"><label for="vid-srt">Altyazı (.srt)</label>
              <textarea class="textarea" id="vid-srt" rows="6" placeholder="1&#10;00:00:00,000 --> 00:00:02,500&#10;Merhaba!">${esc(srt)}</textarea>
              <div class="row mt-2">
                <label class="btn btn-sm">${icon('upload')}.srt dosyası<input type="file" id="vid-srt-file" accept=".srt,text/plain" class="sr-only"></label>
                ${reels.length ? `<select class="select input-sm w-auto" id="vid-reels" aria-label="Reels senaryosundan altyazı"><option value="">Reels senaryosundan al…</option>${reels.map(r => `<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('')}</select>` : ''}
                <span class="xsmall muted">${parseSrt(srt).length} satır</span>
              </div></div>
            <div class="field"><label for="vid-ratio">Kırpma</label><select class="select" id="vid-ratio">${Object.entries(RATIOS).map(([k, v]) => `<option value="${k}" ${opts.ratio === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="field"><label for="vid-width">Genişlik</label><select class="select" id="vid-width">${[1080, 720, 540].map(w => `<option value="${w}" ${+opts.width === w ? 'selected' : ''}>${w} px</option>`).join('')}</select></div>
            <div class="field"><label for="vid-size">Yazı boyu <span>${opts.size}</span></label><input type="range" id="vid-size" min="3" max="10" step="0.5" value="${opts.size}"></div>
            <div class="field"><label for="vid-pos">Dikey konum <span>%${opts.pos}</span></label><input type="range" id="vid-pos" min="10" max="92" value="${opts.pos}"></div>
            <label class="check full"><input type="checkbox" id="vid-box" ${opts.box ? 'checked' : ''}> Yazının arkasına koyu kutu</label>
          </div>
          <canvas id="vid-canvas" class="vid-canvas" width="360" height="640"></canvas>
          <div class="row mt-3">
            ${busyRec ? `<div class="vid-progress"><span style="width:${busyRec.pct}%"></span></div><button class="btn" data-cancel>Durdur</button>`
              : `<button class="btn btn-primary" data-render ${clips.length && supported ? '' : 'disabled'}>${icon('film')}Videoyu oluştur (${fmt(total())})</button>`}
            <span class="xsmall muted">${mime ? 'Çıktı: ' + (mime.startsWith('video/mp4') ? 'MP4' : 'WebM') : ''}</span>
          </div>
          <div id="vid-out"></div>
        </section>
      </div>`;
    preview();
  }

  // Ölçü: seçilen orana göre tuval boyutu
  function frameSize(c) {
    let w = c.w || 1080; let h = c.h || 1920;
    if (opts.ratio !== 'orijinal') { const [a, b] = opts.ratio.split(':').map(Number); h = Math.round(w * b / a); }
    const k = Math.min(1, +opts.width / w);
    return { W: Math.round(w * k / 2) * 2, H: Math.round(h * k / 2) * 2 };
  }
  function paint(ctx, W, H, video, text) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (video && video.videoWidth) {
      const sw = video.videoWidth; const sh = video.videoHeight;
      const k = Math.max(W / sw, H / sh);
      ctx.drawImage(video, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
    }
    if (!text) return;
    const size = Math.round(W * opts.size / 100);
    ctx.font = `800 ${size}px Poppins, "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const maxW = W * 0.86;
    const lines = [];
    text.split('\n').forEach(par => { let line = ''; par.split(/\s+/).forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }); if (line) lines.push(line); });
    const lh = size * 1.25; const y0 = H * opts.pos / 100 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => {
      const y = y0 + i * lh;
      if (opts.box) { const tw = ctx.measureText(l).width; ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(W / 2 - tw / 2 - size * 0.35, y - lh / 2, tw + size * 0.7, lh); }
      ctx.lineWidth = Math.max(2, size / 7); ctx.strokeStyle = '#000'; if (!opts.box) ctx.strokeText(l, W / 2, y);
      ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, y);
    });
  }
  // Önizleme: ilk klibin seçili anı + o andaki altyazı
  function preview() {
    const cv = view.querySelector('#vid-canvas');
    if (!cv) return;
    const c = clips[0];
    const { W, H } = frameSize(c || {});
    const k = 360 / W;
    cv.width = 360; cv.height = Math.round(H * k);
    const ctx = cv.getContext('2d');
    const v = c && view.querySelector(`[data-prev="${CSS.escape(c.id)}"]`);
    const subs = parseSrt(srt);
    const t = v ? Math.max(0, v.currentTime - c.start) : 0;
    const s = subs.find(x => t >= x.start && t < x.end) || (subs[0] && !v ? subs[0] : null);
    ctx.save(); ctx.scale(k, k); paint(ctx, W, H, v, s ? s.text : (subs[0] ? subs[0].text : '')); ctx.restore();
  }

  async function addFiles(files) {
    for (const f of [...files].filter(f => f.type.startsWith('video/'))) {
      const url = URL.createObjectURL(f);
      const meta = await new Promise(res => {
        const v = document.createElement('video'); v.preload = 'metadata';
        const done = () => res({ d: v.duration, w: v.videoWidth, h: v.videoHeight });
        // Tarayıcıyla kaydedilmiş WebM'lerde süre "sonsuz" gelir: sona atlayınca gerçek süre okunur
        v.onloadedmetadata = () => { if (isFinite(v.duration)) return done(); v.ondurationchange = () => { if (isFinite(v.duration)) { v.ondurationchange = null; done(); } }; v.currentTime = 1e9; };
        v.onerror = () => res(null); v.src = url;
      });
      if (!meta || !isFinite(meta.d)) { toast(f.name + ': video açılamadı.', 'error'); continue; }
      clips.push({ id: Math.random().toString(36).slice(2), name: f.name, url, duration: meta.d, start: 0, end: meta.d, w: meta.w, h: meta.h });
    }
    draw();
  }

  // Kayıt: klipler sırayla oynatılır, kareler tuvale çizilir, ses WebAudio ile kayda alınır
  async function render() {
    const first = clips[0];
    const { W, H } = frameSize(first);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const subs = parseSrt(srt);
    const ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    const dur = total();
    busyRec = { pct: 0, stop: false };
    draw();
    rec.start(500);
    let offset = 0;
    try {
      for (const c of clips) {
        if (busyRec.stop) break;
        const v = document.createElement('video');
        v.src = c.url; v.playsInline = true; v.preload = 'auto';
        await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error(c.name + ': oynatılamadı.')); });
        ac.createMediaElementSource(v).connect(dest);
        v.currentTime = c.start;
        await new Promise(res => { v.onseeked = res; });
        await ac.resume();
        await v.play();
        await new Promise(res => {
          const tick = () => {
            const local = v.currentTime - c.start;
            const t = offset + local;
            const s = subs.find(x => t >= x.start && t < x.end);
            paint(ctx, W, H, v, s ? s.text : '');
            busyRec.pct = Math.min(100, Math.round(t / dur * 100));
            const bar = view.querySelector('.vid-progress span'); if (bar) bar.style.width = busyRec.pct + '%';
            if (busyRec.stop || v.currentTime >= c.end || v.ended) { v.pause(); return res(); }
            (v.requestVideoFrameCallback ? v.requestVideoFrameCallback.bind(v) : requestAnimationFrame)(tick);
          };
          tick();
        });
        offset += c.end - c.start;
      }
    } finally {
      rec.stop();
      await done;
      ac.close();
    }
    const stopped = busyRec.stop;
    busyRec = null;
    draw();
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const url = URL.createObjectURL(blob);
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    view.querySelector('#vid-out').innerHTML = `<div class="vid-result mt-3"><video src="${url}" controls playsinline></video>
      <div class="row mt-2"><span class="small">${stopped ? 'Yarıda durduruldu · ' : ''}${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB · ${ext.toUpperCase()}</span><span class="spacer"></span><button class="btn btn-primary" data-dl>${icon('download')}İndir</button></div>
      ${ext === 'webm' ? '<p class="xsmall muted mt-1">WebM çıktıyı Instagram\'a yüklemeden önce CapCut ya da telefonun galerisiyle MP4\'e çevirmen gerekebilir.</p>' : ''}</div>`;
    view.querySelector('[data-dl]').onclick = () => downloadBlob(blob, `${safeName(brand.name)}_video.${ext}`);
  }

  const clip = id => clips.find(c => c.id === id);
  view.onclick = async e => {
    const t = e.target;
    const rm = t.closest('[data-rm]'); if (rm) { const i = clips.findIndex(c => c.id === rm.dataset.rm); URL.revokeObjectURL(clips[i].url); clips.splice(i, 1); return draw(); }
    const up = t.closest('[data-up]'); if (up) { const i = clips.findIndex(c => c.id === up.dataset.up); [clips[i - 1], clips[i]] = [clips[i], clips[i - 1]]; return draw(); }
    const ms = t.closest('[data-mark-start]'); if (ms) { const c = clip(ms.dataset.markStart); const v = view.querySelector(`[data-prev="${CSS.escape(c.id)}"]`); c.start = Math.min(v.currentTime, c.end - 0.1); return draw(); }
    const me = t.closest('[data-mark-end]'); if (me) { const c = clip(me.dataset.markEnd); const v = view.querySelector(`[data-prev="${CSS.escape(c.id)}"]`); c.end = Math.max(v.currentTime, c.start + 0.1); return draw(); }
    if (t.closest('[data-cancel]') && busyRec) { busyRec.stop = true; return; }
    if (t.closest('[data-render]')) { try { await render(); } catch (err) { busyRec = null; draw(); toast(err.message, 'error'); } }
  };
  view.onchange = async e => {
    const t = e.target;
    if (t.id === 'vid-file') return addFiles(t.files);
    if (t.id === 'vid-srt-file') { srt = await t.files[0].text(); return draw(); }
    if (t.id === 'vid-reels' && t.value) { try { const { reels: r } = await api.reels(brand.id, t.value); srt = r.srt || ''; if (!srt) toast('Bu senaryoda altyazı yok.', 'error'); } catch (err) { toast(err.message, 'error'); } return draw(); }
    if (t.dataset.start || t.dataset.end) {
      const c = clip(t.dataset.start || t.dataset.end);
      const v = Math.min(c.duration, Math.max(0, +t.value || 0));
      if (t.dataset.start) c.start = Math.min(v, c.end - 0.1); else c.end = Math.max(v, c.start + 0.1);
      return draw();
    }
    const map = { 'vid-ratio': 'ratio', 'vid-width': 'width', 'vid-box': 'box' };
    if (map[t.id]) { opts[map[t.id]] = t.type === 'checkbox' ? t.checked : t.value; return draw(); }
  };
  view.oninput = e => {
    const t = e.target;
    if (t.id === 'vid-srt') { srt = t.value; return preview(); }
    if (t.id === 'vid-size' || t.id === 'vid-pos') { opts[t.id === 'vid-size' ? 'size' : 'pos'] = +t.value; t.previousElementSibling.querySelector('span').textContent = t.id === 'vid-pos' ? '%' + t.value : t.value; return preview(); }
  };
  view.addEventListener('timeupdate', preview, true);
  view.addEventListener('seeked', preview, true);
  draw();
}
