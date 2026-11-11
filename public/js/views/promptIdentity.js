// 7.2 Marka prompt kişiliği sihirbazı: sorular ve işaretlemelerle bir kez doldurulur; cevaplar markanın bütün
// prompt üretimlerine kendiliğinden girer (Prompt Studio). Sorular sabit, cevaplar markaya özel.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, busy } from '../ui.js';

export async function renderPromptIdentity(view, brand) {
  const { identity, questions } = await api.promptIdentity(brand.id);
  let idt = Object.assign({}, identity);
  const groups = [...new Set(questions.map(q => q.group))];

  const field = q => {
    const id = 'pi-' + q.key;
    const hidden = q.when && !idt[q.when] ? 'hidden' : '';
    if (q.type === 'one' || q.type === 'many') {
      const multi = q.type === 'many';
      const sel = v => (multi ? (idt[q.key] || []).includes(v) : idt[q.key] === v);
      return `<fieldset class="field pi-q" data-q="${q.key}" ${hidden}><legend class="field-label">${esc(q.label)}</legend><div class="chip-row">${Object.entries(q.options).map(([v, l]) =>
        `<label class="chip-check"><input type="${multi ? 'checkbox' : 'radio'}" name="${q.key}" value="${esc(v)}" ${sel(v) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
        ${multi ? '' : `<label class="chip-check"><input type="radio" name="${q.key}" value="" ${idt[q.key] ? '' : 'checked'}><span>Fark etmez</span></label>`}</div></fieldset>`;
    }
    if (q.type === 'bool') return `<div class="field pi-q" data-q="${q.key}"><label class="check"><input type="checkbox" id="${id}" name="${q.key}" ${idt[q.key] ? 'checked' : ''}> ${esc(q.label)}</label></div>`;
    const val = Array.isArray(idt[q.key]) ? idt[q.key].join(', ') : (idt[q.key] || '');
    return `<div class="field pi-q" data-q="${q.key}" ${hidden}><label for="${id}">${esc(q.label)}</label><input class="input" id="${id}" name="${q.key}" maxlength="300" value="${esc(val)}" placeholder="${esc(q.hint || '')}" data-mic></div>`;
  };

  view.innerHTML = `
    ${pageHead({ title: 'Prompt kimliği', desc: `${esc(brand.name)} için bir kez doldur: görsel dil, his ve (varsa) maskot. Prompt Studio'daki her üretim bu tercihlere göre yazılır; model değişse de yapı aynı kalır.` })}
    <form id="pi-form" class="stack">
      ${groups.map(g => `<section class="card"><div class="card-head"><h3>${esc(g)}</h3></div><div class="stack-sm">${questions.filter(q => q.group === g).map(field).join('')}</div></section>`).join('')}
      <div class="save-bar card"><span class="small muted">Boş bıraktığın sorular üretimi etkilemez.</span><button class="btn btn-primary" type="submit">${icon('check')}Kaydet</button></div>
    </form>`;

  const form = view.querySelector('#pi-form');
  const read = () => {
    const out = {};
    for (const q of questions) {
      if (q.type === 'many') out[q.key] = [...form.querySelectorAll(`[name="${q.key}"]:checked`)].map(i => i.value);
      else if (q.type === 'one') out[q.key] = (form.querySelector(`[name="${q.key}"]:checked`) || {}).value || '';
      else if (q.type === 'bool') out[q.key] = form.querySelector(`[name="${q.key}"]`).checked;
      else out[q.key] = form.querySelector(`[name="${q.key}"]`).value;
    }
    return out;
  };
  form.addEventListener('change', e => {
    if (e.target.name === 'hasMascot') questions.filter(q => q.when === 'hasMascot').forEach(q => { form.querySelector(`[data-q="${q.key}"]`).hidden = !e.target.checked; });
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await busy(e.submitter, () => api.savePromptIdentity(brand.id, read()));
      idt = r.identity;
      toast('Prompt kimliği kaydedildi; bundan sonraki prompt\'lar bu tercihlerle yazılır.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}
