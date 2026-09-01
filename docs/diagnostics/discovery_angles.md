# Découverte Les Angles — 2026-09-01 (round 8)

Parseur **non écrit**. Open System **Produit** unitaire, pas un catalogue.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| fiche `refuge-cal-chalon` | 200 | `Widget.Instance("Produit", { idIntegration: 1395, ui: "OSMB-129086-1" })` |
| `integration/1300/1395.js` | 200 | `produit.login = "les-angles"`, panier `reservation.lesangles.com` |
| etape-rest `json-config-fournisseur` | 200 | `nbProduitsTotal: 1` |
| etape-rest `json-planning-openpro` | 200 | 1 produit, `cmax: 12`, IdFournisseur 129086 |
| `reservation.lesangles.com` | 200 | overlay panier vide, **0 vueinfo**, 0 Widget Recherche |
| `tous-les-hebergements` | 200 | classe CSS `widget-os` seulement |

## Contrat dumpé

- `integrationId`: 1395
- `login`: `les-angles`
- origine panier : `https://reservation.lesangles.com`
- zones (1395.js) : boutique 8717, sejour 8728, eliberty `zoneRech` 11538
- **Pas de `vueinfo.js` / `vueId` de catalogue.**

## Ce qu’on n’écrit pas

Brancher le connecteur Open System existant : sans `vueId` il rend `items: []`.
Un parseur du widget Produit d’une fiche n’est pas une SERP.
