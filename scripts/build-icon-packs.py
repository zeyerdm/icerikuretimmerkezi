# IconPark (Apache-2.0) kategorili ikon paketi ve Simple Icons (CC0) sosyal medya alt kümesi.
# Kaynak: npm @iconify-json/icon-park ve @iconify-json/simple-icons paketleri (açılmış klasörleri argüman olarak ver).
# Kullanım: python3 scripts/build-icon-packs.py <icon-park/package> <simple-icons/package>
import json, os, re, sys
park_dir, si_dir = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'vendor', 'packs')
CATS = {'Abstract': 'Soyut', 'Animals': 'Hayvanlar', 'Arrows': 'Oklar', 'Baby': 'Bebek ve çocuk', 'Base': 'Temel', 'Build': 'Yapı ve araç',
  'Character': 'Karakterler', 'Charts': 'Grafikler', 'Clothes': 'Giyim', 'Communicate': 'İletişim', 'Components': 'Arayüz', 'Connect': 'Bağlantı',
  'Constellation': 'Burçlar', 'Datas': 'Veri', 'Edit': 'Düzenleme', 'Emoji': 'Yüz ifadeleri', 'Energy': 'Enerji', 'Foods': 'Yiyecek ve içecek',
  'Game': 'Oyun', 'Graphics': 'Grafik şekiller', 'Hands': 'Eller', 'Hardware': 'Cihazlar', 'Health': 'Sağlık', 'Industry': 'Sanayi', 'Life': 'Yaşam',
  'Makeups': 'Güzellik', 'Measurement': 'Ölçüm', 'Money': 'Para ve finans', 'Music': 'Müzik', 'Office': 'Ofis', 'Operate': 'İşlem', 'Others': 'Diğer',
  'Peoples': 'İnsanlar', 'Safe': 'Güvenlik', 'Sports': 'Spor', 'Time': 'Zaman', 'Travel': 'Seyahat', 'Weather': 'Hava durumu'}
icons = json.load(open(os.path.join(park_dir, 'icons.json')))
meta = json.load(open(os.path.join(park_dir, 'metadata.json')))['categories']
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.translate(str.maketrans('çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')).lower()).strip('-')
items, seen = [], set()
for cat, names in meta.items():
    if cat not in CATS: continue  # 'Brand' (marka logoları) alınmaz
    for n in names:
        if n in seen or n not in icons['icons']: continue
        seen.add(n)
        body = icons['icons'][n]['body']
        # İki tonlu çizimde koyu çizgi ve mavi dolgu tek renge (currentColor) iner, beyaz ayrıntılar kalır
        body = re.sub(r'#(000|2F88FF|43CCF8)\b', 'currentColor', body, flags=re.I)
        items.append({'i': n, 'g': slug(CATS[cat]), 'n': n.replace('-', ' '), 't': n.replace('-', ' '), 'b': body})
cats = [{'id': slug(v), 'name': v} for k, v in CATS.items() if k in meta]
json.dump({'id': 'iconpark', 'recolor': True, 'v': '0 0 48 48', 'items': items}, open(os.path.join(OUT, 'iconpark.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('iconpark', len(items), os.path.getsize(os.path.join(OUT, 'iconpark.json')))
json.dump(cats, open(os.path.join(OUT, '.iconpark-cats.json'), 'w'), ensure_ascii=False)

# Sosyal medya ve iletişim logoları (marka adları ticari markadır; yalnızca platforma bağlantı göstermek için)
SOCIAL = ['instagram', 'facebook', 'x', 'youtube', 'tiktok', 'whatsapp', 'telegram', 'pinterest', 'threads', 'snapchat', 'linkedin', 'discord',
  'spotify', 'twitch', 'reddit', 'tumblr', 'vimeo', 'behance', 'dribbble', 'medium', 'substack', 'patreon', 'messenger', 'signal', 'bluesky',
  'mastodon', 'gmail', 'google', 'googlemaps', 'googleplay', 'appstore', 'apple', 'applemusic', 'soundcloud', 'etsy', 'shopify', 'trendyol',
  'hepsiburada', 'getir', 'yemeksepeti', 'airbnb', 'booking', 'tripadvisor', 'paypal', 'linktree', 'wordpress', 'github', 'kick', 'clubhouse']
si = json.load(open(os.path.join(si_dir, 'icons.json')))
out = []
for n in SOCIAL:
    if n in si['icons']:
        out.append({'i': n, 'g': 'sosyal', 'n': n, 't': f'{n} sosyal medya logo', 'b': si['icons'][n]['body']})
json.dump({'id': 'sosyal', 'recolor': True, 'v': '0 0 24 24', 'items': out}, open(os.path.join(OUT, 'sosyal.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('sosyal', len(out))
