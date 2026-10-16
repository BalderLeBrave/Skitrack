import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArretGreenGo,
  OPERATION_DETAIL,
  OPERATION_RECHERCHE,
  cleSansDetail,
  detailler,
  detaillerMalgre,
  emprise,
  equipementsGreenGo,
  greengoListings,
  hoteGarde,
  hotePur,
  hotesDeSuite,
  lecturesAGarder,
  lienHote,
  ficheGreenGo,
  lireDetail,
  lireRecherche,
  lireSuiteGreenGo,
  logementGarde,
  notesDuDetail,
  requeteDetail,
  requeteRecherche,
  suiteALancer,
  valeursAGarder,
  type HoteGreenGo,
  type LogementGreenGo,
  type PorteSuiteGreenGo,
} from "./greengo.ts";
import type { LiveSearchInput } from "./types.ts";
import type { Listing } from "../listings.ts";
import { garderLectures, reposerGardees } from "../stay/contenuFiches.server.ts";
import { DEPUIS_CLE, type CleEquipement } from "../stay/equipements.ts";
import { aEquipement, aEquipementDemande, equipementsDe } from "../stay/ficheEnrichie.ts";
import { cleListing } from "../stay/poserReleve.ts";
import { memoireFiches } from "../stay/memoireFiches.server.ts";

const dir = dirname(fileURLToPath(import.meta.url));
// Les mémoires du processus (`memoireFiches`, `contenuFiches`) : jamais
// celles de l'application.
process.env.SKITRACK_CONFIG_DIR = mkdtempSync(join(tmpdir(), "skitrack-greengo-"));

/**
 * Réponses réelles du 24 septembre 2026, réduites aux champs que nos requêtes
 * demandent (photos : la première) : recherche datée 6→13/02/2027, 2 adultes,
 * emprise 46.10–46.28 / 6.60–6.85 (12 hôtes) ; détail de Chalet Cannelle
 * (5 chambres d'hôtes), sans `accommodationType`. Et le détail de Beauregard
 * du 25 septembre, avec : un chalet de 12, deux chambres d'hôtes.
 */
const RECHERCHE_REELLE: unknown = JSON.parse(readFileSync(join(dir, "fixtures/greengo-recherche-portes-du-soleil.json"), "utf8"));
const DETAIL_CANNELLE: unknown = JSON.parse(readFileSync(join(dir, "fixtures/greengo-detail-chalet-cannelle.json"), "utf8"));
const DETAIL_BEAUREGARD: unknown = JSON.parse(readFileSync(join(dir, "fixtures/greengo-detail-beauregard.json"), "utf8"));

const AVORIAZ: LiveSearchInput = {
  stationId: "avoriaz",
  stationName: "Avoriaz",
  lat: 46.1914,
  lon: 6.7728,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};

// Formes relevées le 24 septembre 2026 (recherche et détail de Néva).
const RECHERCHE = {
  data: {
    publicAdverts: {
      classicSearch: {
        bookableHostingAdverts: {
          totalCount: 2,
          edges: [
            {
              node: {
                __typename: "HostingAdvertFromSingleAccommodationPublicSlice",
                id: "e86b77f8-bb8c-4af0-826a-8150eb501d50",
                name: "Néva",
                currentProductSlug: "neva",
                formattedLocation: "Morzine, Haute-Savoie",
                addressFromGmaps: { city: "Morzine" },
                coordinates: { lat: 46.1922, lng: 6.7714 },
                orderedImageNormalizedPaths: ["accommmodation/ordered_images/img_3663.jpeg"],
                allHostingAdvertTypeTags: [{ id: "RENTAL" }],
                summary: { numberOfAccommodationUnits: 1, minMaxNumberOfTravellersAllowed: { min: 4, max: 4 } },
                coarseBookingInformation: { minPricePerNightInformation: { minPricePerNightRoundedToInt: 378 } },
              },
            },
            { node: { __typename: "HostingAdvertPublicSlice" } },
          ],
        },
      },
    },
  },
};

function detail(accommodations: unknown) {
  return { data: { publicAdverts: { hostingAdvert: accommodations } } };
}

const NEVA = detail({
  __typename: "HostingAdvertFromSingleAccommodationPublicSlice",
  id: "e86b77f8-bb8c-4af0-826a-8150eb501d50",
  singleAccommodation: {
    id: "1bcc24b4-b278-4bf7-a77c-e3246c9ec4d2",
    currentProductSlug: "neva-appartement-entier",
    name: "Néva",
    accommodationType: "FULL_FLAT",
    maxNumberOfTravellers: 4,
    numberOfBedrooms: 1,
    totalNumberOfBeds: 2,
    numberOfBathrooms: 1,
    orderedImageNormalizedPaths: ["accommmodation/ordered_images/img_3651.jpeg"],
    bookingPricing: { __typename: "BookingPricing", totalPrice: { forStayRounded: 2649, forStayUnrounded: "2648.80" } },
    nonbookableReasons: [],
  },
});

/** Un logement du détail, pour les règles de garde. */
function logement(id: string, type: string | null, reservable = true): LogementGreenGo {
  return { id, nom: id, type, capacite: 4, chambres: 2, lits: 3, sdb: 1, photos: [], total: 900, reservable };
}

describe("GreenGo : requêtes", () => {
  it("l'emprise entoure la station de 6 km de part et d'autre", () => {
    const b = emprise(46.19, 6.77, 6);
    assert.ok(Math.abs(b.ne.lat - 46.19 - 6 / 111) < 1e-9);
    assert.ok(Math.abs(46.19 - b.sw.lat - 6 / 111) < 1e-9);
    assert.ok(b.ne.lng - 6.77 > 6 / 111, "un degré de longitude est plus court à 46° N");
  });

  it("la recherche porte les dates, les voyageurs, l'emprise et un fragment sur l'union", () => {
    const q = requeteRecherche(AVORIAZ, 6, 42);
    assert.match(q, /checkInOutDateRange:\{start:"2027-02-06",end:"2027-02-13"\}/);
    assert.match(q, /numberOfAdults:2/);
    assert.match(q, /mapBounds:\{sw:\{lat:46\.13\d+,lng:6\.69\d+\}/);
    assert.match(q, /\.\.\. on HostingAdvertPublicSliceInterface/);
    assert.match(q, /first:42, offset:42/);
  });

  it("la recherche demande les étiquettes de l'hôte et sa capacité", () => {
    const q = requeteRecherche(AVORIAZ, 6, 0);
    assert.match(q, /allHostingAdvertTypeTags \{ id \}/);
    assert.match(q, /summary\(optionalDateRange:\{start:"2027-02-06",end:"2027-02-13"\}\) \{ numberOfAccommodationUnits minMaxNumberOfTravellersAllowed \{ min max \} \}/);
  });

  it("la recherche ne demande pas le type des logements : le serveur le refuse, et toute la recherche tombe", () => {
    assert.doesNotMatch(requeteRecherche(AVORIAZ, 6, 0), /accommodationUnitsByType|nonRedundantAccommodationTypes|accommodationType/);
  });

  it("le détail demande le type de chaque logement", () => {
    assert.match(
      requeteDetail(AVORIAZ, "neva"),
      /fragment Logement on AccommodationPublicSlice \{ id currentProductSlug name description averageGlobalRating numberOfRatings accommodationType /,
    );
  });

  it("des dates illisibles n'entrent pas dans la requête", () => {
    assert.throws(() => requeteRecherche({ ...AVORIAZ, checkIn: '2027-02-06"){x}' }, 6, 0));
  });

  it("les requêtes portent les noms d'opération du site, jamais « Skitrack »", () => {
    const r = requeteRecherche(AVORIAZ, 6, 0);
    const d = requeteDetail(AVORIAZ, "neva");
    assert.ok(r.startsWith(`query ${OPERATION_RECHERCHE} {`), "le nom envoyé doit exister dans la requête");
    assert.ok(d.startsWith(`query ${OPERATION_DETAIL} {`));
    assert.doesNotMatch(r + d, /skitrack/i);
  });

  it("le slug d'un hôte est échappé", () => {
    const q = requeteDetail(AVORIAZ, 'chalet"cannelle');
    assert.ok(q.includes('productSlug:"chalet\\"cannelle"'));
  });
});

describe("GreenGo : lecture", () => {
  it("la recherche rend les hôtes complets, et ignore un nœud sans champs", () => {
    const { hotes, total, noeuds } = lireRecherche(RECHERCHE);
    assert.equal(total, 2);
    assert.equal(noeuds, 2, "la page reçue comptait deux nœuds");
    assert.equal(hotes.length, 1);
    assert.deepEqual(hotes[0], {
      id: "e86b77f8-bb8c-4af0-826a-8150eb501d50",
      unique: true,
      nom: "Néva",
      slug: "neva",
      lieu: "Morzine",
      lat: 46.1922,
      lon: 6.7714,
      photos: ["https://images.greengo.voyage/canonical/accommmodation/ordered_images/img_3663.jpeg"],
      minParNuit: 378,
      tags: ["RENTAL"],
      capacite: 4,
    });
  });

  it("recherche réelle : 12 hôtes, tous placés, avec leurs étiquettes", () => {
    const { hotes, total } = lireRecherche(RECHERCHE_REELLE);
    assert.equal(total, 12);
    assert.equal(hotes.length, 12);
    assert.ok(hotes.every((h) => h.lat != null && h.lon != null), "chaque hôte a sa position");
    assert.ok(hotes.every((h) => h.tags.length > 0), "chaque hôte a au moins une étiquette");
    const beauregard = hotes.find((h) => h.slug === "chalet-d-alpage-de-beauregard-1");
    assert.deepEqual(beauregard?.tags, ["GITE_FR", "GUESTROOMS"]);
  });

  it("recherche réelle : la capacité d'un logement unique vient du résumé, jamais celle d'un établissement", () => {
    const { hotes } = lireRecherche(RECHERCHE_REELLE);
    const par = new Map(hotes.map((h) => [h.slug, h]));
    assert.equal(par.get("neva")?.capacite, 4);
    assert.equal(par.get("chalet-paradis-blanc-morzine-5")?.capacite, 18);
    assert.equal(par.get("chalet-zakopane")?.capacite, 20);
    assert.equal(par.get("chalet-cannelle")?.capacite, null, "5 chambres de 2 à 4 : pas une capacité");
    assert.equal(hotes.filter((h) => h.capacite != null).length, 9);
  });

  it("le détail rend le type, la capacité, les chambres et le total exact du séjour", () => {
    const [u] = lireDetail(NEVA);
    assert.equal(u.type, "FULL_FLAT");
    assert.equal(u.total, 2649);
    assert.equal(u.capacite, 4);
    assert.equal(u.chambres, 1);
    assert.equal(u.lits, 2);
    assert.equal(u.sdb, 1);
    assert.equal(u.reservable, true);
  });

  it("détail réel : chaque logement a capacité, chambres, lits, salle de bain et total", () => {
    const logements = lireDetail(DETAIL_CANNELLE);
    assert.equal(logements.length, 5);
    assert.deepEqual(
      logements.map((u) => [u.nom, u.capacite, u.chambres, u.total, u.reservable]),
      [
        ["Antler", 2, 1, 1162, true],
        ["Owl", 4, 1, 1330, true],
        ["Bumble", 2, 1, 1400, true],
        ["Capra", 2, 1, 1400, true],
        ["Feather", 3, 1, 1400, true],
      ],
    );
    assert.ok(logements.every((u) => u.lits != null && u.sdb != null));
    assert.ok(logements.every((u) => u.type === null), "la capture précède accommodationType");
  });

  it("détail réel : le type de chaque logement, un chalet de 12 et deux chambres d'hôtes", () => {
    assert.deepEqual(
      lireDetail(DETAIL_BEAUREGARD).map((u) => [u.type, u.capacite, u.chambres, u.total, u.reservable]),
      [
        ["CHALET", 12, 7, 3613, true],
        ["GUESTROOM", 2, 1, 574, false],
        ["GUESTROOM", 3, 1, 854, false],
      ],
    );
  });

  it("un établissement : plusieurs logements, et un non réservable aux dates", () => {
    const logements = lireDetail(
      detail({
        __typename: "HostingAdvertFromEstablishmentPublicSlice",
        accommodationsInEstablishment: [
          { id: "a", name: "Studio", maxNumberOfTravellers: 2, bookingPricing: { totalPrice: { forStayUnrounded: "928.00" } }, nonbookableReasons: [] },
          { id: "b", name: "Chalet", maxNumberOfTravellers: 8, bookingPricing: null, nonbookableReasons: [{ __typename: "X" }] },
        ],
      }),
    );
    assert.deepEqual(
      logements.map((u) => [u.id, u.total, u.reservable]),
      [
        ["a", 928, true],
        ["b", null, false],
      ],
    );
  });

  it("lit le total que la source publie en nombre, pas seulement en chaîne", () => {
    const logements = lireDetail(
      detail({
        __typename: "HostingAdvertFromSingleAccommodationPublicSlice",
        singleAccommodation: {
          id: "n",
          name: "Studio",
          bookingPricing: { totalPrice: { forStayUnrounded: 928.4, forStayRounded: 928 } },
          nonbookableReasons: [],
        },
      }),
    );
    assert.equal(logements[0]?.total, 928);
    const arrondi = lireDetail(
      detail({
        __typename: "HostingAdvertFromSingleAccommodationPublicSlice",
        singleAccommodation: {
          id: "r",
          name: "Studio",
          bookingPricing: { totalPrice: { forStayRounded: "1 149" } },
          nonbookableReasons: [],
        },
      }),
    );
    assert.equal(arrondi[0]?.total, 1149);
  });
});

describe("détail après une recherche interrompue", () => {
  it("une page illisible ne coupe pas les hôtes déjà lus ; un refus ou l'échéance, si", () => {
    assert.equal(detaillerMalgre(undefined), true);
    assert.equal(detaillerMalgre("HTTP 500"), true);
    assert.equal(detaillerMalgre("GraphQL : champ inconnu"), true);
    assert.equal(detaillerMalgre("timed out after 503 ms"), true);
    assert.equal(detaillerMalgre("HTTP 429 — pause 45 s"), false);
    assert.equal(detaillerMalgre("HTTP 403"), false);
    assert.equal(detaillerMalgre("échéance"), false);
    assert.equal(detaillerMalgre("limiteur local (3 s à attendre)"), false);
    assert.equal(detaillerMalgre("pause après un refus (45 s à attendre)"), false);
  });
});

describe("GreenGo : types gardés", () => {
  const h = (tags: string[]) => ({ tags });

  it("un camping ou un hôtel n'est jamais gardé, même avec une location", () => {
    assert.equal(hoteGarde(h(["CAMPING", "RENTAL"])), false);
    assert.equal(hoteGarde(h(["HOTEL", "GITE_FR"])), false);
  });

  it("location ou gîte : détaillé ; insolite : détaillé, son type tranchera ; chambres d'hôtes ou chez l'habitant seuls : écarté", () => {
    assert.equal(hoteGarde(h(["RENTAL"])), true);
    assert.equal(hoteGarde(h(["GITE_FR", "RENTAL", "UNUSUAL"])), true);
    assert.equal(hoteGarde(h(["UNUSUAL"])), true, "le Chalet de Mapellet est « insolite » et c'est un chalet");
    assert.equal(hoteGarde(h(["GITE_FR", "GUESTROOMS"])), true);
    assert.equal(hoteGarde(h(["GUESTROOMS"])), false);
    assert.equal(hoteGarde(h(["GUESTROOMS", "HOMESTAY"])), false);
    assert.equal(hoteGarde(h([])), false, "sans étiquette, rien n'est prouvé");
  });

  it("recherche réelle : 10 hôtes sur 12 détaillés, sans les chambres d'hôtes", () => {
    const { hotes } = lireRecherche(RECHERCHE_REELLE);
    const ecartes = hotes.filter((x) => !hoteGarde(x)).map((x) => x.slug);
    assert.deepEqual(ecartes.sort(), ["chalet-cannelle", "chalet-le-nid-des-cimes"]);
  });

  it("un hôte mixte ou insolite n'est pas « pur » : son annonce sans détail pourrait être une chambre ou une tente", () => {
    assert.equal(hotePur(h(["GITE_FR", "GUESTROOMS"])), false);
    assert.equal(hotePur(h(["UNUSUAL"])), false);
    assert.equal(hotePur(h(["RENTAL", "UNUSUAL"])), false);
    assert.equal(hotePur(h(["GITE_FR", "RENTAL"])), true);
    assert.equal(hotePur(h([])), false);
  });

  it("un logement : liste blanche sur son type ; sans type, l'hôte pur décide", () => {
    for (const t of ["FULL_FLAT", "FULL_HOUSE", "CHALET", "VILLA", "GITE_FR"]) assert.equal(logementGarde(t, h(["GUESTROOMS"])), true, t);
    for (const t of ["CAMPING_SPOT", "TENT", "YURT", "BUBBLE", "TRAILER", "HUT", "TREES_HUT", "BED_IN_COMMON_ROOM", "HOTEL_ROOM", "GUESTROOM", "HOMESTAY", "UNCLASSIFIABLE", "CASTLE", "ECOLODGE", "TINY_HOUSE", "NOUVEAU"]) {
      assert.equal(logementGarde(t, h(["RENTAL"])), false, t);
    }
    assert.equal(logementGarde(null, h(["RENTAL"])), true);
    assert.equal(logementGarde(null, h(["GITE_FR", "GUESTROOMS"])), false);
  });
});

describe("GreenGo : annonces", () => {
  const hote: HoteGreenGo = lireRecherche(RECHERCHE).hotes[0];

  it("un logement réservable devient une annonce datée, avec son lien et son type", () => {
    const [l] = greengoListings(hote, lireDetail(NEVA), AVORIAZ);
    assert.equal(l.source, "GreenGo");
    assert.equal(l.id, "gg-e86b77f8-bb8c-4af0-826a-8150eb501d50");
    assert.equal(l.platformId, "1bcc24b4-b278-4bf7-a77c-e3246c9ec4d2");
    assert.equal(l.title, "Néva");
    assert.equal(l.total, 2649);
    assert.equal(l.capacity, 4);
    assert.equal(l.bedrooms, 1);
    assert.equal(l.propertyType, "Appartement entier");
    assert.equal(l.lat, 46.1922);
    assert.equal(l.url, "https://www.greengo.voyage/hote/neva?checkIn=2027-02-06&checkOut=2027-02-13&numberOfAdults=2");
    assert.equal(l.photo, "https://images.greengo.voyage/canonical/accommmodation/ordered_images/img_3651.jpeg");
  });

  it("un hôte à logement unique garde le même identifiant, détail lu ou non", () => {
    const [avec] = greengoListings(hote, lireDetail(NEVA), AVORIAZ);
    const [sans] = greengoListings(hote, null, AVORIAZ);
    assert.equal(avec.id, sans.id);
  });

  it("un logement non réservable aux dates n'est pas une offre", () => {
    const listings = greengoListings(
      { ...hote, unique: false, nom: "Chalet Cannelle" },
      [
        { id: "a", nom: "Studio", type: "FULL_FLAT", capacite: 2, chambres: 0, lits: 1, sdb: 1, photos: [], total: 928, reservable: true },
        { id: "b", nom: "Chalet", type: "CHALET", capacite: 8, chambres: 4, lits: 8, sdb: 2, photos: [], total: null, reservable: false },
      ],
      AVORIAZ,
    );
    assert.deepEqual(
      listings.map((l) => [l.id, l.title]),
      [["gg-a", "Chalet Cannelle — Studio"]],
    );
  });

  it("un hôte mixte ne rend que ses gîtes et appartements, jamais ses chambres d'hôtes", () => {
    const beauregard: HoteGreenGo = { ...hote, unique: false, nom: "Chalet d'alpage de Beauregard", tags: ["GITE_FR", "GUESTROOMS"] };
    const listings = greengoListings(beauregard, [logement("gite", "GITE_FR"), logement("ch1", "GUESTROOM"), logement("ch2", "GUESTROOM")], AVORIAZ);
    assert.deepEqual(
      listings.map((l) => [l.id, l.propertyType]),
      [["gg-gite", "Gîte"]],
    );
  });

  it("détail réel de Beauregard : le chalet de 12 reste, les chambres d'hôtes jamais, même réservables", () => {
    const beauregard = lireRecherche(RECHERCHE_REELLE).hotes.find((h) => h.slug === "chalet-d-alpage-de-beauregard-1");
    assert.ok(beauregard);
    const toutes = lireDetail(DETAIL_BEAUREGARD).map((u) => ({ ...u, reservable: true }));
    const listings = greengoListings(beauregard, toutes, AVORIAZ);
    assert.deepEqual(
      listings.map((l) => [l.title, l.propertyType, l.capacity, l.bedrooms, l.total]),
      [["Chalet d'alpage de Beauregard", "Chalet", 12, 7, 3613]],
    );
  });

  it("un hôte « insolite » : sans détail, rien ; avec, son chalet reste et sa tente non", () => {
    const mapellet: HoteGreenGo = { ...hote, nom: "Chalet de Mapellet", tags: ["UNUSUAL"] };
    assert.deepEqual(greengoListings(mapellet, null, AVORIAZ), []);
    assert.deepEqual(
      greengoListings(mapellet, [logement("mapellet", "CHALET")], AVORIAZ).map((l) => l.propertyType),
      ["Chalet"],
    );
    assert.deepEqual(greengoListings(mapellet, [logement("tipi", "TENT")], AVORIAZ), []);
  });

  it("détail réel : les chambres d'hôtes de Chalet Cannelle sont écartées", () => {
    const cannelle = lireRecherche(RECHERCHE_REELLE).hotes.find((h) => h.slug === "chalet-cannelle");
    assert.ok(cannelle);
    assert.equal(hoteGarde(cannelle), false, "écartée avant même son détail");
    const typees = lireDetail(DETAIL_CANNELLE).map((u) => ({ ...u, type: "GUESTROOM" }));
    assert.deepEqual(greengoListings(cannelle, typees, AVORIAZ), []);
  });

  it("détail non lu : l'hôte pur reste, prix non publié, capacité du résumé, « à partir de » dit comme tel", () => {
    const [l] = greengoListings(hote, null, AVORIAZ);
    assert.equal(l.total, 0);
    assert.equal(l.priceIndicative, true);
    assert.equal(l.priceLabel, "dès 378 € la nuit");
    assert.equal(l.capacity, 4);
    assert.equal(l.bedrooms, null, "les chambres ne viennent que du détail");
    assert.equal(l.propertyType ?? null, null, "le type ne vient que du détail");
    assert.equal(l.id, "gg-e86b77f8-bb8c-4af0-826a-8150eb501d50");
  });

  it("détail non lu d'un hôte mixte : pas d'annonce, elle pourrait être une chambre d'hôtes", () => {
    assert.deepEqual(greengoListings({ ...hote, unique: false, tags: ["GITE_FR", "GUESTROOMS"] }, null, AVORIAZ), []);
  });

  it("le lien de l'hôte porte les dates et les voyageurs", () => {
    assert.equal(
      lienHote("gites-la-patte-nordic", { ...AVORIAZ, guests: 4 }),
      "https://www.greengo.voyage/hote/gites-la-patte-nordic?checkIn=2027-02-06&checkOut=2027-02-13&numberOfAdults=4",
    );
  });
});

describe("GreenGo : détail de tous les hôtes", () => {
  const hotes = ["a", "b", "c", "d"].map((id) => ({ ...lireRecherche(RECHERCHE).hotes[0], id, slug: id }));

  it("chaque hôte est lu, au-delà de l'ancien plafond", async () => {
    const beaucoup = Array.from({ length: 25 }, (_, k) => ({ ...hotes[0], id: `h${k}`, slug: `h${k}` }));
    const r = await detailler(beaucoup, async (h) => [logement(h.id, "FULL_FLAT")]);
    assert.equal(r.details.size, 25);
    assert.equal(r.raison, undefined);
  });

  it("un refus arrête tout, et rien n'est repris", async () => {
    const lus: string[] = [];
    const r = await detailler(hotes, async (h) => {
      lus.push(h.id);
      if (h.id === "b") throw new ArretGreenGo("HTTP 429 — pause 45 s");
      return [];
    });
    assert.deepEqual(lus, ["a", "b"]);
    assert.deepEqual([...r.details.keys()], ["a"]);
    assert.equal(r.raison, "HTTP 429 — pause 45 s");
  });

  it("l'échec d'un seul hôte passe au suivant", async () => {
    const r = await detailler(hotes, async (h) => {
      if (h.id === "b") throw new Error("HTTP 500");
      return [];
    });
    assert.deepEqual([...r.details.keys()], ["a", "c", "d"]);
    assert.equal(r.echecs, 1);
    assert.equal(r.raison, undefined);
  });

  it("deux échecs de suite arrêtent : c'est le site qui a changé", async () => {
    const lus: string[] = [];
    const r = await detailler(hotes, async (h) => {
      lus.push(h.id);
      if (h.id !== "a") throw new Error("GraphQL : Cannot query field");
      return [];
    });
    assert.deepEqual(lus, ["a", "b", "c"]);
    assert.match(r.raison ?? "", /2 hôtes de suite/);
  });
});

describe("GreenGo : description et note du détail, sur une réponse réelle", () => {
  // Réponse réelle du 6 octobre 2026 à la requête de détail (champs description,
  // averageGlobalRating et numberOfRatings), Chalet Cannelle, telle quelle.
  const DETAIL = JSON.parse(readFileSync(join(dir, "fixtures/greengo-detail-chalet-cannelle-contenu.json"), "utf8"));
  const logements = lireDetail(DETAIL);

  it("la description publiée de chaque logement", () => {
    assert.equal(logements.length, 5);
    assert.ok(logements.every((u) => u.description));
    assert.match(logements.find((u) => u.nom === "Antler")!.description ?? "", /^La chambre romantique du Chalet Cannelle est inspirée du cerf/);
  });

  it("la note et les avis seulement quand il y a des avis", () => {
    const antler = logements.find((u) => u.nom === "Antler")!;
    assert.deepEqual([antler.note, antler.avis], [5, 1]);
    const capra = logements.find((u) => u.nom === "Capra")!;
    assert.deepEqual([capra.note, capra.avis], [undefined, undefined]);
  });
});

describe("GreenGo : équipements du détail", () => {
  // Réponse réelle du 6 octobre 2026 à la requête de détail, Balcons des Trois
  // Cîmes (Morzine, un logement seul), telle quelle.
  const DETAIL = JSON.parse(readFileSync(join(dir, "fixtures/greengo-detail-equipements.json"), "utf8"));
  const bloc = (possedes: string[], absents: string[] = []) => ({
    possessedEquipmentsGroupedBySortedCategories: [{ sortedEquipments: possedes }],
    sortedNonPossessedEquipments: absents,
  });

  it("la requête demande les équipements du logement seul et les parties communes de l'établissement", () => {
    const q = requeteDetail(AVORIAZ, "neva");
    assert.match(q, /HostingAdvertFromSingleAccommodationPublicSlice \{ equipments \{ possessedEquipmentsGroupedBySortedCategories \{ sortedEquipments \} sortedNonPossessedEquipments \}/);
    assert.match(q, /commonHostingEquipments \{ possessedEquipmentsGroupedBySortedCategories/);
    // Le serveur répond par une erreur sur les équipements privés, et le détail tombe.
    assert.doesNotMatch(q, /privateEquipmentsIfAccommodationInEstablishment/);
  });

  it("les codes possédés d'une réponse réelle, sans rien déduire des autres", () => {
    const [u] = lireDetail(DETAIL);
    assert.deepEqual(u.equipements, { balcon: "oui", wifi: "oui", laveVaisselle: "oui", laveLinge: "oui", parking: "oui" });
  });

  it("l'annonce réunit la liste et la description, la liste d'abord", () => {
    const hote = lireRecherche(RECHERCHE).hotes[0];
    const [l] = greengoListings(hote, lireDetail(DETAIL), AVORIAZ);
    const v = Object.fromEntries((l.amenities ?? []).map((e) => [e.cle, e.valeur]));
    // Wi-Fi, lave-vaisselle, lave-linge, balcon, parking : la liste.
    // Casier à skis et linge : la description (« casiers à ski », « linge de maison sont inclus »).
    assert.deepEqual(v, {
      balcon: "oui",
      cheminee: "inconnu",
      wifi: "oui",
      laveVaisselle: "oui",
      laveLinge: "oui",
      linge: "oui",
      parking: "oui",
      casierSkis: "oui",
      saunaSpa: "inconnu",
      piscine: "inconnu",
      animaux: "inconnu",
      ascenseur: "inconnu",
    });
  });

  it("les parties communes d'un établissement valent pour chacun de ses logements", () => {
    const etab = detail({
      __typename: "HostingAdvertFromEstablishmentPublicSlice",
      commonHostingEquipments: bloc(["WIFI", "SKI_ROOM"]),
      accommodationsInEstablishment: [
        { id: "a", name: "A", accommodationType: "FULL_FLAT", nonbookableReasons: [] },
        { id: "b", name: "B", accommodationType: "CHALET", nonbookableReasons: [] },
      ],
    });
    assert.deepEqual(
      lireDetail(etab).map((u) => u.equipements),
      [
        { wifi: "oui", casierSkis: "oui" },
        { wifi: "oui", casierSkis: "oui" },
      ],
    );
  });

  it("une clé à plusieurs codes : oui dès qu'un code est possédé, non seulement si tous sont déclarés absents", () => {
    assert.deepEqual(equipementsGreenGo(bloc(["SAUNA"])), { saunaSpa: "oui" });
    assert.deepEqual(equipementsGreenGo(bloc([], ["SPA", "SAUNA"])), {});
    assert.deepEqual(equipementsGreenGo(bloc([], ["SPA", "SAUNA", "JACUZZI", "HAMMAM", "NORDIC_BATH", "ELEVATOR"])), { saunaSpa: "non", ascenseur: "non" });
    assert.deepEqual(equipementsGreenGo(bloc(["ELEVATOR"], ["ELEVATOR"])), { ascenseur: "oui" });
  });

  it("aucun code publié : rien n'est lu", () => {
    assert.equal(equipementsGreenGo(bloc([], [])), null);
    assert.equal(equipementsGreenGo(undefined, null), null);
    assert.equal(lireDetail(NEVA)[0].equipements, undefined);
  });
});

describe("GreenGo : la fiche enrichie, depuis le détail déjà lu", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const DETAIL = JSON.parse(readFileSync(join(dir, "fixtures/greengo-detail-equipements.json"), "utf8"));
  const URL_HOTE = "https://www.greengo.voyage/hote/balcons";

  it("les codes publiés passent par la table ; les inconnus gardent leur libellé, sans clé inventée", () => {
    const [u] = lireDetail(DETAIL);
    const f = ficheGreenGo(u, URL_HOTE)!;
    assert.equal(f.sourceFiche, "greengo");
    assert.match(f.description ?? "", /^Dans notre appartement cosy de 30 m²/);
    const ids = f.equipements.filter((e) => e.present).map((e) => e.id);
    for (const id of ["seche_cheveux", "lave_linge", "seche_linge", "fer", "television", "chauffage", "lave_vaisselle", "wifi", "balcon", "vue", "parking"]) {
      assert.ok(ids.includes(id), id);
    }
    const cafetiere = f.equipements.find((e) => e.libelle === "Coffee maker");
    assert.equal(cafetiere?.id, "autre:coffee maker");
    assert.ok(f.equipements.every((e) => e.present), "le détail ne déclare aucun absent");
  });

  it("un équipement déclaré absent est absent ; la note sans échelle n'est pas une note sur 5", () => {
    const [u] = lireDetail(DETAIL);
    const f = ficheGreenGo({ ...u, codesEquipement: { possedes: ["WIFI"], absents: ["ELEVATOR"] }, note: 4.8, avis: 6 }, URL_HOTE)!;
    assert.deepEqual(
      f.equipements.map((e) => [e.id, e.present]),
      [
        ["wifi", true],
        ["ascenseur", false],
      ],
    );
    assert.deepEqual([f.avis!.noteSur5, f.avis!.noteSource, f.avis!.nombre], [null, 4.8, 6]);
  });

  it("chaque code rangé dans une des douze clés tombe sur une clé de la table, que son filtre retient", () => {
    // Les codes de `CODES_EQUIPEMENT`, un à un, sur le détail réel. TOWELS n'y
    // est pas : « Towels » reste hors table (`autre:towels`), le linge fourni
    // de la table est le linge de lit (SHEETS).
    const [u] = lireDetail(DETAIL);
    const [annonce] = greengoListings(lireRecherche(RECHERCHE).hotes[0], [u], AVORIAZ);
    const fiche = (code: string) => ficheGreenGo({ ...u, description: null, codesEquipement: { possedes: [code], absents: [] } }, URL_HOTE)!;
    const codes = ["BALCONY", "TERRACE", "PATIO", "CHIMNEY", "WOOD_STOVE", "WIFI", "DISHWASHER", "WASHING_MACHINE", "SHEETS"];
    codes.push("FREE_PARKING", "TOLL_PARKING", "SKI_ROOM", "SPA", "SAUNA", "JACUZZI", "HAMMAM", "NORDIC_BATH", "SWIMMING_POOL", "ELEVATOR");
    for (const code of codes) {
      const lus = equipementsGreenGo({ possessedEquipmentsGroupedBySortedCategories: [{ sortedEquipments: [code] }] });
      const [cle] = Object.keys(lus ?? {}) as CleEquipement[];
      assert.ok(cle, code);
      assert.doesNotMatch(fiche(code).equipements[0].id, /^autre:/, code);
      assert.ok(aEquipementDemande({ ...annonce, fiche: fiche(code) }, DEPUIS_CLE[cle]), `${code} → ${DEPUIS_CLE[cle]}`);
    }
    // Spa, hammam, bain nordique : chacun sa clé, sans se fondre dans « Sauna ou spa ».
    assert.deepEqual(
      ["SPA", "HAMMAM", "NORDIC_BATH"].map((c) => fiche(c).equipements[0].id),
      ["spa", "hammam", "bain_nordique"],
    );
  });
});

describe("GreenGo : le détail lu, gardé trente jours, reposé sans requête", () => {
  // La recherche réelle publie Balcons des Trois Cîmes (Morzine), hôte à
  // logement unique ; son détail réel du 6 octobre 2026 publie ses codes.
  const DETAIL = JSON.parse(readFileSync(join(dir, "fixtures/greengo-detail-equipements.json"), "utf8"));
  const hotes = lireRecherche(RECHERCHE_REELLE).hotes;
  const balcons = hotes.find((h) => h.slug === "balcons-des-trois-cimes")!;
  const MARS: LiveSearchInput = { ...AVORIAZ, checkIn: "2027-03-06", checkOut: "2027-03-13" };
  const JOUR = 86_400_000;

  it("un hôte à logement unique : sa fiche et son contenu, sous la clé de son annonce sans détail", () => {
    const avec = greengoListings(balcons, lireDetail(DETAIL), AVORIAZ);
    const [sans] = greengoListings(balcons, null, AVORIAZ);
    const lectures = lecturesAGarder(balcons, avec, AVORIAZ);
    assert.equal(lectures.length, 1);
    const [g] = lectures;
    assert.equal(g.cle, "GreenGo:b5c749ba-02b2-4c18-9027-7163f19994ae");
    assert.equal(g.cle, cleListing(sans));
    // L'annonce détaillée porte le logement : sa clé n'est pas celle de l'hôte.
    assert.equal(cleListing(avec[0]), "GreenGo:906a6d32-c71a-43f3-b36d-e06dec84f9e1");
    assert.equal(g.fiche, avec[0].fiche);
    assert.deepEqual(g.contenu, { description: avec[0].description, amenities: avec[0].amenities });
  });

  it("un établissement, même pur, ne garde rien : son annonce sans détail vaut pour tous ses logements", () => {
    const beauregard = { ...hotes.find((h) => h.slug === "chalet-d-alpage-de-beauregard-1")!, tags: ["GITE_FR"] };
    const annonces = greengoListings(beauregard, lireDetail(DETAIL_BEAUREGARD), AVORIAZ);
    assert.equal(annonces.length, 1, "le chalet de 12");
    assert.equal(greengoListings(beauregard, null, AVORIAZ).length, 1, "pur : une annonce sans détail");
    assert.deepEqual(lecturesAGarder(beauregard, annonces, AVORIAZ), []);
  });

  it("gardé, puis reposé sans requête sur l'annonce sans détail d'un relevé suivant, trente jours", () => {
    const avec = greengoListings(balcons, lireDetail(DETAIL), AVORIAZ);
    const lu = Date.UTC(2026, 9, 6);
    assert.equal(garderLectures(lecturesAGarder(balcons, avec, AVORIAZ), lu), 1);
    // Neuf jours plus tard, autres dates, détail non lu (échéance, refus) :
    // rien que la recherche.
    const [sans] = greengoListings(balcons, null, MARS);
    assert.equal(equipementsDe(sans), null);
    assert.equal(reposerGardees([sans], lu + 9 * JOUR), 1);
    const ids = (l: Listing) => (equipementsDe(l) ?? []).filter((e) => e.present).map((e) => e.id).sort();
    assert.equal(ids(sans).length, 35);
    assert.deepEqual(ids(sans), ids(avec[0]));
    for (const id of ["wifi", "lave_vaisselle", "balcon"]) assert.ok(aEquipement(sans, id), id);
    assert.match(sans.description ?? "", /^Dans notre appartement cosy de 30 m²/);
    // Au-delà de trente jours, rien ; et rien pour un autre hôte.
    const [tard] = greengoListings(balcons, null, MARS);
    assert.equal(reposerGardees([tard], lu + 31 * JOUR), 0);
    const [neva] = greengoListings(hotes.find((h) => h.slug === "neva")!, null, MARS);
    assert.equal(reposerGardees([neva], lu + JOUR), 0);
  });

  it("la capacité et les chambres du détail se notent aussi, et reviennent sans requête au relevé suivant", () => {
    const avec = greengoListings(balcons, lireDetail(DETAIL), AVORIAZ);
    assert.deepEqual([avec[0].capacity, avec[0].bedrooms, avec[0].bedroomsSource], [4, 1, "structured"]);
    const valeurs = valeursAGarder(balcons, avec, AVORIAZ);
    assert.deepEqual(valeurs, [
      { cle: "GreenGo:b5c749ba-02b2-4c18-9027-7163f19994ae", capacity: 4, capacitySource: "structured", bedrooms: 1, bedroomsSource: "structured" },
    ]);
    memoireFiches().noter(valeurs);
    // Autres dates, détail non lu : la recherche seule ne publie pas les chambres.
    const [sans] = greengoListings(balcons, null, MARS);
    reposerGardees([sans]);
    assert.deepEqual([sans.capacity, sans.bedrooms, sans.bedroomsSource], [4, 1, "structured"]);
    // Un établissement ne note rien.
    const beauregard = { ...hotes.find((h) => h.slug === "chalet-d-alpage-de-beauregard-1")!, tags: ["GITE_FR"] };
    assert.deepEqual(valeursAGarder(beauregard, greengoListings(beauregard, lireDetail(DETAIL_BEAUREGARD), AVORIAZ), AVORIAZ), []);
  });
});

describe("GreenGo : la suite de fond des détails, un hôte à la fois, sans nouvel essai", () => {
  // Réponse réelle du 6 octobre 2026 au détail de Balcons des Trois Cîmes, telle quelle.
  const BALCONS: unknown = JSON.parse(readFileSync(join(dir, "fixtures/greengo-detail-equipements.json"), "utf8"));
  const gardes = lireRecherche(RECHERCHE_REELLE).hotes.filter(hoteGarde);
  const parSlug = (slug: string) => gardes.find((h) => h.slug === slug)!;
  const aucun = new Set<string>();
  const hotes = hotesDeSuite(gardes, aucun, aucun, AVORIAZ);
  const SUITE = { max: 24, ecartMs: 12_000 };

  /**
   * Une porte à l'heure simulée : chaque détail répond, dans l'ordre,
   * `reponses` puis le détail réel de Balcons, en 800 ms ; une erreur se lève.
   */
  function porte(reponses: unknown[] = [], p: Partial<PorteSuiteGreenGo> = {}) {
    const horloge = { t: 40_000, derniere: 40_000 };
    const partis: { slug: string; t: number }[] = [];
    const retenus: string[] = [];
    const porte: PorteSuiteGreenGo = {
      lire: async (h) => {
        partis.push({ slug: h.slug, t: horloge.t });
        horloge.t += 800;
        horloge.derniere = horloge.t;
        const r = reponses.length ? reponses.shift() : BALCONS;
        if (r instanceof Error) throw r;
        return r;
      },
      dejaLu: () => false,
      arret: () => null,
      garder: (h, logements) => {
        assert.ok(logements.length > 0);
        retenus.push(h.slug);
      },
      derniere: () => horloge.derniere,
      maintenant: () => horloge.t,
      attendre: async (ms) => {
        horloge.t += ms;
      },
      ...p,
    };
    return { porte, partis, retenus, horloge };
  }

  it("les hôtes à logement unique que la recherche n'a pas lus ; ni un établissement, ni un insolite, ni un détail échoué", () => {
    assert.deepEqual(
      hotes.map((h) => h.slug),
      [
        "balcons-des-trois-cimes",
        "neva",
        "appartement-dans-chalet",
        "chalet-la-rocca",
        "chalet-paradis-blanc-morzine-5",
        "chalet-la-sonnaille",
        "ride-breakfast",
        "chalet-zakopane",
      ],
    );
    // Gardés par la recherche, mais pas par la suite : Beauregard est un
    // établissement (son détail ne garde rien), Mapellet un « insolite » sans
    // annonce sans détail où poser quoi que ce soit.
    assert.equal(cleSansDetail(parSlug("chalet-de-mapellet"), AVORIAZ), null);
    assert.equal(parSlug("chalet-d-alpage-de-beauregard-1").unique, false);
    // Même « pur », un établissement n'entre pas dans la suite.
    const beauregardPur = { ...parSlug("chalet-d-alpage-de-beauregard-1"), tags: ["GITE_FR"] };
    assert.notEqual(cleSansDetail(beauregardPur, AVORIAZ), null);
    assert.deepEqual(hotesDeSuite([beauregardPur], aucun, aucun, AVORIAZ), []);
    const lus = new Map([[parSlug("neva").id, [] as LogementGreenGo[]]]);
    const echoues = new Set([parSlug("chalet-la-rocca").id]);
    const reste = hotesDeSuite(gardes, lus, echoues, AVORIAZ).map((h) => h.slug);
    assert.equal(reste.length, 6);
    assert.ok(!reste.includes("neva") && !reste.includes("chalet-la-rocca"));
  });

  it("un détail à la fois, douze secondes au moins après la requête précédente vers GreenGo, recherche comprise ; au plus `max`", async () => {
    const e = porte();
    const r = await lireSuiteGreenGo(hotes, e.porte, { ...SUITE, max: 3 });
    assert.deepEqual(
      e.partis.map((x) => x.slug),
      ["balcons-des-trois-cimes", "neva", "appartement-dans-chalet"],
    );
    // La dernière requête de la recherche a fini à 40 s.
    assert.equal(e.partis[0].t, 52_000);
    for (let k = 1; k < e.partis.length; k++) assert.ok(e.partis[k].t - (e.partis[k - 1].t + 800) >= 12_000);
    assert.deepEqual(e.retenus, ["balcons-des-trois-cimes", "neva", "appartement-dans-chalet"]);
    assert.deepEqual([r.lus, r.demandes, r.arret], [3, 3, "3 détails demandés"]);
  });

  it("un refus arrête tout, sans nouvel essai ; une panne aussi", async () => {
    const refus = porte([BALCONS, new ArretGreenGo("HTTP 429 — pause 45 s")]);
    const r = await lireSuiteGreenGo(hotes, refus.porte, SUITE);
    assert.deepEqual(
      refus.partis.map((x) => x.slug),
      ["balcons-des-trois-cimes", "neva"],
    );
    assert.deepEqual(refus.retenus, ["balcons-des-trois-cimes"]);
    assert.equal(r.arret, "neva : HTTP 429 — pause 45 s");
    const panne = porte([new Error("HTTP 500")]);
    const r2 = await lireSuiteGreenGo(hotes, panne.porte, SUITE);
    assert.equal(panne.partis.length, 1);
    assert.deepEqual(panne.retenus, []);
    assert.equal(r2.arret, "balcons-des-trois-cimes : HTTP 500");
  });

  it("cède à une nouvelle recherche pendant l'attente de son tour : rien ne part plus", async () => {
    let generation = 1;
    const e = porte([], { arret: () => (generation !== 1 ? "une nouvelle recherche est partie" : null) });
    e.porte.attendre = async (ms) => {
      e.horloge.t += ms;
      // Une recherche part cinq secondes après le premier détail.
      if (e.partis.length === 1 && e.horloge.t >= e.partis[0].t + 5_000) generation = 2;
    };
    const r = await lireSuiteGreenGo(hotes, e.porte, SUITE);
    assert.deepEqual(
      e.partis.map((x) => x.slug),
      ["balcons-des-trois-cimes"],
    );
    assert.deepEqual([r.lus, r.demandes, r.arret], [1, 1, "une nouvelle recherche est partie"]);
    // Cédée dans la seconde : elle ne retient pas l'hôte jusqu'à la fin de son écart.
    assert.ok(e.horloge.t - e.partis[0].t <= 6_000);
  });

  it("un hôte déjà lu ou gardé ne part pas, et ne compte pas dans le plafond", async () => {
    const e = porte([], { dejaLu: (h) => h.slug !== "chalet-la-sonnaille" && h.slug !== "chalet-zakopane" });
    const r = await lireSuiteGreenGo(hotes, e.porte, { ...SUITE, max: 2 });
    assert.deepEqual(
      e.partis.map((x) => x.slug),
      ["chalet-la-sonnaille", "chalet-zakopane"],
    );
    assert.deepEqual([r.lus, r.demandes, r.arret], [2, 2, null]);
  });

  it("une réponse sans logement n'est pas gardée, et arrête", async () => {
    const e = porte([{ data: { publicAdverts: { hostingAdvert: null } } }]);
    const r = await lireSuiteGreenGo(hotes, e.porte, SUITE);
    assert.deepEqual(e.retenus, []);
    assert.equal(r.arret, "balcons-des-trois-cimes : la réponse ne publie aucun logement");
  });
});

describe("GreenGo : la lecture d'un détail notée trente jours", () => {
  const neva = lireRecherche(RECHERCHE).hotes[0];

  it("ses valeurs et la lecture, sous la clé de l'annonce sans détail ; la lecture même sans annonce gardée", () => {
    const avec = greengoListings(neva, lireDetail(NEVA), AVORIAZ);
    const notes = notesDuDetail(neva, avec, AVORIAZ);
    const cle = cleSansDetail(neva, AVORIAZ);
    assert.equal(cle, "GreenGo:e86b77f8-bb8c-4af0-826a-8150eb501d50");
    assert.deepEqual(notes, [
      { cle, capacity: 4, capacitySource: "structured", bedrooms: 1, bedroomsSource: "structured", lue: true },
    ]);
    // Non réservable à ces dates : pas d'annonce, rien à garder, mais le détail a été lu.
    const ferme = greengoListings(neva, lireDetail(NEVA).map((u) => ({ ...u, reservable: false })), AVORIAZ);
    assert.deepEqual(ferme, []);
    assert.deepEqual(notesDuDetail(neva, ferme, AVORIAZ), [{ cle, lue: true }]);
    // Noté, il se lit lu : la suite de fond ne le redemande pas.
    memoireFiches().noter(notes);
    assert.equal(memoireFiches().lire(cle)?.lue, true);
  });

  it("rien pour un établissement, ni pour un hôte sans annonce sans détail", () => {
    const hotes = lireRecherche(RECHERCHE_REELLE).hotes;
    const beauregard = { ...hotes.find((h) => h.slug === "chalet-d-alpage-de-beauregard-1")!, tags: ["GITE_FR"] };
    assert.deepEqual(notesDuDetail(beauregard, greengoListings(beauregard, lireDetail(DETAIL_BEAUREGARD), AVORIAZ), AVORIAZ), []);
    const mapellet = hotes.find((h) => h.slug === "chalet-de-mapellet")!;
    assert.deepEqual(notesDuDetail(mapellet, [], AVORIAZ), []);
  });
});

describe("GreenGo : la suite de fond ne part qu'après une recherche arrêtée faute de temps", () => {
  const gardes = lireRecherche(RECHERCHE_REELLE).hotes.filter(hoteGarde);

  it("sans raison, sur l'échéance, sur le limiteur local, ou au-delà des plus proches : elle part", () => {
    assert.equal(suiteALancer(undefined, 0), true);
    assert.equal(suiteALancer("échéance", 0), true);
    assert.equal(suiteALancer("limiteur local (2 s à attendre)", 0), true);
    assert.equal(suiteALancer("4 hôtes au-delà des 60 lus en détail", 0), true);
  });

  it("jamais après un refus ni pendant sa pause", () => {
    for (const raison of [
      "HTTP 429 — pause 45 s",
      "HTTP 403 — pause 45 s",
      "HTTP 503 — pause 120 s",
      "pause après un refus (40 s à attendre)",
    ]) {
      assert.equal(suiteALancer(raison, 0), false, raison);
    }
  });

  it("jamais après des détails en panne, même servis en 2xx : un défi AWS WAF en 202 s'y lit comme une panne", async () => {
    // Ce que `graphql` lève sur un défi servi en 202 : la page HTML ne se lit pas en JSON.
    const defi = await new Response("<html>challenge</html>", {
      status: 202,
      headers: { "x-amzn-waf-action": "challenge" },
    })
      .json()
      .then(
        () => null,
        (err: unknown) => err,
      );
    assert.ok(defi instanceof Error);
    const enSerie = await detailler(gardes, async () => {
      throw defi;
    });
    assert.match(enSerie.raison ?? "", /is not valid JSON \(2 hôtes de suite\)$/);
    assert.equal(suiteALancer(enSerie.raison, enSerie.echecs), false);
    // Un seul détail en panne, puis l'échéance : la suite ne part pas davantage.
    const reponses: Array<Error | LogementGreenGo[]> = [new Error("HTTP 500"), [], new ArretGreenGo("échéance")];
    const puisEcheance = await detailler(gardes, async () => {
      const r = reponses.shift();
      if (r instanceof Error) throw r;
      return r ?? [];
    });
    assert.deepEqual([puisEcheance.raison, puisEcheance.echecs, puisEcheance.details.size], ["échéance", 1, 1]);
    assert.equal(suiteALancer(puisEcheance.raison, puisEcheance.echecs), false);
    // Et le compte des détails illisibles que pose le relevé, sans autre raison.
    assert.equal(suiteALancer("1 détail illisible", 1), false);
  });

  it("jamais après une page de recherche en panne", () => {
    for (const raison of [
      "HTTP 500",
      "GraphQL : Cannot query field \"x\" on type \"Query\".",
      `Unexpected token '<', "<html>chal"... is not valid JSON`,
      "The operation was aborted due to timeout",
    ]) {
      assert.equal(suiteALancer(raison, 0), false, raison);
    }
  });
});
