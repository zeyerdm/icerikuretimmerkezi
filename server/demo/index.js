// Örnek marka: uygulamanın nasıl kullanıldığını göstermek için tamamen kurgusal bir kafe.
// Gerçek bir markaya ait veri içermez; tek tıkla eklenir, istenince normal bir marka gibi silinir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export const DEMO_BRAND = {
  name: 'Kahve Durağı',
  sector: 'Kafe / üçüncü dalga kahve',
  description: 'Üniversite kampüslerinin yanında, ders arasında uğranan küçük ve samimi bir kahve dükkânı. Taze çekilmiş kahve, uygun fiyatlı öğrenci menüsü ve sakin ders çalışma köşeleri.',
  audience: '18-25 yaş üniversite öğrencileri; sınav haftalarında uzun saatler çalışan, bütçesini düşünen, Instagram ve Reels kullanan, arkadaşlarıyla mekân keşfetmeyi seven gençler.',
  character: 'Kampüsteki en sevilen abla/abi gibi: samimi, esprili, biraz uykusuz ama her zaman enerjik. Öğrencinin halinden anlar, kendisiyle dalga geçebilir.',
  tone: 'Sen diliyle, kısa ve samimi cümleler. Hafif esprili, öğrenci hayatına göndermeler (sınav, vize, final, ders arası). Asla kurumsal ve resmi değil; emoji az ve yerinde.',
  goals: 'Kampüste bilinirlik, sınav haftalarında öğrenci menüsü satışlarını artırmak, takipçilerle etkileşim (anket, soru) ve sadık bir topluluk kurmak.',
  competitors: 'Büyük kahve zincirleri (daha pahalı, daha kalabalık) ve kampüs kantini (daha ucuz ama kahvesi vasat). İlham: samimi dille konuşan küçük butik kafeler.',
  slogan: 'Her yudum bir mola',
  colors: { primary: '#c2410c', secondary: ['#fbbf24', '#7c3f1d', '#1f2937'], backgrounds: ['#fff7ed', '#ffffff'], heading: '#1f2937', body: '#44403c' },
  fonts: { heading: 'Poppins', body: 'Inter' }
};

export const DEMO_ASSETS = [
  { file: 'logo.png', category: 'logo', label: 'Ana logo' },
  { file: 'maskot-mutlu.png', category: 'mascot', label: 'Çekirdek - Mutlu' },
  { file: 'maskot-saskin.png', category: 'mascot', label: 'Çekirdek - Şaşkın' },
  { file: 'maskot-goz-kirpan.png', category: 'mascot', label: 'Çekirdek - Göz kırpan' },
  { file: 'arka-plan.png', category: 'background', label: 'Sıcak krem zemin' }
];

export const DEMO_IDEAS = [
  { title: 'Final haftası hayatta kalma kiti', description: 'Sınav haftasında çalışırken iyi gelen 5 küçük alışkanlık; sonunda öğrenci menüsü hatırlatması.', category: 'egitici', favorite: true },
  { title: '"Sen hangi kahvesin?" kişilik testi', description: 'Hikâyede 4 seçenekli anket: sabah 8 dersi = filtre kahve, gece çalışan = double espresso…', category: 'eglenceli', favorite: true },
  { title: 'Barista ipucu: evde süt köpürtme', description: '15 saniyelik pratik video; kaydedilme oranı yüksek bir bilgi içeriği.', category: 'bilgilendirici', favorite: false },
  { title: 'Vize haftası öğrenci menüsü %20 indirim', description: 'Öğrenci kartıyla geçerli kampanya duyurusu; son gün geri sayımıyla.', category: 'satis', favorite: false },
  { title: 'Bir günümüz: dükkân açılmadan önce', description: 'Sabah 07:00 hazırlıklarının hızlı kurgusu; markanın samimi yüzünü gösterir.', category: 'bilinirlik', favorite: false },
  { title: 'Dünya Kahve Günü: bedava kurabiye', description: '1 Ekim için özel gün paylaşımı; her kahvenin yanında kurabiye.', category: 'ozel_gun', favorite: false }
];

// Takvim içerikleri: bugünden göreli gün ve saat (geçmiştekiler tamamlanmış/yayınlanmış)
export const DEMO_CONTENTS = [
  { day: -6, hour: 12, title: 'Barista ipucu: evde süt köpürtme', type: 'reels', status: 'yayinlandi' },
  { day: -4, hour: 18, title: 'Sabah sen hangi kahvesin? anketi', type: 'story', status: 'yayinlandi' },
  { day: -2, hour: 10, title: 'Final haftası hayatta kalma kiti', type: 'carousel', status: 'tamamlandi' },
  { day: 0, hour: 16, title: 'Bir günümüz: dükkân açılmadan önce', type: 'reels', status: 'hazirlaniyor' },
  { day: 2, hour: 12, title: 'Vize haftası öğrenci menüsü %20 indirim', type: 'post', status: 'taslak' },
  { day: 5, hour: 19, title: 'Gece kütüphanesi kahvesi', type: 'story', status: 'taslak' },
  { day: 9, hour: 11, title: 'Dünya Kahve Günü: bedava kurabiye', type: 'reklam', status: 'taslak' }
];

export const DEMO_TASKS = [
  { title: 'Vize kampanyası görsellerini hazırla', description: 'Post ve story için iki ölçü.', day: 1, priority: 'yuksek', status: 'devam' },
  { title: 'Dükkân açılış videosunu çek', description: 'Sabah 07:00, dikey çekim.', day: 3, priority: 'orta', status: 'yapilacak' },
  { title: 'Kahve Günü için kurabiye tedarikçisiyle konuş', description: '', day: 7, priority: 'dusuk', status: 'yapilacak' },
  { title: 'Barista ipucu videosunu yayınla', description: '', day: -6, priority: 'orta', status: 'tamamlandi' }
];

export const DEMO_NOTES = [
  { title: 'Marka sesi', body: 'Sen diliyle, kısa ve samimi. Sınav/vize/final göndermeleri tutuyor. Emoji az ve yerinde. Asla kurumsal değil.', category: 'Marka', pinned: true },
  { title: 'En çok etkileşim', body: 'Anketli story\'ler ve 15 saniyelik pratik Reels videoları en çok kaydedilen içerikler.', category: 'Analiz', pinned: false }
];

export function demoAssetBuffer(file) {
  return fs.readFileSync(path.join(DIR, file));
}
