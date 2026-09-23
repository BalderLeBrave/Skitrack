import { test } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "@/lib/listings";
import { clePlateforme, fusionner } from "./fusion.ts";

function annonce(p: Partial<Listing> & Pick<Listing, "id" | "source">): Listing {
  return {
    stationId: "val-thorens",
    title: "Appartement",
    total: 0,
    currency: "EUR",
    guests: null,
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

test("clé Booking : seulement un identifiant d'hôtel numérique", () => {
  assert.equal(clePlateforme(annonce({ id: "bk-1", source: "Booking", platformId: "4521" })), "booking:4521");
  assert.equal(clePlateforme(annonce({ id: "bk-1", source: "Booking", platformId: "https://x" })), null);
  assert.equal(clePlateforme(annonce({ id: "abr-1", source: "Abritel", platformId: "4521" })), null);
});

test("un bien des deux côtés : une seule fiche, celle de Cozy, comblée par le direct", () => {
  const cozy = annonce({
    id: "bk-cozy-1",
    source: "Booking",
    platformId: "4521",
    total: 1800,
    guests: 4,
    photo: "https://cozy/p.jpg",
    proven: "CozyCozy Booking live",
  });
  const direct = annonce({
    id: "bk-4521",
    source: "Booking",
    platformId: "4521",
    total: 1750,
    guests: 6,
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
  assert.equal(l.guests, 4, "la capacité publiée par Cozy n'est pas écrasée");
  assert.equal(l.lat, 45.3);
  assert.equal(l.bedrooms, 2);
  assert.match(l.proven, /complété par le relevé direct/);
  assert.equal(cozy.lat, null, "l'annonce d'origine n'est pas mutée");
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
