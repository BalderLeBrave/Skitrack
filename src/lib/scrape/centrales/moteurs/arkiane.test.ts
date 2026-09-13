import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  corpsArkiane,
  dateArkiane,
  fragmentsArkiane,
  lireArkiane,
  titreArkiane,
} from "./arkiane.ts";

/**
 * Relevé du 13 septembre 2026 sur `reservationpralognan.locvacances.com`, pour
 * huit personnes.
 *
 * Les deux premières cartes viennent d'une recherche du 6 au 13 février 2027,
 * la troisième d'une recherche sans dates. Chacune est réduite aux éléments que
 * l'analyseur touche, mais leur balisage est celui de la centrale : la légende
 * d'image collée devant le nom, le libellé tronqué par des points de
 * suspension, l'espace insécable des milliers, et le marqueur « à partir de »
 * qui ne paraît que sans dates.
 */
const PAGE = `
<div class="card availability">
  <div class="availability-catcher text-wrap"> Photos non contractuelles APPARTEMENT 3 PIECES - Capacité 7/8 personnes - 4* 57… </div>
  <li data-name="lot_pax" title="Nb Pers."><span class=" unit">8&nbsp;Pers.</span></li>
  <li data-name="lib_imme_station" title="Station">Pralognan la Vanoise</li>
  <a href="https://reservationpralognan.locvacances.com/lv/images/lot/0000000194_01.jpg?20220823112034" data-index=1 data-thumb="https://reservationpralognan.locvacances.com/lv/images/lot/0000000194_01_s.jpg?20220823112034" title="BCT1" data-caption=" - " itemprop="contentUrl" data-size="754x416">
  <input type="checkbox" name="compare" id="compare-194" value="BCT1" />
  <div class="availability-rates rates ml-auto"> <div class="mr-2"> <del class="before">3&#160;269 €</del> </div> <div class="rate"> 2&#160;778,65 € </div> </div>
  <form action="/fr-FR/Lot/Detail" id="form-availability-194" method="post" name="form-availability-194">
</div>
<div class="card availability">
  <div class="availability-catcher"> Appartement 3 pi&#232;ces 7/8 personnes </div>
  <li data-name="lot_pax" title="Nb Pers."><span class=" unit">8&nbsp;Pers.</span></li>
  <li data-name="lib_imme_station" title="Station">Pralognan la Vanoise</li>
  <a href="https://reservationpralognan.locvacances.com/lv/images/lot/0000000186_01.jpg?20220823111839" data-index=10 data-thumb="https://reservationpralognan.locvacances.com/lv/images/lot/0000000186_01_s.jpg?20220823111839" title="BCT" data-caption=" - " itemprop="contentUrl" data-size="754x416">
  <input type="checkbox" name="compare" id="compare-186" value="BCT" />
  <div class="availability-rates rates ml-auto"> <div class="mr-2"> <del class="before">3&#160;269 €</del> </div> <div class="rate"> 2&#160;778,65 € </div> </div>
  <form action="/fr-FR/Lot/Detail" id="form-availability-186" method="post" name="form-availability-186">
</div>
<div class="card availability">
  <div class="availability-catcher text-wrap"> DUPLEX 4 PIECES 8 PERS - Capacité 8 personnes 120m2, 2ème et 3ème étage, sur 2… </div>
  <li data-name="lot_pax" title="Nb Pers."><span class=" unit">8&nbsp;Pers.</span></li>
  <li data-name="lib_imme_station" title="Station">Pralognan la Vanoise</li>
  <a href="https://reservationpralognan.locvacances.com/lv/images/lot/0000000468_01.jpg?20231213151019" data-index=1 data-thumb="https://reservationpralognan.locvacances.com/lv/images/lot/0000000468_01_s.jpg?20231213151019" title="CHAUMIERE4" data-caption=" - " itemprop="contentUrl" data-size="1920x1440">
  <input type="checkbox" name="compare" id="compare-468" value="CHAUMIERE4" />
  <div class="availability-rates rates ml-auto"> <div class="rate"> <span class="price_from_to">À partir de <span>1 050 €</span> / sem.</span> </div> </div>
  <form action="/fr-FR/Lot/Detail" id="form-availability-468" method="post" name="form-availability-468">
</div>
`;

describe("Arkiane : lire une recherche datée", () => {
  const fiches = lireArkiane(PAGE);

  it("écarte les cartes qui portent encore « à partir de »", () => {
    // C'est la garantie que le prix rendu est daté, et elle est lisible dans le
    // HTML lui-même : ce marqueur ne paraît que quand la centrale n'a pas de
    // dates, et le nombre qui l'accompagne est un tarif hebdomadaire d'appel.
    assert.equal(fragmentsArkiane(PAGE).length, 3, "trois cartes dans la page");
    assert.equal(fiches.length, 2, "mais une porte le marqueur et tombe");
  });

  it("lit le montant malgré l'espace insécable des milliers", () => {
    const bct = fiches.find((f) => f.reference === "BCT1");
    assert.equal(bct?.total, 2778.65);
  });

  it("garde le prix barré quand la centrale en affiche un", () => {
    const bct = fiches.find((f) => f.reference === "BCT1");
    assert.equal(bct?.avantRemise, 3269);
    assert.ok(bct != null && bct.avantRemise != null && bct.avantRemise > bct.total);
  });

  it("lit la capacité et la station dans leurs champs structurés", () => {
    const bct = fiches.find((f) => f.reference === "BCT1");
    assert.equal(bct?.capacite, 8);
    assert.equal(bct?.commune, "Pralognan la Vanoise");
  });

  it("nettoie le titre de ce qui n'en fait pas partie", () => {
    // La légende d'image se colle devant le nom, et la centrale tronque les
    // longs libellés, ce qui laisse un bout de nombre orphelin à la fin.
    assert.equal(
      titreArkiane("Photos non contractuelles APPARTEMENT 3 PIECES - Capacité 7/8 personnes - 4* 57…"),
      "APPARTEMENT 3 PIECES - Capacité 7/8 personnes - 4*",
    );
    assert.equal(titreArkiane("Appartement 3 pièces 7/8 personnes"), "Appartement 3 pièces 7/8 personnes");
    const bct = fiches.find((f) => f.reference === "BCT1");
    assert.ok(!bct?.titre.includes("Photos"), bct?.titre);
    assert.ok(!bct?.titre.endsWith("…"), bct?.titre);
  });

  it("prend la photo du logement, pas un pictogramme d'équipement", () => {
    // Les pictogrammes vivent sous `/Images/`, que le robots.txt de l'hôte
    // ferme. Les photos, elles, sont sous `/lv/images/lot/`.
    for (const f of fiches) {
      if (f.photo) assert.match(f.photo, /\/lv\/images\/lot\//);
    }
  });

  it("la demande porte les dates dans le corps, jamais dans l'adresse", () => {
    // C'est ce qui met cette centrale hors d'atteinte des motifs robots.txt en
    // « /*? » : il n'y a pas de chaîne de requête à réordonner.
    const c = corpsArkiane({ checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 });
    assert.equal(c.startDate, "06/02/2027");
    assert.equal(c.endDate, "13/02/2027");
    assert.equal(c.selectedCriteria, "lot_pax|8");
    assert.equal(dateArkiane("2027-02-06"), "06/02/2027");
    assert.equal(dateArkiane("pas une date"), "pas une date");
  });
});
