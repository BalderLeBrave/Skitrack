/**
 * Calendrier des semaines, saisonnalité et tendance de prix.
 *
 * La neige et la météo ne sont plus ici : elles viennent d'Open-Meteo, en
 * direct, voir `data/weather.ts`.
 */

import type { Domain } from './referentiel'

export interface Week {
  arr: string
  dep: string
  label: string
  /** Écart de prix moyen du logement par rapport à la semaine de référence. */
  f: number
}

export const WEEKS: Week[] = [
  { arr: '2027-01-24', dep: '2027-01-31', label: '24 – 31 janv.', f: -0.22 },
  { arr: '2027-01-31', dep: '2027-02-07', label: '31 janv. – 7 févr.', f: -0.12 },
  { arr: '2027-02-07', dep: '2027-02-14', label: '7 – 14 févr. (zone C)', f: 0 },
  { arr: '2027-02-14', dep: '2027-02-21', label: '14 – 21 févr.', f: -0.08 },
  { arr: '2027-02-21', dep: '2027-02-28', label: '21 – 28 févr.', f: -0.26 }
]

export function weekByArrival(arr: string): Week | undefined {
  return WEEKS.find((w) => w.arr === arr)
}

/**
 * Écart de prix d'une semaine pour un domaine donné.
 *
 * L'écart national est modulé par l'amplitude de saisonnalité du domaine : une
 * station de clientèle nationale voit ses prix s'effondrer hors vacances
 * scolaires, une station de proximité beaucoup moins.
 */
export function weekFactorFor(domain: Pick<Domain, 'sais'> | null | undefined, week: Week | undefined): number {
  if (!week) return 0
  const amp = domain?.sais ?? 1
  return Math.round(week.f * amp * 1000) / 1000
}

export function seasonalityText(domain: Pick<Domain, 'sais'> | null | undefined): string {
  const amp = domain?.sais ?? 1
  if (amp >= 1.25) return 'écarts de prix très marqués entre semaines'
  if (amp >= 1.05) return 'écarts de prix marqués entre semaines'
  if (amp >= 0.8) return 'écarts de prix modérés'
  return 'prix stable d’une semaine à l’autre'
}

/** Orientation des pistes : part des kilomètres par exposition. */
export const EXPOSURES: [string, number][] = [
  ['Nord', 46],
  ['Nord-Est', 22],
  ['Est', 12],
  ['Sud-Est', 8],
  ['Sud', 7],
  ['Ouest', 5]
]

export interface PriceHistory {
  /** Points du sparkline, dans le repère 80 × 22. */
  pts: string
  pct: number
  txt: string
  color: string
}

/**
 * Tendance du prix moyen des logements d'un domaine sur 8 semaines.
 * Déterministe : le même domaine donne toujours la même courbe.
 */
export function domainPriceHistory(domain: Domain): PriceHistory {
  const seed = domain.id * 131 + 7
  const rnd = (i: number): number => {
    const x = Math.sin(seed * (i + 1)) * 10000
    return x - Math.floor(x)
  }
  const base = 100
  const vals = Array.from({ length: 8 }, (_, i) => base * (1 + (0.1 - i * 0.022) + (rnd(i) - 0.5) * 0.045))
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = Math.max(max - min, 0.01)
  const pts = vals
    .map((v, i) => `${(i * (78 / (vals.length - 1))).toFixed(1)},${(2 + (1 - (v - min) / span) * 18).toFixed(1)}`)
    .join(' ')
  const pct = Math.round((vals[vals.length - 1] / vals[0] - 1) * 100)
  return {
    pts,
    pct,
    txt: `${pct <= 0 ? '▼ ' : '▲ +'}${Math.abs(pct)} % sur 8 semaines`,
    color: pct <= -4 ? 'var(--ok)' : pct >= 4 ? 'var(--warn)' : 'var(--muted)'
  }
}
