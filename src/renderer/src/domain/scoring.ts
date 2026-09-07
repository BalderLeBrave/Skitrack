/**
 * Score de pertinence d'un domaine.
 *
 * Chaque critère est noté sur une **échelle absolue de référence** — un bas de
 * pistes à 1 400 m vaut 62, à 2 000 m vaut 90 — et non par comparaison aux
 * autres résultats. C'est le choix structurant de tout l'écran : un domaine
 * correct reste bien noté même affiché à côté d'un domaine exceptionnel, et la
 * note d'un domaine ne change pas quand on bouge un filtre. Une normalisation
 * min-max sur le jeu de résultats donnerait l'effet inverse, déroutant.
 *
 * Les poids sont renormalisés sur les seuls critères disponibles : un domaine
 * sans tarif de forfait relevé n'est pas pénalisé, mais la couverture est
 * affichée pour que l'écart reste lisible.
 */

import type { Domain, Forfait } from '@/data/referentiel'

export interface Criterion {
  key: string
  label: string
  weight: number
  /** 1 = plus c'est grand, mieux c'est ; -1 = critère inversé. */
  dir: 1 | -1
  unit: string
  why: string
}

export const CRITERIA: Criterion[] = [
  {
    key: 'altitude_min',
    label: 'Bas des pistes',
    weight: 0.3,
    dir: 1,
    unit: ' m',
    why: 'Le point skiable le plus bas conditionne la tenue de la neige.'
  },
  {
    key: 'altitude_max',
    label: 'Point culminant',
    weight: 0.2,
    dir: 1,
    unit: ' m',
    why: 'Du ski en altitude quand le bas se dégrade.'
  },
  {
    key: 'slopes_km',
    label: 'Km de pistes',
    weight: 0.15,
    dir: 1,
    unit: ' km',
    why: 'Volume de ski disponible sur la semaine.'
  },
  {
    key: 'travel_time',
    label: 'Temps de trajet',
    weight: 0.15,
    dir: -1,
    unit: '',
    why: 'Critère inversé : moins de route vaut mieux.'
  },
  {
    key: 'forfait',
    label: 'Forfait 6 jours',
    weight: 0.1,
    dir: -1,
    unit: ' €',
    why: 'Critère inversé : prix adulte 6 jours.'
  },
  {
    key: 'glacier',
    label: 'Glacier',
    weight: 0.05,
    dir: 1,
    unit: '',
    why: 'Bonus binaire : enneigement garanti en début et fin de saison.'
  },
  {
    key: 'linked',
    label: 'Domaine relié',
    weight: 0.05,
    dir: 1,
    unit: '',
    why: 'Bonus binaire : ski sans reprendre la voiture.'
  }
]

/** Points d'ancrage des échelles absolues, interpolés linéairement. */
const SCALES: Record<string, [number, number][]> = {
  altitude_min: [
    [800, 25],
    [1100, 45],
    [1400, 62],
    [1700, 78],
    [2000, 90],
    [2300, 100]
  ],
  altitude_max: [
    [2000, 35],
    [2400, 55],
    [2800, 72],
    [3200, 88],
    [3600, 100]
  ],
  slopes_km: [
    [10, 25],
    [40, 45],
    [90, 62],
    [150, 78],
    [250, 92],
    [400, 100]
  ],
  travel_time: [
    [210, 100],
    [300, 90],
    [360, 80],
    [420, 70],
    [480, 58],
    [600, 40],
    [720, 28]
  ],
  forfait: [
    [200, 100],
    [240, 90],
    [280, 80],
    [320, 68],
    [360, 56],
    [400, 45]
  ],
  glacier: [
    [0, 55],
    [1, 100]
  ],
  linked: [
    [0, 55],
    [1, 100]
  ]
}

export function onScale(key: string, v: number): number {
  const pts = SCALES[key]
  if (!pts) return 50
  if (v <= pts[0][0]) return pts[0][1]
  if (v >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    if (v <= x1) return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0)
  }
  return 50
}

export interface ScoreRow {
  crit: Criterion
  raw: number
  note: number
  /** Poids après renormalisation sur les critères disponibles. */
  weightAdj: number
  contrib: number
}

export interface Score {
  total: number
  rows: ScoreRow[]
  /** Somme des poids effectivement utilisés, avant renormalisation. */
  coverage: number
}

export interface ScoreInputs {
  /** Temps de trajet du foyer le plus éloigné. `null` = aucune adresse de départ. */
  travelMin: number | null
  forfait: Partial<Forfait>
  /** Un tarif estimé ne doit pas peser sur le classement. */
  forfaitEstimated: boolean
  /** Poids personnalisés, par clé de critère. */
  weights: Record<string, number>
}

function rawValue(crit: Criterion, d: Domain, inputs: ScoreInputs): number | null {
  switch (crit.key) {
    case 'altitude_min':
      return d.min
    case 'altitude_max':
      return d.max
    case 'slopes_km':
      return d.km
    case 'travel_time':
      // Sans adresse de départ, le critère est exclu et les poids restants sont
      // renormalisés : mieux vaut un score sur 85 % des critères qu'un score
      // qui pénalise tout le monde de la même façon.
      return inputs.travelMin
    case 'forfait':
      return inputs.forfaitEstimated ? null : (inputs.forfait.j6 ?? null)
    case 'glacier':
      return d.glacier ? 1 : 0
    case 'linked':
      return d.pass ? 1 : 0
    default:
      return null
  }
}

export function scoreOf(domain: Domain, inputs: ScoreInputs): Score {
  const rows: ScoreRow[] = []
  let wSum = 0
  for (const crit of CRITERIA) {
    const raw = rawValue(crit, domain, inputs)
    if (raw == null) continue
    const w = inputs.weights[crit.key] ?? crit.weight
    if (w <= 0) continue
    wSum += w
    rows.push({ crit, raw, note: onScale(crit.key, raw), weightAdj: w, contrib: onScale(crit.key, raw) * w })
  }
  const norm = wSum || 1
  for (const r of rows) {
    r.contrib = r.contrib / norm
    r.weightAdj = r.weightAdj / norm
  }
  return { total: rows.reduce((a, r) => a + r.contrib, 0), rows, coverage: wSum }
}

interface ScoreBand {
  min: number
  label: string
  fg: string
  bg: string
  dfg: string
  dbg: string
}

const SCORE_BANDS: ScoreBand[] = [
  { min: 85, label: 'Exceptionnel', fg: '#0b7a3e', bg: 'rgba(11,122,62,0.12)', dfg: '#5fd08f', dbg: 'rgba(95,208,143,0.16)' },
  { min: 72, label: 'Très bon', fg: '#2e7d32', bg: 'rgba(46,125,50,0.10)', dfg: '#9fe0a8', dbg: 'rgba(159,224,168,0.14)' },
  { min: 58, label: 'Correct', fg: '#8a5a00', bg: 'rgba(163,90,6,0.10)', dfg: '#ffca6b', dbg: 'rgba(255,202,107,0.14)' },
  { min: 44, label: 'Moyen', fg: '#b8531b', bg: 'rgba(184,83,27,0.10)', dfg: '#ffab7a', dbg: 'rgba(255,171,122,0.14)' },
  { min: 0, label: 'Faible', fg: '#a4302a', bg: 'rgba(164,48,42,0.10)', dfg: '#ff8a80', dbg: 'rgba(255,138,128,0.14)' }
]

function band(v: number): ScoreBand {
  return SCORE_BANDS.find((b) => v >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]
}

export function scoreLabel(v: number): string {
  return band(v).label
}

/** Le badge porte sa propre couleur : elle dépend de la note, pas du thème seul. */
export function scoreBadgeColors(v: number, dark: boolean): { background: string; color: string } {
  const b = band(v)
  return { background: dark ? b.dbg : b.bg, color: dark ? b.dfg : b.fg }
}
