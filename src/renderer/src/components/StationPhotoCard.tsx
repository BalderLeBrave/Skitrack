/**
 * L'encadré photo d'une station, dans sa fiche.
 *
 * La photo vient de l'import Commons (`assets/img/station-<slug>.jpg`), et la
 * légende dit toujours ce qu'on regarde : la station elle-même, ou — à
 * défaut — le massif, annoncé comme tel. Une photo de Val Thorens présentée
 * sous le nom « La Daille » serait une légende fausse, pas un repli.
 *
 * Le crédit n'est pas décoratif : CC-BY et CC-BY-SA exigent l'auteur et la
 * licence **à côté de l'image**. C'est ici, au point d'affichage, que cette
 * obligation se paie — pas seulement dans l'encadré de revue des Réglages.
 *
 * Sans photo de station ni photo de massif, le composant ne rend rien :
 * pas de silhouette grise, pas d'image d'ambiance prise ailleurs.
 */

import { massifPhoto, stationPhoto } from '@/components/photos'
import { creditPhoto, legendePhoto } from '@/data/stationPhotos'
import { useI18n } from '@/i18n'

interface Props {
  name: string
  slug: string
  massif: string
}

export function StationPhotoCard({ name, slug, massif }: Props): JSX.Element | null {
  const { t } = useI18n()
  // La photo de la station ne s'affiche qu'avec son crédit. C'est la règle de
  // l'en-tête appliquée pour de bon : une image CC-BY sans auteur ni licence
  // n'est pas une image qu'on peut montrer, et « photo sans crédit
  // enregistré » n'était pas un crédit — c'était l'aveu qu'on l'enfreignait.
  const credit = creditPhoto(name)
  const propre = credit ? stationPhoto(slug) : null
  const src = propre ?? massifPhoto(massif)
  if (!src) return null

  // La description est celle du photographe, jamais une phrase produite ici :
  // Commons la publie, l'import la conserve, la fiche la montre. À défaut, le
  // titre du fichier — un texte d'auteur lui aussi.
  const description = propre && credit ? legendePhoto(credit) : null
  const alt = propre
    ? description ?? t('photos_alt').replace('{d}', name)
    : t('home_dom_photo_massif').replace('{m}', massif).replace('{d}', name)

  return (
    <figure className="stphoto domsheet__full">
      <img className="stphoto__img" src={src} alt={alt} loading="lazy" />
      <figcaption className="stphoto__legende">
        {propre && credit ? (
          <>
            {description && <span className="stphoto__desc">{description}</span>}
            <span className="stphoto__credit">
              <span className="crn-legende">
                {credit.licence}
                {credit.auteur ? ` · ${credit.auteur}` : ''}
              </span>
              <a
                className="stphoto__lien crn-legende"
                href={credit.page}
                target="_blank"
                rel="noreferrer"
              >
                {t('photos_source')}
              </a>
            </span>
          </>
        ) : (
          // Le repli se nomme : c'est la photo du massif, et la légende le dit.
          <span className="crn-legende">{alt}</span>
        )}
      </figcaption>
    </figure>
  )
}
