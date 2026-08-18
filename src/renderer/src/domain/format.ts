/**
 * Formatage des nombres, montants, durées et dates.
 *
 * Tout suit la langue choisie : séparateurs de milliers, position du symbole
 * monétaire, ordre des composants d'une date, abréviations de durée. Un
 * montant écrit « 1 250 € » à un lecteur anglophone et « €1,250 » à un
 * francophone se lit mal dans les deux cas.
 *
 * Les fonctions restent **pures** et prennent la langue en paramètre : elles
 * servent aussi aux modules non-React (sélecteurs, données). Les composants,
 * eux, passent par `useFormat()` — voir `hooks/useFormat.ts` — qui referme la
 * langue courante et rend les appels aussi courts qu'avant.
 *
 * `slug`, `initialsOf`, `logoTint` et `nightsBetween` n'ont rien de
 * linguistique et gardent leur signature.
 */

import type { Language } from '@/i18n'
import { LOCALES, translate } from '@/i18n'

export function fmt(v: number | null | undefined, lang: Language): string {
  return v == null ? '—' : v.toLocaleString(LOCALES[lang])
}

/**
 * Montant en euros.
 *
 * `Intl.NumberFormat` place le symbole selon la langue — suffixe en français,
 * préfixe en anglais — ce qu'une concaténation manuelle ne saurait faire. Les
 * centimes sont écartés : tous les montants de l'application sont des euros
 * entiers, et « 1 250,00 € » ajoute du bruit sans rien préciser.
 */
export function eur(v: number | null | undefined, lang: Language): string {
  if (v == null) return '—'
  return new Intl.NumberFormat(LOCALES[lang], {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v)
}

/** Durée en minutes vers « 6 h 25 » ou « 45 min », selon la langue. */
export function dur(min: number | null | undefined, lang: Language): string {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  const hUnit = translate('hours', lang)
  if (h === 0) return `${m} ${translate('minutes', lang)}`
  // Le français écrit « 6 h 25 » : l'unité des minutes est sous-entendue et les
  // minutes sont complétées à deux chiffres. Les autres langues nomment les
  // deux unités — « 6 h 25 min », « 6 Std. 25 Min. » — plutôt qu'un « m »
  // anglais plaqué sur du néerlandais ou de l'allemand.
  if (lang === 'fr') return `${h} ${hUnit} ${String(m).padStart(2, '0')}`
  return `${h} ${hUnit} ${m} ${translate('minutes', lang)}`
}

export function fmtDate(iso: string | null | undefined, lang: Language): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric' })
}

export function fmtDay(iso: string, lang: Language): string {
  const d = new Date(`${iso}T12:00:00`)
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(LOCALES[lang], { weekday: 'short', day: '2-digit', month: 'short' })
}

/**
 * Plage de séjour telle qu'elle s'écrit dans la pilule : « 7 – 14 févr. ».
 *
 * Le mois n'est répété que s'il change — « 28 févr. – 7 mars », mais « 7 – 14
 * févr. ». Répéter « févr. » des deux côtés d'un tiret allonge le segment sans
 * rien apprendre, et c'est le segment le plus étroit de la pilule.
 */
export function fmtStay(arr: string, dep: string, lang: Language): string {
  const from = new Date(`${arr}T12:00:00`)
  const to = new Date(`${dep}T12:00:00`)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return '—'
  const locale = LOCALES[lang]
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
  const left = from.toLocaleDateString(locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  const right = to.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  return `${left} – ${right}`
}

/** Au moins une nuit : deux dates identiques viendraient d'une saisie en cours. */
export function nightsBetween(arr: string, dep: string): number {
  const ms = new Date(dep).getTime() - new Date(arr).getTime()
  return Math.max(1, Math.round(ms / 86400000) || 7)
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Initiales de secours quand le logo officiel du domaine n'a pas été récupéré. */
export function initialsOf(name: string): string {
  return name
    .replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/** Teinte stable dérivée du nom, pour distinguer les vignettes sans logo. */
export function logoTint(name: string, dark: boolean): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 42% ${dark ? '22%' : '92%'})`
}
