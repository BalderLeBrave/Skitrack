/**
 * Carte brute d’une SERP. Commune aux extracteurs, sans logique de source.
 * Chaque extracteur vit dans son fichier : un sélecteur Booking ne peut pas
 * glisser dans Gîtes.
 */

export interface RawCard {
  sourceId: string
  title: string
  url: string
  priceText?: string
  ratingText?: string
  image?: string
  /**
   * Total séjour déjà chiffré (getResultList). Si présent, mapCards
   * l'utilise tel quel — parsePrice arrondit à l'euro et perdrait 3363,28.
   */
  stayAmount?: number
  /**
   * Position publiée par la page de résultats, quand elle la porte.
   *
   * Booking l'embarque dans son magasin Apollo (voir `extractBookingCards`) ;
   * la lire n'ajoute aucune requête. Ajouté le 2026-08-29 sur ordre d'Adrien :
   * les annonces Booking arrivaient sans position et la carte les dispersait
   * autour de la station.
   */
  lat?: number
  lon?: number
  /**
   * Ce que la page de résultats publie sur la taille du bien.
   *
   * Booking décrit l'unité recommandée en toutes lettres sous la carte —
   * « Appartement entier • 3 chambres • 2 salles de bains • 1 cuisine • 49 m² »,
   * « 6 lits (4 lits simples, 2 grands lits doubles) ». L'extracteur jetait
   * cette phrase, et les 203 annonces Booking du profil réel ressortaient sans
   * chambres ni surface : l'écran répondait « le relevé n'a rapporté ni
   * capacité ni nombre de pièces », alors que la page l'affichait.
   *
   * Rien n'est déduit ici : chaque champ vient d'un nombre écrit sur la page.
   * Les lits ne sont **pas** traduits en capacité — « 6 lits » ne dit pas
   * combien de personnes le bien accepte, et l'inventer serait pire que le
   * silence.
   */
  bedrooms?: number
  beds?: number
  areaSqm?: number
  /**
   * Capacité en **personnes**, telle que la page l'écrit.
   *
   * Le champ manquait au type, et c'est tout ce qui manquait : `Accommodation`
   * le porte (`providers/types.ts`), `baseAccommodation` le relaie
   * (`webscrape/shared.ts`) et `runProviderSearch` le lit (`pers`). Personne
   * ne l'écrivait jamais, si bien que toute annonce relevée arrivait sans
   * capacité et tombait en « non annoncé » dans `partyVerdict`.
   *
   * Elle n'est **jamais** déduite des lits : « 6 lits » ne dit pas combien de
   * personnes le bien accepte, et six lits simples ne valent pas six couchages
   * dans une chambre double.
   */
  guests?: number
  /** Libellé tuile Gîtes (`.g2f-accommodationTile-text-type`). */
  propertyType?: string
  pageIndex?: number
  searchRank?: number
  /** Total annoncé par la SERP (« 87 établissements »). Lu sur la 1re carte. */
  advertisedTotal?: number
}
