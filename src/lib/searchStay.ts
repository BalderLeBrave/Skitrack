import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachAccess } from "./access";
import { listingsForStay, type Listing } from "./listings";
import { agencesDuReleve } from "./scrape/domaine";
import type { LiveSearchInput, LiveSearchResult, SourceName } from "./scrape/types";
import { stationById } from "./stations";
import { estTimeout, withDeadline } from "./stay/deadline";
import { enrichirListing } from "./stay/enrichir";
import { journalResidu, residuLogements } from "./stay/logement";
import { estFicheGitesIntrouvable } from "./stay/ficheGites";
import { estOffreGitesVerifiee, purgerTarifFigé } from "./stay/tarif";
import { dedoublonnerParBien } from "./stay/poserReleve";

const Input = z.object({
  stationId: z.string().min(1),
  stationName: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(30),
  bedrooms: z.number().int().min(0).max(20),
  part: z.enum(["airbnb", "gites", "cozy", "centrales", "greengo", "agences", "browser", "all"]).optional(),
  /** « Relancer le relevé » à l'écran : le cache long d'Airbnb ne sert que 90 s. */
  relance: z.boolean().optional(),
  /**
   * L'écran qui demande. Prix lit ses candidates Airbnb par leur fiche PDP : sa
   * passe ne met aucune page en tâche de fond (`fillFiches`, `pour`).
   */
  pour: z.enum(["logements", "prix"]).optional(),
});

/** Une part (Airbnb, Gîtes…) ne doit pas retenir l'écran. Le repli s'affiche. */
export const SEARCH_PART_MS = 52_000;
/** Budget réservé au devis ITEA, après ou pendant le complément de fiches. */
export const DEVIS_MS = 18_000;
/** Budget réservé au total du panier Ingénie (loyer + taxe), même si le relevé a tout pris. */
export const TARIF_MS = 18_000;
export const PAUSE_DELAI = "Délai dépassé : relevé précédent conservé.";

/**
 * Les sources d'une part. Les agences, seulement celles qui couvrent la
 * station ou, sur un grand domaine, une station reliée : les autres n'existent
 * pas là.
 */
function sourcesOf(part: NonNullable<z.infer<typeof Input>["part"]>, input: LiveSearchInput): SourceName[] {
  const agences = [...agencesDuReleve(input).keys()];
  if (part === "airbnb") return ["Airbnb"];
  if (part === "gites") return ["Gîtes de France"];
  if (part === "centrales") return ["Centrale"];
  if (part === "greengo") return ["GreenGo"];
  if (part === "agences") return agences;
  if (part === "cozy") return ["Abritel", "Booking"];
  if (part === "browser") return ["Airbnb", "Gîtes de France", "Abritel", "Booking"];
  return ["Airbnb", "Gîtes de France", "Abritel", "Booking", "Centrale", "GreenGo", ...agences];
}

function timedOutResult(part: NonNullable<z.infer<typeof Input>["part"]>, input: LiveSearchInput, ms: number): LiveSearchResult {
  return {
    listings: [],
    sources: sourcesOf(part, input).map((source) => ({
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
    // L'écran Logements relève tout le grand domaine relié (`scrape/domaine.ts`) ;
    // l'écran Prix compare des stations, chacune pour elle-même.
    const input: LiveSearchInput = { ...data, domaine: data.pour !== "prix" };
    const t0 = Date.now();
    const [{ runLiveSearch }, { pendantReleveAirbnb, noterVue }] = await Promise.all([
      import("./scrape/run.server"),
      import("./stay/completerFiche.server"),
    ]);
    // L'écran Logements regarde cette station : dès l'entrée, avant le relevé,
    // pour qu'une recherche abandonnée qui finit après ne passe pas devant.
    const vue = data.pour === "prix" ? undefined : data.stationId;
    if (vue) noterVue(vue);
    // Une part qui relève la liste Airbnb tient la tâche de fond des pages à
    // l'écart pendant le relevé : il garde ses créneaux du limiteur.
    const releveAirbnb = part === "airbnb" || part === "all" || part === "browser";
    const relever = () => runLiveSearch(input, part, { relance: data.relance === true });
    let res: LiveSearchResult;
    try {
      res = await withDeadline(
        releveAirbnb ? pendantReleveAirbnb(relever) : relever(),
        SEARCH_PART_MS,
        `search ${part}`,
      );
    } catch (err) {
      if (!estTimeout(err)) throw err;
      console.warn(`[searchStay] ${part} délai dépassé`);
      res = timedOutResult(part, input, Date.now() - t0);
    }
    const remain = Math.max(0, SEARCH_PART_MS - (Date.now() - t0));
    return {
      ...res,
      listings: await completer(
        res.listings.map((l) => dater(l, data.checkIn, data.checkOut)),
        data.stationId,
        remain,
        { checkIn: data.checkIn, checkOut: data.checkOut, guests: data.guests },
        { pour: data.pour, vue },
      ),
    };
  });

/** Ce que la relecture peut prendre d'un coup : le relevé Airbnb d'une grande station. */
const ANNONCES_MAX = 2_000;
/** Les annonces qu'on met en tête d'un coup : celle qu'on ouvre, pas une liste. */
const OUVERTES_MAX = 3;

/**
 * Relit les annonces que l'écran tient déjà, par la seconde passe seule
 * (`fillFiches`), sans nouveau relevé et **sans réseau** : ce que la tâche de
 * fond a lu (cache des fiches) et la mémoire des fiches se posent, et rien ne
 * part d'ici. Les pages Airbnb se lisent en tâche de fond ; l'écran les
 * affichait « non renseigné » jusqu'à la recherche suivante. Ce qui reste à
 * lire retourne en fin de file, sauf si un refus a arrêté le catalogue : la
 * relecture ne le relance pas. L'annonce ouverte, elle, peut encore partir
 * seule (`prioriserSuiteAirbnb`).
 *
 * `lireMaintenant` : les annonces Airbnb qu'on vient d'ouvrir (trois au plus)
 * passent d'abord en tête de la file de la tâche de fond
 * (`prioriserSuiteAirbnb`), même limiteur, même coupe-circuit ; l'écran les
 * relit ensuite. Les autres sources ne sont pas lues à l'ouverture : seule,
 * hors du relevé entier, une annonce ne dit pas si sa page est commune à
 * plusieurs (`urlsPartagees`), et sa lecture poserait sur elle la page d'une
 * résidence.
 *
 * Les annonces reviennent comblées, leur accès aux pistes recalculé si leur
 * point a changé.
 */
export const completerAnnonces = createServerFn({ method: "POST" })
  .validator(
    z.object({
      listings: z
        .array(z.object({ id: z.string().min(1), source: z.string().min(1), stationId: z.string().min(1) }).passthrough())
        .max(ANNONCES_MAX),
      lireMaintenant: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<Listing[]> => {
    const lire = data.lireMaintenant === true;
    const rows = (data.listings as unknown as Listing[]).slice(0, lire ? OUVERTES_MAX : ANNONCES_MAX);
    if (rows.length === 0) return rows;
    const points = new Map(rows.map((l) => [l.id, `${l.lat},${l.lon}`]));
    try {
      const { fillFiches, prioriserSuiteAirbnb } = await import("./stay/completerFiche.server");
      if (lire) {
        // En tête AVANT la relecture : la suite, si elle repart, part sur elle.
        const { airbnbComplet } = await import("./stay/priseFiche");
        prioriserSuiteAirbnb(rows.filter((l) => l.source === "Airbnb" && !airbnbComplet(l)));
      }
      // Ce que le cache et la mémoire savent, sans réseau. Un catalogue arrêté
      // sur un refus n'est pas relancé ; l'annonce ouverte, si, toute seule.
      await fillFiches(rows, 0, { relecture: true });
    } catch {
      /* mémoire illisible : les trous restent nommés, la relecture suivante reprendra */
    }
    const bouges = rows.filter((l) => points.get(l.id) !== `${l.lat},${l.lon}`);
    if (bouges.length === 0) return rows;
    const parId = new Map(poserAcces(bouges, bouges[0].stationId).map((l) => [l.id, l]));
    return rows.map((l) => parId.get(l.id) ?? l);
  });

/**
 * Les annonces Airbnb déjà en cache pour cette recherche, y compris celles
 * lues après la première réponse (suite de pages). Aucun appel à Airbnb.
 */
export const lireSuiteAirbnb = createServerFn({ method: "POST" })
  .validator(
    z.object({
      stationId: z.string().min(1),
      stationName: z.string().min(1),
      lat: z.number(),
      lon: z.number(),
      checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      guests: z.number().int().min(1).max(30),
      bedrooms: z.number().int().min(0).max(20),
    }),
  )
  .handler(async ({ data }): Promise<Listing[]> => {
    const { lireCacheAirbnb } = await import("./scrape/run.server");
    return lireCacheAirbnb({ ...data, domaine: true });
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
    // En tête de la suite seulement si l'écran regarde encore cette station.
    return completer(listingsForStay(data.stationId, 1, 0), data.stationId, 28_000, stay, { vue: data.stationId });
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
 * « en ligne, sans prix à ces dates », ce qui est exact — c'est ainsi qu'Airbnb
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
  return rows.map((l) => attachAccess(l, station));
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
  fiches: { pour?: "logements" | "prix"; vue?: string } = {},
): Promise<Listing[]> {
  // Copie : les remplisseurs mutent en place, et le relevé figé ne doit pas l'être.
  const rows = listings.map((l) => ({ ...enrichirListing(l) }));
  // Logements : le séjour cherché, pour les relectures qui demandent à Apify
  // les annonces Airbnb encore incomplètes (`completerApify.server.ts`).
  if (stay && fiches.pour !== "prix") {
    try {
      const { noterSejourApify } = await import("./scrape/apify/airbnbApify.server");
      noterSejourApify(stationId, stay);
    } catch {
      /* sans Apify, rien ne change */
    }
  }
  const extraDevis = stay && rows.some((l) => l.source === "Gîtes de France") ? DEVIS_MS : 0;
  const extraTarif = stay && rows.some((l) => l.source === "Centrale" && l.total > 0) ? TARIF_MS : 0;
  const budget = Math.max(budgetMs, extraDevis, extraTarif);
  if (budget <= 0) return poserAcces(dedoublonnerParBien(rows), stationId);
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
            await fillFiches(rows, budgetMs, fiches);
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
  // Un même bien rendu deux fois par une part (deux pages d'une centrale, une
  // copie Cozy et une copie directe) n'est qu'un logement : plateforme +
  // identifiant (`dedoublonnerParBien`). Entre parts, `mergeLive` dédoublonne.
  const rendues = dedoublonnerParBien(rows.filter((l) => !estFicheGitesIntrouvable(l) && estOffreGitesVerifiee(l)));
  // Ce qui reste introuvable reste `null`, et se dit : jamais de valeur par défaut.
  for (const ligne of journalResidu(residuLogements(rendues), stationId)) console.info(ligne);
  return poserAcces(rendues, stationId);
}
