/**
 * La complétion des relevés de l'écran Prix, une tranche à la fois.
 *
 * Le navigateur (`releve.ts`) appelle `completerProfond` en boucle pour une
 * station, entre ses cinq parts et le calcul de la médiane : d'abord la
 * mémoire des fiches (aucune requête), puis des tranches de 45 s au plus
 * (pages de fiche hors Airbnb, fiches Airbnb). Le travail est dans
 * `completion.server.ts` ; ce module n'en est que la porte, et n'importe le
 * serveur qu'à l'appel, comme `searchStay.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RenduTranche } from "./completion.server";

const SOURCES = ["Airbnb", "Gîtes de France", "Booking", "Abritel", "Centrale", "GreenGo"] as const;

const nombre = z.number().finite().nullable();

const Candidate = z.object({
  id: z.string().min(1).max(1000),
  cle: z.string().max(2000).nullable(),
  source: z.enum(SOURCES),
  title: z.string().max(2000),
  url: z.string().max(4000).nullable(),
  platformId: z.string().max(1000).nullable(),
  lat: nombre,
  lon: nombre,
  guests: nombre,
  bedrooms: nombre,
  rooms: nombre,
  beds: nombre,
  total: z.number().finite(),
  currency: z.string().max(8),
  proven: z.string().max(4000),
  locality: z.string().max(400).nullable(),
});

const Connue = z.object({
  cle: z.string().min(1).max(2000),
  guests: z.number().finite(),
  bedrooms: nombre,
  rooms: nombre,
  lat: z.number().finite(),
  lon: z.number().finite(),
});

const Input = z.object({
  mode: z.enum(["memoire", "tranche"]),
  stationId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  voyageurs: z.number().int().min(1).max(30),
  candidates: z.array(Candidate).max(20_000),
  connues: z.array(Connue).max(50_000).optional(),
  airbnbSuspendu: z.boolean(),
  hotesExclus: z.array(z.string().max(1000)).max(2_000),
  urlsCommunes: z.array(z.string().max(4000)).max(5_000),
});

export type DemandeCompletion = z.infer<typeof Input>;
export type { RenduTranche };

export const completerProfond = createServerFn({ method: "POST" })
  .validator(Input)
  .handler(async ({ data }): Promise<RenduTranche> => {
    const [{ trancheProfonde }, { memoireFiches }, pages, { lireFichesAirbnb }] = await Promise.all([
      import("./completion.server"),
      import("../stay/memoireFiches.server"),
      import("../stay/completerFiche.server"),
      import("../scrape/airbnb.server"),
    ]);
    return trancheProfonde(data, {
      lireFichesAirbnb,
      lirePages: pages.lirePagesProfond,
      lirePagesAirbnb: pages.lirePagesAirbnbProfond,
      laissees: pages.laisseesProfond,
      memoire: memoireFiches(),
      maintenant: Date.now,
    });
  });
