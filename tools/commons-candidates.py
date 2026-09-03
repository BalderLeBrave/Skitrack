"""Cherche sur Wikimedia Commons des photos d'hiver candidates et écrit une planche-contact.
Usage : python3 tools/commons-candidates.py "<cle>=<requete>" ... → /tmp/cands/<cle>.json + /tmp/cands/<cle>.jpg
"""
import json, sys, os, urllib.request, urllib.parse
from PIL import Image, ImageDraw

UA = {'User-Agent': 'skitrack-dev/1.0 (photo import; contact dev@example.com)'}
OUT = '/tmp/cands'
os.makedirs(OUT, exist_ok=True)


def api(params):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


def search(q, limit=24):
    j = api({'action': 'query', 'generator': 'search', 'gsrsearch': q, 'gsrnamespace': 6,
             'gsrlimit': limit, 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 480, 'format': 'json'})
    out = []
    for p in j.get('query', {}).get('pages', {}).values():
        ii = p['imageinfo'][0]
        m = ii.get('extmetadata', {})
        lic = m.get('LicenseShortName', {}).get('value', '')
        if ii['width'] < 1400 or ii['width'] < ii['height'] * 1.1:
            continue
        if not any(k in lic for k in ('CC', 'Public domain', 'CC0')):
            continue
        out.append({'title': p['title'], 'w': ii['width'], 'h': ii['height'], 'licence': lic,
                    'artist': m.get('Artist', {}).get('value', ''), 'page': ii['descriptionurl'],
                    'url': ii['url'], 'thumb': ii['thumburl'], 'desc': m.get('ImageDescription', {}).get('value', '')[:160]})
    return out[:12]


def sheet(key, cands):
    tiles = []
    for c in cands:
        try:
            with urllib.request.urlopen(urllib.request.Request(c['thumb'], headers=UA), timeout=30) as r:
                im = Image.open(r).convert('RGB')
            im.thumbnail((320, 220))
            tiles.append(im)
        except Exception as e:
            tiles.append(Image.new('RGB', (320, 220), (200, 60, 60)))
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    W = Image.new('RGB', (cols * 330, max(1, rows) * 250), 'white')
    d = ImageDraw.Draw(W)
    for i, im in enumerate(tiles):
        x, y = (i % cols) * 330, (i // cols) * 250
        W.paste(im, (x + 5, y + 5))
        d.text((x + 8, y + 230), f"{i} {cands[i]['title'][5:45]}", fill='black')
    W.save(f'{OUT}/{key}.jpg', quality=70)


for arg in sys.argv[1:]:
    key, q = arg.split('=', 1)
    cands = search(q)
    json.dump(cands, open(f'{OUT}/{key}.json', 'w'), ensure_ascii=False, indent=1)
    sheet(key, cands)
    print(key, len(cands))
