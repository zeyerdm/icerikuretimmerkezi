// Ayarlar: AI bağlantısı. Anahtar sunucuya yazılır ve bir daha tarayıcıya gönderilmez.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { state, renderChrome } from '../app.js';

export async function renderSettings(view) {
  const [{ ai }, system] = await Promise.all([api.settings(), api.system()]);
  state.settings.ai = ai;
  renderChrome();
  const shortSha = system.sha ? system.sha.slice(0, 7) : 'bilinmiyor';

  view.innerHTML = `
    <div class="page-head"><div><h1>Ayarlar</h1><p class="muted">AI bağlantısı ve çalışma ortamı.</p></div></div>
    <div class="settings">
      <section class="card">
        <div class="card-head"><h3>AI bağlantısı</h3>${ai.configured ? '<span class="pill pill-ok"><span class="dot"></span>Bağlı</span>' : '<span class="pill pill-warn"><span class="dot"></span>Bağlı değil</span>'}</div>
        <dl class="kv">
          <dt>Sağlayıcı</dt><dd>${esc(ai.providerLabel)}</dd>
          <dt>Anahtar</dt><dd>${ai.configured ? esc(ai.keyHint) + (ai.source === 'env' ? ' <span class="muted small">(GEMINI_API_KEY ortam değişkeninden)</span>' : '') : '<span class="muted">Eklenmedi</span>'}</dd>
        </dl>
        <form id="key-form" class="stack" style="margin-top:16px">
          <div class="field">
            <label for="api-key">${ai.configured ? 'Anahtarı değiştir' : 'Gemini API anahtarı'}</label>
            <input class="input" id="api-key" type="password" autocomplete="off" placeholder="Google AI Studio'dan aldığın anahtar" maxlength="300">
            <span class="hint">Anahtar yalnızca bu bilgisayardaki sunucunun veritabanında saklanır; tarayıcıya geri gönderilmez ve sayfa kodunda bulunmaz. Anahtarı <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>'dan alabilirsin.</span>
          </div>
          <div class="row">
            <button class="btn btn-primary" type="submit">Kaydet</button>
            <button class="btn" type="button" data-action="test" ${ai.configured ? '' : 'disabled'}>Bağlantıyı test et</button>
            ${ai.configured && ai.source === 'settings' ? '<button class="btn btn-danger" type="button" data-action="remove">Anahtarı kaldır</button>' : ''}
          </div>
        </form>
        <div class="field" style="margin-top:18px">
          <label for="ai-model">Metin modeli</label>
          <select class="select" id="ai-model" style="max-width:320px">${ai.models.map(m => `<option ${m === ai.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
          <span class="hint">Flash hızlıdır; Pro daha özenli yazar ama yavaştır ve kotayı daha çok kullanır.</span>
        </div>
        <div id="test-result" style="margin-top:12px"></div>
      </section>
      <section class="card" id="update-card">
        <div class="card-head"><h3>Güncelleme</h3>${system.supervised ? '<span class="pill pill-ok"><span class="dot"></span>Otomatik güncelleme açık</span>' : '<span class="pill pill-warn"><span class="dot"></span>Baslat dosyasıyla açılmadı</span>'}</div>
        <dl class="kv">
          <dt>Sürüm</dt><dd>${esc(system.version)} · <code>${esc(shortSha)}</code></dd>
          <dt>Son güncelleme</dt><dd>${system.updatedAt ? esc(new Date(system.updatedAt).toLocaleString('tr-TR')) : '<span class="muted">Kayıt yok</span>'}</dd>
        </dl>
        <p class="small muted" style="margin-top:12px">Uygulama her açıldığında GitHub'daki son sürümü kontrol edip kendini günceller. Verilerin (markalar, dosyalar, fikirler) güncellemede korunur.</p>
        <div class="row" style="margin-top:14px">
          <button class="btn" data-action="check-update">Güncellemeleri kontrol et</button>
          <button class="btn btn-primary" data-action="apply-update" hidden>Güncelle ve yeniden başlat</button>
        </div>
        <div id="update-result" style="margin-top:12px"></div>
        <details style="margin-top:14px" ${system.tokenConfigured ? 'open' : ''}>
          <summary class="small" style="cursor:pointer;font-weight:700">GitHub erişim anahtarı (yalnızca depo özelse gerekir)</summary>
          <form id="token-form" class="stack" style="margin-top:12px">
            <div class="field">
              <label for="gh-token">${system.tokenConfigured ? 'Anahtarı değiştir' : 'Erişim anahtarı'}</label>
              <input class="input" id="gh-token" type="password" autocomplete="off" maxlength="300" placeholder="github_pat_...">
              <span class="hint">GitHub → Settings → Developer settings → Fine-grained tokens: yalnızca bu depo, "Contents: Read-only" izni. Anahtar bu bilgisayarda saklanır.</span>
            </div>
            <div class="row"><button class="btn btn-sm" type="submit">Kaydet</button>${system.tokenConfigured ? '<button class="btn btn-sm btn-danger" type="button" data-action="remove-token">Kaldır</button>' : ''}</div>
          </form>
        </details>
      </section>
      <section class="card">
        <div class="card-head"><h3>Veriler</h3></div>
        <p class="small muted">Markalar, yüklenen dosyalar, fikirler ve sohbetler bu bilgisayarda, proje klasöründeki <code>data/</code> klasöründe tutulur. Yedek almak için bu klasörü kopyalaman yeterli.</p>
      </section>
    </div>`;

  view.querySelector('#key-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = view.querySelector('#api-key');
    if (!input.value.trim()) return toast('Önce anahtarı yapıştır.', 'error');
    try {
      await api.saveAi({ apiKey: input.value });
      input.value = '';
      toast('Anahtar kaydedildi. Bağlantı test ediliyor…', 'success');
      await renderSettings(view);
      view.querySelector('[data-action="test"]').click();
    } catch (err) { toast(err.message, 'error'); }
  });

  view.querySelector('#ai-model').addEventListener('change', async e => {
    try { await api.saveAi({ model: e.target.value }); toast('Model kaydedildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
  });

  view.querySelector('#token-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = view.querySelector('#gh-token');
    if (!input.value.trim()) return toast('Önce anahtarı yapıştır.', 'error');
    try { await api.saveUpdateToken(input.value); toast('Erişim anahtarı kaydedildi.', 'success'); renderSettings(view); } catch (err) { toast(err.message, 'error'); }
  });

  view.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const out = view.querySelector('#test-result');
    const upd = view.querySelector('#update-result');
    if (btn.dataset.action === 'check-update') {
      btn.disabled = true;
      upd.innerHTML = '<p class="small muted">GitHub kontrol ediliyor…</p>';
      try {
        const r = await api.checkUpdate();
        const apply = view.querySelector('[data-action="apply-update"]');
        apply.hidden = !r.available;
        upd.innerHTML = r.available
          ? `<div class="notice" style="background:var(--brand-soft);color:var(--brand-ink)"><div><strong>Yeni sürüm var</strong> (${esc(r.latest.slice(0, 7))}). ${system.supervised ? 'Güncelleyince uygulama birkaç saniye içinde kendini yeniden başlatır.' : 'Güncellemek için pencereyi kapatıp Baslat dosyasına çift tıkla.'}</div></div>`
          : '<div class="notice" style="background:var(--teal-soft);color:#0b6b5d"><div><strong>Uygulama güncel.</strong> En son sürümü kullanıyorsun.</div></div>';
        if (r.available && !system.supervised) apply.hidden = true;
      } catch (err) {
        upd.innerHTML = `<div class="notice notice-error"><div><strong>Kontrol edilemedi.</strong> ${esc(err.message)}</div></div>`;
      } finally { btn.disabled = false; }
      return;
    }
    if (btn.dataset.action === 'apply-update') {
      btn.disabled = true;
      upd.innerHTML = '<p class="small muted">Uygulama yeniden başlatılıyor ve güncelleniyor… (yarım dakika sürebilir)</p>';
      try {
        await api.restart();
        // Sunucu kapanıp yeniden açılana kadar bekle, sonra sayfayı yenile
        await new Promise(r => setTimeout(r, 1500));
        for (let i = 0; i < 90; i++) {
          try { await api.health(); location.reload(); return; } catch { await new Promise(r => setTimeout(r, 1000)); }
        }
        upd.innerHTML = '<div class="notice notice-error"><div>Uygulama geri gelmedi. Siyah pencereye bak; kapandıysa Baslat dosyasına tekrar çift tıkla.</div></div>';
      } catch (err) {
        upd.innerHTML = `<div class="notice notice-error"><div>${esc(err.message)}</div></div>`;
        btn.disabled = false;
      }
      return;
    }
    if (btn.dataset.action === 'remove-token') {
      try { await api.removeUpdateToken(); toast('Erişim anahtarı kaldırıldı.', 'success'); renderSettings(view); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (btn.dataset.action === 'test') {
      btn.disabled = true;
      out.innerHTML = '<p class="small muted">Gemini\'ye bağlanılıyor…</p>';
      try {
        const { result } = await api.testAi();
        out.innerHTML = `<div class="notice" style="background:var(--teal-soft);color:#0b6b5d"><div><strong>Bağlantı çalışıyor.</strong> ${result.modelAvailable ? 'Seçili model kullanılabilir.' : 'Uyarı: seçili model bu anahtarla listelenmiyor; başka bir model seç.'}</div></div>`;
      } catch (err) {
        out.innerHTML = `<div class="notice notice-error"><div><strong>Bağlantı başarısız.</strong> ${esc(err.message)}</div></div>`;
      } finally { btn.disabled = false; }
    }
    if (btn.dataset.action === 'remove') {
      if (!confirm('API anahtarı kaldırılsın mı? Asistan çalışmayı durdurur.')) return;
      try { await api.removeAiKey(); toast('Anahtar kaldırıldı.', 'success'); renderSettings(view); } catch (err) { toast(err.message, 'error'); }
    }
  };
}
