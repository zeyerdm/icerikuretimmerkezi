# Tasarım kuralları

Bütün ekranlar aynı ölçü ve bileşenlerle yapılır. Değerler `public/css/app.css` dosyasının başındaki değişkenlerden gelir; sayfalarda rastgele piksel değeri ve satır içi stil kullanılmaz (yalnızca veriden gelen renkler, örneğin markanın rengi, satır içi verilir).

## Ölçüler

| | Değerler | Değişken |
|---|---|---|
| Boşluk | 4 · 8 · 12 · 16 · 24 · 32 · 48 | `--s-1` … `--s-7` |
| Köşe yuvarlaklığı | 8 · 12 · 16 · 20 · 28 | `--r-xs` … `--r-xl` |
| Yazı boyutu | 12 · 13 · 14 · 16 · 20 · 26 · 32 | `--t-xs` … `--t-3xl` |
| Kontrol yüksekliği | 40 (normal) · 32 (küçük) | `--h-control`, `--h-control-sm` |
| İkon | 18 · 16 | `--icon`, `--icon-sm` |
| İçerik genişliği | en fazla 1280 px, kenar boşluğu 32 (tablet 24, telefon 16) | `--content-max`, `--gutter` |

## Düğmeler

- `.btn` ikincil (varsayılan), `.btn-primary` birincil, `.btn-ghost` sessiz, `.btn-danger` tehlikeli.
- İki boy: normal (40 px) ve `.btn-sm` (32 px). Aynı satırdaki alan ve düğmeler aynı yükseklikte olur.
- Bir alanda (sayfa başlığı, kart, pencere) en fazla bir birincil düğme.
- Yalnızca ikonlu düğmeler `.icon-btn` (kare) ve mutlaka `aria-label` taşır.
- Süren işlemlerde `busy(düğme, işlem)` kullanılır: düğme "yükleniyor" durumuna geçer, çift tıklanamaz.
- İşlevi olmayan düğme gösterilmez (ör. AI bağlı değilken hızlı işlemler yerine "Ayarlara git" uyarısı; Drive bağlı değilken "Drive'a gönder" görünmez).

## Sayfa yapısı

1. `pageHead({ title, desc, actions })`: başlık ve tek cümlelik açıklama solda, işlemler sağda.
2. Hızlı ekleme satırı (`.card.quick-row`), varsa.
3. Araç satırı (`.toolbar`): arama, filtreler, sağda sayaç.
4. İçerik: kartlar `.grid-2` / `.grid-3` içinde, aynı satırdaki kartlar eşit yükseklikte; kart başlığı `.card-head`, alttaki işlem `.card-foot`.

## Durumlar

- Boş: `emptyState({ icon, title, text, action })`, kart içinde `compact: true`.
- Yükleniyor: `skeletonPage()` ya da sayfanın son yerleşimine benzeyen iskelet.
- Hata: `errorBox(err)`, "Tekrar dene" düğmesiyle; liste içinde `errorNotice(err)`.
- Pencerede zorunlu alan boşsa uyarı alanın altında gösterilir (`aria-invalid`).

## Erişilebilirlik ve kırılımlar

- Her etkileşimli öğe klavyeyle kullanılır; odak çerçevesi görünür (`:focus-visible`). Pencerede odak içeride kalır, Esc kapatır.
- Renkli kutularda koyu yazı açık zemin üzerinde (beyaz yazı sarı/turuncu zeminde kullanılmaz).
- 1100 px altı: kenar çubuğu yalnızca ikonlara iner. 760 px altı: menü üstte yatay şerit, kartlar tek sütun.
