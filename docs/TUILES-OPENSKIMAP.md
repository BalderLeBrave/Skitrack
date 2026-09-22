# Tuiles OpenSkiMap — les nôtres

OpenSkiMap interdit l'usage direct de ses tuiles :

> Direct use of tiles hosted at tiles.openskimap.org is not permitted. Please
> prepare and host your own tiles using the data from openskidata.org instead.
> — https://openskimap.org/?about

Son serveur l'applique : à toute origine autre que la sienne (et `localhost`,
ce qui rend un essai local trompeur), il rend une tuile portant « Unauthorized
use of OpenSkiMap.org tiles ». Skitrack bâtit donc ses tuiles, comme ils le
demandent, à partir des données ouvertes d'openskidata.org, et les dessine
avec les couches de leur style.

## Ce que ça produit

| Fichier | Rôle | Versionné |
|---|---|---|
| `public/carte/openskimap-europe.pmtiles` | Les tuiles : pistes, remontées, domaines, points des 50 pays du périmètre, z0–z14, un seul fichier PMTiles (135 Mo) | **non** — trop lourd pour GitHub et Vercel, voir *Hébergement* |
| `src/lib/carte/openskimap.style.json` | Le style : les 40 couches de pistes d'OpenSkiMap et les 125 couches de fond, sources remplacées | oui |
| `public/carte/sprite-ski*.{png,json}` | Les 12 icônes de ski (demi-tube, gare, traversée, sens unique, DVA), redessinées | oui |
| `public/fonts/glyphes/` | Open Sans Semibold (étiquettes des pistes) et Noto Sans (fond), 18 plages par police (latin, grec, cyrillique, arménien, géorgien, ponctuation…) — 5,3 Mo, par `scripts/extraire-glyphes.py` | oui |

Sources d'exécution, toutes à un usage permis et créditées sur la carte :
le fond vectoriel d'**OpenFreeMap** (© OpenMapTiles, données OpenStreetMap),
l'ombrage de **Mapterhorn**, nos tuiles (© OpenSkiMap.org · © OpenStreetMap
contributors).

## Régénérer

```bash
# 1. Les quatre jeux d'openskidata.org (1 Go décompressé), dans un dossier de travail
curl -L https://tiles.openskimap.org/geojson/runs.geojson      -o travail/runs.geojson
curl -L https://tiles.openskimap.org/geojson/lifts.geojson     -o travail/lifts.geojson
curl -L https://tiles.openskimap.org/geojson/ski_areas.geojson -o travail/ski_areas.geojson
curl -L https://tiles.openskimap.org/geojson/spots.geojson     -o travail/spots.geojson

# 2. Découpe au périmètre, en flux (pip install ijson) — 40 s
npm run tuiles:filtrer -- travail travail

# 3. Tuilage — 1 min, 12 Go de tas Node
npm run tuiles:batir -- travail public/carte/openskimap-europe.pmtiles
#    --z 15 pour l'identique à OpenSkiMap (223 Mo) ; z14 par défaut (135 Mo), sans différence visible

# 4. Seulement si le style d'OpenSkiMap a changé
npm run tuiles:style

# 5. Seulement si les icônes changent (pip install pillow)
npm run tuiles:sprite

# 6. Seulement si les polices ou les plages de glyphes changent (74 Mo téléchargés)
python scripts/extraire-glyphes.py
```

En développement comme en aperçu, `scripts/pmtiles-range-plugin.mjs` sert le
fichier par tranches (`Range`), ce que le serveur statique de Vite ne fait
pas ; sans lui, la carte locale n'aurait aucune piste.

Le tuilage se termine par une relecture avec le lecteur PMTiles officiel et le
décodage de trois tuiles ; il échoue si l'une manque.

## Ce qui est identique à OpenSkiMap, et ce qui ne l'est pas

Identique : les données (mêmes jeux, même jour), les quatre couches et leurs
zooms de départ, les attributs — calculés par `openskidata-format`, leur
propre paquet — et le style. Ce qui diffère : le découpage passe par
geojson-vt au lieu de tippecanoe (un binaire Linux, absent ici), le zoom
maximal est 14 au lieu de 15 par défaut, et quatre attributs que le style ne
lit jamais (`skiAreas`, `stationIds`, `tunnel`, `difficulty`) sont omis. Voir
l'en-tête de `scripts/build-tuiles-openskimap.ts`.

## Hébergement

Le fichier ne va pas dans le dépôt (GitHub refuse au-delà de 100 Mo, Vercel
Hobby aussi). En local, il suffit qu'il soit dans `public/carte/`. En
production, deux voies :

1. **Un stockage à part** qui sert les requêtes `Range` avec CORS — Vercel
   Blob, Cloudflare R2, un S3 public. Y déposer le fichier, puis donner son
   adresse à l'application : `VITE_TUILES_OPENSKIMAP=https://…/openskimap-europe.pmtiles`.
2. **Git LFS** sur `public/carte/*.pmtiles`, si le projet Vercel l'active.

Sans le fichier, la carte se dessine sans pistes et la console dit pourquoi ;
rien d'autre ne casse.
