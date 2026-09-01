# Découverte CozyCozy — 2026-09-01

Parseur `extractCozycozyCards` : sélecteur dumpé `article.hoj_seo_card` sur la page
catalogue. **Pas** de `getResultList`. Pas de connecteur JSON inventé.

## Contournement

`https://www.cozycozy.com/fr/location-vacances-les-2-alpes`

- HTTP 200, **3729 offres**, 28 `article.hoj_seo_card`
- Prix « À partir de N € / nuit », capacité parfois dans le texte
- Pas de href `/offer` : bouton « Voir ». Ancien extracteur = 1 faux positif FAQ
- `/fr/search?location=Les+2+Alpes` reste une SPA vide (`launch` jamais appelé)
- `/s/les-2-alpes` = 404

Le bouton **Rechercher** de cette page :

1. POST `/api/searchInputLocation` `{"query":"Les Deux Alpes (station de ski), France","siteCode":"cozycozy","locale":"fr-fr"}` → 200, lieu + GPS 45.008922, 6.170614
2. POST `logPrelaunch` (searchId, dates par défaut, 2 adultes)
3. POST `logNonResultRedirect` → **Booking.com** affiliate

Ce n’est **pas** `getResultList`. Catalogue SEO ≠ disponibilité datée.

## Contrat bundle (inchangé)

- `searchByText` → `searchInputLocation({q, siteCode, locale})` — désormais dumpé en POST same-origin `/api/…`
- `launch({searchId})` / `getResultList` : toujours 0 appel
