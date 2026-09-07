# Stations muettes + Booking — dump 2026-09-03

Preuve : `docs/diagnostics/dumps/mute-stations-2026-09-03.json` (HTML gitignoré).
Dates sondées Booking : 13–20 fév. 2027, 4 adultes. Headless Chromium sandbox.

## Booking (sans jeton partenaire)

Le connecteur `booking-web` scrape le site public. **Pas** de Demand API.

Dump sandbox :

- GET `searchresults.fr.html?ss=Les+2+Alpes&checkin=2027-02-13…` → **202**
- Script `__challenge_…/challenge.js` puis `mp_verify`
- 302 vers `index.fr.html?errorc_searchstring_not_found=ss`
- **0** `property-card`, header = « Trouvez des offres pour chaque saison »

[VRAI] F2 challenge en headless sandbox. Le résolveur headed (déjà dans le dépôt) est le chemin live Electron. Inventaire 0 ici ≠ 0 logements sur le site.

Walk code : 15 pages, lien `offset=` de la SERP, arrêt si « N établissements trouvés » (`advertised`). Tests T2 + total annoncé 40 / 2 pages.

## Les Karellis

| URL | statut | constat |
|---|---|---|
| www.karellis.com | 200 WP | vitrine. Lien unique logements : `karellis-reservation.com/liste-offres-thematisee/` |
| www.karellis.com/hebergements/ | **404** | « Cette page n’existe pas » |
| www.karellis-reservation.com | **403** Cloudflare Turnstile (`Ray ID: a3533f11fdff13bc`) | pas de SERP datée |

[VRAI] toujours `not_wired`. Pas d’adapter inventé : 403 CF, 0 JSON logements.

## Vars (Alpes Sud Locations / Elloha)

www.alpes-sudlocations.com 200. Widget Elloha :

- `reservation.elloha.com/Widget/BookingEngine/6dec24ec-415c-4251-af67-baa0b206d31f?idoi=f74875ea-e624-4667-be17-ca8cf7fe84b6`
- `GetCalendarAvailability?idOi=f74875ea-…&idListPrestations=…` (calendrier, pas une liste de gîtes datée)
- reCAPTCHA invisible

[VRAI] pas une SERP logements. Liens vitrine : Hôtel Écureuil, ARYA Living Stone. Reste `not_wired`.

## Les Angles

| URL | statut | constat |
|---|---|---|
| lesangles.com/tous-les-hebergements/ | 200 WP | catalogue SEO (fiches `/hebergement/refuge-cal-chalon/` …). Pas de dates, pas de prix séjour. |
| reservation.lesangles.com | 200 | widget **Open System** `gadget.open-system.fr/widgets/themes/api15/rel/themes/lesangles/` — panier vide |

[VRAI] centrale = Open System (déjà un connecteur pour d’autres stations), mais le dump n’a pas de SERP datée ni de vueinfo. On ne branche pas un parseur sur un panier vide.

## Interdit

Pas de parseur Karellis / Elloha / Angles tant qu’un dump SERP datée + occupancy + prix n’existe pas.
