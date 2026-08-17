/**
 * Vignette de résultat — le gabarit commun des deux écrans de résultats.
 *
 * ## Ce qu'elle est, et ce qu'elle n'est pas
 *
 * Un composant **présentationnel pur** : aucune lecture de `useApp`, aucun
 * accès aux données, aucun effet. Tout entre par les props, et c'est ce qui la
 * rend vérifiable seule (`ResultCard.test.tsx`, rendu par `react-dom/server`)
 * et réutilisable par deux écrans qui n'affichent pas les mêmes faits :
 *
 *     Meilleures offres   station + massif · altitude du domaine · temps de route
 *     Logements           type et capacité · distance aux pistes · dénivelé
 *
 * D'où `place`, `factLeft` et `factRight` plutôt que des champs nommés
 * « massif » ou « altitude » : la carte tient une **forme**, les écrans
 * décident du sens.
 *
 * ## Hauteur stable
 *
 * Le bloc texte a une hauteur minimale fixe. Sans elle, une carte à titre court
 * et une carte à titre long ne s'alignent pas, et la grille tressaute quand les
 * squelettes cèdent la place aux vraies cartes. Le squelette rend exactement le
 * même gabarit — même ratio de média, mêmes quatre lignes — pour que le passage
 * de l'un à l'autre ne déplace rien.
 *
 * ## Cliquable en entier
 *
 * Pas un `<a>` : la carte accueille des boutons (comparer, suivre, ouvrir) et
 * un lien ne peut pas en contenir. C'est donc un conteneur `role="link"`,
 * focusable, qui répond à Entrée et à Espace comme un lien natif, avec un
 * `aria-label` explicite — le titre seul ne dit ni le prix ni le lieu. Les
 * boutons enfants arrêtent la propagation de leur côté.
 */

import { useState, type KeyboardEvent, type ReactNode } from 'react'

/** `wide` (4/3) par défaut ; `square` pour une grille plus dense. */
export type ResultRatio = 'square' | 'wide'

export interface ResultPrice {
  /** Montant déjà formaté par l'appelant, qui seul connaît la langue. */
  amount: string
  /** « la semaine », « /nuit », « tout compris »… */
  unit: string
}

export interface ResultCardProps {
  /** Ligne 1 : nom du logement ou de la résidence. Tronqué sur une ligne. */
  title: string
  /** Ligne 2 : station et massif, ou type de bien. */
  place?: string
  /** Ligne 3, à gauche : altitude skiable, distance aux pistes… */
  factLeft?: string
  /** Ligne 3, à droite : temps de route, dénivelé… */
  factRight?: string
  /** Ligne 4. `null` quand la source ne publie pas de prix. */
  price?: ResultPrice | null
  image?: string | null
  /** Texte affiché à la place de l'image quand elle manque ou ne charge pas. */
  placeholder?: string
  ratio?: ResultRatio
  /** Pastilles posées sur le média (source, ski aux pieds, note…). */
  badges?: ReactNode
  /** Contenu propre à l'écran, sous le bloc texte. */
  children?: ReactNode
  /** Obligatoire : ce que lit une synthèse vocale à la place de la carte. */
  ariaLabel: string
  onOpen?: () => void
  selected?: boolean
  /** Média grisé : offre périmée ou introuvable au dernier relevé. */
  dimmed?: boolean
  /** Squelette au même gabarit, sans saut de mise en page. */
  loading?: boolean
}

/**
 * Repli quand l'annonce n'a pas de photo exploitable.
 *
 * Une montagne au trait, et non l'icône « image cassée » d'un navigateur : sur
 * une mosaïque où une carte sur trois n'a pas de photo, le second motif fait
 * lire un défaut d'affichage là où il n'y a qu'une source avare en images.
 */
function NoImage({ label }: { label: string }): JSX.Element {
  return (
    <span className="resultcard__noimg">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <path
          d="M3 26.5l8.5-13 5 7 3.5-5 11 11z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M8.6 18.2l3 2.4 2.6-2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  )
}

/**
 * Squelette de chargement.
 *
 * Exporté : une grille qui attend ses résultats en affiche plusieurs, et
 * `ResultGrid` le fait pour elle.
 */
export function ResultCardSkeleton({ ratio = 'wide' }: { ratio?: ResultRatio }): JSX.Element {
  return (
    <article className="resultcard resultcard--skeleton" aria-hidden="true">
      <div className={`resultcard__media resultcard__media--${ratio}`} />
      <div className="resultcard__body">
        <span className="resultcard__bar resultcard__bar--title" />
        <span className="resultcard__bar resultcard__bar--place" />
        <span className="resultcard__bar resultcard__bar--facts" />
        <span className="resultcard__bar resultcard__bar--price" />
      </div>
    </article>
  )
}

export function ResultCard({
  title,
  place,
  factLeft,
  factRight,
  price,
  image,
  placeholder = 'sans photo',
  ratio = 'wide',
  badges,
  children,
  ariaLabel,
  onOpen,
  selected = false,
  dimmed = false,
  loading = false
}: ResultCardProps): JSX.Element {
  // Une URL peut répondre 404 : l'état est local à la carte, et il se réarme
  // tout seul quand la prop change de valeur (clé React côté appelant).
  const [broken, setBroken] = useState(false)
  if (loading) return <ResultCardSkeleton ratio={ratio} />

  const showImage = Boolean(image) && !broken

  const activate = (): void => onOpen?.()
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    // Espace ferait défiler la page sous la carte ; Entrée validerait un
    // formulaire parent. Un lien natif ne fait ni l'un ni l'autre.
    event.preventDefault()
    activate()
  }

  return (
    <article
      className={`resultcard${selected ? ' resultcard--on' : ''}`}
      role={onOpen ? 'link' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={ariaLabel}
      aria-current={selected ? 'true' : undefined}
      onClick={onOpen ? activate : undefined}
      onKeyDown={onOpen ? onKeyDown : undefined}
    >
      <div
        className={`resultcard__media resultcard__media--${ratio}${dimmed ? ' resultcard__media--dim' : ''}`}
      >
        {showImage ? (
          <img
            className="resultcard__img"
            src={image as string}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <NoImage label={placeholder} />
        )}
        {badges}
      </div>

      <div className="resultcard__body">
        <h3 className="resultcard__title" title={title}>
          {title}
        </h3>
        <p className="resultcard__place">{place ?? ' '}</p>
        <p className="resultcard__facts">
          <span className="resultcard__fact">{factLeft ?? ' '}</span>
          <span className="resultcard__fact resultcard__fact--right">{factRight ?? ' '}</span>
        </p>
        <p className="resultcard__price">
          {price ? (
            <>
              <strong className="resultcard__amount">{price.amount}</strong>{' '}
              <span className="resultcard__unit">{price.unit}</span>
            </>
          ) : (
            ' '
          )}
        </p>
      </div>

      {children}
    </article>
  )
}
