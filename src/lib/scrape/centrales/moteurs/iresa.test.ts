import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  corpsIresa,
  dateIresa,
  horsRegleIresa,
  jetonIresa,
  lireIresa,
  nuitsIresa,
  prestationsIresa,
  produitsIresa,
} from "./iresa.ts";

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

/**
 * Relevé du 25 septembre 2026 sur `lesarcs-reservation.com`, sept nuits à
 * quatre personnes du 6 au 13 février 2027 : deux prestations, réduites aux
 * clés que l'analyseur lit (la description, les équipements, les photos brutes
 * et le détail des lits sont ôtés), et le gabarit réduit à l'en-tête, la
 * vignette et le lien. Puis leurs deux entrées de `__productsData`, dans le
 * même ordre, réduites au nom et à la catégorie.
 */
const PAGE_CATEGORIES = `
<script type="application/json" id="__datasPrestations">[
 {
  "template": "<div class=\\"ListItem-header\\" data-prestation-iresa-id=\\"3605\\" data-prestation-hebergement-iresa-id=\\"2387\\"> <img class=\\"swiper-lazy\\" src=\\"/sites/default/files/styles/thumbnail_list/public/externals/db1eb8d6bd09c7729ceb232cdb08beab.jpg?itok=DVyVZix2\\" alt=\\"\\"/> <a class=\\"__js-linkTitle\\" href=\\"/residence-le-rochefort-appartement-2-pieces-cabine-4-personnes-ndeg309?package=3605\\" title=\\"Résidence Le Rochefort - appartement 2 pièces cabine 4 personnes n°309\\" target=\\"_blank\\">",
  "datas": {
   "id": "1061",
   "id_prestation_hebergement": 2387,
   "name": "Résidence Le Rochefort - appartement 2 pièces cabine 4 personnes n°309",
   "prix_total": 701,
   "prix_brut": 701,
   "cap_max": "4",
   "duree": 7,
   "date_debut": "2027-02-06",
   "lieu": "Bourg-Saint-Maurice"
  }
 },
 {
  "template": "<div class=\\"ListItem-header\\" data-prestation-iresa-id=\\"263\\" data-prestation-hebergement-iresa-id=\\"3389\\"> <img class=\\"swiper-lazy\\" src=\\"/sites/default/files/styles/thumbnail_list/public/externals/db8a7c8883bcc552fdf301d150b20860.jpg?itok=rlfmtpGt\\" alt=\\"\\"/> <a class=\\"__js-linkTitle\\" href=\\"/residence-pierra-menta-studio-4-5-personnes-ndeg-737?package=263\\" title=\\"Résidence Pierra Menta - Studio 4/5 personnes n° 737\\" target=\\"_blank\\">",
  "datas": {
   "id": "1018",
   "id_prestation_hebergement": 3389,
   "name": "Résidence Pierra Menta - Studio 4/5 personnes n° 737",
   "prix_total": 950,
   "prix_brut": 950,
   "cap_max": "5",
   "duree": 7,
   "date_debut": "2027-02-06",
   "lieu": "le Charvet"
  }
 }
]</script>
<script id="__productsData" type="application/json">[
 {
  "item_name": "Résidence Le Rochefort - appartement 2 pièces cabine 4 personnes n°309",
  "item_category": "Appartments, studios"
 },
 {
  "item_name": "Résidence Pierra Menta - Studio 4/5 personnes n° 737",
  "item_category": "Appartments, studios"
 }
]</script>`;

const DEMANDE_4 = { checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 4 };

describe("iResa : la catégorie publiée, et la règle du propriétaire", () => {
  it("lit la catégorie de l'entrée de même rang et de même nom", () => {
    assert.deepEqual(produitsIresa(PAGE_CATEGORIES), [
      {
        nom: "Résidence Le Rochefort - appartement 2 pièces cabine 4 personnes n°309",
        categorie: "Appartments, studios",
      },
      {
        nom: "Résidence Pierra Menta - Studio 4/5 personnes n° 737",
        categorie: "Appartments, studios",
      },
    ]);
    const fiches = lireIresa(PAGE_CATEGORIES, DEMANDE_4);
    assert.equal(fiches.length, 2);
    for (const f of fiches) assert.equal(f.categorie, "Appartments, studios");
    assert.equal(fiches.find((f) => f.id === "2387")?.capacite, 4);
  });

  it("une entrée d'un autre nom ne prête pas sa catégorie", () => {
    // Si les deux listes se décalaient, la catégorie serait celle d'un voisin.
    const decale = PAGE_CATEGORIES.replace(
      '"item_name": "Résidence Pierra Menta - Studio 4/5 personnes n° 737"',
      '"item_name": "Autre chose"',
    );
    const f = lireIresa(decale, DEMANDE_4).find((x) => x.id === "3389");
    assert.equal(f?.categorie, null);
  });

  it("sans __productsData, aucune catégorie, et l'ancien gabarit se lit comme avant", () => {
    for (const f of lireIresa(PAGE, DEMANDE)) assert.equal(f.categorie, null);
    assert.deepEqual(produitsIresa("<html></html>"), []);
  });

  it("garde « Appartments, studios » ; une fiche sans catégorie n'est pas jugée", () => {
    for (const f of lireIresa(PAGE_CATEGORIES, DEMANDE_4)) assert.equal(horsRegleIresa(f), null);
    assert.equal(horsRegleIresa({ categorie: null }), null);
    // Construit : aucune autre catégorie n'a été relevée, la règle est celle de
    // `regleTypes.ts`.
    assert.equal(horsRegleIresa({ categorie: "Hôtels" }), "hôtel");
    // Une catégorie inconnue est gardée ; le connecteur la nomme au journal.
    assert.equal(horsRegleIresa({ categorie: "Lofts" }), null);
  });
});
