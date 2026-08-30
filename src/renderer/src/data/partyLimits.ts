/**
 * Bornes du groupe : voyageurs et chambres.
 *
 * Un seul endroit, parce qu'elles étaient écrites en dur dans deux composants
 * (`LodgingFilters`, `Onboarding`) avec les mêmes valeurs recopiées — la forme
 * exacte qui finit par diverger. Elles valaient 12 et 6 jusqu'au 2026-08-30 :
 * un groupe de quatorze ou un chalet de huit chambres, deux demandes
 * ordinaires en location de montagne, ne pouvaient pas s'exprimer, et le
 * bouton « + » cessait simplement de répondre sans rien dire.
 *
 * Ce ne sont pas des limites techniques — aucun calcul ne casse au-delà — mais
 * les bornes de ce que l'application prétend traiter sérieusement : au-delà de
 * vingt personnes, une recherche de location bascule dans le séjour de groupe,
 * que les sources interrogées ici ne couvrent pas.
 */
export const PARTY_LIMITS = {
  /** Voyageurs : au moins un, au plus vingt. */
  travelers: { min: 1, max: 20 },
  /** Chambres demandées : zéro vaut « studio accepté ». */
  rooms: { min: 0, max: 9 }
} as const
