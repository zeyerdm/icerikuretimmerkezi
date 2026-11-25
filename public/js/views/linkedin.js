// LinkedIn: marka hafızasıyla LinkedIn yazısı üretir ya da hazır bir içeriği (fikir, post tasarımı, Reels senaryosu, takvim
// içeriği) LinkedIn diline uyarlar. LinkedIn görünümünde önizleme ("…daha fazla" kırılımı), kural denetimi, kopyalama ve
// takvime kaydetme. Doğrudan LinkedIn'e paylaşım yok: kopyala + yapıştır (belge için Post stüdyosundan PDF).
import { api } from '../api.js';
import { esc, icon, toast, pageHead } from '../ui.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';
import { state } from '../app.js';

const SOURCES = [['konu', 'Konu yaz'], ['idea', 'Fikir havuzundan'], ['post', 'Post tasarımından'], ['prompt', 'Reels senaryosundan'], ['content', 'Takvim içeriğinden']];

// Sunucudaki denetimin istemci kopyası (yazarken anında)
function check(text, tags, L) {
  const s = String(text || '');
  const out = [];
  const first = s.split('\n').find(l => l.trim()) || '';
  if (first.length > L.fold) out.push(`İlk satır ${first.length} karakter; "…daha fazla"dan önce görünen kısım kabaca ${L.fold} karakter.`);
  if (s.length && s.length < L.min) out.push(`${s.length} karakter; ${L.target[0]}-${L.target[1]} daha iyi çalışır.`);
  if (s.length > L.max) out.push(`${s.length} karakter; ${L.max} sınırını aşıyor.`);
  if (/\n[^\n]{450,}/.test('\n' + s)) out.push('Çok uzun paragraf var; 1-3 cümlelik kısa paragraflar okunur.');
  const n = tags.length;
  if (s.length && (n < L.hashtags[0] || n > L.hashtags[1])) out.push(`Hashtag sayısı ${n}; ${L.hashtags.join('-')} arası önerilir.`);
  return out;
}
const tagsOf = v => [...new Set(String(v || '').split(/[\s,]+/).map(x => x.trim().replace(/^#*/, '')).filter(Boolean).map(x => '#' + x))];
// Varsayılan yayın zamanı: bir sonraki iş günü 09:00 (LinkedIn'de hafta içi sabahları)
function nextWorkdayMorning() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`;
}

export async function renderLinkedin(view, brand, sub = null) {
  const L = (state.meta.linkedin && state.meta.linkedin.limits) || { fold: 210, min: 900, target: [1300, 2000], max: 2200, hashtags: [3, 5] };
  const VOICES = (state.meta.linkedin && state.meta.linkedin.voices) || { sirket: 'Şirket sayfası', kisisel: 'Kurucu / yönetici adına' };
  view.innerHTML = '<p class="muted">Yükleniyor…</p>';
  const [models, ideasR, postsR, promptsR, contentsR] = await Promise.all([
    aiModels().catch(() => null),
    api.ideas(brand.id).catch(() => ({ ideas: [] })),
    api.posts(brand.id).catch(() => ({ posts: [] })),
    api.prompts(brand.id, { kind: 'reels' }).catch(() => ({ prompts: [] })),
    api.contents({ brandId: brand.id, limit: 500 }).catch(() => ({ contents: [] }))
  ]);
  const lists = {
    idea: (ideasR.ideas || []).filter(i => !i.archived).sort((a, b) => (b.format === 'linkedin') - (a.format === 'linkedin')).map(i => [i.id, `${i.format === 'linkedin' ? '★ ' : ''}${i.title}`]),
    post: (postsR.posts || []).filter(p => !p.archived).map(p => [p.id, `${p.title} (${p.kindLabel})`]),
    prompt: (promptsR.prompts || []).filter(p => p.plan).map(p => [p.id, p.title]),
    content: (contentsR.contents || []).filter(c => !/^linkedin/.test(c.type)).slice(0, 200).map(c => [c.id, `${c.title} (${c.typeLabel})`])
  };
  const mine = (contentsR.contents || []).filter(c => /^linkedin/.test(c.type)).sort((a, b) => String(b.scheduledAt || b.updatedAt).localeCompare(String(a.scheduledAt || a.updatedAt)));
  // Uyarlama bağlantısından gelindiyse (ör. /linkedin/post-<id>) kaynak seçili açılır
  const pre = sub && sub.match(/^(post|prompt|content|idea)-(.+)$/);
  let source = pre ? pre[1] : 'konu';
  let draft = { contentId: null, title: '', text: '', tags: [], voice: 'sirket', scheduledAt: nextWorkdayMorning(), type: 'linkedin' };

  const showList = sub === 'yazilar';
  view.innerHTML = `
    ${pageHead({ title: 'LinkedIn', desc: `${esc(brand.name)} için LinkedIn'e özgü yazı: kanca, kısa paragraflar, tartışma açan soru ve 3-5 hashtag. Hazır bir fikri, tasarımı, Reels'i ya da takvim içeriğini LinkedIn diline uyarlar; marka hafızasına ve web sitesindeki bilgilere sadık kalır.`,
      actions: `<a class="btn" href="#/m/${esc(brand.id)}/post" title="Post stüdyosunda Yeni → LinkedIn belgesi: sayfalar LinkedIn diliyle yazılır, PDF olarak indirilir">${icon('palette')}LinkedIn belgesi (PDF)</a>` })}
    <section class="card mb-4">
      <div class="tabs mb-3" role="tablist" aria-label="LinkedIn"><button type="button" role="tab" class="${showList ? '' : 'active'}" aria-selected="${!showList}" data-li-tab="yeni">Yeni yazı</button><button type="button" role="tab" class="${showList ? 'active' : ''}" aria-selected="${showList}" data-li-tab="yazilar">Yazılarım (${mine.length})</button></div>
      <div id="li-pane-yeni" ${showList ? 'hidden' : ''}>
        <div class="ps-step">Neyden yazalım?</div>
        <div class="chips mb-3" role="radiogroup" aria-label="Kaynak">${SOURCES.map(([k, v]) => `<button type="button" role="radio" class="chip ${k === source ? 'active' : ''}" aria-checked="${k === source}" data-src="${k}">${v}</button>`).join('')}</div>
        <div class="ps-compose">
          <div class="ps-compose-top" id="li-pick-wrap" ${source === 'konu' ? 'hidden' : ''}><label class="small strong" for="li-pick">Uyarlanacak içerik</label><select class="select grow" id="li-pick"></select></div>
          <label class="sr-only" for="li-brief" id="li-brief-label">${source === 'konu' ? 'Konu' : 'Ek not (isteğe bağlı)'}</label>
          <textarea class="textarea ps-brief" id="li-brief" maxlength="2000" placeholder="${source === 'konu' ? 'Konuyu yaz. Ör. Yapay zekâ ile içtihat aramada 3 sık yapılan hata' : 'İsteğe bağlı ek not. Ör. Rakam ver, sonda soru sor'}"></textarea>
          <div class="ps-compose-foot">${models ? modelSelect(models, 'yazim', { id: 'li-model' }) : ''}
            <select class="select w-auto" id="li-voice" aria-label="Ses">${Object.entries(VOICES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
            <input class="input w-auto" id="li-person" maxlength="120" placeholder="Kimin adına? Ör. Ayşe Yılmaz, Kurucu" aria-label="Kimin adına" hidden>
            <span class="spacer"></span><span class="xsmall muted" id="li-ai"></span>
            <button type="button" class="btn btn-ghost btn-sm" id="li-manual" title="Yapay zekâsız, kendin yaz">Kendim yazacağım</button>
            <button type="button" class="btn btn-primary" id="li-write">${icon('sparkle')}LinkedIn yazısı yaz</button></div>
        </div>
      </div>
      <div id="li-pane-yazilar" ${showList ? '' : 'hidden'}>
        ${mine.length ? `<ul class="li-list">${mine.map(c => `<li><button type="button" class="li-item" data-open="${esc(c.id)}"><b>${esc(c.title)}</b><span class="xsmall muted">${esc(c.typeLabel)} · ${c.scheduledAt ? esc(new Date(c.scheduledAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : 'tarih yok'} · ${esc(c.statusLabel)}</span><span class="small li-snip">${esc(String(c.caption || '').slice(0, 140))}</span></button></li>`).join('')}</ul>` : '<p class="small muted">Henüz LinkedIn yazısı yok. "Yeni yazı" sekmesinden üret; kaydettiklerin burada ve takvimde görünür.</p>'}
      </div>
    </section>
    <section class="card" id="li-editor" hidden>
      <div class="card-head"><h3 id="li-ed-title">Yazı</h3><span class="xsmall muted" id="li-count"></span></div>
      <div class="li-grid">
        <div>
          <div class="field"><label for="li-title">Başlık (takvimde görünür)</label><input class="input" id="li-title" maxlength="200"></div>
          <div class="field mt-2"><label for="li-text">Metin</label><textarea class="textarea li-text" id="li-text" rows="16" maxlength="${L.max}" placeholder="İlk satır kanca olsun."></textarea></div>
          <div class="field mt-2"><label for="li-tags">Hashtag'ler</label><input class="input" id="li-tags" placeholder="#pazarlama #girişimcilik #yapayzeka"></div>
          <ul class="li-issues mt-2" id="li-issues" aria-live="polite"></ul>
        </div>
        <div>
          <div class="li-preview" aria-label="LinkedIn önizleme"><div class="li-pv-head"><span class="li-av">${esc((brand.name || '?').charAt(0).toLocaleUpperCase('tr-TR'))}</span><div><b>${esc(brand.name)}</b><span class="xsmall muted">LinkedIn önizleme</span></div></div><div class="li-pv-body" id="li-pv"></div></div>
          <div class="field mt-3"><label for="li-when">Yayın zamanı</label><input class="input" id="li-when" type="datetime-local"><span class="hint">LinkedIn'de hafta içi sabahları (08-10) daha çok görülür.</span></div>
          <div class="row mt-3 wrap"><button type="button" class="btn" id="li-copy">${icon('copy')}Kopyala</button><button type="button" class="btn btn-primary" id="li-save">${icon('calendar')}Takvime kaydet</button><button type="button" class="btn btn-ghost" id="li-draft">Taslak olarak kaydet</button><button type="button" class="btn btn-ghost" id="li-new" hidden>Yeni yazı</button></div>
        </div>
      </div>
    </section>`;

  const $ = sel => view.querySelector(sel);
  const fillPick = () => {
    const opts = lists[source] || [];
    $('#li-pick').innerHTML = opts.length ? opts.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('') : '<option value="">Bu türde içerik yok</option>';
    if (pre && pre[1] === source) $('#li-pick').value = pre[2];
  };
  fillPick();

  const render = () => {
    const t = $('#li-text').value; const tags = tagsOf($('#li-tags').value);
    const first = t.split('\n').find(l => l.trim()) || '';
    $('#li-count').textContent = t ? `${t.length} karakter · ilk satır ${first.length}/${L.fold}` : '';
    $('#li-issues').innerHTML = check(t, tags, L).map(x => `<li>${esc(x)}</li>`).join('');
    // "…daha fazla" kırılımı: ilk ~fold karakter ya da ilk 3 satır görünür
    const lines = t.split('\n'); let shown = ''; let cut = false;
    for (let i = 0; i < lines.length; i++) { const next = shown + (i ? '\n' : '') + lines[i]; if (next.length > L.fold || i >= 3) { cut = true; shown = (shown || lines[i].slice(0, L.fold)); break; } shown = next; }
    $('#li-pv').innerHTML = t ? `<p class="li-pv-text">${esc(shown)}${cut ? '<button type="button" class="li-more" data-more>…daha fazla</button>' : ''}</p>${cut ? `<p class="li-pv-text li-rest" hidden>${esc(t)}</p>` : ''}${tags.length ? `<p class="li-pv-tags">${esc(tags.join(' '))}</p>` : ''}` : '<p class="small muted">Önizleme burada görünür.</p>';
  };
  const load = d => {
    draft = Object.assign(draft, d);
    $('#li-title').value = draft.title || ''; $('#li-text').value = draft.text || ''; $('#li-tags').value = (draft.tags || []).join(' ');
    $('#li-when').value = draft.scheduledAt || '';
    $('#li-ed-title').textContent = draft.contentId ? 'Yazıyı düzenle' : 'Yazı';
    $('#li-editor').hidden = !(draft.contentId || draft.text || d.show);
    $('#li-save').innerHTML = `${icon('calendar')}${draft.contentId ? 'Kaydet' : 'Takvime kaydet'}`;
    $('#li-draft').hidden = Boolean(draft.contentId);
    $('#li-new').hidden = !draft.contentId;
    render();
  };
  load({ scheduledAt: nextWorkdayMorning() });

  view.oninput = e => { if (['li-text', 'li-tags'].includes(e.target.id)) render(); };
  view.onchange = e => { if (e.target.id === 'li-voice') { draft.voice = e.target.value; $('#li-person').hidden = draft.voice !== 'kisisel'; } };
  view.onclick = async e => {
    const src = e.target.closest('[data-src]');
    if (src) {
      source = src.dataset.src;
      view.querySelectorAll('[data-src]').forEach(b => { b.classList.toggle('active', b === src); b.setAttribute('aria-checked', String(b === src)); });
      $('#li-pick-wrap').hidden = source === 'konu';
      $('#li-brief-label').textContent = source === 'konu' ? 'Konu' : 'Ek not (isteğe bağlı)';
      $('#li-brief').placeholder = source === 'konu' ? 'Konuyu yaz. Ör. Yapay zekâ ile içtihat aramada 3 sık yapılan hata' : 'İsteğe bağlı ek not. Ör. Rakam ver, sonda soru sor';
      fillPick(); return;
    }
    const tab = e.target.closest('[data-li-tab]');
    if (tab) { const t = tab.dataset.liTab; view.querySelectorAll('[data-li-tab]').forEach(b => { b.classList.toggle('active', b === tab); b.setAttribute('aria-selected', String(b === tab)); }); $('#li-pane-yeni').hidden = t !== 'yeni'; $('#li-pane-yazilar').hidden = t !== 'yazilar'; return; }
    if (e.target.closest('#li-manual')) { load({ contentId: null, show: true, title: $('#li-brief').value.trim().slice(0, 80), text: '', tags: [], type: 'linkedin', scheduledAt: nextWorkdayMorning() }); $('#li-text').focus(); return; }
    if (e.target.closest('[data-more]')) { const r = $('.li-rest'); if (r) { r.hidden = false; e.target.closest('.li-pv-text').hidden = true; } return; }
    const op = e.target.closest('[data-open]');
    if (op) {
      const c = (contentsR.contents || []).find(x => x.id === op.dataset.open);
      if (c) { const p = n => String(n).padStart(2, '0'); const d = c.scheduledAt ? new Date(c.scheduledAt) : null; load({ contentId: c.id, title: c.title, text: c.caption || '', tags: c.hashtags || [], type: c.type, scheduledAt: d ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` : '' }); $('#li-editor').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    const btn = e.target.closest('button'); if (!btn) return;
    if (btn.id === 'li-new') return load({ contentId: null, title: '', text: '', tags: [], type: 'linkedin', scheduledAt: nextWorkdayMorning() });
    if (btn.id === 'li-write') {
      const brief = $('#li-brief').value.trim();
      const pick = source === 'konu' ? null : $('#li-pick').value;
      if (source === 'konu' && !brief) return toast('Bir konu yaz.', 'error');
      if (source !== 'konu' && !pick) return toast('Uyarlanacak bir içerik seç.', 'error');
      try {
        const r = await busyTimer(btn, () => api.linkedinWrite(brand.id, { brief, voice: draft.voice, person: $('#li-person').value, source: pick ? { kind: source, id: pick } : null, model: ($('#li-model') || {}).value || null }), 'Yazıyor');
        load({ contentId: null, title: r.title, text: r.text, tags: r.hashtags, type: 'linkedin', scheduledAt: $('#li-when').value || nextWorkdayMorning() });
        $('#li-ai').textContent = aiNote(r.ai);
        toast(r.issues.length ? 'Yazı hazır; altta önerilere bak.' : 'Yazı hazır. Kontrol edip kopyala ya da takvime kaydet.', 'success');
      } catch (err) { toast(err.message, 'error', 8000); }
      return;
    }
    if (btn.id === 'li-copy') {
      const t = $('#li-text').value.trim(); const tags = tagsOf($('#li-tags').value);
      if (!t) return toast('Kopyalanacak metin yok.', 'error');
      try { await navigator.clipboard.writeText(tags.length ? `${t}\n\n${tags.join(' ')}` : t); toast('Kopyalandı; LinkedIn\'de "Gönderi başlat"a yapıştır.', 'success'); } catch { toast('Tarayıcı kopyalamaya izin vermedi; metni seçip Ctrl+C yap.', 'error'); }
      return;
    }
    if (btn.id === 'li-save' || btn.id === 'li-draft') {
      const t = $('#li-text').value.trim();
      if (!t) return toast('Önce metni yaz ya da ürettir.', 'error');
      const when = btn.id === 'li-draft' ? null : ($('#li-when').value ? new Date($('#li-when').value).toISOString() : null);
      try {
        const r = await busyTimer(btn, () => api.linkedinSave(brand.id, { contentId: draft.contentId, title: $('#li-title').value.trim() || 'LinkedIn yazısı', text: t, hashtags: tagsOf($('#li-tags').value), scheduledAt: when, voice: draft.voice, type: draft.type || 'linkedin' }), 'Kaydediyor');
        toast(when ? 'Takvime kaydedildi.' : 'Taslak olarak kaydedildi (takvimde tarihsiz).', 'success');
        renderLinkedin(view, brand, 'yazilar').then(() => { /* liste yenilendi */ });
        return r;
      } catch (err) { toast(err.message, 'error'); }
    }
  };
}

