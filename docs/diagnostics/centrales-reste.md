# Centrales — état final du relevé (`fix/centrales-prix-reels`)

Un hôte n’est `live` que si un extracteur peut renvoyer un **TOTAL daté**.
Dernier passage : toutes les stations du référentiel ont une URL (desk live,
lien vitrine, ou blocked), Dernier passage : **toutes** les stations du référentiel ont une URL
(desk live, lien vitrine, ou blocked). Couverture : **112 live / 59 link / 3 blocked / 0 none**.

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
| Les Karellis | `karellis-reservation.com` | Desk France Montagnes. Cloudflare 403 depuis le sandbox. Pas de Playwright. |
| Vars, Praz de Lys | Elloha | `GetCalendarAvailability` = dates d’arrivée, **pas de prix**. `Search/Index` HTML sans TOTAL. |
| Les Angles | 403 / SPA | Pas de Playwright aveugle. |
| Les Arcs, Pra Loup | Yoplanning SPA | `/api/1/item` = Rollbar, pas un catalogue. |
| Guzet | `guzet.ski` | Forfaits, pas de meublé. |
| Cambre d’Aze | `eyne.fr/les-loisirs/hebergement` | Annuaire communal, pas de moteur. `cambredaze.fr` est en vente. |
| Lioran, Métabief, Luz, Sauze, Brides, Morillon, Sixt, Aulps, Abondance, Capcir, Superbagnères, Lac Blanc, Pierre Saint-Martin, Iraty, Azun, Chioula, Brasses, Glières, Méaudre, Gap, Beuil, Pilat, Hotonnes | vitrines OT | Pas de formulaire daté. Chioula = ScriptsLoader Ingénie sans `datedeb`. Pilat = gadget OS analytics sans `vueId`. |

## `live` ajoutés sur cette branche

Ingénie : Les Rousses, Manigod, Bellefontaine, alias 2 Alpes 1800, Gets, Féclaz, Hauteluce, Peisey-Nancroix, Landry.

Open System : N-PY (vueId **1448** partagé), HMV `ac51` Valfréjus / `ac63` Bessans.

Ublo/MSEM : Oz `523`, Saint-Gervais `569`, Flaine `320`, Isola, Valberg, Montclar, Écrins, Léman.

Ceto : Montchavin `MC`.

## Sans URL

## Sans URL

Aucune. Séez recollé sur la vitrine Les Arcs.

## Multi-villages

Val d’Arly : `stationVillage.ts` branché. HMV : URL `acXX`. Plagne : `s_c.location`. Les Arcs : pas d’URL générique Peisey.

## Navigateur des scrapers

Obscura (CDP) est **opt-in** (`SKITRACK_BROWSER=obscura`). Défaut Chromium :
v0.2.1 **SIGSEGV** sur `reservation.les2alpes.com` (Maps/jQuery). example.com
passe. `fetch` MSEM, Open System, Ceto HTML inchangés. Pas de `--stealth`.

## Non négociable

Pas de faux `live`. Pas de contournement robots. Pas d’OTA hors connecteurs existants.
