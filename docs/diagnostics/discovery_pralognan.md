# Découverte Pralognan — 2026-09-01 (round 7)

Parseur **non écrit**. Cartes datées dumpées ; **chambres absentes**.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| `pralognan_dated` | 200 | `#startDate` 05/09/2026 → `#endDate` 12/09/2026 |
| `getNB` daté | 200 | `26 Résultats` (cases pax 8+) |
| `getListe` daté | 200 | 12 × `.Card.Card_Lots`, **tarif séjour** (0 « à partir de ») |
| fiche lot 111 | 200 | 1 300 €, 6 pièces, 12 pers., **LITS DOUBLES : 4** |
| `getRates?lot_no=111&dd=&df=` | 200 | Grille semaines (sept. 2026, janv./mars 2027) |
| `getNB` 13–20 fév. 2027 | 200 | « plus de disponibilités » — fév. absent de la grille |

## Contrat dumpé

Dates en session, pas en query `getListe` :

1. `#startDate` change → `getCombos('df')` (`id=df&dd=`)
2. `#endDate` change → `GET id=criteres&dd=&df=&ctxt=`
3. `id=getListe` / `id=getNB` lisent la session
4. Fiche : `id=getRates&lot_no=&lot_site_no=0&dd=&df=`

Carte datée : `.Card_Price` = `1 300 €` · `6 pièces - 12 personnes` · `/reservation/resultats/{lot}/`.

## Ce qu’on n’écrit pas

Un parseur. `bedrooms` n’est nulle part (carte ni fiche). Le plancher 4 chb
écarterait tout. « Lits doubles : 4 » n’est pas un nombre de chambres.
Février 2027 : 0 stock (mesure, pas un échec de sélecteur).
