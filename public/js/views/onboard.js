// 11.1–11.4 Marka kurarken karşılama sohbeti (yalnız marka ilk kurulurken; her girişte değil).
// 1) Adı sorulur, marka oluşur. 2) "Elindekileri at": logo, maskot, palet, referans, ürün görselleri; web sitesi/biyografi
// metni; içerik fikirleri. Renkler tarayıcıda görselden çıkarılır, AI bağlıysa metin ve maskot okunur.
// 3) Yalnız eksik kalan sorular, hazır seçenekler + "Diğer" ile, tek tek. 4) Bitiş: fikir havuzu benzerleriyle
// çoğaltılır, tasarım referansından örnek şablon çıkarılır; kullanıcı dolu sayfalarla karşılaşır.
// Sohbet adım adım kaydedilir: yarıda bırakılırsa #/m/<id>/kur ile kaldığı yerden sürer.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, busy } from '../ui.js';
import { refreshBrands, go } from '../app.js';
import { busyTimer } from '../aiPicker.js';
import { deleteBrandFlow } from './identity.js';
import { makeThumb } from '../thumbs.js';

const KINDS = { logo: 'Logo', maskot: 'Maskot', palet: 'Renk paleti', referans: 'Tasarım referansı', urun: 'Ürün fotoğrafı', gorsel: 'Marka görseli', diger: 'Diğer' };
const guessKind = name => {
  const n = String(name || '').toLocaleLowerCase('tr-TR');
  if (/logo/.test(n)) return 'logo';
  if (/maskot|mascot|karakter|character/.test(n)) return 'maskot';
  if (/palet|palette|renk|color|colour|kılavuz|guide/.test(n)) return 'palet';
  if (/ref|pinterest|ilham|örnek|ornek|tasarım|tasarim|design/.test(n)) return 'referans';
  if (/ürün|urun|product|menü|menu/.test(n)) return 'urun';
  return 'gorsel';
};

// Görselin baskın renkleri (tarayıcıda; sunucuya renk tahmini için hiçbir şey gitmez). Saydam pikseller ve logolarda
// beyaz zemin sayılmaz.
export async function dominantColors(file, { n = 5, skipWhite = false } = {}) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = 80; c.height = Math.max(1, Math.round(80 * bmp.height / bmp.width));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const counts = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (skipWhite && r > 238 && g > 238 && b > 238) continue;
    const k = [r, g, b].map(v => Math.min(255, Math.round(v / 24) * 24)).join(',');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, z) => z[1] - a[1]).map(([k]) => k.split(',').map(Number));
  const out = [];
  for (const col of sorted) {
    if (out.every(o => Math.hypot(o[0] - col[0], o[1] - col[1], o[2] - col[2]) > 60)) out.push(col);
    if (out.length >= n) break;
  }
  return out.map(([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''));
}

export async function renderOnboard(view, brand = null) {
  view.onclick = view.onkeydown = view.oninput = view.onchange = null;
  view.innerHTML = `${pageHead({ title: brand ? `${esc(brand.name)}: marka kurulumu` : 'Yeni marka', desc: 'Markanı birlikte kuralım. Önce elindekileri at; doldurabildiğim her şeyi ben doldururum, yalnız eksikleri sorarım. Her adım kaydedilir.',
    actions: brand ? `<button type="button" class="btn btn-ghost danger-text" data-del-brand>${icon('trash')}Vazgeç, markayı sil</button>` : '' })}
    <div class="card ob-card"><div class="ob-chat" id="ob-chat" aria-live="polite"></div><div class="ob-input" id="ob-input"></div></div>`;
  const delBtn = view.querySelector('[data-del-brand]');
  if (delBtn) delBtn.addEventListener('click', () => deleteBrandFlow(brand));
  const chat = view.querySelector('#ob-chat');
  const input = view.querySelector('#ob-input');
  const bot = html => { chat.insertAdjacentHTML('beforeend', `<div class="ob-msg ob-bot"><span class="ob-av">${icon('sparkle')}</span><div class="ob-bubble">${html}</div></div>`); chat.scrollTop = chat.scrollHeight; };
  const me = html => { chat.insertAdjacentHTML('beforeend', `<div class="ob-msg ob-me"><div class="ob-bubble">${html}</div></div>`); chat.scrollTop = chat.scrollHeight; };
  let st = null;

  // 1) Ad
  if (!brand) {
    bot('Merhaba! Markanı birlikte kuralım. <b>Markanın adı ne?</b>');
    input.innerHTML = `<form class="ob-row" id="ob-name"><input class="input grow" name="name" maxlength="80" required placeholder="Ör. Kahve Durağı" aria-label="Marka adı"><button class="btn btn-primary" type="submit">Devam</button></form>`;
    input.querySelector('input').focus();
    input.querySelector('#ob-name').addEventListener('submit', async e => {
      e.preventDefault();
      const name = String(new FormData(e.target).get('name') || '').trim();
      if (!name) return;
      try {
        const { brand: b } = await busy(e.submitter, () => api.createBrand({ name }));
        await api.saveSetupStep(b.id, 'temel', { name });
        await refreshBrands();
        go(`#/m/${b.id}/kur`);
      } catch (err) { toast(err.message, 'error'); }
    });
    return;
  }

  try { st = await api.onboard(brand.id); } catch (err) { bot(esc(err.message)); return; }
  const base = `#/m/${esc(brand.id)}`;

  // 2) Elindekileri at
  function dropPhase() {
    bot(`<b>${esc(brand.name)}</b> için elinde ne varsa buraya at; hepsini birlikte atabilirsin:<ul class="ob-list"><li>logo</li><li>maskot görselleri</li><li>renk paleti ya da marka kılavuzu</li><li>beğendiğin tasarımlar (referans)</li><li>ürün ve marka görselleri</li><li>web sitesi ya da biyografi metni</li><li>içerik fikirlerin</li></ul>Ne olduğunu ben tahmin ederim, yanlışsa değiştirirsin. Hiçbiri yoksa "Hiçbir şey yok, sorularla devam" de.`);
    const files = [];
    input.innerHTML = `<div class="stack-sm">
      <label class="dropzone dropzone-sm" id="ob-drop"><input type="file" class="sr-only" id="ob-files" multiple accept="image/png,image/jpeg,image/webp,image/gif"><span>${icon('upload')}</span><span class="strong">Görselleri sürükle bırak ya da tıkla</span><span class="small muted">PNG, JPEG, WEBP, GIF</span></label>
      <div class="ob-files" id="ob-file-list"></div>
      <div class="field"><label for="ob-site">Web sitesi adresi (isteğe bağlı)</label><input class="input" id="ob-site" type="url" inputmode="url" maxlength="300" placeholder="ornek.com"><span class="hint">Ana sayfa ve önemli alt sayfalar (hakkımızda, hizmetler, ürünler, iletişim…) okunur: profil, bilgi kartları ve ilk içerik fikirleri buradan çıkar; fikir havuzu boş başlamaz.</span></div>
      <div class="form-grid"><div class="field"><label for="ob-text">Biyografi / tanıtım metni (isteğe bağlı)</label><textarea class="textarea" id="ob-text" rows="3" maxlength="20000" placeholder="Hakkımızda yazısı, Instagram biyografisi…"></textarea></div>
        <div class="field"><label for="ob-ideas">İçerik fikirlerin (isteğe bağlı, her satıra bir)</label><textarea class="textarea" id="ob-ideas" rows="3" maxlength="6000" placeholder="Ör. Barista ipucu: evde süt köpürtme (Reels)"></textarea></div></div>
      <div class="ob-row"><button type="button" class="btn btn-ghost" id="ob-none">Hiçbir şey yok, sorularla devam</button><span class="spacer"></span><button type="button" class="btn btn-primary" id="ob-send">${icon('check')}Gönder</button></div></div>`;
    const listEl = input.querySelector('#ob-file-list');
    const drawFiles = () => {
      listEl.innerHTML = files.map((f, i) => `<div class="ob-file"><img src="${f.url}" alt=""><select class="select input-sm" data-kind="${i}" aria-label="${esc(f.file.name)} türü">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select><button type="button" class="btn btn-sm btn-ghost icon-btn" data-rm="${i}" aria-label="Çıkar">${icon('x')}</button></div>`).join('');
    };
    const addFiles = list => { for (const file of list) if (/^image\//.test(file.type)) files.push({ file, kind: guessKind(file.name), url: URL.createObjectURL(file) }); drawFiles(); };
    const dz = input.querySelector('#ob-drop');
    input.querySelector('#ob-files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); addFiles(e.dataTransfer.files); });
    listEl.addEventListener('change', e => { const s = e.target.closest('[data-kind]'); if (s) files[+s.dataset.kind].kind = s.value; });
    listEl.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { files.splice(+r.dataset.rm, 1); drawFiles(); } });
    const send = async btn => {
      const text = input.querySelector('#ob-text').value.trim();
      const ideaText = input.querySelector('#ob-ideas').value.trim();
      const site = input.querySelector('#ob-site').value.trim();
      me(files.length || text || ideaText || site ? [site ? `web sitesi (${site})` : '', files.length ? `${files.length} görsel (${[...new Set(files.map(f => KINDS[f.kind]))].join(', ')})` : '', text ? 'marka metni' : '', ideaText ? `${ideaText.split('\n').filter(Boolean).length} fikir` : ''].filter(Boolean).join(' · ') : 'Hiçbir şey yok, sorularla devam edelim.');
      try {
        const r = await busyTimer(btn, async () => {
          const colors = { logo: [], palette: [] };
          // Görseller üçer üçer yüklenir; her birinin küçük resmi (≤400 px) da kaydedilir: yapay zekâ büyük dosya yerine
          // bunu okur (hızlı ve ucuz), kütüphane de hızlı açılır
          const up = new Array(files.length);
          let next = 0;
          const worker = async () => {
            while (next < files.length) {
              const i = next++;
              const f = files[i];
              const { asset } = await api.uploadAsset(brand.id, f.file, 'other', f.file.name.replace(/\.[^.]+$/, '').slice(0, 80));
              up[i] = { id: asset.id, kind: f.kind };
              if (/^image\/(png|jpeg|webp)$/.test(f.file.type)) await makeThumb(f.url).then(t => api.saveThumb(brand.id, asset.id, t)).catch(() => {});
            }
          };
          await Promise.all([worker(), worker(), worker()]);
          for (const f of files) {
            if (f.kind === 'palet') colors.palette.push(...await dominantColors(f.file, { n: 6 }).catch(() => []));
            if (f.kind === 'logo' && !colors.logo.length) colors.logo.push(...await dominantColors(f.file, { n: 4, skipWhite: true }).catch(() => []));
          }
          return api.onboardAbsorb(brand.id, { files: up, colors, text, site, ideas: ideaText });
        }, files.length ? 'Yüklüyorum' : site ? 'Siteyi okuyorum' : 'Kaydediyorum');
        st = r;
        bot(r.found.length ? `Şunları aldım ve yerlerine koydum:<ul class="ob-list">${r.found.map(x => `<li>✓ ${esc(x)}</li>`).join('')}</ul>${r.notes.length ? `<p class="small muted">${r.notes.map(esc).join('<br>')}</p>` : ''}${r.questions.length ? 'Şimdi yalnız eksik kalanları soracağım.' : ''}` : `Tamam, sorularla devam edelim.${r.notes.length ? `<p class="small muted">${r.notes.map(esc).join('<br>')}</p>` : ''}`);
        if (text || site || files.some(f => f.kind === 'maskot')) bot(`<span class="small">${r.aiReady ? 'Site metnini, yazdığın metni ve maskot görsellerini yapay zekâya en sonda, arka planda okutacağım; şimdi seni bekletmeyelim.' : 'Yapay zekâ bağlı olmadığı için metni ve maskot görsellerini okuyamıyorum; eksikleri sorularla tamamlayacağız.'}</span>`);
        next();
      } catch (err) { toast(err.message, 'error'); }
    };
    input.querySelector('#ob-send').addEventListener('click', e => send(e.currentTarget));
    input.querySelector('#ob-none').addEventListener('click', e => { files.length = 0; input.querySelector('#ob-text').value = ''; input.querySelector('#ob-ideas').value = ''; input.querySelector('#ob-site').value = ''; send(e.currentTarget); });
  }

  // 3) Eksik sorular
  function askPhase(q) {
    bot(`<b>${esc(q.label)}</b>${q.optional ? ' <span class="small muted">(isteğe bağlı)</span>' : ''}`);
    const vals = q.values || q.options || [];
    const chips = (multi) => `<div class="chip-row">${(q.options || []).map((o, i) => `<label class="chip-check"><input type="${multi ? 'checkbox' : 'radio'}" name="opt" value="${esc(vals[i])}"><span>${esc(o)}</span></label>`).join('')}</div>`;
    const other = q.other ? '<input class="input mt-2" name="other" maxlength="300" placeholder="Diğer (virgülle birden çok yazabilirsin)" aria-label="Diğer">' : '';
    const skip = '<button type="button" class="btn btn-ghost" data-skip>Geç</button>';
    let body = '';
    if (q.type === 'one' || q.type === 'many') body = `${chips(q.type === 'many')}${other}<div class="ob-row mt-2">${skip}<span class="spacer"></span><button class="btn btn-primary" type="submit">Tamam</button></div>`;
    else if (q.type === 'text') body = `${q.long ? '<textarea class="textarea" name="text" rows="3" maxlength="6000"></textarea>' : '<input class="input" name="text" maxlength="300">'}<div class="ob-row mt-2">${skip}<span class="spacer"></span><button class="btn btn-primary" type="submit">Gönder</button></div>`;
    else if (q.type === 'color') body = `<div class="ob-row"><input type="color" name="pick" value="#5b55e6" aria-label="Renk seç"><input class="input w-auto" name="hex" value="#5b55e6" maxlength="7" aria-label="HEX"><input class="input grow" name="more" placeholder="Diğer renkler (isteğe bağlı): #ffffff, #1b1f3b" aria-label="Diğer renkler"></div><div class="ob-row mt-2">${skip}<span class="spacer"></span><button class="btn btn-primary" type="submit">Tamam</button></div>`;
    else if (q.type === 'yesno') body = `<div class="ob-row"><button type="button" class="btn btn-primary" data-yes>${esc(q.yes)}</button><button type="button" class="btn" data-no>${esc(q.no)}</button><span class="spacer"></span>${skip}</div>`;
    else if (q.type === 'upload') body = `<div class="ob-row"><label class="btn btn-primary">${icon('upload')}Görsel seç<input type="file" class="sr-only" name="file" ${q.multiple ? 'multiple' : ''} accept="image/png,image/jpeg,image/webp,image/gif"></label><span class="spacer"></span>${skip}</div>`;
    input.innerHTML = `<form id="ob-q" class="stack-sm">${body}</form>`;
    const form = input.querySelector('#ob-q');
    const first = form.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=color]), textarea');
    if (first) first.focus();
    const submit = async (value, label, btn) => {
      me(esc(label));
      try { st = await busy(btn, () => api.onboardAnswer(brand.id, q.key, { value })); next(); } catch (err) { toast(err.message, 'error'); }
    };
    form.addEventListener('input', e => {
      if (e.target.name === 'pick') form.hex.value = e.target.value;
      if (e.target.name === 'hex' && /^#[0-9a-f]{6}$/i.test(e.target.value)) form.pick.value = e.target.value;
    });
    form.addEventListener('click', async e => {
      if (e.target.closest('[data-skip]')) { me('Geç'); try { st = await api.onboardAnswer(brand.id, q.key, { skip: true }); next(); } catch (err) { toast(err.message, 'error'); } return; }
      if (e.target.closest('[data-yes]')) return submit(true, q.yes, e.target.closest('button'));
      if (e.target.closest('[data-no]')) return submit(false, q.no, e.target.closest('button'));
    });
    // Tek seçimde seçeneğe basınca hemen gönderilir
    if (q.type === 'one') form.addEventListener('change', e => { if (e.target.name === 'opt' && (!form.other || !form.other.value.trim())) submit(e.target.value, e.target.value, null); });
    form.addEventListener('change', async e => {
      if (e.target.name !== 'file' || !e.target.files.length) return;
      let ok = 0;
      for (const f of e.target.files) { try { await api.uploadAsset(brand.id, f, q.category, f.name.replace(/\.[^.]+$/, '').slice(0, 80)); ok++; } catch (err) { toast(`${f.name}: ${err.message}`, 'error'); } }
      if (ok) submit(null, `${ok} görsel yüklendi`, null);
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      if (q.type === 'text') { const t = String(fd.get('text') || '').trim(); if (!t && !q.optional) return toast('Bir şey yaz ya da Geç\'e bas.', 'error'); return submit(t, t || '—', e.submitter); }
      if (q.type === 'color') { const list = [fd.get('hex'), ...String(fd.get('more') || '').split(/[\s,]+/)].filter(c => /^#[0-9a-f]{6}$/i.test(c)); return submit(list, list.join(', '), e.submitter); }
      const picked = fd.getAll('opt').map(String);
      const otherV = String(fd.get('other') || '').split(',').map(x => x.trim()).filter(Boolean);
      const all = [...picked, ...otherV];
      if (!all.length) return toast('Bir seçenek seç, "Diğer"e yaz ya da Geç\'e bas.', 'error');
      const labels = all.map(v => { const i = vals.indexOf(v); return i >= 0 && q.options ? q.options[i] : v; });
      submit(q.type === 'one' ? all[0] : all, labels.join(', '), e.submitter);
    });
  }

  // 4) Bitiş: anında. Yapay zekâ istenirse arka planda boş kalanları doldurur; kullanıcı beklemez.
  function finishPhase() {
    bot(`Temel bilgiler tamam.${st.aiReady ? ' İstersen yapay zekâ <b>arka planda</b> boş kalan alanları, maskotun tarifini, benzer fikirleri ve referansından örnek tasarımı doldursun; sen bu sırada uygulamayı kullanmaya devam edersin.' : ''}`);
    input.innerHTML = `<div class="ob-row">${st.aiReady ? '<label class="check"><input type="checkbox" id="ob-use-ai" checked> Yapay zekâ arka planda tamamlasın</label>' : ''}<span class="spacer"></span><button type="button" class="btn btn-primary" id="ob-finish">${icon('check')}Kurulumu bitir</button></div>`;
    input.querySelector('#ob-finish').addEventListener('click', async e => {
      const cb = input.querySelector('#ob-use-ai');
      const useAi = cb ? cb.checked : true; // AI bağlı değilse sunucu nedenini not eder
      try {
        const r = await busy(e.currentTarget, () => api.onboardFinish(brand.id, { useAi }));
        st = r;
        bot(`Hazırız!${r.notes.length ? `<p class="small muted">${r.notes.map(esc).join('<br>')}</p>` : ''} Ayrıntıları istediğin zaman Marka kimliğinden düzenleyebilirsin.`);
        donePhase();
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  // Arka plandaki yapay zekâ işinin durumu (sayfa açıkken birkaç saniyede bir bakılır)
  function aiStatus() {
    const ai = st.state.ai;
    if (!ai) return;
    const box = document.createElement('div');
    box.className = 'ob-msg ob-bot';
    box.innerHTML = `<span class="ob-av">${icon('sparkle')}</span><div class="ob-bubble" id="ob-ai"></div>`;
    chat.appendChild(box);
    const el = box.querySelector('#ob-ai');
    const draw = a => {
      el.innerHTML = a.status === 'calisiyor'
        ? `<span class="ob-spin" aria-hidden="true"></span> Yapay zekâ arka planda çalışıyor… ${a.found.length ? `<ul class="ob-list">${a.found.map(x => `<li>✓ ${esc(x)}</li>`).join('')}</ul>` : ''}<span class="xsmall muted">Beklemen gerekmiyor; bittiğinde Marka dosyasında görünür.</span>`
        : `${a.status === 'bitti' ? 'Yapay zekâ bitirdi:' : 'Yapay zekâ işi yarıda kaldı:'}${a.found.length ? `<ul class="ob-list">${a.found.map(x => `<li>✓ ${esc(x)}</li>`).join('')}</ul>` : ' doldurulacak yeni bir şey bulamadı.'}${a.notes.length ? `<p class="small muted">${a.notes.map(esc).join('<br>')}</p>` : ''}`;
      chat.scrollTop = chat.scrollHeight;
    };
    draw(ai);
    if (ai.status !== 'calisiyor') return;
    const tick = async () => {
      if (!el.isConnected) return;
      try { const r = await api.onboard(brand.id); if (r.state.ai) { draw(r.state.ai); if (r.state.ai.status !== 'calisiyor') return; } } catch { /* bir dahaki sefere */ }
      setTimeout(tick, 4000);
    };
    setTimeout(tick, 3000);
  }
  function donePhase() {
    aiStatus();
    input.innerHTML = `<div class="ob-row ob-links"><a class="btn btn-primary" href="${base}">Marka ana sayfası</a><a class="btn" href="${base}/kimlik">Marka dosyası</a><a class="btn" href="${base}/fikirler">İçerik fikirleri</a><a class="btn" href="${base}/post">Post stüdyosu</a></div>`;
  }

  function next() {
    if (!st.state.absorbed) return dropPhase();
    if (st.state.finished) { bot('Bu markanın kurulumu tamamlanmış. Eksik kalanlar Marka dosyasında işaretli; oradan tamamlayabilirsin.'); return donePhase(); }
    if (st.questions.length) return askPhase(st.questions[0]);
    return finishPhase();
  }
  if (st.state.absorbed && !st.state.finished) bot(`Kaldığımız yerden devam ediyoruz: <b>${esc(brand.name)}</b>.`);
  next();
}
