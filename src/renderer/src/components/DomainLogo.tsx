import { useEffect, useState } from 'react'
import { initialsOf, logoTint } from '@/domain/format'

/**
 * Logo d'un domaine skiable.
 *
 * Les logos ne sont pas redistribuables et aucun référentiel libre n'en publie :
 * Wikidata n'en porte que pour 25 des 277 domaines importés. En revanche, 74 %
 * ont l'URL de leur site officiel en base, et tout site publie son icône aux
 * emplacements conventionnels — ceux que réclame n'importe quel navigateur.
 *
 * On les demande donc dans l'ordre de qualité décroissante, en laissant le
 * navigateur faire le travail : une balise `img` par tentative, l'échec de
 * chargement fait passer à la suivante. Aucune page n'est parcourue, aucune
 * requête n'est faite en dehors de ces URL bien connues, et le repli final —
 * les initiales sur une teinte dérivée du nom — reste lisible pour les 26 %
 * de domaines sans site connu.
 */

/** Emplacements conventionnels d'icône, du plus défini au moins défini. */
const ICON_PATHS = ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/favicon.ico']

/**
 * L'icône qui a fini par charger, par site, pour la durée de la session.
 *
 * Sans cette mémoire, le même domaine ne montrait pas le même logo deux fois :
 * la chaîne de repli repart de zéro à chaque montage, et laquelle des trois URL
 * répond dépend du cache HTTP et du réseau à cet instant. On voyait
 * l'apple-touch-icon en ouvrant la fiche, la favicon en la rouvrant, les
 * initiales hors ligne — trois logos pour une station.
 *
 * La mémoire est volontairement **hors des préférences** : `state.logos` est ce
 * que l'utilisateur a saisi, et y écrire une URL devinée la ferait passer pour
 * une saisie, avec un bouton « effacer » qui ne l'effacerait pas. Elle vit donc
 * ici, le temps de la session, et se reconstruit au lancement suivant — la
 * rendre durable demande un champ de préférence de plus, ce qui touche au
 * schéma et se décide, pas se glisse.
 */
const RESOLU = new Map<string, string>()

function candidatesFor(logo: string | null, website: string | null): string[] {
  // Un logo fourni à la main passe avant tout : c'est le seul moyen d'avoir le
  // vrai logo d'une station qui n'en publie pas à un emplacement conventionnel.
  const out = logo ? [logo] : []
  if (!website) return out
  try {
    const { origin } = new URL(website)
    return [...out, ...ICON_PATHS.map((path) => `${origin}${path}`)]
  } catch {
    return out
  }
}

interface Props {
  name: string
  website: string | null
  /** URL saisie par l'utilisateur ou déclarée dans le référentiel. */
  logo?: string | null
  dark: boolean
}

export function DomainLogo({ name, website, logo = null, dark }: Props): JSX.Element {
  const memoire = website ?? logo ?? name
  const candidates = candidatesFor(logo, website)
  // Une icône déjà résolue reprend sa place en tête : on ne rejoue pas la
  // chaîne, et le logo est celui de la fois précédente.
  const gagnante = RESOLU.get(memoire)
  const chaine = gagnante ? [gagnante, ...candidates.filter((c) => c !== gagnante)] : candidates
  const [attempt, setAttempt] = useState(0)

  // Changer de domaine remet la chaîne de repli à zéro : sans cela, une
  // vignette réutilisée par React garderait l'échec de la précédente.
  useEffect(() => {
    setAttempt(0)
  }, [website, logo])

  const src = chaine[attempt]

  return (
    <span
      className="domcard__logo"
      style={{ background: logoTint(name, dark) }}
      title={src ? `Logo de ${name}, depuis son site officiel` : `${name} — logo non publié, initiales en secours`}
    >
      {src ? (
        <img
          className="domcard__logo-img"
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => {
            if (src) RESOLU.set(memoire, src)
          }}
          onError={() => setAttempt((n) => n + 1)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
