import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Listing } from "./listings";
import type { LiveSearchResult } from "./scrape/types";

const Input = z.object({
  stationId: z.string().min(1),
  stationName: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(30),
  bedrooms: z.number().int().min(0).max(20),
  part: z.enum(["airbnb", "gites", "cozy", "browser", "all"]).optional(),
});

export const searchStay = createServerFn({ method: "POST" })
  .validator(Input)
  .handler(async ({ data }): Promise<LiveSearchResult> => {
    const { runLiveSearch } = await import("./scrape/run.server");
    const res = await runLiveSearch(data, data.part ?? "all");
    return { ...res, listings: res.listings.map((l) => dater(l, data.checkIn, data.checkOut)) };
  });

/**
 * Tamponne les dates du relevé sur chaque annonce rendue.
 *
 * Une recherche en direct interroge les plateformes **pour ces dates-là** :
 * c'est l'objet même de la requête. Les prix qui en reviennent sont donc datés
 * par construction, mais les collecteurs ne remplissent pas `pricedCheckIn` /
 * `pricedCheckOut`, et `stay/availability.ts` concluait « prix relevé pour
 * d'autres dates » au-dessus d'une preuve portant les bonnes dates. Le tampon
 * est posé ici, dans l'enveloppe qui connaît la demande, et non dans les
 * collecteurs, qu'on ne touche pas.
 *
 * Une annonce sans prix n'est pas datée : il n'y a rien à dater. Elle reste
 * « listée sans prix à ces dates », ce qui est exact — c'est ainsi qu'Airbnb
 * signale qu'il ne peut pas vendre.
 */
function dater(l: Listing, checkIn: string, checkOut: string): Listing {
  if (!(l.total > 0)) return l;
  // Quand une source ne rend rien en direct, les collecteurs replient sur le
  // relevé figé et l'écrivent dans `proven`. Ces prix portent bien les dates
  // demandées, mais ils n'ont pas été mesurés à l'instant : leur tamponner
  // `scannedAt` à maintenant les ferait passer pour frais, et la péremption de
  // six heures ne les rattraperait jamais. Les dates, oui ; l'heure, non.
  const repli = /repli/i.test(l.proven);
  return {
    ...l,
    pricedCheckIn: l.pricedCheckIn ?? checkIn,
    pricedCheckOut: l.pricedCheckOut ?? checkOut,
    scannedAt: l.scannedAt ?? (repli ? null : Date.now()),
  };
}
