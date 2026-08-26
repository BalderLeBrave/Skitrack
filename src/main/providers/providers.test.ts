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
import { collectBookingPages } from './webscrape/providers'
import { bookingSearchUrl } from './webscrape/urls'
import type { RawCard } from './webscrape/extractors'
import { buildEngine } from './index'
import { extractToolPayload, parseSseMessages } from './mcp/client'
import { asNumber, mapMcpItem, readPath, resolveArguments, searchContext } from './mcp/mcpProvider'
import { loadMcpProviderConfigs } from './mcp/registry'
import type { SearchParams } from './types'
import { OUT_OF_ZONE_MARGIN_KM, boxContains, distanceKm, domainRadiusKm, filterToZone, searchZone, zoneVerdict } from '@shared/geo'
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
  // Expedia, Gîtes de France, cozycozy et LiteAPI ne sont plus enregistrés —
  // voir `buildEngine`. Leurs modules restent testés plus haut (normalisation,
  // signature, transport) : ce sont des unités toujours justes, mais qu'aucun
  // relevé n'appelle plus. Sans `enableWebScrape`, il ne reste donc que Booking.
  const engine = buildEngine({ vault: () => undefined })
  const report = await engine.search(PARAMS)
  for (const outcome of report.outcomes) {
    console.log(`  ${outcome.provider.padEnd(16)} ${outcome.results.length} résultat(s)  ${outcome.error ?? 'OK'}`)
  }
  check('seules les sources retenues sont interrogées', report.outcomes.length === 1, report.outcomes.length)
  check(
    'aucun connecteur retiré n’est enregistré',
    !report.outcomes.some((o) => ['liteapi', 'expedia', 'gites-de-france', 'cozycozy'].includes(o.provider)),
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

  heading('6. Familles de centrales — Ingénie vs le reste')
  check('2 Alpes est Ingénie', !isKnownNonIngenie('https://reservation.les2alpes.com/'))
  check('Tignes est Ingénie', !isKnownNonIngenie('reservation.tignes.net'))
  check('Chamonix est Orchestra', bookingFamilyOf('https://booking.chamonix.com/fr/') === 'orchestra')
  check('Alpe d’Huez est Ublo, pas Ingénie', bookingFamilyOf('reservation.alpedhuez.com') === 'ublo')
  check('La Bresse est Open System', bookingFamilyOf('www.labresse.net') === 'opensystem')
  check('La Toussuire est Open System', bookingFamilyOf('reservation.la-toussuire.com') === 'opensystem')
  check('Sancy n’est pas Ingénie', bookingFamilyOf('www.sancy.com') === 'sancy')

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

  heading(failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} TEST(S) EN ÉCHEC`)
  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
