/**
 * Fusion liste + offres MSEM — fixture enregistrée, pas de réseau.
 *
 *   npx esbuild src/main/providers/ublo/msem.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/ublo-msem-test.mjs --loader:.json=json && node node_modules/.cache/ublo-msem-test.mjs
 */
import list from './fixtures/list-sample.json'
import offers from './fixtures/offers-sample.json'
import { mergeListAndOffers, lodgingUrl, type MsemListPayload, type MsemOffersMap } from './msem'
import { ubloSiteOf } from './hosts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const site = ubloSiteOf('https://reservation.alpedhuez.com/')
assert(site?.channel === 'OT-125' && site.resort === 125, 'Alpe d’Huez')
assert(ubloSiteOf('www.saintefoy-reservation.com')?.channel === 'OT-595', 'Sainte-Foy')
assert(ubloSiteOf('reservation.saintfrancoislongchamp.com')?.channel === 'OT-SFL', 'SFL')
// Isola 2000 : le canal ne suit pas le motif `OT-<resort>` des trois autres.
// Relevé sur l'appel du widget, pas extrapolé — c'est ce que ce cas protège.
const isola = ubloSiteOf('https://isola2000.com/reservez-votre-sejour/')
assert(isola?.resort === 386 && isola.channel === 'ISOLA', 'Isola 2000')
assert(ubloSiteOf('www.isola2000.com')?.channel === 'ISOLA', 'Isola avec www')

// Valberg / Écrins : ids dumpés le 2026-09-01, même connecteur, pas un parseur.
const valberg = ubloSiteOf('https://www.valberg.com/sejourner/reserver-votre-sejour/')
assert(valberg?.resort === 665 && valberg.channel === 'OT-665', 'Valberg 665/OT-665')
assert(ubloSiteOf('valberg.com')?.channel === 'OT-665', 'Valberg sans www')
const ecrins = ubloSiteOf('https://www.paysdesecrins.com/hebergements/')
assert(ecrins?.resort === 30015 && ecrins.channel === 'PDE', 'Écrins 30015/PDE — pas OT-30015')
assert(ubloSiteOf('paysdesecrins.com')?.channel === 'PDE', 'Écrins sans www')

// Isola ne publie pas de fiche par logement : le patron `/hebergements/{slug}`
// des trois autres centrales y rendait une 404. Le lien mène à la page de la
// centrale, sans critères accrochés — voir `UbloSite.fallbackPath`.
const urlIsola = lodgingUrl(isola!, 'studio-en-plein-coeur-du-front-de-neige', '2027-02-06', '2027-02-13', 2, 0)
assert(
  urlIsola === 'https://isola2000.com/reservez-votre-sejour/?lodging=studio-en-plein-coeur-du-front-de-neige',
  `Isola sans fiche — ${urlIsola}`
)
// Deux annonces de la même centrale gardent deux URL : sans cela le relevé les
// dédoublonnerait l'une contre l'autre et n'en garderait qu'une.
assert(
  lodgingUrl(isola!, 'studio-a', '2027-02-06', '2027-02-13', 2, 0) !==
    lodgingUrl(isola!, 'studio-b', '2027-02-06', '2027-02-13', 2, 0),
  'deux logements Isola, deux URL'
)
// Aucun critère de séjour accroché : le widget ne les lit pas.
assert(!urlIsola.includes('from=') && !urlIsola.includes('adults='), `Isola sans critères — ${urlIsola}`)
const urlValberg = lodgingUrl(valberg!, 'ancolies-8', '2027-02-13', '2027-02-20', 8, 0)
assert(
  urlValberg === 'https://www.valberg.com/sejourner/reserver-votre-sejour/?lodging=ancolies-8',
  `Valberg sans fiche — ${urlValberg}`
)
assert(!urlValberg.includes('from='), `Valberg sans critères — ${urlValberg}`)
const urlEcrins = lodgingUrl(ecrins!, 'residence-dame-blanche-dba-127', '2027-02-13', '2027-02-20', 8, 0)
assert(
  urlEcrins === 'https://www.paysdesecrins.com/hebergements/?lodging=residence-dame-blanche-dba-127',
  `Écrins sans fiche — ${urlEcrins}`
)
const urlAdh = lodgingUrl(site!, 'un-slug', '2027-02-06', '2027-02-13', 2, 0)
assert(urlAdh.includes('/hebergements/un-slug') && urlAdh.includes('from=2027-02-06'), `Alpe d’Huez garde sa fiche — ${urlAdh}`)
assert(ubloSiteOf('reservation.les2alpes.com') == null, '2 Alpes n’est pas Ublo')

const listings = mergeListAndOffers(
  list as MsemListPayload,
  offers as MsemOffersMap,
  site!,
  '2027-01-16',
  '2027-01-23',
  2,
  0
)

assert(listings.length === 3, `expected 3 priced, got ${listings.length}`)
const first = listings[0]!
assert(first.title.includes('Chez Nico'), `cheapest should be Chez Nico, got ${first.title}`)
assert(first.total === 583.19, `rounded price, got ${first.total}`)
assert(first.priceConfidence === 'total_confirmed', 'confidence')
assert(first.city && first.city.toUpperCase().includes('HUEZ'), `city ${first.city}`)
assert(first.image && first.image.startsWith('https://'), 'image')
assert(first.url.includes(first.slug), `url slug ${first.url}`)
assert(first.url.includes('from=2027-01-16'), 'dated from')
assert(first.url.includes('to=2027-01-23'), 'dated to')
assert(
  listings.every((l) => l.total > 0),
  'no zero prices'
)
assert(
  !listings.some((l) => l.title.includes('MAEVA')),
  'unpriced MAEVA excluded'
)

const url = lodgingUrl(site!, 'chalet-test', '2027-01-16', '2027-01-23', 4, 1)
assert(url.includes('adults=4') && url.includes('children=1'), url)
// Le segment de fiche : sans lui, chaque annonce ouvrait un 404. Voir
// `LISTING_SEGMENT` dans msem.ts — relevé sur les sitemap des trois centrales.
assert(
  url.startsWith('https://reservation.alpedhuez.com/hebergements/chalet-test?'),
  `chemin de fiche inattendu : ${url}`
)
// Sainte-Foy publie sous `/fr` : le préfixe précède le segment, il ne le
// remplace pas.
const sfSite = ubloSiteOf('https://www.saintefoy-reservation.com/')
assert(sfSite != null, 'site Sainte-Foy connu')
assert(
  lodgingUrl(sfSite!, 'chalet-test', '2027-01-16', '2027-01-23', 2, 0).startsWith(
    'https://www.saintefoy-reservation.com/fr/hebergements/chalet-test?'
  ),
  'préfixe de langue conservé devant le segment de fiche'
)

console.log(
  `ok ublo-msem: ${listings.length} offres — « ${first.title.slice(0, 40)} » ${first.total}€`
)
