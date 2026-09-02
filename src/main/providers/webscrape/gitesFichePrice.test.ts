/**
 * Prix séjour Gîtes / ITEA — parseurs + contrat catalogue, sans réseau.
 *
 *   npm run gites:price-test
 */

import {
  applyGitesClientContract,
  classifyGitesTypology,
  GITES_SOURCE_PATHS,
  gitesCodeFromUrl,
  gitesDatesNotFillable,
  gitesQuoteFailed,
  gitesWidgetUrl,
  interpretGitesQuoteBody,
  isDroppedGitesType,
  isGitesIndividualGiteType,
  isKeptIndividualGiteOffer,
  isoToFrDate,
  looksWeeklyFromPriceText,
  parseGitesStayTotal,
  parseGitesWidgetContext,
  parseGitesWidgetPhoto
} from './gitesFichePrice'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(
    `  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`
  )
  if (!condition) failures++
}

const TEASER = `
<div class="prixAPartirDe prixArrondi prixSansDate">
  <span class="span_lst_libelle_avant_prix">A partir de</span>
  <span class="prixListeNormal">1700<span class="lblEuro">€</span></span>
  <span class="span_lst_libelle_apres_prix">/semaine</span>
</div>`

const DATED_8P = `
<div class="div_prixLocation div_prixLocationTotal">
  <span class="sp_lblAvantPrixTotal">Total</span>
  <span class="sp_montantPrixTotal" data-prix="2448.4"> 2448,40€</span>
</div>
<div class="uneFormule" id="uneFormule_formule_2" data-prixtotal="2448,40€"></div>`

const SERP_TILE = `
<span class="g2f-accommodationTile-text-price-base">À partir de</span>
<span class="g2f-accommodationTile-text-price-new"><strong>1 700&nbsp;€</strong> par semaine</span>`

const WIDGET = `
<div id="div_choixDates_packDivDatesTarifs" data-ident="gites38_b2026.1.20200.G" data-instance="gites38" data-exercice="2026">`

check('tuile « À partir de /semaine » = indicatif', looksWeeklyFromPriceText('À partir de 1 700 € par semaine') === true)
check('A partir de 1700€/semaine (sans accent)', looksWeeklyFromPriceText('A partir de 1700€/semaine') === true)
check('total daté n’est pas un tarif semaine', looksWeeklyFromPriceText('Total 2448,40€') === false)
check('SERP dumpée = indicatif', looksWeeklyFromPriceText(SERP_TILE.replace(/\s+/g, ' ')) === true)

check('URL → 38G20200', gitesCodeFromUrl('https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/chalet-maradri-38g20200') === '38G20200')
check('ISO → FR', isoToFrDate('2027-02-06') === '06/02/2027')
check('widget ITEA', gitesWidgetUrl('38g20200').includes('fiche-38G20200.html') && gitesWidgetUrl('38g20200').includes('NUMGITE=38G20200'))

const ctx = parseGitesWidgetContext(WIDGET)
check('ident dumpé', ctx?.ident === 'gites38_b2026.1.20200.G', ctx)
check('instance gites38', ctx?.instance === 'gites38')
check(
  'og:image widget ITEA',
  parseGitesWidgetPhoto(
    '<meta property="og:image" content="https://widget-fngf.itea.fr/photos/gites38/G/photo33/253122.jpg">'
  ) === 'https://widget-fngf.itea.fr/photos/gites38/G/photo33/253122.jpg'
)
check(
  'JSON-LD image widget',
  parseGitesWidgetPhoto('"image" : "https://widget-fngf.itea.fr/photos/gites38/G/photo3/20200.jpg"') ===
    'https://widget-fngf.itea.fr/photos/gites38/G/photo3/20200.jpg'
)
check('picto widget rejeté', parseGitesWidgetPhoto('<img src="/api_externe/images/pictos/close.svg">') === undefined)
check(
  'img ITEA photos/ si og:image absent',
  parseGitesWidgetPhoto(
    '<img src="https://widget-fngf.itea.fr/photos/gites38/G/photo3/52200.jpg">'
  ) === 'https://widget-fngf.itea.fr/photos/gites38/G/photo3/52200.jpg'
)
check('pas de chemin inventé', parseGitesWidgetPhoto('<div data-ident="x.G"></div>') === undefined)

check('teaser sans dates → pas de total', parseGitesStayTotal(TEASER) === undefined)
check('8 pers. 06–13/02/2027 → 2448,40 €', parseGitesStayTotal(DATED_8P) === 2448.4)
const COPAINS = '<span class="sp_montantPrixTotal" data-prix="4261.52">4261,52 &euro;</span><div id="uneFormule_formule_2" data-prixtotal="4261,52&euro;"></div>'
check('Copains 06–13/02/2027 8 pers. → 4261,52 € (pas 1330)', parseGitesStayTotal(COPAINS) === 4261.52)
check('1330 /semaine n’est pas un séjour', looksWeeklyFromPriceText('À partir de 1 330 € par semaine') === true)
check('échec de calcul', gitesQuoteFailed('Nous sommes désolé mais nous ne pouvons pas calculer le prix de ce séjour.') === true)
check('contactSiNonVendable → dates non remplissables', gitesDatesNotFillable('{"contactSiNonVendable":"centrale","prixLoc":"4070 &euro;"}') === true)
check(
  'bandeau caché du widget ≠ indispo',
  gitesQuoteFailed(
    '<div class="div_msgErreurRetourVerifDates" style="display:none;"><div class="div_msgCalculPrixImpossible">Nous sommes désolé mais nous ne pouvons pas calculer le prix de ce séjour.</div></div>'
  ) === false
)
check('Gîte retenu', isGitesIndividualGiteType('Gîte') === true)
check('Gîte - logement entier retenu', isGitesIndividualGiteType('Gîte - logement entier') === true)
check('Chambre d’hôtes écartée', isDroppedGitesType("Chambre d'hôtes") === true && isGitesIndividualGiteType("Chambre d'hôtes") === false)
check('Gîte de groupe écarté', isDroppedGitesType('Gîte de groupe') === true && isGitesIndividualGiteType('Gîte de groupe') === false)
check(
  'URL gite-de-groupe + libellé Gîte = hors liste',
  isKeptIndividualGiteOffer({
    type: 'Gîte',
    url: 'https://www.gites-de-france.com/fr/isere/gite-de-groupe-alpe-38g253115'
  }) === false
)
check('prixLoc JSON n’est pas un séjour', interpretGitesQuoteBody('{"contactSiNonVendable":"centrale","prixLoc":"4070 &euro;"}').stay === undefined)

check('path_price_from universel', GITES_SOURCE_PATHS.path_price_from.includes('prixSansDate'))
check('path_price_total_stay universel', GITES_SOURCE_PATHS.path_price_total_stay.includes('getHTMLTabPrixFormulesSejour'))
check('path_available universel', GITES_SOURCE_PATHS.path_available.includes('contactSiNonVendable'))
check('path_typology universel', GITES_SOURCE_PATHS.path_typology.includes('.G'))

check('ident .G = gîte', classifyGitesTypology({ ident: 'gites38_b2026.1.253122.G' }) === 'gite')
check("ident .H = chambre d'hôtes", classifyGitesTypology({ ident: 'gites38_b2026.1.549050.H' }) === 'chambre_hotes')
check('ident .GS = groupe', classifyGitesTypology({ ident: 'gites38_b2026.1.253115.GS' }) === 'groupe')
check(
  'URL gite-de-groupe bat un libellé Gîte',
  classifyGitesTypology({
    type: 'Gîte',
    url: 'https://www.gites-de-france.com/fr/isere/gite-de-groupe-alpe-38g253115'
  }) === 'groupe'
)
check(
  'og:url Chambre-d-hotes',
  classifyGitesTypology({
    url: 'https://widget-fngf.itea.fr/location-vacances/Chambre-d-hotes-Villard-notre-dame-38G549050.html'
  }) === 'chambre_hotes'
)
check('grand gîte (capacité 20) reste gîte si type = gîte', classifyGitesTypology({ type: 'Gîte' }) === 'gite')
check('typologie absente', classifyGitesTypology({}) === 'missing')

const demand = { check_in: '2027-02-06', check_out: '2027-02-13', guests: 8, bedrooms: 4 }
const raw = [
  {
    listing_id: 'a',
    ident: 'x.G',
    property_type: 'Gîte',
    guests: 14,
    bedrooms: 5,
    price_from: 1330,
    quote: { check_in: demand.check_in, check_out: demand.check_out, guests: 8, stay: 4261.52, available: true }
  },
  {
    listing_id: 'b',
    ident: 'y.G',
    property_type: 'Gîte',
    guests: 10,
    bedrooms: 4,
    price_from: 1400,
    quote: { check_in: demand.check_in, check_out: demand.check_out, guests: 8, stay: 2899.36, available: true }
  },
  {
    listing_id: 'c',
    ident: 'z.G',
    property_type: 'Gîte',
    guests: 8,
    bedrooms: 4,
    price_from: 950,
    quote: { check_in: demand.check_in, check_out: demand.check_out, guests: 8, stay: 1898.4, available: true }
  },
  {
    listing_id: 'chambre',
    ident: 'h.H',
    property_type: "Chambre d'hôtes",
    guests: 14,
    bedrooms: 4,
    price_from: 90,
    quote: { check_in: demand.check_in, check_out: demand.check_out, guests: 8, stay: 700, available: true }
  },
  {
    listing_id: 'groupe',
    ident: 'g.GS',
    property_type: 'Gîte de groupe',
    guests: 50,
    bedrooms: 12,
    price_from: 35,
    quote: { check_in: demand.check_in, check_out: demand.check_out, guests: 8, stay: 2100, available: true }
  },
  {
    listing_id: 'closed',
    ident: 'n.G',
    property_type: 'Gîte',
    guests: 15,
    bedrooms: 5,
    price_from: 1208,
    quote: { check_in: demand.check_in, check_out: demand.check_out, guests: 8, stay: null, available: false }
  }
]
const g1 = applyGitesClientContract(raw, demand)
check('G1 ≥3 gîtes, price_firm, total ≠ price_from', g1.shown.length === 3 && g1.shown.every((s) => s.price_firm && s.price_total_stay_amount !== s.price_from))
check('G2 chambre d’hôtes → 0 client', g1.counters.hidden_gites_chambre_hotes === 1 && !g1.shown.some((s) => s.listing_id === 'chambre'))
check('G3 gîte de groupe → 0 client', g1.counters.hidden_gites_groupe === 1 && !g1.shown.some((s) => s.listing_id === 'groupe'))
check('G4 unavailable → 0 client, pas le price_from', g1.counters.hidden_gites_unavailable === 1 && !g1.shown.some((s) => s.listing_id === 'closed'))

const copainsOpen = applyGitesClientContract(
  [
    {
      listing_id: 'copains',
      ident: 'gites38_b2026.1.253122.G',
      property_type: 'Gîte',
      guests: 14,
      bedrooms: 5,
      price_from: 1330,
      quote: { check_in: '2027-02-06', check_out: '2027-02-13', guests: 8, stay: 4261.52, available: true }
    }
  ],
  demand
)
const copainsClosed = applyGitesClientContract(
  [
    {
      listing_id: 'copains',
      ident: 'gites38_b2026.1.253122.G',
      property_type: 'Gîte',
      guests: 14,
      bedrooms: 5,
      price_from: 1330,
      quote: { check_in: '2027-02-13', check_out: '2027-02-20', guests: 8, stay: null, available: false }
    }
  ],
  { check_in: '2027-02-13', check_out: '2027-02-20', guests: 8, bedrooms: 4 }
)
check('G5 Copains 06–13 = 4261.52 pas 1330', copainsOpen.shown[0]?.price_total_stay_amount === 4261.52)
check('G5 Copains 13–20 exclu', copainsClosed.shown.length === 0)

const jan = applyGitesClientContract(
  [
    {
      listing_id: 'b',
      ident: 'y.G',
      property_type: 'Gîte',
      guests: 10,
      bedrooms: 4,
      price_from: 1400,
      quote: { check_in: '2027-01-23', check_out: '2027-01-30', guests: 8, stay: 1642.24, available: true }
    }
  ],
  { check_in: '2027-01-23', check_out: '2027-01-30', guests: 8, bedrooms: 4 }
)
const feb = applyGitesClientContract(
  [
    {
      listing_id: 'b',
      ident: 'y.G',
      property_type: 'Gîte',
      guests: 10,
      bedrooms: 4,
      price_from: 1400,
      quote: { check_in: '2027-02-06', check_out: '2027-02-13', guests: 8, stay: 2899.36, available: true }
    }
  ],
  demand
)
check(
  'G6 changer les dates change le total',
  jan.shown[0]?.price_total_stay_amount === 1642.24 &&
    feb.shown[0]?.price_total_stay_amount === 2899.36 &&
    jan.shown[0]?.price_total_stay_amount !== feb.shown[0]?.price_total_stay_amount
)

if (failures > 0) {
  console.log(`${failures} TEST(S) EN ÉCHEC`)
  process.exitCode = 1
} else {
  console.log('TOUS LES TESTS PASSENT')
}
