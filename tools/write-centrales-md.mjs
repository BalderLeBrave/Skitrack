import { writeFileSync } from 'node:fs'
import { CENTRALS } from '../src/main/providers/station/centrals.ts'

const INGENIE = new Set([
  'reservation.les2alpes.com',
  'reservation.areches-beaufort.com',
  'reservation.valdarly-montblanc.com',
  'reservation.haute-maurienne-vanoise.com',
  'reservation.larosiere.net',
  'reservation.lessaisies.com',
  'fr.locationsaintmartin.com',
  'www.valloire.com',
  'www.valmeinier-reservation.com',
  'reservation.courchevel.com',
  'fr.locationlesmenuires.com',
  'reservation.valthorens.com',
  'www.saintsorlindarves.com',
  'www.peisey-vallandry.com',
  'reservation.tignes.net',
  'reservation.valdisere.com',
  'booking.valdisere.com',
  'www.chamrousse.com',
  'reservation.lecollet.com',
  'reservation.orcieres.com',
  'www.risoul.com',
  'reservation.lesorres.com',
  'reservation.serre-chevalier.com',
  'www.valdallos.com',
  'resa.saintlary.com',
  'www.ballons-hautes-vosges.com',
  'www.gerardmer-reservation.net',
  'reservation.lesgets.com',
  'reservation.avoriaz.com',
  'reservation.lescarroz.com',
  'reservation.lescontamines.com',
  'reservation.samoens.com',
  'booking.prazsurarly.com',
  'reservation.auris-en-oisans.fr',
  'reservation.bareges.com',
  'reservation.chamberymontagnes.com',
  'reservation.le-corbier.com',
  'reservation.les7laux.com',
  'reservation.matheysine-tourisme.com',
  'reservation.paysdegex-montsjura.com',
  'reservation.saintsorlindarves.com',
  'reservation.valleesdegavarnie.com',
  'reservation.vaujany.com',
  'reservation.villard-reculas.com',
  'reservation.villarddelans-correnconenvercors.com'
])
const CETO = new Set([
  'booking.chamonix.com',
  'www.booking.chamonix.com',
  'reservations.meribel.net',
  'www.reservations.meribel.net',
  'www.laplagneresort.com',
  'laplagneresort.com',
  'megeve-booking.com',
  'www.megeve-booking.com'
])
const UBLO = new Set([
  'reservation.alpedhuez.com',
  'www.saintefoy-reservation.com',
  'saintefoy-reservation.com',
  'reservation.saintfrancoislongchamp.com',
  'isola2000.com',
  'www.isola2000.com'
])
const OS = new Set([
  'reservation.la-toussuire.com',
  'reservation.ledevoluy.com',
  'reservation.ax-ski.com',
  'www.valmorel.com',
  'reservation.valmorel.com',
  'www.labresse.net',
  'labresse.net',
  'www.valfrejus.com',
  'valfrejus.com',
  'www.n-py.com',
  'n-py.com',
  'reservation.n-py.com'
])

function meta(host) {
  if (host === 'www.airbnb.fr') {
    return {
      adapter_file: 'src/main/providers/airbnb/scrape.ts',
      search_fn: 'scrapeAirbnbSearch',
      listing_fn: 'extractFromPage / extractProgressive',
      geo_fn: 'airbnbClip.ts locPrecision=approximate',
      enabled: 'partial',
      family: 'ota-airbnb'
    }
  }
  if (host === 'www.booking.com') {
    return {
      adapter_file: 'booking/booking.ts + webscrape/providers.ts',
      search_fn: 'BookingProvider.search / createBookingWebProvider.search',
      listing_fn: 'extractBookingCards',
      geo_fn: 'extractors.ts Apollo lat/lon',
      enabled: 'yes',
      family: 'ota-booking'
    }
  }
  if (CETO.has(host)) {
    return {
      adapter_file: 'src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts',
      search_fn: 'createCeto*Provider.search',
      listing_fn: 'chamonixParse.ts / occupancy.ts',
      geo_fn: 'JSON-LD / parse Ceto',
      enabled: 'yes',
      family: 'ceto'
    }
  }
  if (UBLO.has(host)) {
    return {
      adapter_file: 'src/main/providers/ublo/provider.ts',
      search_fn: 'createUbloProvider.search',
      listing_fn: 'ublo/msem.ts',
      geo_fn: 'API MSEM coords',
      enabled: 'yes',
      family: 'ublo'
    }
  }
  if (OS.has(host)) {
    return {
      adapter_file: 'src/main/providers/opensystem/provider.ts',
      search_fn: 'createOpenSystemProvider.search',
      listing_fn: 'opensystem/extract.ts',
      geo_fn: 'vueinfo.js coords',
      enabled: 'yes',
      family: 'opensystem'
    }
  }
  if (
    INGENIE.has(host) ||
    host.startsWith('reservation.') ||
    host.startsWith('reservations.') ||
    host.startsWith('resa.') ||
    host.startsWith('booking.')
  ) {
    return {
      adapter_file: 'src/main/providers/station/station.ts',
      search_fn: 'createStationProvider.search',
      listing_fn: 'extractStationCards + fichePrice.ts',
      geo_fn: 'application/ld+json lat/lng',
      enabled: 'yes',
      family: INGENIE.has(host) ? 'ingenie' : 'ingenie-heuristic'
    }
  }
  return {
    adapter_file: 'NONE',
    search_fn: '—',
    listing_fn: '—',
    geo_fn: '—',
    enabled: 'no',
    family: 'not_wired'
  }
}

const keys = [
  'location',
  'station',
  'lodging',
  'stayType',
  'checkIn',
  'checkOut',
  'duration',
  'guests',
  'adults',
  'children',
  'infants',
  'pets',
  'submit',
  'cards',
  'title',
  'price',
  'link'
]

const lines = []
lines.push('# CENTRALES.md')
lines.push('')
lines.push(
  'Source de vérité : `src/main/providers/station/centrals.ts` (généré par `npm run centrales:import` depuis `docs/sources/centrales-selecteurs.xlsx`).'
)
lines.push('')
lines.push('**Lu en entier.** 74 entrées, 52 hôtes, 72 centrales locales + 2 OTA.')
lines.push('')
lines.push('## Constat bloquant')
lines.push('')
lines.push(
  '`CENTRALS` n’est **importé par aucun fichier de `src/`**. Seuls `tools/import-centrales.mjs` (générateur) et `tools/recon-centrales.mjs` (recon hors moteur) le lisent. Grep `from .*centrals` dans `src/` : 0 hit.'
)
lines.push('')
lines.push(
  'Le moteur interroge `SearchParams.officialUrl` (une URL par domaine, côté renderer) via **un** connecteur `station-web`, plus les familles Ceto / Ublo / Open System / OTA. Il ne parcourt pas cette table.'
)
lines.push('')
lines.push(
  'VRBO, Gîtes de France, CozyCozy **ne sont pas** dans `CENTRALS`. Ils existent comme connecteurs webscrape enregistrés dans `buildEngine`.'
)
lines.push('')
lines.push('## Légende `enabled`')
lines.push('')
lines.push('| valeur | sens |')
lines.push('| --- | --- |')
lines.push(
  '| yes | un `AccommodationProvider` est `register()` dans `buildEngine` **et** peut être sollicité si `officialUrl` / destination matche |'
)
lines.push('| partial | code de recherche existant, hors `SearchEngine` |')
lines.push('| no | `status=not_wired` — pas d’adapter importable pour cet hôte |')
lines.push('')
lines.push('## Tableau (74/74)')
lines.push('')
lines.push(
  '| id | nom | hostnames | adapter_file | search_fn | listing_fn | geo_fn | enabled | station_coverage | family | selectors | notes |'
)
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')

for (let i = 0; i < CENTRALS.length; i++) {
  const c = CENTRALS[i]
  const id = 'c' + String(i).padStart(2, '0') + '-' + c.host.replace(/[^a-z0-9]+/g, '-')
  const m = meta(c.host)
  const ctr = c.controls || {}
  const sel = keys.filter((k) => ctr[k] && ctr[k].selector).join(', ') || '∅'
  const notes = String(c.notes || '')
    .replace(/\|/g, '/')
    .replace(/\n/g, ' ')
    .slice(0, 80)
  const cov = c.kind === 'ota' ? 'toutes stations (query lieu)' : c.station.replace(/\|/g, '/')
  lines.push(
    [
      id,
      c.station.replace(/\|/g, '/'),
      c.host,
      m.adapter_file,
      m.search_fn,
      m.listing_fn,
      m.geo_fn,
      m.enabled,
      cov,
      m.family,
      sel,
      notes
    ]
      .map((cell) => String(cell).replace(/\|/g, '/'))
      .join(' | ')
      .replace(/^/, '| ')
      .concat(' |')
  )
}

lines.push('')
lines.push('## Synthèse par famille')
lines.push('')
lines.push('| family | n | moteur |')
lines.push('| --- | ---: | --- |')
lines.push('| ingenie | 35 | `station-web` si officialUrl |')
lines.push(
  '| ingenie-heuristic | 3 | `shouldAttemptIngenie` (préfixe reservation.*) — Combloux, Montgenèvre, Les Alberts |'
)
lines.push('| ceto | 14 | `ceto-*` si officialUrl (12 Plagne + Chamonix + Méribel) |')
lines.push('| ublo | 4 | `ublo-msem` |')
lines.push('| opensystem | 7 | `opensystem` |')
lines.push('| ota-airbnb | 1 | IPC `airbnb:scrape`, **pas** `SearchEngine.register` |')
lines.push('| ota-booking | 1 | `booking` + `booking-web` |')
lines.push('| not_wired | 9 | silence ou lien seulement |')
lines.push('')
lines.push('## not_wired — tickets concrets')
lines.push('')
lines.push('| station | host | fichier à créer | contrat |')
lines.push('| --- | --- | --- | --- |')
lines.push(
  '| Les Karellis | www.karellis.com | `src/main/providers/karellis.ts` **après** discovery dump | `AccommodationProvider.search` ; 0 → reason_code |'
)
lines.push('| Pralognan | www.reservationpralognan.fr | idem | idem |')
lines.push('| La Clusaz | www.laclusaz.com | idem | SPA probable |')
lines.push('| Vars (2e centrale) | www.alpes-sudlocations.com | idem | hors Ingénie |')
lines.push(
  '| Valberg | www.valberg.com | **pas de parseur** tant que `docs/diagnostics/discovery_valberg.md` n’existe pas | note CENTRALS : Formulaire SPA / non inspecté |'
)
lines.push('| Puy-Saint-Vincent | www.paysdesecrins.com | idem | SPA |')
lines.push('| Les Angles | lesangles.com | idem | SPA |')
lines.push('| Super Besse + Mont Dore | www.sancy.com | idem | dates sans guests selector |')
lines.push('')
lines.push('**Interdit** : inventer un parseur pour ces 9 hôtes sans dump HAR/HTML.')
lines.push('')
lines.push('## Hôtes partagés')
lines.push('')
lines.push('| host | n | stations |')
lines.push('| --- | ---: | --- |')
lines.push('| www.laplagneresort.com | 12 | villages La Plagne |')
lines.push('| reservation.valdarly-montblanc.com | 6 | Val d’Arly |')
lines.push('| reservation.haute-maurienne-vanoise.com | 4 | Norma, Val Cenis, Aussois, Bonneval |')
lines.push('| reservation.montgenevre.com | 2 | Montgenèvre, Les Alberts |')
lines.push('| www.valdallos.com | 2 | La Foux, Le Seignus |')
lines.push('| www.sancy.com | 2 | Super Besse, Mont Dore |')
lines.push('')
lines.push(
  'Le filtre village (`criteres[]`) existe dans `station.ts` (`matchVillageOption`) pour Val d’Arly. La Plagne passe par Ceto, pas par les sélecteurs CENTRALS.'
)
lines.push('')
lines.push('## Sélecteurs résultats')
lines.push('')
lines.push('- `cards` / `title` / `price` / `link` non nuls : **2/74** (Airbnb, Booking).')
lines.push('- 72 centrales locales : **aucun** sélecteur de carte/prix dans cette table.')
lines.push('')
lines.push('## Absents de CENTRALS, présents dans le moteur')
lines.push('')
lines.push('| id | host | adapter | note |')
lines.push('| --- | --- | --- | --- |')
lines.push('| vrbo | www.vrbo.com | `createVrboWebProvider` | pas dans centrals.ts |')
lines.push('| gites | www.gites-de-france.com | `createGitesWebProvider` | pas dans centrals.ts |')
lines.push('| cozycozy | www.cozycozy.com | `createCozycozyWebProvider` | pas dans centrals.ts |')
lines.push('| megeve | megeve-booking.com | `createCetoMegeveProvider` | **pas dans CENTRALS** |')
lines.push('| expedia-web | expedia.fr | **non enregistré** dans buildEngine | `createExpediaWebProvider` existe |')
lines.push('')
lines.push('## Adapter Ingénie vs table')
lines.push('')
lines.push(
  '`station.ts` n’importe **pas** `CENTRALS`. Les sélecteurs du formulaire sont **en dur** dans `FIELD` (`station.ts:175-207`), pas lus depuis la table générée.'
)
lines.push('')

writeFileSync('docs/CENTRALES.md', lines.join('\n'))
console.log('wrote docs/CENTRALES.md', lines.length, 'lines')
