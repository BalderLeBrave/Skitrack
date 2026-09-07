"""Télécharge les photos retenues (Commons, ≤1600 px) et met à jour stationPhotos.json.
Usage : python3 tools/commons-fetch.py "<slug>=<cle>:<index>" ...
"""
import json, sys, os, re, urllib.request, urllib.parse, html

UA = {'User-Agent': 'skitrack-dev/1.0 (photo import; contact dev@example.com)'}
IMG = '/app/src/renderer/src/assets/img'
CRED = '/app/src/renderer/src/data/stationPhotos.json'
credits = json.load(open(CRED))


def thumb1600(title):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(
        {'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|size', 'iiurlwidth': 1600, 'format': 'json'})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        j = json.load(r)
    ii = list(j['query']['pages'].values())[0]['imageinfo'][0]
    return ii.get('thumburl') or ii['url'], ii['thumbwidth'], ii['thumbheight']


def strip_html(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip() or None


for arg in sys.argv[1:]:
    slug, ref = arg.split('=', 1)
    key, idx = ref.split(':')
    c = json.load(open(f'/tmp/cands/{key}.json'))[int(idx)]
    url, w, h = thumb1600(c['title'])
    dest = f'{IMG}/station-{slug}.jpg'
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r, open(dest, 'wb') as f:
        f.write(r.read())
    prev = credits.get(slug, {})
    credits[slug] = {
        'station': prev.get('station') or slug,
        'massif': prev.get('massif') or '',
        'titre': c['title'],
        'auteur': strip_html(c['artist']),
        'licence': c['licence'],
        'page': c['page'],
        'largeur': w,
        'hauteur': h,
        'fichier': f'station-{slug}.jpg',
        'description': strip_html(c['desc']),
        'distanceM': None,
        'neigeDite': True,
        'moisPriseDeVue': None,
    }
    print(slug, '←', c['title'], w, h, c['licence'], os.path.getsize(dest))

json.dump(credits, open(CRED, 'w'), ensure_ascii=False, indent=2)
