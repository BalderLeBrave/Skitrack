import { test } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "@/lib/listings";
import { equipements } from "../stay/equipements.ts";
import { clePlateforme, fusionner } from "./fusion.ts";

function annonce(p: Partial<Listing> & Pick<Listing, "id" | "source">): Listing {
  return {
    stationId: "val-thorens",
    title: "Appartement",
    total: 0,
    currency: "EUR",
    capacity: null,
    bedrooms: null,
    available: true,
    photo: null,
    url: null,
    lat: null,
    lon: null,
    proven: "test",
    ...p,
  };
}

test("clé Airbnb : le numéro de chambre de l'URL, à défaut platformId", () => {
  assert.equal(
    clePlateforme(annonce({ id: "abnb-9", source: "Airbnb", url: "https://www.airbnb.fr/rooms/12468894?check_in=x" })),
    "airbnb:12468894",
  );
  assert.equal(clePlateforme(annonce({ id: "abnb-9", source: "Airbnb", platformId: "777" })), "airbnb:777");
  assert.equal(clePlateforme(annonce({ id: "abnb-9", source: "Airbnb" })), null);
});

test("clé Booking : le slug de la page, sinon le numéro d'hôtel", () => {
  assert.equal(
    clePlateforme(
      annonce({
        id: "bk-cozy",
        source: "Booking",
        platformId: "999",
        url: "https://www.booking.com/hotel/fr/Chalet-Neige.fr.html?checkin=2027-02-06",
      }),
    ),
    "booking:chalet-neige",
  );
  assert.equal(
    clePlateforme(
      annonce({
        id: "bk-4521",
        source: "Booking",
        platformId: "4521",
        url: "https://www.booking.com/hotel/fr/chalet-neige.html",
      }),
    ),
    "booking:chalet-neige",
  );
  assert.equal(clePlateforme(annonce({ id: "bk-1", source: "Booking", platformId: "4521" })), "booking:4521");
  assert.equal(clePlateforme(annonce({ id: "bk-1", source: "Booking", platformId: "https://x" })), null);
  assert.equal(clePlateforme(annonce({ id: "abr-1", source: "Abritel", platformId: "4521" })), null);
});

test("deux Booking au même slug : une seule fiche, celle de Cozy", () => {
  const cozy = annonce({
    id: "bk-cozy-9",
    source: "Booking",
    url: "https://www.booking.com/hotel/fr/chalet-neige.fr.html?label=x",
    total: 1800,
    proven: "CozyCozy Booking live",
  });
  const direct = annonce({
    id: "bk-55",
    source: "Booking",
    platformId: "55",
    url: "https://www.booking.com/hotel/fr/chalet-neige.html?checkin=2027-02-06",
    lat: 45.01,
    lon: 6.12,
    total: 1700,
    proven: "booking live",
  });
  const f = fusionner([cozy], [direct]);
  assert.equal(f.listings.length, 1);
  assert.equal(f.communes, 1);
  assert.equal(f.ajoutees, 0);
  assert.equal(f.listings[0].id, "bk-cozy-9");
  assert.equal(f.listings[0].lat, 45.01);
  assert.equal(f.listings[0].total, 1800);
});

test("un bien des deux côtés : une seule fiche, celle de Cozy, comblée par le direct", () => {
  const cozy = annonce({
    id: "bk-cozy-1",
    source: "Booking",
    platformId: "4521",
    total: 1800,
    capacity: 4,
    photo: "https://cozy/p.jpg",
    proven: "CozyCozy Booking live",
  });
  const direct = annonce({
    id: "bk-4521",
    source: "Booking",
    platformId: "4521",
    total: 1750,
    capacity: 6,
    lat: 45.3,
    lon: 6.58,
    bedrooms: 2,
  });
  const f = fusionner([cozy], [direct]);
  assert.equal(f.listings.length, 1);
  assert.equal(f.communes, 1);
  assert.equal(f.ajoutees, 0);
  const [l] = f.listings;
  assert.equal(l.id, "bk-cozy-1");
  assert.equal(l.total, 1800, "le prix publié par Cozy n'est pas écrasé");
  assert.equal(l.capacity, 4, "la capacité publiée par Cozy n'est pas écrasée");
  assert.equal(l.lat, 45.3);
  assert.equal(l.bedrooms, 2);
  assert.match(l.proven, /complété par le relevé direct/);
  assert.equal(cozy.lat, null, "l'annonce d'origine n'est pas mutée");
});

test("le contenu du direct (description, équipements, note, fiche) comble une fiche Cozy qui le tait", () => {
  const inconnus = equipements({})!;
  const lus = equipements({ wifi: "oui", parking: "oui" })!;
  const fiche = { description: "Chalet", equipements: [{ id: "wifi", libelle: "Wifi", present: true }], avis: null, conditions: null, sourceFiche: "booking" as const };
  const cozy = annonce({ id: "bk-c", source: "Booking", platformId: "7", description: "  ", amenities: inconnus, reviewCount: 0 });
  const direct = annonce({
    id: "bk-7",
    source: "Booking",
    platformId: "7",
    description: "Au pied des pistes",
    amenities: lus,
    rating: 9.1,
    reviewCount: 37,
    fiche,
  });
  const [l] = fusionner([cozy], [direct]).listings;
  assert.equal(l.description, "Au pied des pistes", "une description blanche ne masque pas celle du direct");
  assert.deepEqual(l.amenities, lus, "des équipements tous « inconnu » ne masquent pas ceux du direct");
  assert.equal(l.fiche, fiche);
  // Cozy publie un nombre d'avis (0) : la paire du direct n'est pas reprise à moitié.
  assert.equal(l.rating, undefined);
  assert.equal(l.reviewCount, 0);

  const [m] = fusionner([{ ...cozy, reviewCount: undefined }], [direct]).listings;
  assert.equal(m.rating, 9.1);
  assert.equal(m.reviewCount, 37);
});

test("ce que Cozy publie de son contenu reste le sien", () => {
  const sienne = { description: null, equipements: [], avis: null, conditions: null, sourceFiche: "booking" as const, indisponible: false };
  const cozy = annonce({ id: "bk-c", source: "Booking", platformId: "8", description: "Vue Cozy", amenities: equipements({ balcon: "oui" })!, rating: 8, reviewCount: 3, fiche: sienne });
  const direct = annonce({
    id: "bk-8",
    source: "Booking",
    platformId: "8",
    description: "Vue directe",
    amenities: equipements({ wifi: "oui" })!,
    rating: 9.5,
    reviewCount: 40,
    fiche: { ...sienne, description: "autre" },
  });
  const [l] = fusionner([cozy], [direct]).listings;
  assert.equal(l.description, "Vue Cozy");
  assert.equal(l.amenities?.find((e) => e.cle === "balcon")?.valeur, "oui");
  assert.equal(l.rating, 8);
  assert.equal(l.reviewCount, 3);
  assert.equal(l.fiche, sienne);
  // Une fiche indisponible côté Cozy ne dit rien : celle du direct la remplace.
  const [m] = fusionner([{ ...cozy, fiche: { ...sienne, indisponible: true } }], [direct]).listings;
  assert.equal(m.fiche?.description, "autre");
});

test("un prix non publié par Cozy est repris du direct, avec sa devise", () => {
  const cozy = annonce({ id: "abnb-c", source: "Airbnb", url: "https://www.airbnb.fr/rooms/5", total: 0 });
  const direct = annonce({ id: "abnb-5", source: "Airbnb", platformId: "5", total: 2100, currency: "CHF" });
  const [l] = fusionner([cozy], [direct]).listings;
  assert.equal(l.total, 2100);
  assert.equal(l.currency, "CHF");
});

test("les biens vus seulement en direct s'ajoutent, sans doublon", () => {
  const cozy = [annonce({ id: "abnb-a", source: "Airbnb", url: "https://www.airbnb.fr/rooms/1" })];
  const direct = [
    annonce({ id: "abnb-1", source: "Airbnb", platformId: "1" }),
    annonce({ id: "abnb-2", source: "Airbnb", platformId: "2" }),
    annonce({ id: "abnb-2b", source: "Airbnb", platformId: "2" }),
  ];
  const f = fusionner(cozy, direct);
  assert.deepEqual(
    f.listings.map((l) => l.id),
    ["abnb-a", "abnb-2"],
  );
  assert.equal(f.ajoutees, 1);
  assert.equal(f.communes, 1);
});

test("sans clé sûre, rien n'est fusionné : un doublon visible plutôt qu'un bien perdu", () => {
  const cozy = [annonce({ id: "bk-x", source: "Booking" })];
  const direct = [annonce({ id: "bk-y", source: "Booking" })];
  assert.equal(fusionner(cozy, direct).listings.length, 2);
});

test("sans direct, Cozy passe tel quel ; sans Cozy, le direct aussi", () => {
  const a = [annonce({ id: "bk-1", source: "Booking", platformId: "1" })];
  assert.deepEqual(fusionner(a, []).listings, a);
  assert.deepEqual(fusionner([], a).listings, a);
});

test("la galerie la plus longue l'emporte : trois vignettes Cozy contre une tuile directe plus fournie", () => {
  const vignettes = ["https://cozy/1.jpg", "https://cozy/2.jpg", "https://cozy/3.jpg"];
  const cozy = annonce({ id: "abnb-1", source: "Airbnb", platformId: "42", photo: vignettes[0], photos: vignettes });
  const tuile = ["https://abnb/1.jpg", "https://abnb/2.jpg", "https://abnb/3.jpg", "https://abnb/4.jpg", "https://abnb/5.jpg"];
  const direct = annonce({ id: "42", source: "Airbnb", platformId: "42", photo: tuile[0], photos: tuile });
  const [l] = fusionner([cozy], [direct]).listings;
  assert.equal(l.id, "abnb-1");
  assert.equal(l.photo, tuile[0]);
  assert.deepEqual(l.photos, tuile);
  // Une tuile moins fournie ne remplace pas la galerie Cozy.
  const courte = annonce({ id: "42", source: "Airbnb", platformId: "42", photo: tuile[0], photos: [tuile[0]] });
  const [m] = fusionner([cozy], [courte]).listings;
  assert.deepEqual(m.photos, vignettes);
});
