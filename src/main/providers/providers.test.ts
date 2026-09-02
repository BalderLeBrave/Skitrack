/**
 * Test des modules sources.
 *
 * Ce qui est testable sans identifiant l'est réellement : construction d'URL
 * Airbnb, normalisation Booking sur une charge utile figée, décodage du
 * transport MCP, validation des sources déclarées, tri de l'agrégat et emprise
 * géographique. Les appels réseau aux API partenaires ne sont pas simulés —
 * sans clé, ils échouent, et c'est ce que le test vérifie : l'échec est isolé
 * et motivé, pas masqué.
 *
 * Depuis le retrait des connecteurs LiteAPI, Expedia et Gîtes de France, **ce
 * test ne sort plus sur le réseau du tout** : `PROVIDERS_OFFLINE=true` n'a plus
 * d'effet ici, et le portail est hermétique par construction.
 *
 *     npm run providers:test
 */

import { buildAirbnbSearchUrl, airbnbRedirect } from './airbnb/airbnb'
import { normalizeBooking } from './booking/booking'
import { collectBookingPages, collectPages, paginationOf } from './webscrape/providers'
import {
  cozycozySearchEmptyKind,
  gitesPhotoFromTileHtml,
  gitesSearchEmptyKind,
  gitesTilesFromSearchHtml,
  listingPhotoUrl,
  looksNightlyPriceText,
  looksStayPriceText,
  looksWeeklyFromPriceText,
  mergeGitesCardsFromHtml,
  pageLooksBlocked,
  webscrapePriceFields
} from './webscrape/shared'
import { parseGitesWidgetPhoto } from './webscrape/gitesFichePrice'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { bookingSearchUrl, cozycozyDatedPlace, cozycozySearchUrl, gitesSearchUrl, vrboSearchUrl } from './webscrape/urls'
import type { RawCard } from './webscrape/extractors'
import {
  abritelCanonicalUrl,
  isVrboFamilyProvider,
  parseCozyResultPayload
} from './webscrape/cozyResultList'
import { emptyStationReason, familyOfHost, centralsLoaded } from './station/centralLookup'
import { classifyProviderError } from '@shared/reasonCodes'
import {
  extractListingsFromDeferredState,
  occupancyFromStaySearchResult
} from './airbnb/extract'
import { buildEngine } from './index'
import { extractToolPayload, parseSseMessages } from './mcp/client'
import { asNumber, mapMcpItem, readPath, resolveArguments, searchContext } from './mcp/mcpProvider'
import { loadMcpProviderConfigs } from './mcp/registry'
import type { SearchParams } from './types'
import { coordsUsable, domainZone, OUT_OF_ZONE_MARGIN_KM, boxContains, distanceKm, domainRadiusKm, filterToZone, searchZone, zoneVerdict } from '@shared/geo'
import { bookingFamilyOf, isKnownNonIngenie } from '@shared/bookingFamilies'



let failures = 0

function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

function heading(title: string): void {
  console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`)
}

const PARAMS: SearchParams = {
  destination: 'Val Thorens, France',
  checkIn: '2027-02-07',
  checkOut: '2027-02-14',
  adults: 4,
  children: 2
}

/** Coordonnées de la station, telles qu'utilisées par le référentiel. */
const GEO: SearchParams = { ...PARAMS, latitude: 45.2967, longitude: 6.5806, radiusMeters: 12_000 }


async function main(): Promise<void> {
  heading('1. Airbnb — construction d’URL, aucune requête')
  const url = buildAirbnbSearchUrl({
    city: 'Val Thorens, France',
    checkIn: '2027-02-07',
    checkOut: '2027-02-14',
    adults: 4,
    children: 2,
    maxPrice: 4000
  })
  console.log(`  ${url}`)
  check('segment ville encodé', url.includes('/s/Val-Thorens--France/homes'))
  check('dates transmises', url.includes('checkin=2027-02-07') && url.includes('checkout=2027-02-14'))
  check('voyageurs transmis', url.includes('adults=4') && url.includes('children=2'))
  check('prix maximum transmis', url.includes('price_max=4000'))

  const redirect = airbnbRedirect(PARAMS)
  check('marqué comme redirection, pas comme offre', redirect.kind === 'redirect')
  check('aucun prix exposé', !('totalPrice' in redirect))

  // — L'emprise de carte, la correction du cas « Arc 2000 rend Arcachon ».
  //
  // Un nom se géocode, un rectangle non. Ces vérifications portent sur la seule
  // chose qu'on maîtrise : ce qui part dans l'URL. Ce qu'Airbnb en fait se
  // mesure au relevé, pas ici.
  const zoneArc = domainZone({ lat: 45.5714, lon: 6.8286, km: 341.5 })
  const urlBoite = buildAirbnbSearchUrl({
    city: 'Arc 2000, Savoie, France',
    bounds: { north: zoneArc.north, south: zoneArc.south, east: zoneArc.east, west: zoneArc.west }
  })
  console.log(`  ${urlBoite}`)
  check('coin nord-est transmis', urlBoite.includes('ne_lat=') && urlBoite.includes('ne_lng='))
  check('coin sud-ouest transmis', urlBoite.includes('sw_lat=') && urlBoite.includes('sw_lng='))
  check('recherche par carte demandée', urlBoite.includes('search_by_map=true'))
  const zoomLu = Number(new URL(urlBoite).searchParams.get('zoom'))
  // Une boîte de ~0,6° de large se regarde vers le zoom 11, pas le zoom 8 :
  // trois niveaux d'écart, c'est une vue de région contre une vue de vallée.
  check('zoom cadré sur l’emprise', zoomLu >= 10 && zoomLu <= 12, zoomLu)
  const zoomPetit = Number(
    new URL(
      buildAirbnbSearchUrl({
        city: 'Petite station',
        bounds: { north: 45.05, south: 44.95, east: 6.05, west: 5.95 }
      })
    ).searchParams.get('zoom')
  )
  check('une petite boîte se regarde de plus près', zoomPetit > zoomLu, zoomPetit)
  check(
    'la boîte envoyée est celle du domaine',
    Number(new URL(urlBoite).searchParams.get('ne_lat')) === zoneArc.north &&
      Number(new URL(urlBoite).searchParams.get('sw_lng')) === zoneArc.west
  )
  // Arcachon est en Gironde : la boîte d'Arc 2000 ne peut pas la contenir.
  check(
    'Arcachon est hors de l’emprise envoyée',
    !boxContains(zoneArc, 44.658, -1.168)
  )
  // Sans emprise, l'URL reste exactement celle d'avant : l'ajout est facultatif.
  const urlSansBoite = buildAirbnbSearchUrl({ city: 'Val Thorens, France' })
  check(
    'sans emprise, aucune trace de carte dans l’URL',
    !urlSansBoite.includes('search_by_map') && !urlSansBoite.includes('ne_lat')
  )

  heading('2. Booking — normalisation sur charge utile figée')
  const booking = normalizeBooking(
    {
      id: 12345,
      name: 'Résidence Le Sherpa',
      url: 'https://www.booking.com/hotel/fr/sherpa.html',
      location: { latitude: 45.29, longitude: 6.58, city: 'Val Thorens', country: 'FR' },
      price: { total: 2480, currency: 'EUR' },
      review: { score: 8.6, count: 214 },
      rooms: 3
    },
    'aff-123',
    PARAMS
  )
  check('normalisé', booking !== null)
  check('identifiant affilié ajouté à l’URL', booking?.url.includes('aid=aff-123') ?? false, booking?.url)
  check('prix total marqué confirmé', booking?.priceConfidence === 'total_confirmed')
  check('disponibilité affirmée (endpoint de disponibilité)', booking?.availabilityStatus === 'available')
  check('charge utile conservée', booking?.rawProviderData !== undefined)
  check('ligne sans nom rejetée', normalizeBooking({ id: 9 }, undefined, PARAMS) === null)

  heading('6. MCP — décodage du transport, sans réseau')
  const sse =
    'event: message\n' +
    'data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}\n\n' +
    ': commentaire ignoré\n' +
    'data: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n\n'
  const messages = parseSseMessages(sse)
  check('deux enveloppes extraites du flux SSE', messages.length === 2, messages.length)
  check('identifiants préservés', messages[1]?.id === 2)
  check(
    'fragment illisible ignoré sans perdre le reste',
    parseSseMessages('data: {cassé\n\ndata: {"jsonrpc":"2.0","id":7}\n\n').length === 1
  )
  check(
    'charge utile JSON extraite du bloc texte',
    (extractToolPayload({ content: [{ type: 'text', text: '{"data":[1,2]}' }] }) as { data: number[] }).data.length === 2
  )
  check(
    'contenu structuré préféré au texte',
    extractToolPayload({ structuredContent: { ok: true }, content: [{ type: 'text', text: 'ignoré' }] }) !== 'ignoré'
  )

  heading('7. MCP générique — gabarit d’arguments et correspondance de champs')
  const context = searchContext(GEO)
  const args = resolveArguments(
    {
      latitude: '{{lat}}',
      longitude: '{{lon}}',
      radius: '{{radius}}',
      adults: '{{adults}}',
      label: 'séjour à {{destination}}',
      absent: '{{inexistant}}',
      occupancies: [{ adults: '{{adults}}' }]
    },
    context
  )
  check('nombre transmis comme nombre, pas comme chaîne', typeof args.latitude === 'number', typeof args.latitude)
  check('interpolation dans une chaîne', args.label === 'séjour à Val Thorens, France')
  check('jeton sans valeur → argument supprimé', !('absent' in args))
  check('gabarit imbriqué résolu', (args.occupancies as { adults: number }[])[0].adults === 4)
  check('sept nuits calculées', context.nights === 7, context.nights)
  check('chemin pointé avec index', readPath({ rooms: [{ price: 42 }] }, 'rooms.0.price') === 42)

  const mapped = mapMcpItem(
    { id: 'h-1', name: ' Chalet Test ', loc: { lat: 45.3, lon: 6.6 }, prix: '2 480,00', devise: 'EUR' },
    {
      name: 'source-test',
      server: { name: 'source-test', url: 'https://exemple.tld/mcp' },
      tool: 'search',
      arguments: {},
      legalBasis: 'test',
      fields: {
        sourceId: 'id',
        title: 'name',
        latitude: 'loc.lat',
        longitude: 'loc.lon',
        totalPrice: 'prix',
        currency: 'devise'
      }
    },
    GEO
  )
  check('titre nettoyé', mapped?.title === 'Chalet Test')
  check('prix textuel français converti', mapped?.totalPrice === 2480, mapped?.totalPrice)
  check('virgule décimale distinguée du séparateur de milliers', asNumber('1 234,56') === 1234.56, asNumber('1 234,56'))
  check('convention anglaise également traitée', asNumber('$1,234.56') === 1234.56, asNumber('$1,234.56'))
  check('texte non numérique refusé', asNumber('sur demande') === undefined)
  check('disponibilité laissée inconnue par défaut', mapped?.availabilityStatus === 'unknown')
  check(
    'annonce sans identifiant écartée',
    mapMcpItem({ name: 'X' }, { name: 'n', server: { name: 'n', url: 'https://x.tld' }, tool: 't', arguments: {}, legalBasis: 'test', fields: { sourceId: 'id', title: 'name' } }, GEO) === null
  )

  heading('8. Sources MCP déclarées — validation stricte')
  const registry = loadMcpProviderConfigs(
    JSON.stringify({
      sources: [
        { name: 'liteapi', server: { url: 'https://x.tld/mcp' }, tool: 't', fields: { sourceId: 'id', title: 'n' }, legalBasis: 'x' },
        { name: 'sans-base', server: { url: 'https://x.tld/mcp' }, tool: 't', fields: { sourceId: 'id', title: 'n' } },
        { name: 'en-clair', server: { url: 'http://x.tld/mcp' }, tool: 't', fields: { sourceId: 'id', title: 'n' }, legalBasis: 'x' },
        { name: 'valide', server: { url: 'https://x.tld/mcp' }, tool: 't', fields: { sourceId: 'id', title: 'n' }, legalBasis: 'API publique' },
        { name: 'coupée', enabled: false, server: { url: 'https://x.tld/mcp' }, tool: 't', fields: { sourceId: 'id', title: 'n' }, legalBasis: 'x' }
      ]
    })
  )
  check('une seule source retenue', registry.configs.length === 1, registry.configs.map((c) => c.name))
  check('nom réservé refusé', registry.rejected.some((r) => r.name === 'liteapi'))
  check('base légale exigée', registry.rejected.some((r) => r.reason.includes('legalBasis')))
  check('HTTP en clair refusé', registry.rejected.some((r) => r.name === 'en-clair'))
  check('source désactivée ignorée sans erreur', !registry.rejected.some((r) => r.name === 'coupée'))
  check('JSON illisible signalé, pas levé', loadMcpProviderConfigs('{').rejected.length === 1)

  heading('9. Agrégation — un échec de source n’arrête pas les autres')
  // Aucun identifiant fourni : Booking doit échouer proprement, sans lever.
  //
  // Gîtes de France et VRBO sont de nouveau enregistrés depuis le
  // 2026-09-01, mais **seulement sous `enableWebScrape`**. CozyCozy n'est
  // plus une source. L'appel ci-dessous ne l'active pas : il ne reste donc que
  // Booking. Expedia et LiteAPI restent hors du moteur.
  const engine = buildEngine({ vault: () => undefined })
  const report = await engine.search(PARAMS)
  for (const outcome of report.outcomes) {
    console.log(`  ${outcome.provider.padEnd(16)} ${outcome.results.length} résultat(s)  ${outcome.error ?? 'OK'}`)
  }
  check('seules les sources retenues sont interrogées', report.outcomes.length === 1, report.outcomes.length)
  check(
    'aucun connecteur retiré n’est enregistré',
    !report.outcomes.some((o) =>
      ['liteapi', 'expedia', 'expedia-web', 'gites-web', 'cozycozy-web', 'vrbo-web'].includes(
        o.provider
      )
    ),
    report.outcomes.map((o) => o.provider).join(', ')
  )
  check(
    'Booking échoue avec un motif explicite',
    Boolean(report.outcomes.find((o) => o.provider === 'booking')?.error?.includes('Demand API'))
  )
  check('l’agrégat n’a pas levé', true)

  heading('11. Zone géographique — emprise du domaine et rejet des hors-zone')

  /**
   * Coordonnées **lues dans le référentiel livré** (`data/referentiel.json`),
   * pas estimées : ce sont celles que l'application envoie réellement aux
   * sources. Trois domaines de tailles très différentes, parce que c'est
   * exactement ce qu'une emprise fixe rate — les 3 Vallées débordent d'une
   * petite boîte, un domaine des Vosges se noie dans une grande.
   */
  const PARIS = { lat: 48.8566, lon: 2.3522 }

  // — Les 3 Vallées, vues depuis Val Thorens – Orelle (150 km de pistes).
  const troisVallees = searchZone(45.298, 6.58, domainRadiusKm(150))
  const stations3V = [
    { name: 'Val Thorens', lat: 45.298, lon: 6.58 },
    { name: 'Les Menuires – Saint-Martin', lat: 45.325, lon: 6.539 },
    { name: 'Méribel', lat: 45.396, lon: 6.566 },
    { name: 'Courchevel', lat: 45.415, lon: 6.635 },
    { name: 'Orelle', lat: 45.216, lon: 6.548 },
    { name: 'Brides-les-Bains', lat: 45.452, lon: 6.567 }
  ]
  check(
    'Les 3 Vallées — les six stations du domaine sont dans la boîte',
    stations3V.every((st) => boxContains(troisVallees, st.lat, st.lon)),
    stations3V.filter((st) => !boxContains(troisVallees, st.lat, st.lon)).map((st) => st.name)
  )
  check('Les 3 Vallées — Paris est hors de la boîte', !boxContains(troisVallees, PARIS.lat, PARIS.lon))

  // — Paradiski, vu depuis La Plagne (225 km de pistes).
  const paradiski = searchZone(45.507, 6.678, domainRadiusKm(225))
  const stationsParadiski = [
    { name: 'La Plagne', lat: 45.507, lon: 6.678 },
    { name: 'Les Arcs – Peisey-Vallandry', lat: 45.572, lon: 6.829 },
    { name: 'Champagny-en-Vanoise', lat: 45.462, lon: 6.716 },
    { name: 'Montchavin – Les Coches', lat: 45.567, lon: 6.735 },
    { name: 'Villaroger', lat: 45.611, lon: 6.899 }
  ]
  check(
    'Paradiski — les cinq stations du domaine sont dans la boîte',
    stationsParadiski.every((st) => boxContains(paradiski, st.lat, st.lon)),
    stationsParadiski.filter((st) => !boxContains(paradiski, st.lat, st.lon)).map((st) => st.name)
  )
  check('Paradiski — Paris est hors de la boîte', !boxContains(paradiski, PARIS.lat, PARIS.lon))

  // — Le Lac Blanc – Orbey, Vosges (14 km de pistes) : la boîte doit rester
  //   petite, sinon le rayon ne sert à rien.
  const lacBlanc = searchZone(48.13, 7.104, domainRadiusKm(14))
  check('Vosges — la station est dans sa propre boîte', boxContains(lacBlanc, 48.13, 7.104))
  check('Vosges — Paris est hors de la boîte', !boxContains(lacBlanc, PARIS.lat, PARIS.lon))
  check('Vosges — Colmar (18 km à l’est) est hors de la boîte', !boxContains(lacBlanc, 48.0794, 7.3585))
  check(
    'Vosges — un petit domaine reçoit une emprise plus petite qu’un grand',
    lacBlanc.radiusKm < troisVallees.radiusKm && troisVallees.radiusKm < paradiski.radiusKm,
    { vosges: lacBlanc.radiusKm, troisVallees: troisVallees.radiusKm, paradiski: paradiski.radiusKm }
  )

  // — Le piège du rayon en degrés : la boîte doit être plus large en degrés de
  //   longitude que de latitude, sans quoi le rayon est faux d’un tiers.
  const dLat = troisVallees.north - troisVallees.lat
  const dLon = troisVallees.east - troisVallees.lon
  check('boîte corrigée du cosinus de la latitude', dLon > dLat * 1.3, { dLat, dLon })
  check(
    'le bord nord est bien à la distance du rayon',
    Math.abs(distanceKm(troisVallees.lat, troisVallees.lon, troisVallees.north, troisVallees.lon) - troisVallees.radiusKm) < 0.5
  )
  check(
    'le bord est aussi',
    Math.abs(distanceKm(troisVallees.lat, troisVallees.lon, troisVallees.lat, troisVallees.east) - troisVallees.radiusKm) < 0.5
  )

  // — Verdict par annonce, et filtre de l’agrégat.
  check('annonce dans la station : retenue', zoneVerdict(troisVallees, 45.3, 6.58) === 'in')
  check('annonce à Paris : rejetée', zoneVerdict(troisVallees, PARIS.lat, PARIS.lon) === 'out')
  check('annonce sans position : verdict inconnu, pas un rejet', zoneVerdict(troisVallees, undefined, undefined) === 'unknown')
  check(
    'la marge est appliquée, pas ignorée',
    zoneVerdict(troisVallees, 45.298 + (troisVallees.radiusKm + OUT_OF_ZONE_MARGIN_KM - 1) / 110.574, 6.58) === 'in' &&
      zoneVerdict(troisVallees, 45.298 + (troisVallees.radiusKm + OUT_OF_ZONE_MARGIN_KM + 2) / 110.574, 6.58) === 'out'
  )

  const mixed = [
    { title: 'Résidence à Val Thorens', latitude: 45.297, longitude: 6.581 },
    { title: 'Studio à Paris 15e', latitude: PARIS.lat, longitude: PARIS.lon },
    { title: 'Appartement à Barcelone', latitude: 41.3874, longitude: 2.1686 },
    { title: 'Chalet sans position', latitude: undefined, longitude: undefined }
  ]
  const zoned = filterToZone(mixed, troisVallees, (a) => ({ lat: a.latitude, lon: a.longitude }))
  check('deux hors-zone rejetés', zoned.rejected.length === 2, zoned.rejected.map((a) => a.title))
  check('aucune autre ville dans le résultat', !zoned.kept.some((a) => /Paris|Barcelone/.test(a.title)))
  check('annonce sans position conservée et comptée à part', zoned.unlocated === 1 && zoned.kept.length === 2)

  // — La règle du « lot égaré », celle qui a laissé passer Arcachon pour Arc 2000.
  //
  // Une source qui a compris une autre commune rend surtout des offres hors
  // zone. Ses offres **sans position** viennent du même endroit : les garder
  // parce qu'elles se taisent revient à laisser entrer précisément celles qu'on
  // ne peut pas vérifier. Le test se fait par source, sur le rapport entre
  // situées-en-zone et rejetées.
  const egare = [
    { title: 'Appartement à Arcachon', latitude: 44.658, longitude: -1.168 },
    { title: 'Villa au Cap Ferret', latitude: 44.63, longitude: -1.24 },
    { title: 'Studio à Arcachon centre', latitude: 44.66, longitude: -1.16 },
    { title: 'Logement sans position', latitude: undefined, longitude: undefined }
  ]
  const zEgare = filterToZone(egare, troisVallees, (a) => ({ lat: a.latitude, lon: a.longitude }))
  const situeesEgare = zEgare.kept.filter((a) => coordsUsable(a.latitude, a.longitude))
  check('lot égaré : trois offres situées hors zone', zEgare.rejected.length === 3)
  check('lot égaré : aucune offre située ne survit', situeesEgare.length === 0)
  check(
    'lot égaré : la règle écarte aussi l’offre sans position',
    situeesEgare.length < zEgare.rejected.length && zEgare.kept.length === 1
  )

  // Le cas symétrique : une source juste, dont une offre se tait, garde tout.
  const juste = [
    { title: 'Résidence Val Thorens', latitude: 45.297, longitude: 6.581 },
    { title: 'Chalet Les Menuires', latitude: 45.32, longitude: 6.54 },
    { title: 'Studio sans position', latitude: undefined, longitude: undefined },
    { title: 'Erreur isolée à Paris', latitude: PARIS.lat, longitude: PARIS.lon }
  ]
  const zJuste = filterToZone(juste, troisVallees, (a) => ({ lat: a.latitude, lon: a.longitude }))
  const situeesJuste = zJuste.kept.filter((a) => coordsUsable(a.latitude, a.longitude))
  check(
    'source juste : une erreur isolée n’écarte pas les offres muettes',
    situeesJuste.length >= zJuste.rejected.length && zJuste.kept.length === 3
  )

  heading('6. Familles de centrales — Ingénie vs le reste')
  check('2 Alpes est Ingénie', !isKnownNonIngenie('https://reservation.les2alpes.com/'))
  check('Tignes est Ingénie', !isKnownNonIngenie('reservation.tignes.net'))
  check('Chamonix est Orchestra', bookingFamilyOf('https://booking.chamonix.com/fr/') === 'orchestra')
  check('Alpe d’Huez est Ublo, pas Ingénie', bookingFamilyOf('reservation.alpedhuez.com') === 'ublo')
  check('Valberg est Ublo, pas Ingénie', bookingFamilyOf('www.valberg.com') === 'ublo')
  check('Écrins est Ublo (PDE)', bookingFamilyOf('www.paysdesecrins.com') === 'ublo')
  check('La Bresse est Open System', bookingFamilyOf('www.labresse.net') === 'opensystem')
  check('La Toussuire est Open System', bookingFamilyOf('reservation.la-toussuire.com') === 'opensystem')
  check('Sancy n’est pas Ingénie', bookingFamilyOf('www.sancy.com') === 'sancy')
  check('Pralognan = locvacances', bookingFamilyOf('www.reservationpralognan.fr') === 'locvacances')
  check('La Clusaz famille = deskline', bookingFamilyOf('www.laclusaz.com') === 'deskline')

  heading('7. Booking — la pagination, et son garde-fou')
  const stay = { destination: 'Les 2 Alpes', checkIn: '2027-02-06', checkOut: '2027-02-13', adults: 2 }
  check('page 1 : aucun paramètre de rang', !bookingSearchUrl(stay).includes('offset'))
  check('page 2 : rang 25', bookingSearchUrl(stay, 25).includes('offset=25'), bookingSearchUrl(stay, 25))
  check(
    'la pagination ne touche à rien d’autre',
    bookingSearchUrl(stay, 50).includes('checkin=2027-02-06') &&
      bookingSearchUrl(stay, 50).includes('ss=Les+2+Alpes')
  )

  /** Une page de `n` cartes distinctes, numérotées à partir de `from`. */
  const cards = (from: number, n: number): RawCard[] =>
    Array.from({ length: n }, (_, i) => ({
      sourceId: `h${from + i}`,
      title: `Hôtel ${from + i}`,
      url: `https://www.booking.com/hotel/fr/h${from + i}.html`
    }))

  const pagesVues: string[] = []
  const troisPages = await collectBookingPages(stay, async (url) => {
    pagesVues.push(url)
    const rang = Number(new URL(url).searchParams.get('offset') ?? 0)
    // Deux pages pleines, puis une page courte : la fin de la liste.
    return rang === 0 ? cards(0, 25) : rang === 25 ? cards(25, 25) : cards(50, 9)
  })
  check('trois pages parcourues', pagesVues.length === 3, pagesVues.length)
  check('cinquante-neuf biens ramenés', troisPages.length === 59, troisPages.length)
  check('aucun doublon', new Set(troisPages.map((c) => c.sourceId)).size === troisPages.length)

  // Le garde-fou : si Booking cessait d'honorer `offset`, chaque page rendrait
  // la même liste. On doit s'en apercevoir à la deuxième, pas à la cinquième.
  let appels = 0
  const figé = await collectBookingPages(stay, async () => {
    appels++
    return cards(0, 25)
  })
  check('rang ignoré : on s’arrête à la deuxième page', appels === 2, appels)
  check('et on rend la première page, pas une erreur', figé.length === 25, figé.length)

  let vide = 0
  const rien = await collectBookingPages(stay, async () => {
    vide++
    return []
  })
  check('page vide : une seule lecture', vide === 1 && rien.length === 0)

  const plafond: string[] = []
  const bridé = await collectBookingPages(stay, async (url) => {
    plafond.push(url)
    const rang = Number(new URL(url).searchParams.get('offset') ?? 0)
    return cards(rang, 25)
  })
  check('le plafond de pages tient', plafond.length === 5 && bridé.length === 125, plafond.length)

  // Le budget de temps ne coupe pas une page en cours : il décide si l'on en
  // ouvre une de plus. Budget nul = une seule page, celle sans laquelle il n'y
  // aurait pas de relevé du tout.
  let lues = 0
  const pressé = await collectBookingPages(
    stay,
    async (url) => {
      lues++
      return cards(Number(new URL(url).searchParams.get('offset') ?? 0), 25)
    },
    5,
    0
  )
  check('budget épuisé : la première page est lue quand même', lues === 1 && pressé.length === 25, lues)

  heading('13. Sources rebranchées — capacité, pagination, VRBO')

  /*
   * Ce que cette section retient, et pourquoi.
   *
   * Les extracteurs eux-mêmes ne sont pas exerçables ici : ils s'exécutent dans
   * la page par `page.evaluate`, et cette suite est hermétique. Ce qui se
   * vérifie sans navigateur, c'est le **branchement** — les connecteurs sont-ils
   * enregistrés, les URL paginent-elles, la capacité traverse-t-elle le
   * mapping — et c'est précisément ce qui manquait.
   */

  // Problème 1 : le code des connecteurs existait, l'enregistrement manquait.
  const moteurWeb = buildEngine({ vault: () => undefined, enableWebScrape: true })
  for (const attendu of ['gites-web', 'vrbo-web', 'deskline', 'locvacances', 'diffusio']) {
    check(`${attendu} est enregistré`, moteurWeb.names.includes(attendu), moteurWeb.names.join(', '))
  }
  check(
    'CozyCozy n’est plus une source',
    !moteurWeb.names.includes('cozycozy-web'),
    moteurWeb.names.join(', ')
  )
  check(
    'Tourinsoft n’est plus une source',
    !moteurWeb.names.includes('tourinsoft'),
    moteurWeb.names.join(', ')
  )
  check(
    'les connecteurs non vérifiés restent dehors',
    !moteurWeb.names.includes('expedia-web'),
    moteurWeb.names.join(', ')
  )

  // Problème 3 : la pagination n'existait que chez Booking. `collectPages` la
  // rend générique, y compris pour les sites qui numérotent les pages (pas 1).
  const pagesGites: number[] = []
  const lot = await collectPages(
    (offset) => gitesSearchUrl(stay, offset),
    1,
    async (url) => {
      const page = Number(new URL(url).searchParams.get('page') ?? '1')
      pagesGites.push(page)
      return page <= 2 ? cards(page * 10, 1) : []
    }
  )
  check('pagination Gîtes : page 1 puis 2 puis 3 (vide)', pagesGites.join(',') === '1,2,3', pagesGites.join(','))
  check('les deux pages non vides sont rendues', lot.length === 2, lot.length)
  check('page 1 sans paramètre', !gitesSearchUrl(stay).includes('page='))
  check('offset 0-based 1 → page=2', gitesSearchUrl(stay, 1).includes('page=2'), gitesSearchUrl(stay, 1))
  check(
    'Gîtes Les 2 Alpes : towns=50301 (contournement GET)',
    gitesSearchUrl(stay).includes('towns=50301') &&
      gitesSearchUrl(stay).includes('travelers=2') &&
      !gitesSearchUrl(stay).includes('search%5Bvalue%5D') &&
      !gitesSearchUrl(stay).includes('entity_id='),
    gitesSearchUrl(stay)
  )
  check('Gîtes : date-start / date-end', gitesSearchUrl(stay).includes('date-start=2027-02-06') && gitesSearchUrl(stay).includes('date-end=2027-02-13'))
  const gitesOther = gitesSearchUrl({ ...stay, destination: 'Val Thorens' })
  check(
    'Gîtes hors dump : destination= (pas towns=)',
    gitesOther.includes('destination=Val+Thorens') && !gitesOther.includes('towns='),
    gitesOther
  )
  const gitesKar = gitesSearchUrl({ ...stay, destination: 'Les Karellis' })
  check('Gîtes Karellis : towns=64400', gitesKar.includes('towns=64400') && gitesKar.includes('travelers='), gitesKar)
  const gitesMontricher = gitesSearchUrl({ ...stay, destination: 'Montricher-Albanne' })
  check('Gîtes Montricher : towns=64400', gitesMontricher.includes('towns=64400'), gitesMontricher)
  const gitesAng = gitesSearchUrl({ ...stay, destination: 'Les Angles' })
  check('Gîtes Les Angles : towns=61540', gitesAng.includes('towns=61540'), gitesAng)
  const gitesAngCor = gitesSearchUrl({ ...stay, destination: 'Les Angles-sur-Corrèze' })
  check('Gîtes Angles-sur-Corrèze : pas 61540', !gitesAngCor.includes('towns=61540'), gitesAngCor)
  const gitesVars = gitesSearchUrl({ ...stay, destination: 'Vars' })
  check('Gîtes Vars : towns=38123', gitesVars.includes('towns=38123'), gitesVars)
  const gitesRoseix = gitesSearchUrl({ ...stay, destination: 'Vars-sur-Roseix' })
  check('Gîtes Vars-sur-Roseix : pas 38123', !gitesRoseix.includes('towns=38123'), gitesRoseix)
  check('page_index stampée sur la 1re carte', lot[0]?.pageIndex === 0, lot[0]?.pageIndex)
  check('page_index de la 2e page', lot[1]?.pageIndex === 1, lot[1]?.pageIndex)
  const rapport = paginationOf(lot)
  check('stopped_reason exhausted', rapport?.stoppedReason === 'exhausted', rapport?.stoppedReason)
  check('pages_fetched = 3', rapport?.pagesFetched === 3, rapport?.pagesFetched)

  // Problème 1b : VRBO n'avait aucune URL de recherche.
  const vrbo = vrboSearchUrl(stay, 50)
  check('Abritel : destination transmise', vrbo.includes('destination=Les+2+Alpes'), vrbo)
  check('Abritel : dates transmises', vrbo.includes('startDate=2027-02-06'), vrbo)
  check('Abritel : rang de départ', vrbo.includes('startIndex=50'), vrbo)
  check('Abritel : fiche sur abritel.fr', vrbo.includes('abritel.fr'), vrbo)
  check('Abritel : première page sans rang', !vrboSearchUrl(stay).includes('startIndex'))

  // Problème 4 : la capacité, que le mapping perdait.
  const avecCapacite = normalizeBooking(
    { id: 42, name: 'Chalet', url: 'https://x', max_occupancy: 8, rooms: 3 },
    undefined,
    stay
  )
  check('capacité lue quand la source la publie', avecCapacite?.guests === 8, avecCapacite?.guests)
  const sansCapacite = normalizeBooking({ id: 43, name: 'Studio', url: 'https://y' }, undefined, stay)
  check(
    'capacité absente : elle reste absente, jamais la demande',
    sansCapacite?.guests === undefined,
    sansCapacite?.guests
  )

  heading('14. centrals.ts branché + reason_code')
  check('CENTRALS chargé (74 attendues)', centralsLoaded() >= 74, centralsLoaded())
  check('Les 2 Alpes = ingenie', familyOfHost('reservation.les2alpes.com') === 'ingenie')
  check('Chamonix = ceto', familyOfHost('booking.chamonix.com') === 'ceto')
  check('Karellis = not_wired', familyOfHost('www.karellis.com') === 'not_wired')
  check('Valberg = ublo (ids dumpés)', familyOfHost('www.valberg.com') === 'ublo')
  check('Écrins = ublo (ids dumpés)', familyOfHost('www.paysdesecrins.com') === 'ublo')
  check('La Clusaz = deskline', familyOfHost('www.laclusaz.com') === 'deskline')
  check('Pralognan = locvacances', familyOfHost('www.reservationpralognan.fr') === 'locvacances')
  check('Sancy = diffusio', familyOfHost('www.sancy.com') === 'diffusio')
  check('Les Angles = tourinsoft', familyOfHost('lesangles.com') === 'tourinsoft')
  check('Vars Elloha = not_wired', familyOfHost('www.alpes-sudlocations.com') === 'not_wired')
  check(
    'sans URL officielle → no_official_url',
    emptyStationReason(undefined) === 'no_official_url'
  )
  check(
    'Karellis officiel → not_wired',
    emptyStationReason('https://www.karellis.com/') === 'not_wired'
  )
  check(
    'Valberg officiel → delegated (ublo)',
    emptyStationReason('https://www.valberg.com/sejourner/reserver-votre-sejour/') === 'delegated'
  )
  check(
    'Écrins officiel → delegated (ublo)',
    emptyStationReason('https://www.paysdesecrins.com/hebergements/') === 'delegated'
  )
  check(
    'La Clusaz officiel → delegated (deskline)',
    emptyStationReason('https://www.laclusaz.com/') === 'delegated'
  )
  check(
    'Pralognan officiel → delegated (locvacances)',
    emptyStationReason('https://www.reservationpralognan.fr/') === 'delegated'
  )
  check(
    'Sancy officiel → delegated (diffusio)',
    emptyStationReason('https://www.sancy.com/hebergement/') === 'delegated'
  )
  check(
    'Les Angles officiel → not_wired (Tourinsoft retiré)',
    emptyStationReason('https://lesangles.com/tous-les-hebergements/') === 'not_wired'
  )
  check(
    'Chamonix officiel → delegated (ceto)',
    emptyStationReason('https://booking.chamonix.com/fr/') === 'delegated'
  )
  check(
    'captcha message → blocked',
    classifyProviderError('gites-web: relevé refusé par la source (captcha ou blocage anti-robot)') ===
      'blocked'
  )
  check(
    'sélecteurs → selector_miss',
    classifyProviderError('vrbo-web: aucune carte extraite — la page a répondu, les sélecteurs sont à revoir') ===
      'selector_miss'
  )
  check(
    'challenge_unresolved',
    classifyProviderError('CAPTCHA non résolu (3 min) [challenge_unresolved].') ===
      'challenge_unresolved'
  )
  check(
    'Bot or Not? (dump VRBO) → blocked',
    classifyProviderError('vrbo-web: Bot or Not?') === 'blocked'
  )
  check(
    'Robot ou pas robot (dump Abritel) → blocked',
    classifyProviderError('vrbo-web: Robot ou pas robot ?') === 'blocked'
  )
  check(
    'destination entity_id vide → empty_inventory',
    classifyProviderError(
      'gites-web: destination non résolue (entity_id vide) [empty_inventory]'
    ) === 'empty_inventory'
  )

  heading('15. Dumps 2026-09-01 — looksBlocked / Gîtes noResults')
  check(
    'VRBO « Bot or Not? » est un blocage',
    pageLooksBlocked("Bot or Not? Show us your human side... We can't tell if you're a human or a bot.")
  )
  check(
    'Abritel « Robot ou pas robot » est un blocage',
    pageLooksBlocked('Robot ou pas robot ? Vous êtes humain, n’est-ce pas ?')
  )
  check(
    'Cloudflare « Attention Required » est un blocage',
    pageLooksBlocked('Attention Required! | Cloudflare Sorry, you have been blocked')
  )
  check(
    'Gîtes Oups destination n’est pas un blocage',
    !pageLooksBlocked(
      'Oups ! Vous devez affiner votre recherche de séjour en indiquant au moins une destination.'
    )
  )
  check(
    'regex historique « are you a robot » tient',
    pageLooksBlocked('Are you a robot? Unusual traffic')
  )
  const gitesNoDest =
    '<div class="g2f-searchResult-noResults"><p> Oups ! Vous devez affiner votre recherche de séjour en indiquant au moins une destination.</p></div>'
  check(
    'noResults + phrase dump → destination_missing',
    gitesSearchEmptyKind(gitesNoDest) === 'destination_missing'
  )
  check(
    'noResults seul → no_results (pas selector_miss)',
    gitesSearchEmptyKind('<div class="g2f-searchResult-noResults"></div>') === 'no_results'
  )
  check(
    'sans marqueur Gîtes → null',
    gitesSearchEmptyKind('<article class="gite-card">rien</article>') === null
  )

  heading('16. CozyCozy dump 2026-09-02 — GET daté /results, pas le catalogue SEO')
  const cozyStay = { ...stay, adults: 8, bedrooms: 4 }
  const cozyUrl = cozycozySearchUrl(cozyStay)
  check(
    'CozyCozy Les 2 Alpes → /search/Les Deux Alpes station de ski…/4-8-0/results',
    cozyUrl ===
      'https://www.cozycozy.com/fr/search/Les%20Deux%20Alpes%20station%20de%20ski%2C%20France/2027-02-06/2027-02-13/4-8-0/results',
    cozyUrl
  )
  check(
    'lieu 2 Alpes dumpé',
    cozycozyDatedPlace('Les 2 Alpes') === 'Les Deux Alpes station de ski, France'
  )
  check(
    'CozyCozy Les Karellis → /search/Les%20Karellis%2C%20France/…/4-8-0/results',
    cozycozySearchUrl({ ...cozyStay, destination: 'Les Karellis' }) ===
      'https://www.cozycozy.com/fr/search/Les%20Karellis%2C%20France/2027-02-06/2027-02-13/4-8-0/results'
  )
  check(
    'CozyCozy Les Angles daté',
    cozycozySearchUrl({ ...cozyStay, destination: 'Les Angles' }).includes(
      '/fr/search/Les%20Angles%2C%20France/'
    ) &&
      cozycozySearchUrl({ ...cozyStay, destination: 'Les Angles' }).endsWith('/4-8-0/results')
  )
  check(
    'CozyCozy Vars daté',
    cozycozySearchUrl({ ...cozyStay, destination: 'Vars' }).includes('/fr/search/Vars%2C%20France/')
  )
  const cozyMeribel = cozycozySearchUrl({
    destination: 'Méribel, France',
    checkIn: '2027-02-13',
    checkOut: '2027-02-20',
    adults: 8,
    bedrooms: 4
  })
  check(
    'CozyCozy Méribel (exemple fourni)',
    cozyMeribel ===
      'https://www.cozycozy.com/fr/search/M%C3%A9ribel%2C%20France/2027-02-13/2027-02-20/4-8-0/results',
    cozyMeribel
  )
  const cozyOther = cozycozySearchUrl({
    destination: 'Val Thorens',
    checkIn: '2027-02-06',
    checkOut: '2027-02-13',
    adults: 8,
    bedrooms: 4
  })
  check(
    'CozyCozy hors dump : même path daté, {Nom}, France',
    cozyOther.includes('/fr/search/Val%20Thorens%2C%20France/') && cozyOther.endsWith('/4-8-0/results'),
    cozyOther
  )
  check('path daté : pas de e=', !cozyUrl.includes('e=4'))
  const cozyNoDates = cozycozySearchUrl({ destination: 'Les 2 Alpes', adults: 8, bedrooms: 4 })
  check(
    'sans dates : catalogue SEO (pas /results)',
    cozyNoDates === 'https://www.cozycozy.com/fr/location-vacances-les-2-alpes',
    cozyNoDates
  )
  const cozyShell =
    '<joli-root ng-version="16.2.6" ng-server-context="ssr"><router-outlet></router-outlet><joli-market>'
  check(
    'joli-root + router-outlet vide → spa_unlaunched',
    cozycozySearchEmptyKind(cozyShell) === 'spa_unlaunched'
  )
  check(
    'joli-root n’est pas un blocage',
    !pageLooksBlocked('joli-root Explorer Favoris')
  )
  check(
    'message SPA → 0_after_parse (pas selector_miss)',
    classifyProviderError(
      'cozycozy-web: SPA Cosmos montée, recherche non lancée (router-outlet vide) [0_after_parse]'
    ) === '0_after_parse'
  )
  check(
    'catalogue ResultItemPrice → plus spa_unlaunched',
    cozycozySearchEmptyKind(
      '<joli-root><div class="ResultItemPriceTotal">120 €</div></joli-root>'
    ) === null
  )
  check(
    'catalogue hoj_seo_card → plus spa_unlaunched',
    cozycozySearchEmptyKind(
      '<joli-root ng-version="16.2.6"><article class="hoj_seo_card">chalet 1032 €</article></joli-root>'
    ) === null
  )
  check(
    'SERP datée joli-resultitem → plus spa_unlaunched',
    cozycozySearchEmptyKind(
      '<joli-root><joli-resultitem><div class="pricetag-stacked">6692 € pour 7 nuits</div></joli-resultitem></joli-root>'
    ) === null
  )

  heading('17. CozyCozy — /nuit = nuit ; « pour 7 nuits » = séjour')
  const cozyNuit = webscrapePriceFields('cozycozy-web', 'À partir de 89 €/nuit')
  check(
    'CozyCozy 89 €/nuit → nightlyPrice, pas total',
    cozyNuit.nightlyPrice === 89 && cozyNuit.totalPrice === undefined,
    cozyNuit
  )
  const cozyBare = webscrapePriceFields('cozycozy-web', '89 €')
  check(
    'CozyCozy source seule, même sans « /nuit » dans le texte',
    cozyBare.nightlyPrice === 89 && cozyBare.totalPrice === undefined,
    cozyBare
  )
  const cozyStayPrice = webscrapePriceFields('cozycozy-web', '6692 € pour 7 nuits')
  check(
    'CozyCozy 6692 € pour 7 nuits → totalPrice (dump SERP datée)',
    cozyStayPrice.totalPrice === 6692 && cozyStayPrice.nightlyPrice === undefined,
    cozyStayPrice
  )
  check('texte « pour 7 nuits » est un séjour', looksStayPriceText('6692 € pour 7 nuits') === true)
  check('texte « /nuit » n’est pas un séjour', looksStayPriceText('89 €/nuit') === false)
  const bookingStay = webscrapePriceFields('booking-web', '1 200 €')
  check(
    'Booking 1 200 € → total de séjour',
    bookingStay.totalPrice === 1200 && bookingStay.nightlyPrice === undefined,
    bookingStay
  )
  check('texte « 120 €/nuit » est nightly', looksNightlyPriceText('120 €/nuit') === true)
  check('texte « 1 200 € » n’est pas nightly', looksNightlyPriceText('1 200 €') === false)

  heading('18. Gîtes — « À partir de N € par semaine » = indicatif, pas le séjour')
  const gitesSemaine = webscrapePriceFields('gites-web', 'À partir de 1 700 € par semaine')
  check(
    'Gîtes 1 700 € /semaine → weeklyPrice, pas total',
    gitesSemaine.weeklyPrice === 1700 && gitesSemaine.totalPrice === undefined,
    gitesSemaine
  )
  const gitesBare = webscrapePriceFields('gites-web', '1 700 €')
  check(
    'Gîtes source seule, même sans « par semaine » dans le texte',
    gitesBare.weeklyPrice === 1700 && gitesBare.totalPrice === undefined,
    gitesBare
  )
  check(
    'texte « À partir de 1 700 € par semaine » est weekly',
    looksWeeklyFromPriceText('À partir de 1 700 € par semaine') === true
  )
  check(
    'texte « Total 2448,40€ » n’est pas weekly',
    looksWeeklyFromPriceText('Total 2448,40€') === false
  )
  check(
    'Booking 1 200 € n’est pas weekly',
    looksWeeklyFromPriceText('1 200 €') === false
  )

  heading('19. Abritel — getResultList CozyCozy, pas la SERP 429')
  const cozyVrbo = parseCozyResultPayload({
    entries: [
      {
        accommodationId: 11032591,
        name: 'Beau Duplex Familial',
        title: 'appartement',
        subTitleDetails: { bedRoomCount: 4, guestCapacity: 8 },
        coordinates: { latitude: 45.00577, longitude: 6.11819 },
        lightThumbnails: {
          firstUrls: ['https://media.vrbo.com/lodging/19000000/x.jpg']
        },
        highlightedResults: [
          {
            providerCode: 'abritel',
            providerName: 'abritel.fr',
            totalPrice: { value: 3363.280029296875, indicative: false },
            deeplinkUrl:
              'https://prf.hn/click/camref:x/destination:https://www.abritel.fr/location-vacances/p6410325a?mpd=EUR&mpe=1',
            fromDate: '2027-02-13',
            toDate: '2027-02-20',
            bedRoomCount: 4
          }
        ]
      }
    ]
  })
  check('1 fiche Abritel retenue', cozyVrbo.length === 1, cozyVrbo.length)
  check('total séjour 3363,28 € (pas la nuit)', cozyVrbo[0]?.stay === 3363.28, cozyVrbo[0]?.stay)
  check('8 pers / 4 chb libellés', cozyVrbo[0]?.guests === 8 && cozyVrbo[0]?.bedrooms === 4)
  check('photo media.vrbo.com', Boolean(cozyVrbo[0]?.photo?.includes('media.vrbo.com')))
  check('famille Abritel', isVrboFamilyProvider('abritel', 'abritel.fr', cozyVrbo[0]?.deeplink) === true)
  check(
    'deeplink canonique Abritel sans mpd',
    abritelCanonicalUrl(cozyVrbo[0]?.deeplink ?? '').startsWith(
      'https://www.abritel.fr/location-vacances/p6410325a'
    ) && !abritelCanonicalUrl(cozyVrbo[0]?.deeplink ?? '').includes('mpd=')
  )
  const datedFiche = abritelCanonicalUrl(cozyVrbo[0]?.deeplink ?? '', {
    checkIn: '2027-02-13',
    checkOut: '2027-02-20',
    adults: 8
  })
  check(
    'fiche Abritel datée (startDate + adults)',
    datedFiche.includes('startDate=2027-02-13') &&
      datedFiche.includes('endDate=2027-02-20') &&
      datedFiche.includes('adults=8') &&
      !datedFiche.includes('mpd=')
  )
  check(
    'indicatif sauté',
    parseCozyResultPayload({
      entries: [
        {
          name: 'x',
          highlightedResults: [
            {
              providerCode: 'airbnb',
              totalPrice: { value: 10, indicative: true },
              deeplinkUrl: 'https://www.airbnb.fr/rooms/1'
            }
          ]
        }
      ]
    }).length === 0
  )
  const vrboStay = webscrapePriceFields('vrbo-web', '3363.28 € pour 7 nuits')
  check(
    'vrbo-web « pour 7 nuits » → total séjour',
    vrboStay.totalPrice != null && vrboStay.nightlyPrice === undefined,
    vrboStay
  )

  heading('9. Photos publiées — URL absolue, jamais un chemin relatif')
  check(
    'tuile Gîtes /sites/default/files → gites-de-france.com',
    listingPhotoUrl(
      '/sites/default/files/styles/landscape_375_240/public/images/x.jpg',
      'https://www.gites-de-france.com/fr/isere/chalet-x-38g1'
    ) === 'https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/x.jpg'
  )
  check(
    'chemin Gîtes sans base d’annonce',
    listingPhotoUrl('/sites/default/files/x.jpg') ===
      'https://www.gites-de-france.com/sites/default/files/x.jpg'
  )
  check(
    'picto / thème rejeté',
    listingPhotoUrl('/themes/custom/g2f/build/svg/heart.svg', 'https://www.gites-de-france.com/') ===
      undefined
  )
  const lazyTile = `<div class="g2f-accommodationTile-image">
    <img src="/themes/custom/g2f/favicon/favicon-32x32.png" alt="">
    <img loading="lazy" data-g2f-swiper-lazy="" data-srcset="/sites/default/files/styles/landscape_375_240/public/images/468645/468645-0_253122_14f76d537746f8047d1ce70054576c5b.jpg?itok=MBjhiKU9 375w" data-src="/sites/default/files/styles/landscape_375_240/public/images/468645/468645-0_253122_14f76d537746f8047d1ce70054576c5b.jpg?itok=MBjhiKU9" class="swiper-lazy">
  </div>`
  const lazyPhoto = gitesPhotoFromTileHtml(lazyTile)
  check(
    'tuile Gîtes lazy data-src + itok, picto ignoré',
    lazyPhoto ===
      'https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/468645/468645-0_253122_14f76d537746f8047d1ce70054576c5b.jpg?itok=MBjhiKU9',
    lazyPhoto
  )
  check(
    'tuile sans photo publiée : rien',
    gitesPhotoFromTileHtml('<div class="g2f-accommodationTile-image"></div>') === undefined
  )
  check(
    'srcset : premier token, pas les largeurs',
    listingPhotoUrl('/a.jpg 375w, /b.jpg 520w', 'https://www.gites-de-france.com/fr/x') ===
      'https://www.gites-de-france.com/a.jpg'
  )
  check(
    'placeholder data: rejeté',
    listingPhotoUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7') ===
      undefined
  )
  check(
    'protocole relatif //media.vrbo.com',
    listingPhotoUrl('//media.vrbo.com/lodging/x.jpg', 'https://www.cozycozy.com/') ===
      'https://media.vrbo.com/lodging/x.jpg'
  )
  check('sans URL publiée : rien', listingPhotoUrl(undefined, 'https://www.booking.com/') === undefined)
  check(
    'currentSrc HTML de recherche rejeté',
    listingPhotoUrl(
      'https://www.gites-de-france.com/fr/search?towns=50301',
      'https://www.gites-de-france.com/fr/search?towns=50301'
    ) === undefined
  )
  const fakeDom = [
    {
      sourceId: 'chalet-les-copains-38g253122',
      title: 'Chalet les Copains',
      url: 'https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/chalet-les-copains-38g253122',
      image: 'https://www.gites-de-france.com/fr/search?towns=50301'
    }
  ]
  const mergedFake = mergeGitesCardsFromHtml(
    fakeDom,
    `<div class="js-search-tile">
      <a href="/fr/auvergne-rhone-alpes/isere/chalet-les-copains-38g253122" title="Chalet les Copains" class="g2f-accommodationTile-image">
        <img data-src="/sites/default/files/styles/landscape_375_240/public/images/468645/468645-0_253122.jpg?itok=abc">
      </a>
      <div class="g2f-accommodationTile-text-type">Gîte</div>
      <div class="g2f-accommodationTile-text-capacity">5 chambres 14 personnes</div>
      <div class="g2f-accommodationTile-text-price">À partir de 1 330 € par semaine</div>
    </div>`
  )
  check(
    'merge HTML remplace currentSrc search par Drupal + capacité',
    Boolean(
      mergedFake[0]?.image?.includes('253122') &&
        mergedFake[0]?.image?.includes('itok=abc') &&
        mergedFake[0]?.guests === 14 &&
        mergedFake[0]?.bedrooms === 5
    ),
    mergedFake[0]
  )

  heading('Airbnb StaySearchResult — occupancy (F4)')
  const stayNode = {
    __typename: 'StaySearchResult',
    demandStayListing: {
      id: Buffer.from('DemandStayListing:40088811').toString('base64'),
      location: { coordinate: { latitude: 45.456, longitude: 6.9 } },
      personCapacity: 4
    },
    subtitle: 'Appartement en résidence · Modane',
    title: 'Spacieux appartement cœur de station avec garage',
    structuredContent: { primaryLine: '2 chambres · 6 lits · 1 salle de bain et 1 toilette' },
    structuredDisplayPrice: { accessibilityLabel: '1 754 € au total' }
  }
  const occ = occupancyFromStaySearchResult(stayNode)
  check('personCapacity → 4 voyageurs', occ.guests === 4, occ)
  check('ligne « 2 chambres » → bedrooms 2', occ.bedrooms === 2, occ)
  const clip = extractListingsFromDeferredState({ data: { results: [stayNode] } })
  check('StaySearchResult clip porte guests+bedrooms', clip.listings[0]?.guests === 4 && clip.listings[0]?.bedrooms === 2)
  check(
    'sans occupancy : null, pas 0 inventé',
    occupancyFromStaySearchResult({ __typename: 'StaySearchResult', subtitle: 'Les 2 Alpes' }).guests ===
      undefined
  )

  const dumpHtmlPath = join(process.cwd(), 'gites-discovery/search-d2a-0613.html')
  const widgetPath = join(process.cwd(), 'gites-discovery/widget-38G253122.html')
  if (existsSync(dumpHtmlPath)) {
    const dumpHtml = readFileSync(dumpHtmlPath, 'utf8')
    const tiles = gitesTilesFromSearchHtml(dumpHtml)
    const withPhoto = tiles.filter((t) => t.image && /sites\/default\/files/.test(t.image))
    const withCap = tiles.filter((t) => t.guests && t.bedrooms)
    const copains = tiles.find((t) => t.code === '38G253122')
    check('dump SERP D2A : 20 tuiles', tiles.length === 20, tiles.length)
    check('dump SERP D2A : 20 photos Drupal', withPhoto.length === 20, withPhoto.length)
    check('dump SERP D2A : 20 capacités', withCap.length === 20, withCap.length)
    check(
      'dump Copains photo + 14p/5ch',
      Boolean(
        copains?.image?.includes('253122') &&
          copains?.image?.includes('itok=') &&
          copains?.guests === 14 &&
          copains?.bedrooms === 5
      ),
      copains
    )
  } else {
    check('dump SERP D2A présent (optionnel)', true)
  }
  if (existsSync(widgetPath)) {
    const widgetHtml = readFileSync(widgetPath, 'utf8')
    check(
      'dump widget Copains og:image ITEA',
      parseGitesWidgetPhoto(widgetHtml) ===
        'https://widget-fngf.itea.fr/photos/gites38/G/photo33/253122.jpg'
    )
  }

  heading(failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} TEST(S) EN ÉCHEC`)
  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
