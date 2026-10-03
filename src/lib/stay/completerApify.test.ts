import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import type { FicheApify } from "../scrape/apify/airbnbApify.ts";
import { completerParApify, manquesAirbnb, poserApify, type PorteApify } from "./completerApify.server.ts";

const SEJOUR = { checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 6 };

function airbnb(p: Partial<Listing> = {}): Listing {
  return {
    id: "abnb-41701345",
    stationId: "les-2-alpes",
    source: "Airbnb",
    title: "Appartement au pied des pistes",
    total: 1200,
    currency: "EUR",
    capacity: null,
    bedrooms: null,
    available: true,
    photo: "https://a0.muscache.com/x.jpg",
    url: "https://www.airbnb.fr/rooms/41701345",
    lat: 45.01,
    lon: 6.12,
    proven: "pyairbnb live 2027-02-06→2027-02-13",
    pdpLue: true,
    ...p,
  };
}

const fiche = (p: Partial<FicheApify> = {}): FicheApify => ({
  id: "41701345",
  capacity: 6,
  bedrooms: 2,
  beds: 3,
  lat: 45.02,
  lon: 6.13,
  photo: "https://a0.muscache.com/a.jpg",
  photos: ["https://a0.muscache.com/a.jpg"],
  total: 1500,
  priceLabel: "1 500 € au total",
  ...p,
});

function porte(connues: Record<string, FicheApify | null> = {}): PorteApify & { demandes: string[] } {
  const demandes: string[] = [];
  return {
    demandes,
    sejour: () => SEJOUR,
    fiche: (id) => (id in connues ? connues[id] : undefined),
    demander: (_s, _j, ids) => {
      demandes.push(...ids);
      return ids.length;
    },
  };
}

describe("Apify : poser ce qu'il a rendu", () => {
  it("comble capacité et chambres, garde le point, la photo et le prix de l'annonce, et le dit", () => {
    const row = airbnb();
    assert.equal(poserApify(row, fiche()), true);
    assert.deepEqual([row.capacity, row.bedrooms, row.beds, row.lat, row.total, row.photo], [6, 2, 3, 45.01, 1200, "https://a0.muscache.com/x.jpg"]);
    assert.match(row.proven, /Apify \(capacité, chambres\)/);
  });

  it("le point, la photo et le prix seulement s'ils manquent", () => {
    const row = airbnb({ capacity: 4, bedrooms: 1, lat: null, lon: null, photo: null, total: 0 });
    poserApify(row, fiche());
    assert.deepEqual([row.capacity, row.lat, row.gpsSource, row.photo, row.total], [4, 45.02, "apify", "https://a0.muscache.com/a.jpg", 1500]);
    assert.match(row.proven, /Apify \(GPS, photo, prix\)/);
  });
});

describe("Apify : quelles annonces lui demander", () => {
  it("une annonce Airbnb incomplète dont la page est lue, une fois", () => {
    const p = porte();
    const r = completerParApify([airbnb()], p);
    assert.deepEqual([r.posees, r.demandees, p.demandes], [0, 1, ["41701345"]]);
  });

  it("ni une annonce complète, ni une page pas encore lue (sauf refus d'Airbnb), ni une autre source", () => {
    const p = porte();
    completerParApify(
      [
        airbnb({ capacity: 6, bedrooms: 2 }),
        airbnb({ id: "abnb-2", url: "https://www.airbnb.fr/rooms/22222222", pdpLue: false }),
        airbnb({ id: "bk-1", source: "Booking", url: "https://www.booking.com/hotel/fr/x.html" }),
      ],
      p,
    );
    assert.deepEqual(p.demandes, []);
    completerParApify([airbnb({ id: "abnb-2", url: "https://www.airbnb.fr/rooms/22222222", pdpLue: false })], p, true);
    assert.deepEqual(p.demandes, ["22222222"]);
  });

  it("ce qu'Apify a déjà rendu se pose sans rien redemander ; son silence non plus ne se redemande pas", () => {
    const p = porte({ "41701345": fiche(), "33333333": null });
    const rows = [airbnb(), airbnb({ id: "abnb-3", url: "https://www.airbnb.fr/rooms/33333333" })];
    const r = completerParApify(rows, p);
    assert.deepEqual([r.posees, r.demandees, rows[0].capacity], [1, 0, 6]);
    assert.equal(manquesAirbnb(rows[1]).length > 0, true);
  });
});
