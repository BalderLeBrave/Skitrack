import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fragmentsOpenSystem,
  identiteOpenSystem,
  lireOpenSystem,
  texteOpenSystem,
  urlOpenSystem,
} from "./openSystem.ts";

/**
 * Extrait relevé le 13 septembre 2026 sur
 * `reservation.haute-maurienne-vanoise.com/pr7-tous-nos-hebergements.htm`, pour
 * un séjour du 6 au 13 février 2027 à huit personnes.
 *
 * Le balisage est celui du site, à trois retraits près : la description, la
 * liste des services et le gabarit de tarif resté en commentaire ont été ôtés
 * pour que le gabarit tienne dans un écran. La troisième fiche est une variante
 * construite de la première, au même chemin mais à 1 990 € au lieu de 1 240 € :
 * elle éprouve le dédoublonnage, car une même adresse revient plusieurs fois
 * dans une vraie page, une ligne par lot.
 */
const PAGE = `
<div class="flex-wrap flex-md-nowrap col-sm-8 col-md-12 mx-auto item-produit">
<div class="vignette  col-12 col-md-4 col-lg-3  ">
<a href="/dp7-cabanes-yourtes-de-montagne-val-cenis-sollieres-sardieres/OSCH-40821?DateRecherche=2027-02-06|2027-02-13" title="Réserver Cabanes &amp; Yourtes de Montagne">
<img src="https://img.for-system.com/grandes/push/OP/40821/Proprietaire/1/OP_958E7B0CAFD189FEC8AC86D99C80A25B.jpg" title="Cabanes &amp; Yourtes de Montagne à VAL CENIS SOLLIERES SARDIERES" alt="Cabanes &amp; Yourtes de Montagne VAL CENIS SOLLIERES SARDIERES">
</a>
</div>
<div class="contenu   col-12 col-md-8 col-lg-9">
<div class="texte col-md-8 col-lg-9 col-12">
<h3>Cabanes &amp; Yourtes de Montagne
<div class="ClassementHebe IcoClassement classement-epi3">
</div>
<div class="ClassementHebe IcoClassement label-cime 4cimes "><img src="/images/label-cime/4-cimes.png" alt="4 Cimes" title="4 Cimes" height="20px" align="absmiddle"></div>
<a href="javascript:void(0);" id="item3209" class="js-toggle-carte-localisation" rel="mapid"><span class="NomCommune">VAL CENIS SOLLIERES SARDIERES</span> </a></h3>
<div class="BtCarto">
</div>
<div id="bloc3209" style="display:none;">
<div class="ItemCarto">
<div class="ItemCartoContenu">
<a href="/dp7-cabanes-yourtes-de-montagne-val-cenis-sollieres-sardieres/OSCH-40821?DateRecherche=2027-02-06|2027-02-13">
<div class="ItemCartoDescr">
<div class="colvignette">
<div class="vignette">
<img src="https://img.for-system.com/grandes/push/OP/40821/Proprietaire/1/OP_958E7B0CAFD189FEC8AC86D99C80A25B.jpg" title="Cabanes &amp; Yourtes de Montagne à VAL CENIS SOLLIERES SARDIERES" alt="Cabanes &amp; Yourtes de Montagne VAL CENIS SOLLIERES SARDIERES">
</div>
</div>
<div class="coldonnees">
<div class="ItemCartoDescrLibelle">Cabanes &amp; Yourtes de Montagne</div>
<div class="ItemCartoDescrAdresse">		L'envers<br>
73500 VAL CENIS SOLLIERES SARDIERES</div>
<div class="ItemCartoLien"><div class="btn btn-primary text-center">Réserver</div></div>
</div>
</div>
</a>
</div>
</div>
</div>
<script type="text/javascript" xml:space="preserve">
tabPointCarto.push({
cle:"item3209",
latitude:"4.526054274308790e+001",
longitude:"6.809270381927490e+000",
idHtml : "#bloc3209",
titre : "Cabanes & Yourtes de Montagne"
});
</script>
</div>
<div class="colprix col-md-4 col-lg-3 col-12">
<div class="block-prix col-12 px-0">
<div class="prefix">Prix indicatif</div>
<div class="prix"><span class="partie-entiere">1240</span><span class="partie-decimale"></span> €</div>
</div>
<a href="/dp7-cabanes-yourtes-de-montagne-val-cenis-sollieres-sardieres/OSCH-40821?DateRecherche=2027-02-06|2027-02-13" title="Réserver Cabanes &amp; Yourtes de Montagne" target="" class="btn btn-primary"><span>Réserver</span> </a>
</div>
</div>
</div>
<div
<div class="flex-wrap flex-md-nowrap col-sm-8 col-md-12 mx-auto item-produit">
<div class="vignette  col-12 col-md-4 col-lg-3  ">
<a href="/dp7-hotel-valfrejus-vacances-valfrejus/HRIT-135323?DateRecherche=2027-02-06|2027-02-13" title="Réserver Hôtel Valfréjus Vacances">
<img src="https://img.for-system.com/grandes/push/HRIT/135300/135323/Proprio/HRIT_71C7072E293734F69C19D70543645245.jpg" title="Hôtel Valfréjus Vacances à VALFREJUS" alt="Hôtel Valfréjus Vacances VALFREJUS">
</a>
</div>
<div class="contenu   col-12 col-md-8 col-lg-9">
<div class="texte col-md-8 col-lg-9 col-12">
<h3>Hôtel Valfréjus Vacances
<a href="javascript:void(0);" id="item7401" class="js-toggle-carte-localisation" rel="mapid"><span class="NomCommune">VALFREJUS</span> </a></h3>
<div class="BtCarto">
</div>
<div id="bloc7401" style="display:none;">
<div class="ItemCarto">
<div class="ItemCartoContenu">
<a href="/dp7-hotel-valfrejus-vacances-valfrejus/HRIT-135323?DateRecherche=2027-02-06|2027-02-13">
<div class="ItemCartoDescr">
<div class="colvignette">
<div class="vignette">
<img src="https://img.for-system.com/grandes/push/HRIT/135300/135323/Proprio/HRIT_71C7072E293734F69C19D70543645245.jpg" title="Hôtel Valfréjus Vacances à VALFREJUS" alt="Hôtel Valfréjus Vacances VALFREJUS">
</div>
</div>
<div class="coldonnees">
<div class="ItemCartoDescrLibelle">Hôtel Valfréjus Vacances</div>
<div class="ItemCartoDescrAdresse">		120 Place des Bergers<br>
73500 VALFREJUS</div>
<div class="ItemCartoLien"><div class="btn btn-primary text-center">Réserver</div></div>
</div>
</div>
</a>
</div>
</div>
</div>
<script type="text/javascript" xml:space="preserve">
tabPointCarto.push({
cle:"item7401",
latitude:"4.517320000000000e+001",
longitude:"6.653100000000000e+000",
idHtml : "#bloc7401",
titre : "Hôtel Valfréjus Vacances"
});
</script>
</div>
<div class="colprix col-md-4 col-lg-3 col-12">
<div class="block-prix col-12 px-0">
<div class="prefix">Prix indicatif</div>
<div class="prix"><span class="partie-entiere">1512</span><span class="partie-decimale"></span> €</div>
</div>
<a href="/dp7-hotel-valfrejus-vacances-valfrejus/HRIT-135323?DateRecherche=2027-02-06|2027-02-13" title="Réserver Hôtel Valfréjus Vacances" target="" class="btn btn-primary"><span>Réserver</span> </a>
</div>
</div>
</div>
<div
<div class="flex-wrap flex-md-nowrap col-sm-8 col-md-12 mx-auto item-produit">
<div class="vignette  col-12 col-md-4 col-lg-3  ">
<a href="/dp7-cabanes-yourtes-de-montagne-val-cenis-sollieres-sardieres/OSCH-40821?DateRecherche=2027-02-06|2027-02-13" title="Réserver Cabanes &amp; Yourtes de Montagne">
<img src="https://img.for-system.com/grandes/push/OP/40821/Proprietaire/1/OP_958E7B0CAFD189FEC8AC86D99C80A25B.jpg" title="Cabanes &amp; Yourtes de Montagne à VAL CENIS SOLLIERES SARDIERES" alt="Cabanes &amp; Yourtes de Montagne VAL CENIS SOLLIERES SARDIERES">
</a>
</div>
<div class="contenu   col-12 col-md-8 col-lg-9">
<div class="texte col-md-8 col-lg-9 col-12">
<h3>Cabanes &amp; Yourtes de Montagne
<div class="ClassementHebe IcoClassement classement-epi3">
</div>
<div class="ClassementHebe IcoClassement label-cime 4cimes "><img src="/images/label-cime/4-cimes.png" alt="4 Cimes" title="4 Cimes" height="20px" align="absmiddle"></div>
<a href="javascript:void(0);" id="item3209" class="js-toggle-carte-localisation" rel="mapid"><span class="NomCommune">VAL CENIS SOLLIERES SARDIERES</span> </a></h3>
<div class="BtCarto">
</div>
<div id="bloc3209" style="display:none;">
<div class="ItemCarto">
<div class="ItemCartoContenu">
<a href="/dp7-cabanes-yourtes-de-montagne-val-cenis-sollieres-sardieres/OSCH-40821?DateRecherche=2027-02-06|2027-02-13">
<div class="ItemCartoDescr">
<div class="colvignette">
<div class="vignette">
<img src="https://img.for-system.com/grandes/push/OP/40821/Proprietaire/1/OP_958E7B0CAFD189FEC8AC86D99C80A25B.jpg" title="Cabanes &amp; Yourtes de Montagne à VAL CENIS SOLLIERES SARDIERES" alt="Cabanes &amp; Yourtes de Montagne VAL CENIS SOLLIERES SARDIERES">
</div>
</div>
<div class="coldonnees">
<div class="ItemCartoDescrLibelle">Cabanes &amp; Yourtes de Montagne</div>
<div class="ItemCartoDescrAdresse">		L'envers<br>
73500 VAL CENIS SOLLIERES SARDIERES</div>
<div class="ItemCartoLien"><div class="btn btn-primary text-center">Réserver</div></div>
</div>
</div>
</a>
</div>
</div>
</div>
<script type="text/javascript" xml:space="preserve">
tabPointCarto.push({
cle:"item3209b",
latitude:"4.526054274308790e+001",
longitude:"6.809270381927490e+000",
idHtml : "#bloc3209",
titre : "Cabanes & Yourtes de Montagne"
});
</script>
</div>
<div class="colprix col-md-4 col-lg-3 col-12">
<div class="block-prix col-12 px-0">
<div class="prefix">Prix indicatif</div>
<div class="prix"><span class="partie-entiere">1990</span><span class="partie-decimale"></span> €</div>
</div>
<a href="/dp7-cabanes-yourtes-de-montagne-val-cenis-sollieres-sardieres/OSCH-40821?DateRecherche=2027-02-06|2027-02-13" title="Réserver Cabanes &amp; Yourtes de Montagne" target="" class="btn btn-primary"><span>Réserver</span> </a>
</div>
</div>
</div>
<div
`;

describe("Open System : lire une page de résultats datés", () => {
  it("rend un logement par chemin, au prix le plus bas", () => {
    const fiches = lireOpenSystem(PAGE);
    assert.equal(fragmentsOpenSystem(PAGE).length, 3, "trois fiches dans la page");
    assert.equal(fiches.length, 2, "mais deux logements distincts");
    const chemins = fiches.map((f) => f.chemin).sort();
    assert.deepEqual(chemins, [
      "/dp7-cabanes-yourtes-de-montagne-val-cenis-sollieres-sardieres/OSCH-40821",
      "/dp7-hotel-valfrejus-vacances-valfrejus/HRIT-135323",
    ]);
    const yourtes = fiches.find((f) => f.chemin.includes("cabanes-yourtes"));
    assert.equal(yourtes?.total, 1240, "le lot à 1 990 € ne remplace pas celui à 1 240 €");
  });

  it("lit le titre sans la commune que le titre traîne derrière lui", () => {
    const f = lireOpenSystem(PAGE).find((x) => x.chemin.includes("cabanes-yourtes"));
    // Le `<h3>` porte le nom, puis des pastilles de classement, puis un lien
    // « voir sur la carte » qui contient le nom de la commune. Seul le nom
    // compte : « Cabanes & Yourtes de Montagne VAL CENIS SOLLIERES SARDIERES »
    // serait un titre faux.
    assert.equal(f?.titre, "Cabanes & Yourtes de Montagne");
    assert.equal(f?.commune, "VAL CENIS SOLLIERES SARDIERES");
  });

  it("prend la commune dans son champ, et non dans le code postal de l'adresse", () => {
    // `<span class="NomCommune">` est le champ que le gabarit lui consacre. La
    // déduire du code postal laissait la commune vide dès qu'une adresse n'en
    // portait pas — ce qui est fréquent sur les fiches sans numéro de rue.
    const sansCp = PAGE.replace(/73500 VAL CENIS SOLLIERES SARDIERES/g, "Hameau de l'envers");
    const f = lireOpenSystem(sansCp).find((x) => x.chemin.includes("cabanes-yourtes"));
    assert.equal(f?.commune, "VAL CENIS SOLLIERES SARDIERES");
  });

  it("lit le classement que la centrale affiche", () => {
    // `classement-epi3` est une pastille du `<h3>` : elle était affichée par la
    // centrale, et le connecteur ne la lisait pas.
    const fiches = lireOpenSystem(PAGE);
    assert.equal(fiches.find((x) => x.chemin.includes("cabanes-yourtes"))?.classement, "3 épis");
    // Rien n'est inventé pour celui qui n'en porte pas.
    assert.equal(fiches.find((x) => x.chemin.includes("valfrejus"))?.classement, null);
  });

  it("un bloc de tarif vide n'est pas une fiche à jeter", () => {
    // Le bloc est là, le montant manque : la centrale liste ce logement sans
    // en publier le prix. Zéro le dit ; le supprimer ne dirait rien.
    const vide = PAGE.replace(
      /<span class="partie-entiere">1512<\/span>/,
      '<span class="partie-entiere"></span>',
    );
    const f = lireOpenSystem(vide).find((x) => x.chemin.includes("valfrejus"));
    assert.equal(f?.total, 0);
    assert.equal(f?.titre, "Hôtel Valfréjus Vacances");
  });

  it("lit les coordonnées écrites en notation scientifique", () => {
    const f = lireOpenSystem(PAGE).find((x) => x.chemin.includes("cabanes-yourtes"));
    // `latitude:"4.526054274308790e+001"` vaut 45,26 et non 4,5.
    assert.ok(f?.lat != null && Math.abs(f.lat - 45.2605) < 0.001, `latitude lue : ${f?.lat}`);
    assert.ok(f?.lon != null && Math.abs(f.lon - 6.8092) < 0.001, `longitude lue : ${f?.lon}`);
  });

  it("garde l'étiquette de la centrale telle qu'elle l'écrit", () => {
    // « Prix indicatif » est ce que la centrale affiche. On ne le traduit pas
    // en « total du séjour », et on ne le tait pas non plus.
    for (const f of lireOpenSystem(PAGE)) assert.equal(f.etiquette, "Prix indicatif");
  });

  it("rapporte la photo et le lien de la fiche", () => {
    const f = lireOpenSystem(PAGE).find((x) => x.chemin.includes("valfrejus"));
    assert.equal(f?.total, 1512);
    assert.equal(f?.reference, "HRIT-135323");
    assert.ok(f?.photo?.startsWith("https://img.for-system.com/"), `photo lue : ${f?.photo}`);
  });

  it("une fiche sans prix n'est pas rendue", () => {
    // C'est l'état sans dates : la page liste, mais ne vend pas. Une annonce
    // sans prix n'a rien à faire dans une comparaison de prix.
    const sansPrix = PAGE.replace(/<div class="prix">[\s\S]*?<\/div>/g, "");
    assert.equal(lireOpenSystem(sansPrix).length, 0);
  });

  it("l'URL datée porte le paramètre que le moteur attend", () => {
    // `datearrivee` et `datedepart` sont des noms de champs de saisie, pas des
    // noms de paramètres : les passer en requête rend une erreur 500.
    const u = urlOpenSystem("https://exemple.test/", "/pr7-tous.htm", {
      checkIn: "2027-02-06",
      checkOut: "2027-02-13",
      guests: 8,
    });
    const q = new URL(u).searchParams;
    assert.equal(new URL(u).pathname, "/pr7-tous.htm");
    assert.equal(q.get("DateRecherche"), "2027-02-06|2027-02-13");
    assert.equal(q.get("nbpers"), "8");
    assert.equal(q.get("NbParPage"), "50");
    assert.equal(q.get("datearrivee"), null);
  });

  it("le numéro de rubrique ne fait pas partie de l'identité", () => {
    assert.equal(
      identiteOpenSystem("/dp7-la-cle-des-champs-val-cenis-lanslebourg/OSHO-38735"),
      "la-cle-des-champs-val-cenis-lanslebourg/OSHO-38735",
    );
    assert.equal(
      identiteOpenSystem("/dp8-la-cle-des-champs-val-cenis-lanslebourg/OSHO-38735"),
      identiteOpenSystem("/dp7-la-cle-des-champs-val-cenis-lanslebourg/OSHO-38735"),
    );
  });

  it("le même logement trouvé sous deux rubriques ne compte qu'une fois", () => {
    // Chaque rubrique de la centrale réécrit le chemin avec son propre numéro.
    // Compter les chemins plutôt que les logements gonflait le relevé de moitié :
    // cent cinquante-huit annonces annoncées pour cent sept logements réels.
    const deuxRubriques = PAGE + PAGE.replace(/\/dp7-/g, "/dp8-");
    assert.equal(fragmentsOpenSystem(deuxRubriques).length, 6);
    assert.equal(lireOpenSystem(deuxRubriques).length, 2);
  });

  it("le texte visible perd les balises et les commentaires", () => {
    assert.equal(texteOpenSystem("<b>a</b> <!-- b --> &amp; <i>c</i>"), "a & c");
  });
});
