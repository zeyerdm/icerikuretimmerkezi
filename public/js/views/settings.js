// Ayarlar: AI bağlantısı, güncelleme (ve önceki sürüme dönüş), yedekler.
// AI anahtarı sunucuya yazılır ve bir daha tarayıcıya gönderilmez.
import { api } from '../api.js';
import { esc, toast, openModal, pageHead, emptyState, busy } from '../ui.js';
import { reminderPrefs, setReminderPrefs } from '../reminders.js';
import { state, renderChrome, refreshBrands } from '../app.js';

const fmtSize = n => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const fmtShort = iso => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtWhen = iso => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function backupRows(list) {
  if (!list.length) return emptyState({ icon: 'archive', title: 'Henüz yedek yok', text: 'İlk otomatik yedek, kaydedilecek veri olduğunda alınır; istersen şimdi elle alabilirsin.', compact: true });
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

// Ayarlar sekmeleri: Genel ve Yapay zekâ (sağlayıcılar, modeller, karşılaştırma, harcama)
export function settingsTabs(active) {
  return `<div class="tabs" role="tablist" aria-label="Ayarlar bölümleri"><a role="tab" href="#/ayarlar" class="${active === 'genel' ? 'active' : ''}" aria-selected="${active === 'genel'}">Genel</a><a role="tab" href="#/ai/modeller" class="${active === 'ai' ? 'active' : ''}" aria-selected="${active === 'ai'}">Yapay zekâ</a></div>`;
}

export async function renderSettings(view) {
  const [{ ai }, system, backupData, drive] = await Promise.all([api.settings(), api.system(), api.backups(), api.driveSettings()]);
  state.settings.ai = ai;
  renderChrome();
  const shortSha = system.sha ? system.sha.slice(0, 7) : 'bilinmiyor';

  view.innerHTML = `
    ${pageHead({ title: 'Ayarlar', desc: 'Yapay zekâ, Google Drive, güncelleme ve yedekler.' })}
    ${settingsTabs('genel')}
    <div class="settings">
      <section class="card" id="reminder-card">
        <div class="card-head"><h3>Hatırlatmalar</h3></div>
        <label class="check"><input type="checkbox" id="rm-summary" ${reminderPrefs().summary ? 'checked' : ''}> Açılışta günün özetini göster (günde bir kez)</label>
        <label class="check mt-2"><input type="checkbox" id="rm-notify" ${reminderPrefs().notify && typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'checked' : ''} ${typeof Notification === 'undefined' ? 'disabled' : ''}> Yayın saatinden 30 dakika önce bilgisayar bildirimi</label>
        <label class="check mt-2"><input type="checkbox" id="rm-tasks" ${reminderPrefs().tasks ? 'checked' : ''}> Görev hatırlatması: son günü gelen ve geciken görevler için günde bir kez bildirim (09:00'dan sonra)</label>
        <label class="check mt-2"><input type="checkbox" id="rm-sound" ${reminderPrefs().sound ? 'checked' : ''}> Ses efektleri (kaydetme, görev tamamlama, bildirim, hata)</label>
        <p class="hint mt-2">${typeof Notification === 'undefined' ? 'Bu tarayıcı bildirimleri desteklemiyor.' : 'Bildirimler uygulama açıkken (sekme arka planda olsa da) gelir; ilk açışta tarayıcı izin ister.'}</p>
      </section>
      <section class="card" id="ai-card">
        <div class="card-head"><h3>Yapay zekâ</h3>${ai.configured ? '<span class="pill pill-ok"><span class="dot"></span>Bağlı</span>' : '<span class="pill pill-warn"><span class="dot"></span>Bağlı değil</span>'}</div>
        ${ai.configured ? `<dl class="kv"><dt>Fikir ve asistan</dt><dd>${esc(ai.model)} <span class="muted xsmall">(${esc(ai.providerLabel)})</span></dd><dt>Bu ay</dt><dd>${ai.budget.spent.toFixed(2).replace('.', ',')} $${ai.budget.monthlyUsd ? ` / ${ai.budget.monthlyUsd} $` : ''}</dd></dl>` : '<p class="card-text">Claude, OpenAI, OpenRouter ya da Gemini anahtarı ekleyerek asistanı çalıştırabilirsin.</p>'}
        <div class="card-actions"><a class="btn btn-primary" href="#/ai/modeller">Sağlayıcılar ve modeller</a><a class="btn" href="#/ai">Modelleri karşılaştır</a><a class="btn btn-ghost" href="#/ai/harcama">Harcama</a></div>
      </section>
      <section class="card" id="update-card">
        <div class="card-head"><h3>Güncelleme</h3>${system.supervised ? '<span class="pill pill-ok"><span class="dot"></span>Otomatik güncelleme açık</span>' : '<span class="pill pill-warn"><span class="dot"></span>Baslat dosyasıyla açılmadı</span>'}</div>
        <dl class="kv">
          <dt>Sürüm</dt><dd>${esc(system.version)} · <code>${esc(shortSha)}</code></dd>
          <dt>Son güncelleme</dt><dd>${system.updatedAt ? esc(new Date(system.updatedAt).toLocaleString('tr-TR')) : '<span class="muted">Kayıt yok</span>'}</dd>
          <dt>Önceki sürüm</dt><dd>${system.previous ? `<code>${esc((system.previous.sha || 'bilinmiyor').slice(0, 7))}</code> <span class="muted small">(dönülebilir)</span>` : '<span class="muted">Yok</span>'}</dd>
        </dl>
        ${system.skippedSha ? `<div class="notice mt-3"><div><strong>Bir sürüm geri alındı.</strong> <code>${esc(system.skippedSha.slice(0, 7))}</code> sürümü ${system.rolledBackAt ? esc(fmtWhen(system.rolledBackAt)) + ' tarihinde ' : ''}geri alındı; GitHub'da daha yeni bir sürüm çıkana kadar kendiliğinden kurulmaz.</div></div>` : ''}
        <p class="card-text mt-3">Uygulama her açıldığında GitHub'daki son sürümü kontrol edip kendini günceller; güncellemeden önce verilerin yedeğini alır. Yeni sürüm açılamazsa kendiliğinden önceki sürüme döner.</p>
        <div class="card-actions">
          <button class="btn" data-action="check-update">Güncellemeleri kontrol et</button>
          <button class="btn btn-primary" data-action="apply-update" hidden>Güncelle ve yeniden başlat</button>
          ${system.previous && system.supervised ? '<button class="btn btn-ghost" data-action="rollback">Önceki sürüme dön</button>' : ''}
        </div>
        <div id="update-result" class="mt-3"></div>
        <details class="disclosure" ${system.tokenConfigured ? 'open' : ''}>
          <summary>GitHub erişim anahtarı (yalnızca depo özelse gerekir)</summary>
          <form id="token-form" class="stack-sm mt-3">
            <div class="field">
              <label for="gh-token">${system.tokenConfigured ? 'Anahtarı değiştir' : 'Erişim anahtarı'}</label>
              <input class="input" id="gh-token" type="password" autocomplete="off" maxlength="300" placeholder="github_pat_...">
              <span class="hint">GitHub → Settings → Developer settings → Fine-grained tokens: yalnızca bu depo, "Contents: Read-only" izni. Anahtar bu bilgisayarda saklanır.</span>
            </div>
            <div class="row"><button class="btn btn-sm" type="submit">Kaydet</button>${system.tokenConfigured ? '<button class="btn btn-sm btn-danger" type="button" data-action="remove-token">Kaldır</button>' : ''}</div>
          </form>
        </details>
      </section>
      <section class="card" id="drive-card">
        <div class="card-head"><h3>Google Drive</h3>${drive.configured ? '<span class="pill pill-ok"><span class="dot"></span>Bağlı</span>' : '<span class="pill pill-warn"><span class="dot"></span>Bağlı değil</span>'}</div>
        <p class="card-text">Her markanın dosyaları kendi Drive klasörüne gönderilir (klasör linkini markanın <b>Dijital kimlik → Marka profili</b> sayfasında girersin). Bunun için kendi Google hesabında bir kez küçük bir Apps Script yayınlaman gerekiyor; Google Cloud hesabı gerekmez.</p>
        ${drive.configured ? `<dl class="kv mt-3"><dt>Apps Script</dt><dd><code>${esc(drive.urlHint)}</code></dd></dl>` : ''}
        <details class="disclosure" ${drive.configured ? '' : 'open'}>
          <summary>${drive.configured ? 'Kurulum adımları ve kod' : 'Kurulum (bir kez, yaklaşık 3 dakika)'}</summary>
          <ol class="drive-steps small">
            <li><a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a>'da yeni bir proje aç (Drive klasörlerinin olduğu Google hesabıyla).</li>
            <li>Açılan sayfadaki kodun hepsini sil, aşağıdaki kodu yapıştır ve kaydet (Ctrl+S).</li>
            <li>Sağ üstte <b>Dağıt → Yeni dağıtım</b> → türü <b>Web uygulaması</b> seç. <b>Yürüten: Ben</b>, <b>Erişimi olan: Herkes</b> → Dağıt.</li>
            <li>Google izin isterse hesabını seç → "Gelişmiş" → "projeye git (güvenli değil)" → İzin ver. (Uyarı, kodu kendin yayınladığın için çıkar.)</li>
            <li>Verilen <b>Web uygulaması URL'sini</b> kopyalayıp aşağıya yapıştır → <b>Bağlan</b>.</li>
          </ol>
          <div class="code-box"><pre id="drive-script">${esc(drive.script)}</pre><button class="btn btn-sm" type="button" data-action="copy-script">Kodu kopyala</button></div>
          <p class="hint mt-2">Koddaki anahtar bu uygulamaya özeldir; kimseyle paylaşma.</p>
        </details>
        <form id="drive-form" class="stack-sm card-section">
          <div class="field">
            <label for="drive-url">${drive.configured ? 'Web uygulaması adresini değiştir' : 'Web uygulaması adresi'}</label>
            <input class="input" id="drive-url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec">
            <span class="hint">Bağlan'a basınca uygulama adresi dener; çalışmazsa kaydetmez ve nedenini söyler.</span>
          </div>
          <div class="row"><button class="btn btn-primary btn-sm" type="submit">Bağlan</button>${drive.configured ? '<button class="btn btn-sm btn-danger" type="button" data-action="remove-drive">Bağlantıyı kaldır</button>' : ''}</div>
        </form>
        <div id="drive-result" class="mt-3"></div>
      </section>
      <section class="card" id="backup-card">
        <div class="card-head"><h3>Yedekler</h3><span class="pill pill-ok"><span class="dot"></span>Her gün otomatik</span></div>
        <p class="card-text">Markalar, dosyalar, fikirler, takvim, görevler ve notlar her gün kendiliğinden yedeklenir (son ${backupData.keep} gün saklanır). Yedekler bu bilgisayarda <code>data/backups</code> klasöründedir; API anahtarların yedeğe girmez.</p>
        <div class="card-actions">
          <button class="btn btn-primary" type="button" data-action="create-backup">Şimdi yedek al</button>
          <label class="btn" for="backup-file">Yedek dosyasından geri yükle</label>
          <input type="file" id="backup-file" accept=".zip,application/zip" class="sr-only">
        </div>
        <div id="backup-result" class="mt-3"></div>
        <div id="backup-list" class="mt-3">${backupRows(backupData.backups)}</div>
        <details class="disclosure" ${backupData.copyDir ? 'open' : ''}>
          <summary>Yedeklerin bir kopyası başka bir klasöre de gitsin (ör. Google Drive)</summary>
          <form id="copy-form" class="stack-sm mt-3">
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

  view.querySelector('#token-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = view.querySelector('#gh-token');
    if (!input.value.trim()) return toast('Önce anahtarı yapıştır.', 'error');
    try { await api.saveUpdateToken(input.value); toast('Erişim anahtarı kaydedildi.', 'success'); renderSettings(view); } catch (err) { toast(err.message, 'error'); }
  });

  view.querySelector('#drive-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = view.querySelector('#drive-url');
    const out = view.querySelector('#drive-result');
    if (!input.value.trim()) return toast('Önce Apps Script adresini yapıştır.', 'error');
    const btn = e.submitter || view.querySelector('#drive-form [type=submit]');
    btn.disabled = true;
    out.innerHTML = '<p class="card-text">Google Drive\'a bağlanılıyor…</p>';
    try {
      const r = await api.saveDrive(input.value);
      await renderSettings(view);
      view.querySelector('#drive-result').innerHTML = `<div class="notice notice-ok"><div><strong>Google Drive bağlandı.</strong> ${r.rootFolder ? esc(r.rootFolder) + ' erişilebilir. ' : ''}Şimdi markanın Dijital kimlik sayfasından Drive klasör linkini ekleyebilirsin.</div></div>`;
    } catch (err) {
      out.innerHTML = `<div class="notice notice-error"><div><strong>Bağlanılamadı.</strong> ${esc(err.message)}</div></div>`;
    } finally { btn.disabled = false; }
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
    body: `<p>${what}</p><p class="small muted mt-2">Şu anki markalar, içerikler, görevler, notlar ve dosyalar yedekteki hâliyle <strong>değiştirilir</strong>. Güvenlik için önce şu anki hâlin yedeği alınır. API anahtarların değişmez.</p>`,
    submitLabel: 'Geri yükle',
    onSubmit: async () => {
      backupOut.innerHTML = '<p class="card-text">Geri yükleniyor…</p>';
      try { await afterRestore(await run()); } catch (err) { backupOut.innerHTML = ''; throw err; }
    }
  });

  view.querySelector('#rm-summary').addEventListener('change', e => { setReminderPrefs({ summary: e.target.checked }); toast('Kaydedildi.', 'success'); });
  view.querySelector('#rm-tasks').addEventListener('change', e => { setReminderPrefs({ tasks: e.target.checked }); toast('Kaydedildi.', 'success'); });
  view.querySelector('#rm-sound').addEventListener('change', e => { setReminderPrefs({ sound: e.target.checked }); toast(e.target.checked ? 'Ses efektleri açık.' : 'Ses efektleri kapalı.', 'success'); });
  view.querySelector('#rm-notify').addEventListener('change', async e => {
    if (e.target.checked && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { e.target.checked = false; return toast('Tarayıcı bildirim iznini vermedi; tarayıcı ayarlarından açabilirsin.', 'error', 6000); }
    }
    setReminderPrefs({ notify: e.target.checked });
    toast(e.target.checked ? 'Bildirimler açıldı.' : 'Bildirimler kapatıldı.', 'success');
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
    if (btn.dataset.action === 'copy-script') {
      try { await navigator.clipboard.writeText(view.querySelector('#drive-script').textContent); toast('Kod kopyalandı.', 'success'); }
      catch { toast('Kopyalanamadı; kodu seçip Ctrl+C ile kopyala.', 'error'); }
      return;
    }
    if (btn.dataset.action === 'remove-drive') {
      if (!confirm('Google Drive bağlantısı kaldırılsın mı? Markaların klasör linkleri silinmez; yeniden bağlanınca kaldığı yerden devam eder.')) return;
      try { await api.removeDrive(); toast('Drive bağlantısı kaldırıldı.', 'success'); renderSettings(view); } catch (err) { toast(err.message, 'error'); }
      return;
    }
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
      upd.innerHTML = '<p class="card-text">Önceki sürüme dönülüyor ve uygulama yeniden başlatılıyor…</p>';
      try { await api.rollback(); await waitForRestart(upd); } catch (err) { upd.innerHTML = `<div class="notice notice-error"><div>${esc(err.message)}</div></div>`; btn.disabled = false; }
      return;
    }
    const upd = view.querySelector('#update-result');
    if (btn.dataset.action === 'check-update') {
      btn.disabled = true;
      upd.innerHTML = '<p class="card-text">GitHub kontrol ediliyor…</p>';
      try {
        const r = await api.checkUpdate();
        const apply = view.querySelector('[data-action="apply-update"]');
        apply.hidden = !(r.available || r.skipped) || !system.supervised;
        apply.dataset.force = r.skipped ? '1' : '';
        apply.textContent = r.skipped ? 'Yine de güncelle' : 'Güncelle ve yeniden başlat';
        upd.innerHTML = r.available
          ? `<div class="notice notice-info"><div><strong>Yeni sürüm var</strong> (${esc(r.latest.slice(0, 7))}). ${system.supervised ? 'Güncelleyince uygulama birkaç saniye içinde kendini yeniden başlatır.' : 'Güncellemek için pencereyi kapatıp Baslat dosyasına çift tıkla.'}</div></div>`
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
      upd.innerHTML = '<p class="card-text">Uygulama yeniden başlatılıyor ve güncelleniyor… (yarım dakika sürebilir)</p>';
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
  };
}
