# Merkezi öğe kaydı: paketler (dosya, lisans, kaynak, sayı) ve paneldeki kategori ağacı.
# Paket dosyaları üretildikten sonra çalıştırılır. Çıktı: public/vendor/packs/registry.json
import json, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'vendor', 'packs')
J = lambda f: json.load(open(os.path.join(D, f)))
MIT = lambda holder: {'spdx': 'MIT', 'title': 'MIT', 'holder': holder, 'commercial': True, 'attribution': False, 'noticeFile': 'LICENSES.txt'}
packs = [
  {'id': 'temel', 'name': 'Kreatifhane temel öğeler', 'file': 'temel.json', 'format': 'items', 'recolor': True, 'source': 'Kreatifhane (özgün)', 'url': '',
   'license': {'spdx': 'LicenseRef-Kreatifhane', 'title': 'Kreatifhane özgün çizim', 'holder': 'Kreatifhane', 'commercial': True, 'attribution': False}},
  {'id': 'iconpark', 'name': 'IconPark ikonları', 'file': 'iconpark.json', 'format': 'items', 'recolor': True, 'source': 'IconPark (ByteDance), @iconify-json/icon-park 1.2.4', 'url': 'https://github.com/bytedance/IconPark',
   'license': {'spdx': 'Apache-2.0', 'title': 'Apache License 2.0', 'holder': 'Bytedance Inc.', 'commercial': True, 'attribution': False, 'noticeFile': 'LICENSE-Apache-2.0.txt'}},
  {'id': 'sosyal', 'name': 'Sosyal medya logoları', 'file': 'sosyal.json', 'format': 'items', 'recolor': True, 'source': 'Simple Icons, @iconify-json/simple-icons 1.2.103', 'url': 'https://github.com/simple-icons/simple-icons',
   'license': {'spdx': 'CC0-1.0', 'title': 'CC0 1.0 (kamu malı)', 'holder': 'Simple Icons katkıcıları', 'commercial': True, 'attribution': False,
               'note': 'Logolar ilgili şirketlerin ticari markasıdır; yalnızca o platformu belirtmek için kullan, logoyu değiştirme.'}},
  {'id': 'tabler', 'name': 'Tabler ikonları', 'file': 'icons.json', 'format': 'legacy-icon', 'recolor': True, 'source': 'Tabler Icons, @iconify-json/tabler 1.2.46', 'url': 'https://github.com/tabler/tabler-icons', 'license': MIT('Paweł Kuna')},
  {'id': 'emoji', 'name': 'Fluent Emoji (düz)', 'file': 'emoji.json', 'format': 'legacy-emoji', 'recolor': False, 'source': 'Microsoft Fluent Emoji Flat, @iconify-json/fluent-emoji-flat 1.2.6', 'url': 'https://github.com/microsoft/fluentui-emoji', 'license': MIT('Microsoft Corporation')},
  {'id': 'stickers', 'name': 'Çıkartmalar', 'file': 'stickers.json', 'format': 'legacy-sticker', 'recolor': False, 'source': 'Canvix çıkartma paketi (yazılar Türkçeleştirildi)', 'url': 'https://github.com/ashiqhussainmir/canvix', 'license': MIT('Ashiq Hussain Mir')},
]
count = {'temel': {}, 'iconpark': {}, 'sosyal': {}}
for pid in count:
    for it in J(f'{pid}.json')['items']: count[pid][it['g']] = count[pid].get(it['g'], 0) + 1
for p in packs:
    d = J(p['file'])
    p['count'] = len(d['items']) if p['format'] == 'items' else sum(len(x['items']) for x in d['packs'])
park = json.load(open(os.path.join(D, '.iconpark-cats.json')))
emoji = J('emoji.json')['packs']; stick = J('stickers.json')['packs']
sub = lambda pack, g, name: {'id': f'{pack}:{g}', 'pack': pack, 'group': g, 'name': name, 'count': count.get(pack, {}).get(g)}
T = lambda g, name: sub('temel', g, name)
cats = [
  {'id': 'sekiller', 'name': 'Şekiller', 'subs': [T('sekiller', 'Geometrik şekiller'), sub('iconpark', 'grafik-sekiller', 'Grafik şekiller'), sub('iconpark', 'soyut', 'Soyut')]},
  {'id': 'oklar', 'name': 'Oklar', 'subs': [T('oklar', 'Oklar'), sub('iconpark', 'oklar', 'İkon oklar')]},
  {'id': 'cizgiler', 'name': 'Çizgiler', 'subs': [T('cizgiler', 'Çizgiler ve ayraçlar')]},
  {'id': 'cerceveler', 'name': 'Çerçeveler', 'subs': [T('cerceveler', 'Çerçeveler')]},
  {'id': 'balonlar', 'name': 'Konuşma balonları', 'subs': [T('balonlar', 'Konuşma balonları')]},
  {'id': 'etiketler', 'name': 'Etiketler ve rozetler', 'subs': [T('etiketler', 'Etiketler'), T('rozetler', 'Rozetler')]},
  {'id': 'susler', 'name': 'Dekoratif süsler', 'subs': [T('susler', 'Süsler')]},
  {'id': 'desenler', 'name': 'Desenler ve dokular', 'subs': [T('desenler', 'Arka plan desenleri'), T('dokular', 'Dokular')]},
  {'id': 'ikonlar', 'name': 'İkonlar', 'subs': [sub('iconpark', c['id'], c['name']) for c in park if c['id'] not in ('grafik-sekiller', 'soyut', 'oklar', 'karakterler', 'insanlar', 'yuz-ifadeleri')] + [{'id': 'tabler:*', 'pack': 'tabler', 'group': '*', 'name': 'Tabler (çizgi ikonlar)', 'count': next(p['count'] for p in packs if p['id'] == 'tabler')}]},
  {'id': 'karakterler', 'name': 'İnsanlar ve karakterler', 'subs': [sub('iconpark', 'insanlar', 'İnsanlar'), sub('iconpark', 'karakterler', 'Karakterler'), sub('iconpark', 'yuz-ifadeleri', 'Yüz ifadeleri')]},
  {'id': 'emoji', 'name': 'Emoji', 'subs': [{'id': f'emoji:{p["id"]}', 'pack': 'emoji', 'group': p['id'], 'name': p['name'], 'count': len(p['items'])} for p in emoji]},
  {'id': 'cikartmalar', 'name': 'Çıkartmalar', 'subs': [{'id': f'stickers:{p["id"]}', 'pack': 'stickers', 'group': p['id'], 'name': p['name'], 'count': len(p['items'])} for p in stick]},
  {'id': 'sosyal', 'name': 'Sosyal medya', 'subs': [sub('sosyal', 'sosyal', 'Platform logoları')]},
]
for c in cats: c['count'] = sum(s['count'] or 0 for s in c['subs'])
reg = {'version': 1, 'packs': packs, 'categories': cats,
       'skipped': [
         {'name': 'OpenMoji', 'reason': 'CC BY-SA 4.0: türev çalışmaların aynı lisansla paylaşılması gerekir.'},
         {'name': 'unDraw', 'reason': 'Lisansı illüstrasyonların başka bir kütüphane ya da araçta toplu olarak dağıtılmasını yasaklıyor.'},
         {'name': 'SVG Repo', 'reason': 'Her öğenin lisansı farklı; toplu alım lisans süzgecinden geçemez. Tek tek, lisansı kontrol edilerek yönetim panelinden eklenebilir.'},
         {'name': 'Noto Emoji', 'reason': 'Apache-2.0, uygun; ancak 24 MB. Fluent Emoji zaten var.'},
         {'name': 'Lottie animasyonları', 'reason': 'Düzenleyicide Lottie oynatıcı yok; çalışmayan öğe gösterilmez.'}]}
json.dump(reg, open(os.path.join(D, 'registry.json'), 'w'), ensure_ascii=False, indent=1)
os.remove(os.path.join(D, '.iconpark-cats.json'))
print(sum(p['count'] for p in packs), 'öğe;', [(c['name'], c['count']) for c in cats])
