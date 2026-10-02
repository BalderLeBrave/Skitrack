import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { capaciteDesCouchages } from "./couchages.ts";

describe("capacité : la somme des couchages décrits, chacun chiffré", () => {
  it("additionne lits superposés et canapé à sa largeur (La Daille)", () => {
    assert.equal(
      capaciteDesCouchages("Couchages : Entrée : 2 lits superposés Séjour : Canapé convertible 140X190 Sanitaire : Salle de bains"),
      4,
    );
  });

  it("lit les places écrites : « 1 lit 2 pers. », « 3 lits 1 pers. »", () => {
    assert.equal(
      capaciteDesCouchages("3 chambres (1 lit 2 pers.140x190 / 1 lit 2 pers.160 x 200 / 3 lits 1 pers. dont 2 superposés)"),
      7,
    );
    assert.equal(capaciteDesCouchages("studio (1 lit 2 personnes + 1 canapé-lit 1 personne), Wifi"), 3);
  });

  it("lit « N x M lits 1 personne superposés » (critère Ingénie, Risoul)", () => {
    assert.equal(capaciteDesCouchages("Coin montagne ouvert : 1 x 2 lits 1 personne superposés"), 2);
  });

  it("lit les types en anglais : full, queen, twin", () => {
    assert.equal(capaciteDesCouchages("five bedrooms, including four full beds and one queen bed"), 10);
    assert.equal(capaciteDesCouchages("two twin beds"), 2);
  });

  it("ne calcule rien quand un couchage n'est pas chiffré", () => {
    assert.equal(capaciteDesCouchages("1 chambre double (possibilité de twin) - 1 canapé-lit dans le salon"), null);
    assert.equal(capaciteDesCouchages("Séjour : canapé gigogne/TV Chambre : 1 lit double (140 x 200)"), null);
  });

  it("ne compte ni lit bébé, ni lits faits, ni draps", () => {
    assert.equal(
      capaciteDesCouchages("- 1 Chambre avec un lit double 140x200 - 1 Chambre avec deux lits doubles 140x200 - lits faits à l'arrivée - lit bébé sur demande"),
      6,
    );
    assert.equal(capaciteDesCouchages("Location de draps petit lit (10.90€) grand lit (12.90€) à réserver"), null);
  });

  it("des lits qui valent pour chaque chambre : rien", () => {
    assert.equal(capaciteDesCouchages("Salon (2 lits gigognes 1 personne.), 2 chambres (1 lit 2 personnes)."), null);
    assert.equal(capaciteDesCouchages("3 chambres avec chacune un lit double"), null);
    assert.equal(capaciteDesCouchages("3 chambres (1 lit 2 pers. / 1 lit 2 pers. / 2 lits 1 pers.)"), 6);
  });

  it("descriptif Ingénie : entités décodées, chambres « avec grand lit » et cabines sans lit : rien (Courchevel)", () => {
    assert.equal(
      capaciteDesCouchages("&bull; 2 chambres avec grand lit et 2 chambres cabines (sans fen&ecirc;tre) &bull; 3 salles de douche"),
      null,
    );
    assert.equal(capaciteDesCouchages("Chambre : 1 lit 2 personnes &ndash; S&eacute;jour : 1 canap&eacute; convertible 2 places"), 4);
  });

  it("un pluriel sans nombre ne se compte pas ; une liste d'équipements exige des nombres (Orcières)", () => {
    assert.equal(capaciteDesCouchages("Chambre : lit double. Coin montagne : lits superposés"), null);
    assert.equal(capaciteDesCouchages("Lit 140 cm . Lit 90 cm", { compteExige: true }), null);
    assert.equal(capaciteDesCouchages("Lit 140 cm . Lit 90 cm"), 3);
    assert.equal(capaciteDesCouchages("1 x 2 lits 1 personne superposés", { compteExige: true }), 2);
  });

  it("rien sans couchage", () => {
    assert.equal(capaciteDesCouchages("Bel appartement au pied des pistes"), null);
    assert.equal(capaciteDesCouchages(null), null);
  });
});
