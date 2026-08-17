import { useI18n } from '@/i18n'

/**
 * Logo typographique de la barre supérieure.
 *
 * « ski » en graisse fine et atténuée, « track » en 800 encre, un point bleu en
 * exposant : le mot se lit en deux temps, comme il se prononce, et la marque
 * n'a plus besoin d'un pictogramme pour exister. `LogoIcon` reste disponible
 * dans Icons.tsx — il sert encore ailleurs.
 *
 * Le nom complet est porté par `aria-label` : trois éléments décoratifs mis
 * côte à côte s'annonceraient sinon lettre par lettre.
 */
export function BrandLogo(): JSX.Element {
  const { t } = useI18n()
  return (
    <span className="brand" role="img" aria-label={t('appName')}>
      <span className="brand__ski">ski</span>
      <span className="brand__track">track</span>
      <span className="brand__dot" />
    </span>
  )
}
