import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { useParcours } from "./parcours.ts";

describe("magasin de parcours", () => {
  it("« Tout retirer » ne touche pas au budget", () => {
    // Le budget est un critère de logement : aucun jeton ne le montre sur
    // l'accueil ni sur Comparer, les deux écrans qui portent ce bouton. Il y
    // disparaissait sans que rien ne l'ait annoncé.
    const P = useParcours.getState();
    P.setFilters({ budget: 2400, v: 1800 });
    P.setQ("chamonix");
    useParcours.getState().resetFilters();
    const apres = useParcours.getState();
    assert.equal(apres.filters.budget, 2400);
    assert.equal(apres.filters.v, 0);
    assert.equal(apres.q, "");
    assert.equal(apres.massif, null);
    useParcours.getState().setFilters({ budget: 0 });
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
