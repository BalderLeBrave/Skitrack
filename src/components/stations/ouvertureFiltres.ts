/**
 * L'ouverture de la fenêtre « Filtres » des stations, hors de l'écran qui la
 * porte : le bouton « Filtres » de l'accueil l'ouvre, puis mène à l'écran
 * Stations, où elle s'affiche déjà ouverte.
 *
 * Deux portes, au choix de l'appelant :
 * - `ouvrirFiltresStations()` puis `go("compare")` ;
 * - l'adresse `/comparer?filtres=1` (lien, signet).
 *
 * L'écran Stations lit le drapeau au montage et le remet à zéro en fermant la
 * fenêtre. Rien n'est persisté : un rechargement ne rouvre pas la fenêtre.
 */

import { create } from "zustand";

type OuvertureFiltres = {
  ouvert: boolean;
  ouvrir: () => void;
  fermer: () => void;
};

export const useOuvertureFiltresStations = create<OuvertureFiltres>()((set) => ({
  ouvert: false,
  ouvrir: () => set({ ouvert: true }),
  fermer: () => set({ ouvert: false }),
}));

/** Demande l'ouverture de la fenêtre « Filtres » des stations. */
export function ouvrirFiltresStations(): void {
  useOuvertureFiltresStations.getState().ouvrir();
}

/** Le paramètre d'adresse qui ouvre la fenêtre à l'arrivée sur `/comparer`. */
export const PARAM_FILTRES = "filtres";
