/**
 * Le magasin des favoris (`modele.ts`), gardé dans le navigateur comme les
 * autres préférences (`skitrack-favoris`). Les écrans qui le lisent attendent
 * d'être montés : le rendu serveur ne le connaît pas.
 */

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Listing } from "../listings.ts";
import {
  creerDossier,
  enregistrer,
  ETAT_VIDE,
  etatLu,
  rafraichir,
  renommerDossier,
  retirer,
  supprimerDossier,
  type EtatFavoris,
  type SejourFavori,
} from "./modele.ts";

function nouvelId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const maintenant = () => new Date().toISOString();

type Actions = {
  /** Crée le dossier et rend son identifiant, ou `null` pour un nom vide. */
  creer: (nom: string) => string | null;
  renommer: (id: string, nom: string) => void;
  supprimer: (id: string) => void;
  enregistrer: (annonce: Listing, dossierId: string, sejour: SejourFavori | null) => void;
  /** Retire l'annonce d'un dossier, ou de tous (`dossierId` absent). */
  retirer: (annonceId: string, dossierId?: string) => void;
  /** `sejour` : celui du relevé, dont les prix ne valent que pour les favoris du même séjour. */
  rafraichir: (annonces: readonly Listing[], sejour: SejourFavori | null) => void;
};

export const useFavoris = create<EtatFavoris & Actions>()(
  persist(
    (set, get) => ({
      ...ETAT_VIDE,
      creer: (nom) => {
        const id = nouvelId();
        const avant = get();
        const apres = creerDossier(avant, id, nom, maintenant());
        if (apres === avant) return null;
        set(apres);
        return id;
      },
      renommer: (id, nom) => set((s) => renommerDossier(s, id, nom)),
      supprimer: (id) => set((s) => supprimerDossier(s, id)),
      enregistrer: (annonce, dossierId, sejour) => set((s) => enregistrer(s, annonce, dossierId, sejour, maintenant())),
      retirer: (annonceId, dossierId) => set((s) => retirer(s, annonceId, dossierId ?? null, maintenant())),
      rafraichir: (annonces, sejour) =>
        set((s) => {
          const r = rafraichir(s, annonces, sejour);
          return r === s ? s : r;
        }),
    }),
    {
      name: "skitrack-favoris",
      version: 1,
      partialize: (s) => ({ dossiers: s.dossiers, favoris: s.favoris }),
      merge: (garde, courant) => ({ ...courant, ...etatLu(garde) }),
    },
  ),
);

/**
 * Les annonces enregistrées, en un ensemble stable : il ne change d'identité
 * que si la liste change (la clé est une chaîne), ce qui garde les `useMemo`
 * des cartes au repos.
 */
export function useIdsFavoris(): ReadonlySet<string> {
  const cle = useFavoris((s) => [...new Set(s.favoris.map((f) => f.annonceId))].sort().join("\n"));
  return useMemo(() => new Set(cle ? cle.split("\n") : []), [cle]);
}

/** L'annonce est-elle enregistrée dans au moins un dossier ? */
export function useEstFavori(annonceId: string): boolean {
  return useFavoris((s) => s.favoris.some((f) => f.annonceId === annonceId));
}
