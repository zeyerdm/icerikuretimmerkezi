// Türkiye'nin özel günleri ve dönemleri (içerik planlama için). Sabit tarihli günler her yıl için üretilir;
// "ayın n. pazarı" gibi günler hesaplanır; dini bayramlar ay takvimine bağlı olduğu için yıl yıl tabloda tutulur
// (Diyanet takvimine göre; tablo dışındaki yıllar için bayram gösterilmez, uydurulmaz).
export const DAY_CATEGORIES = { resmi: 'Resmî / millî', dini: 'Dinî', ticari: 'Ticari', dunya: 'Dünya günü', donem: 'Dönem' };

// [ay, gün, ad, kategori, içerik ipucu]
const FIXED = [
  [1, 1, 'Yılbaşı', 'resmi', 'Yeni yıl dilekleri, yılın özeti, yeni başlangıç kampanyası'],
  [2, 14, 'Sevgililer Günü', 'ticari', 'Çiftlere özel kampanya, hediye önerileri, "sevdiğini etiketle"'],
  [3, 8, 'Dünya Kadınlar Günü', 'dunya', 'Ekipteki/çevredeki kadınların hikâyeleri; indirim yerine anlamlı içerik'],
  [3, 21, 'Nevruz', 'resmi', 'Baharın gelişi, yenilenme teması'],
  [3, 14, 'Tıp Bayramı', 'resmi', 'Sağlık çalışanlarına teşekkür'],
  [4, 23, 'Ulusal Egemenlik ve Çocuk Bayramı', 'resmi', 'Çocuklara yönelik etkinlik, 23 Nisan kutlaması'],
  [5, 1, 'Emek ve Dayanışma Günü', 'resmi', 'Ekibe teşekkür, perde arkası'],
  [5, 19, "Atatürk'ü Anma, Gençlik ve Spor Bayramı", 'resmi', 'Gençlik, spor, öğrencilere özel içerik'],
  [7, 15, 'Demokrasi ve Millî Birlik Günü', 'resmi', 'Sade bir anma paylaşımı'],
  [8, 30, 'Zafer Bayramı', 'resmi', 'Kutlama paylaşımı'],
  [10, 1, 'Dünya Kahve Günü', 'dunya', 'Kahve kültürü, kampanya, kahve bilgisi'],
  [10, 29, 'Cumhuriyet Bayramı', 'resmi', 'Kutlama paylaşımı, kırmızı-beyaz tema'],
  [11, 10, "Atatürk'ü Anma Günü", 'resmi', 'Saygı ve anma; ticari içerik paylaşılmaz'],
  [11, 24, 'Öğretmenler Günü', 'resmi', 'Öğretmenlere teşekkür, "öğretmenini etiketle"'],
  [12, 31, 'Yılbaşı Gecesi', 'ticari', 'Yılbaşı hazırlığı, hediye, son gün kampanyası']
];

// Dini bayramlar ve Ramazan (Diyanet takvimine göre; arife hariç bayramın ilk günü ve süresi)
const LUNAR = {
  2025: { ramazan: '2025-03-01', ramazanBayrami: '2025-03-30', kurbanBayrami: '2025-06-06' },
  2026: { ramazan: '2026-02-19', ramazanBayrami: '2026-03-20', kurbanBayrami: '2026-05-27' },
  2027: { ramazan: '2027-02-08', ramazanBayrami: '2027-03-09', kurbanBayrami: '2027-05-16' },
  2028: { ramazan: '2028-01-28', ramazanBayrami: '2028-02-26', kurbanBayrami: '2028-05-05' }
};

const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return key(d); };
// Ayın n. haftanın günü (weekday: 0 pazar … 6 cumartesi)
function nthWeekday(year, month, weekday, n) {
  const d = new Date(year, month - 1, 1, 12);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7 * (n - 1));
  return key(d);
}
function lastWeekday(year, month, weekday) {
  const d = new Date(year, month, 0, 12);
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return key(d);
}

function forYear(y) {
  const out = FIXED.map(([m, d, name, category, tip]) => ({ date: `${y}-${pad(m)}-${pad(d)}`, name, category, tip }));
  out.push(
    { date: nthWeekday(y, 5, 0, 2), name: 'Anneler Günü', category: 'ticari', tip: 'Annelere hediye, "anneni etiketle", duygusal hikâye' },
    { date: nthWeekday(y, 6, 0, 3), name: 'Babalar Günü', category: 'ticari', tip: 'Babalara hediye önerisi, baba-çocuk anıları' },
    { date: lastWeekday(y, 11, 5), name: 'Black Friday (Efsane Cuma)', category: 'ticari', tip: 'İndirim duyurusu; önceden geri sayım' },
    { date: `${y}-09-01`, end: `${y}-09-30`, name: 'Okula dönüş dönemi', category: 'donem', tip: 'Öğrencilere özel kampanya, kampüs içerikleri' },
    { date: `${y}-11-10`, end: `${y}-11-30`, name: 'Üniversite vize dönemi', category: 'donem', tip: 'Ders çalışma molası, motivasyon, gece açık saatler' },
    { date: `${y}-01-05`, end: `${y}-01-25`, name: 'Üniversite final dönemi', category: 'donem', tip: 'Final haftası kampanyası, odaklanma ipuçları' },
    { date: `${y}-06-15`, end: `${y}-08-31`, name: 'Yaz sezonu', category: 'donem', tip: 'Soğuk içecekler, tatil, yaz menüsü' },
    { date: `${y}-12-01`, end: `${y}-12-31`, name: 'Yılbaşı alışveriş dönemi', category: 'donem', tip: 'Hediye rehberi, yılbaşı menüsü, geri sayım' }
  );
  const l = LUNAR[y];
  if (l) {
    out.push(
      { date: l.ramazan, end: addDays(l.ramazanBayrami, -1), name: 'Ramazan ayı', category: 'dini', tip: 'İftar/sahur saatleri, iftar menüsü, paylaşma teması' },
      { date: l.ramazanBayrami, end: addDays(l.ramazanBayrami, 2), name: 'Ramazan Bayramı', category: 'dini', tip: 'Bayram tebriği, bayram çalışma saatleri' },
      { date: l.kurbanBayrami, end: addDays(l.kurbanBayrami, 3), name: 'Kurban Bayramı', category: 'dini', tip: 'Bayram tebriği, tatil çalışma saatleri' }
    );
  }
  return out;
}

// [from, to] aralığına (YYYY-MM-DD, iki ucu dahil) değen günler; dönemler başlangıç-bitişleriyle
export function specialDays(from, to) {
  const a = String(from).slice(0, 10);
  const b = String(to).slice(0, 10);
  const years = [];
  for (let y = Number(a.slice(0, 4)); y <= Number(b.slice(0, 4)); y++) years.push(y);
  return years.flatMap(forYear)
    .filter(d => (d.end || d.date) >= a && d.date <= b)
    .map(d => Object.assign(d, { categoryLabel: DAY_CATEGORIES[d.category] }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

// Asistan ve üretim istemleri için: önümüzdeki günlerdeki özel günler (dönemler hariç tutulmaz)
export function upcomingText(days = 45, now = new Date()) {
  const list = specialDays(key(now), key(new Date(now.getTime() + days * 86400000)));
  return list.map(d => `- ${d.date}${d.end ? ` – ${d.end}` : ''}: ${d.name} (${d.categoryLabel}) · ${d.tip}`).join('\n');
}
