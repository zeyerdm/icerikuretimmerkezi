// Ayarlar: AI bağlantısı, güncelleme (ve önceki sürüme dönüş), yedekler.
// AI anahtarı sunucuya yazılır ve bir daha tarayıcıya gönderilmez.
import { api } from '../api.js';
import { esc, toast, openModal } from '../ui.js';
import { state, renderChrome, refreshBrands } from '../app.js';

const fmtSize = n => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const fmtShort = iso => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtWhen = iso => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function backupRows(list) {
  if (!list.length) return '<p class="small muted">Henüz yedek yok. İlk otomatik yedek, kaydedilecek veri olduğunda alınır; istersen şimdi elle alabilirsin.</p>';
  return `<div class="table-wrap"><table class="table" id="backup-table">
    <thead><tr><th>Tarih</th><th>Tür</th><th>Boyut</th><th></th></tr></thead>
    <tbody>${list.map(b => `<tr data-name="${esc(b.name)}">
      <td class="nowrap">${esc(fmtShort(b.createdAt))}</td><td>${esc(b.kindLabel)}</td><td>${esc(fmtSize(b.size))}</td>
      <td class="row-actions">
        <a class="btn btn-sm" href="/api/backups/${encodeURIComponent(b.name)}" download>İndir</a>
        <button class="btn btn-sm" type="button" data-action="restore-backup">Geri yükle</button>
        <button class="btn btn-sm btn-ghost" type="button" data-action="delete-backup" aria-label="Yedeği sil">Sil</button>
      </td></tr>`).join('')}</tbody></table></div>`;
}

// Sunucu yeniden başlarken bekler, gelince sayfayı yeniler
async function waitForRestart(out) {
  await new Promise(r => setTimeout(r, 1500));
  for (let i = 0; i < 120; i++) {
    try { await api.health(); location.reload(); return; } catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  out.innerHTML = '<div class="notice notice-error"><div>Uygulama geri gelmedi. Siyah pencereye bak; kapandıysa Baslat dosyasına tekrar çift tıkla.</div></div>';
}

export async function renderSettings(view) {
  const [{ ai }, system, backupData] = await Promise.all([api.settings(), api.system(), api.backups()]);
  state.settings.ai = ai;
  renderChrome();
  const shortSha = system.sha ? system.sha.slice(0, 7) : 'bilinmiyor';

  view.innerHTML = `
    <div class="page-head"><div><h1>Ayarlar</h1><p class="muted">AI bağlantısı, güncelleme ve yedekler.</p></div></div>
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
          <dt>Önceki sürüm</dt><dd>${system.previous ? `<code>${esc((system.previous.sha || 'bilinmiyor').slice(0, 7))}</code> <span class="muted small">(dönülebilir)</span>` : '<span class="muted">Yok</span>'}</dd>
        </dl>
        ${system.skippedSha ? `<div class="notice" style="margin-top:12px"><div><strong>Bir sürüm geri alındı.</strong> <code>${esc(system.skippedSha.slice(0, 7))}</code> sürümü ${system.rolledBackAt ? esc(fmtWhen(system.rolledBackAt)) + ' tarihinde ' : ''}geri alındı; GitHub'da daha yeni bir sürüm çıkana kadar kendiliğinden kurulmaz.</div></div>` : ''}
        <p class="small muted" style="margin-top:12px">Uygulama her açıldığında GitHub'daki son sürümü kontrol edip kendini günceller; güncellemeden önce verilerin yedeğini alır. Yeni sürüm açılamazsa kendiliğinden önceki sürüme döner.</p>
        <div class="row" style="margin-top:14px">
          <button class="btn" data-action="check-update">Güncellemeleri kontrol et</button>
          <button class="btn btn-primary" data-action="apply-update" hidden>Güncelle ve yeniden başlat</button>
          ${system.previous && system.supervised ? '<button class="btn btn-ghost" data-action="rollback">Önceki sürüme dön</button>' : ''}
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
      <section class="card" id="backup-card">
        <div class="card-head"><h3>Yedekler</h3><span class="pill pill-ok"><span class="dot"></span>Her gün otomatik</span></div>
        <p class="small muted">Markalar, dosyalar, fikirler, takvim, görevler ve notlar her gün kendiliğinden yedeklenir (son ${backupData.keep} gün saklanır). Yedekler bu bilgisayarda <code>data/backups</code> klasöründedir; API anahtarların yedeğe girmez.</p>
        <div class="row" style="margin-top:14px">
          <button class="btn btn-primary" type="button" data-action="create-backup">Şimdi yedek al</button>
          <label class="btn" for="backup-file">Yedek dosyasından geri yükle</label>
          <input type="file" id="backup-file" accept=".zip,application/zip" hidden>
        </div>
        <div id="backup-result" style="margin-top:12px"></div>
        <div id="backup-list" style="margin-top:6px">${backupRows(backupData.backups)}</div>
        <details style="margin-top:16px" ${backupData.copyDir ? 'open' : ''}>
          <summary class="small" style="cursor:pointer;font-weight:700">Yedeklerin bir kopyası başka bir klasöre de gitsin (ör. Google Drive)</summary>
          <form id="copy-form" class="stack" style="margin-top:12px">
            <div class="field">
              <label for="copy-dir">Klasör yolu</label>
              <input class="input" id="copy-dir" value="${esc(backupData.copyDir)}" placeholder="Örn. G:\Drive'ım\İçerik Üretim Yedekleri">
              <span class="hint">Bilgisayarında Google Drive masaüstü uygulaması kuruluysa Drive klasöründe bir klasör aç ve yolunu buraya yapıştır (Dosya Gezgini'nde klasöre sağ tık → "Yol olarak kopyala"). Her yeni yedek oraya da kopyalanır, Drive da buluta taşır. Boş bırakıp kaydedersen kapanır.</span>
            </div>
            ${backupData.copyError ? `<div class="notice notice-error"><div>${esc(backupData.copyError)}</div></div>` : ''}
            <div class="row"><button class="btn btn-sm" type="submit">Kaydet</button></div>
          </form>
        </details>
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

  view.querySelector('#copy-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api.saveBackupSettings({ copyDir: view.querySelector('#copy-dir').value });
      toast(r.copyDir ? (r.copyError ? r.copyError : 'Klasör kaydedildi; son yedek oraya kopyalandı.') : 'Ek kopya kapatıldı.', r.copyError ? 'error' : 'success');
      renderSettings(view);
    } catch (err) { toast(err.message, 'error'); }
  });

  const backupOut = view.querySelector('#backup-result');
  const afterRestore = async r => {
    await refreshBrands();
    await renderSettings(view);
    const c = r.result.counts;
    view.querySelector('#backup-result').innerHTML = `<div class="notice notice-ok"><div><strong>Geri yükleme tamamlandı.</strong> ${c.brands} marka, ${c.contents} içerik, ${c.ideas} fikir, ${c.tasks} görev, ${c.notes} not geri geldi. Önceki hâlin de "Geri yükleme öncesi" yedeği olarak saklandı; istersen ona dönebilirsin.</div></div>`;
  };
  const confirmRestore = (what, run) => openModal({
    title: 'Yedekten geri yükle',
    body: `<p>${what}</p><p class="small muted" style="margin-top:8px">Şu anki markalar, içerikler, görevler, notlar ve dosyalar yedekteki hâliyle <strong>değiştirilir</strong>. Güvenlik için önce şu anki hâlin yedeği alınır. API anahtarların değişmez.</p>`,
    submitLabel: 'Geri yükle',
    onSubmit: async () => {
      backupOut.innerHTML = '<p class="small muted">Geri yükleniyor…</p>';
      try { await afterRestore(await run()); } catch (err) { backupOut.innerHTML = ''; throw err; }
    }
  });

  view.querySelector('#backup-file').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    confirmRestore(`<strong>${esc(file.name)}</strong> dosyasındaki yedek geri yüklensin mi?`, () => api.restoreBackupFile(file));
  });

  view.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const backupName = btn.closest('[data-name]') ? btn.closest('[data-name]').dataset.name : null;
    if (btn.dataset.action === 'create-backup') {
      btn.disabled = true;
      try {
        const r = await api.createBackup();
        view.querySelector('#backup-list').innerHTML = backupRows(r.backups);
        toast('Yedek alındı.', 'success');
        if (r.copyError) toast(r.copyError, 'error');
      } catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; }
      return;
    }
    if (btn.dataset.action === 'restore-backup') {
      confirmRestore(`<strong>${esc(btn.closest('tr').cells[0].textContent)}</strong> tarihli yedek geri yüklensin mi?`, () => api.restoreBackup(backupName));
      return;
    }
    if (btn.dataset.action === 'delete-backup') {
      if (!confirm('Bu yedek silinsin mi? Bu işlem geri alınamaz.')) return;
      try { const r = await api.deleteBackup(backupName); view.querySelector('#backup-list').innerHTML = backupRows(r.backups); toast('Yedek silindi.', 'success'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (btn.dataset.action === 'rollback') {
      if (!confirm('Önceki sürüme dönülsün mü? Uygulama birkaç saniye içinde yeniden başlar. Verilerin etkilenmez.')) return;
      btn.disabled = true;
      const upd = view.querySelector('#update-result');
      upd.innerHTML = '<p class="small muted">Önceki sürüme dönülüyor ve uygulama yeniden başlatılıyor…</p>';
      try { await api.rollback(); await waitForRestart(upd); } catch (err) { upd.innerHTML = `<div class="notice notice-error"><div>${esc(err.message)}</div></div>`; btn.disabled = false; }
      return;
    }
    const out = view.querySelector('#test-result');
    const upd = view.querySelector('#update-result');
    if (btn.dataset.action === 'check-update') {
      btn.disabled = true;
      upd.innerHTML = '<p class="small muted">GitHub kontrol ediliyor…</p>';
      try {
        const r = await api.checkUpdate();
        const apply = view.querySelector('[data-action="apply-update"]');
        apply.hidden = !(r.available || r.skipped) || !system.supervised;
        apply.dataset.force = r.skipped ? '1' : '';
        apply.textContent = r.skipped ? 'Yine de güncelle' : 'Güncelle ve yeniden başlat';
        upd.innerHTML = r.available
          ? `<div class="notice" style="background:var(--brand-soft);color:var(--brand-ink)"><div><strong>Yeni sürüm var</strong> (${esc(r.latest.slice(0, 7))}). ${system.supervised ? 'Güncelleyince uygulama birkaç saniye içinde kendini yeniden başlatır.' : 'Güncellemek için pencereyi kapatıp Baslat dosyasına çift tıkla.'}</div></div>`
          : r.skipped
            ? `<div class="notice"><div><strong>GitHub'daki son sürüm (${esc(r.latest.slice(0, 7))}) daha önce geri alınmıştı.</strong> Daha yeni bir sürüm çıkınca kendiliğinden güncellenir. Sorunun düzeldiğini biliyorsan yine de kurabilirsin.</div></div>`
            : '<div class="notice notice-ok"><div><strong>Uygulama güncel.</strong> En son sürümü kullanıyorsun.</div></div>';
      } catch (err) {
        upd.innerHTML = `<div class="notice notice-error"><div><strong>Kontrol edilemedi.</strong> ${esc(err.message)}</div></div>`;
      } finally { btn.disabled = false; }
      return;
    }
    if (btn.dataset.action === 'apply-update') {
      btn.disabled = true;
      upd.innerHTML = '<p class="small muted">Uygulama yeniden başlatılıyor ve güncelleniyor… (yarım dakika sürebilir)</p>';
      try {
        await api.restart(btn.dataset.force === '1');
        await waitForRestart(upd);
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
        out.innerHTML = `<div class="notice notice-ok"><div><strong>Bağlantı çalışıyor.</strong> ${result.modelAvailable ? 'Seçili model kullanılabilir.' : 'Uyarı: seçili model bu anahtarla listelenmiyor; başka bir model seç.'}</div></div>`;
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
