import {
  alpineClassicTotal,
  allocateToTotal,
  domainMatchesPisteFilters,
  emptyDomainSlopes,
  PISTE_PRESETS,
  pisteSplitSum,
  scaleKmToAnnounced,
  segmentShare,
  type DomainSlopes,
  type PisteCompareFilters
} from './pistes'

const vt: DomainSlopes = {
  slopes_count_by_color: { green: 8, blue: 21, red: 14, black: 6 },
  slopes_km_by_color: { green: 12, blue: 40.2, red: 28, black: 9.5 },
  slopes_count_total: 49,
  slopes_count_alpine_classic: 49,
  slopes_quality: 'complete',
  slopes_source: 'openskimap'
}

const vert: DomainSlopes = {
  slopes_count_by_color: { green: 30, blue: 5, red: 5, black: 2 },
  slopes_count_total: 42,
  slopes_count_alpine_classic: 42,
  slopes_quality: 'complete',
  slopes_source: 'openskimap'
}

const famille: DomainSlopes = {
  slopes_count_by_color: { green: 20, blue: 20, red: 8, black: 2 },
  slopes_count_total: 50,
  slopes_count_alpine_classic: 50,
  slopes_quality: 'complete',
  slopes_source: 'openskimap'
}

const noir: DomainSlopes = {
  slopes_count_by_color: { green: 2, blue: 4, red: 10, black: 12, expert: 3 },
  slopes_count_total: 31,
  slopes_count_alpine_classic: 28,
  slopes_quality: 'complete',
  slopes_source: 'openskimap'
}

function check(name: string, ok: boolean, extra?: unknown): void {
  if (!ok) {
    console.error('FAIL', name, extra ?? '')
    process.exitCode = 1
    return
  }
  console.log('ok', name)
}

check('classic 8+21+14+6 = 49', alpineClassicTotal(vt.slopes_count_by_color) === 49)
check('share blue 21/49', Math.abs(segmentShare(vt.slopes_count_by_color, 'blue') - 21 / 49) < 1e-9)
check('empty n’est pas 0/0/0/0', emptyDomainSlopes().slopes_quality === 'empty' && alpineClassicTotal(emptyDomainSlopes().slopes_count_by_color) === 0)

const base: PisteCompareFilters = {
  preset: 'all',
  hideEmpty: true,
  unit: 'count',
  sort: 'total_desc'
}
check('min 5 noires écarte VT', domainMatchesPisteFilters(vt, { ...base, minBlack: 5 }) === true)
check('min 8 noires écarte VT', domainMatchesPisteFilters(vt, { ...base, minBlack: 8 }) === false)
check('famille garde un domaine vert/bleu', domainMatchesPisteFilters(famille, { ...base, preset: 'famille' }) === true)
check('famille écarte un domaine très noir', domainMatchesPisteFilters(noir, { ...base, preset: 'famille' }) === false, {
  shareBlack: (noir.slopes_count_by_color.black ?? 0) / 28,
  max: PISTE_PRESETS.famille.maxShareBlack
})
check('mixte écarte un domaine trop vert (30/42 > 50 %)', domainMatchesPisteFilters(vert, { ...base, preset: 'mixte' }) === false)
check('mixte garde VT (aucune couleur > 50 %)', domainMatchesPisteFilters(vt, { ...base, preset: 'mixte' }) === true)
check('engage garde un domaine rouge/noir', domainMatchesPisteFilters(noir, { ...base, preset: 'engage' }) === true)
check('expert garde ≥ 8 noires', domainMatchesPisteFilters(noir, { ...base, preset: 'expert' }) === true)
check('expert écarte VT (6 noires, < 20 %)', domainMatchesPisteFilters(vt, { ...base, preset: 'expert' }) === false)
check('empty masqué', domainMatchesPisteFilters(emptyDomainSlopes(), base) === false)
check(
  'empty visible si hideEmpty false et preset all',
  domainMatchesPisteFilters(emptyDomainSlopes(), { ...base, hideEmpty: false }) === true
)

const parts = allocateToTotal([1, 1, 1, 1, 0], 225, 1)
check(
  'arrondi : 4 parts égales somment à 225',
  Math.abs(parts.reduce((n, v) => n + v, 0) - 225) < 1e-9,
  parts
)

const scaled = scaleKmToAnnounced(vt, 225)
check('225 annoncé → somme des couleurs = 225', pisteSplitSum(scaled) === 225 && scaled.total === 225, scaled)
check('basis brochure_scaled', scaled.basis === 'brochure_scaled')
check('bleu plus long que vert (parts OSM km)', scaled.blue > scaled.green)
check('sans mix OSM, pas de km inventés', scaleKmToAnnounced(emptyDomainSlopes(), 225).basis === 'none')

const osmOnly = scaleKmToAnnounced(vt, 0)
check(
  'sans fiche km, on montre les km OSM (somme 89,7)',
  osmOnly.basis === 'osm' && Math.abs(pisteSplitSum(osmOnly) - 89.7) < 0.05,
  osmOnly
)

check(
  'filtre km : ≥ 80 km de bleues (part × 225 ≈ 101) passe',
  domainMatchesPisteFilters(vt, { ...base, unit: 'km', minBlue: 80 }, 225) === true
)
check(
  'filtre km : ≥ 120 km de bleues écarte',
  domainMatchesPisteFilters(vt, { ...base, unit: 'km', minBlue: 120 }, 225) === false
)
check(
  'filtre % : ≥ 30 % bleues passe',
  domainMatchesPisteFilters(vt, { ...base, unit: 'pct', minBlue: 30 }, 225) === true
)
check(
  'filtre % : ≥ 80 % bleues écarte',
  domainMatchesPisteFilters(vt, { ...base, unit: 'pct', minBlue: 80 }, 225) === false
)
check(
  'filtre nombre inchangé : ≥ 20 bleues passe VT',
  domainMatchesPisteFilters(vt, { ...base, unit: 'count', minBlue: 20 }) === true
)

if (process.exitCode) process.exit(1)
