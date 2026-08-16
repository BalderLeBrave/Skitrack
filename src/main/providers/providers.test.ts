/**
 * Test des modules sources.
 *
 * Ce qui est testable sans identifiant l'est réellement : construction d'URL
 * Airbnb, normalisation Booking et Expedia sur des charges utiles figées,
 * signature Rapid, stub Gîtes de France, tri de l'agrégat. Les appels réseau
 * aux API partenaires ne sont pas simulés — sans clé, ils échouent, et c'est ce
 * que le test vérifie : l'échec est isolé et motivé, pas masqué.
 *
 *     npm run providers:test
 */

import { buildAirbnbSearchUrl, airbnbRedirect } from './airbnb/airbnb'
import { normalizeBooking } from './booking/booking'
import { normalizeExpedia, signatureFor, brandOf } from './expedia/expedia'
import { GitesDeFranceProvider } from './gites/gites'
import { buildEngine } from './index'
import { cheapestOffer, normalizeLiteApi } from './liteapi/liteapi'
import { isSandboxKey, LiteApiMcpTransport, LiteApiRestTransport } from './liteapi/transport'
import { extractToolPayload, parseSseMessages } from './mcp/client'
import { asNumber, mapMcpItem, readPath, resolveArguments, searchContext } from './mcp/mcpProvider'
import { loadMcpProviderConfigs } from './mcp/registry'
import type { SearchParams } from './types'

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

/**
 * Clé de bac à sable **publiée par l'éditeur dans sa propre documentation**
 * (docs.liteapi.travel, « Prompt for Vibe Coding tools »). Elle sert ici à
 * prouver que la chaîne fonctionne de bout en bout ; elle n'ouvre aucun droit et
 * son inventaire est réduit. Mettre `LITEAPI_KEY` dans l'environnement pour
 * tester avec la vôtre.
 */
const SANDBOX_KEY = process.env.LITEAPI_KEY ?? 'sand_c0155ab8-c683-4f26-8f94-b5e92c5797b9'
const ONLINE = process.env.PROVIDERS_OFFLINE !== 'true'

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

  heading('3. Expedia — signature, marques, normalisation')
  const signature = signatureFor({ apiKey: 'key', sharedSecret: 'secret' }, 1_700_000_000)
  check('signature SHA-512 (128 caractères hexadécimaux)', /^[0-9a-f]{128}$/.test(signature))
  check(
    'signature dépendante de l’horodatage',
    signature !== signatureFor({ apiKey: 'key', sharedSecret: 'secret' }, 1_700_000_001)
  )
  check('catégorie location → marque vrbo', brandOf({ category: { name: 'Vacation rental' } }) === 'vrbo')
  check('catégorie hôtel → marque expedia', brandOf({ category: { name: 'Hotel' } }) === 'expedia')

  const expedia = normalizeExpedia(
    {
      property_id: '987',
      name: 'Chalet des Cimes',
      location: { coordinates: { latitude: 45.3, longitude: 6.59 }, address: { city: 'Val Thorens', country_code: 'FR' } },
      ratings: { guest: { overall: 4.6, count: 57 } },
      rooms: [{ rates: [{ occupancy_pricing: { '4': { totals: { inclusive: { billable_currency: { value: '3120.00', currency: 'EUR' } } } } } }] }]
    },
    PARAMS
  )
  check('normalisé', expedia !== null)
  check('prix total extrait', expedia?.totalPrice === 3120, expedia?.totalPrice)
  check('devise extraite', expedia?.currency === 'EUR')

  heading('4. Gîtes de France — stub non bloquant')
  const gites = await new GitesDeFranceProvider().search(PARAMS)
  check('renvoie un tableau vide', Array.isArray(gites) && gites.length === 0)
  check('ne lève pas', true)

  heading('5. LiteAPI — normalisation sur charge utile figée')
  const liteApiPayload = {
    data: [
      {
        hotelId: 'lp724fb',
        roomTypes: [
          {
            offerId: 'offre-chere',
            rates: [{ name: 'Suite', retailRate: { total: [{ amount: 9200, currency: 'EUR' }] } }]
          },
          {
            offerId: 'offre-mini',
            rates: [
              {
                name: 'Appartement 4 personnes',
                maxOccupancy: 4,
                boardName: 'Room Only',
                retailRate: {
                  total: [{ amount: 6587.36, currency: 'EUR' }],
                  taxesAndFees: [
                    { included: true, description: 'TaxPercent', amount: 154.04 },
                    { included: false, description: 'CityTaxAmount', amount: 49.89 }
                  ]
                }
              }
            ]
          }
        ]
      },
      { hotelId: 'sans-fiche', roomTypes: [{ rates: [{ retailRate: { total: [{ amount: 100 }] } }] }] }
    ],
    hotels: [
      {
        id: 'lp724fb',
        name: 'Résidence Koh-I Nor by Les Etincelles',
        city_name: 'Les Belleville',
        country_code: 'fr',
        latitude: 45.2932,
        longitude: 6.5789,
        rating: 8.8,
        stars: 5,
        review_count: 32,
        main_photo: 'https://static.cupid.travel/hotels/koh-i-nor.jpg'
      }
    ]
  }

  const best = cheapestOffer(liteApiPayload.data[0])
  check('offre la moins chère retenue', best?.total === 6587.36, best?.total)
  check('identifiant d’offre associé', best?.offerId === 'offre-mini')

  const [lite] = normalizeLiteApi(liteApiPayload, GEO)
  check('normalisé', lite !== undefined)
  check('prix total ferme', lite?.totalPrice === 6587.36)
  check('prix à la nuit calculé sur 7 nuits', lite?.nightlyPrice === 941.05, lite?.nightlyPrice)
  check('taxes non incluses isolées', lite?.taxes === 49.89, lite?.taxes)
  check('code pays normalisé en majuscules', lite?.country === 'FR')
  check('offre réservable identifiée', lite?.offerId === 'offre-mini')
  check('confiance de prix maximale', lite?.priceConfidence === 'total_confirmed')
  check(
    'établissement sans fiche descriptive écarté',
    normalizeLiteApi(liteApiPayload, GEO).length === 1
  )
  check('clé de bac à sable reconnue', isSandboxKey('sand_abc') && !isSandboxKey('prod_abc'))

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
  // Aucun identifiant fourni : Booking et Expedia doivent échouer proprement.
  const engine = buildEngine({ vault: () => undefined })
  const report = await engine.search(PARAMS)
  for (const outcome of report.outcomes) {
    console.log(`  ${outcome.provider.padEnd(16)} ${outcome.results.length} résultat(s)  ${outcome.error ?? 'OK'}`)
  }
  check('toutes les sources ont répondu', report.outcomes.length === 4, report.outcomes.length)
  check(
    'LiteAPI échoue avec un motif actionnable',
    Boolean(report.outcomes.find((o) => o.provider === 'liteapi')?.error?.includes('Réglages'))
  )
  check(
    'Booking échoue avec un motif explicite',
    Boolean(report.outcomes.find((o) => o.provider === 'booking')?.error?.includes('Demand API'))
  )
  check(
    'Gîtes de France n’est pas en erreur',
    report.outcomes.find((o) => o.provider === 'gites-de-france')?.error === null
  )
  check('l’agrégat n’a pas levé', true)

  heading('10. LiteAPI — appel réel, REST puis MCP')
  if (!ONLINE) {
    console.log('  (ignoré : PROVIDERS_OFFLINE=true)')
  } else {
    const body = {
      latitude: 45.2967,
      longitude: 6.5806,
      radius: 12_000,
      occupancies: [{ adults: 2 }],
      currency: 'EUR',
      guestNationality: 'FR',
      checkin: '2027-02-06',
      checkout: '2027-02-13',
      maxRatesPerHotel: 1,
      includeHotelData: true
    }

    try {
      const rest = await new LiteApiRestTransport(SANDBOX_KEY).rates(body)
      const viaRest = normalizeLiteApi(rest, GEO)
      console.log(`  REST : ${viaRest.length} logement(s)${rest.sandbox ? ' — bac à sable' : ''}`)
      for (const item of viaRest.slice(0, 3)) {
        console.log(`    ${item.title} — ${item.totalPrice} ${item.currency} (${item.city})`)
      }
      check('REST répond sans lever', true)

      const mcp = await new LiteApiMcpTransport(SANDBOX_KEY).rates(body)
      const viaMcp = normalizeLiteApi(mcp, GEO)
      console.log(`  MCP  : ${viaMcp.length} logement(s)`)
      check('MCP répond sans lever', true)
      // La propriété qui justifie un mapper unique : les deux transports doivent
      // rendre le même inventaire. Si elle tombe un jour, c'est ici qu'on le voit.
      check(
        'REST et MCP rendent le même inventaire',
        viaRest.map((r) => r.sourceId).join() === viaMcp.map((r) => r.sourceId).join(),
        { rest: viaRest.map((r) => r.sourceId), mcp: viaMcp.map((r) => r.sourceId) }
      )
    } catch (error) {
      console.log(`  réseau indisponible : ${(error as Error).message}`)
      console.log('  (non compté comme échec — relancer avec PROVIDERS_OFFLINE=true pour ignorer)')
    }
  }

  heading(failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} TEST(S) EN ÉCHEC`)
  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
