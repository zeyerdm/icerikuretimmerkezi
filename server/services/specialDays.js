// Türkiye'nin özel günleri ve dönemleri (içerik planlama için). Sabit tarihli günler her yıl için üretilir;
// "ayın n. pazarı" gibi günler hesaplanır; dini bayramlar ay takvimine bağlı olduğu için yıl yıl tabloda tutulur
// (Diyanet takvimine göre; tablo dışındaki yıllar için bayram gösterilmez, uydurulmaz).
export const DAY_CATEGORIES = { resmi: 'Resmî / millî', anma: 'Anma günü', dini: 'Dinî', ticari: 'Ticari', sektor: 'Markana özel', dunya: 'Dünya günü', donem: 'Dönem' };
export const IMPORTANCE = { yuksek: 'Çok önemli', orta: 'Önemli', dusuk: 'Bilgi' };
// Çok önemli günler (adla); anma günlerinde ticari içerik paylaşılmaz
const MAJOR = new Set(['Yılbaşı', 'Sevgililer Günü', 'Ulusal Egemenlik ve Çocuk Bayramı', "Atatürk'ü Anma, Gençlik ve Spor Bayramı", 'Zafer Bayramı', 'Cumhuriyet Bayramı', 'Öğretmenler Günü', 'Anneler Günü', 'Babalar Günü', 'Black Friday (Efsane Cuma)', 'Ramazan Bayramı', 'Kurban Bayramı', 'Yılbaşı Gecesi']);
const MOURNING = new Set(["Atatürk'ü Anma Günü", 'Demokrasi ve Millî Birlik Günü']);

// Sektöre özel günler: markanın sektörü / açıklaması bu kelimelerden birini içeriyorsa takvimde "Markana özel" görünür.
// date: 'AA-GG' ya da (y) => 'YYYY-AA-GG'; end: dönem bitişi
const SECTORS = [
  { id: 'teknoloji', label: 'Yazılım ve teknoloji', words: ['yazilim', 'software', 'teknoloji', 'bilisim', 'kod', 'developer', 'gelistirici', 'siber', 'saas', 'uygulama', 'web', 'dijital', 'yapay zeka', 'ai ', 'startup', 'girisim', 'devops', 'veri'],
    days: [
      ['01-28', 'Veri Gizliliği Günü', 'Kullanıcı verisini nasıl koruduğunuzu anlatın; gizlilik ipuçları'],
      [y => nthWeekday(y, 2, 2, 2), 'Güvenli İnternet Günü', 'Güvenli internet kullanımı ipuçları, aileler ve gençler için rehber'],
      ['03-14', 'Pi Günü', 'Matematik/algoritma esprisi, mühendislik kültürü'],
      ['03-31', 'Dünya Yedekleme Günü', '"Yedeğini aldın mı?" hatırlatması, yedekleme ipuçları'],
      [y => nthWeekday(y, 5, 4, 1), 'Dünya Şifre Günü', 'Güçlü şifre ve iki adımlı doğrulama ipuçları'],
      ['05-04', 'May the 4th (Bilim kurgu günü)', 'Ekipten bilim kurgu esprileri, eğlenceli paylaşım'],
      ['05-17', 'Dünya Telekomünikasyon ve Bilgi Toplumu Günü', 'Dijital dönüşüm, erişilebilirlik'],
      [y => key(new Date(y, 0, 256, 12)), 'Programcılar Günü', 'Yılın 256. günü: geliştiricilere teşekkür, ekip tanıtımı, kod esprileri'],
      ['10-01', 'Siber Güvenlik Farkındalık Ayı ve Hacktoberfest', 'Ay boyunca güvenlik ipuçları serisi; açık kaynak katkıları', y => `${y}-10-31`],
      [y => nthWeekday(y, 10, 2, 2), 'Ada Lovelace Günü', 'Teknolojide kadınlar; ilham veren hikâyeler'],
      ['11-30', 'Bilgisayar Güvenliği Günü', 'Güvenlik kontrol listesi, kullanıcılara hatırlatma'],
      ['12-09', 'Bilgisayar Bilimi Eğitim Haftası', 'Kodlamaya giriş içerikleri, öğrencilere kaynak önerisi', y => `${y}-12-15`]
    ] },
  { id: 'egitim', label: 'Eğitim', words: ['egitim', 'okul', 'kurs', 'universite', 'ogrenci', 'akademi', 'ders', 'dershane', 'kolej', 'ogretmen'],
    days: [
      ['01-24', 'Uluslararası Eğitim Günü', 'Eğitimin değeri, öğrenci başarı hikâyeleri'],
      ['09-08', 'Dünya Okuma Yazma Günü', 'Okuma alışkanlığı, kitap önerileri'],
      ['10-05', 'Dünya Öğretmenler Günü', 'Eğitmen ekibini tanıtın, teşekkür paylaşımı']
    ] },
  { id: 'yemek', label: 'Kahve, yiyecek ve içecek', words: ['kahve', 'kafe', 'cafe', 'restoran', 'yemek', 'gida', 'pastane', 'firin', 'lokanta', 'mutfak', 'icecek', 'cay'],
    days: [
      ['02-09', 'Dünya Pizza Günü', 'Menüden öne çıkan lezzet, kampanya'],
      ['10-01', 'Dünya Kahve Günü', 'Kahve kültürü, günün kahvesi, kampanya'],
      ['10-16', 'Dünya Gıda Günü', 'Yerel üretici, israfı önleme'],
      ['12-05', 'Dünya Türk Kahvesi Günü', 'Türk kahvesi geleneği, fal esprisi, ikram kampanyası']
    ] },
  { id: 'saglik', label: 'Sağlık ve spor', words: ['saglik', 'klinik', 'hastane', 'eczane', 'doktor', 'dis ', 'fitness', 'spor', 'diyet', 'beslenme', 'pilates', 'yoga'],
    days: [
      ['04-06', 'Uluslararası Spor Günü', 'Hareket çağrısı, mini antrenman'],
      ['04-07', 'Dünya Sağlık Günü', 'Sağlıklı yaşam ipuçları'],
      ['06-21', 'Dünya Yoga Günü', 'Kısa esneme rutini, ders duyurusu']
    ] },
  { id: 'hayvan', label: 'Evcil hayvan', words: ['pet', 'veteriner', 'hayvan', 'mama', 'kedi', 'kopek'],
    days: [['08-08', 'Dünya Kedi Günü', 'Takipçilerin kedi fotoğrafları'], ['08-26', 'Dünya Köpek Günü', 'Sahiplendirme çağrısı'], ['10-04', 'Dünya Hayvanları Koruma Günü', 'Barınaklara destek, bakım ipuçları']] },
  { id: 'cevre', label: 'Çevre ve sürdürülebilirlik', words: ['cevre', 'surdurulebilir', 'organik', 'enerji', 'geri donusum', 'dogal', 'eko'],
    days: [['03-22', 'Dünya Su Günü', 'Su tasarrufu ipuçları'], ['04-22', 'Dünya Günü', 'Sürdürülebilirlik adımlarınız'], ['06-05', 'Dünya Çevre Günü', 'Çevre dostu uygulamalar']] },
  { id: 'kitap', label: 'Kitap ve yayın', words: ['kitap', 'yayin', 'kutuphane', 'kirtasiye'],
    days: [['04-23', 'Dünya Kitap ve Telif Hakları Günü', 'Kitap önerileri, okuma kampanyası']] },
  { id: 'eticaret', label: 'E-ticaret ve perakende', words: ['e-ticaret', 'eticaret', 'magaza', 'alisveris', 'perakende', 'butik', 'online satis', 'moda', 'giyim', 'kozmetik'],
    days: [['11-11', '11.11 İndirim Günü', 'Tek günlük indirim, geri sayım'], [y => addDays(lastWeekday(y, 11, 5), 3), 'Cyber Monday', 'Black Friday sonrası çevrim içi indirim']] }
];
const foldTr = s => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]);
// Markanın sektörüne uyan sektör listesi (sektör, açıklama ve hedef kitle metninden)
export function sectorsOf(brand) {
  const t = ` ${foldTr([brand && brand.sector, brand && brand.description, brand && brand.audience].filter(Boolean).join(' '))} `;
  return SECTORS.filter(x => x.words.some(w => t.includes(w)));
}


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
export function specialDays(from, to, { brands = [] } = {}) {
  const a = String(from).slice(0, 10);
  const b = String(to).slice(0, 10);
  const years = [];
  for (let y = Number(a.slice(0, 4)); y <= Number(b.slice(0, 4)); y++) years.push(y);
  const sector = [];
  for (const br of brands) for (const sec of sectorsOf(br)) for (const y of years) for (const [d, name, tip, end] of sec.days) {
    const date = typeof d === 'function' ? d(y) : `${y}-${d}`;
    const ex = sector.find(x => x.date === date && x.name === name);
    if (ex) { if (!ex.brands.includes(br.name)) ex.brands.push(br.name); continue; }
    sector.push({ date, ...(end ? { end: end(y) } : {}), name, category: 'sektor', tip, sector: sec.label, brands: [br.name] });
  }
  // Markanın sektörüne uyan genel günler (ör. kahve markasına Dünya Kahve Günü) tekrar edilmez: sektör kaydı öne geçer
  const general = years.flatMap(forYear).filter(g => !sector.some(x => x.date === g.date && x.name === g.name));
  return [...general, ...sector]
    .filter(d => (d.end || d.date) >= a && d.date <= b)
    .map(d => {
      if (MOURNING.has(d.name)) d.category = 'anma';
      const importance = d.category === 'sektor' || MAJOR.has(d.name) ? 'yuksek' : d.category === 'donem' ? 'dusuk' : 'orta';
      return Object.assign(d, { categoryLabel: DAY_CATEGORIES[d.category], importance, importanceLabel: IMPORTANCE[importance] });
    })
    .sort((x, y) => x.date.localeCompare(y.date) || (x.end ? 1 : 0) - (y.end ? 1 : 0));
}

// Asistan ve üretim istemleri için: önümüzdeki günlerdeki özel günler (dönemler hariç tutulmaz)
export function upcomingText(days = 45, now = new Date()) {
  const list = specialDays(key(now), key(new Date(now.getTime() + days * 86400000)));
  return list.map(d => `- ${d.date}${d.end ? ` – ${d.end}` : ''}: ${d.name} (${d.categoryLabel}) · ${d.tip}`).join('\n');
}
