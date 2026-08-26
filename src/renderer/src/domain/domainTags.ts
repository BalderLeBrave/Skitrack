/**
 * Étiquettes dérivées d'un domaine.
 *
 * Chacune répond à une question qu'on se pose en parcourant une liste — est-ce
 * grand, est-ce haut, est-ce cher — et son `title` donne la valeur qui l'a
 * déclenchée : une étiquette qui affirme sans pouvoir être vérifiée ne vaut pas
 * mieux qu'un argument de brochure. Aucune n'est saisie à la main.
 *
 * Le calcul vit ici plutôt que dans un composant parce qu'il a deux lecteurs
 * depuis que les étiquettes ont quitté la carte pour la fiche : les dupliquer
 * aurait laissé les seuils diverger en silence.
 */

import type { Domain } from '@/data/referentiel'
import type { TranslationKey } from '@/i18n'

/** Seuils des étiquettes, nommés pour qu'on les lise sans les deviner. */
export const LARGE_AREA_KM = 200
export const HIGH_ALTITUDE_M = 1800
export const MODERATE_PASS_EUR = 260

export interface DomainTag {
  /** Sert de clé React ; unique dans la liste rendue. */
  id: string
  txt: string
  title: string
  color: string
  soft: string
}

export interface TagFormatters {
  t: (key: TranslationKey) => string
  fmt: (v: number | null | undefined) => string
  eur: (v: number | null | undefined) => string
}

export function domainTags(
  d: Domain,
  forfait: { j6?: number | null },
  { t, fmt, eur }: TagFormatters
): DomainTag[] {
  const tags: DomainTag[] = []
  if (d.glacier)
    tags.push({
      id: 'glacier',
      txt: t('glacier'),
      title: t('glacier'),
      color: 'var(--brand)',
      soft: 'var(--brand-soft)'
    })
  if (d.pass)
    tags.push({
      id: 'pass',
      txt: d.pass,
      title: `${t('tag_common_pass')} ${d.pass}`,
      color: 'var(--violet)',
      soft: 'var(--violet-soft)'
    })
  if (d.km >= LARGE_AREA_KM)
    tags.push({
      id: 'large',
      txt: t('tag_large_area'),
      title: `${fmt(d.km)} km ${t('of_runs')}`,
      color: 'var(--ok)',
      soft: 'var(--ok-soft)'
    })
  if (d.min >= HIGH_ALTITUDE_M)
    tags.push({
      id: 'high',
      txt: t('tag_high_altitude'),
      title: `${t('altitude_bottom')} ${fmt(d.min)} m`,
      color: 'var(--brand)',
      soft: 'var(--brand-soft)'
    })
  if (forfait.j6 != null && forfait.j6 <= MODERATE_PASS_EUR)
    tags.push({
      id: 'pass_moderate',
      txt: t('tag_moderate_pass'),
      title: `${t('pass_6d_adult')} ${eur(forfait.j6)}`,
      color: 'var(--ok)',
      soft: 'var(--ok-soft)'
    })
  if (d.curated)
    tags.push({
      id: 'curated',
      txt: `✓ ${t('tag_verified')}`,
      title: t('card_checked'),
      color: 'var(--muted)',
      soft: 'var(--surface)'
    })
  return tags
}
