# Découverte Sancy — 2026-09-01 (round 9)

Parseur **non écrit**. Liste Diffusio datée, chambres seulement sur la fiche,
prix = fourchette / semaine.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| `lae-dispo-accueil.js` | 200 | `id1[d]=~YYYY-MM-DD~YYYY-MM-DD` + `id1[prestation]=resa` |
| SERP datée | 200 | **142 résultats**, 13–20 fév. 2027, widget `lae-diffusio` |
| carte `.list-item-TFO2809643` | — | capacité 8, **0 chambre, 0 prix** |
| fiche TFO2809643 | 200 | 8 pers, **3 chambres**, « Semaine : de 770 à 2 000 € » |
| superbess.com | 200 | domaine à vendre (GoDaddy) |

## Contrat dumpé

- URL : `/hebergement/tous-les-hebergements-sancy/?id1[d]=~from~to&id1[prestation]=resa`
- Sélecteur cartes : `.list-item.list-item-TFOxxxxxxxx`
- Fiches : `/fr/fiche/hebergement-locatif/{slug}_TFO{id}/`

## Ce qu’on n’écrit pas

Connecteur Diffusio : chambres absentes de la SERP, tarif non daté.
Le plancher 4 chb écarterait toutes les cartes (`bedrooms` null).
