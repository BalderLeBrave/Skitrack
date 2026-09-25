import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APPEL_MIN_INGENIE_MS,
  cidDepuisPage,
  configWidgetIngenie,
  lienReservationDepuisPage,
  estPageResultat,
  fusionnerCookies,
  PAGES_MAX_INGENIE,
  pagesSuivantesIngenie,
  PAUSE_PAGE_INGENIE_MS,
  TYPE_PRESTATAIRE_DEFAUT,
  TYPES_PRESTATAIRE_CONNUS,
  TYPES_PRESTATAIRE_ECARTES,
  categoriesDeRepli,
  typesLocationDepuisPage,
  typesPrestataireDepuisPage,
  dateIngenie,
  fragmentsIngenie,
  lieuIngenie,
  lireIngenie,
  nuitsEntre,
  occupationAfficheeIngenie,
  pageSuivanteIngenie,
  resultatsAnnonces,
  texteIngenie,
  urlIngenie,
  type OutilsSuiteIngenie,
  type PageIngenie,
} from "./ingenie.ts";

/**
 * Extrait relevé le 13 septembre 2026 sur `www.risoul.com` et
 * `reservation.lescontamines.com`, pour un séjour du 6 au 13 février 2027 à
 * huit personnes.
 *
 * Les deux premières fiches sont réelles, réduites aux éléments que
 * l'analyseur touche : le balisage de chacun est celui du site, y compris les
 * deux noms de classe différents, les deux casses de l'étiquette de prix et
 * l'espace insécable qui groupe les milliers. La troisième est une variante
 * construite de la première, privée de son bloc de tarif : c'est l'état d'une
 * fiche que la centrale connaît mais ne vend pas à ces dates.
 */
const PAGE = `
<div class="fiche-info fiche_liste_immobilier_agen_loueur_resid_prestation_RESA_v3" id="PRESTATION-G-SERRE-RENONCULES2">
  <a class="ga4-fiche-link" data-ga-item-id="G|SERRE|RENONCULES2" data-ga-item-name="Demi chalet de gauche 8 personnes Les renoncules 2" itemprop="name" href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result">Demi chalet de gauche 8 personnes Les renoncules 2</a>
  <a class="ga4-fiche-link" data-ga-item-id="G|SERRE|RENONCULES2" data-ga-item-name="Demi chalet de gauche 8 personnes Les renoncules 2" itemprop="name" href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result">Demi chalet de gauche 8 personnes Les renoncules 2</a>
  <img itemprop="image" src="https://www.risoul.com/medias/images/prestations/multitailles/640x480_imgp0032-1305649.jpg" alt="imgp0032-1305649" title="imgp0032-1305649"/>
  <div class="bloc_tarif_resa"> <div class="bloc_prix_en_cours"><div class="libelle_a_partir_de">à partir de</div><div class="prix_en_cours">1 300 €</div><div class="nature_prix_en_cours"></div></div>
  <div class="lien_plus_info_resa "><a href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result" class="btn" >Fiche détaillée</a>
</div>
<div class="fiche-info fiche_liste_appartements_chalets_prestation_v2" id="PRESTATION-G-MONTBLANCIMMO-CT817">
  <a itemprop="name" href="resa/montblancimmo/ct817.html?&amp;cid=3&amp;action=result&amp;resa_action=result">Chalet - Chalet Santa Claus</a>
  <img itemprop="image" src="https://reservation.lescontamines.com/medias/images/prestations/multitailles/320x240__lv_images__lot_0000004120_01_1011803.jpg" alt="Séjour" data-width="1920" data-height="1440" data-orientation="landscape" class="photo_principale" />
  <div class="bloc_tarif_resa"> <div class="bloc_prix_en_cours"><div class="libelle_a_partir_de">À partir de</div><div class="prix_en_cours">2 090 €</div><div class="nature_prix_en_cours"> pour la location</div></div>
  <div class="lien_plus_info_resa "><a href="resa/montblancimmo/ct817.html?&amp;cid=3&amp;action=result&amp;resa_action=result" class="btn" >Plus d'informations</a>
</div>
<div class="fiche-info fiche_liste_immobilier_agen_loueur_resid_prestation_RESA_v3" id="PRESTATION-G-SERRE-SANSPRIX">
  <a class="ga4-fiche-link" data-ga-item-id="G|SERRE|RENONCULES2" data-ga-item-name="Demi chalet de gauche 8 personnes Les renoncules 2" itemprop="name" href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result">Demi chalet de gauche 8 personnes Les renoncules 2</a>
  <a class="ga4-fiche-link" data-ga-item-id="G|SERRE|RENONCULES2" data-ga-item-name="Demi chalet de gauche 8 personnes Les renoncules 2" itemprop="name" href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result">Demi chalet de gauche 8 personnes Les renoncules 2</a>
  <img itemprop="image" src="https://www.risoul.com/medias/images/prestations/multitailles/640x480_imgp0032-1305649.jpg" alt="imgp0032-1305649" title="imgp0032-1305649"/>
  
  <div class="lien_plus_info_resa "><a href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result" class="btn" >Fiche détaillée</a>
</div>
`;

describe("Ingénie : lire une page de résultats datés", () => {
  it("ne rend que les fiches qui portent un bloc de tarif", () => {
    // Sans bloc de tarif, la centrale ne vend pas cette fiche à ces dates : ce
    // n'est pas un champ vide, c'est l'absence d'offre.
    assert.equal(fragmentsIngenie(PAGE).length, 3, "trois fiches dans la page");
    const fiches = lireIngenie(PAGE);
    assert.equal(fiches.length, 2, "mais une n'a pas de bloc de tarif du tout");
    assert.deepEqual(
      fiches.map((f) => f.id).sort(),
      ["PRESTATION-G-MONTBLANCIMMO-CT817", "PRESTATION-G-SERRE-RENONCULES2"],
    );
  });

  it("garde le libellé complet du bloc de prix, nature comprise", () => {
    // « pour la location » dit ce que le prix couvre, et n'était pas lu. Les
    // trois morceaux sont rendus dans l'ordre où la centrale les écrit.
    const f = lireIngenie(PAGE);
    assert.equal(f.find((x) => x.id.includes("CT817"))?.libelle, "À partir de 2 090 € pour la location");
    // Risoul n'écrit rien dans la nature : le libellé s'arrête au montant.
    assert.equal(f.find((x) => x.id.includes("RENONCULES2"))?.libelle, "à partir de 1 300 €");
  });

  it("lit le prix malgré l'espace insécable des milliers", () => {
    const f = lireIngenie(PAGE);
    assert.equal(f.find((x) => x.id.includes("RENONCULES2"))?.total, 1300);
    assert.equal(f.find((x) => x.id.includes("CT817"))?.total, 2090);
  });

  it("garde l'étiquette de la centrale, dans sa casse à elle", () => {
    // « à partir de » chez l'une, « À partir de » chez l'autre : c'est ce
    // qu'elles écrivent, et on ne le normalise pas. Une fiche couvre parfois
    // plusieurs lots et le nombre est celui du moins cher ; le taire ferait
    // passer pour unique un prix qui ne l'est pas.
    const f = lireIngenie(PAGE);
    assert.equal(f.find((x) => x.id.includes("RENONCULES2"))?.etiquette, "à partir de");
    assert.equal(f.find((x) => x.id.includes("CT817"))?.etiquette, "À partir de");
  });

  it("lit le titre sur les deux gabarits, qui ne sont pas les mêmes", () => {
    // Risoul porte `a.ga4-fiche-link`, Les Contamines non ; les deux portent
    // `itemprop="name"`, et c'est donc lui qu'on suit d'abord.
    const f = lireIngenie(PAGE);
    assert.equal(
      f.find((x) => x.id.includes("RENONCULES2"))?.titre,
      "Demi chalet de gauche 8 personnes Les renoncules 2",
    );
    assert.equal(f.find((x) => x.id.includes("CT817"))?.titre, "Chalet - Chalet Santa Claus");
  });

  it("rapporte la photo et le chemin de la fiche", () => {
    const f = lireIngenie(PAGE).find((x) => x.id.includes("CT817"));
    assert.ok(f?.photo?.startsWith("https://reservation.lescontamines.com/medias/"), `photo : ${f?.photo}`);
    assert.equal(f?.chemin, "resa/montblancimmo/ct817.html?&cid=3&action=result&resa_action=result");
  });

  it("l'URL porte l'action qui rend la liste, et la durée en nuits", () => {
    // `action=searchAjax`, celle du formulaire, répond « Une erreur s'est
    // produite ». C'est `action=result` qui rend la liste. Et la date s'écrit
    // en jj/mm/aaaa, la seule forme que le moteur accepte.
    const u = new URL(urlIngenie("https://exemple.test/", 4, {
      checkIn: "2027-02-06",
      checkOut: "2027-02-13",
      guests: 8,
    }));
    assert.equal(u.pathname, "/booking");
    assert.equal(u.searchParams.get("action"), "result");
    assert.equal(u.searchParams.get("cid"), "4");
    assert.equal(u.searchParams.get("datedeb"), "06/02/2027");
    assert.equal(u.searchParams.get("duree"), "7");
    assert.equal(u.searchParams.get("personnes"), "8");
    // Sans lui, la page revient vide.
    assert.equal(u.searchParams.get("type_prestataire"), "G");
  });

  it("compte les nuits, et refuse les dates absurdes", () => {
    assert.equal(nuitsEntre("2027-02-06", "2027-02-13"), 7);
    assert.equal(nuitsEntre("2027-02-06", "2027-02-20"), 14);
    // Un changement d'heure ne doit pas rogner une nuit.
    assert.equal(nuitsEntre("2027-03-27", "2027-04-03"), 7);
    assert.equal(nuitsEntre("2027-02-13", "2027-02-06"), 0);
    assert.equal(nuitsEntre("pas une date", "2027-02-13"), 0);
  });

  it("écrit la date comme le moteur la veut", () => {
    assert.equal(dateIngenie("2027-02-06"), "06/02/2027");
    assert.equal(dateIngenie("n'importe quoi"), "n'importe quoi");
  });

  it("lit un montant écrit en entité, et refuse un zéro", () => {
    // Val d'Allos écrit sa monnaie « 700 &euro; » et non « 700 € », et affiche
    // « à partir de 0 € » pour les logements dont elle n'a pas le tarif à ces
    // dates. Couper sur le signe littéral manquerait le premier ; prendre le
    // second pour un prix mettrait des logements gratuits en tête de liste.
    const carte = (id: string, prix: string) =>
      `<div class="fiche-info  fiche_liste_immobilier_prestation_OT_v2018" id="PRESTATION-${id}">` +
      `<a itemprop="name">Appartement ${id}</a>` +
      `<div class="bloc_prix_en_cours"><div class="libelle_a_partir_de">à partir de</div>` +
      `<div class="prix_en_cours">${prix}</div></div></div>`;
    const page = carte("A", "700 &euro;") + carte("B", "0 &euro;") + carte("C", "2&#160;778,65 &euro;");
    const f = lireIngenie(page);
    assert.deepEqual(f.map((x) => x.total).sort((a, b) => a - b), [0, 700, 2778.65]);
    // Le zéro n'est pas pris pour un prix — il ne devient pas un logement
    // gratuit en tête de liste — mais l'annonce n'est pas supprimée pour
    // autant : « à partir de 0 € » veut dire « pas de tarif à ces dates », et
    // c'est ce que dit un total de zéro dans tout le dépôt.
    const zero = f.find((x) => x.id.endsWith("-B"));
    assert.equal(zero?.total, 0);
    assert.equal(zero?.libelle, "à partir de 0 €");
  });

  it("le texte visible perd les balises et rend les entités", () => {
    assert.equal(texteIngenie("<b>a</b> &amp; <i>50 m&sup2;</i>"), "a & 50 m²");
  });

  it("lit le cid sur l'accueil, sous les trois formes du moteur", () => {
    assert.equal(cidDepuisPage(`new IngenieMenuEngine.Client({ cid: 8, lang: "fr" })`), "8");
    assert.equal(cidDepuisPage(`<input type="hidden" name="cid" value="4">`), "4");
    assert.equal(cidDepuisPage(PAGE), "4");
    assert.equal(cidDepuisPage("<html><body>pas de moteur</body></html>"), null);
  });
});

describe("une page de résultats, ou pas une page de résultats", () => {
  /**
   * Le contrôle qui manquait. Treize centrales Ingénie sur vingt-huit
   * répondent à l'URL de recherche par leur accueil de réservation, avec un
   * `200` et sans un résultat. Zéro fiche se lisait alors « rien de disponible
   * à ces dates », et l'écran annonçait Courchevel complet un an à l'avance.
   */
  it("une page de résultats vide en est une : elle porte le compteur", () => {
    // Relevé sur `reservation.areches-beaufort.com` avec 40 personnes, le
    // 20 septembre 2026 : 56 Ko, aucune fiche, mais `nb_result` y est
    // quarante et une fois, comme sur la page qui en porte dix.
    const vide = `<div id="nb_result">0</div><div class="critere_recherche"></div>`;
    assert.equal(estPageResultat(vide), true);
    assert.deepEqual(lireIngenie(vide), []);
  });

  it("un formulaire de recherche n'en est pas une, malgré ses paramètres", () => {
    // Relevé sur `www.valloire.com` : 39 Ko de formulaire, avec `datedeb`
    // puisqu'il le pose. S'être fié à ce paramètre l'aurait laissé passer, et
    // Valloire serait restée « rien de disponible ».
    const form = `<form action="/booking?action=result"><input name="datedeb" value="06/02/2027"></form>`;
    assert.equal(estPageResultat(form), false);
  });

  it("un accueil de réservation n'en est pas une non plus", () => {
    // Relevé sur `reservation.courchevel.com` le même jour : 30 Ko, et aucun
    // des quatre marqueurs.
    const accueil = `<h1>Réservation en ligne</h1><p>Une équipe d'experts</p><a href="/hebergements">Nos hébergements</a>`;
    assert.equal(estPageResultat(accueil), false);
  });

  it("la page qui porte des fiches en est une, évidemment", () => {
    assert.equal(estPageResultat(PAGE), true);
    assert.ok(lireIngenie(PAGE).length > 0);
  });
});

describe("la catégorie d'hébergement n'est pas la même partout", () => {
  /**
   * Le connecteur envoyait `type_prestataire=G` à tous les hôtes. Douze
   * l'acceptent, treize ne le connaissent pas : leur moteur rend « Une erreur
   * s'est produite », et leur page de recherche à la place des résultats.
   */
  const FORM_VALLOIRE = `
    <form name="form_recherche" method="GET" action="booking">
      <select name="type_prestataire">
        <option value="I">Appartement, Chalet</option>
        <option value="I_RESID">Résidence de Tourisme</option>
        <option value="H">Hôtel, Village Club</option>
        <option value="H_INSOLITE">Hébergement insolite</option>
      </select>
    </form>`;

  it("lit les catégories que l'hôte publie, dans son ordre", () => {
    assert.deepEqual(typesPrestataireDepuisPage(FORM_VALLOIRE), ["I", "I_RESID", "H", "H_INSOLITE"]);
  });

  it("et constate que le défaut n'y figure pas", () => {
    // C'est tout le défaut : `G` n'est pas une catégorie universelle.
    assert.equal(typesPrestataireDepuisPage(FORM_VALLOIRE).includes(TYPE_PRESTATAIRE_DEFAUT), false);
  });

  it("ne trouve rien là où il n'y a pas de formulaire", () => {
    assert.deepEqual(typesPrestataireDepuisPage("<h1>Réservation en ligne</h1>"), []);
    assert.deepEqual(typesPrestataireDepuisPage(PAGE), []);
  });

  it("la catégorie entre dans l'URL, et le défaut ne change pas", () => {
    const d = { checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 };
    assert.match(urlIngenie("https://x.fr", 3, d), /type_prestataire=G/);
    assert.match(urlIngenie("https://x.fr", 3, d, "I"), /type_prestataire=I/);
  });
});

describe("ce que le widget de réservation déclare", () => {
  /**
   * Relevé sur `www.lesrousses.com` le 20 septembre 2026. Trois choses y
   * étaient, et chacune corrigeait une erreur que le connecteur faisait.
   */
  const ACCUEIL_LES_ROUSSES = `<script defer> (function() { var params = {
      typePrestataire: 'S', typeWidget: 'TYPE_PRESTATAIRE',
      moteurTypePrestataire: 'MOTEUR_HEBERGEMENT',
      urlSite: 'https://www.lesrousses-reservation.com/',
      idWidget: 'widget-resa', target: "_blank", cid: 2, codeSite: "RESA" }; })()</script>`;

  it("lit l'hôte qui vend, le numéro du moteur et la catégorie", () => {
    const c = configWidgetIngenie(ACCUEIL_LES_ROUSSES);
    // Le registre visait `www.lesrousses.com`, qui rend 404 sur `/booking`.
    assert.equal(c.urlSite, "https://www.lesrousses-reservation.com/");
    assert.equal(c.cid, "2");
    assert.equal(c.typePrestataire, "S");
  });

  it("le `cid` se lit désormais hors de `IngenieMenuEngine.Client`", () => {
    // C'est ce qui manquait : Les Rousses configure son widget autrement, et
    // le connecteur concluait « la page n'a pas publié l'identifiant ».
    assert.equal(cidDepuisPage(ACCUEIL_LES_ROUSSES), "2");
    assert.equal(cidDepuisPage(`<script>params.set('cid', '7');</script>`), "7");
    assert.equal(cidDepuisPage("<h1>Réservation</h1>"), null);
  });

  it("une page sans widget ne déclare rien, et ne ment pas", () => {
    const c = configWidgetIngenie("<h1>Office de tourisme</h1>");
    assert.deepEqual(c, { cid: null, urlSite: null, typePrestataire: null });
  });
});

describe("le découpage des fiches, et le piège du tiret bas", () => {
  it("reconnaît une classe préfixée, pas seulement une classe nue", () => {
    // `www.chatelreservation.com` nomme ses fiches
    // `RESA_fiche_liste_appartement_chalet_prestation`. La règle exigeait une
    // frontière de mot avant `fiche_liste` ; entre `_` et `f` il n'y en a pas,
    // les deux étant des caractères de mot. Vingt fiches et quatre-vingt-cinq
    // logements se perdaient là, sans un message.
    const chatel = `<div class="fiche-info RESA_fiche_liste_appartement_chalet_prestation" id="PRESTATION-I-X"></div>`;
    assert.equal(fragmentsIngenie(chatel).length, 1);
    const risoul = `<div class="fiche-info fiche_liste_immobilier_agen" id="PRESTATION-G-Y"></div>`;
    assert.equal(fragmentsIngenie(risoul).length, 1);
  });

  it("suit le lien de réservation quand l'accueil ne configure rien", () => {
    // `www.chatel.com` enfouit son `cid` dans un paquet minifié, mais renvoie
    // en clair vers un hôte qui, lui, publie tout.
    const accueil = `<a href="https://www.chatelreservation.com/hiver">Réserver</a>`;
    assert.equal(lienReservationDepuisPage(accueil, "www.chatel.com"), "https://www.chatelreservation.com");
  });

  it("ne se suit pas lui-même", () => {
    const soi = `<a href="https://reservation.x.com/booking">Réserver</a>`;
    assert.equal(lienReservationDepuisPage(soi, "reservation.x.com"), null);
    assert.equal(lienReservationDepuisPage(`<a href="https://facebook.com/x">f</a>`, "x.com"), null);
  });
});

describe("Ingénie : le lieu, la capacité et les chambres que la liste publie déjà", () => {
  /**
   * Trois gabarits réels, relevés le 20 septembre 2026, 8 personnes du 6 au
   * 13 février 2027 : `reservation.areches-beaufort.com` (cid 1),
   * `www.chatelreservation.com` (cid 5) et `www.valloire.com` (cid 3).
   *
   * Chaque fiche est réduite aux blocs que l'analyseur touche — JSON-LD, nom,
   * sous-titre, critères, tarif, lien —, dans le balisage de la centrale. La
   * description de Valloire est abrégée : on n'en garde que la phrase qui
   * piège, « classé 3* pour 4 personnes », alors que la centrale vend le
   * logement pour huit. Le pied de page après la pagination est construit :
   * il éprouve la borne de la dernière fiche.
   *
   * `String.raw` garde les barres échappées du JSON (`\/`) telles que la centrale les écrit.
   */
  const LISTE = String.raw`
<div class="fiche-info fiche_liste_locations_de_vacances_prestation" id="PRESTATION-G-227327001-59"><script type="application/ld+json">{"@context":"http:\/\/schema.org\/","telephone":"04.79.38.11.70","email":"info@immobilier-beaufortain.com","location":{"address":{"addressLocality":"ARÊCHES","addressCountry":"FRA","postalCode":"73270","streetAddress":"RESIDENCE LE VAL BLANC 2, 69 route du Monteiller","@type":"PostalAddress"},"geo":{"latitude":"45.687045","longitude":"6.565435","@type":"GeoCoordinates"},"@type":"Place"},"name":"AGENCE DU BEAUFORTAIN","description":"Arêches-Beaufort très beau duplex, classé pour 8 personnes, idéal grande famille","@type":"LocalBusiness"}</script>
<img src="https://reservation.areches-beaufort.com/medias/images/prestations/multitailles/800x600__clients_227327001_photos_59a_6393990.jpg" alt="_clients_227327001_photos_59a_6393990" title="_clients_227327001_photos_59a_6393990"/>
<div class="nom"><h2><!--<a href="val-blanc-2-rvbb61-t4-duplex.html?&amp;cid=1&amp;action=result&amp;resa_action=result#top">--><a href="val-blanc-2-rvbb61-t4-duplex.html?&amp;cid=1&amp;action=result&amp;resa_action=result">VAL BLANC 2 RVBB61 - T4 DUPLEX</a></h2>
<span class="sous-titre"><span class="capacite-surface-G"><span class="quantite">55</span> <span class="libelle">m²</span></span> <span class="NBPERS-10PERS-G">10 personnes</span> <span class="NBDECHAMBRE-CHAMBRE3-G">3 chambres</span> </span></div>
<div class="bloc_prix_en_cours"><div class="libelle_a_partir_de">à partir de</div><div class="prix_en_cours">1 833 €</div><div class="nature_prix_en_cours"></div></div>
<div class="lien_plus_info_resa "><a href="val-blanc-2-rvbb61-t4-duplex.html?&amp;cid=1&amp;action=result&amp;resa_action=result" class="btn" >Plus d'informations</a></div>
<script>WidgetDispos.addChargementAuClicBtnDispoAccordeon('PRESTATION-G-227327001-59',{tabParamsWidgetDispo : {"nb_pers":"8"}});</script>
</div>
<div class="fiche-info RESA_fiche_liste_appartement_chalet_prestation" id="PRESTATION-I-ROCIM-CHOISI"><script type="application/ld+json">{"@context":"http:\/\/schema.org\/","telephone":"+33 (0)6.62.44.62.28","email":"location74@hotmail.fr","location":{"address":{"addressLocality":"CHATEL","addressCountry":"FRA","postalCode":"74390","streetAddress":"191 chemin de la Vora, ","@type":"PostalAddress"},"geo":{"latitude":"46.27721","longitude":"6.83957","@type":"GeoCoordinates"},"@type":"Place"},"name":"SARL ROCA IMMOBILIER","description":"","@type":"LocalBusiness"}</script>
<img src="https://www.chatelreservation.com/medias/images/prestations/multitailles/800x600_chalet-les-oisillons-sejour-chatel-portes-du-soleil-4373688.jpeg" alt="Chalet Les Oisillons, Séjour, Châtel Portes du Soleil" />
<div class="nom"><h2><!--<a href="location-petit-chatel-chalet-les-oisillons-chalet-10-personnes-choisi.html?&amp;cid=5&amp;action=result&amp;resa_action=result#top">--><a target="_blank" aria-label="CHALET 10 PERSONNES (nouvelle fenêtre)" href="location-petit-chatel-chalet-les-oisillons-chalet-10-personnes-choisi.html?&amp;cid=5&amp;action=result&amp;resa_action=result">CHALET 10 PERSONNES <span class="code_prest"><span>(</span>ROCIM - CHOISI<span>)</span></span> </a></h2>
<span class="sous-titre"><span class="IRESID-ICHOISI-I">Chalet Les Oisillons</span> </span></div>
<div class="zone_criteres_fiche_presta sans-type">
 <ul class="liste_criteres_auto_zone_affichage">
 <li class="ISUPER-I"><ul><li class="ISUPER-ISUPER-I"><span class="quantite">150</span> <span class="libelle">m²</span></li></ul></li>
 <li class="INBCHAMBRE-I"><ul><li class="INBCHAMBRE-ICHAMBRES-I"><span class="quantite">4</span> <span class="libelle">chambre(s)</span></li></ul></li>
 <li class="INBSDB-I"><ul><li class="INBSDB-ISDB-I"><span class="quantite">2</span> <span class="libelle">salle(s) de bains</span></li></ul></li>
 </ul>
</div>
<div class="bloc_prix_en_cours"><div class="libelle_a_partir_de"></div><div class="prix_en_cours">4 900 €</div><div class="nature_prix_en_cours"></div></div>
<div class="lien_plus_info_resa "><a target="_blank" href="location-petit-chatel-chalet-les-oisillons-chalet-10-personnes-choisi.html?&amp;cid=5&amp;action=result&amp;resa_action=result" class="btn" >Voir plus</a></div>
</div>
<div class="fiche-info fiche_liste_immobilier_prestation_RESA" id="PRESTATION-I-VALLOIRERESA-ADRIEN3"><script type="application/ld+json">{"@context":"http:\/\/schema.org\/","telephone":"","email":"","location":{"address":{"addressLocality":"VALLOIRE","addressCountry":"FRA","postalCode":"73450","streetAddress":"105 ROUTE DES CHARBONNIERES , ","@type":"PostalAddress"},"geo":{"latitude":"45.165093","longitude":"6.432431","@type":"GeoCoordinates"},"@type":"Place"},"name":"Valloire Réservations","description":"Appartement classé 3* pour 4 personnes.<br \/>Hébergement labelisé Clé Vacances : 3clés\/ 6personnes","@type":"LocalBusiness"}</script>
<img src="https://www.valloire.com/medias/images/prestations/multitailles/800x600__lv_images__lot_0004130002_01_39436043.jpg" alt="SEJOUR - APPARTEMENT ADRIEN 3 - VALLOIRE CENTRE" />
<div class="nom"><h2><!--<a href="4-pieces-les-chalets-d-adrien-3.html?&amp;cid=3&amp;action=result&amp;resa_action=result#top">--><a href="4-pieces-les-chalets-d-adrien-3.html?&amp;cid=3&amp;action=result&amp;resa_action=result">4 pièces - LES CHALETS D'ADRIEN 3</a></h2>
<span class="sous-titre"><span class="GCAPACITE-8PERS-I">8 personnes</span> <span class="SURFACE-MCARRE-I"><span class="quantite">96</span> <span class="libelle">m²</span></span> <span class="LOCALISATION-VALLOIRECENTRE-I">Valloire Centre</span> </span></div>
<div class="bloc_prix_en_cours"><div class="libelle_a_partir_de">à partir de</div><div class="prix_en_cours">3 830 €</div><div class="nature_prix_en_cours"></div></div>
<div class="lien_plus_info_resa "><a href="4-pieces-les-chalets-d-adrien-3.html?&amp;cid=3&amp;action=result&amp;resa_action=result" class="btn" >Plus d'infos</a></div>
</div>
<div class="fiche-info RESA_fiche_liste_appartement_chalet_prestation" id="PRESTATION-I-ROCIM-CHACERVIN"><script type="application/ld+json">{"@context":"http:\/\/schema.org\/","telephone":"+33 (0)6.62.44.62.28","email":"location74@hotmail.fr","location":{"address":{"addressLocality":"ABONDANCE","addressCountry":"FRA","postalCode":"","streetAddress":", ","@type":"PostalAddress"},"geo":{"latitude":"","longitude":"","@type":"GeoCoordinates"},"@type":"Place"},"name":"SARL ROCA IMMOBILIER","description":"","@type":"LocalBusiness"}</script>
<div class="nom"><h2><a target="_blank" href="location-abondance-chalet-cervin-abondance-chalet-8-personnes-chacervin.html?&amp;cid=5&amp;action=result&amp;resa_action=result">CHALET 8 PERSONNES <span class="code_prest"><span>(</span>ROCIM - CHACERVIN<span>)</span></span> </a></h2>
<span class="sous-titre"><span class="IRESID-ICHACERVIN-I">Chalet Cervin - Abondance</span> </span></div>
<div class="bloc_prix_en_cours"><div class="libelle_a_partir_de"></div><div class="prix_en_cours">3 900 €</div><div class="nature_prix_en_cours"></div></div>
</div>
<div class="pagination" style="display:none" ><div class="page"><a href="/booking?page=2" title="Page 2" class="pagination-page" >2</a></div></div>
<div id="lasuite"><a href="/booking?page=2&amp;cid=5&amp;action=result&amp;resa_action=result&idMenu=3149" >Plus de résultats</a></div>
<form class="construit"><ul><li>12 personnes</li><li>6 chambres</li></ul></form>
`;

  const fiches = lireIngenie(LISTE);
  const par = (bout: string) => fiches.find((f) => f.id.endsWith(bout));

  it("lit le point du logement dans le JSON-LD de la fiche", () => {
    assert.equal(fiches.length, 4);
    assert.deepEqual([par("-59")?.lat, par("-59")?.lon], [45.687045, 6.565435]);
    assert.deepEqual([par("-CHOISI")?.lat, par("-CHOISI")?.lon], [46.27721, 6.83957]);
    assert.deepEqual([par("-ADRIEN3")?.lat, par("-ADRIEN3")?.lon], [45.165093, 6.432431]);
  });

  it("prend l'adresse du logement, jamais le nom du loueur", () => {
    // Le `name` du bloc est l'agence ; `location` est le logement.
    assert.equal(par("-59")?.adresse, "RESIDENCE LE VAL BLANC 2, 69 route du Monteiller");
    assert.equal(par("-59")?.commune, "ARÊCHES");
    // La virgule que la centrale laisse traîner n'est pas une adresse.
    assert.equal(par("-CHOISI")?.adresse, "191 chemin de la Vora");
  });

  it("un point laissé vide par la centrale reste vide", () => {
    // `"latitude":""` : Number("") vaudrait zéro, et zéro n'est pas un point.
    const f = par("-CHACERVIN");
    assert.equal(f?.lat, null);
    assert.equal(f?.lon, null);
    assert.equal(f?.adresse, null);
    assert.equal(f?.commune, "ABONDANCE");
  });

  it("lit la capacité et les chambres affichées sous le titre", () => {
    assert.equal(par("-59")?.capacite, 10);
    assert.equal(par("-59")?.chambres, 3);
    assert.equal(par("-ADRIEN3")?.capacite, 8);
  });

  it("lit les chambres rangées dans les critères, « 4 chambre(s) »", () => {
    assert.equal(par("-CHOISI")?.chambres, 4);
    // Châtel n'affiche pas sa capacité à part : elle est dans le titre, qui a
    // son propre recours côté serveur. Rien n'est lu ailleurs.
    assert.equal(par("-CHOISI")?.capacite, null);
  });

  it("ne lit ni la description, ni la photo, ni le widget de disponibilité", () => {
    // La description de Valloire dit « classé 3* pour 4 personnes » et
    // « 6personnes » ; le logement est vendu pour huit. Le widget répète le
    // nombre de voyageurs demandé, pas la capacité.
    assert.equal(par("-ADRIEN3")?.capacite, 8);
    assert.equal(par("-59")?.capacite, 10);
  });

  it("la dernière fiche s'arrête à la pagination, pas au pied de page", () => {
    // Le pied construit affiche « 12 personnes · 6 chambres » ; la dernière
    // fiche n'en porte aucun, et ne doit pas les prendre.
    assert.equal(par("-CHACERVIN")?.capacite, null);
    assert.equal(par("-CHACERVIN")?.chambres, null);
    const derniere = fragmentsIngenie(LISTE).at(-1) ?? "";
    assert.ok(!derniere.includes("12 personnes"));
  });

  it("prend le nom dans le h2 du bloc nom, pas le texte de la photo", () => {
    assert.equal(par("-59")?.titre, "VAL BLANC 2 RVBB61 - T4 DUPLEX");
    assert.equal(par("-CHOISI")?.titre, "CHALET 10 PERSONNES ( ROCIM - CHOISI )");
    assert.equal(par("-ADRIEN3")?.titre, "4 pièces - LES CHALETS D'ADRIEN 3");
  });

  it("les deux lecteurs se tiennent seuls, et ne fabriquent rien sur un fragment nu", () => {
    assert.deepEqual(lieuIngenie("<div></div>"), { lat: null, lon: null, adresse: null, commune: null });
    assert.deepEqual(occupationAfficheeIngenie("<a>Chalet 8 personnes</a>"), {
      capacite: null,
      chambres: null,
      pieces: null,
    });
    // Un point hors de France est rejeté, comme pour les autres moteurs.
    const loin = `<script type="application/ld+json">{"location":{"geo":{"latitude":"4.5","longitude":"6.1"}}}</script>`;
    assert.equal(lieuIngenie(loin).lat, null);
    // Un JSON illisible — un retour chariot brut — garde son point.
    const casse = `<script type="application/ld+json">{"description":"a
b","location":{"geo":{"latitude":"45.1","longitude":"6.2"}}}</script>`;
    assert.deepEqual([lieuIngenie(casse).lat, lieuIngenie(casse).lon], [45.1, 6.2]);
  });

  it("les deux gabarits déjà figés ne changent pas de lecture", () => {
    // Risoul et Les Contamines : pas de JSON-LD dans l'extrait, donc pas de
    // point ; titre inchangé.
    const avant = lireIngenie(PAGE);
    assert.equal(avant.length, 2);
    for (const f of avant) {
      assert.equal(f.lat, null);
      assert.equal(f.capacite, null);
    }
  });
});

describe("Ingénie : la suite de la liste", () => {
  // Relevé du 25 septembre 2026 sur `reservation.areches-beaufort.com`,
  // page 1, 8 personnes du 6 au 13 février 2027 : 37 résultats annoncés,
  // 10 montrés. Balisage de la centrale, réduit à ces deux blocs.
  const BAS = `<div class="nb-resultats"><span>37</span> résultats</div>
<div id="lasuite"><a href="/booking?page=2&amp;cid=1&amp;action=result&amp;resa_action=result&idMenu=3" >Plus de résultats</a></div>`;

  it("lit le nombre de résultats que la centrale annonce", () => {
    assert.equal(resultatsAnnonces(BAS), 37);
    assert.equal(resultatsAnnonces("<div>rien</div>"), null);
  });

  it("suit le lien que le défilement de la page suit, entités rendues", () => {
    assert.equal(
      pageSuivanteIngenie(BAS),
      "/booking?page=2&cid=1&action=result&resa_action=result&idMenu=3",
    );
    assert.equal(pageSuivanteIngenie("<div>fin</div>"), null);
  });

  it("la page 2 porte à son tour le lien de la page 3", () => {
    // Relevé du 25 septembre 2026, même centrale et même demande : la page 2,
    // suivie avec le cookie de la page 1, annonce le même compte et désigne
    // la page 3. Balisage de la centrale, réduit à ces deux blocs.
    const PAGE2 = `<div class="nb-resultats"><span>37</span> résultats</div>
<div id="lasuite"><a href="/booking?page=3&amp;cid=1&amp;action=result&amp;resa_action=result&idMenu=3" >Plus de résultats</a></div>`;
    assert.equal(resultatsAnnonces(PAGE2), 37);
    assert.equal(
      pageSuivanteIngenie(PAGE2),
      "/booking?page=3&cid=1&action=result&resa_action=result&idMenu=3",
    );
  });

  it("les cookies d'une page suivante s'ajoutent à la session, sans l'effacer", () => {
    // Le nom `PHPSESSID` est celui que la centrale pose ; les valeurs sont
    // construites. Une réponse qui ne repose qu'un autre cookie ne fait pas
    // perdre la session, et un cookie reposé prend sa nouvelle valeur.
    assert.equal(fusionnerCookies("PHPSESSID=a1", ""), "PHPSESSID=a1");
    assert.equal(fusionnerCookies("PHPSESSID=a1", "suivi=x"), "PHPSESSID=a1; suivi=x");
    assert.equal(
      fusionnerCookies("PHPSESSID=a1; suivi=x", "PHPSESSID=b2"),
      "PHPSESSID=b2; suivi=x",
    );
    assert.equal(fusionnerCookies("", ""), "");
  });
});

describe("Ingénie : suivre la liste, sans réseau", () => {
  /**
   * Des pages **construites** sur le balisage de la centrale, réduit à ce que
   * la suite lit : le compteur, des fiches (identifiant, nom, prix) et le lien
   * `#lasuite`. La centrale est factice et l'horloge avance à la main : un
   * appel prend `dureeMs`, une attente ce qu'on lui demande.
   */
  const ORIGINE = "https://reservation.areches-beaufort.com";
  const LOIN = 1_000_000;

  const ids = (prefixe: string, nombre: number) =>
    Array.from({ length: nombre }, (_, i) => `${prefixe}${i + 1}`);

  function page(n: number, cles: string[], o: { annonce?: number; suite?: boolean } = {}) {
    const compte = `<div class="nb-resultats"><span>${o.annonce ?? 37}</span> résultats</div>`;
    const fiches = cles.map(
      (cle) =>
        `<div class="fiche_liste_x" id="PRESTATION-G-${cle}"><div class="nom"><h2>Logement ${cle}</h2></div><div class="prix_en_cours">1 000 €</div></div>`,
    );
    const suite =
      o.suite === false
        ? ""
        : `<div id="lasuite"><a href="/booking?page=${n + 1}&amp;cid=1&amp;action=result&amp;resa_action=result&idMenu=3" >Plus de résultats</a></div>`;
    return [compte, ...fiches, suite].join("\n");
  }

  const P1_URL = `${ORIGINE}/booking?action=result&cid=1&type_prestataire=G&datedeb=06%2F02%2F2027&duree=7&personnes=8`;

  function premiere(texte: string): PageIngenie {
    return { url: P1_URL, texte, cookies: "PHPSESSID=s1" };
  }

  type Appel = { url: string; cookies: string; referer: string; a: number };

  function centrale(
    pages: Record<number, string | Error>,
    o: { depart?: number; dureeMs?: number; cookies?: Record<number, string> } = {},
  ) {
    let t = o.depart ?? 0;
    const appels: Appel[] = [];
    const attentes: number[] = [];
    const outils: OutilsSuiteIngenie = {
      maintenant: () => t,
      attendre: async (ms) => {
        attentes.push(ms);
        t += ms;
      },
      lire: async (url, cookies, referer) => {
        appels.push({ url, cookies, referer, a: t });
        t += o.dureeMs ?? 500;
        const n = Number(new URL(url).searchParams.get("page"));
        const p = pages[n];
        if (p instanceof Error) throw p;
        if (p == null) throw new Error(`page ${n} inattendue`);
        return { url, texte: p, cookies: o.cookies?.[n] ?? "" };
      },
    };
    return { outils, appels, attentes };
  }

  /** Comme `chercherIngenie` : les fiches de la page 1 sont déjà vues. */
  function suivre(p1: PageIngenie, echeance: number, c: ReturnType<typeof centrale>) {
    const deja = lireIngenie(p1.texte).map((f) => f.id);
    return pagesSuivantesIngenie(p1, deja, echeance, c.outils);
  }

  it("suit la liste jusqu'au bout, avec la session et une seconde entre deux pages", async () => {
    const p1 = premiere(page(1, ids("A", 10)));
    const c = centrale(
      { 2: page(2, ids("B", 10)), 3: page(3, ids("C", 3), { suite: false }) },
      { cookies: { 2: "suivi=x" } },
    );
    const s = await suivre(p1, LOIN, c);
    assert.equal(s.fiches.length, 13);
    assert.deepEqual([s.arret, s.page], ["fin de liste", 4]);
    assert.deepEqual(
      c.appels.map((a) => a.url),
      [2, 3].map(
        (n) => `${ORIGINE}/booking?page=${n}&cid=1&action=result&resa_action=result&idMenu=3`,
      ),
    );
    // La session de la page 1, puis celle que la page 2 a complétée.
    assert.deepEqual(
      c.appels.map((a) => a.cookies),
      ["PHPSESSID=s1", "PHPSESSID=s1; suivi=x"],
    );
    // Le défilement ne quitte pas la première page : elle reste le Referer.
    assert.deepEqual(
      c.appels.map((a) => a.referer),
      [P1_URL, P1_URL],
    );
    // Une seconde au moins entre la fin d'une page et la demande suivante.
    assert.equal(PAUSE_PAGE_INGENIE_MS, 1_000);
    assert.deepEqual(c.attentes, [1_000, 1_000]);
    assert.deepEqual(
      c.appels.map((a) => a.a),
      [1_000, 2_500],
    );
  });

  it("s'arrête au compte annoncé, sans demander la page d'après", async () => {
    const c = centrale({ 2: page(2, ids("B", 10), { annonce: 20 }) });
    const s = await suivre(premiere(page(1, ids("A", 10), { annonce: 20 })), LOIN, c);
    assert.deepEqual([s.fiches.length, s.arret, s.page], [10, "compte atteint", 3]);
    assert.equal(c.appels.length, 1);
  });

  it("une page en échec arrête la suite sans reprise, et les pages lues restent", async () => {
    const c = centrale({ 2: page(2, ids("B", 10)), 3: new Error("la centrale a répondu 429") });
    const s = await suivre(premiere(page(1, ids("A", 10))), LOIN, c);
    assert.deepEqual(
      s.fiches.map((f) => f.id),
      ids("PRESTATION-G-B", 10),
    );
    assert.deepEqual([s.arret, s.page, s.erreur], ["échec", 3, "la centrale a répondu 429"]);
    // Pas de reprise : la page 3 n'a été demandée qu'une fois.
    assert.equal(c.appels.length, 2);
  });

  it("une page sans fiche neuve arrête la suite", async () => {
    const c = centrale({ 2: page(2, ids("A", 10)) });
    const s = await suivre(premiere(page(1, ids("A", 10))), LOIN, c);
    assert.deepEqual([s.fiches.length, s.arret, s.page], [0, "rien de neuf", 2]);
  });

  it("rien n'est demandé à une page sans suite", async () => {
    const c = centrale({});
    const s = await suivre(premiere(page(1, ids("A", 9), { annonce: 40, suite: false })), LOIN, c);
    assert.deepEqual([s.arret, c.appels.length], ["fin de liste", 0]);
  });

  it(`au plus ${PAGES_MAX_INGENIE} pages, première comprise`, async () => {
    const pages: Record<number, string> = {};
    for (let n = 2; n <= 12; n += 1) pages[n] = page(n, ids(`P${n}-`, 10), { annonce: 500 });
    const c = centrale(pages);
    const s = await suivre(premiere(page(1, ids("A", 10), { annonce: 500 })), LOIN, c);
    assert.equal(c.appels.length, PAGES_MAX_INGENIE - 1);
    assert.deepEqual([s.fiches.length, s.arret, s.page], [90, "pages max", 11]);
  });

  it("le temps se compte depuis l'entrée de la recherche : la page 1 a pris sa part", async () => {
    // Échéance à 38 s de l'entrée ; l'accueil et la page 1 en ont pris 30.
    // Chaque page prend 2 s, après sa seconde d'attente.
    const echeance = 38_000;
    const c = centrale(
      { 2: page(2, ids("B", 10)), 3: page(3, ids("C", 10)), 4: page(4, ids("D", 10)) },
      { depart: 30_000, dureeMs: 2_000 },
    );
    const s = await suivre(premiere(page(1, ids("A", 10))), echeance, c);
    // Pages 2 et 3 demandées à 31 et 34 s ; à 36 s, il ne reste que 2 s.
    assert.deepEqual(
      c.appels.map((a) => a.a),
      [31_000, 34_000],
    );
    assert.deepEqual([s.fiches.length, s.arret, s.page], [20, "échéance", 4]);
    // Aucun appel ne part à moins de `APPEL_MIN_INGENIE_MS` de l'échéance.
    for (const a of c.appels) assert.ok(echeance - a.a >= APPEL_MIN_INGENIE_MS);
  });

  it("une page 1 trop lente ne laisse demander aucune suite", async () => {
    // 3,999 s avant l'échéance : moins qu'une attente et un appel.
    const c = centrale({ 2: page(2, ids("B", 10)) }, { depart: 34_001 });
    const s = await suivre(premiere(page(1, ids("A", 10))), 38_000, c);
    assert.deepEqual([s.fiches.length, s.arret, s.page], [0, "échéance", 2]);
    assert.equal(c.appels.length, 0);
  });
});

describe("Ingénie : la location seulement, ni hôtels ni insolite", () => {
  /**
   * Le sélecteur de catégorie de `www.valloire.com`, verbatim, relevé le
   * 25 septembre 2026 sur sa page de résultats (quatre personnes, 6 au
   * 13 février 2027). Seul l'appel `onchange` est retiré.
   */
  const SELECT_VALLOIRE = `<select name="type_prestataire" id="type_prestataire" class="type_prestataire" aria-label="Prestataire">
					<option value="I" selected="selected" >Appartement, Chalet</option>			<option value="I_RESID" >Résidence de Tourisme</option>			<option value="H" >Hôtel, Village Club</option>			<option value="H_INSOLITE" >Hébergement insolite</option>		</select>`;

  it("ne retient que les catégories de location que l'hôte publie", () => {
    // Toutes sont lues, dans l'ordre de l'hôte…
    assert.deepEqual(typesPrestataireDepuisPage(SELECT_VALLOIRE), [
      "I",
      "I_RESID",
      "H",
      "H_INSOLITE",
    ]);
    // … mais seules la location et la résidence de tourisme sont retenues.
    assert.deepEqual(typesLocationDepuisPage(SELECT_VALLOIRE), ["I", "I_RESID"]);
  });

  it("le vocabulaire de repli ne contient plus ni hôtel ni insolite", () => {
    assert.deepEqual([...TYPES_PRESTATAIRE_CONNUS], ["I", "I_RESID"]);
    for (const t of TYPES_PRESTATAIRE_ECARTES) {
      assert.equal(TYPES_PRESTATAIRE_CONNUS.includes(t), false);
    }
  });

  it("une autre lettre est écartée par son libellé, pas par supposition", () => {
    // Construit : aucune centrale relevée n'emploie ces lettres. Le libellé
    // est ce que le visiteur lit ; « Gîtes » reste, « gîtes d'étape » non.
    const autre = `<select name="type_prestataire">
      <option value="C">Camping</option>
      <option value="R">Refuges &amp; gîtes d&#39;étape</option>
      <option value="X">Chambres d'hôtes</option>
      <option value="M">Gîtes</option>
    </select>`;
    assert.deepEqual(typesLocationDepuisPage(autre), ["M"]);
    assert.deepEqual(typesLocationDepuisPage("<h1>Réservation</h1>"), []);
  });

  it("le repli n'essaie que la location, et le vocabulaire commun à qui ne publie rien", () => {
    // Valloire, verbatim : ses deux catégories de location.
    assert.deepEqual(categoriesDeRepli(SELECT_VALLOIRE), ["I", "I_RESID"]);
    // Sans formulaire (Courchevel peint tout en JavaScript) : le vocabulaire commun.
    assert.deepEqual(categoriesDeRepli("<h1>Réservation</h1>"), ["I", "I_RESID"]);
    // Construits : un formulaire qui ne publie que `G` reçoit aussi le
    // vocabulaire commun ; un formulaire qui ne publie qu'hôtels et insolite
    // ne reçoit rien, plutôt qu'une lettre au hasard.
    assert.deepEqual(
      categoriesDeRepli(
        `<select name="type_prestataire"><option value="G">Hébergements</option></select>`,
      ),
      ["I", "I_RESID"],
    );
    assert.deepEqual(
      categoriesDeRepli(
        `<select name="type_prestataire"><option value="H">Hôtel, Village Club</option><option value="H_INSOLITE">Hébergement insolite</option></select>`,
      ),
      [],
    );
  });
});

describe("Ingénie : deux gabarits relevés le 25 septembre 2026", () => {
  /**
   * `www.risoul.com` (cid 4, `G`, huit personnes) et `www.valloire.com`
   * (cid 3, `I`, **quatre** personnes), 6 au 13 février 2027. Une fiche de
   * chacun, réduite aux blocs que l'analyseur touche, balisage de la
   * centrale ; le lien de suite est celui de la page.
   *
   * Risoul n'a pas de bloc JSON-LD par fiche : ni point, ni capacité, ni
   * chambres dans la liste, seulement ses pièces en critère. La description
   * JSON-LD de Valloire est réduite à ses couchages, échappées `\u00e9`
   * comprises, et le bloc à ce que l'analyseur lit : les couchages font bien
   * quatre places, la capacité affichée n'est pas l'écho de la demande.
   */
  const RISOUL = String.raw`
<div class="fiche-info fiche_liste_immobilier_agen_loueur_resid_prestation_RESA_v3" id="PRESTATION-G-SERRE-RENONCULES2"><div class="affiche_info">
<div class="nom"><h2><!--<a href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result#top">--><a class="ga4-fiche-link" data-ga-item-id="G|SERRE|RENONCULES2" data-ga-item-name="Demi chalet de gauche 8 personnes Les renoncules 2" itemprop="name" href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result">Demi chalet de gauche 8 personnes Les renoncules 2</a></h2><div class="classement"></div></div>
<div class="zone_criteres_fiche_presta sans-type"> <ul class="liste_criteres_auto_zone_affichage"> <li class="GTYPRE-G"> <ul> <li class="GTYPRE-GAPCHA-G">Appartement dans Chalet</li> </ul> </li> <li class="GTYPAP-G"> <ul> <li class="GTYPAP-G3PIEC-G">3 pièces</li> </ul> </li> <li class="GSUPER-G"> <ul> <li class="GSUPER-GSUPTO-G"><span class="quantite">50</span> <span class="libelle">m²</span></li> </ul> </li> </ul> </div>
<div class="bloc_prix_en_cours"><div class="libelle_a_partir_de">à partir de</div><div class="prix_en_cours">1 300 €</div><div class="nature_prix_en_cours"></div></div>
<div class="lien_plus_info_resa "><a href="demi-chalet-de-gauche-8-personnes-les-renoncules-2-risoul-reservation.html?&amp;cid=4&amp;action=result&amp;resa_action=result" class="btn" >Fiche détaillée</a></div>
</div>
<div id="lasuite"><a href="/booking?page=2&amp;cid=4&amp;action=result&amp;resa_action=result&idMenu=3794" >Plus de résultats</a></div>`;

  const VALLOIRE = String.raw`
<div class="fiche-info fiche_liste_immobilier_prestation_RESA" id="PRESTATION-I-VALLOIRERESA-SPORALP1"><script type="application/ld+json">{"@context":"http:\/\/schema.org\/","telephone":"","email":"","location":{"address":{"addressLocality":"VALLOIRE","addressCountry":"FRA","postalCode":"73450","streetAddress":"121 RUE DES GRANDES ALPES, ","@type":"PostalAddress"},"geo":{"latitude":"45.165445","longitude":"6.430143","@type":"GeoCoordinates"},"@type":"Place"},"name":"Valloire R\u00e9servations","description":"COUCHAGE :<br \/>S\u00e9jour (21m\u00b2\/ Nord-Est) : 1 canap\u00e9 gigogne (2x 80x190cm)<br \/>Cabine (s\u00e9par\u00e9e du s\u00e9jour par un rideau\/ 4m\u00b2) : 2 lits superpos\u00e9s (2x 80x190cm)","@type":"LocalBusiness"}</script><div class="affiche_info">
<div class="nom"><h2><!--<a href="studio-cabine-sport-alp-n1.html?&amp;cid=3&amp;action=result&amp;resa_action=result#top">--><a href="studio-cabine-sport-alp-n1.html?&amp;cid=3&amp;action=result&amp;resa_action=result">Studio cabine - SPORT ALP N°1</a></h2><div class="classement"><ul><li class="CONFORT-2ETOILES-I"></li></ul></div></div> <span class="sous-titre"><span class="GCAPACITE-4PERS-I">4 personnes</span> <span class="SURFACE-MCARRE-I"><span class="quantite">28</span> <span class="libelle">m²</span></span> <span class="LOCALISATION-VALLOIRECENTRE-I">Valloire Centre</span> <span class="ZONE-RUEDELASETAZ-I">Rue de la Sétaz</span> </span></div>
<div class="bloc_prix_en_cours"><div class="libelle_a_partir_de">à partir de</div><div class="prix_en_cours">1 100 €</div><div class="nature_prix_en_cours"></div></div>
<div class="lien_plus_info_resa "><a href="studio-cabine-sport-alp-n1.html?&amp;cid=3&amp;action=result&amp;resa_action=result" class="btn" >Plus d'infos</a></div>
</div>
<div id="lasuite"><a href="/booking?page=2&amp;cid=3&amp;action=result&amp;resa_action=result&idMenu=1512" >Plus de résultats</a></div>`;

  it("Risoul : les pièces du critère, et ni point ni capacité inventés", () => {
    const [f] = lireIngenie(RISOUL);
    assert.equal(f?.titre, "Demi chalet de gauche 8 personnes Les renoncules 2");
    assert.equal(f?.pieces, 3);
    assert.equal(f?.capacite, null);
    assert.equal(f?.chambres, null);
    assert.equal(f?.lat, null);
    assert.equal(f?.total, 1300);
  });

  it("Valloire à quatre personnes : le point, le nom et la capacité du logement", () => {
    const [f] = lireIngenie(VALLOIRE);
    assert.equal(f?.titre, "Studio cabine - SPORT ALP N°1");
    assert.deepEqual([f?.lat, f?.lon], [45.165445, 6.430143]);
    assert.equal(f?.adresse, "121 RUE DES GRANDES ALPES");
    assert.equal(f?.capacite, 4);
    assert.equal(f?.chambres, null);
    assert.equal(f?.total, 1100);
  });

  it("les deux pages ont une suite, et la dernière fiche s'arrête avant elle", () => {
    assert.equal(
      pageSuivanteIngenie(RISOUL),
      "/booking?page=2&cid=4&action=result&resa_action=result&idMenu=3794",
    );
    assert.equal(
      pageSuivanteIngenie(VALLOIRE),
      "/booking?page=2&cid=3&action=result&resa_action=result&idMenu=1512",
    );
    for (const page of [RISOUL, VALLOIRE]) {
      assert.ok(!(fragmentsIngenie(page).at(-1) ?? "").includes("lasuite"));
    }
  });
});
