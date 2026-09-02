# discovery_vrbo.md

**Status : LIVE_VIA_COZYCOZY** — dumps 2026-09-01 (SERP 429) + 2026-09-02 (getResultList Abritel).

vrbo.com et abritel.fr **refusent** le relevé direct. L’inventaire Abritel (VRBO France)
est déjà dans CozyCozy `GET /api/getResultList` sur la SERP datée
`/fr/search/{lieu}/{from}/{to}/{chambres}-{adultes}-{enfants}/results`.

C’est le chemin pérenne : pas de SERP 429, pas de parseur inventé.

## Ce que le code fait

- Provider `vrbo-web` : ouvre **la SERP CozyCozy datée** (`cozycozySearchUrl`),
  intercepte `getResultList` / `getResults`, filtre `providerCode=abritel|vrbo|homeaway`.
  `src/main/providers/webscrape/providers.ts` `createVrboWebProvider`
- Parseur dump-prouvé : occupancy `subTitleDetails`, total séjour
  `highlightedResults[0].totalPrice` (`indicative: false`), photo
  `lightThumbnails.firstUrls[0]`, GPS `coordinates`, dates `fromDate`/`toDate`.
  `webscrape/cozyResultList.ts`
- Deeplink affilié → URL Abritel canonique (`destination:https://www.abritel.fr/…`,
  sans `mpd`/`mpe`). Un total aux dates demandées = **disponible**.
- `extractVrboCards` reste le repli HTML (uitk-card) si un jour une SERP VRBO
  n’est plus 429 — **non utilisé** tant que CozyCozy répond.
- `vrboSearchUrl` (vrbo.com/search) est **documenté**, plus appelé par le provider.

## FOUND (dumps)

| id | HTTP | quoi |
| --- | --- | --- |
| `vrbo_p1.html` | **429** | `Bot or Not?` — pas de DOM de SERP |
| `abritel_p1.html` | **429** | `Robot ou pas robot ?` |
| `cozy-vrbo-d2a-listings.json` | **200** | Les 2 Alpes 13–20 fév. 2027, 8p/4chb : 9 fiches Abritel uniques. Ex. 11032591 « Beau Duplex Familial » 8 pers / 4 chb, **3363,28 €** séjour, photo `media.vrbo.com`, `https://www.abritel.fr/location-vacances/p6410325a` |
| `cozy-vrbo-meribel-listings.json` | **200** | Méribel, même fenêtre : 10 fiches Abritel (capacité complète) |

Sélecteurs de cartes sur vrbo.com / abritel.fr : `[data-stid="property-listing"]` = 0, `uitk-card` = 0. Challenge Expedia, pas un parseur à écrire.

## Règles

- Ne jamais multiplier un tarif /nuit ou /semaine Abritel.
- Ne pas traiter un teaser « à partir de » comme un séjour.
- `totalPrice.indicative === true` → ignoré.
- Capacité : uniquement `subTitleDetails.guestCapacity` / `bedRoomCount` (libellés JSON). Les « 6 6 13 » HTML CozyCozy ne sont **pas** lus.
