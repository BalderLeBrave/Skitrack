import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { raccorder, type DomaineMonde, type StationARaccorder } from "./raccordement.ts";

const station = (patch: Partial<StationARaccorder>): StationARaccorder => ({
  id: "s",
  name: "Station",
  domain: null,
  lat: 46,
  lon: 6.5,
  ...patch,
});

/** Un point à `km` kilomètres au nord de (46, 6.5). */
const aNord = (km: number) => ({ lat: 46 + km / 111.2, lon: 6.5 });

describe("raccordement d'une station au référentiel Monde", () => {
  it("le nom du domaine l'emporte sur un voisin plus proche (Mégevette)", () => {
    const domaines: DomaineMonde[] = [
      { id: "fr-massif-des-brasses", nom: "Massif des Brasses", ...aNord(3.4) },
      { id: "fr-hirmentaz-les-haberes", nom: "Hirmentaz - Les Habères", ...aNord(4.5) },
    ];
    const r = raccorder(
      station({ name: "Mégevette", domain: "Hirmentaz - Les Habères" }),
      domaines,
    );
    assert.equal(r?.id, "fr-hirmentaz-les-haberes");
    assert.equal(r?.par, "domaine");
  });

  it("le nom de la station se retrouve dans celui de la fiche, abréviations comprises", () => {
    const domaines: DomaineMonde[] = [
      {
        id: "fr-la-pierre-saint-martin",
        nom: "La Pierre Saint-Martin, San Martingo Harria",
        ...aNord(3),
      },
    ];
    const r = raccorder(station({ name: "La Pierre St Martin" }), domaines);
    assert.equal(r?.id, "fr-la-pierre-saint-martin");
    assert.equal(r?.par, "nom");
  });

  it("une fiche sans grille cède la place à la même station décrite avec une grille (Orcières)", () => {
    const domaines: DomaineMonde[] = [
      { id: "fr-orcieres-merlette", nom: "Orcières Merlette", ...aNord(2.1) },
      { id: "fr-orcieres", nom: "Orcières", ...aNord(0.2) },
    ];
    const s = station({ name: "Orcières Merlette", domain: "Orcières Merlette" });
    assert.equal(raccorder(s, domaines)?.id, "fr-orcieres-merlette");
    const r = raccorder(s, domaines, (id) => id === "fr-orcieres");
    assert.equal(r?.id, "fr-orcieres");
    assert.equal(r?.par, "proximite");
  });

  it("sans fiche avec grille, la fiche trouvée est rendue quand même, pour le rapport", () => {
    const domaines: DomaineMonde[] = [{ id: "fr-ventron", nom: "Ventron", ...aNord(1.5) }];
    assert.equal(
      raccorder(station({ name: "Ventron", domain: "Ventron" }), domaines, () => false)?.id,
      "fr-ventron",
    );
  });

  it("rien au-delà des rayons : pas de grille empruntée au voisin", () => {
    const domaines: DomaineMonde[] = [
      { id: "fr-la-clusaz", nom: "La Clusaz", ...aNord(4.9) },
      { id: "fr-loin", nom: "Station", ...aNord(12) },
      { id: "fr-domaine-loin", nom: "Grand Domaine", ...aNord(30) },
    ];
    assert.equal(raccorder(station({ name: "Saint Jean de Sixt" }), domaines), null);
    assert.equal(raccorder(station({ name: "Station" }), domaines), null);
    assert.equal(raccorder(station({ name: "Autre", domain: "Grand Domaine" }), domaines), null);
  });

  it("une station sans coordonnées n'est raccordée à rien", () => {
    assert.equal(
      raccorder(station({ lat: Number.NaN }), [{ id: "x", nom: "Station", ...aNord(0) }]),
      null,
    );
  });
});
