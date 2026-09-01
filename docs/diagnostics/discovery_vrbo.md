# discovery_vrbo.md

**Status : CAPTURED_BLOCKED** — dumps 2026-09-01. HTML brut **non versionné**.
Preuve : `dumps/capture-report.json` + extraits ci-dessous.

## Ce que le code dit

- URL : `https://www.vrbo.com/search?destination=…&startDate=&endDate=&adults=&startIndex=`
  `src/main/providers/webscrape/urls.ts` `vrboSearchUrl`
- Extracteur : `[data-stid="property-listing"]`, `uitk-card`, href `/\d{4,}/`
  `extractors.ts` `extractVrboCards` — **prix requis** — **inchangé** (pas de SERP)
- Pagination : `startIndex` pas 50, max 5 pages (`VRBO_PAGE_SIZE = 50`)
- Sidecar : `[data-testid="listing"]` (forme Airbnb) — **autre sélecteur**, non appelé par l’UI
- Blocage : `pageLooksBlocked` reconnaît désormais « Bot or Not? » / « Robot ou pas robot »

## FOUND (dumps 2026-09-01)

| id | HTTP | title | body (extrait) |
| --- | --- | --- | --- |
| `vrbo_p1.html` | **429** | `Bot or Not?` | `Show us your human side... We can't tell if you're a human or a bot.` |
| `abritel_p1.html` | **429** | `Robot ou pas robot ?` | `Vous êtes humain, n’est-ce pas ?` |

Sélecteurs de cartes sur ces pages : `[data-stid="property-listing"]` = 0, `uitk-card` = 0, JSON-LD = 0, recaptcha iframe = 0, Cloudflare iframe = 0. C’est un challenge Expedia, pas un DOM de SERP.

Avant ce dump, `looksBlocked` testait `are you a robot` — **aucune** de ces deux phrases ne matchait. Un 0 live serait sorti `selector_miss`. Désormais : `blocked`.

## MISSING / NEXT

- MISSING : search p1 **de résultats**, p2, listing, studio, indisponible
- NEXT_PART : le challenge 429 n’est **pas** un parseur à écrire. CaptchaSolver / STEALTH / proxy déjà en place. Pas de nouveau kit WAF. `extractVrboCards` **non retouché**.
