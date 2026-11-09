// Ana ekran: AI asistanı merkezde; yanında marka kimliği, son fikirler ve son çalışmalar
import { api } from '../api.js';
import { esc, icon, toast, timeAgo, errorNotice, ring, bucketByDay, emptyState, busy } from '../ui.js';
import { state } from '../app.js';
import { askAssistant, openAssistant, dockAssistant } from '../assistantWidget.js';

// Hızlı işlemler asistana hazır bir istek gönderir (marka hafızasıyla çalışır)
const QUICK = [
  { icon: '💡', title: '5 içerik fikri', sub: 'Bu hafta için, karışık kategoriler', prompt: 'Bu hafta paylaşabileceğim 5 içerik fikri üret ve kaydet. Kategorileri karışık olsun.' },
  { icon: '😄', title: 'Eğlenceli fikirler', sub: 'Hedef kitleye göre 3 fikir', prompt: 'Hedef kitlemizin "bu tam ben" diyeceği 3 eğlenceli içerik fikri üret ve kaydet.' },
  { icon: '🗓️', title: 'Haftalık plan', sub: 'Gün gün paylaşım önerisi', prompt: 'Önümüzdeki hafta için gün gün kısa bir paylaşım planı öner. Hangi gün ne tür içerik paylaşmalıyım?' },
  { icon: '🎯', title: 'Marka dili özeti', sub: 'Nasıl konuşmalıyız?', prompt: 'Marka kimliğimize göre içeriklerde nasıl bir dil kullanmalıyım? Yapılacaklar ve kaçınılacaklar listesi ver.' }
];


// Marka çalışma alanının ana sayfası: AI asistanı merkezde; yanında marka kimliği, fikir grafiği, son fikirler
export async function renderHome(view, brand) {
  view.innerHTML = '<div class="bhome" aria-busy="true"><div class="stack"><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:300px"></div></div><div class="stack"><div class="skeleton" style="height:200px"></div><div class="skeleton" style="height:200px"></div></div></div>';
  const [overview, { contents }] = await Promise.all([api.overview(brand.id), api.contents({ brandId: brand.id }).catch(() => ({ contents: [] }))]);
  if (state.workspaceBrandId !== brand.id) return; // yüklenirken başka sayfaya geçildiyse eski çizimi bırak
  const aiReady = state.settings.ai.configured;
  let guideHidden = false;
  try { guideHidden = localStorage.getItem('ium.guide.hidden.' + brand.id) === '1'; } catch { /* yok */ }
  const id = esc(brand.id);
  const now = new Date();
  const upcoming = contents.filter(c => !c.done && c.scheduledAt && new Date(c.scheduledAt) >= new Date(now.getTime() - 864e5)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).slice(0, 5);
  const working = contents.filter(c => !c.done && !c.scheduledAt).slice(0, 3);
  const planned = contents.filter(c => !c.done && c.scheduledAt && new Date(c.scheduledAt) >= now).length;

  view.innerHTML = `
    <div class="bhome bgrid">
      ${brand.isDemo && !guideHidden ? `<div class="bg-guide">${demoGuide(brand, aiReady)}</div>` : ''}
      <section class="card hero bg-hero">
        <div class="hero-text">
          <h1>Bugün <b>${esc(brand.name)}</b> için ne üretelim?</h1>
          <p>${overview.ideaCount ? `Fikir havuzunda ${overview.ideaCount} fikir var${overview.favoriteCount ? `, ${overview.favoriteCount} tanesi favori` : ''}.` : 'Asistana bir istek yaz ya da aşağıdaki hızlı işlemlerden biriyle başla.'}</p>
          ${aiReady ? `<div class="quick-row2">${QUICK.map((q, i) => `<button type="button" class="btn btn-sm" data-quick="${i}" title="${esc(q.sub)}">${q.icon} ${q.title}</button>`).join('')}</div>`
            : `<div class="notice mt-3"><div><strong>AI bağlı değil.</strong> Asistanın ve hızlı işlemlerin çalışması için bir yapay zekâ sağlayıcısı bağla (Claude, OpenAI, OpenRouter ya da Gemini). Anahtar yalnızca bu bilgisayardaki sunucuda saklanır.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>`}
        </div>
        ${overview.mascotUrl ? `<img class="hero-mascot" src="${esc(overview.mascotUrl)}" alt="">` : ''}
      </section>
      <div class="bg-id">${identityCard(brand, overview)}</div>

      <div class="bg-main">
        <div class="kpis stat-bar bstats">
          <a class="kpi k1" href="#/m/${id}/fikirler"><span class="kpi-icon">${icon('idea')}</span><span class="kpi-num">${overview.ideaCount}</span><span class="kpi-label">Fikir · ${overview.favoriteCount} favori</span></a>
          <a class="kpi k5 st-plan" href="#/m/${id}/takvim"><span class="kpi-icon">${icon('calendar')}</span><span class="kpi-num">${planned}</span><span class="kpi-label">Planlanan içerik</span></a>
          <a class="kpi k4" href="#/m/${id}/kutuphane"><span class="kpi-icon">${icon('image')}</span><span class="kpi-num">${overview.assetTotal}</span><span class="kpi-label">Varlık</span></a>
          <a class="kpi k3 st-pub" href="#/m/${id}/kimlik"><span class="kpi-icon">${icon('identity')}</span><span class="kpi-num">%${overview.completeness.percent}</span><span class="kpi-label">Kimlik</span></a>
        </div>

        <section class="card">
          <div class="card-head"><h3>Yaklaşan ve üzerinde çalışılan <span class="count">${upcoming.length + working.length}</span></h3><a class="small link" href="#/m/${id}/takvim">Tümü ›</a></div>
          ${upcoming.length || working.length ? `<div class="agenda">${[...upcoming.map(c => ({ c, when: new Date(c.scheduledAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) })), ...working.map(c => ({ c, when: 'Tarihsiz' }))].slice(0, 1).map(({ c, when }) => `<a class="ag-item status-${esc(c.status)}" href="#/m/${id}/takvim" style="--item-color:${esc(brand.colors.primary || '#7d6bf0')}">
              <span class="ag-time">${esc(when)}</span><span class="ag-title">${esc(c.title)}</span>
              <span class="ag-meta"><span class="tag">${esc(c.typeLabel)}</span><span class="status-badge status-${esc(c.status)}">${esc(c.statusLabel)}</span></span></a>`).join('')}</div>`
            : `<div class="empty-cta"><span class="ec-icon">${icon('calendar')}</span><div><b>Planlanan içerik yok</b><p>Bir fikri takvime ekle ya da Reels / post üret.</p></div><a class="btn btn-sm btn-primary" href="#/m/${id}/fikirler">${icon('plus')}Fikirlerden planla</a></div>`}
        </section>

        <div class="bg-trio">
          ${ideaChart(overview.ideaTimes)}
          <section class="card">
            <div class="card-head"><h3>Son fikirler</h3><a class="small link" href="#/m/${id}/fikirler">Tümü ›</a></div>
            <div id="idea-list" class="bg-list">${ideaList(overview.recentIdeas.slice(0, 3))}</div>
          </section>
          <section class="card activity">
            <div class="card-head"><h3>Son çalışmalar</h3><a class="small link" href="#/m/${id}/arsiv">Tümü ›</a></div>
            <div class="bg-list">${overview.activity.length
              ? `<ul>${overview.activity.slice(0, 3).map(a => `<li><span class="a-dot"></span><div>${esc(a.summary)}<div class="muted xsmall">${timeAgo(a.createdAt)}</div></div></li>`).join('')}</ul>`
              : emptyState({ icon: 'refresh', title: 'Henüz bir çalışma yok', compact: true })}</div>
          </section>
        </div>
      </div>

      <div class="bg-ai" id="ai-dock"></div>
    </div>`;

  // AI Asistanı ana sayfada sağ kolona yerleşir (Dijital kimliğin altından ana kolonun bittiği yere kadar)
  dockAssistant(view.querySelector('#ai-dock'));
  wire(view, brand);
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
      <div class="card-head"><h3>Örnek marka: nasıl kullanılır?</h3><div class="row"><span class="pill">Örnek</span><button type="button" class="btn btn-sm btn-ghost icon-btn" data-guide-close aria-label="Rehberi kapat" title="Kapat (Örnek markanın rehberi bir daha gösterilmez)">${icon('x')}</button></div></div>
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
        ${ring(c.percent, 64)}
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
  create_post: 'Post tasarımı üretilemedi', create_prompt: 'Prompt üretilemedi', create_image: 'Görsel üretilemedi', plan_content: 'Takvime eklenemedi', add_task: 'Görev eklenemedi', remember: 'Hafızaya kaydedilemedi', forbid_words: 'Yasaklı listeye eklenemedi' };
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
  if (a.type === 'create_image') return box(`✓ Görsel üretildi (${esc(a.modelLabel)}), kütüphaneye kaydedildi`, `<a href="${esc(a.asset.url)}" target="_blank" rel="noopener"><img class="act-img" src="${esc(a.asset.url)}" alt=""></a><a class="small" href="${m}/kutuphane">Kütüphaneyi aç</a>`);
  if (a.type === 'plan_content') return box(`✓ ${a.items.length} içerik takvime eklendi`, li(a.items.map(c => `<li>${esc(c.title)} <span class="muted small">· ${esc(c.typeLabel)}${c.scheduledAt ? ' · ' + esc(new Date(c.scheduledAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</span></li>`)) + `<a class="small" href="${m}/takvim">Takvimi aç</a>`);
  if (a.type === 'remember') return box(`✓ Hafızaya kaydedildi: ${esc(a.fact.title)} <span class="muted small">· ${esc(a.fact.categoryLabel)}</span>`, `<a class="small" href="${m}/hafiza">Hafızayı aç</a>`);
  if (a.type === 'forbid_words') return box(`✓ Yasaklı listeye eklendi: ${esc(a.words.join(', '))}`, `<a class="small" href="${m}/hafiza">Hafızayı aç</a>`);
  if (a.type === 'add_task') return box(`✓ Görev eklendi: ${esc(a.task.title)}${a.task.dueDate ? ` <span class="muted small">· son tarih ${esc(a.task.dueDate)}</span>` : ''}`, '<a class="small" href="#/gorevler">Görevleri aç</a>');
  return '';
}
export function messageHtml(m, brand) {
  const actions = (m.actions || []).map(a => actionHtml(a, brand)).join('');
  return `<div class="msg msg-${m.role}">${esc(m.content)}${actions}</div>`;
}

export function renderMessages(body, messages, brand) {
  body.innerHTML = messages.length
    ? messages.map(x => messageHtml(x, brand)).join('')
    : `<div class="msg msg-assistant">Merhaba! Ben ${esc(brand.name)} için çalışan içerik asistanınım. Marka kimliğini bilerek fikir üretip kaydedebilir, Reels fikir havuzunu doldurabilir, senaryo yazabilir, post tasarlayabilir, prompt hazırlayabilir, takvime içerik ve görev ekleyebilirim. Ör. "Haftaya 5 Reels fikri üret", "Bu senaryoya göre post tasarla". Nereden başlayalım?</div>`;
  body.scrollTop = body.scrollHeight;
}

function wire(view, brand) {
  view.onclick = async e => {
    if (e.target.closest('[data-demo-try]')) return askAssistant('Sınav haftasında öğrencilere yönelik 3 içerik fikri üret ve kaydet: biri eğlenceli, biri eğitici, biri satış odaklı olsun.');
    const quick = e.target.closest('[data-quick]');
    if (quick) return askAssistant(QUICK[Number(quick.dataset.quick)].prompt);
    if (e.target.closest('[data-open-assistant]')) return openAssistant();
    if (e.target.closest('[data-guide-close]')) { try { localStorage.setItem('ium.guide.hidden.' + brand.id, '1'); } catch { /* yok */ } view.querySelector('.demo-guide').remove(); return; }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const on = !fav.classList.contains('on');
      try {
        await api.updateIdea(brand.id, fav.dataset.fav, { favorite: on });
        fav.classList.toggle('on', on);
        fav.setAttribute('aria-pressed', String(on));
      } catch (err) { toast(err.message, 'error'); }
    }
  };
}
