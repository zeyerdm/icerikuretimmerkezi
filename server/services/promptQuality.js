// 7.6 Kalite kontrolü: üretilen prompt kodla denetlenir. Kemiğin (7.1) bölümleri var mı, yasaklı kelime ya da
// istenmeyen isim geçiyor mu, uzunluk yeterli mi, Midjourney parametresi / HEX kodu kalmış mı.
// Sonuç rozet olarak gösterilir; üretim sırasında zorunlu bir eksik varsa model eksikleri söylenerek bir kez daha denenir.
import { SKELETONS, sectionsOf } from './promptSkeleton.js';

const fold = s => String(s || '').toLocaleLowerCase('tr-TR');

// opts: { banned: [], forbidNames: [], brandName, noBrandName }
export function checkPrompt(kind, text, lang = 'en', opts = {}) {
  const t = String(text || '');
  const checks = [];
  const sk = SKELETONS[kind];
  if (sk) {
    for (const s of sectionsOf(kind)) {
      const re = lang === 'tr' ? s.tr : s.test;
      if (!re) continue;
      if (opts.allowText && (s.key === 'negative' || s.key === 'nosubs')) continue; // 7.7: yazıya izin verildiyse bu bölüm aranmaz
      checks.push({ key: s.key, label: s.label, ok: re.test(t), kind: 'section' });
    }
    const words = t.split(/\s+/).filter(Boolean).length;
    checks.push({ key: 'length', label: 'Uzunluk', ok: words >= sk.minWords, kind: 'rule', msg: words >= sk.minWords ? `${words} kelime` : `${words} kelime; en az ${sk.minWords} olmalı` });
    if (lang === 'en') {
      const mj = /(^|\s)--(ar|v|q|style|s|chaos|no)\b/i.test(t);
      checks.push({ key: 'params', label: 'Parametre yok', ok: !mj, kind: 'rule', msg: mj ? 'Midjourney parametresi (--ar gibi) var' : '' });
      const hex = /#[0-9a-f]{6}\b/i.test(t);
      checks.push({ key: 'hex', label: 'Renk adıyla', ok: !hex, kind: 'rule', msg: hex ? 'HEX renk kodu var; renk adıyla yazılmalı' : '' });
    }
  }
  const hay = fold(t);
  const hits = (opts.banned || []).filter(w => w && hay.includes(fold(w)));
  checks.push({ key: 'banned', label: 'Yasaklı kelime yok', ok: !hits.length, kind: 'rule', msg: hits.length ? `Geçiyor: ${hits.join(', ')}` : '' });
  const names = [...(opts.forbidNames || []), ...(opts.noBrandName && opts.brandName ? [opts.brandName] : [])].filter(Boolean);
  const nameHits = names.filter(n => hay.includes(fold(n)));
  if (names.length) checks.push({ key: 'names', label: 'İstenmeyen isim yok', ok: !nameHits.length, kind: 'rule', msg: nameHits.length ? `Geçiyor: ${nameHits.join(', ')}` : '' });
  const failed = checks.filter(c => !c.ok);
  return { ok: !failed.length, score: checks.length ? Math.round((checks.length - failed.length) / checks.length * 100) : 100, checks, missing: failed.map(c => c.msg || c.label) };
}

// Yeniden deneme talimatı (eksikler Türkçe listelenir)
export function retryInstruction(q) {
  return `KALİTE KONTROLÜ: Önceki yazımda şunlar eksik ya da hatalıydı: ${q.missing.join('; ')}. Prompt'u bu eksikleri giderecek şekilde baştan yaz; diğer kurallar aynen geçerli.`;
}
