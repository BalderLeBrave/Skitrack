/**
 * La vérification des mises à jour : une commande, pas une étiquette.
 *
 * L'entrée « Mise à jour » du menu Plus était un `<span>` sans clic, monté
 * seulement pendant que le menu était ouvert — donc une boucle de relevé qui
 * démarrait à l'ouverture d'un menu et s'arrêtait à sa fermeture, sans que
 * personne ne l'ait demandée ni ne puisse l'arrêter. Elle n'avait ni
 * progression, ni résultat, ni date.
 *
 * Ici : on la lance, elle avance, elle dit ce qu'elle a fait et quand elle a
 * fini, et on peut l'arrêter. Le magasin vit hors du menu, donc la vérification
 * survit à sa fermeture et à la navigation.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tickAutoSync } from "./autoSync.api";

export type EtatMaj = "repos" | "encours" | "fait" | "echec";

/** Pause entre deux tours, pour ne pas marteler les sources. */
const PAS_MS = 1_200;
/** Plafond de tours par vérification : elle se termine, elle ne tourne pas
 *  indéfiniment. */
const TOURS_MAX = 40;

type MajStore = {
  etat: EtatMaj;
  /** Relevés effectués pendant la vérification en cours. */
  faits: number;
  /** Le dernier élément relevé, pour que la progression dise quelque chose. */
  dernier: string | null;
  /** Reste-t-il des relevés périmés en file ? */
  reste: boolean;
  cause: string | null;
  /** Fin de la dernière vérification, en ISO. Persistée. */
  derniereA: string | null;
  lancer: () => Promise<void>;
  arreter: () => void;
};

let stop = false;

export const useMaj = create<MajStore>()(
  persist(
    (set, get) => ({
      etat: "repos",
      faits: 0,
      dernier: null,
      reste: false,
      cause: null,
      derniereA: null,
      arreter: () => {
        stop = true;
      },
      lancer: async () => {
        if (get().etat === "encours") return;
        stop = false;
        set({ etat: "encours", faits: 0, dernier: null, cause: null, reste: false });
        try {
          for (let tour = 0; tour < TOURS_MAX; tour += 1) {
            if (stop) break;
            const tick = await tickAutoSync({ data: {} });
            const releves = [...tick.forfaits, ...tick.skiinfo];
            if (releves.length) {
              set((s) => ({
                faits: s.faits + releves.length,
                dernier: releves[releves.length - 1] ?? s.dernier,
              }));
            }
            set({ reste: tick.remaining });
            if (tick.idle) break;
            await new Promise((r) => setTimeout(r, PAS_MS));
          }
          set({ etat: "fait", derniereA: new Date().toISOString() });
        } catch (e: unknown) {
          console.warn("[maj] vérification en échec", e);
          set({
            etat: "echec",
            cause: e instanceof Error ? e.message : String(e),
            derniereA: new Date().toISOString(),
          });
        } finally {
          stop = false;
        }
      },
    }),
    { name: "skitrack-maj", partialize: (s) => ({ derniereA: s.derniereA }) },
  ),
);
