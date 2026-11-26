// Marka kimliği › Hedefler ve sütunlar (O3). Yapay zekâ kullanılmaz.
// - Aylık hedefler: erişim, takipçi ve etkileşim takvimdeki paylaşım sonuçlarından kendiliğinden ölçülür;
//   satış, web trafiği ve bilinirlik elle girilir.
// - İçerik sütunları: ad, hedef pay (%), açıklama. Takvimdeki içeriğe sütun atanır; bu ayın dağılımı hedefle karşılaştırılır.
import { api } from '../api.js';
import { esc, icon, toast, emptyState, openModal } from '../ui.js';
import { state } from '../app.js';
import { identityHead, bindIdentityActions } from './identity.js';

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const mkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const fmt = (v, unit) => (v == null ? '—' : (unit === '%' ? '%' + String(v).replace('.', ',') : Number(v).toLocaleString('tr-TR')));
const bar = p => `<span class="rep-bar"><i style="width:${Math.max(0, Math.min(100, p || 0))}%"></i></span>`;

export async function renderStrategy(view, brand) {
  view.onclick = null;
  const kinds = state.meta.goalKinds || {};
  let month = new Date(); month.setDate(1);
  let data = null;
  const load = async () => { data = await api.strategy(brand.id, mkey(month)); };
  await load();

  function draw() {
    const p = data.progress;
    const label = `${TR_MONTHS[month.getMonth()]} ${month.getFullYear()}`;
    const total = data.pillars.reduce((n, x) => n + x.share, 0);
    const base = `#/m/${esc(brand.id)}`;
    view.innerHTML = identityHead(brand, 'strateji', `${esc(brand.name)} için ölçülebilir aylık hedefler ve içerik sütunları. Takvimde içeriğe sütun, amaç, kitle ve kanal atadıkça ilerleme burada ve aylık raporda görünür. Yapay zekâ kullanılmaz.`) + `
      <section class="card">
        <div class="row"><h2 class="card-title grow">Aylık hedefler</h2>
          <button class="btn icon-btn btn-sm" data-m="-1" aria-label="Önceki ay">${icon('chevronLeft')}</button>
          <b>${esc(label)}</b>
          <button class="btn icon-btn btn-sm" data-m="1" aria-label="Sonraki ay">${icon('chevronRight')}</button>
        </div>
        ${p.goals.length ? `<table class="table rep-table mt-3"><thead><tr><th>Hedef</th><th>Hedef değer</th><th>Gerçekleşen</th><th>İlerleme</th><th></th></tr></thead><tbody>
          ${p.goals.map(g => `<tr><td>${esc(g.label)}${g.note ? `<div class="xsmall muted">${esc(g.note)}</div>` : ''}</td><td>${fmt(g.target, g.unit)}</td>
            <td>${fmt(g.actual, g.unit)}<div class="xsmall muted">${g.auto ? (g.measuredCount ? `${g.measuredCount} içeriğin sonucundan` : 'Sonuç girilmiş içerik yok') : 'Elle girilir'}</div></td>
            <td>${g.percent != null ? `${bar(g.percent)} %${g.percent}` : '<span class="muted">—</span>'}</td>
            <td class="nowrap"><button class="btn btn-sm btn-ghost" data-goal-edit="${esc(g.id)}">Düzenle</button><button class="btn btn-sm btn-ghost" data-goal-del="${esc(g.id)}" aria-label="Hedefi sil">${icon('trash')}</button></td></tr>`).join('')}
        </tbody></table>` : emptyState({ icon: 'chart', title: 'Bu ay için hedef yok', text: 'Ör. erişim 20.000, yeni takipçi 300, ortalama etkileşim %4.', compact: true })}
        <div class="row mt-3"><button class="btn btn-sm btn-primary" data-goal-add>${icon('plus')}Hedef ekle</button>
          <button class="btn btn-sm" data-goal-copy title="Geçen ayın hedefleri bu aya kopyalanır; var olanlar değişmez">Geçen aydan kopyala</button></div>
      </section>
      <section class="card mt-4">
        <div class="row"><h2 class="card-title grow">İçerik sütunları</h2><span class="small muted">Hedef paylar toplamı: %${total}</span></div>
        <p class="small muted mt-1">Markanın düzenli işlediği ana başlıklar (ör. Eğitici %30, Ürün %25, Kulis %20). Takvimdeki içeriğe sütun atadıkça bu ayın dağılımı hedefle karşılaştırılır; bir sütun çok geride kalırsa bildirim merkezinde uyarı çıkar.</p>
        ${data.pillars.length ? `<table class="table rep-table mt-3"><thead><tr><th>Sütun</th><th>Hedef pay</th><th>${esc(label)}</th><th></th></tr></thead><tbody>
          ${p.pillars.map(x => `<tr><td><b>${esc(x.name)}</b>${x.description ? `<div class="xsmall muted">${esc(x.description)}</div>` : ''}</td><td>%${x.share}</td>
            <td>${bar(x.actualShare)} %${x.actualShare} <span class="xsmall muted">(${x.count} içerik)</span></td>
            <td class="nowrap"><button class="btn btn-sm btn-ghost" data-pillar-edit="${esc(x.id)}">Düzenle</button><button class="btn btn-sm btn-ghost" data-pillar-del="${esc(x.id)}" aria-label="Sütunu sil">${icon('trash')}</button></td></tr>`).join('')}
        </tbody></table>
        <p class="xsmall muted mt-2">Bu ay ${p.contentCount} içerik planlı; ${p.assigned} tanesine sütun atanmış${p.unassigned ? `, ${p.unassigned} tanesi sütunsuz (<a href="${base}/takvim">takvimde ata</a>)` : ''}.</p>`
          : emptyState({ icon: 'layers', title: 'Henüz içerik sütunu yok', text: 'Sütun ekleyince takvimdeki içerik penceresinde seçilebilir.', compact: true })}
        <div class="row mt-3"><button class="btn btn-sm btn-primary" data-pillar-add>${icon('plus')}Sütun ekle</button></div>
      </section>
      ${p.byPlatform.length || p.byPurpose.length ? `<section class="card mt-4"><h2 class="card-title">${esc(label)} dağılımı</h2><div class="grid-2 mt-2">
        <div><h3 class="small">Kanala göre</h3><ul class="rep-list">${p.byPlatform.map(x => `<li>${esc(x.label)}: <b>${x.count}</b></li>`).join('')}</ul></div>
        <div><h3 class="small">Amaca göre</h3>${p.byPurpose.length ? `<ul class="rep-list">${p.byPurpose.map(x => `<li>${esc(x.label)}: <b>${x.count}</b></li>`).join('')}</ul>` : '<p class="small muted">Amaç atanmış içerik yok.</p>'}</div>
      </div></section>` : ''}`;
    bindIdentityActions(view, brand);
  }

  const refresh = async () => { await load(); draw(); };
  const goalModal = g => {
    const used = new Set(data.progress.goals.map(x => x.kind));
    const opts = Object.entries(kinds).filter(([k]) => (g ? k === g.kind : !used.has(k)));
    if (!opts.length) return toast('Bu ay için bütün hedef türleri eklenmiş.', 'info');
    openModal({
      title: g ? 'Hedefi düzenle' : 'Hedef ekle',
      body: `<div class="form-grid">
        <div class="field full"><label for="g-kind">Hedef</label><select class="select" id="g-kind" name="kind" ${g ? 'disabled' : ''}>${opts.map(([k, v]) => `<option value="${k}">${esc(v.label)}${v.auto ? '' : ' (elle girilir)'}</option>`).join('')}</select></div>
        <div class="field"><label for="g-target">Hedef değer *</label><input class="input" id="g-target" name="target" type="number" min="0" step="any" required value="${g ? esc(g.target) : ''}"></div>
        <div class="field" id="g-actual-f"><label for="g-actual">Gerçekleşen</label><input class="input" id="g-actual" name="actual" type="number" min="0" step="any" value="${g && !g.auto && g.actual != null ? esc(g.actual) : ''}"><span class="hint">Sistemin göremediği sayı; ay içinde güncelleyebilirsin.</span></div>
        <div class="field full"><label for="g-note">Not</label><input class="input" id="g-note" name="note" maxlength="300" value="${g ? esc(g.note) : ''}" placeholder="Ör. Kasım kampanyasıyla"></div>
      </div>`,
      onSubmit: async fd => {
        const kind = g ? g.kind : fd.get('kind');
        const body = { kind, month: mkey(month), target: fd.get('target'), note: fd.get('note') };
        if (!(kinds[kind] || {}).auto) body.actual = fd.get('actual');
        if (g) await api.updateGoal(brand.id, g.id, body); else await api.saveGoal(brand.id, body);
        await refresh(); toast('Hedef kaydedildi.', 'success');
      }
    });
    const sel = document.getElementById('g-kind');
    const sync = () => { const k = g ? g.kind : sel.value; document.getElementById('g-actual-f').hidden = Boolean((kinds[k] || {}).auto); };
    sel.addEventListener('change', sync); sync();
  };
  const pillarModal = x => openModal({
    title: x ? 'Sütunu düzenle' : 'Sütun ekle',
    body: `<div class="form-grid">
      <div class="field"><label for="p-name">Ad *</label><input class="input" id="p-name" name="name" maxlength="60" required value="${x ? esc(x.name) : ''}" placeholder="Ör. Eğitici"></div>
      <div class="field"><label for="p-share">Hedef pay (%)</label><input class="input" id="p-share" name="share" type="number" min="0" max="100" value="${x ? esc(x.share) : ''}"></div>
      <div class="field full"><label for="p-desc">Açıklama</label><input class="input" id="p-desc" name="description" maxlength="300" value="${x ? esc(x.description) : ''}" placeholder="Bu sütunda ne anlatılır?"></div>
    </div>`,
    onSubmit: async fd => {
      const body = { name: fd.get('name'), share: fd.get('share') || 0, description: fd.get('description') };
      if (x) await api.updatePillar(brand.id, x.id, body); else await api.addPillar(brand.id, body);
      await refresh(); toast('Sütun kaydedildi.', 'success');
    }
  });

  view.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.m) { month = new Date(month.getFullYear(), month.getMonth() + Number(t.dataset.m), 1); await refresh(); }
      else if ('goalAdd' in t.dataset) goalModal(null);
      else if (t.dataset.goalEdit) goalModal(data.progress.goals.find(g => g.id === t.dataset.goalEdit));
      else if (t.dataset.goalDel) { if (confirm('Bu hedef silinsin mi?')) { await api.deleteGoal(brand.id, t.dataset.goalDel); await refresh(); } }
      else if ('goalCopy' in t.dataset) {
        const prev = mkey(new Date(month.getFullYear(), month.getMonth() - 1, 1));
        const r = await api.copyGoals(brand.id, prev, mkey(month));
        toast(r.copied ? `${r.copied} hedef kopyalandı.` : 'Kopyalanacak yeni hedef yok.', r.copied ? 'success' : 'info');
        await refresh();
      }
      else if ('pillarAdd' in t.dataset) pillarModal(null);
      else if (t.dataset.pillarEdit) pillarModal(data.pillars.find(x => x.id === t.dataset.pillarEdit));
      else if (t.dataset.pillarDel) { if (confirm('Sütun silinsin mi? İçerikler silinmez, yalnız sütunsuz kalır.')) { await api.deletePillar(brand.id, t.dataset.pillarDel); await refresh(); } }
    } catch (err) { toast(err.message, 'error'); }
  };
  draw();
}
