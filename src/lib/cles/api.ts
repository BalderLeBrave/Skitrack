import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { EtatCle } from "./registre.ts";

/** L'état des clés. Aucune valeur secrète ne franchit cette frontière. */
export const listerCles = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async (): Promise<EtatCle[]> => {
    const { etatCles } = await import("./store.server");
    return etatCles();
  });

export const poserCle = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1), valeur: z.string().max(4096) }))
  .handler(async ({ data }): Promise<EtatCle[]> => {
    const { poserCle: poser } = await import("./store.server");
    return poser(data.id, data.valeur);
  });

export const retirerCle = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<EtatCle[]> => {
    const { retirerCle: retirer } = await import("./store.server");
    return retirer(data.id);
  });

export type Essai = { ok: boolean; message: string };

/**
 * Un essai réel, pas une vérification de forme.
 *
 * Une clé qui « a l'air bonne » ne prouve rien : on appelle le service et on
 * rapporte ce qu'il répond. La clé ne sort pas du serveur pour autant.
 */
export const essayerCle = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<Essai> => {
    if (data.id !== "meteofrance") return { ok: false, message: "Cette clé ne s'essaie pas." };
    const { valeurCle } = await import("./store.server");
    if (!valeurCle("meteofrance")) return { ok: false, message: "Aucune clé posée." };
    const { fetchBra } = await import("../bra/fetch.server");
    // Massif 10 (Vanoise), sans le cache : c'est la clé qu'on teste.
    const bra = await fetchBra(10, true);
    if (bra.ok) {
      return {
        ok: true,
        message: bra.risk != null
          ? `Météo-France répond : risque ${bra.risk} en Vanoise.`
          : "Météo-France répond. Aucun risque publié aujourd'hui sur ce massif.",
      };
    }
    return { ok: false, message: bra.error ?? "Météo-France n'a pas répondu." };
  });
