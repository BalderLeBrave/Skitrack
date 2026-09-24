import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emprise,
  greengoListings,
  lienHote,
  lireDetail,
  lireRecherche,
  requeteDetail,
  requeteRecherche,
  type HoteGreenGo,
} from "./greengo.ts";
import type { LiveSearchInput } from "./types.ts";

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

// Formes relevées le 24 septembre 2026 (recherche minimale et détail de Néva).
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
    name: "Néva",
    maxNumberOfTravellers: 4,
    numberOfBedrooms: 1,
    totalNumberOfBeds: 2,
    numberOfBathrooms: 1,
    orderedImageNormalizedPaths: ["accommmodation/ordered_images/img_3651.jpeg"],
    bookingPricing: { __typename: "BookingPricing", totalPrice: { forStayRounded: 2649, forStayUnrounded: "2648.80" } },
    nonbookableReasons: [],
  },
});

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

  it("des dates illisibles n'entrent pas dans la requête", () => {
    assert.throws(() => requeteRecherche({ ...AVORIAZ, checkIn: '2027-02-06"){x}' }, 6, 0));
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
      nom: "Néva",
      slug: "neva",
      lieu: "Morzine",
      lat: 46.1922,
      lon: 6.7714,
      photos: ["https://images.greengo.voyage/canonical/accommmodation/ordered_images/img_3663.jpeg"],
      minParNuit: 378,
    });
  });

  it("le détail rend le total exact du séjour, tout compris", () => {
    const [u] = lireDetail(NEVA);
    assert.equal(u.total, 2649);
    assert.equal(u.capacite, 4);
    assert.equal(u.chambres, 1);
    assert.equal(u.reservable, true);
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

describe("GreenGo : annonces", () => {
  const hote: HoteGreenGo = lireRecherche(RECHERCHE).hotes[0];

  it("un logement réservable devient une annonce datée, avec son lien", () => {
    const [l] = greengoListings(hote, lireDetail(NEVA), AVORIAZ);
    assert.equal(l.source, "GreenGo");
    assert.equal(l.id, "gg-1bcc24b4-b278-4bf7-a77c-e3246c9ec4d2");
    assert.equal(l.title, "Néva");
    assert.equal(l.total, 2649);
    assert.equal(l.guests, 4);
    assert.equal(l.lat, 46.1922);
    assert.equal(l.url, "https://www.greengo.voyage/hote/neva?checkIn=2027-02-06&checkOut=2027-02-13&numberOfAdults=2");
    assert.equal(l.photo, "https://images.greengo.voyage/canonical/accommmodation/ordered_images/img_3651.jpeg");
  });

  it("un logement non réservable aux dates n'est pas une offre", () => {
    const listings = greengoListings(
      { ...hote, nom: "Chalet Cannelle" },
      [
        { id: "a", nom: "Studio", capacite: 2, chambres: 0, lits: 1, sdb: 1, photos: [], total: 928, reservable: true },
        { id: "b", nom: "Chalet", capacite: 8, chambres: 4, lits: 8, sdb: 2, photos: [], total: null, reservable: false },
      ],
      AVORIAZ,
    );
    assert.deepEqual(
      listings.map((l) => [l.id, l.title]),
      [["gg-a", "Chalet Cannelle — Studio"]],
    );
  });

  it("détail non lu : l'hôte reste, prix non publié, « à partir de » dit comme tel", () => {
    const [l] = greengoListings(hote, null, AVORIAZ);
    assert.equal(l.total, 0);
    assert.equal(l.priceIndicative, true);
    assert.equal(l.priceLabel, "dès 378 € la nuit");
    assert.equal(l.id, "gg-e86b77f8-bb8c-4af0-826a-8150eb501d50");
  });

  it("le lien de l'hôte porte les dates et les voyageurs", () => {
    assert.equal(
      lienHote("gites-la-patte-nordic", { ...AVORIAZ, guests: 4 }),
      "https://www.greengo.voyage/hote/gites-la-patte-nordic?checkIn=2027-02-06&checkOut=2027-02-13&numberOfAdults=4",
    );
  });
});
