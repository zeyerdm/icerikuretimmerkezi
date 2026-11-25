# Proje ana talimatı: İçerik Üretim ve Yönetim Merkezi (KREATİFHANE)

Bu belge bütün geliştirme süreci boyunca geçerlidir. Yeni bir oturum ya da geliştirici işe başlamadan önce bunu okur.
Yapılacaklar ve durumları: [YAPILACAKLAR.md](YAPILACAKLAR.md).

## Amaç

Birden fazla markanın sosyal medya içerik üretimini, tasarım süreçlerini, içerik takvimlerini, performans analizlerini ve
müşteri ilişkilerini tek merkezden yöneten; yapay zekâ destekli, sade, akıllı ve mümkün olduğunca otonom bir platform.
Yalnızca içerik üreten bir araç değil: markaların içerik operasyonunu yöneten, tekrar eden işi azaltan ve ihtiyaçları
önceden fark eden bir sistem.

## Değişmez kurallar

1. Çalışan özellikler korunur; çalışan sistem gereksiz yere yeniden yazılmaz.
2. DevOrtak sistemine (kaynak depo ve çalışan proje) kesinlikle müdahale edilmez. Bu proje bağımsız kalır.
3. DevOrtak'a, mevcut markalara ya da özel marka verilerine ait bilgi (marka bilgisi, içerik, prompt, görsel, API anahtarı,
   kişisel yapılandırma) bu sisteme sabit olarak gömülmez.
4. Önce merkezi yönetim paneli, ardından her marka için birbirinden bağımsız çalışma alanı.
5. Her markanın renkleri, kimliği, içerik dili, hedef kitlesi ve tercihleri özelleştirilebilir.
6. Aynı bilgi farklı ekranlarda tekrar tekrar girilmez (tek bilgi kaynağı).
7. Yapay zekâ asistanı gereksiz soru sormaz, her işlemde baştan bilgi toplamaz.
8. Rutin ve kuralı belli işler arka uçta (backend) otomatik yapılır.
9. Yapay zekâ yalnız gerçekten zekâ ve yorum gerektiren işlerde kullanılır.
10. Kritik işlemler, yayınlama ve ücretli yapay zekâ kullanımı açık kullanıcı onayı olmadan yapılmaz.
11. Geliştirmeler mevcut teknoloji yığınına uyar: Node 22+, Express 5, node:sqlite, sade ES modülleri (çerçeve yok),
    CSP `script-src 'self'`.
12. Büyük dosyalar ve teknik borç kontrollü ele alınır; sırf dosya büyük diye çalışan kod topluca yeniden yazılmaz.
13. Her değişiklikte geriye dönük uyumluluk ve veri kaybı riski değerlendirilir. Şema değişikliği yalnız göçle (migration;
    `server/db.js`, `PRAGMA user_version`) yapılır, veri silinmez.
14. Her aşamada test, belge ve değişiklik raporu.

Ek güvenlik kuralları: API anahtarları yalnız sunucuda (şifreli) tutulur, istemciye gönderilmez; görsel/yapay zekâ API'si
bağlı değilse üretim yapıyormuş gibi davranılmaz; işlevi olmayan düğme bırakılmaz; AGPL kod alınmaz; marka bazlı veri
yalıtımı korunur.

## Çalışma yöntemi

- Her aşama önce **analiz** (dosya ve satır referanslı tespit, öneri, risk, bağımlılık), sonra **onay**, sonra **uygulama**.
- Uygulama küçük ve güvenli adımlarla: her adım ayrı dal/PR, testler yazılır, `npm test` ve `npm run lint` yerelde geçer;
  GitHub'da Linux ve Windows CI yeşil olmadan `main`'e alınmaz (squash). Başarısız test gizlenmez, atlanmaz.
- Her adımın sonunda: değiştirilen dosyalar, bilinen sorunlar ve geri alma yolu (PR'ın geri alınması; şema değişikliğinde
  eklenen sütun/tablo boş kalır, eski kod etkilenmez) PR açıklamasında yazılır.

### Kullanıcı uzaktayken (otonom çalışma, 25 Kasım 2026'da kararlaştırıldı)

Kullanıcı bilgisayarı açık bırakıp gittiğinde ajan sıradaki işlere devam eder ve yalnız şu noktalarda yazar/bekler:

| Kendi başına yapar (sonra raporlar) | Onay bekler (toplu sorar, bu arada başka işe geçer) |
|---|---|
| Belgeler ve analiz raporları | Veritabanı şemasını değiştiren tasarımlar (yeni tablo/alan) |
| Mevcut davranışı koruyan düzeltmeler (test sağlamlığı, güvenlik sıkılaştırması, performans) | Bir özelliği kaldırmak, birleştirmek ya da yerini değiştirmek |
| Yalnız ekleme yapan, veri silmeyen küçük iyileştirmeler | Ücretli yapay zekâ kullanan otomatik işler |
| Hata düzeltmeleri | Ürün kararları (bekleyen kararlar listesi) |

## Gelecek modüller

Akıllı içerik stratejisti, müşteri portalı, rakip ve sektör takipçisi, yapay zekâ video editörü, akıllı içerik arşivi ve
görsel otomasyon oluşturucu mevcut sprintlerin dışındadır; ayrı yol haritasında değerlendirilir
([YAPILACAKLAR.md](YAPILACAKLAR.md) → Aşama 08).
