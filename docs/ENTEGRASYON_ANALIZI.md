# Post Stüdyosu: açık kaynak editörlerin incelenmesi ve entegrasyon planı

Kasım 2026. Depolar sığ klonla indirildi; README'nin yanında kaynak kodları incelendi. Kod kopyalanmadı: özellikler bizim mimarimize uyarlanarak yazılır.

## 1. Mevcut sistem (C1)

| Konu | Bizde |
|---|---|
| Ön yüz | Derleme adımı olmayan sade JavaScript modülleri (public/js), adres çubuğuyla sayfa yönlendirme, CSP `script-src 'self'` |
| Sunucu | Node 22+, Express 5, `node:sqlite`; göçler `PRAGMA user_version` ile (şu an 40) |
| Çizim motoru | Kendi Canvas2D çizicimiz: public/js/postCanvas.js (`drawSlide`, `layerBox`, `hitTest`, `fitText`, `handlesOf`, gradyan) |
| Nesne verisi | Slayt: `{ bg, bgGradient, bgImage, layers[] }`; katman türleri text / image / shape / qr. Sunucuda `cleanLayer` + `cleanData` (server/services/posts.js) her alanı sınırlar |
| Katmanlar | Dizi sırası = çizim sırası; gizli, kilitli, ad, grup, "her sayfada tekrarla" alanları; katmanlar paneli (önizleme, sürükle-bırak, grup) |
| Sayfa yönetimi | En çok 10 slayt; şeritte sürükle-bırak, sağ tık sayfa menüsü, türe göre yeni sayfa |
| Geri al / yinele | public/js/views/posts.js: JSON anlık görüntü yığını (100 adım), aynı alandaki art arda değişiklik tek adım |
| Şablon | `post_templates` (markaya özel), `shared_templates` (markalar arası, rol işaretli), 7 hazır tasarım; metin rolleri (title, body, speech...) ve maskot yeri ile "yalnızca metin değişir" üretimi |
| Dışa aktarma | PNG (tek / hepsi), çok sayfalı PDF (kendi yazıcımız public/js/pdf.js), Google Drive |
| AI | Merkezi katman server/services/ai (işe göre model, yedek, bütçe, maliyet kaydı, akış ve iptal) |
| Kayıt | Elle "Kaydet"; kaydedilmemiş değişiklik uyarısı. **Otomatik kayıt yok** |

## 2. Dört depo (C2)

### Canvix (MIT)
- Next.js + React + Konva + Zustand + Postgres (Prisma). Farklı çizim motoru: **taşınmaz**, yalnız fikir alınır.
- İncelemeye değer dosyalar:
  - src/store/editor-store.ts: `past/future` geçmişi; sayfalar hiç yerinde değiştirilmediği için anlık görüntüler referansla tutuluyor (yapısal paylaşım, adım başına O(1)). Otomatik kayıt için "her içerik değişikliğinde artan sayaç".
  - src/lib/templates/fields.ts: `{{anahtar}}` işaretli şablon alanları, CSV ile toplu doldurma; src/app/api/templates/[slug]/fill/route.ts: REST ile doldurma.
  - src/components/editor/panels/LayersPanel.tsx, canvas/context-menu.tsx, CropDialog.tsx, lib/image-filters.ts, VersionHistoryDialog.tsx.

### OpenDesign (MIT)
- Preact + Fabric.js + Hono + SQLite. Farklı motor: taşınmaz.
- src/server/fields.ts: Her nesneye isteğe bağlı `fieldName`. Ad tekil değildir: aynı ad birden çok nesneyi ve sayfayı aynı anda doldurur (logo ya da başlık bütün carousel'de tekrarlanır). Metin alanı metin, görsel alanı adres alır. Doldurma sonucu `filled` ve `unmatched` listesi döner. Bizim için en değerli fikir bu.
- src/client/components/brand-kit-panel.tsx + lib/kit-transfer.ts: marka kitini JSON olarak dışa/içe aktarma.

### Doory (Attribution Assurance License)
- React + Fabric + Django. Lisansı, ürün her açıldığında yazarın adını gösteren görünür atıf istiyor: **kod alınmaz**.
- Davranış referansı:
  - editor/engine/history.ts: anlık görüntü yığını + `coalesceKey` (art arda düzenlemeler tek adım). Bizim A1 çözümümüz aynı yaklaşımla yazıldı.
  - editor/engine/snapping.ts (hizalama), workspace/usePageDnd.ts (sayfa sürükle-bırak), ContextMenuHost.tsx (komut kimliklerinden menü), shortcuts.ts.

### HyCanvas (AGPL-3.0)
- Go sunucu + kendi Canvas2D motoru (@hc/engine) + Postgres. AGPL nedeniyle **kod alınmaz** (ağ üzerinden sunulan kapalı kaynak üründe bütün kaynağı açma yükümlülüğü doğar).
- Fikir referansı: packages/brandkit/src/lint.ts ve gate.ts. Marka kiti "denetleyicisi": marka dışı renk (CIELAB uzaklığı), marka dışı font, düşük kontrast, logo bozulması (orantısız ölçek), kenar boşluğu ihlali. Politika `off / warn / block`; dışa aktarmadan önce aynı kontrol çalışır. Bizim B2 (marka kilidi) ve B7 (tutarlılık) için model alınacak yaklaşım.

## 3. Özellik karşılaştırması

| # | Özellik | Bizde (bugün) | Referans | Yaklaşım | Zorluk | Uyumluluk notu |
|---|---|---|---|---|---|---|
| 1 | Tuval ve nesne yönetimi | Kendi Canvas2D, tutamaç, mıknatıs, çoklu seçim, grup | Konva/Fabric (Canvix, OpenDesign) | Motoru koru; **döndürme** eksik → eklenecek (D4) | Orta | Döndürme `layerBox`/`hitTest`'e yansımalı |
| 2 | Katman paneli | Önizleme, sürükle-bırak, grup, gizle, kilitle, ad | Canvix, Doory | Tamam (A3) | - | - |
| 3 | Sağ tık menüsü | Var (A2), uzun dokunma | Doory komut kimlikleri | Tamam; komutlar kısayollarla ortak tablo yapılabilir | Düşük | - |
| 4 | Kopyala / yapıştır / çoğalt | Katman ve sayfa | Canvix sistem panosu | Tamam; işletim sistemi panosuna yazma ileride | Düşük | Pano izni tarayıcıya bağlı |
| 5 | Geri al / yinele | Düzeltildi (A1), birleştirme | Doory `coalesceKey`, Canvix yapısal paylaşım | Tamam; bellek için ileride yapısal paylaşım | Düşük | JSON kopyası 100 adımda yeterli |
| 6 | Klavye kısayolları | Ctrl+Z/Y/Shift+Z/C/X/V/D/A/G/Shift+G, oklar, Delete | Doory shortcuts.ts | Tamam; kısayol yardım penceresi eklenebilir | Düşük | Mac'te Cmd destekli |
| 7 | Çoklu sayfa | 10 sayfa, sürükle-bırak, türe göre sayfa | Doory, Canvix | Tamam (A2) | - | - |
| 8 | Şablon sistemi | Marka + ortak + hazır, rol tabanlı doldurma | Canvix şablonları | Paket ve **versiyon** eksik (B5) | Orta | Göç gerekir |
| 9 | Şablon değişkenleri | Rol (title/body/speech...) | OpenDesign `fieldName`, Canvix `{{key}}` | **Alan kimliği** (MAIN_TITLE...) + değiştirilebilir/sabit (B1+C4) | Orta | Mevcut roller alan kimliğine eşlenir, eski veri bozulmaz |
| 10 | Marka kiti | Renk, font, logo, maskot | HyCanvas brandkit lint/gate, OpenDesign kit aktarma | **Marka kilidi + denetleyici** (B2, B7) | Orta | - |
| 11 | Renk ve gradyan | Kendi seçicimiz, gradyan (A4) | Canvix ColorMenu | Tamam | - | - |
| 12 | Görsel yükleme / kırpma / filtre | Yükleme, doldur-kırp, köşe, daire, filtre | Canvix CropDialog, image-filters | Serbest kırpma kutusu eksik; filtreler var | Orta | - |
| 13 | Öğeler ve ikonlar | 132 çıkartma, ~1.580 emoji, ~5.500 ikon | Doory paketleri (Tabler, Phosphor, Noto, Fluent) | Merkezi kayıt, kategoriler, yönetim paneli (D1-D5) | Yüksek | Lisans süzgeci şart |
| 14 | Hizalama ve kılavuzlar | Sayfa ve katman kenar/ortasına mıknatıs | Doory snapping.ts | Tamam; eşit aralık kılavuzu eklenebilir | Düşük | - |
| 15 | AI ile düzenlenebilir tasarım | Şablona metin doldurma, referanstan şablon | Canvix magic-layers, OpenDesign fill API | Editörde AI komutları (A6), alan kimliğiyle doldurma (B1) | Orta | AI çağrısını yalnız metne indir (B8) |
| 16 | Otomatik kayıt | Yok | Canvix içerik sayacı + gecikmeli kayıt | **Eklenecek** (B5 ile): değişiklikten birkaç saniye sonra sessiz kayıt | Düşük | Kaydet düğmesi kalır |
| 17 | Dışa aktarma | PNG, PDF, Drive | Canvix/Doory: SVG, PPTX, MP4, GIF | Şimdilik yeterli; SVG/PPTX sonraki iş | Yüksek | Ek bağımlılık istemez çözüm aranır |

## 4. Strateji (C3)

- Tek çizim motoru: bizim Canvas2D çizicimiz. Konva/Fabric eklenmez.
- Kod taşınmaz; davranış uyarlanır. MIT kaynaklardan bile kod alınırsa bildirim dosyası korunur. Doory ve HyCanvas'tan hiçbir kod ya da varlık alınmaz.
- Uygulama sırası (talimattaki öncelik): tuval/nesne → katmanlar → sağ tık ve kısayollar → geri al → sayfalar (bunlar tamam) → öğe kütüphanesi (D) → marka kiti ve palet (B2) → akıllı şablon değişkenleri (B1+C4) → AI ile şablon doldurma (B8) → otomatik kayıt ve versiyon (B5).

## 5. Alan kimlikleri (C4, OpenDesign yaklaşımı)

- Her katmana isteğe bağlı `field` alanı: `MAIN_TITLE`, `SUB_TITLE`, `DESCRIPTION`, `MAIN_IMAGE`, `LOGO`, `CTA`, `MASCOT`, `STAT`, `PAGE_NUMBER`, `SPEECH` ve kullanıcının kendi adları.
- Aynı alan kimliği birden çok katmanda ve sayfada olabilir; hepsi birlikte dolar.
- Mevcut roller eşlenir: title → MAIN_TITLE, body → DESCRIPTION, cta → CTA, speech → SPEECH, num → PAGE_NUMBER, image role mascot → MASCOT, logo → LOGO. Eski kayıtlar olduğu gibi açılır.
- Her alan için "değiştirilebilir / sabit". Şablon kaydında marka, versiyon, alan listesi ve kilitli öğeler birlikte saklanır.

## 6. Lisans (C2 sonucu)

| Depo | Lisans | Karar |
|---|---|---|
| Canvix | MIT | Fikir; kod alınırsa bildirim korunur. Çıkartma paketi bu lisansla alındı (public/vendor/packs/LICENSES.txt) |
| OpenDesign | MIT | Fikir (alan kimlikleri) |
| Doory | Attribution Assurance License (görünür atıf şartı) | Kod ve varlık alınmaz |
| HyCanvas | AGPL-3.0 | Kod ve varlık alınmaz |
| Tabler ikonları, Fluent Emoji | MIT | Alındı, bildirim dosyasında |

Not: Son talimatta uygulama "ticari ve kapalı kaynak" diye tanımlandı. Yukarıdaki kararlar buna göre verildi.
