import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArretGreenGo,
  OPERATION_DETAIL,
  OPERATION_RECHERCHE,
  detailler,
  emprise,
  greengoListings,
  hoteGarde,
  hotePur,
  lienHote,
  lireDetail,
  lireRecherche,
  logementGarde,
  requeteDetail,
  requeteRecherche,
  type HoteGreenGo,
  type LogementGreenGo,
} from "./greengo.ts";
import type { LiveSearchInput } from "./types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
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
    assert.match(requeteDetail(AVORIAZ, "neva"), /fragment Logement on AccommodationPublicSlice \{ id currentProductSlug name accommodationType /);
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
    assert.equal(l.guests, 4);
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
      listings.map((l) => [l.title, l.propertyType, l.guests, l.bedrooms, l.total]),
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
    assert.equal(l.guests, 4);
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
