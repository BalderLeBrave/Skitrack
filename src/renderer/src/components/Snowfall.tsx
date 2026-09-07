import { useMemo } from 'react'

/**
 * Neige animée en surimpression.
 *
 * Décor, et rien d'autre : la couche est `position: fixed`, `pointer-events:
 * none`, et ne porte aucun texte — elle est masquée aux lecteurs d'écran. Elle
 * se place au-dessus du contenu mais sous les popovers, les modales et les
 * tiroirs (voir `.snowfall` dans styles.css) : un flocon qui passe devant un
 * champ de saisie donne l'impression d'un défaut d'affichage.
 *
 * Deux spans par flocon plutôt qu'un : l'extérieur tombe, l'intérieur oscille
 * latéralement. Un seul élément ne peut pas porter deux `transform`
 * indépendants, et une chute strictement rectiligne ne ressemble pas à de la
 * neige. Les deux animations ne bougent que `transform` — jamais un `filter:
 * blur`, qui ferait repeindre la scène à chaque image.
 *
 * Les caractéristiques de chaque flocon sont tirées une seule fois (`useMemo`
 * sans dépendance) : `Shell` se rend à chaque changement d'état, et retirer ce
 * verrou relancerait toutes les animations au moindre clic.
 */

const FLAKE_COUNT = 36

type Flake = {
  /** Position horizontale de départ, en pourcentage de la largeur. */
  left: number
  size: number
  /** Durée de la chute, en secondes. */
  fall: number
  /** Durée d'un aller-retour latéral, en secondes. */
  sway: number
  /** Amplitude de la dérive latérale, en pixels. */
  drift: number
  delay: number
  opacity: number
}

function makeFlakes(count: number): Flake[] {
  const out: Flake[] = []
  for (let i = 0; i < count; i++) {
    const size = 2 + Math.random() * 4
    out.push({
      left: Math.random() * 100,
      size,
      fall: 9 + Math.random() * 13,
      sway: 3 + Math.random() * 4,
      drift: 12 + Math.random() * 46,
      // Les délais négatifs répartissent les flocons sur toute la hauteur dès
      // la première image : sans eux, l'écran s'ouvre vide puis se remplit par
      // le haut pendant une quinzaine de secondes.
      delay: -Math.random() * 20,
      // Les gros flocons passent devant, donc plus opaques : c'est ce qui donne
      // une profondeur sans avoir à flouter quoi que ce soit.
      opacity: 0.35 + (size / 6) * 0.4
    })
  }
  return out
}

export function Snowfall(): JSX.Element {
  const flakes = useMemo(() => makeFlakes(FLAKE_COUNT), [])
  return (
    <div className="snowfall" aria-hidden="true">
      {flakes.map((f, i) => (
        <span
          key={i}
          className="snowfall__fall"
          style={{
            left: `${f.left}%`,
            animationDuration: `${f.fall}s`,
            animationDelay: `${f.delay}s`
          }}
        >
          <span
            className="snowfall__dot"
            style={{
              width: f.size,
              height: f.size,
              opacity: f.opacity,
              animationDuration: `${f.sway}s`,
              animationDelay: `${f.delay}s`,
              ['--snow-drift' as string]: `${f.drift}px`
            }}
          />
        </span>
      ))}
    </div>
  )
}
