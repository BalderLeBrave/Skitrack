/**
 * Pastille de source — la marque d'une plateforme, en une puce.
 *
 * ## Composant présentationnel pur
 *
 * Aucune lecture de `useApp`, aucun accès aux données : la source entre par la
 * prop, sous sa forme configurée ou sous son simple libellé. C'est ce qui
 * permet de la poser aussi bien dans un filtre que dans une vignette.
 *
 * ## Une source inconnue s'affiche quand même
 *
 * `getProvider()` ne connaît pas les sources MCP déclarées par l'utilisateur :
 * elles portent le nom qu'il leur a donné. Le badge les rend alors telles
 * quelles, avec une teinte neutre. Effacer une source faute de l'avoir en
 * table serait pire que l'afficher sans couleur.
 *
 * ## La couleur n'est jamais seule à parler
 *
 * La teinte est un repère de balayage, pas une information : le nom
 * l'accompagne, et quand il est masqué (`showName={false}`) la pastille garde
 * un `aria-label`. Une pastille dont la couleur serait le seul contenu ne
 * dirait rien à qui ne la distingue pas.
 */

import { getProvider, type ProviderConfig } from '@/data/providers'

export type ProviderBadgeSize = 'sm' | 'md' | 'lg'

export interface ProviderBadgeProps {
  /** Configuration complète, ou libellé/identifiant à résoudre. */
  provider: ProviderConfig | string
  size?: ProviderBadgeSize
  /** À `false`, seule la teinte reste — le nom passe en `aria-label`. */
  showName?: boolean
}

export function ProviderBadge({
  provider,
  size = 'md',
  showName = true
}: ProviderBadgeProps): JSX.Element {
  const config = typeof provider === 'string' ? getProvider(provider) : provider
  const label = typeof provider === 'string' ? (config?.label ?? provider) : provider.label
  // Sans configuration, la teinte reste neutre : `provbadge--unknown`.
  const tint = config ? `provbadge--${config.id}` : 'provbadge--unknown'

  return (
    <span
      className={`provbadge provbadge--${size} ${tint}`}
      aria-label={showName ? undefined : label}
    >
      <span className="provbadge__dot" aria-hidden="true" />
      {showName && <span className="provbadge__name">{label}</span>}
    </span>
  )
}
