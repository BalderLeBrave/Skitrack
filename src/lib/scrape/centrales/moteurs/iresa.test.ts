import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { corpsIresa, dateIresa, jetonIresa, lireIresa, nuitsIresa, prestationsIresa } from "./iresa.ts";

/**
 * Relevé du 13 septembre 2026 sur `lesarcs-reservation.com`, sept nuits à huit
 * personnes du 6 au 13 février 2027.
 *
 * Les deux premières fiches viennent de cette recherche. La troisième est
 * construite à l'image de ce que le moteur rend quand la durée demandée n'est
 * pas vendue : une fiche de son catalogue non daté, durée un, trente-neuf euros
 * la nuit en dortoir. C'est le piège que ce moteur tend, et le test est là pour
 * qu'on ne retombe pas dedans. La quatrième est construite elle aussi : une
 * fiche bien datée mais sans montant, qui porte un `montant_valeur_promo` non
 * nul — le champ dont le connecteur fabriquait un « remisé depuis X € ».
 *
 * Les antislashs du gabarit sont doublés : dans un littéral de gabarit, un
 * antislash est une échappée, et sans cela le JSON cesse d'être du JSON.
 */
const PAGE = `
<script type="application/json" id="__datasPrestations">[
 {
  "template": "<div class=\\"ListItem-content\\" data-prestation-iresa-id=\\"1063\\" data-prestation-hebergement-iresa-id=\\"1059\\"> <img class=\\"swiper-lazy\\" src=\\"/sites/default/files/styles/thumbnail_list/public/externals/c494b678e47d23d23cb44f62f57e9530.jpg?itok=-nLiF2BZ\\" alt=\\"\\"/> <a class=\\"__js-linkTitle\\" href=\\"/chalet-darentasia-gentianes-appartement-3-pieces-8-personnes?package=1063\\" title=\\"Chalet Darentasia Gentianes - Appartement 3 pièces 8 personnes\\" target=\\"_blank\\">",
  "datas": {
   "id": "74",
   "id_prestation_hebergement": 1059,
   "name": "Chalet Darentasia Gentianes - Appartement 3 pièces 8 personnes",
   "prix_total": 1911,
   "prix_brut": 1911,
   "montant_valeur_promo": 0,
   "cap_max": "8",
   "duree": 7,
   "date_debut": "2027-02-06",
   "lieu": "Montrigon"
  }
 },
 {
  "template": "<div class=\\"ListItem-content\\" data-prestation-iresa-id=\\"1211\\" data-prestation-hebergement-iresa-id=\\"3257\\"> <img class=\\"swiper-lazy\\" src=\\"/sites/default/files/styles/thumbnail_list/public/externals/5dbfbe3bfe2ad65f884dbe3b6575390a.jpg?itok=RPuxcx8S\\" alt=\\"Pièce de vie avec un canapé convertible / Living room with a sofa bed for 2\\"/> <a class=\\"__js-linkTitle\\" href=\\"/residence-les-trois-arcs-appartement-3-pieces-cabine-6-8-personnes-ndeg-420-0?package=1211\\" title=\\"Résidence Les Trois Arcs - Appartement 3 pièces cabine 6/8 personnes n° 420\\" target=\\"_blank\\">",
  "datas": {
   "id": "1009",
   "id_prestation_hebergement": 3257,
   "name": "Résidence Les Trois Arcs - Appartement 3 pièces cabine 6/8 personnes n° 420",
   "prix_total": 2400,
   "prix_brut": 2400,
   "montant_valeur_promo": 0,
   "cap_max": "8",
   "duree": 7,
   "date_debut": "2027-02-06",
   "lieu": "Arc 1600"
  }
 },
 {
  "template": "",
  "datas": {
   "id": "9001",
   "id_prestation_hebergement": "9001",
   "name": "1 lit dans un dortoir de 10",
   "prix_total": 39,
   "cap_max": 1,
   "duree": 1,
   "date_debut": "2026-09-19",
   "lieu": "Bourg-Saint-Maurice"
  }
 },
 {
  "template": "",
  "datas": {
   "id": "9002",
   "id_prestation_hebergement": "9002",
   "name": "Chalet des Glaciers - 4 pièces 8 personnes",
   "prix_total": 0,
   "montant_valeur_promo": 150,
   "cap_max": "8",
   "duree": 7,
   "date_debut": "2027-02-06",
   "lieu": "Arc 1800"
  }
 }
]</script>
`;

const DEMANDE = { checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 };

describe("iResa : ne garder que ce qui répond à la question posée", () => {
  it("écarte le catalogue non daté que le moteur rend en secours", () => {
    // Quand la durée demandée n'est pas vendue, iResa ne rend pas une liste
    // vide : il rend six cents fiches aux prix unitaires. Les prendre pour des
    // séjours mettrait des nuitées à trente-neuf euros en tête du comparatif.
    assert.equal(prestationsIresa(PAGE).length, 4);
    const fiches = lireIresa(PAGE, DEMANDE);
    assert.equal(fiches.length, 3);
    assert.ok(!fiches.some((f) => f.total === 39), "la nuitée de dortoir ne doit pas passer");
  });

  it("une fiche datée sans montant sort quand même, à zéro", () => {
    // La durée et la date de début sont les bonnes : la centrale répond bien
    // pour ces dates-là. L'absence de montant est un renseignement, et la
    // supprimer n'en est pas un.
    const f = lireIresa(PAGE, DEMANDE).find((x) => x.id === "9002");
    assert.equal(f?.total, 0);
    assert.equal(f?.capacite, 8);
    assert.equal(f?.nuits, 7);
  });

  it("aucun prix barré n'est fabriqué à partir de la promo", () => {
    // `montant_valeur_promo` vaut zéro sur tout le relevé, et rien ne dit de
    // quoi il est le montant. Le connecteur l'ajoutait au total pour annoncer
    // « remisé depuis 150 € » : une déduction présentée comme une lecture.
    const fiches = lireIresa(PAGE, DEMANDE);
    for (const f of fiches) {
      assert.equal("avantRemise" in f, false, `${f.titre} porte encore un avant-remise`);
    }
  });

  it("une durée qui ne correspond pas ne rend rien du tout", () => {
    // Même page, autre question : aucune fiche ne porte quatorze nuits.
    const autres = lireIresa(PAGE, { checkIn: "2027-02-06", checkOut: "2027-02-20", guests: 8 });
    assert.deepEqual(autres, []);
  });

  it("une date de début qui ne correspond pas ne rend rien non plus", () => {
    const ailleurs = lireIresa(PAGE, { checkIn: "2027-03-06", checkOut: "2027-03-13", guests: 8 });
    assert.deepEqual(ailleurs, []);
  });

  it("lit le prix, la capacité et le lieu", () => {
    // La fiche est choisie par son identifiant, et non par « la moins chère » :
    // une fiche sans montant sort désormais à zéro, et zéro n'est pas un prix.
    const f = lireIresa(PAGE, DEMANDE).find((x) => x.id === "1059");
    assert.equal(f?.total, 1911);
    assert.equal(f?.capacite, 8);
    assert.equal(f?.nuits, 7);
    assert.ok(typeof f?.lieu === "string" && f.lieu.length > 0);
  });

  it("la demande porte la durée en nuits et la date sans zéro de tête", () => {
    // `fakeDateDebut` et `fakeDuree` sont les champs qui commandent ;
    // `filters[date]` n'est que l'affichage du sélecteur.
    const c = corpsIresa(DEMANDE, "form-abc123");
    assert.equal(c.fakeDateDebut, "2027-2-6");
    assert.equal(c.fakeDuree, "7");
    assert.equal(c["filters[nombre_personne]"], "8");
    assert.equal(c.form_build_id, "form-abc123");
    assert.equal(dateIresa("2027-02-06"), "2027-2-6");
    assert.equal(nuitsIresa("2027-02-06", "2027-02-13"), 7);
  });

  it("le jeton se lit dans le formulaire, il ne se fabrique pas", () => {
    assert.equal(jetonIresa('<input name="form_build_id" value="form-xYz" />'), "form-xYz");
    assert.equal(jetonIresa('{"form_build_id":"form-Json"}'), "form-Json");
    assert.equal(jetonIresa("<p>rien ici</p>"), null);
  });

  it("prend la vignette et le lien dans le gabarit, pas dans les données", () => {
    // `datas.photos` donne des chemins bruts qui répondent 404 : le site ne
    // sert ses images que par des dérivés signés, dont le nom est un condensé
    // et le jeton une signature. Ni l'un ni l'autre ne se reconstruit.
    const f = lireIresa(PAGE, DEMANDE).find((x) => x.total === 1911);
    assert.match(f?.photo ?? "", /^\/sites\/default\/files\/styles\//);
    assert.match(f?.chemin ?? "", /^\/chalet-darentasia-gentianes[a-z0-9-]*\?package=\d+$/);
  });

  it("une page sans bloc de données ne fait rien exploser", () => {
    assert.deepEqual(prestationsIresa("<html></html>"), []);
    assert.deepEqual(lireIresa("<html></html>", DEMANDE), []);
  });
});
