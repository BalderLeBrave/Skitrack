/**
 * Sélecteur de nombre — saisissable au clavier, borné par l'appelant.
 *
 * ## Le défaut qu'il corrige
 *
 * Les compteurs « Voyageurs » et « Chambres min » existaient en double, dans
 * `LodgingFilters` et dans `Onboarding`, chacun avec ses bornes écrites en
 * dur : `Math.min(12, …)` pour les voyageurs, `Math.min(6, …)` pour les
 * chambres. Un groupe de quatorze personnes, un chalet de huit chambres —
 * deux demandes ordinaires en location de montagne — étaient donc
 * **impossibles à exprimer**, sans qu'aucun message ne dise pourquoi le bouton
 * cessait de répondre. Deux plafonds dans deux fichiers, c'est aussi la
 * garantie qu'ils divergent le jour où l'un des deux bouge.
 *
 * ## Ce qu'il fait
 *
 * Les bornes viennent de l'appelant et ne sont plus écrites dans le rendu :
 * `PARTY_LIMITS` (`data/partyLimits.ts`) les tient en un seul endroit, pour les
 * deux écrans. Elles valent aujourd'hui vingt voyageurs et neuf chambres.
 *
 * Le champ central est un `input` : on y tape `18` plutôt que de cliquer
 * dix-huit fois, ce qui est la vraie raison pour laquelle un plafond de 12
 * passait inaperçu — personne n'allait jusque-là au clic.
 *
 * Le plancher varie selon ce qu'on compte : un séjour a au moins un voyageur,
 * une recherche peut demander zéro chambre (c'est « studio accepté »).
 *
 * La saisie intermédiaire vide est conservée telle quelle le temps de la
 * frappe : forcer la valeur à chaque touche empêchait d'effacer « 8 » pour
 * écrire « 12 » — le champ repassait à 8 dès la première suppression.
 */

import { useEffect, useState } from 'react'

interface Props {
  value: number
  onChange: (n: number) => void
  /** Plancher. Un voyageur au minimum ; zéro chambre est une demande valide. */
  min: number
  /** Plafond. Vient de `PARTY_LIMITS` — jamais écrit dans le rendu. */
  max: number
  /** Libellé accessible du champ, déjà traduit. */
  label: string
  /** Rendu de la valeur quand elle vaut le plancher et mérite un mot. */
  minLabel?: string
}

export function CountStepper({ value, onChange, min, max, label, minLabel }: Props): JSX.Element {
  // Miroir local de la frappe. `null` = le champ est vide pendant l'édition ;
  // la valeur du parent ne bouge pas tant que rien de lisible n'est écrit.
  const [brouillon, setBrouillon] = useState<string | null>(null)

  // Une modification venue d'ailleurs — le pas à pas, un autre écran — doit
  // reprendre la main sur un brouillon abandonné.
  useEffect(() => {
    setBrouillon(null)
  }, [value])

  const valider = (brut: string): void => {
    const n = Number.parseInt(brut, 10)
    // La saisie est ramenée entre les bornes plutôt que refusée : taper « 50 »
    // pose 20 et le montre, là où un rejet silencieux laisserait croire que la
    // frappe n'a pas été prise.
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
    setBrouillon(null)
  }

  const affiche =
    brouillon !== null
      ? brouillon
      : minLabel != null && value === min
        ? minLabel
        : String(value)

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        aria-label={`${label} −`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <input
        className="stepper__value stepper__input"
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={affiche}
        onFocus={() => setBrouillon(String(value))}
        onChange={(e) => setBrouillon(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={(e) => valider(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      <button
        type="button"
        className="stepper__btn"
        aria-label={`${label} +`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  )
}
