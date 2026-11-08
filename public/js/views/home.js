// Ana ekran: AI asistanı merkezde; yanında marka kimliği, son fikirler ve son çalışmalar
import { api } from '../api.js';
import { esc, icon, toast, timeAgo, errorNotice, ring, bucketByDay, emptyState, busy } from '../ui.js';
import { state, refreshBrands } from '../app.js';

// Hızlı işlemler asistana hazır bir istek gönderir (marka hafızasıyla çalışır)
const QUICK = [
  { icon: '💡', title: '5 içerik fikri', sub: 'Bu hafta için, karışık kategoriler', prompt: 'Bu hafta paylaşabileceğim 5 içerik fikri üret ve kaydet. Kategorileri karışık olsun.' },
  { icon: '😄', title: 'Eğlenceli fikirler', sub: 'Hedef kitleye göre 3 fikir', prompt: 'Hedef kitlemizin "bu tam ben" diyeceği 3 eğlenceli içerik fikri üret ve kaydet.' },
  { icon: '🗓️', title: 'Haftalık plan', sub: 'Gün gün paylaşım önerisi', prompt: 'Önümüzdeki hafta için gün gün kısa bir paylaşım planı öner. Hangi gün ne tür içerik paylaşmalıyım?' },
  { icon: '🎯', title: 'Marka dili özeti', sub: 'Nasıl konuşmalıyız?', prompt: 'Marka kimliğimize göre içeriklerde nasıl bir dil kullanmalıyım? Yapılacaklar ve kaçınılacaklar listesi ver.' }
];

const CHIPS = [
  'Haftaya 5 Reels fikri üret',
  'Son fikre göre carousel tasarla',
  'Satış odaklı 3 fikir üret',
  'Yaklaşan özel günler için fikir öner',
  'Son fikirlerden hangisiyle başlamalıyım?'
];

// Marka çalışma alanının ana sayfası: AI asistanı merkezde; yanında marka kimliği, fikir grafiği, son fikirler
export async function renderHome(view, brand) {
  view.innerHTML = '<div class="home" aria-busy="true"><div class="stack"><div class="skeleton" style="height:184px"></div><div class="skeleton" style="height:132px"></div><div class="skeleton" style="height:420px"></div></div><div class="stack"><div class="skeleton" style="height:240px"></div><div class="skeleton" style="height:240px"></div></div></div>';
  const [overview, chat] = await Promise.all([api.overview(brand.id), api.chat(brand.id)]);
  if (state.workspaceBrandId !== brand.id) return; // yüklenirken başka sayfaya geçildiyse eski çizimi bırak
  const aiReady = state.settings.ai.configured;
  const firstVisit = chat.messages.length === 0;

  view.innerHTML = `
    <div class="home">
      <div class="stack">
        ${brand.isDemo ? demoGuide(brand, aiReady) : ''}
        <section class="card hero">
          <div class="orb"></div><div class="orb small"></div>
          <div class="hero-text">
            <h1>${firstVisit ? 'Merhaba!' : 'Tekrar hoş geldin!'} Bugün <b>${esc(brand.name)}</b> için ne üretelim?</h1>
            <p>${overview.ideaCount ? `Fikir havuzunda ${overview.ideaCount} fikir var${overview.favoriteCount ? `, ${overview.favoriteCount} tanesi favori` : ''}.` : 'Asistana bir istek yaz ya da aşağıdaki hızlı işlemlerden biriyle başla.'}</p>
          </div>
          ${overview.mascotUrl ? `<img class="hero-mascot" src="${esc(overview.mascotUrl)}" alt="">` : ''}
        </section>

        ${aiReady ? `<div class="quick">
          ${QUICK.map((q, i) => `<button type="button" data-quick="${i}"><span class="q-icon">${q.icon}</span><span class="q-title">${q.title}</span><span class="q-sub">${q.sub}</span></button>`).join('')}
        </div>` : ''}

        <div class="kpis three">
          <a class="kpi k1" href="#/m/${esc(brand.id)}/fikirler"><div class="kpi-icon">${icon('idea')}</div><div class="kpi-num">${overview.ideaCount}</div><div class="kpi-label">İçerik fikri</div><div class="kpi-sub">fikir havuzunda</div></a>
          <a class="kpi k3" href="#/m/${esc(brand.id)}/fikirler"><div class="kpi-icon">${icon('star')}</div><div class="kpi-num">${overview.favoriteCount}</div><div class="kpi-label">Favori</div><div class="kpi-sub">beğenilen fikir</div></a>
          <a class="kpi k4" href="#/m/${esc(brand.id)}/kutuphane"><div class="kpi-icon">${icon('image')}</div><div class="kpi-num">${overview.assetTotal}</div><div class="kpi-label">Varlık</div><div class="kpi-sub">logo, maskot, görsel</div></a>
        </div>

        <section class="card chat" aria-label="AI asistanı">
          <div class="chat-head">
            <div class="ai-badge">✦</div>
            <div class="grow"><h3>AI Asistanı</h3><div class="xsmall muted">${esc(brand.name)} marka hafızasıyla çalışıyor</div></div>
            ${chat.messages.length ? `<button class="btn btn-sm btn-ghost" data-action="new-chat">${icon('refresh')}Yeni sohbet</button>` : ''}
          </div>
          <div class="chat-body" id="chat-body"></div>
          <div class="chat-foot">
            ${aiReady ? `<div class="chips">${CHIPS.map(c => `<button type="button" class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
              : `<div class="notice"><div><strong>AI bağlı değil.</strong> Asistanın ve hızlı işlemlerin çalışması için bir yapay zekâ sağlayıcısı bağla (Claude, OpenAI, OpenRouter ya da Gemini). Anahtar yalnızca bu bilgisayardaki sunucuda saklanır.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>`}
            <form class="composer" id="composer">
              <textarea class="textarea" id="chat-input" rows="1" placeholder="${aiReady ? 'Örn: Bu marka için haftaya 5 fikir üret' : 'Önce AI bağlantısını kur'}" ${aiReady ? '' : 'disabled'} maxlength="4000"></textarea>
              <button class="btn btn-primary" type="submit" ${aiReady ? '' : 'disabled'} aria-label="Gönder">${icon('send')}</button>
            </form>
          </div>
        </section>
      </div>

      <div class="stack">
        ${identityCard(brand, overview)}
        ${ideaChart(overview.ideaTimes)}
        <section class="card">
          <div class="card-head"><h3>Son fikirler</h3><span class="small muted">${overview.ideaCount} fikir</span></div>
          <div id="idea-list">${ideaList(overview.recentIdeas)}</div>
        </section>
        <section class="card activity">
          <div class="card-head"><h3>Son çalışmalar</h3></div>
          ${overview.activity.length
            ? `<ul>${overview.activity.slice(0, 6).map(a => `<li><span class="a-dot"></span><div>${esc(a.summary)}<div class="muted xsmall">${timeAgo(a.createdAt)}</div></div></li>`).join('')}</ul>`
            : emptyState({ icon: 'refresh', title: 'Henüz bir çalışma yok', compact: true })}
        </section>
      </div>
    </div>`;

  const body = view.querySelector('#chat-body');
  renderMessages(body, chat.messages, brand);
  wire(view, brand, body);
}

// Örnek markada adım adım kullanım rehberi; her adım gerçek bir sayfaya veya işleme götürür
function demoGuide(brand, aiReady) {
  const id = esc(brand.id);
  const steps = [
    ['1', 'Marka kimliğini incele', 'Hedef kitle, iletişim dili, karakter: asistan her yanıtta bunları kullanır.', `<a class="btn btn-sm" href="#/m/${id}/kimlik">Profili aç</a>`],
    ['2', 'Renk ve fontlara bak', 'Canlı önizlemede bir rengi değiştir, post nasıl değişiyor gör.', `<a class="btn btn-sm" href="#/m/${id}/kimlik/gorsel">Görsel kimlik</a>`],
    ['3', 'Logo ve maskot pozları', '"Çekirdek" maskotunun pozları ve logo varlık kütüphanesinde.', `<a class="btn btn-sm" href="#/m/${id}/kutuphane">Kütüphane</a>`],
    ['4', 'Asistandan fikir iste', aiReady ? 'Dene\'ye bas: hazır bir istek gönderilir, fikirler bu markanın diliyle üretilip kaydedilir.' : 'Önce Yapay zekâ sayfasından bir sağlayıcı bağla, sonra asistana yaz.',
      aiReady ? '<button class="btn btn-sm btn-primary" data-demo-try>Dene</button>' : '<a class="btn btn-sm" href="#/ai/modeller">AI bağla</a>'],
    ['5', 'Kendi markanı oluştur', 'Aynı adımları kendi markan için yap. Örnek markayı istediğin zaman silebilirsin.', '<a class="btn btn-sm" href="#/marka/yeni">Yeni marka</a>']
  ];
  return `
    <section class="card demo-guide">
      <div class="card-head"><h3>Örnek marka: nasıl kullanılır?</h3><span class="pill">Örnek</span></div>
      <p class="small muted mb-4">${esc(brand.name)} kurgusal bir kafe. Bütün bilgileri hazır doldurulmuş; uygulamanın parçalarının nasıl birlikte çalıştığını görmek için adımları sırayla dene.</p>
      <ol class="steps">${steps.map(([n, t, d, action]) => `<li><span class="step-n">${n}</span><div><div class="step-t">${t}</div><div class="small muted">${d}</div></div>${action}</li>`).join('')}</ol>
    </section>`;
}

function identityCard(brand, overview) {
  const c = overview.completeness;
  const colors = [brand.colors.primary, ...brand.colors.secondary].filter(Boolean);
  return `
    <section class="card">
      <div class="card-head"><h3>Dijital kimlik</h3>${colors.length ? `<div class="swatches">${colors.slice(0, 5).map(col => `<span class="swatch" style="background:${esc(col)}" title="${esc(col)}"></span>`).join('')}</div>` : ''}</div>
      <div class="identity">
        ${ring(c.percent)}
        <div class="grow">
          <div class="strong truncate">${esc(brand.name)}</div>
          <div class="small muted">${esc(brand.slogan || brand.sector || 'Sektör ve slogan eklenmedi')}</div>
          ${c.missing.length ? `<p class="xsmall muted mt-2">Eksik: ${esc(c.missing.slice(0, 3).join(', '))}${c.missing.length > 3 ? '…' : ''}</p>` : '<p class="small strong mt-2" style="color:var(--teal-ink)">Kimlik tamam ✓</p>'}
        </div>
      </div>
      <a class="btn btn-sm w-full mt-4" href="#/m/${esc(brand.id)}/kimlik">${c.missing.length ? 'Kimliği tamamla' : 'Kimliği düzenle'}</a>
    </section>`;
}

// Son 14 günde eklenen fikirler (gerçek veri); en yoğun gün vurgulanır, bugün sarı
function ideaChart(times) {
  const days = bucketByDay(times, 14);
  const total = days.reduce((n, d) => n + d.count, 0);
  const max = Math.max(...days.map(d => d.count));
  const fmt = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return `
    <section class="card" aria-label="Fikir üretimi grafiği">
      <div class="card-head"><h3>Fikir üretimi</h3><span class="small muted">Son 14 gün</span></div>
      <div class="chart-total"><b>${total}</b><span class="small muted">${total ? 'yeni fikir' : 'henüz fikir eklenmedi'}</span></div>
      <div class="bars">
        ${days.map((d, i) => `<div class="bar ${i === days.length - 1 ? 'today' : ''} ${max > 0 && d.count === max ? 'max' : ''}" title="${fmt(d.date)}: ${d.count} fikir">
          ${max > 0 && d.count === max ? `<span class="tip">${d.count}</span>` : ''}<i style="height:${max ? Math.max(5, Math.round((d.count / max) * 100)) : 5}%"></i></div>`).join('')}
      </div>
      <div class="bar-labels">${days.map(d => `<span>${d.date.getDate()}</span>`).join('')}</div>
      <div class="chart-legend"><span><i style="background:var(--brand)"></i>En yoğun gün</span><span><i style="background:var(--amber)"></i>Bugün</span></div>
    </section>`;
}

function ideaList(ideas) {
  if (!ideas.length) return emptyState({ icon: 'idea', title: 'Henüz fikir yok', text: 'Asistandan fikir iste; ürettikleri buraya kaydedilir.', compact: true });
  return `<div class="idea-list">${ideas.map(i => `
    <div class="idea">
      <button class="star ${i.favorite ? 'on' : ''}" data-fav="${esc(i.id)}" aria-label="${i.favorite ? 'Favoriden çıkar' : 'Favorilere ekle'}" aria-pressed="${i.favorite}">★</button>
      <div><div class="i-title">${esc(i.title)}</div>${i.description ? `<div class="i-desc">${esc(i.description)}</div>` : ''}<span class="tag">${esc(i.categoryLabel)}</span></div>
    </div>`).join('')}</div>`;
}

// Asistanın uyguladığı işlemler: her biri ilgili modüle bağlantıyla; başarısız olan açıkça gösterilir
const ACTION_ERR = { save_ideas: 'Fikirler kaydedilemedi', update_idea: 'Fikir güncellenemedi', add_reels_ideas: 'Reels fikirleri eklenemedi', create_reels: 'Reels senaryosu yazılamadı',
  create_post: 'Post tasarımı üretilemedi', create_prompt: 'Prompt üretilemedi', plan_content: 'Takvime eklenemedi', add_task: 'Görev eklenemedi' };
function actionHtml(a, brand) {
  const m = `#/m/${encodeURIComponent(brand.id)}`;
  const box = (title, inner = '') => `<div class="msg-actions"><div class="act-title">${title}</div>${inner}</div>`;
  const li = items => `<ul>${items.join('')}</ul>`;
  if (a.ok === false) return box(`<span class="act-fail">✗ ${esc(ACTION_ERR[a.type] || 'İşlem yapılamadı')}</span>`, `<div class="small muted">${esc(a.error || '')}</div>`);
  if (a.type === 'save_ideas' && a.ideas && a.ideas.length) return box(`✓ ${a.ideas.length} fikir fikir havuzuna kaydedildi`, li(a.ideas.map(i => `<li>${esc(i.title)} <span class="muted small">· ${esc(i.categoryLabel)}</span></li>`)));
  if (a.type === 'update_idea') return box(`✓ Fikir güncellendi: ${esc(a.idea.title)}`, `<a class="small" href="${m}/fikirler">Fikirlerde gör</a>`);
  if (a.type === 'add_reels_ideas') return box(`✓ ${a.items.length} Reels fikri havuza eklendi`, li(a.items.map(i => `<li>${esc(i.text)}</li>`)) + `<a class="small" href="${m}/reels">Reels fikir havuzunu aç</a>`);
  if (a.type === 'create_reels') return box(`✓ Reels senaryosu yazıldı: ${esc(a.title)}`, `<a class="btn btn-sm" href="${m}/reels/${esc(a.id)}">Senaryoyu aç</a>`);
  if (a.type === 'create_post') return box(`✓ Post tasarımı hazır: ${esc(a.title)}`, `<a class="btn btn-sm" href="${m}/post/${esc(a.id)}">Tasarımı aç</a>`);
  if (a.type === 'create_prompt') return box(`✓ ${esc(a.kindLabel || '')} prompt'u yazıldı: ${esc(a.title)}`, `<a class="btn btn-sm" href="${m}/prompt/${esc(a.id)}">Prompt'u aç</a>`);
  if (a.type === 'plan_content') return box(`✓ ${a.items.length} içerik takvime eklendi`, li(a.items.map(c => `<li>${esc(c.title)} <span class="muted small">· ${esc(c.typeLabel)}${c.scheduledAt ? ' · ' + esc(new Date(c.scheduledAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</span></li>`)) + `<a class="small" href="${m}/takvim">Takvimi aç</a>`);
  if (a.type === 'add_task') return box(`✓ Görev eklendi: ${esc(a.task.title)}${a.task.dueDate ? ` <span class="muted small">· son tarih ${esc(a.task.dueDate)}</span>` : ''}`, '<a class="small" href="#/gorevler">Görevleri aç</a>');
  return '';
}
function messageHtml(m, brand) {
  const actions = (m.actions || []).map(a => actionHtml(a, brand)).join('');
  return `<div class="msg msg-${m.role}">${esc(m.content)}${actions}</div>`;
}

function renderMessages(body, messages, brand) {
  body.innerHTML = messages.length
    ? messages.map(x => messageHtml(x, brand)).join('')
    : `<div class="msg msg-assistant">Merhaba! Ben ${esc(brand.name)} için çalışan içerik asistanınım. Marka kimliğini bilerek fikir üretip kaydedebilir, Reels fikir havuzunu doldurabilir, senaryo yazabilir, post tasarlayabilir, prompt hazırlayabilir, takvime içerik ve görev ekleyebilirim. Ör. "Haftaya 5 Reels fikri üret", "Bu senaryoya göre post tasarla". Nereden başlayalım?</div>`;
  body.scrollTop = body.scrollHeight;
}

function wire(view, brand, body) {
  const input = view.querySelector('#chat-input');
  const form = view.querySelector('#composer');
  let busy = false;

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    busy = true;
    form.querySelector('button').disabled = true;
    input.value = '';
    if (body.querySelector('.msg-assistant:only-child')) body.innerHTML = '';
    body.insertAdjacentHTML('beforeend', messageHtml({ role: 'user', content: message }, brand));
    body.insertAdjacentHTML('beforeend', '<div class="msg msg-assistant msg-typing" id="typing">Düşünüyorum…</div>');
    body.scrollTop = body.scrollHeight;
    try {
      const res = await api.sendChat(brand.id, message);
      const savedIdeas = (res.assistantMessage.actions || []).some(a => a.ok !== false && ['save_ideas', 'update_idea'].includes(a.type));
      if (savedIdeas) {
        // Fikir kaydedildiyse sağ paneller ve marka özeti de güncellensin
        await refreshBrands();
        return renderHome(view, brand);
      }
      body.querySelector('#typing').remove();
      body.insertAdjacentHTML('beforeend', messageHtml(res.assistantMessage, brand));
      body.scrollTop = body.scrollHeight;
    } catch (err) {
      body.querySelector('#typing').remove();
      body.lastElementChild.remove(); // gönderilemeyen mesaj geri alınır, metin kutuya döner
      input.value = message;
      body.insertAdjacentHTML('beforeend', `<div class="msg msg-assistant">${errorNotice(err)}</div>`);
      if (err.code === 'AI_NOT_CONFIGURED') toast('AI bağlı değil: Yapay zekâ sayfasından bir sağlayıcı bağla.', 'error');
    } finally {
      busy = false;
      form.querySelector('button').disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; });

  // Tıklamalar tek bir dinleyiciyle yakalanır; atama, önceki çizimin dinleyicisini değiştirir (birikmez)
  view.onclick = async e => {
    if (e.target.closest('[data-demo-try]')) return send('Sınav haftasında öğrencilere yönelik 3 içerik fikri üret ve kaydet: biri eğlenceli, biri eğitici, biri satış odaklı olsun.');
    const quick = e.target.closest('[data-quick]');
    if (quick) return send(QUICK[Number(quick.dataset.quick)].prompt);
    const chip = e.target.closest('[data-chip]');
    if (chip) return send(chip.dataset.chip);
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const on = !fav.classList.contains('on');
      try {
        await api.updateIdea(brand.id, fav.dataset.fav, { favorite: on });
        fav.classList.toggle('on', on);
        fav.setAttribute('aria-pressed', String(on));
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const newChat = e.target.closest('[data-action="new-chat"]');
    if (newChat) {
      if (!confirm('Bu markanın sohbet geçmişi silinsin mi? Kaydedilen fikirler silinmez.')) return;
      try { await busy(newChat, () => api.clearChat(brand.id)); renderHome(view, brand); } catch (err) { toast(err.message, 'error'); }
    }
  };
}
