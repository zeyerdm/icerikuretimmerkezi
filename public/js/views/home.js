// Ana ekran: AI asistanı merkezde; yanında marka kimliği, son fikirler ve son çalışmalar
import { api } from '../api.js';
import { esc, icon, toast, timeAgo, brandAvatar, errorBox } from '../ui.js';
import { state, activeBrand, refreshBrands, go, openDemoBrand } from '../app.js';

// Hızlı işlemler asistana hazır bir istek gönderir (marka hafızasıyla çalışır)
const QUICK = [
  { icon: '💡', title: '5 içerik fikri', sub: 'Bu hafta için, karışık kategoriler', prompt: 'Bu hafta paylaşabileceğim 5 içerik fikri üret ve kaydet. Kategorileri karışık olsun.' },
  { icon: '😄', title: 'Eğlenceli fikirler', sub: 'Hedef kitleye göre 3 fikir', prompt: 'Hedef kitlemizin "bu tam ben" diyeceği 3 eğlenceli içerik fikri üret ve kaydet.' },
  { icon: '🗓️', title: 'Haftalık plan', sub: 'Gün gün paylaşım önerisi', prompt: 'Önümüzdeki hafta için gün gün kısa bir paylaşım planı öner. Hangi gün ne tür içerik paylaşmalıyım?' },
  { icon: '🎯', title: 'Marka dili özeti', sub: 'Nasıl konuşmalıyız?', prompt: 'Marka kimliğimize göre içeriklerde nasıl bir dil kullanmalıyım? Yapılacaklar ve kaçınılacaklar listesi ver.' }
];

const CHIPS = [
  'Satış odaklı 3 fikir üret',
  'Yaklaşan özel günler için fikir öner',
  'Son fikirlerden hangisiyle başlamalıyım?'
];

export async function renderHome(view) {
  const brand = activeBrand();
  if (!brand) return renderOnboarding(view);

  view.innerHTML = '<div class="home"><div class="stack"><div class="card skeleton" style="height:180px"></div><div class="card skeleton" style="height:420px"></div></div><div class="stack"><div class="card skeleton" style="height:240px"></div></div></div>';
  const [overview, chat] = await Promise.all([api.overview(brand.id), api.chat(brand.id)]);
  if (activeBrand() !== brand) return; // yüklenirken marka değiştiyse eski çizimi bırak
  const aiReady = state.settings.ai.configured;
  const firstVisit = chat.messages.length === 0;

  view.innerHTML = `
    <div class="home">
      <div class="stack">
        ${brand.isDemo ? demoGuide(brand, aiReady) : ''}
        <section class="card hero">
          <h1>${firstVisit ? 'Merhaba!' : 'Tekrar hoş geldin!'} Bugün <b>${esc(brand.name)}</b> için ne üretelim?</h1>
          <p>${overview.ideaCount ? `Fikir havuzunda ${overview.ideaCount} fikir var${overview.favoriteCount ? `, ${overview.favoriteCount} tanesi favori` : ''}.` : 'Asistana bir istek yaz ya da hızlı işlemlerden biriyle başla.'}</p>
          <div class="quick">
            ${QUICK.map((q, i) => `<button type="button" data-quick="${i}" ${aiReady ? '' : 'disabled'}><span class="q-icon">${q.icon}</span><span class="q-title">${q.title}</span><span class="q-sub">${q.sub}</span></button>`).join('')}
          </div>
        </section>

        <section class="card chat" aria-label="AI asistanı">
          <div class="chat-head">
            <div class="ai-badge">✦</div>
            <div style="flex:1"><h3 style="font-size:15px">AI Asistanı</h3><div class="small muted">${esc(brand.name)} marka hafızasıyla çalışıyor</div></div>
            ${chat.messages.length ? `<button class="btn btn-sm btn-ghost" data-action="new-chat">${icon('refresh')}Yeni sohbet</button>` : ''}
          </div>
          <div class="chat-body" id="chat-body"></div>
          <div class="chat-foot">
            ${aiReady ? '' : `<div class="notice"><div><strong>AI bağlı değil.</strong> Asistanın çalışması için Gemini API anahtarını ekle. Anahtar yalnızca bu bilgisayardaki sunucuda saklanır.</div><a class="btn btn-sm" href="#/ayarlar">Ayarlara git</a></div>`}
            <div class="chips">${CHIPS.map(c => `<button type="button" class="chip" data-chip="${esc(c)}" ${aiReady ? '' : 'disabled'}>${esc(c)}</button>`).join('')}</div>
            <form class="composer" id="composer">
              <textarea class="textarea" id="chat-input" rows="1" placeholder="${aiReady ? 'Örn: Bu marka için haftaya 5 fikir üret' : 'Önce AI bağlantısını kur'}" ${aiReady ? '' : 'disabled'} maxlength="4000"></textarea>
              <button class="btn btn-primary" type="submit" ${aiReady ? '' : 'disabled'} aria-label="Gönder">${icon('send')}</button>
            </form>
          </div>
        </section>
      </div>

      <div class="stack">
        ${identityCard(brand, overview)}
        <section class="card">
          <div class="card-head"><h3>Son fikirler</h3><span class="small muted">${overview.ideaCount} fikir</span></div>
          <div id="idea-list">${ideaList(overview.recentIdeas)}</div>
        </section>
        <section class="card activity">
          <div class="card-head"><h3>Son çalışmalar</h3></div>
          ${overview.activity.length
            ? `<ul>${overview.activity.map(a => `<li><span class="a-dot"></span><div>${esc(a.summary)}<div class="muted small">${timeAgo(a.createdAt)}</div></div></li>`).join('')}</ul>`
            : '<p class="muted small">Henüz bir çalışma yok.</p>'}
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
    ['1', 'Marka kimliğini incele', 'Hedef kitle, iletişim dili, karakter: asistan her yanıtta bunları kullanır.', `<a class="btn btn-sm" href="#/marka/${id}/profil">Profili aç</a>`],
    ['2', 'Renk ve fontlara bak', 'Canlı önizlemede bir rengi değiştir, post nasıl değişiyor gör.', `<a class="btn btn-sm" href="#/marka/${id}/gorsel">Görsel kimlik</a>`],
    ['3', 'Logo ve maskot pozları', '"Çekirdek" maskotunun pozları ve logo varlık kütüphanesinde.', `<a class="btn btn-sm" href="#/marka/${id}/varliklar">Kütüphane</a>`],
    ['4', 'Asistandan fikir iste', aiReady ? 'Dene\'ye bas: hazır bir istek gönderilir, fikirler bu markanın diliyle üretilip kaydedilir.' : 'Önce Ayarlar\'dan Gemini anahtarını ekle, sonra asistana yaz.',
      aiReady ? '<button class="btn btn-sm btn-primary" data-demo-try>Dene</button>' : '<a class="btn btn-sm" href="#/ayarlar">Ayarlar</a>'],
    ['5', 'Kendi markanı oluştur', 'Aynı adımları kendi markan için yap. Örnek markayı istediğin zaman silebilirsin.', '<a class="btn btn-sm" href="#/marka/yeni">Yeni marka</a>']
  ];
  return `
    <section class="card demo-guide">
      <div class="card-head"><h3>🧭 Örnek marka: nasıl kullanılır?</h3><span class="pill">Örnek</span></div>
      <p class="small muted" style="margin-bottom:12px">${esc(brand.name)} kurgusal bir kafe. Bütün bilgileri hazır doldurulmuş; uygulamanın parçalarının nasıl birlikte çalıştığını görmek için adımları sırayla dene.</p>
      <ol class="steps">${steps.map(([n, t, d, action]) => `<li><span class="step-n">${n}</span><div><div class="step-t">${t}</div><div class="small muted">${d}</div></div>${action}</li>`).join('')}</ol>
    </section>`;
}

function identityCard(brand, overview) {
  const c = overview.completeness;
  const colors = [brand.colors.primary, ...brand.colors.secondary].filter(Boolean);
  return `
    <section class="card">
      <div class="row" style="flex-wrap:nowrap">
        ${brandAvatar(brand, overview.logoUrl, 'avatar-lg')}
        <div style="min-width:0">
          <h3 style="font-size:16px">${esc(brand.name)}</h3>
          <div class="small muted">${esc(brand.slogan || brand.sector || 'Sektör ve slogan eklenmedi')}</div>
        </div>
      </div>
      ${colors.length ? `<div class="swatches" style="margin-top:14px">${colors.map(col => `<span class="swatch" style="background:${esc(col)}" title="${esc(col)}"></span>`).join('')}</div>` : ''}
      <div style="margin-top:14px">
        <div class="row" style="justify-content:space-between"><span class="small" style="font-weight:700">Dijital kimlik</span><span class="small muted">%${c.percent}</span></div>
        <div class="progress" style="margin-top:6px"><span style="width:${c.percent}%"></span></div>
        ${c.missing.length ? `<p class="small muted" style="margin-top:8px">Eksik: ${esc(c.missing.slice(0, 4).join(', '))}${c.missing.length > 4 ? '…' : ''}</p>` : '<p class="small" style="margin-top:8px;color:var(--teal);font-weight:700">Kimlik tamam ✓</p>'}
      </div>
      <a class="btn btn-sm" style="margin-top:12px;width:100%" href="#/marka/${esc(brand.id)}">${c.missing.length ? 'Kimliği tamamla' : 'Kimliği düzenle'}</a>
    </section>`;
}

function ideaList(ideas) {
  if (!ideas.length) return '<div class="empty small"><div class="em-icon">💡</div><h4>Henüz fikir yok</h4><p>Asistandan fikir iste; ürettikleri buraya kaydedilir.</p></div>';
  return `<div class="idea-list">${ideas.map(i => `
    <div class="idea">
      <button class="star ${i.favorite ? 'on' : ''}" data-fav="${esc(i.id)}" aria-label="${i.favorite ? 'Favoriden çıkar' : 'Favorilere ekle'}" aria-pressed="${i.favorite}">★</button>
      <div><div class="i-title">${esc(i.title)}</div>${i.description ? `<div class="i-desc">${esc(i.description)}</div>` : ''}<span class="tag" style="margin-top:6px">${esc(i.categoryLabel)}</span></div>
    </div>`).join('')}</div>`;
}

function messageHtml(m) {
  const actions = (m.actions || []).filter(a => a.type === 'save_ideas' && a.ideas && a.ideas.length).map(a => `
    <div class="msg-actions"><div class="act-title">✓ ${a.ideas.length} fikir fikir havuzuna kaydedildi</div>
      <ul>${a.ideas.map(i => `<li>${esc(i.title)} <span class="muted small">· ${esc(i.categoryLabel)}</span></li>`).join('')}</ul></div>`).join('');
  return `<div class="msg msg-${m.role}">${esc(m.content)}${actions}</div>`;
}

function renderMessages(body, messages, brand) {
  body.innerHTML = messages.length
    ? messages.map(messageHtml).join('')
    : `<div class="msg msg-assistant">Merhaba! Ben ${esc(brand.name)} için çalışan içerik asistanınım. Marka kimliğini bilerek içerik fikirleri üretebilir, ürettiklerimi fikir havuzuna kaydedebilir ve içerik planı önerebilirim. Nereden başlayalım?</div>`;
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
    body.insertAdjacentHTML('beforeend', messageHtml({ role: 'user', content: message }));
    body.insertAdjacentHTML('beforeend', '<div class="msg msg-assistant msg-typing" id="typing">Düşünüyorum…</div>');
    body.scrollTop = body.scrollHeight;
    try {
      const res = await api.sendChat(brand.id, message);
      const savedIdeas = (res.assistantMessage.actions || []).some(a => a.type === 'save_ideas');
      if (savedIdeas) {
        // Fikir kaydedildiyse sağ paneller ve marka özeti de güncellensin
        await refreshBrands();
        return renderHome(view);
      }
      body.querySelector('#typing').remove();
      body.insertAdjacentHTML('beforeend', messageHtml(res.assistantMessage));
      body.scrollTop = body.scrollHeight;
    } catch (err) {
      body.querySelector('#typing').remove();
      body.lastElementChild.remove(); // gönderilemeyen mesaj geri alınır, metin kutuya döner
      input.value = message;
      body.insertAdjacentHTML('beforeend', `<div class="msg msg-assistant">${errorBox(err)}</div>`);
      if (err.code === 'AI_NOT_CONFIGURED') toast("AI bağlı değil: Ayarlar'dan anahtar ekle.", 'error');
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
    if (e.target.closest('[data-action="new-chat"]')) {
      if (!confirm('Bu markanın sohbet geçmişi silinsin mi? Kaydedilen fikirler silinmez.')) return;
      try { await api.clearChat(brand.id); renderHome(view); } catch (err) { toast(err.message, 'error'); }
    }
  };
}

function renderOnboarding(view) {
  view.onclick = null;
  view.innerHTML = `
    <section class="card onboard">
      <div class="logo-mark" style="width:52px;height:52px;margin:0 auto 14px;font-size:22px;border-radius:16px">✦</div>
      <h1>İlk markanı oluştur</h1>
      <p>Markanın dijital kimliğini bir kez tanımla; asistan bundan sonra her içeriği bu kimliğe göre üretsin.</p>
      <form id="onboard-form">
        <input class="input" name="name" placeholder="Marka adı" required maxlength="80" aria-label="Marka adı">
        <input class="input" name="sector" placeholder="Sektör (ör. kafe, yazılım)" maxlength="120" aria-label="Sektör">
        <button class="btn btn-primary" type="submit">Oluştur</button>
      </form>
      <div class="demo-cta">
        <span class="muted small">Önce nasıl çalıştığını görmek mi istersin?</span>
        <button class="btn" type="button" id="demo-btn">☕ Örnek markayla keşfet</button>
      </div>
    </section>`;
  view.querySelector('#demo-btn').addEventListener('click', async e => {
    e.target.disabled = true;
    try { await openDemoBrand(); } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
  });
  view.querySelector('#onboard-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      const { brand } = await api.createBrand({ name: form.get('name'), sector: form.get('sector') });
      await refreshBrands();
      toast('Marka oluşturuldu. Şimdi kimliğini tamamlayalım.', 'success');
      go('#/marka/' + brand.id);
    } catch (err) { toast(err.message, 'error'); }
  });
}
