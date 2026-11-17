# Çoklu yapay zekâ API platformu: değerlendirme ve karar

Tarih: Kasım 2026. Bu bir karar raporudur; kod değişikliği içermez.

## Kaynaklar hakkında not

Bu çalışma ortamından platformların sitelerine (openrouter.ai, vercel.com, edenai.co, together.ai) doğrudan erişim kapalı. Bilgiler web aramasıyla toplandı: Vercel, Eden AI ve Together için resmî dokümantasyon sayfaları arama sonuçlarında göründü; OpenRouter, CometAPI ve Flatkey için çoğunlukla üçüncü taraf sayfalar çıktı. Fiyatlar sık değişir. Aşağıdaki rakamları ödeme yapmadan önce platformun kendi fiyat sayfasında kontrol et.

## Mevcut sistemde zaten olanlar

İstediğin mimari ("tek sağlayıcı, tek anahtar, birden çok model, merkezi AI katmanı") büyük ölçüde hazır:

- **Merkezi AI katmanı:** server/services/ai/index.js. Bütün üretimler buradan geçer (`ai.run`).
- **OpenRouter bağlantısı:** OpenAI uyumlu sağlayıcı olarak tanımlı (server/services/ai/index.js, `openrouter`). Anahtar Yapay zekâ → Sağlayıcılar ekranından tek yerde saklanır, istemciye gönderilmez.
- **İşe göre model:** Metin yazımı, fikir, çeviri, denetim gibi her iş için ayrı model ve yedek model atanır (Yapay zekâ → Modeller).
- **Bütçe sınırı:** Aylık dolar sınırı ve uyarı yüzdesi; sınır dolunca yeni istek durdurulur (`AI_BUDGET`).
- **Maliyet takibi:** Her istek modele ve işe göre kaydedilir; aylık harcama ekranı var.
- **OpenRouter'dan görsel üretimi** de destekleniyor.

Yani sağlayıcı seçimi kodun büyük bir kısmını değiştirmeyi gerektirmiyor.

## Platformların karşılaştırması

| Platform | GPT / Claude / Gemini / DeepSeek | Ödeme modeli | Ücret | Ücretsiz seçenek | Değerlendirme |
|---|---|---|---|---|---|
| **OpenRouter** | Hepsi + Llama, Qwen, Mistral vb. | Ön ödemeli kredi (abonelik yok) | Model fiyatı sağlayıcının liste fiyatı; kredi alırken %5,5 (en az 0,80 $) | Ücretsiz modeller: dakikada 20 istek; 10 $ kredi alınana kadar günde 50, sonra günde 1.000 istek | En geniş model yelpazesi, OpenAI uyumlu, sistemde zaten bağlı |
| **Vercel AI Gateway** | Hepsi | Ön ödemeli kredi + aylık ücretsiz kredi | Token'da ek ücret yok (liste fiyatı) | Aylık ücretsiz kredi var ama yalnızca bazı modellerde; kredi satın alınca ücretsiz kredi biter | Ücretsiz ve ek ücretsiz; Vercel hesabı gerekir. İyi bir yedek seçenek |
| **Eden AI** | Hepsi (ayrıca OCR, çeviri, ses gibi başka AI hizmetleri) | Kullandıkça öde, abonelik yok | Kredi alırken %5,5 | Belirgin bir ücretsiz model kotası yok | OpenRouter'a göre avantajı yok; LLM dışı hizmetler gerekirse anlamlı |
| **Together AI** | GPT, Claude ve Gemini **yok**; açık modeller (Llama, DeepSeek, Qwen) | Ön ödemeli, en az 5 $ | Model başına token fiyatı | Ücretsiz deneme yok | Tek başına ihtiyacını karşılamaz, elendi |
| **CometAPI** | Hepsi (kendi beyanı) | Ön ödemeli, aylık ücret yok | Resmî fiyatların altında olduğunu söylüyor | Belirsiz | Bir aracı satıcı; fiyat ve model adları kaynaklar arasında tutarsız. Ticari üründe tedarik riski |
| **Flatkey** | Belirsiz | Ön ödemeli (kaynaklar çelişiyor) | %40-50 indirim iddiası | İlk yüklemede bonus iddiası | Resmî fiyat sayfası bulunamadı; bilgiler çelişkili. Önermem |

Aylık sabit paket (abonelik) sunan bir LLM ağ geçidi bu listede yok: hepsi **ön ödemeli kredi**. Kredi biter, istek durur; ay başında otomatik ücret çekilmez (otomatik yükleme açmadıkça).

Benzer başka seçenekler: Cloudflare AI Gateway ve LiteLLM (kendi sunucunda) her sağlayıcı için **ayrı anahtar** ister, yani "tek anahtar" isteğine uymaz.

## 10 $/ay ile ne kadar üretim?

Kaba hesap (fiyatlar modele ve tarihe göre değişir; OpenRouter'da her modelin fiyatı kendi sayfasında yazar):

- %5,5 ücretten sonra 10 $'ın yaklaşık **9,4-9,5 $'ı** model kullanımına gider.
- Bir post metni ya da prompt yaklaşık 2.000 token giriş ve 800 token çıkış tutar.
- **DeepSeek ya da Gemini Flash gibi ucuz modeller:** istek başına 0,001-0,003 $ civarı. 10 $ ile **birkaç bin** üretim.
- **Claude Sonnet / GPT sınıfı güçlü modeller:** istek başına yaklaşık 0,01-0,02 $. 10 $ ile **500-900** üretim.
- **Görsel üretimi** metinden çok daha pahalıdır. Görsel başına kabaca birkaç sent, bütçenin en hızlı biten kısmı burasıdır.
- Uzun kural şablonlu sahneli video prompt'ları (4.000 karakterlik şablon × birkaç sahne) istek başına birkaç kat daha fazla token yer.

## Karar

1. **Platform: OpenRouter.**
2. **OpenRouter ile devam et.** Hesap açtığın için değil, şu nedenlerle:
   - GPT, Claude, Gemini, DeepSeek ve Llama tek anahtarla, tek hesapta.
   - Sistemde zaten bağlı; ek entegrasyon, ek abonelik yok.
   - OpenAI uyumlu: model değiştirmek, model adını değiştirmek kadar kolay. İleride Vercel AI Gateway gibi başka bir OpenAI uyumlu ağ geçidine geçmek de yalnızca adres ve anahtar değişikliği demek; sistemi yeniden yazman gerekmez.
   - Ücretsiz modeller deneme ve basit işler için ek pay sağlar (10 $ yükleyince günde 1.000 istek).
3. **Dezavantajları (tarafsız):**
   - Kredi alırken %5,5 ücret var (Vercel AI Gateway'de bu yok).
   - Araya bir aracı girer: OpenRouter kesintisi bütün modelleri etkiler; ayrıca istek sağlayıcıya OpenRouter üzerinden gider. Gizlilik için OpenRouter ayarlarında veri saklama/eğitim izni vermeyen sağlayıcılarla sınırlamayı aç.
   - Ücretsiz modeller her an listeden kalkabilir; üretimin ana yükünü onlara bindirme.
4. **Alternatif:** Ücret kalemi önemliyse Vercel AI Gateway en mantıklı yedek; sistem OpenAI uyumlu olduğu için ileride geçiş kolay.

## Hangi işte hangi model (ilk etap)

Sistemdeki "Yapay zekâ → Modeller" ekranından atanır:

| İş | Birincil | Yedek | Neden |
|---|---|---|---|
| Post metni, şablon doldurma (en sık iş) | DeepSeek (güncel sohbet modeli) | Gemini Flash | Ucuz ve Türkçede yeterli; şablonla üretimde yalnızca kısa metin yazılıyor |
| İçerik fikri, benzer fikir, toplu ayıklama | Gemini Flash | DeepSeek | Hızlı, ucuz |
| Kural şablonlu uzun video/sahne prompt'u | Claude Sonnet | GPT (orta sınıf) | Uzun yapıya birebir uymakta daha güvenilir |
| Referans görsel analizi, görsel okuma | Gemini Flash (görsel destekli) | Claude Sonnet | Görseli okuyan ucuz model |
| Çeviri, denetim | Gemini Flash | DeepSeek | Basit iş |
| Görsel üretimi | Gerektiğinde Gemini görsel modeli | - | Bütçenin en pahalı kalemi; tek tek kullan |

Bu dağılımla 10 $'ın büyük kısmı ucuz modellerde harcanır, güçlü modeller yalnızca gereken işte çalışır.

## Entegrasyon adımları (onaydan sonra)

Kod gerektirmeyenler (hemen yapılabilir):

1. Yapay zekâ → Sağlayıcılar: OpenRouter anahtarını gir, "Bağlantıyı dene" ile doğrula.
2. Diğer sağlayıcı anahtarlarını (Gemini, OpenAI, Anthropic) boş bırak ya da kaldır; böylece tek anahtar kalır.
3. Yapay zekâ → Harcama: aylık sınırı **10 $**, uyarıyı **%80** yap.
4. Yapay zekâ → Modeller: yukarıdaki tabloya göre her işe birincil ve yedek model ata.
5. OpenRouter hesabında: otomatik yüklemeyi kapalı tut, kendi tarafında da 10 $ harcama sınırı (anahtar limiti) koy; gizlilik ayarında veri eğitimine izin veren sağlayıcıları kapat.

Önerdiğim küçük kod iyileştirmeleri (onay gelirse):

- **"Yalnızca OpenRouter" modu:** Model listesinde yalnızca OpenRouter modellerini göster, diğer sağlayıcıları gizle.
- **Gerçek bakiye:** OpenRouter'ın kendi kalan kredi bilgisini harcama ekranında göster (şu an sistem harcamayı kendi kayıtlarından hesaplıyor).
- **İstek başına üst sınır:** OpenRouter'a giden isteklerde en fazla çıktı token'ı belirle; bir isteğin kontrolsüz pahalı olmasını engeller.
- **Yedek modelleri OpenRouter'a bırakma:** OpenRouter'ın birden çok model sıralamasını tek istekte gönderme özelliği var. Bunu ayrıca araştırıp gerekirse ekleriz.

## Kaynaklar

- [OpenRouter fiyatlandırma özeti (TrueFoundry)](https://www.truefoundry.com/blog/openrouter-pricing)
- [OpenRouter Pricing 2026 (dupple)](https://dupple.com/learn/openrouter-pricing)
- [OpenRouter ücretsiz modeller (benchlm)](https://benchlm.ai/md/free-tier/openrouter.md)
- [Vercel AI Gateway fiyatlandırma (resmî)](https://vercel.com/docs/ai-gateway/pricing)
- [Vercel AI Gateway SSS (resmî)](https://vercel.com/docs/ai-gateway/faq)
- [Eden AI fiyatlandırma (resmî)](https://www.edenai.co/pricing.md)
- [Eden AI planlar ve fiyatlar (resmî doküman)](https://www.edenai.co/docs/v3/overview/plans-prices)
- [Together AI hesap ve faturalandırma (resmî)](https://docs.together.ai/docs/get-started)
- [Together AI fiyatlandırma (resmî doküman)](https://docs.together.ai/docs/inference/pricing)
- [CometAPI nedir (kendi blogu)](https://www.cometapi.com/what-is-cometapi-and-how-to-use-it-immediately/)
- [Flatkey (üçüncü taraf listeleme)](https://www.tooljunction.io/ai-tools/flatkey)
