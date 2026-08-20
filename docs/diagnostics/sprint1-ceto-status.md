# Sprint 1 Ceto — statut

## Sur `master`

- `src/main/providers/ceto/hosts.ts`
- `src/main/providers/ceto/chamonix.ts`

## À copier depuis le workspace (ou `artifacts/sprint1-ceto/`)

```
src/main/providers/ceto/chamonixExtract.ts   # extracteur SERP (requis)
src/main/providers/index.ts                  # register createCetoChamonixProvider
src/main/providers/station/station.ts        # skip Orchestra hosts
src/renderer/src/data/runProviderSearch.ts   # label + prix partial
src/renderer/src/data/deeplinks.ts           # hash dates Chamonix
```

## Smoke test

```bash
node --experimental-strip-types src/main/providers/ceto/chamonixExtract.ts
# Les Houches hotel: count 3, prix > 0
```

## Comportement attendu dans l'app

1. Domaine Les Houches / Chamonix + dates → source **Chamonix Réservation**
2. Offres avec prix du séjour uniquement
3. Clic annonce → hash `#s_checkinDate=…&s_checkoutDate=…` (prix sans re-rechercher)
4. station-web ne tente plus booking.chamonix.com
