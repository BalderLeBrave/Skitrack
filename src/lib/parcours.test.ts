import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { migrerParcours, PARCOURS_VERSION, useParcours } from "./parcours.ts";
import { stationById } from "./stations.ts";

describe("magasin de parcours", () => {
  it("« Tout retirer » ne touche pas au budget", () => {
    // Le budget est un critère de logement : aucun jeton ne le montre sur
    // l'accueil ni sur Comparer, les deux écrans qui portent ce bouton. Il y
    // disparaissait sans que rien ne l'ait annoncé.
    const P = useParcours.getState();
    P.setFilters({ budget: [0, 2400], v: [1800, 2400] });
    P.setQ("chamonix");
    useParcours.getState().resetFilters();
    const apres = useParcours.getState();
    assert.deepEqual(apres.filters.budget, [0, 2400]);
    assert.equal(apres.filters.v, null);
    assert.equal(apres.q, "");
    assert.equal(apres.massif, null);
    useParcours.getState().setFilters({ budget: null });
  });

  it("« Tout retirer » relâche la station : le champ et l'intention vont ensemble", () => {
    // Le champ destination porte le nom de la station retenue : le vider sans
    // relâcher la station laissait les étapes 2 et 3 ouvertes sans que rien ne
    // les nomme, et l'accueil annonçant les logements d'une station invisible.
    const P = useParcours.getState();
    P.setDestination({ id: "tignes", name: "Tignes" });
    useParcours.setState({ lodgeId: "abc", booked: true });
    useParcours.getState().resetFilters();
    const apres = useParcours.getState();
    assert.equal(apres.q, "");
    assert.equal(apres.stationId, null);
    assert.equal(apres.lodgeId, null);
    assert.equal(apres.booked, false);
  });

  it("changer de destination relâche le logement retenu", () => {
    const P = useParcours.getState();
    P.setDestination({ id: "tignes", name: "Tignes" });
    useParcours.setState({ lodgeId: "abc", booked: true });
    useParcours.getState().setDestination({ id: "avoriaz", name: "Avoriaz" });
    const apres = useParcours.getState();
    assert.equal(apres.stationId, "avoriaz");
    assert.equal(apres.lodgeId, null);
    assert.equal(apres.booked, false);
    useParcours.getState().setDestination(null);
  });
});

describe("état persisté : migration", () => {
  it("version 2 → 3 : station, comparaison et colonne cochée passent par les identifiants retirés", () => {
    // Sous Node, sans `localStorage`, zustand n'attache pas l'API `persist` :
    // on éprouve la fonction que le magasin lui passe.
    assert.equal(PARCOURS_VERSION, 4);
    // Une comparaison enregistrée avant le 26 septembre 2026. Sans migration,
    // « praloup-04226 » montrait une colonne Praloup que la liste ne cochait
    // pas, et la cocher en ajoutait une seconde.
    const v2 = {
      stationId: "espace-aubrac",
      q: "Espace Aubrac",
      lodgeId: "airbnb:123",
      cmp: ["praloup-04226", "tignes", "praloup", "lus-la-croix-haute"],
      pick: "praloup-04226",
      seen: { "airbnb:123": true, "booking:9": true },
      booked: true,
      sortKey: "hi",
    };
    const v3 = migrerParcours(v2, 2);
    assert.equal(v3.stationId, "laguiole");
    // La version 4 donne au tri son sens de départ.
    assert.equal(v3.sortDir, -1);
    // Le champ nomme la station que la loupe ouvrira.
    assert.equal(v3.q, stationById("laguiole")!.name);
    // Doublons retirés, ordre gardé.
    assert.deepEqual(v3.cmp, ["praloup", "tignes", "lus-la-jarjatte"]);
    assert.equal(v3.pick, "praloup");
    // Annonce retenue et annonces vues portent des identifiants d'annonce :
    // rien à réécrire. Le reste passe tel quel.
    assert.equal(v3.lodgeId, "airbnb:123");
    assert.deepEqual(v3.seen, v2.seen);
    assert.equal(v3.booked, true);
    assert.equal(v3.sortKey, "hi");
    // L'entrée d'origine n'est pas modifiée en place.
    assert.equal(v2.stationId, "espace-aubrac");
  });

  it("version 2 → 3 : un état sans identifiant retiré ne change pas", () => {
    const v2 = {
      stationId: "tignes",
      q: "Tignes",
      cmp: ["tignes", "val-disere"],
      pick: "val-disere",
      seen: {},
    };
    assert.deepEqual(migrerParcours(v2, 2), { ...v2, sortDir: -1 });
    // Un identifiant inconnu reste tel quel : `stationById` dira qu'il n'existe
    // pas, la migration n'en invente pas.
    assert.deepEqual(migrerParcours({ cmp: ["station-inventee"] }, 2).cmp, ["station-inventee"]);
    // Un état vide ou absent reste lisible.
    assert.deepEqual(migrerParcours(undefined, 3), { sortDir: -1 });
  });

  it("version 1 → 3 : la station retenue est relâchée, la comparaison est réécrite", () => {
    const v3 = migrerParcours(
      {
        stationId: "praloup-04226",
        lodgeId: "x",
        booked: true,
        cmp: ["espace-aubrac", "laguiole"],
      },
      1,
    );
    assert.equal(v3.stationId, null);
    assert.equal(v3.lodgeId, null);
    assert.equal(v3.booked, false);
    assert.deepEqual(v3.cmp, ["laguiole"]);
  });

  it("version 3 → 4 : chaque seuil devient la fourchette qui retient les mêmes stations", () => {
    const v3 = {
      unit: "n",
      sortKey: "pass",
      filters: {
        v: 1800,
        lo: 0,
        hi: 3000,
        km: 300,
        pass: 350,
        budget: 2500,
        dom: "Paradiski",
        col: { green: 20, blue: 0, red: 0, black: 5 },
        chips: { glacier: true },
      },
    };
    const v4 = migrerParcours(v3, 3);
    assert.deepEqual(v4.filters, {
      // Au moins : jusqu'au bout de l'échelle, qui veut dire « et plus ».
      v: [1800, 2400],
      lo: null,
      hi: [3000, 3500],
      km: [300, 600],
      // Au plus : depuis zéro.
      pass: [0, 350],
      budget: [0, 2500],
      dom: "Paradiski",
      // Les couleurs dans l'échelle de leur unité, ici les tronçons.
      col: { green: [20, 200], blue: null, red: null, black: [5, 200] },
      chips: { glacier: true },
    });
    // Le forfait se triait du moins cher au plus cher : il le reste.
    assert.equal(v4.sortDir, 1);
    // Un seuil hors de l'échelle ne filtre plus rien plutôt que d'inventer.
    const hors = migrerParcours({ filters: { budget: 9000, v: "x" } }, 3);
    assert.equal((hors.filters as { budget: unknown }).budget, null);
    assert.equal((hors.filters as { v: unknown }).v, null);
  });
});
