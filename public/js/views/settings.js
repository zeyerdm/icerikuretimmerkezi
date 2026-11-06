// Ayarlar: AI bağlantısı. Anahtar sunucuya yazılır ve bir daha tarayıcıya gönderilmez.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { state, renderChrome } from '../app.js';

export async function renderSettings(view) {
  const { ai } = await api.settings();
  state.settings.ai = ai;
  renderChrome();

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

  view.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const out = view.querySelector('#test-result');
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
