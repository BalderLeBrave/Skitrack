# Découverte Sancy — 2026-09-01, connecteur 2026-09-02

Parseur **écrit** d’après le dump : `src/main/providers/diffusio/`.
Liste Diffusio datée, chambres et tarif semaine (fourchette) sur la fiche.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| `lae-dispo-accueil.js` | 200 | `id1[d]=~YYYY-MM-DD~YYYY-MM-DD` + `id1[prestation]=resa` |
| SERP datée | 200 / 500+HTML | widget « 142 résultats » ; HTML froid 19 TFO uniques (dump tronqué puis page entière ~209 ko) |
| carte `.list-item-TFO2809643` | — | capacité 8, **0 chambre, 0 prix** |
| fiche TFO2809643 | 200 | 8 pers, **3 chambres**, « Semaine : de 770 à 2 000 € » |
| fiche TFO4609656 (Mont-Dore) | 200 | **4 chambres**, 8 pers., « semaine à partir de 850 € », « Semaine : 850 à 1347 € » |
| superbess.com | 200 | domaine à vendre (GoDaddy) |

## Contrat dumpé

- URL : `/hebergement/tous-les-hebergements-sancy/?id1[d]=~from~to&id1[prestation]=resa`
- Sélecteur cartes : `.list-item.list-item-TFOxxxxxxxx` + `.capacite` + `.place`
- Fiches : `/fr/fiche/hebergement-locatif/{slug}_TFO{id}/`
- Chambres : `<li>N chambres</li>` ; tarif : fourchette semaine → `priceConfidence: partial`

## Ce qu’on n’écrit pas

Un tarif séjour daté. La fourchette « Semaine : 850 à 1347 € » n’est pas le
montant des dates demandées : on garde le plancher, marqué `partial`.
