// Rakip profilleri: her rakip için ayrı kayıt; örnek gönderilerden AI analizi (içerik sütunları, ton, güçlü/zayıf yanlar,
// boşluklar ve fikirler). Fikirler tek tıkla fikir havuzuna eklenir; boşluklar marka hafızasına girer.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, openModal, timeAgo } from '../ui.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';

export async function renderCompetitors(view, brand) {
  view.onclick = null;
  const models = await aiModels();
  const aiReady = models.ov.providers.some(p => p.configured);
  let { competitors } = await api.competitors(brand.id);
  const li = list => (list && list.length ? `<ul class="issue-list">${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted small">—</span>');

  function draw() {
    view.innerHTML = `
      ${pageHead({ title: 'Rakipler', desc: `${esc(brand.name)} için rakip profilleri: ne paylaşıyorlar, hangi kalıpları kullanıyorlar, nerede boşluk var. Analizdeki boşluklar marka hafızasına girer.`,
        actions: `<button class="btn btn-primary" data-new>${icon('plus')}Rakip ekle</button>` })}
      ${competitors.length ? `<div class="pattern-grid">${competitors.map(c => `
        <section class="card">
          <div class="card-head"><h3>${esc(c.name)} ${c.handle ? `<span class="muted small">${esc(c.handle)}</span>` : ''}</h3>
            <div class="row"><button class="btn btn-sm btn-ghost icon-btn" data-edit="${esc(c.id)}" aria-label="Düzenle">${icon('edit')}</button><button class="btn btn-sm btn-ghost icon-btn" data-del="${esc(c.id)}" aria-label="Sil">${icon('trash')}</button></div></div>
          ${c.url ? `<a class="link small" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a>` : ''}
          ${c.notes ? `<p class="small mt-2">${esc(c.notes)}</p>` : ''}
          ${c.analysis ? `
            <p class="mt-3">${esc(c.analysis.summary)}</p>
            <dl class="kv mt-2"><dt>İçerik sütunları</dt><dd>${li(c.analysis.pillars)}</dd><dt>Ton</dt><dd>${esc(c.analysis.tone || '—')}</dd>
              <dt>Formatlar</dt><dd>${esc((c.analysis.formats || []).join(', ') || '—')}</dd><dt>Kalıplar</dt><dd>${li(c.analysis.hooks)}</dd>
              <dt>Güçlü yanlar</dt><dd>${li(c.analysis.strengths)}</dd><dt>Zayıf yanlar</dt><dd>${li(c.analysis.weaknesses)}</dd>
              <dt><b>Boşluklar</b></dt><dd>${li(c.analysis.gaps)}</dd></dl>
            ${(c.analysis.ideas || []).length ? `<h4 class="mt-3 mb-2">Bizim için fikirler</h4><ul class="comp-ideas">${c.analysis.ideas.map((x, i) => `<li><span>${esc(x)}</span><button class="btn btn-sm" data-idea="${esc(c.id)}" data-i="${i}">Fikir havuzuna ekle</button></li>`).join('')}</ul>` : ''}
            <div class="xsmall muted mt-2">Son analiz ${timeAgo(c.analysis.at)}${c.modelLabel ? ` · ${esc(c.modelLabel)}` : ''}</div>`
            : `<p class="small muted mt-3">${c.samples ? 'Örnek gönderiler eklendi; analiz için düğmeye bas.' : 'Analiz için düzenle → "Örnek gönderiler" alanına rakibin birkaç gönderi açıklamasını ya da Reels metnini yapıştır.'}</p>`}
          ${aiReady ? `<div class="row mt-3">${modelSelect(models, 'fikir', { id: 'cm-' + c.id })}<button class="btn btn-sm btn-primary" data-analyze="${esc(c.id)}">${icon('sparkle')}${c.analysis ? 'Yeniden analiz et' : 'Analiz et'}</button></div>` : ''}
        </section>`).join('')}</div>`
        : emptyState({ icon: 'brands', title: 'Henüz rakip yok', text: 'Rakip ekle; birkaç gönderi açıklamasını yapıştır, AI ne paylaştıklarını ve senin için boşlukları çıkarsın.', action: `<button class="btn btn-primary" data-new>${icon('plus')}Rakip ekle</button>`, card: true })}`;
  }

  function form(c) {
    openModal({
      title: c ? 'Rakibi düzenle' : 'Rakip ekle', submitLabel: 'Kaydet',
      body: `<div class="form-grid">
        <div class="field"><label for="cp-name">Ad *</label><input class="input" id="cp-name" name="name" required maxlength="80" value="${esc(c ? c.name : '')}"></div>
        <div class="field"><label for="cp-handle">Instagram hesabı</label><input class="input" id="cp-handle" name="handle" maxlength="80" value="${esc(c ? c.handle : '')}" placeholder="@hesap"></div>
        <div class="field full"><label for="cp-url">Bağlantı</label><input class="input" id="cp-url" name="url" maxlength="300" value="${esc(c ? c.url : '')}" placeholder="https://instagram.com/…"></div>
        <div class="field full"><label for="cp-notes">Notlar</label><textarea class="textarea" id="cp-notes" name="notes" rows="2" maxlength="2000">${esc(c ? c.notes : '')}</textarea></div>
        <div class="field full"><label for="cp-samples">Örnek gönderiler</label><textarea class="textarea" id="cp-samples" name="samples" rows="7" maxlength="12000" placeholder="Rakibin son gönderilerinin açıklamalarını, Reels konuşma metinlerini ya da kısa tariflerini alt alta yapıştır.">${esc(c ? c.samples : '')}</textarea></div></div>`,
      onSubmit: async fd => {
        const body = Object.fromEntries(['name', 'handle', 'url', 'notes', 'samples'].map(k => [k, fd.get(k) || '']));
        if (c) await api.saveCompetitor(brand.id, c.id, body); else await api.createCompetitor(brand.id, body);
        competitors = (await api.competitors(brand.id)).competitors; draw();
      }
    });
  }

  view.onclick = async e => {
    const t = e.target;
    if (t.closest('[data-new]')) return form(null);
    const ed = t.closest('[data-edit]');
    if (ed) return form(competitors.find(c => c.id === ed.dataset.edit));
    const del = t.closest('[data-del]');
    if (del) { if (!confirm('Rakip profili silinsin mi?')) return; try { await api.deleteCompetitor(brand.id, del.dataset.del); competitors = (await api.competitors(brand.id)).competitors; draw(); } catch (err) { toast(err.message, 'error'); } return; }
    const an = t.closest('[data-analyze]');
    if (an) {
      try {
        const { competitor } = await busyTimer(an, () => api.analyzeCompetitor(brand.id, an.dataset.analyze, (view.querySelector('#cm-' + an.dataset.analyze) || {}).value || null), 'Analiz ediyor');
        toast(`Analiz hazır (${aiNote(competitor.ai)})`, 'success', 5000);
        competitors = (await api.competitors(brand.id)).competitors; draw();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const idea = t.closest('[data-idea]');
    if (idea) {
      const c = competitors.find(x => x.id === idea.dataset.idea);
      const textIdea = c.analysis.ideas[Number(idea.dataset.i)];
      try { await api.createIdea(brand.id, { title: textIdea.slice(0, 200), description: `${c.name} analizindeki boşluktan`, category: 'bilgilendirici' }); idea.disabled = true; idea.textContent = 'Eklendi ✓'; } catch (err) { toast(err.message, 'error'); }
    }
  };
  draw();
}
