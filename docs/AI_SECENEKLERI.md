# Yapay zekâ seçenekleri ve maliyetleri (Aşama 2.1)

Kasım 2026 itibarıyla. **Claude fiyatları Anthropic'in yayımladığı fiyatlardır; diğerleri yaklaşıktır** (kaynaklar birbiriyle çelişiyor, sağlayıcılar sık değiştiriyor). Uygulamada Yapay zekâ → Harcama → Fiyatlar bölümünden düzeltilebilir; OpenRouter fiyatları canlı gelir.

## Metin (senaryo, fikir, açıklama, çeviri)

Fiyat: USD / 1 milyon token (girdi / çıktı). "Bir Reels senaryosu" ≈ 2.000 girdi + 1.500 çıktı token.

| Model | Sağlayıcı | Güçlü yanı | Fiyat | Bir Reels senaryosu ≈ |
|---|---|---|---|---|
| Claude Opus 5.5 | Anthropic | En özenli yazım, uzun senaryo, marka diline uyum | 4 / 20 | 0,038 $ |
| Claude Sonnet 5.5 | Anthropic | Kalite/fiyat dengesi | 2 / 10 | 0,019 $ |
| Claude Haiku 5.5 | Anthropic | Çok ucuz ve hızlı: çeviri, kısa metin | 0,10 / 0,50 | < 0,01 $ |
| GPT-5 | OpenAI | Genel amaçlı güçlü yazım | ≈ 1,25 / 10 | ≈ 0,018 $ |
| GPT-5 mini | OpenAI | Ucuz, hızlı | ≈ 0,25 / 2 | < 0,01 $ |
| Gemini Pro (son sürüm) | Google | Uzun bağlam, analiz | ≈ 2 / 12 | ≈ 0,022 $ |
| Gemini Flash (son sürüm) | Google | Hızlı, ücretsiz kota | ≈ 0,5 / 3 | < 0,01 $ |
| Gemini Flash-Lite | Google | En ucuz Google modeli | ≈ 0,25 / 1,5 | < 0,01 $ |
| OpenRouter | birçok sağlayıcı | Tek anahtar ve tek bakiye ile yukarıdakilerin çoğu + Llama, Mistral, DeepSeek… | canlı fiyat | modele göre |

**Tek anahtarla birden çok model:** OpenRouter. Anahtarı ekleyince bütün modeller ve güncel fiyatları uygulamada listelenir; karşılaştırma ekranında denenebilir.

## Görsel (Aşama 4.5'te bağlanacak)

| Model | Yaklaşık fiyat | Not |
|---|---|---|
| Google Nano Banana 2 (Gemini Flash Image) | 0,045–0,15 $ / görsel | Referans görselle düzenleme, karakter (maskot) tutarlılığı |
| Google Nano Banana Pro | 0,13–0,24 $ / görsel | Görsel içinde Türkçe yazı ve detay |
| OpenAI GPT Image | 0,006–0,21 $ / görsel | Talimata sadakat, yazı yerleştirme |
| FLUX.2 | 0,014–0,07 $ / görsel | Fotoğraf gerçekçiliği |
| Ideogram 4 | 0,03–0,10 $ / görsel | Afiş ve tipografi |

## Video (ileride)

| Model | Yaklaşık fiyat | Not |
|---|---|---|
| Google Veo 3.1 (Flow) | 0,05–0,40 $ / saniye | Eski sistemdeki akış; sesli daha pahalı |
| Kling 3.0 | 0,07–0,14 $ / saniye | Genelde en uygun |
| OpenAI Sora 2 | 0,10–0,50 $ / saniye | API erişimi değişken |

## Öneri

- **Metin yazımı (senaryo, açıklama):** Claude Sonnet 5.5; en önemli işler için Opus 5.5. Gemini'nin Türkçe yazımı beğenilmediği için önce Claude ile GPT-5'i karşılaştır.
- **Fikir üretimi ve asistan:** Claude Sonnet 5.5 (ya da daha ucuz: Haiku 5.5).
- **Çeviri ve prompt:** Claude Haiku 5.5 ya da GPT-5 mini.
- **Görsel ve video:** Google (Nano Banana, Veo) eski Flow akışıyla uyumlu; karar Aşama 4'te.
- Karar her zaman **Yapay zekâ → Karşılaştır** ekranında kendi markanla gerçek çıktılara bakılarak verilir.
