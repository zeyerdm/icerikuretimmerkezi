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

export function demoAssetBuffer(file) {
  return fs.readFileSync(path.join(DIR, file));
}
