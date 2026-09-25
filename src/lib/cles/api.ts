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

/**
 * Ce qu'une clé change doit changer tout de suite.
 *
 * Le relevé Météo-France garde ses échecs cinq minutes. Sans cet oubli, une
 * clé fraîchement saisie laissait les fiches station sur « Bulletin non
 * obtenu » le temps du cache, et l'écran des clés paraissait sans effet.
 */
async function oublierCeQueLaCleChange(id: string): Promise<void> {
  if (id !== "meteofrance") return;
  const { oublierCacheBra } = await import("../bra/fetch.server");
  oublierCacheBra();
}

export const poserCle = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1), valeur: z.string().max(4096) }))
  .handler(async ({ data }): Promise<EtatCle[]> => {
    const { poserCle: poser } = await import("./store.server");
    const etats = poser(data.id, data.valeur);
    await oublierCeQueLaCleChange(data.id);
    return etats;
  });

export const retirerCle = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<EtatCle[]> => {
    const { retirerCle: retirer } = await import("./store.server");
    const etats = retirer(data.id);
    await oublierCeQueLaCleChange(data.id);
    return etats;
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
    if (data.id !== "meteofrance") return { ok: false, message: "Cette clé ne peut pas être essayée." };
    const { valeurCle } = await import("./store.server");
    if (!valeurCle("meteofrance")) return { ok: false, message: "Aucune clé enregistrée." };
    const { fetchBra } = await import("../bra/fetch.server");
    // Massif 10 (Vanoise), sans le cache : c'est la clé qu'on teste.
    const bra = await fetchBra(10, true);
    if (bra.ok) {
      return {
        ok: true,
        message: bra.risk != null
          ? `Météo-France répond : risque ${bra.risk} en Vanoise.`
          : "Météo-France répond. Aucun risque publié aujourd’hui sur ce massif.",
      };
    }
    return { ok: false, message: bra.error ?? "Météo-France n’a pas répondu." };
  });
