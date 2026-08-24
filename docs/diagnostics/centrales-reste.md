# Centrales — état final du relevé (`fix/centrales-prix-reels`)

Un hôte n’est `live` que si un extracteur peut renvoyer un **TOTAL daté**.
Dernier passage : toutes les stations du référentiel ont une URL (desk live,
lien vitrine, ou blocked), sauf **Cambre d’Aze** (domaine en vente). Couverture référentiel : **112 live / 58 link / 3 blocked / 1 none**.

## `blocked` (robots.txt `Disallow: /`) — ne pas contourner

| Station | Hôte |
|---|---|
| Combloux | `reservation.combloux.com` |
| Montgenèvre, Les Alberts | `reservation.montgenevre.com` |

## `link` — moteur identifié ou vitrine, pas de TOTAL meublé

| Station | Hôte | Raison |
|---|---|---|
| Les 7 Laux, Prapoutel, Le Pleynet | `reservation.les7laux.com` | OS forfaits, `etape-rest` `items:[]`. |
| Vaujany, Auris | OS activités oisans-tourisme | Pas de catalogue meublé. |
| Alpe du Grand Serre | `reservation.matheysine-tourisme.com` | OS, catalogue meublé vide. |
| `www.valfrejus.com` | `vueId: null` | Desk live = HMV `ac51-valfrejus.htm`. |
| Super-Besse, Le Mont-Dore | `www.sancy.com` | CMS Sancy, pas d’API. |
| Vars, Praz de Lys | Elloha | Calendrier, pas d’API search. |
| La Clusaz | Apidae + e-liberty | Pas de TOTAL. |
| Les Karellis | Cloudflare 403 | Pas de Playwright. |
| Les Angles | 403 / SPA | Pas de Playwright aveugle. |
| Les Arcs, Pra Loup | Yoplanning SPA | `/api/1/item` = Rollbar, pas un catalogue. |
| Guzet | `guzet.ski` | Forfaits, pas de meublé. |
| Lioran, Métabief, Luz, Sauze, Brides, Morillon, Sixt, Aulps, Abondance, Capcir, Superbagnères, Lac Blanc, Pierre Saint-Martin, Iraty, Azun, Chioula, Brasses, Glières, Méaudre, Gap, Beuil, Pilat, Hotonnes | vitrines OT | Pas de formulaire daté. Chioula = ScriptsLoader Ingénie sans `datedeb`. Pilat = gadget OS analytics sans `vueId`. |

## `live` ajoutés sur cette branche

Ingénie : Les Rousses, Manigod, Bellefontaine, alias 2 Alpes 1800, Gets, Féclaz, Hauteluce, Peisey-Nancroix, Landry.

Open System : N-PY (vueId **1448** partagé), HMV `ac51` Valfréjus / `ac63` Bessans.

Ublo/MSEM : Oz `523`, Saint-Gervais `569`, Flaine `320`, Isola, Valberg, Montclar, Écrins, Léman.

Ceto : Montchavin `MC`.

## Sans URL

Cambre d’Aze (`cambredaze.fr` domaine en vente). Guzet recollé sur `guzet.ski` (link).

## Multi-villages

Val d’Arly : `stationVillage.ts` branché. HMV : URL `acXX`. Plagne : `s_c.location`. Les Arcs : pas d’URL générique Peisey.

## Non négociable

Pas de faux `live`. Pas de contournement robots. Pas d’OTA hors connecteurs existants.
