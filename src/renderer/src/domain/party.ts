/**
 * Reconstituer un groupe à partir d'effectifs.
 *
 * Un séjour enregistré ou partagé ne porte que des **nombres** : tant
 * d'adultes, tant d'enfants. Le rouvrir doit pourtant agir sur `state.people`,
 * et non sur les seuls `travelers` / `children` — ces deux-là ne servent qu'en
 * repli, dans une branche morte : `people` n'est jamais vide (il vaut au
 * minimum le voyageur par défaut), donc `selectors` lit toujours les âges de
 * `people` pour compter forfaits, cours et répartition. Poser `travelers: 6`
 * sans toucher à `people` affiche « 6 voyageurs » en en-tête et facture les
 * forfaits d'une seule personne.
 *
 * ## Ce qui est repris et ce qui ne l'est pas
 *
 * Les personnes déjà saisies sont **conservées** dans l'ordre — noms, âges,
 * foyer. Seul l'effectif est ajusté. On ne remplace pas un groupe renseigné à
 * la main par des inconnus sous prétexte qu'un séjour reçu annonce les mêmes
 * nombres.
 *
 * Les personnes ajoutées portent l'âge par défaut de leur classe, le même que
 * celui du voyageur initial de l'application. Ce n'est pas une mesure déguisée :
 * l'âge exact n'a jamais traversé le partage, et l'écran Voyageurs reste
 * l'endroit où on le corrige. Le nombre, lui, est la donnée transmise, et c'est
 * lui qui est restitué fidèlement.
 */

import type { Person } from './costs'

/** Seuil enfant / adulte, aligné sur `setPeople` dans `state/appState`. */
export const CHILD_AGE_LIMIT = 13

/** Âge posé par défaut sur une personne ajoutée — jamais une mesure. */
export const DEFAULT_ADULT_AGE = 35
export const DEFAULT_CHILD_AGE = 8

export function isChild(person: Person): boolean {
  return person.age < CHILD_AGE_LIMIT
}

/**
 * Ajuste une liste de personnes pour qu'elle compte `adults` adultes et
 * `children` enfants.
 *
 * Les surnuméraires sont retirés par la fin — on enlève ce qui a été ajouté en
 * dernier, pas la première personne saisie.
 */
export function peopleForParty(existing: readonly Person[], adults: number, children: number): Person[] {
  const wantedAdults = Math.max(0, Math.round(adults))
  const wantedChildren = Math.max(0, Math.round(children))

  const currentAdults = existing.filter((p) => !isChild(p))
  const currentChildren = existing.filter(isChild)

  const keptAdults = currentAdults.slice(0, wantedAdults)
  const keptChildren = currentChildren.slice(0, wantedChildren)

  // Les identifiants doivent rester uniques : on repart du plus grand déjà
  // employé plutôt que de la longueur, qui se répéterait après un retrait.
  let nextId = existing.reduce((max, p) => Math.max(max, p.id), 0)
  const homeOf = existing[0]?.home ?? 0

  const addedAdults: Person[] = []
  for (let i = keptAdults.length; i < wantedAdults; i++) {
    nextId += 1
    addedAdults.push({ id: nextId, first: `Voyageur ${nextId}`, last: '', age: DEFAULT_ADULT_AGE, home: homeOf })
  }

  const addedChildren: Person[] = []
  for (let i = keptChildren.length; i < wantedChildren; i++) {
    nextId += 1
    addedChildren.push({ id: nextId, first: `Enfant ${nextId}`, last: '', age: DEFAULT_CHILD_AGE, home: homeOf })
  }

  const out = [...keptAdults, ...addedAdults, ...keptChildren, ...addedChildren]
  // Un groupe vide n'existe pas : un séjour sans personne ne se chiffre pas.
  // `parseSavedTrip` impose déjà au moins un adulte ; cette garde couvre les
  // appels internes.
  if (out.length === 0) {
    return [{ id: 1, first: 'Voyageur 1', last: '', age: DEFAULT_ADULT_AGE, home: homeOf }]
  }
  return out
}
