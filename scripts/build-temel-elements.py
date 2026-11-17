# Özgün temel öğeler (Kreatifhane): şekiller, oklar, çizgiler, çerçeveler, konuşma balonları, etiketler, rozetler,
# dekoratif süsler, arka plan desenleri ve dokular. Hepsi viewBox 0 0 100 100 (desen/doku 0 0 200 200), tek renk
# (currentColor) olduğu için düzenleyicide rengi değiştirilebilir. Çıktı: public/vendor/packs/temel.json
import json, math, os
C = 'currentColor'
items = []
def add(g, i, n, tags, body, v='0 0 100 100'):
    items.append({'i': f'{g}-{i}', 'g': g, 'n': n, 't': tags, 'b': body, 'v': v})
def poly(n, r=46, cx=50, cy=50, rot=-90):
    return ' '.join(f'{cx + r*math.cos(math.radians(rot + k*360/n)):.1f},{cy + r*math.sin(math.radians(rot + k*360/n)):.1f}' for k in range(n))
def star(n, r1=47, r2=20, cx=50, cy=50):
    pts = []
    for k in range(n*2):
        r = r1 if k % 2 == 0 else r2
        a = math.radians(-90 + k*180/n)
        pts.append(f'{cx + r*math.cos(a):.1f},{cy + r*math.sin(a):.1f}')
    return ' '.join(pts)
F = f'fill="{C}"'
S = lambda w=6: f'fill="none" stroke="{C}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"'
# Geometrik şekiller
sh = 'sekiller'
add(sh,'daire','Daire','daire yuvarlak circle round',f'<circle cx="50" cy="50" r="46" {F}/>')
add(sh,'kare','Kare','kare square kutu',f'<rect x="6" y="6" width="88" height="88" {F}/>')
add(sh,'yuvarlak-kare','Yuvarlak köşe kare','yuvarlak köşe kare rounded square',f'<rect x="6" y="6" width="88" height="88" rx="20" {F}/>')
add(sh,'ucgen','Üçgen','üçgen triangle',f'<polygon points="{poly(3,50,50,56)}" {F}/>')
for n, nm in [(5,'Beşgen'),(6,'Altıgen'),(8,'Sekizgen')]:
    add(sh,f'{n}gen',nm,f'{nm.lower()} polygon hexagon pentagon octagon',f'<polygon points="{poly(n)}" {F}/>')
for n, nm in [(5,'Yıldız'),(6,'Altı köşeli yıldız'),(8,'Sekiz köşeli yıldız'),(12,'Patlama')]:
    add(sh,f'yildiz{n}',nm,f'yıldız star burst patlama {nm.lower()}',f'<polygon points="{star(n, 47, 20 if n<12 else 36)}" {F}/>')
add(sh,'kalp','Kalp','kalp heart sevgi aşk love',f'<path d="M50 88 C20 66 6 50 6 32 A20 20 0 0 1 50 22 A20 20 0 0 1 94 32 C94 50 80 66 50 88Z" {F}/>')
add(sh,'elmas','Elmas','elmas baklava diamond rhombus',f'<polygon points="50,4 94,50 50,96 6,50" {F}/>')
add(sh,'paralel','Paralelkenar','paralelkenar parallelogram',f'<polygon points="24,20 96,20 76,80 4,80" {F}/>')
add(sh,'yamuk','Yamuk','yamuk trapezoid',f'<polygon points="22,22 78,22 96,80 4,80" {F}/>')
add(sh,'arti','Artı','artı plus haç cross',f'<path d="M38 6h24v32h32v24H62v32H38V62H6V38h32z" {F}/>')
add(sh,'halka','Halka','halka ring daire çember',f'<circle cx="50" cy="50" r="38" {S(12)}/>')
add(sh,'yarim','Yarım daire','yarım daire half circle',f'<path d="M4 64 A46 46 0 0 1 96 64Z" {F}/>')
add(sh,'ceyrek','Çeyrek daire','çeyrek daire quarter',f'<path d="M8 92 V8 A84 84 0 0 1 92 92Z" {F}/>')
add(sh,'kemer','Kemer','kemer arch',f'<path d="M14 96 V50 A36 36 0 0 1 86 50 V96Z" {F}/>')
add(sh,'bulut','Bulut','bulut cloud',f'<path d="M26 78 A18 18 0 0 1 24 42 A24 24 0 0 1 70 32 A20 20 0 0 1 80 78Z" {F}/>')
add(sh,'damla','Damla','damla drop su',f'<path d="M50 6 C66 34 80 50 80 64 A30 30 0 0 1 20 64 C20 50 34 34 50 6Z" {F}/>')
add(sh,'leke1','Organik leke','leke blob organik şekil',f'<path d="M52 6 C74 6 94 22 92 46 C90 70 78 94 50 94 C24 94 8 76 8 52 C8 26 28 6 52 6Z" {F}/>')
add(sh,'leke2','Dalgalı leke','leke blob dalgalı',f'<path d="M30 10 C46 0 60 14 72 12 C90 10 98 34 90 50 C84 64 96 78 82 90 C66 102 52 86 36 90 C16 94 2 76 8 58 C12 44 2 32 10 22 C14 16 22 14 30 10Z" {F}/>')
add(sh,'hilal','Hilal','hilal ay moon',f'<path d="M62 6 A44 44 0 1 0 94 70 A34 34 0 1 1 62 6Z" {F}/>')
add(sh,'simsek','Şimşek','şimşek yıldırım lightning enerji',f'<polygon points="58,4 18,56 46,56 38,96 82,40 54,40" {F}/>')
# Oklar
ar = 'oklar'
add(ar,'duz','Düz ok','ok arrow sağ right',f'<path d="M8 50 H82 M60 26 L86 50 L60 74" {S(9)}/>')
add(ar,'cift','Çift yönlü ok','ok çift arrow double',f'<path d="M14 50 H86 M36 28 L12 50 L36 72 M64 28 L88 50 L64 72" {S(8)}/>')
add(ar,'kivrik','Kıvrık ok','ok kıvrık curve arrow',f'<path d="M12 80 C16 34 50 18 84 26 M66 12 L86 26 L70 46" {S(8)}/>')
add(ar,'donen','Dönen ok','ok dönen yenile döngü refresh cycle',f'<path d="M82 42 A34 34 0 1 0 74 74 M84 18 L84 44 L58 44" {S(8)}/>')
add(ar,'zigzag','Zikzak ok','ok zikzak zigzag',f'<path d="M8 70 L32 40 L52 62 L80 26 M62 22 L82 24 L80 44" {S(8)}/>')
add(ar,'el','El çizimi ok','ok el çizimi hand drawn',f'<path d="M10 76 C24 60 30 30 56 30 C70 30 72 46 60 50 C48 54 46 38 62 30 C72 24 82 26 88 30 M76 18 L90 30 L76 42" {S(6)}/>')
add(ar,'asagi','Aşağı ok','ok aşağı down',f'<path d="M50 8 V84 M26 62 L50 88 L74 62" {S(9)}/>')
add(ar,'yukari','Yukarı ok','ok yukarı up',f'<path d="M50 92 V16 M26 38 L50 12 L74 38" {S(9)}/>')
add(ar,'kalin','Kalın ok','ok kalın blok block arrow',f'<polygon points="6,36 56,36 56,14 94,50 56,86 56,64 6,64" {F}/>')
add(ar,'chevron','Köşeli ok','chevron köşeli ok ileri next',f'<path d="M30 12 L68 50 L30 88" {S(12)}/>')
add(ar,'cift-chevron','Çift köşeli ok','chevron çift ileri hızlı',f'<path d="M18 16 L50 50 L18 84 M50 16 L82 50 L50 84" {S(10)}/>')
add(ar,'daire-ok','Dairede ok','ok daire buton circle arrow',f'<circle cx="50" cy="50" r="46" {F}/><path d="M28 50 H70 M54 32 L72 50 L54 68" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>')
add(ar,'kaydir','Kaydır işareti','kaydır swipe sağa kaydırarak incele',f'<path d="M10 50 H62 M44 32 L64 50 L44 68" {S(7)}/><path d="M66 32 L84 50 L66 68" {S(7)} opacity=".55"/><path d="M78 32 L96 50 L78 68" {S(7)} opacity=".3"/>')
add(ar,'isaret','İşaret oku','işaret ok imleç cursor pointer',f'<path d="M20 8 L80 52 L54 56 L68 86 L56 92 L42 62 L22 80Z" {F}/>')
# Çizgiler
li = 'cizgiler'
add(li,'duz','Düz çizgi','çizgi line düz','<path d="M4 50 H96" ' + S(6) + '/>')
add(li,'kesik','Kesik çizgi','çizgi kesik dashed',f'<path d="M4 50 H96" {S(6)} stroke-dasharray="12 10"/>')
add(li,'noktali','Noktalı çizgi','çizgi noktalı dotted',f'<path d="M6 50 H96" {S(8)} stroke-dasharray="0 14"/>')
add(li,'cift','Çift çizgi','çizgi çift double',f'<path d="M4 42 H96 M4 58 H96" {S(5)}/>')
add(li,'dalga','Dalgalı çizgi','çizgi dalga wavy squiggle',f'<path d="M4 50 Q16 34 28 50 T52 50 T76 50 T100 50" {S(6)}/>')
add(li,'zigzag','Zikzak çizgi','çizgi zikzak zigzag',f'<path d="M4 56 L16 42 L28 56 L40 42 L52 56 L64 42 L76 56 L88 42 L96 52" {S(6)}/>')
add(li,'alti','Vurgu alt çizgisi','alt çizgi vurgu underline swoosh',f'<path d="M6 62 C30 44 70 40 94 50" {S(8)}/>')
add(li,'firca','Fırça darbesi','fırça brush darbe boya',f'<path d="M6 54 C20 42 40 40 62 44 C78 46 88 44 96 40 L94 56 C82 60 70 60 56 58 C36 56 20 60 8 66Z" {F}/>')
add(li,'ayrac','Noktalı ayraç','ayraç divider bölücü',f'<path d="M4 50 H40 M60 50 H96" {S(5)}/><circle cx="50" cy="50" r="6" {F}/>')
add(li,'daire-cizgi','Daire işareti','daire içine al vurgu çember circle mark',f'<path d="M50 10 C78 8 96 26 92 50 C88 76 58 92 34 86 C12 80 4 58 14 38 C24 18 52 10 76 18" {S(5)}/>')
# Çerçeveler
fr = 'cerceveler'
add(fr,'kare','Kare çerçeve','çerçeve kare frame',f'<rect x="6" y="6" width="88" height="88" {S(6)}/>')
add(fr,'yuvarlak','Yuvarlak köşe çerçeve','çerçeve yuvarlak köşe rounded frame',f'<rect x="6" y="6" width="88" height="88" rx="18" {S(6)}/>')
add(fr,'daire','Daire çerçeve','çerçeve daire circle frame',f'<circle cx="50" cy="50" r="44" {S(6)}/>')
add(fr,'cift','Çift çerçeve','çerçeve çift double frame',f'<rect x="4" y="4" width="92" height="92" {S(3)}/><rect x="12" y="12" width="76" height="76" {S(3)}/>')
add(fr,'koseler','Köşe çerçevesi','çerçeve köşe bracket corners',f'<path d="M6 26 V6 H26 M74 6 H94 V26 M94 74 V94 H74 M26 94 H6 V74" {S(6)}/>')
add(fr,'polaroid','Polaroid çerçeve','polaroid fotoğraf çerçeve photo frame',f'<path fill-rule="evenodd" d="M8 4 H92 V96 H8Z M16 12 V72 H84 V12Z" {F}/>')
add(fr,'dalgali','Dalgalı çerçeve','çerçeve dalgalı scallop rozet',f'<polygon points="{star(20,48,42)}" {S(4)}/>')
add(fr,'kesik','Kesik çizgili çerçeve','çerçeve kesik dashed',f'<rect x="6" y="6" width="88" height="88" rx="10" {S(5)} stroke-dasharray="10 8"/>')
add(fr,'bilet','Bilet','bilet ticket kupon coupon',f'<path d="M6 20 H94 V40 A10 10 0 0 0 94 60 V80 H6 V60 A10 10 0 0 0 6 40Z" {F}/>')
add(fr,'film','Film şeridi','film şerit strip sinema',f'<path fill-rule="evenodd" d="M4 14 H96 V86 H4Z M10 20 V28 H18 V20Z M28 20 V28 H36 V20Z M46 20 V28 H54 V20Z M64 20 V28 H72 V20Z M82 20 V28 H90 V20Z M10 72 V80 H18 V72Z M28 72 V80 H36 V72Z M46 72 V80 H54 V72Z M64 72 V80 H72 V72Z M82 72 V80 H90 V72Z M10 34 V66 H90 V34Z" {F}/>')
add(fr,'telefon','Telefon çerçevesi','telefon mockup phone ekran',f'<rect x="26" y="4" width="48" height="92" rx="9" {S(4)}/><path d="M42 10 H58" {S(4)}/>')
add(fr,'tarayici','Tarayıcı penceresi','tarayıcı pencere browser web mockup',f'<rect x="4" y="12" width="92" height="76" rx="6" {S(4)}/><path d="M4 28 H96" {S(4)}/><circle cx="13" cy="20" r="2.5" {F}/><circle cx="21" cy="20" r="2.5" {F}/><circle cx="29" cy="20" r="2.5" {F}/>')
# Konuşma balonları
bu = 'balonlar'
add(bu,'yuvarlak-sol','Konuşma balonu (sol)','konuşma balonu speech bubble sol',f'<path d="M50 8 C76 8 94 24 94 44 C94 64 76 80 50 80 C44 80 38 79 33 77 L12 92 L18 70 C10 63 6 54 6 44 C6 24 24 8 50 8Z" {F}/>')
add(bu,'yuvarlak-sag','Konuşma balonu (sağ)','konuşma balonu speech bubble sağ',f'<path d="M50 8 C24 8 6 24 6 44 C6 64 24 80 50 80 C56 80 62 79 67 77 L88 92 L82 70 C90 63 94 54 94 44 C94 24 76 8 50 8Z" {F}/>')
add(bu,'kare','Köşeli balon','konuşma balonu köşeli kare rectangle bubble',f'<path d="M8 10 H92 Q96 10 96 14 V64 Q96 68 92 68 H40 L22 88 L26 68 H8 Q4 68 4 64 V14 Q4 10 8 10Z" {F}/>')
add(bu,'dusunce','Düşünce balonu','düşünce balonu thought bubble',f'<path d="M26 68 A16 16 0 0 1 22 38 A20 20 0 0 1 56 22 A18 18 0 0 1 86 40 A16 16 0 0 1 76 68Z" {F}/><circle cx="24" cy="80" r="6" {F}/><circle cx="12" cy="92" r="4" {F}/>')
add(bu,'patlama','Bağırma balonu','bağırma patlama shout burst wow',f'<polygon points="{star(14,48,34,50,48)}" {F}/>')
add(bu,'cizgi','Çizgi balon','konuşma balonu çizgi outline',f'<path d="M50 10 C75 10 92 25 92 44 C92 63 75 78 50 78 C44 78 38 77 33 75 L14 88 L19 68 C12 62 8 53 8 44 C8 25 25 10 50 10Z" {S(5)}/>')
add(bu,'oval','Oval balon','konuşma balonu oval',f'<ellipse cx="50" cy="42" rx="44" ry="30" {F}/><path d="M60 68 L74 94 L40 70Z" {F}/>')
add(bu,'mesaj','Mesaj balonu','mesaj sohbet chat dm',f'<rect x="4" y="14" width="80" height="50" rx="18" {F}/><path d="M18 60 L10 84 L36 62Z" {F}/>')
add(bu,'sohbet','Sohbet','sohbet iki balon chat konuşma',f'<rect x="4" y="8" width="60" height="40" rx="14" {F}/><rect x="36" y="52" width="60" height="40" rx="14" {F} opacity=".6"/>')
# Etiketler
tg = 'etiketler'
add(tg,'fiyat','Fiyat etiketi','etiket fiyat tag price',f'<path fill-rule="evenodd" d="M50 6 H90 V46 L48 92 L6 50Z M74 18 A6 6 0 1 0 74 30 A6 6 0 1 0 74 18Z" {F}/>')
add(tg,'kurdele','Kurdele bant','kurdele bant ribbon banner',f'<path d="M14 30 H86 V62 H14Z" {F}/><path d="M14 38 L2 38 L8 50 L2 62 L14 62Z M86 38 L98 38 L92 50 L98 62 L86 62Z" {F} opacity=".7"/>')
add(tg,'hap','Hap etiket','hap pill etiket buton',f'<rect x="4" y="32" width="92" height="36" rx="18" {F}/>')
add(tg,'kose','Köşe etiketi','köşe etiket corner',f'<polygon points="4,4 70,4 4,70" {F}/>')
add(tg,'yer-imi','Yer imi','yer imi bookmark kaydet',f'<path d="M24 4 H76 V96 L50 74 L24 96Z" {F}/>')
add(tg,'bayrak','Bayrak etiket','bayrak flag etiket',f'<path d="M8 20 H92 L80 50 L92 80 H8Z" {F}/>')
add(tg,'kutu','Not kutusu','not kağıt post-it yapışkan not',f'<path d="M8 8 H92 V72 L72 92 H8Z" {F}/><path d="M72 92 V72 H92Z" fill="#000" opacity=".18"/>')
add(tg,'sekme','Sekme etiket','sekme tab etiket',f'<path d="M4 90 V40 Q4 30 14 30 H36 L46 18 H86 Q96 18 96 28 V90Z" {F}/>')
# Rozetler
bd = 'rozetler'
add(bd,'muhur','Mühür rozet','rozet mühür seal badge',f'<polygon points="{star(16,48,40)}" {F}/>')
add(bd,'daire','Daire rozet','rozet daire badge circle',f'<circle cx="50" cy="50" r="46" {F}/><circle cx="50" cy="50" r="36" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="4 4"/>')
add(bd,'kalkan','Kalkan','kalkan shield güven',f'<path d="M50 4 L88 18 V46 C88 72 70 88 50 96 C30 88 12 72 12 46 V18Z" {F}/>')
add(bd,'madalya','Madalya','madalya medal ödül birinci',f'<path d="M30 4 H46 L54 30 H38Z M54 4 H70 L62 30 H46Z" {F} opacity=".7"/><circle cx="50" cy="62" r="32" {F}/>')
add(bd,'onay','Onay rozeti','onay rozet check doğrulandı verified tik',f'<polygon points="{star(12,48,40)}" {F}/><path d="M32 52 L45 64 L70 38" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>')
add(bd,'kupa','Kupa','kupa ödül trophy kazanan',f'<path d="M28 8 H72 V30 A22 22 0 0 1 28 30Z M42 50 H58 V72 H42Z M26 76 H74 V90 H26Z" {F}/><path d="M28 14 H12 V24 A16 16 0 0 0 30 38 M72 14 H88 V24 A16 16 0 0 1 70 38" {S(5)}/>')
add(bd,'yildiz-rozet','Yıldız rozet','yıldız rozet star badge',f'<circle cx="50" cy="50" r="46" {F}/><polygon points="{star(5,28,12)}" fill="#fff"/>')
add(bd,'serit','Şerit rozet','şerit rozet ribbon ödül',f'<circle cx="50" cy="40" r="32" {F}/><path d="M32 64 L22 96 L38 88 L46 98 L50 72 Z M68 64 L78 96 L62 88 L54 98 L50 72Z" {F} opacity=".75"/>')
# Dekoratif süsler
de = 'susler'
add(de,'parilti','Parıltı','parıltı sparkle ışıltı yıldız',f'<path d="M50 4 C54 36 64 46 96 50 C64 54 54 64 50 96 C46 64 36 54 4 50 C36 46 46 36 50 4Z" {F}/>')
add(de,'parilti3','Üçlü parıltı','parıltı üçlü sparkles',f'<path d="M40 10 C43 34 50 41 74 44 C50 47 43 54 40 78 C37 54 30 47 6 44 C30 41 37 34 40 10Z" {F}/><path d="M78 56 C80 68 84 72 96 74 C84 76 80 80 78 92 C76 80 72 76 60 74 C72 72 76 68 78 56Z" {F}/><path d="M80 6 C81 14 84 17 92 18 C84 19 81 22 80 30 C79 22 76 19 68 18 C76 17 79 14 80 6Z" {F}/>')
add(de,'noktalar','Üç nokta','nokta üç dots',f'<circle cx="20" cy="50" r="10" {F}/><circle cx="50" cy="50" r="10" {F}/><circle cx="80" cy="50" r="10" {F}/>')
add(de,'konfeti','Konfeti','konfeti kutlama confetti parti',f'<rect x="10" y="14" width="10" height="5" rx="2" transform="rotate(30 15 16)" {F}/><circle cx="40" cy="12" r="4" {F}/><rect x="66" y="10" width="12" height="5" rx="2" transform="rotate(-25 72 12)" {F}/><circle cx="88" cy="34" r="4" {F}/><rect x="22" y="44" width="11" height="5" rx="2" transform="rotate(-40 27 46)" {F}/><circle cx="56" cy="40" r="3.5" {F}/><rect x="70" y="58" width="12" height="5" rx="2" transform="rotate(50 76 60)" {F}/><circle cx="14" cy="78" r="4" {F}/><rect x="42" y="78" width="11" height="5" rx="2" transform="rotate(20 47 80)" {F}/><circle cx="86" cy="86" r="4" {F}/>')
add(de,'isinlar','Işınlar','ışın güneş patlama rays sunburst',''.join(f'<path d="M{50+18*math.cos(a):.1f} {50+18*math.sin(a):.1f} L{50+46*math.cos(a):.1f} {50+46*math.sin(a):.1f}" {S(5)}/>' for a in [k*math.pi/6 for k in range(12)]))
add(de,'kivrim','Kıvrım','kıvrım swirl spiral süs',f'<path d="M50 50 m0 0 a4 4 0 0 1 8 0 a8 8 0 0 1 -16 0 a12 12 0 0 1 24 0 a16 16 0 0 1 -32 0 a20 20 0 0 1 40 0 a24 24 0 0 1 -48 0" {S(4)}/>')
add(de,'dal','Yapraklı dal','dal yaprak leaf branch doğa',f'<path d="M10 90 C40 70 60 40 90 10" {S(4)}/>' + ''.join(f'<ellipse cx="{x}" cy="{y}" rx="9" ry="4.5" transform="rotate({r} {x} {y})" {F}/>' for x, y, r in [(30,74,-60),(42,60,30),(52,52,-60),(62,38,30),(72,30,-60),(80,20,30)]))
add(de,'kalpler','Uçan kalpler','kalp kalpler hearts sevgi',f'<path d="M30 60 C14 48 6 40 6 30 A11 11 0 0 1 30 24 A11 11 0 0 1 54 30 C54 40 46 48 30 60Z" {F}/><path d="M72 40 C62 33 58 28 58 22 A7 7 0 0 1 72 18 A7 7 0 0 1 86 22 C86 28 82 33 72 40Z" {F} opacity=".7"/><path d="M70 90 C62 84 58 80 58 75 A6 6 0 0 1 70 72 A6 6 0 0 1 82 75 C82 80 78 84 70 90Z" {F} opacity=".5"/>')
add(de,'carpi','Çarpı süsü','çarpı x süs memphis',f'<path d="M20 20 L44 44 M44 20 L20 44 M58 58 L82 82 M82 58 L58 82" {S(6)}/>')
add(de,'daireler','Daireler','daire halka süs memphis circles',f'<circle cx="28" cy="30" r="18" {S(5)}/><circle cx="70" cy="68" r="12" {F}/><circle cx="76" cy="22" r="6" {F}/>')
add(de,'cizik','Karalama','karalama scribble el çizimi doodle',f'<path d="M8 60 C20 30 30 70 42 40 C54 10 60 80 72 46 C80 24 88 50 94 40" {S(5)}/>')
add(de,'tac','Taç','taç crown kral premium',f'<path d="M10 76 L16 28 L36 50 L50 18 L64 50 L84 28 L90 76Z M12 82 H88 V92 H12Z" {F}/>')
# Arka plan desenleri (200x200 karo)
pt = 'desenler'
V2 = '0 0 200 200'
add(pt,'noktali','Noktalı desen','desen nokta dots pattern zemin', ''.join(f'<circle cx="{x}" cy="{y}" r="5" {F}/>' for x in range(10,200,25) for y in range(10,200,25)), V2)
add(pt,'kareli','Kareli desen','desen kareli grid defter',''.join(f'<path d="M{x} 0 V200" stroke="{C}" stroke-width="1.5"/>' for x in range(0,201,20)) + ''.join(f'<path d="M0 {y} H200" stroke="{C}" stroke-width="1.5"/>' for y in range(0,201,20)), V2)
add(pt,'cizgili','Çapraz çizgili desen','desen çizgili çapraz stripes',''.join(f'<path d="M{x} 200 L{x+200} 0" stroke="{C}" stroke-width="6"/>' for x in range(-200,201,24)), V2)
add(pt,'dalga','Dalga deseni','desen dalga wave',''.join(f'<path d="M0 {y} Q25 {y-12} 50 {y} T100 {y} T150 {y} T200 {y}" fill="none" stroke="{C}" stroke-width="4"/>' for y in range(14,200,24)), V2)
add(pt,'dama','Dama deseni','desen dama checker satranç',''.join(f'<rect x="{x}" y="{y}" width="25" height="25" {F}/>' for x in range(0,200,25) for y in range(0,200,25) if (x//25 + y//25) % 2 == 0), V2)
add(pt,'zigzag','Zikzak desen','desen zikzak zigzag chevron',''.join(f'<path d="M0 {y} ' + ' '.join(f'L{x} {y + (-12 if (x//20)%2 else 0)}' for x in range(20,201,20)) + f'" fill="none" stroke="{C}" stroke-width="4"/>' for y in range(20,200,28)), V2)
add(pt,'arti','Artı deseni','desen artı plus',''.join(f'<path d="M{x-6} {y} H{x+6} M{x} {y-6} V{y+6}" stroke="{C}" stroke-width="3" stroke-linecap="round"/>' for x in range(15,200,30) for y in range(15,200,30)), V2)
add(pt,'halkalar','Halka deseni','desen halka daire circles',''.join(f'<circle cx="{x}" cy="{y}" r="12" fill="none" stroke="{C}" stroke-width="3"/>' for x in range(20,200,40) for y in range(20,200,40)), V2)
add(pt,'ucgenler','Üçgen deseni','desen üçgen triangles',''.join(f'<polygon points="{x},{y-10} {x+10},{y+8} {x-10},{y+8}" {F}/>' for x in range(20,200,40) for y in range(20,200,40)), V2)
add(pt,'yildizlar','Yıldız deseni','desen yıldız stars',''.join(f'<polygon points="{star(5,9,4,x,y)}" {F}/>' for x in range(20,200,40) for y in range(20,200,40)), V2)
# Dokular (SVG filtre ile)
tx = 'dokular'
add(tx,'gren','Gren dokusu','doku gren grain noise film',f'<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0"/></filter><rect width="200" height="200" filter="url(#g)"/>', V2)
add(tx,'kagit','Kâğıt dokusu','doku kağıt paper',f'<filter id="p"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="4"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .4  0 0 0 .25 0"/></filter><rect width="200" height="200" filter="url(#p)"/>', V2)
add(tx,'yarim-ton','Yarım ton','doku yarım ton halftone baskı',''.join(f'<circle cx="{x}" cy="{y}" r="{1 + 5*(x/200):.1f}" {F}/>' for x in range(5,200,12) for y in range(5,200,12)), V2)
add(tx,'cizgi-doku','Çizgi doku','doku çizgi lines tarama',''.join(f'<path d="M0 {y} H200" stroke="{C}" stroke-width="1" opacity=".6"/>' for y in range(2,200,6)), V2)
out = {'id': 'temel', 'recolor': True, 'items': items}
path = os.path.join(os.path.dirname(__file__), '..', 'public', 'vendor', 'packs', 'temel.json')
json.dump(out, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(items), 'öğe', os.path.getsize(path), 'bayt')
