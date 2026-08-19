# Intégration Skitrack — calendrier / centrals

## Fichiers

| Path | Action |
|------|--------|
| `src/main/providers/station/centrals.ts` | Remplacé (nettoyé + OTA + antiBot) |
| `src/main/providers/airbnb/calendarBlocks.ts` | **Nouveau** — détection dates bloquées + décalage week-end |
| `src/main/providers/airbnb/scrape.ts` | Patch : diagnostic si 0 annonce |

## Patch scrape.ts (manuel si besoin)

Après extraction, si `listings.length === 0` :

```ts
import { diagnoseEmptySearch } from './calendarBlocks'

// ...
if (payload.listings.length === 0) {
  const diag = await diagnoseEmptySearch(page, params.checkIn ?? '', params.checkOut ?? '')
  if (diag.blocked && diag.suggestion) {
    return {
      ok: false,
      error:
        `Dates indisponibles` +
        (diag.message ? ` (« ${diag.message} »)` : '') +
        `. Essayer ${diag.suggestion.checkIn} → ${diag.suggestion.checkOut}` +
        (diag.suggestion.weeksShifted ? ` (+${diag.suggestion.weeksShifted} sem.)` : ''),
      url
    }
  }
  return {
    ok: false,
    error: 'Aucune annonce dans les données. Vérifiez les dates ou augmentez les scrolls.',
    url
  }
}
```

Option auto-retry (param `autoShiftDates: true`) : rappeler `scrapeAirbnbSearchOnce` avec les dates suggérées une fois.
