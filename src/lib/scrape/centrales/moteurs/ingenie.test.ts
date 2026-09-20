import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cidDepuisPage,
  configWidgetIngenie,
  estPageResultat,
  TYPE_PRESTATAIRE_DEFAUT,
  typesPrestataireDepuisPage,
  dateIngenie,
  fragmentsIngenie,
  lireIngenie,
  nuitsEntre,
  texteIngenie,
  urlIngenie,
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
