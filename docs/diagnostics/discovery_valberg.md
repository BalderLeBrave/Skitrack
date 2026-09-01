# Découverte Valberg — 2026-09-01

Centrale `www.valberg.com`. **Pas de parseur HTML.** Même connecteur
`ublo-msem` qu’Isola : liste + offres JSON.

## Captures

| id | méthode | HTTP | ce qu’on lit |
| --- | --- | --- | --- |
| `valberg_reserver` | Playwright `/sejourner/reserver-votre-sejour/` | 200 | widget-msem.js, recaptcha |
| map-config | XHR `services.msem.tech/api/location/map-config?r=665` | 200 | `{id:665, libelle:"Valberg-Beuil"}` |
| tunnel | XHR `api/tunnel/offers/OT-665/665` | 200 | canal `OT-665` |
| list | GET `api/lodging/resort/665/OT-665?language=fr&facet=0` | 200 | **40** logements |
| offers 2p | POST `api/lodging/resort/665/offers` 13–20 fév. 2027, 2 adultes | 200 | **19** tarifs > 0 |
| offers 8p | même semaine, 8 adultes | 200 | **0** tarif (inventaire, pas un trou d’ids) |
| fiche | GET `/hebergements/test-slug` | 404 | pas de fiche par slug |

Preuve compacte : `dumps/msem-valberg-ecrins.json`. HTML brut local, non commis.

## Ce que le dump montre

1. WordPress + widget MSEM. La home ne dit pas le moteur ; l’XHR si.
2. `channel` = `OT-665`, `resort` = 665 — relevés sur l’appel, pas extrapolés.
3. Page d’entrée `/sejourner/reserver-votre-sejour/`. Le patron
   `/hebergements/{slug}` des centrales Next.js Ublo y rend 404 →
   `UBLO_ENTRY_ONLY`.
4. Catalogue : maxCapacity / nbRooms présents (ex. Ancolies T3 5 pers. /
   3 pièces, Chalet Luane 8 pers. / 6 pièces). La semaine 8 pers. de février
   2027 n’a simplement **aucun tarif**.

## Ce qu’on n’a pas

- Parseur HTML de cartes
- Inventaire daté pour 8 pers. cette semaine (0 offre, mesuré)

## Motif désormais

`familyOfHost('www.valberg.com')` = `ublo`. `emptyStationReason` → `delegated`.
