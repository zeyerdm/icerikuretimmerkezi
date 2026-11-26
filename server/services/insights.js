// Proaktif uyarılar (Aşama 05): yapay zekâ çağırmadan, kayıtlardan kurallarla çıkarılır (ücretsiz, anlık).
// Her uyarı: marka, tür, öncelik, tarih, açıklama ve önerilen işlem (bağlantı). Anahtar sabittir (marka + tür + dönem):
// aynı uyarı tekrar üretilmez; "Gizle" denen anahtar seçilen süre boyunca görünmez (ayarlar tablosunda tutulur).
// Kritik hiçbir işlem burada yapılmaz; yalnız öneri verilir.
import { specialDays } from './specialDays.js';
import { badRequest, parseJson } from '../lib/http.js';
import { CONTENT_TYPES, engagementRate } from './workspace.js';

export const INSIGHT_KINDS = {
  plan_bos: 'Plan boşluğu', onay_bekliyor: 'Onay bekleyen içerik', geciken_icerik: 'Tarihi geçen içerik',
  geciken_gorev: 'Geciken görev', hafiza_onay: 'Onay bekleyen bilgi', ozel_gun: 'Yaklaşan özel gün', uretim_dustu: 'Üretim düştü', tek_tip: 'Tek tip içerik', sutun_dengesi: 'Sütun dengesi', hedef_geride: 'Hedef geride', kimlik_eksik: 'Eksik marka bilgisi', tur_dustu: 'Performans düştü', hafta_plani: 'Gelecek hafta önerisi'
};
const PRIORITY_RANK = { yuksek: 0, orta: 1, dusuk: 2 };
const DONE = ['tamamlandi', 'yayinlandi'];
const DAY = 86400000;
const pct = v => String(Math.round(v * 10) / 10).replace('.', ',');
const isoDay = d => new Date(d).toISOString().slice(0, 10);
// Haftanın pazartesisi (dönem anahtarı)
const weekKey = t => { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return isoDay(d); };

export function createInsightService({ db, brands, settings, strategy = null, setup = null }) {
  const dismissed = () => { try { const v = JSON.parse(settings.get('insights.dismissed') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

  function forBrand(b, t) {
    const out = [];
    const add = (o) => out.push(Object.assign({ brandId: b.id, brandName: b.name, brandColor: (b.colors && b.colors.primary) || '' }, o));
    const base = `#/m/${b.id}`;
    const rows = db.prepare('SELECT id, title, type, status, scheduled_at, created_at, updated_at, metrics, pillar_id FROM contents WHERE brand_id = ?').all(b.id);
    const now = new Date(t).toISOString();
    const in7 = new Date(t + 7 * DAY).toISOString();
    // 1) Önümüzdeki 7 gün: aylık hedef varsa haftalık paya göre, yoksa son 30 günde üretim olduğu hâlde hiç plan yoksa
    const next7 = rows.filter(r => r.scheduled_at && r.scheduled_at >= now && r.scheduled_at < in7).length;
    const recent30 = rows.filter(r => r.created_at >= new Date(t - 30 * DAY).toISOString()).length;
    const weekly = b.monthlyGoal ? Math.ceil(b.monthlyGoal / 4.3) : 0;
    if ((weekly && next7 < weekly) || (!weekly && recent30 > 0 && next7 === 0)) {
      add({ key: `plan_bos:${b.id}:${weekKey(t)}`, kind: 'plan_bos', priority: next7 === 0 ? 'yuksek' : 'orta', date: isoDay(t),
        title: next7 === 0 ? 'Önümüzdeki 7 gün boş' : `Bu hafta ${next7} içerik planlı`,
        text: weekly ? `Aylık hedefe göre haftada ${weekly} içerik gerekiyor; ${weekly - next7} eksik.` : 'Son 30 günde üretim var ama önümüzdeki hafta için takvimde içerik yok.',
        action: { label: 'Haftayı planla', href: `${base}/takvim` } });
    }
    // 2) Onay bekleyen içerik (2 günden eski: yüksek)
    for (const r of rows.filter(x => x.status === 'onay')) {
      const old = t - Date.parse(r.updated_at) > 2 * DAY;
      add({ key: `onay_bekliyor:${r.id}`, kind: 'onay_bekliyor', priority: old ? 'yuksek' : 'orta', date: isoDay(r.updated_at), title: `Onay bekliyor: ${r.title}`,
        text: old ? '2 günden uzun süredir onay bekliyor; müşteriye hatırlat ya da durumu güncelle.' : 'Onaya gönderildi.', action: { label: 'İçeriği aç', href: `${base}/takvim` } });
    }
    // 3) Tarihi geçmiş, bitmemiş içerik (marka başına tek uyarı)
    const late = rows.filter(r => r.scheduled_at && r.scheduled_at < now && !DONE.includes(r.status));
    if (late.length) add({ key: `geciken_icerik:${b.id}:${isoDay(t)}`, kind: 'geciken_icerik', priority: 'yuksek', date: isoDay(t), title: `${late.length} içeriğin tarihi geçti`,
      text: late.slice(0, 3).map(r => r.title).join(', ') + (late.length > 3 ? ` ve ${late.length - 3} içerik daha` : '') + '. Yayınlandıysa durumunu güncelle ya da yeni tarih ver.', action: { label: 'Takvimi aç', href: `${base}/takvim` } });
    // 4) Geciken görev
    const tasks = db.prepare("SELECT title, due_date FROM tasks WHERE brand_id = ? AND status != 'tamamlandi' AND due_date IS NOT NULL AND due_date < ?").all(b.id, isoDay(t));
    if (tasks.length) add({ key: `geciken_gorev:${b.id}:${isoDay(t)}`, kind: 'geciken_gorev', priority: 'yuksek', date: isoDay(t), title: `${tasks.length} görev gecikti`,
      text: tasks.slice(0, 3).map(x => x.title).join(', '), action: { label: 'Görevleri aç', href: '#/gorevler' } });
    // 5) Üretim düştü: son 14 gün, önceki 14 günün yarısından az (önceki en az 4)
    const c = (from, to) => rows.filter(r => r.created_at >= new Date(t - from * DAY).toISOString() && r.created_at < new Date(t - to * DAY).toISOString()).length;
    const last14 = c(14, 0); const prev14 = c(28, 14);
    if (prev14 >= 4 && last14 <= prev14 / 2) add({ key: `uretim_dustu:${b.id}:${weekKey(t)}`, kind: 'uretim_dustu', priority: 'orta', date: isoDay(t),
      title: 'Üretim sıklığı düştü', text: `Son 14 günde ${last14} içerik (önceki 14 günde ${prev14}).`, action: { label: 'Fikir havuzunu aç', href: `${base}/fikirler` } });
    // 6) Tek tip içerik: son 30 günde en az 6 içeriğin %80'i aynı tür
    const m30 = rows.filter(r => r.created_at >= new Date(t - 30 * DAY).toISOString());
    if (m30.length >= 6) {
      const by = {}; m30.forEach(r => { by[r.type] = (by[r.type] || 0) + 1; });
      const [top, n] = Object.entries(by).sort((x, y) => y[1] - x[1])[0];
      if (n / m30.length >= 0.8) add({ key: `tek_tip:${b.id}:${weekKey(t)}`, kind: 'tek_tip', priority: 'dusuk', date: isoDay(t), title: 'İçerikler tek tipe yığıldı',
        text: `Son 30 gündeki ${m30.length} içeriğin ${n} tanesi aynı tür (${top}). Farklı biçim ve konularla çeşitlendir.`, action: { label: 'Fikir havuzunu aç', href: `${base}/fikirler` } });
    }
    // 6b) İçerik sütunları: son 30 günde sütun atanmış en az 6 içerik varken hedef payı %15 ve üstü olan bir sütun
    // hedefinin üçte birine bile ulaşmıyorsa (ör. Eğitici hedef %30, gerçekleşen %5)
    const pillars = db.prepare('SELECT id, name, share FROM brand_pillars WHERE brand_id = ? AND share >= 15').all(b.id);
    if (pillars.length) {
      const since = new Date(t - 30 * DAY).toISOString();
      const pr = db.prepare('SELECT pillar_id FROM contents WHERE brand_id = ? AND pillar_id IS NOT NULL AND COALESCE(scheduled_at, created_at) >= ? AND COALESCE(scheduled_at, created_at) < ?').all(b.id, since, in7);
      if (pr.length >= 6) {
        const low = pillars.map(p => ({ ...p, actual: Math.round(pr.filter(r => r.pillar_id === p.id).length / pr.length * 100) })).filter(p => p.actual < p.share / 3);
        if (low.length) add({ key: `sutun_dengesi:${b.id}:${weekKey(t)}`, kind: 'sutun_dengesi', priority: 'dusuk', date: isoDay(t), title: 'İçerik sütunları dengesiz',
          text: low.map(p => `${p.name}: hedef %${p.share}, son 30 gün %${p.actual}`).join(' · ') + '. Bu sütunlardan içerik planla.', action: { label: 'Hedefler ve sütunlar', href: `${base}/kimlik/strateji` } });
      }
    }
    // 6c) Ayın hedefi geride: ayın 20'sinden sonra kendiliğinden ölçülen hedeflerin yarısına ulaşılmadıysa
    if (strategy && new Date(t).getUTCDate() >= 20) {
      const month = isoDay(t).slice(0, 7);
      const behind = strategy.progress(b.id, month).goals.filter(g => g.auto && g.percent != null && g.percent < 50);
      if (behind.length) add({ key: `hedef_geride:${b.id}:${month}`, kind: 'hedef_geride', priority: 'orta', date: isoDay(t), title: 'Ayın hedefi geride',
        text: behind.map(g => `${g.label}: %${g.percent}`).join(' · ') + ' (paylaşım sonuçları girilen içeriklere göre).', action: { label: 'Aylık rapor', href: `${base}/rapor` } });
    }
    // 6d) O4.6 · Marka kimliğinde kişinin vermesi gereken eksik bilgi (logo, açıklama, adres…): yapay zekâ çağrılmaz;
    // kurulum sihirbazı yalnız eksik adımı açar. Anahtar eksik sayısına bağlı: sayı değişince uyarı yenilenir.
    if (setup) {
      let st = null;
      try { st = setup.status(b.id); } catch { st = null; }
      if (st) {
        const missing = st.steps.filter(x => x.needs.length);
        const n = missing.reduce((k, x) => k + x.needs.length, 0);
        if (!st.started) add({ key: `kimlik_eksik:${b.id}:kurulmadi`, kind: 'kimlik_eksik', priority: 'orta', date: isoDay(t), title: 'Marka kimliği kurulmadı',
          text: 'Birkaç soruyla marka, kitle, ses ve görsel kimlik tanımlanır; üretimler buna göre yapılır. Elle doldurulur, yapay zekâ isteğe bağlı.', action: { label: 'Kuruluma başla', href: `${base}/kimlik/kurulum` } });
        else if (n) add({ key: `kimlik_eksik:${b.id}:${n}`, kind: 'kimlik_eksik', priority: missing.some(x => x.id === 'temel') ? 'orta' : 'dusuk', date: isoDay(t), title: `Marka kimliğinde ${n} eksik bilgi`,
          text: missing.slice(0, 3).map(x => `${x.label}: ${x.needs.slice(0, 3).join(', ')}`).join(' · ') + (missing.length > 3 ? ` ve ${missing.length - 3} bölüm daha` : ''),
          action: { label: 'Eksikleri tamamla', href: `${base}/kimlik/kurulum/${missing[0].id}` } });
      }
    }
    // 6e) Performansı düşen içerik türü: son 30 günün ortalama etkileşimi, önceki 60 günün en az %30 altında (her iki
    //     dönemde en az 2 ölçüm)
    const rated = rows.filter(r => r.metrics && r.scheduled_at && r.scheduled_at < now).map(r => ({ ...r, rate: engagementRate(parseJson(r.metrics, null)) })).filter(r => r.rate != null);
    const avg = list => (list.length ? list.reduce((n, r) => n + r.rate, 0) / list.length : null);
    const d30 = new Date(t - 30 * DAY).toISOString(); const d90 = new Date(t - 90 * DAY).toISOString();
    for (const type of [...new Set(rated.map(r => r.type))]) {
      const recent = rated.filter(r => r.type === type && r.scheduled_at >= d30);
      const before = rated.filter(r => r.type === type && r.scheduled_at < d30 && r.scheduled_at >= d90);
      if (recent.length < 2 || before.length < 2) continue;
      const a = avg(recent); const p = avg(before);
      if (p > 0 && a <= p * 0.7) add({ key: `tur_dustu:${b.id}:${type}:${weekKey(t)}`, kind: 'tur_dustu', priority: 'orta', date: isoDay(t), title: `${CONTENT_TYPES[type] || type} etkileşimi düştü`,
        text: `Son 30 gün ortalama %${pct(a)} (önceki 60 gün %${pct(p)}). Giriş cümlesini, temayı ya da paylaşım saatini değiştir; Analizler'de en çok tutanlara bak.`,
        action: { label: 'Analizleri aç', href: `${base}/analiz` } });
    }
    // 6f) Gelecek hafta önerisi (haftalık, bilgi): kaç içerik, hangi türler (son 90 günün en çok tutanları), hangi sütunlar
    //     (hedef payın altında kalanlar). Yeterli veri yoksa çıkmaz.
    {
      const by = {};
      rated.filter(r => r.scheduled_at >= d90).forEach(r => { (by[r.type] = by[r.type] || []).push(r); });
      const bestTypes = Object.entries(by).filter(([, l]) => l.length >= 2).map(([k, l]) => [k, avg(l)]).sort((x, y) => y[1] - x[1]).slice(0, 2);
      const recent28 = rows.filter(r => r.scheduled_at && r.scheduled_at >= new Date(t - 28 * DAY).toISOString() && r.scheduled_at < now).length;
      const count = weekly || Math.max(1, Math.round(recent28 / 4));
      const pil = db.prepare('SELECT id, name, share FROM brand_pillars WHERE brand_id = ? AND share > 0').all(b.id);
      const p30 = rows.filter(r => r.pillar_id && (r.scheduled_at || r.created_at) >= d30);
      const lagging = pil.filter(p => (p30.length ? p30.filter(r => r.pillar_id === p.id).length / p30.length * 100 : 0) < p.share).sort((x, y) => y.share - x.share).slice(0, 2);
      if ((bestTypes.length || lagging.length) && (recent28 || weekly)) {
        add({ key: `hafta_plani:${b.id}:${weekKey(t + 7 * DAY)}`, kind: 'hafta_plani', priority: 'dusuk', date: isoDay(t), title: `Gelecek hafta: ${count} içerik`,
          text: [bestTypes.length ? `En çok tutan türler: ${bestTypes.map(([k, v]) => `${CONTENT_TYPES[k] || k} (%${pct(v)})`).join(', ')}` : null,
            lagging.length ? `Geride kalan sütunlar: ${lagging.map(p => `${p.name} (hedef %${p.share})`).join(', ')}` : null].filter(Boolean).join(' · ') + '.',
          action: { label: 'Haftayı planla', href: `${base}/takvim` } });
      }
    }
    // 7) Hafızada onay bekleyen bilgi kartları (siteden, yapay zekâdan gelenler): onaylanmadan üretime girmez
    const pend = db.prepare("SELECT COUNT(*) AS n FROM brand_facts WHERE brand_id = ? AND status = 'oneri'").get(b.id).n;
    if (pend) add({ key: `hafiza_onay:${b.id}:${pend}`, kind: 'hafiza_onay', priority: 'orta', date: isoDay(t), title: `${pend} bilgi onay bekliyor`,
      text: 'Web sitesinden ya da yapay zekâdan gelen bilgiler sen onaylamadan üretimlerde kullanılmaz.', action: { label: 'Gözden geçir', href: `${base}/kimlik/ses` } });
    // 8) Önemli özel gün (7 gün içinde) ve o gün markanın planlı içeriği yok
    for (const d of specialDays(isoDay(t), isoDay(t + 7 * DAY), { brands: [b] }).filter(x => x.importance === 'yuksek' && x.category !== 'anma' && !x.end)) {
      if (rows.some(r => r.scheduled_at && r.scheduled_at.slice(0, 10) === d.date)) continue;
      const left = Math.round((Date.parse(d.date + 'T12:00:00Z') - t) / DAY);
      add({ key: `ozel_gun:${b.id}:${d.date}:${d.name}`, kind: 'ozel_gun', priority: left <= 2 ? 'yuksek' : 'orta', date: d.date, title: `${d.name} ${left <= 0 ? 'bugün' : `${left} gün sonra`}`,
        text: 'O gün için planlı içerik yok.', action: { label: 'Takvime planla', href: `${base}/takvim` } });
    }
    return out;
  }

  return {
    kinds: INSIGHT_KINDS,
    list({ brandId = null, now = Date.now() } = {}) {
      const list = brandId ? [brands.get(brandId)] : brands.list().filter(b => !b.isDemo);
      const hide = dismissed();
      const t = typeof now === 'number' ? now : Date.parse(now);
      return list.flatMap(b => forBrand(b, t))
        .filter(i => !(hide[i.key] && Date.parse(hide[i.key]) > t))
        .map(i => Object.assign(i, { kindLabel: INSIGHT_KINDS[i.kind] }))
        .sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || String(a.date).localeCompare(String(b.date)));
    },
    // Gizle: varsayılan 7 gün (en çok 60); süresi geçen kayıtlar temizlenir
    dismiss(key, days = 7) {
      const k = String(key || '').slice(0, 200);
      if (!k) throw badRequest('Uyarı anahtarı gerekli.');
      const d = Math.max(1, Math.min(60, Math.round(Number(days) || 7)));
      const t = Date.now();
      const keep = Object.fromEntries(Object.entries(dismissed()).filter(([, until]) => Date.parse(until) > t).slice(-500));
      keep[k] = new Date(t + d * DAY).toISOString();
      settings.set('insights.dismissed', JSON.stringify(keep));
      return { key: k, until: keep[k] };
    }
  };
}
