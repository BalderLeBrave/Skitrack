import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adresseDetailArkiane,
  ARKIANE_LOCATIONS,
  ARKIANE_PAR_PAGE,
  corpsArkiane,
  dateArkiane,
  estDetailArkiane,
  fragmentsArkiane,
  horsRegleArkiane,
  lireArkiane,
  lireDetailArkiane,
  titreArkiane,
  typeEcarteArkiane,
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

  it("garde le libellé entier que le titre perd en route", () => {
    // La centrale tronque elle-même ses longs libellés : « - 4* 57… », où 4*
    // est le classement et 57 le début d'une surface. Le titre s'arrête avant,
    // parce qu'un titre qui finit par « 57… » est une erreur d'affichage ; le
    // texte publié, lui, est gardé entier.
    const bct = fiches.find((f) => f.reference === "BCT1");
    assert.ok(bct?.libelle.includes("4*"), bct?.libelle);
    assert.ok(bct?.libelle.endsWith("57…"), bct?.libelle);
    assert.ok(!bct?.titre.includes("57…"), bct?.titre);
  });

  it("la pagination se demande, et cinquante est la taille d'une page", () => {
    // `skip` était figé à un : le relevé s'arrêtait à la première page sans que
    // rien ne dise que cinquante lots suffisent.
    assert.equal(
      corpsArkiane({ checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 }).get("skip"),
      "1",
    );
    assert.equal(
      corpsArkiane({ checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 }, 3).get("skip"),
      "3",
    );
    assert.equal(
      corpsArkiane({ checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 }).get("take"),
      String(ARKIANE_PAR_PAGE),
    );
  });

  it("un bloc de tarif dont le montant ne se lit pas ne jette pas la carte", () => {
    // Le bloc est là : la carte est bien dans une réponse datée. Zéro dit que
    // le montant manque, et l'annonce reste.
    const muet = PAGE.replace(/<div class="rate"> 2&#160;778,65 € <\/div>/, '<div class="rate"> </div>');
    const f = lireArkiane(muet).find((x) => x.reference === "BCT1");
    assert.equal(f?.total, 0);
    assert.equal(f?.capacite, 8);
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
    // Les pictogrammes vivent sous `/Images/` (Disallow dans le robots.txt).
    // Les photos, elles, sont sous `/lv/images/lot/`.
    for (const f of fiches) {
      if (f.photo) assert.match(f.photo, /\/lv\/images\/lot\//);
    }
  });

  it("la demande porte les dates dans le corps, jamais dans l'adresse", () => {
    // Les dates voyagent dans le corps : pas de chaîne de requête, donc
    // rien à apparier aux motifs `/*?` du robots.txt. On le lit, on extrait.
    const c = corpsArkiane({ checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 });
    assert.equal(c.get("startDate"), "06/02/2027");
    assert.equal(c.get("endDate"), "13/02/2027");
    assert.equal(c.getAll("selectedCriteria")[0], "lot_pax|8");
    assert.equal(dateArkiane("2027-02-06"), "06/02/2027");
    assert.equal(dateArkiane("pas une date"), "pas une date");
  });
});

/**
 * Relevé du 25 septembre 2026 sur `reservationpralognan.locvacances.com`,
 * recherche du 6 au 13 février 2027 à quatre personnes.
 *
 * Deux cartes réelles (lots 184 et 179), réduites à ce que l'analyseur touche :
 * libellé, critères, photo, référence, tarif et formulaire de détail, balisage
 * de la centrale compris (espace finale des dates, apostrophe typographique).
 */
const PAGE_2026 = `
<div class="card availability">
  <a href="https://reservationpralognan.locvacances.com/lv/images/lot/0000000184_01.jpg?20260504104638" data-index=146 data-thumb="https://reservationpralognan.locvacances.com/lv/images/lot/0000000184_01_s.jpg?20260504104638" title="ALPROC12" data-caption=" - " itemprop="contentUrl" data-size="1920x1280">
  <div class="availability-catcher"> Appartement 2 pi&#232;ces mezz 6 personnes </div>
  <li data-name="lib_imme_station" title="Station">Pralognan la Vanoise</li><li data-name="lib_lot_type_cial" title="Type d’hébergement">2 pièces</li><li data-name="lot_pax" title="Nb Pers."><span class=" unit">4&nbsp;Pers.</span></li>
  <input type="checkbox" name="compare" id="compare-184" value="ALPROC12" /><label class="label checkbox" for="compare-184">&nbsp;Comparer</label>
  <form action="/fr-FR/Lot/Detail" id="form-availability-184" method="post" name="form-availability-184"> <input type="hidden" name="lot_no" value="184" /> <input type="hidden" name="comm_no" value="101" /> <input type="hidden" name="comm_type" value="DEFAUT" /> <input data-val="true" data-val-date="Le champ Arrivée doit être une date." id="startDateFor184" name="startDate" type="hidden" value="06/02/2027 " /><input data-val="true" data-val-date="Le champ Départ doit être une date." id="endDateFor184" name="endDate" type="hidden" value="13/02/2027 " /> <button type="submit" class="button" data-loader style="height:auto !important;padding:3px;"> <i class="fal fa-angle-double-right fa-2x"></i> </button> </form>
  <div class="availability-rates rates ml-auto"> <div class="rate"> 1&#160;150 € </div> </div>
</div>
<div class="card availability">
  <a href="https://reservationpralognan.locvacances.com/lv/images/lot/0000000179_01.jpg?20220322161545" data-index=42 data-thumb="https://reservationpralognan.locvacances.com/lv/images/lot/0000000179_01_s.jpg?20220322161545" title="AMONT5C" data-caption=" - " itemprop="contentUrl" data-size="1920x1440">
  <div class="availability-catcher"> Studio cabine 4 personnes </div>
  <li data-name="lib_imme_station" title="Station">Pralognan la Vanoise</li><li data-name="lib_lot_type_cial" title="Type d’hébergement">Studio</li><li data-name="lot_pax" title="Nb Pers."><span class=" unit">4&nbsp;Pers.</span></li>
  <input type="checkbox" name="compare" id="compare-179" value="AMONT5C" /><label class="label checkbox" for="compare-179">&nbsp;Comparer</label>
  <form action="/fr-FR/Lot/Detail" id="form-availability-179" method="post" name="form-availability-179"> <input type="hidden" name="lot_no" value="179" /> <input type="hidden" name="comm_no" value="101" /> <input type="hidden" name="comm_type" value="DEFAUT" /> <input data-val="true" data-val-date="Le champ Arrivée doit être une date." id="startDateFor179" name="startDate" type="hidden" value="06/02/2027 " /><input data-val="true" data-val-date="Le champ Départ doit être une date." id="endDateFor179" name="endDate" type="hidden" value="13/02/2027 " /> <button type="submit" class="button" data-loader style="height:auto !important;padding:3px;"> <i class="fal fa-angle-double-right fa-2x"></i> </button> </form>
  <div class="availability-rates rates ml-auto"> <div class="rate"> 700 € </div> </div>
</div>
`;

/** Les quatre pavés d'un détail, dans le balisage de la centrale. */
function paves(pieces: string, personnes: string, surface: string, chambres: string): string {
  const pave = (icone: string, texte: string) =>
    `<div class="details d-flex justify-content-center align-self-center flex-column"> <div class="fal fa-${icone} fa-3x text-center d-xl-block d-none"></div> <div class="fal fa-${icone} fa-2x text-center d-block d-xl-none"></div> <div class="font-weight-bold text-center mt-2">${texte}</div> </div>`;
  return `<div class="d-flex flex-row justify-content-start flex-wrap"> ${pave("home", pieces)} ${pave("users", personnes)} ${pave("ruler-triangle", surface)} ${pave("bed", chambres)} </div>`;
}

/**
 * Trois réponses réelles de `POST /fr-FR/Lot/Detail`, du même relevé, réduites
 * à l'en-tête, au quartier, aux pavés, à la description (lot 810) et au bloc de
 * localisation. Textes et entités tels que la centrale les écrit.
 */
const DETAIL_179 = `
<div class="result-header-container"> <div class="availability-listing-properties">
<h3 class="font-weight-bold"><em class="text-secondary">Pralognan La Vanoise</em> / <em class="text-secondary">Le Plan</em></h3>
${paves("1 pi&#232;ce", "4 personnes", "27 m&#178;", "0 chambre")}
<div id="location" class="collapse"> <a href="https://www.google.com/maps/search/?api=1&amp;query=45.38069,6.716458&amp;z=16" target="_blank"><i class="fal fa-map-marked-alt fa-3x"></i> Localiser ce bien</a> </div>
</div></div>`;
const DETAIL_184 = `
<div class="result-header-container"> <div class="availability-listing-properties">
<h3 class="font-weight-bold"><em class="text-secondary">Pralognan La Vanoise</em> / <em class="text-secondary">Le Plan</em></h3>
${paves("2 pi&#232;ces", "4 personnes", "35 m&#178;", "1 chambre")}
<div id="location" class="collapse"> <a href="https://www.google.com/maps/search/?api=1&amp;query=45.383434,6.716356&amp;z=16" target="_blank"><i class="fal fa-map-marked-alt fa-3x"></i> Localiser ce bien</a> </div>
</div></div>`;
const DETAIL_810 = `
<div class="result-header-container"> <div class="availability-listing-properties">
<h3 class="font-weight-bold"><em class="text-secondary">Pralognan La Vanoise</em> / <em class="text-secondary">Centre - Pralognan La Vanoise</em></h3>
${paves("3 pi&#232;ces", "4 personnes", "49 m&#178;", "2 chambres")}
<p>APPARTEMENT 3 PIECES - <br />Capacit&#233; 4 personnes (6 personnes possible sur demande). 2*<br />49 m&#178;. 1 balcon Sud.</p>
<div id="location" class="collapse"> <div class="info">Pas de localisation disponible pour cette offre.</div> </div>
</div></div>`;

describe("Arkiane : type, pièces et formulaire de détail de la carte", () => {
  const fiches = lireArkiane(PAGE_2026);
  const lot = (n: string) => fiches.find((f) => f.lot === n);

  it("lit le type commercial, et les pièces quand il les compte", () => {
    assert.equal(fiches.length, 2);
    assert.equal(lot("184")?.typeCommercial, "2 pièces");
    assert.equal(lot("184")?.pieces, 2);
    // « Studio » ne compte pas de pièces : rien n'est déduit.
    assert.equal(lot("179")?.typeCommercial, "Studio");
    assert.equal(lot("179")?.pieces, null);
  });

  it("la capacité est celle du champ, pas celle du libellé", () => {
    // Le libellé du lot 184 dit « 6 personnes » ; le champ et le détail disent 4.
    assert.equal(lot("184")?.capacite, 4);
    assert.ok(lot("184")?.libelle.includes("6 personnes"));
  });

  it("garde le formulaire de détail tel que la carte l'écrit", () => {
    assert.deepEqual(lot("184")?.detail, {
      action: "/fr-FR/Lot/Detail",
      champs: [
        ["lot_no", "184"],
        ["comm_no", "101"],
        ["comm_type", "DEFAUT"],
        ["startDate", "06/02/2027 "],
        ["endDate", "13/02/2027 "],
      ],
    });
    // Le gabarit du 13 septembre n'a aucun champ dans son formulaire.
    assert.equal(lireArkiane(PAGE).find((f) => f.reference === "BCT1")?.detail, null);
  });

  it("le formulaire ne part que vers l'origine du marchand", () => {
    const marchand = "https://reservationpralognan.locvacances.com";
    assert.equal(
      adresseDetailArkiane(marchand, lot("184")?.detail?.action ?? ""),
      "https://reservationpralognan.locvacances.com/fr-FR/Lot/Detail",
    );
    assert.equal(
      adresseDetailArkiane(`${marchand}/`, `${marchand}/fr-FR/Lot/Detail`),
      `${marchand}/fr-FR/Lot/Detail`,
    );
    // Construits : une autre origine, relative au protocole, ou un autre protocole.
    for (const action of [
      "https://ailleurs.exemple/fr-FR/Lot/Detail",
      "//ailleurs.exemple/fr-FR/Lot/Detail",
      "http://reservationpralognan.locvacances.com/fr-FR/Lot/Detail",
    ]) {
      assert.equal(adresseDetailArkiane(marchand, action), null, action);
    }
    assert.equal(adresseDetailArkiane("pas une origine", "/fr-FR/Lot/Detail"), null);
  });
});

describe("Arkiane : le détail d'un lot porte la position et les chambres", () => {
  it("reconnaît une page de détail", () => {
    assert.ok(estDetailArkiane(DETAIL_179));
    assert.ok(!estDetailArkiane(PAGE_2026));
    assert.ok(
      !estDetailArkiane(
        "Malheureusement, nous n&#39;avons plus de disponibilit&#233; sur cette p&#233;riode.",
      ),
    );
  });

  it("lit pièces, personnes, chambres, quartier et point", () => {
    assert.deepEqual(lireDetailArkiane(DETAIL_184), {
      lat: 45.383434,
      lon: 6.716356,
      chambres: 1,
      pieces: 2,
      capacite: 4,
      quartier: "Le Plan",
    });
  });

  it("« 0 chambre » est la valeur d'un studio, pas un trou", () => {
    const d = lireDetailArkiane(DETAIL_179);
    assert.equal(d.chambres, 0);
    assert.equal(d.pieces, 1);
    assert.equal(d.lat, 45.38069);
    assert.equal(d.lon, 6.716458);
  });

  it("sans localisation publiée, le point reste vide", () => {
    const d = lireDetailArkiane(DETAIL_810);
    assert.equal(d.lat, null);
    assert.equal(d.lon, null);
    assert.equal(d.chambres, 2);
    assert.equal(d.quartier, "Centre - Pralognan La Vanoise");
  });

  it("la description n'est pas lue", () => {
    // « 6 personnes possible sur demande » : la capacité reste celle du pavé.
    assert.equal(lireDetailArkiane(DETAIL_810).capacite, 4);
  });

  it("un point hors de France ne vaut rien, une page vide ne donne rien", () => {
    const loin = DETAIL_184.replace("query=45.383434,6.716356", "query=-33.8,151.2");
    assert.equal(lireDetailArkiane(loin).lat, null);
    assert.deepEqual(lireDetailArkiane(""), {
      lat: null,
      lon: null,
      chambres: null,
      pieces: null,
      capacite: null,
      quartier: null,
    });
  });
});

describe("Arkiane : seulement des logements entiers de location", () => {
  it("la recherche ne demande que les locations saisonnières", () => {
    // Relevé du 25 septembre 2026 : deux champs `selectedCriteria`, acceptés,
    // et la même réponse, octet pour octet, qu'avec `lot_pax|4` seul.
    const c = corpsArkiane({ checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 4 });
    assert.deepEqual(c.getAll("selectedCriteria"), ["lot_pax|4", "lot_type_to|801"]);
    assert.equal(ARKIANE_LOCATIONS, "801");
    assert.match(
      c.toString(),
      /^selectedCriteria=lot_pax%7C4&selectedCriteria=lot_type_to%7C801&startDate=06%2F02%2F2027&endDate=13%2F02%2F2027&take=50&skip=1&/,
    );
  });

  it("garde les types vus au relevé", () => {
    for (const t of [
      "Studio",
      "2 pièces",
      "3 pièces",
      "4 pièces",
      "5 pièces",
      "6 pièces",
      "Chalet",
      "Maison",
      null,
    ]) {
      assert.equal(typeEcarteArkiane(t), null, String(t));
    }
  });

  it("écarte « Chambre », type commercial de la centrale", () => {
    // `lot_type_cial|95` dans la liste des critères ; aucune carte vue.
    assert.equal(typeEcarteArkiane("Chambre"), "chambre seule");
  });

  it("un type inconnu est gardé ; le libellé ne juge que le camping", () => {
    assert.equal(typeEcarteArkiane("Loft"), null);
    const [carte] = lireArkiane(PAGE_2026);
    assert.ok(carte);
    assert.equal(horsRegleArkiane(carte), null);
    const camping = { ...carte, libelle: "Mobil-home Camping Le Chamois" };
    assert.equal(horsRegleArkiane(camping), "camping");
    // « Refuge » dans le libellé n'est pas un type.
    const refuge = { ...carte, libelle: "Appartement Le Refuge 4 personnes" };
    assert.equal(horsRegleArkiane(refuge), null);
  });

  it("écarte ce que la règle du propriétaire exclut, sur des types construits", () => {
    for (const t of [
      "Hôtel",
      "Chambre d'hôtes",
      "Gîte d'étape",
      "Refuge",
      "Camping",
      "Hébergement insolite",
      "Yourte",
    ]) {
      assert.ok(typeEcarteArkiane(t), t);
    }
    assert.equal(typeEcarteArkiane("Gîte"), null);
  });
});
