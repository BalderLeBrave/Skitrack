import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachAccess } from "./access";
import { listingsForStay, type Listing } from "./listings";
import type { LiveSearchResult, SourceName } from "./scrape/types";
import { stationById } from "./stations";
import { estTimeout, withDeadline } from "./stay/deadline";
import { enrichirListing } from "./stay/enrichir";
import { estFicheGitesIntrouvable } from "./stay/ficheGites";
import { purgerTarifFigé } from "./stay/tarif";

const Input = z.object({
  stationId: z.string().min(1),
  stationName: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(30),
  bedrooms: z.number().int().min(0).max(20),
  part: z.enum(["airbnb", "gites", "cozy", "centrales", "browser", "all"]).optional(),
});

/** Une part (Airbnb, Gîtes…) ne doit pas retenir l'écran. Le repli s'affiche. */
export const SEARCH_PART_MS = 52_000;
/** Budget réservé au devis ITEA, après ou pendant le complément de fiches. */
export const DEVIS_MS = 18_000;
/** Budget réservé au total du panier Ingénie (loyer + taxe), même si le relevé a tout pris. */
export const TARIF_MS = 18_000;
export const PAUSE_DELAI = "Délai dépassé — relevé précédent conservé.";

function sourcesOf(part: NonNullable<z.infer<typeof Input>["part"]>): SourceName[] {
  if (part === "airbnb") return ["Airbnb"];
  if (part === "gites") return ["Gîtes de France"];
  if (part === "centrales") return ["Centrale"];
  if (part === "cozy") return ["Abritel", "Booking"];
  if (part === "browser") return ["Gîtes de France", "Abritel", "Booking"];
  return ["Airbnb", "Gîtes de France", "Abritel", "Booking", "Centrale"];
}

function timedOutResult(part: NonNullable<z.infer<typeof Input>["part"]>, ms: number): LiveSearchResult {
  return {
    listings: [],
    sources: sourcesOf(part).map((source) => ({
      source,
      ok: false,
      count: 0,
      ms,
      error: PAUSE_DELAI,
    })),
  };
}

export const searchStay = createServerFn({ method: "POST" })
  .validator(Input)
  .handler(async ({ data }): Promise<LiveSearchResult> => {
    const part = data.part ?? "all";
    const t0 = Date.now();
    const { runLiveSearch } = await import("./scrape/run.server");
    let res: LiveSearchResult;
    try {
      res = await withDeadline(runLiveSearch(data, part), SEARCH_PART_MS, `search ${part}`);
    } catch (err) {
      if (!estTimeout(err)) throw err;
      console.warn(`[searchStay] ${part} délai dépassé`);
      res = timedOutResult(part, Date.now() - t0);
    }
    const remain = Math.max(0, SEARCH_PART_MS - (Date.now() - t0));
    return {
      ...res,
      listings: await completer(
        res.listings.map((l) => dater(l, data.checkIn, data.checkOut)),
        data.stationId,
        remain,
        { checkIn: data.checkIn, checkOut: data.checkOut, guests: data.guests },
      ),
    };
  });

/** Seconde passe sur le relevé figé : GPS Gîtes, occupancy, devis ITEA daté. */
export const completerReleve = createServerFn({ method: "POST" })
  .validator(
    z.object({
      stationId: z.string().min(1),
      checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      guests: z.number().int().min(1).max(30).optional(),
    }),
  )
  .handler(async ({ data }): Promise<Listing[]> => {
    const stay =
      data.checkIn && data.checkOut && data.guests
        ? { checkIn: data.checkIn, checkOut: data.checkOut, guests: data.guests }
        : undefined;
    return completer(listingsForStay(data.stationId, 1, 0), data.stationId, 28_000, stay);
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
  const row = purgerTarifFigé(l);
  if (!(row.total > 0)) return row;
  // Quand une source ne rend rien en direct, les collecteurs replient sur le
  // relevé figé et l'écrivent dans `proven`. Ces prix portent bien les dates
  // demandées, mais ils n'ont pas été mesurés à l'instant : leur tamponner
  // `scannedAt` à maintenant les ferait passer pour frais, et la péremption de
  // six heures ne les rattraperait jamais. Les dates, oui ; l'heure, non.
  const repli = /repli/i.test(row.proven);
  return {
    ...row,
    pricedCheckIn: row.pricedCheckIn ?? checkIn,
    pricedCheckOut: row.pricedCheckOut ?? checkOut,
    scannedAt: row.scannedAt ?? (repli ? null : Date.now()),
  };
}

function poserAcces(rows: Listing[], stationId: string): Listing[] {
  const station = stationById(stationId);
  if (!station) return rows;
  return rows.map((l) => {
    if (l.lat == null || l.lon == null) return l;
    if (l.searchedLiftM != null || l.distToLiftM != null) return l;
    return attachAccess(l, station);
  });
}

/**
 * Seconde passe, hors collecteur : occupancy déjà écrite dans un titre,
 * photo de galerie, lien Airbnb lu dans une photo, GPS Gîtes encore vide,
 * capacité / chambres / GPS lus sur la fiche liée (et l'adresse numérotée
 * si le geo est vide), accès ski dès que le GPS arrive.
 *
 * `budgetMs` coupe le réseau : un collecteur lent ne doit pas faire rater
 * la réponse. Ce qui est déjà lu (relevé figé, titre, cache) reste.
 */
async function completer(
  listings: Listing[],
  stationId: string,
  budgetMs: number,
  stay?: { checkIn: string; checkOut: string; guests: number },
): Promise<Listing[]> {
  // Copie : les remplisseurs mutent en place, et le relevé figé ne doit pas l'être.
  const rows = listings.map((l) => ({ ...enrichirListing(l) }));
  const extraDevis = stay && rows.some((l) => l.source === "Gîtes de France") ? DEVIS_MS : 0;
  const extraTarif = stay && rows.some((l) => l.source === "Centrale" && l.total > 0) ? TARIF_MS : 0;
  const budget = Math.max(budgetMs, extraDevis, extraTarif);
  if (budget <= 0) return poserAcces(rows, stationId);
  try {
    await withDeadline(
      Promise.all([
        (async () => {
          if (!rows.some((l) => l.source === "Gîtes de France" && (l.lat == null || l.lon == null))) return;
          try {
            const { fillGitesGps } = await import("./scrape/gitesGps.server");
            await fillGitesGps(rows);
          } catch {
            /* robots, réseau : les trous restent nommés */
          }
        })(),
        (async () => {
          if (budgetMs <= 0) return;
          try {
            const { fillFiches } = await import("./stay/completerFiche.server");
            await fillFiches(rows, budgetMs);
          } catch {
            /* robots, réseau : les trous restent nommés */
          }
        })(),
        stay && extraTarif > 0
          ? (async () => {
              try {
                const { fillTarifs } = await import("./stay/completerTarif.server");
                await fillTarifs(rows, stay, extraTarif);
              } catch {
                /* panier injoignable : le loyer reste */
              }
            })()
          : Promise.resolve(),
        stay && extraDevis > 0
          ? (async () => {
              try {
                const { fillDevis } = await import("./stay/completerDevis.server");
                await fillDevis(rows, stay, extraDevis);
              } catch {
                /* widget ITEA injoignable : le prix Gîtes reste non publié */
              }
            })()
          : Promise.resolve(),
      ]),
      budget,
      "completer",
    );
  } catch (err) {
    if (!estTimeout(err)) throw err;
    console.warn("[searchStay] complément de fiches : délai dépassé, on rend ce qui est lu");
  }
  return poserAcces(
    rows.filter((l) => !estFicheGitesIntrouvable(l)),
    stationId,
  );
}
