# Chamonix — Orchestra / Ceto (`booking.chamonix.com`)

## Plateforme

- Front : `https://booking.chamonix.com/fr/`
- Moteur : **Orchestra PMB** (Ceto), canal `CMB`
- `station-web` (Ingénie) : **non applicable** — message « pas de moteur Ingénie »

## Stations desservies

| Destination app | `ref_c.LOCATION` |
|-----------------|------------------|
| Chamonix / Chamonix-Mont-Blanc | `cmb.chamonix` |
| Les Houches | `cmb.houches` |
| Vallorcine | `cmb.vallorcine` |
| Argentière | `cmb.argentiere` |
| Servoz | `cmb.servoz` |

## Endpoints

| Rôle | URL |
|------|-----|
| Config moteur | `GET /fr/module/searchEngine` |
| Filtres | `GET /fr/module/filterEngine?{query}` |
| SERP hôtels | `GET /fr/serpHotel?s_c.ACCOMMODATION=hotel&s_checkinDate=&s_checkoutDate=` |
| SERP appartements | `GET /fr/serp?s_c.ACCOMMODATION=chalet,apartment&s_c.PAX.*` |
| SERP résidences | `GET /fr/serpResidence?…` |
| Pagination | `POST /fr/ajax/more/serpHotel?…&page=N&byPage=20` body=`/fr/serpHotel` |
| Avis TripAdvisor | `GET /api/proxy/tripadvisor-reviews/{taLocationId}` |

## Fiches SERP (HTML)

`article.cpt-result` :

- `data-link` — URL + hash dates `#s_checkinDate=…&s_checkoutDate=…&s_channel=CMB`
- `data-product` — JSON `{ id, title, stars, stationLocation, url, img }`
- `data-geolocation` — GeoJSON
- `.result-subtitle` — **commune** (filtre lieu)
- `.price` — prix séjour
- widget TA : `data-id` = **tripadvisorLocationId** (≠ id produit)

## Prototype

```bash
node tools/extract-chamonix.mjs --type hotel --location cmb.houches \
  --from 2026-12-19 --to 2026-12-26 --with-reviews
```

Fonctionnalités : parse DOM, pagination soft-fail, circuit-breakers host/pagination/avis, cache avis TTL 6 h, dédup TA id.

## Suite intégration

```
src/main/providers/ceto/
  chamonix.ts   # LOCATION_MAP + search()
  extract.ts    # logique issue de tools/extract-chamonix.mjs
```

Enregistrer dans `providers/index.ts` et exclure `booking.chamonix.com` de `station-web`.
