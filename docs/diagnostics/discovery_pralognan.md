# Découverte Pralognan — 2026-09-01, connecteur 2026-09-02

Parseur **écrit** d’après le dump : `src/main/providers/locvacances/`.
Cartes datées + pièces (convention française, pas des chambres).

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| `pralognan_dated` | 200 | `#startDate` 05/09/2026 → `#endDate` 12/09/2026 |
| `getNB` daté | 200 | `26 Résultats` (cases pax 8+) |
| `getListe` daté | 200 | 12 × `.Card.Card_Lots`, **tarif séjour** (0 « à partir de ») |
| getListe froid | 200 | session cookies + `id=dd\|df\|criteres\|getListe` → 12 cartes, getNB « 87 Résultats » |
| fiche lot 111 | 200 | 1 300 €, 6 pièces, 12 pers. |
| getFiche lot 513 | 200 | carte « Chalet - 12 personnes » → fiche `<h5>5 pièces mezzanine \| … \| 12 personnes</h5>` + `initGmap` |
| `getRates?lot_no=111&dd=&df=` | 200 | Grille semaines (sept. 2026, janv./mars 2027) |
| `getNB` 13–20 fév. 2027 | 200 | « plus de disponibilités » — fév. absent de la grille |

## Contrat dumpé

Dates en session, pas en query `getListe` (le GET `dd`/`df` sur getListe marche aussi à froid) :

1. Home → `PHPSESSID`
2. `id=dd&dd=` puis `id=df&dd=&df=` puis `id=criteres`
3. `id=getListe&page=` / `id=getNB`
4. Fiche si pièces absentes : `id=getFiche&lot_no=`

Carte datée : `.Card_Price` = `1 300 €` · `6 pièces - 12 personnes` · `/reservation/resultats/{lot}/`.

## Ce qu’on n’écrit pas

« Lits doubles : 4 » n’est pas un nombre de chambres. Février 2027 : 0 stock
(mesure, pas un échec de sélecteur).
