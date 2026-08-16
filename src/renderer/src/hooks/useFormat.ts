/**
 * Formatage refermé sur la langue courante.
 *
 * Les fonctions de `domain/format` prennent la langue en dernier paramètre,
 * pour rester pures et utilisables hors React. Le répéter à chaque appel dans
 * les composants — et il y en a plusieurs centaines — rendrait le JSX
 * illisible et laisserait passer les oublis en silence, puisqu'un `fmt(x)` sans
 * langue continuerait de compiler tant qu'une valeur par défaut existerait.
 *
 * Ce crochet supprime les deux problèmes d'un coup : la signature dans les
 * composants reste `fmt(x)`, et une langue oubliée devient une erreur de
 * compilation plutôt qu'un « fr-FR » silencieux.
 */

import { useMemo } from 'react'
import {
  dur as durPure,
  eur as eurPure,
  fmt as fmtPure,
  fmtDate as fmtDatePure,
  fmtDay as fmtDayPure
} from '@/domain/format'
import { useI18n } from '@/i18n'

export interface Formatters {
  fmt: (v: number | null | undefined) => string
  eur: (v: number | null | undefined) => string
  dur: (min: number | null | undefined) => string
  fmtDate: (iso: string | null | undefined) => string
  fmtDay: (iso: string) => string
  /** Locale BCP-47 courante, pour les `toLocaleString` posés à la main. */
  locale: string
}

export function useFormat(): Formatters {
  const { lang, locale } = useI18n()
  return useMemo(
    () => ({
      fmt: (v) => fmtPure(v, lang),
      eur: (v) => eurPure(v, lang),
      dur: (min) => durPure(min, lang),
      fmtDate: (iso) => fmtDatePure(iso, lang),
      fmtDay: (iso) => fmtDayPure(iso, lang),
      locale
    }),
    [lang, locale]
  )
}
