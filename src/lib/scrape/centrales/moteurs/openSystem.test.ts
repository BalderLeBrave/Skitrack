import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appliquerRegleOpenSystem,
  fragmentsOpenSystem,
  horsRegleOpenSystem,
  identiteOpenSystem,
  infoProduitOpenSystem,
  lireOpenSystem,
  texteOpenSystem,
  urlOpenSystem,
  type FicheOpenSystem,
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

/**
 * Relevé du 25 septembre 2026 sur `reservation.haute-maurienne-vanoise.com`,
 * du 6 au 13 février 2027 à quatre personnes : trois fiches de
 * `/pr75-appartements-de-particuliers.htm` (« Le Bois Joli », « Résidence Le
 * Thabor D - apt 132 », « Chalet Arolle ») et une de
 * `/pr7-tous-nos-hebergements.htm` (« CAMPING LA BUIDONNIERE*** »).
 *
 * Le balisage est celui du site, à trois retraits près : la description (qui
 * nomme les loueurs), la liste des services et les commentaires du gabarit ont
 * été ôtés, et les lignes ont perdu leur retrait. Le bloc `InfoProduit`, lui,
 * est intact.
 */
const MEUBLES = `
<div
class="flex-wrap flex-md-nowrap col-sm-8 col-md-12 mx-auto item-produit">
<div class="vignette  col-12 col-md-4 col-lg-3  ">
<a href="/dp75-le-bois-joli-4-personnes-bonneval-sur-arc/OSMB-69279-3?DateRecherche=2027-02-06|2027-02-13" title="Réserver Le Bois Joli 4 personnes">
<img src="https://img.for-system.com/grandes/push/OP/69279/Hebergement/3/OP_FCE227600DB7451E4DF80DEE16AEE56D.jpg" title="Le Bois Joli 4 personnes à BONNEVAL SUR ARC" alt="Le Bois Joli 4 personnes BONNEVAL SUR ARC">
</a>
</div>
<div class="contenu   col-12 col-md-8 col-lg-9">
<div class="texte col-md-8 col-lg-9 col-12">
<h3>Le Bois Joli 4 personnes
<div class="ClassementHebe IcoClassement classement-etoile3">
</div>
<div class="ClassementHebe IcoClassement label-cime 4cimes "><img src="/images/label-cime/4-cimes.png" alt="4 Cimes" title="4 Cimes" height="20px" align="absmiddle"></div>
<a href="javascript:void(0);" id="item4512" class="js-toggle-carte-localisation" rel="mapid"><span class="NomCommune">BONNEVAL SUR ARC</span> </a></h3>
<div id="bloc4512" style="display:none;">
<div class="ItemCarto">
<div class="ItemCartoContenu">
<a href="/dp75-le-bois-joli-4-personnes-bonneval-sur-arc/OSMB-69279-3?DateRecherche=2027-02-06|2027-02-13">
<div class="ItemCartoDescr">
<div class="colvignette">
<div class="vignette">
<img src="https://img.for-system.com/grandes/push/OP/69279/Hebergement/3/OP_FCE227600DB7451E4DF80DEE16AEE56D.jpg" title="Le Bois Joli 4 personnes à BONNEVAL SUR ARC" alt="Le Bois Joli 4 personnes BONNEVAL SUR ARC">
</div>
</div>
<div class="coldonnees">
<div class="ItemCartoDescrLibelle">Le Bois Joli 4 personnes</div>
<div class="ItemCartoDescrAdresse">		rue du lavoir<br>
73480 BONNEVAL SUR ARC</div>
<div class="ItemCartoLien"><div class="btn btn-primary text-center">Réserver</div></div>
</div>
</div>
</a>
</div>
</div>
</div>
<script type="text/javascript" xml:space="preserve">
tabPointCarto.push({
cle:"item4512",
latitude:"4.537285437823390e+001",
longitude:"7.048107539641400e+000",
idHtml : "#bloc4512",
titre : "Le Bois Joli 4 personnes"
});
</script>
<div class="osw-badge__stroke">Annonce d'un particulier</div>
</div>
<div class="colprix col-md-4 col-lg-3 col-12">
<div class="InfoProduit col-12 px-0 pb-1 mb-auto">
<ul class="li-inline">
<li>Appartement 4 pièces </li>
<li><strong>Capacité : </strong>4 pers.</li>
</ul>
</div>
<div class="block-prix col-12 px-0">
<div class="prefix">Prix indicatif</div>
<div class="prix"><span class="partie-entiere">1690</span><span class="partie-decimale"></span> €</div>
</div>
<a href="/dp75-le-bois-joli-4-personnes-bonneval-sur-arc/OSMB-69279-3?DateRecherche=2027-02-06|2027-02-13" title="Réserver Le Bois Joli 4 personnes" target="" class="btn btn-primary"><span>Réserver</span> </a>
</div>
</div>
</div>
<div
class="flex-wrap flex-md-nowrap col-sm-8 col-md-12 mx-auto item-produit">
<div class="vignette  col-12 col-md-4 col-lg-3  ">
<a href="/dp75-residence-le-thabor-d-apt-132-valfrejus/OSMB-132368-1?DateRecherche=2027-02-06|2027-02-13" title="Réserver Résidence Le Thabor D - apt 132">
<img src="https://img.for-system.com/grandes/push/OP/132368/Hebergement/1/OP_F0919FF0CB6AF2880E37E6765982D82A.jpg" title="Résidence Le Thabor D - apt 132 à VALFREJUS" alt="Résidence Le Thabor D - apt 132 VALFREJUS">
</a>
</div>
<div class="contenu   col-12 col-md-8 col-lg-9">
<div class="texte col-md-8 col-lg-9 col-12">
<h3>Résidence Le Thabor D - apt 132
<a href="javascript:void(0);" id="item5736" class="js-toggle-carte-localisation" rel="mapid"><span class="NomCommune">VALFREJUS</span> </a></h3>
<div id="bloc5736" style="display:none;">
<div class="ItemCarto">
<div class="ItemCartoContenu">
<a href="/dp75-residence-le-thabor-d-apt-132-valfrejus/OSMB-132368-1?DateRecherche=2027-02-06|2027-02-13">
<div class="ItemCartoDescr">
<div class="colvignette">
<div class="vignette">
<img src="https://img.for-system.com/grandes/push/OP/132368/Hebergement/1/OP_F0919FF0CB6AF2880E37E6765982D82A.jpg" title="Résidence Le Thabor D - apt 132 à VALFREJUS" alt="Résidence Le Thabor D - apt 132 VALFREJUS">
</div>
</div>
<div class="coldonnees">
<div class="ItemCartoDescrLibelle">Résidence Le Thabor D - apt 132</div>
<div class="ItemCartoDescrAdresse">		Résidence Le Thabor D - Rue des Bettets<br>
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
cle:"item5736",
latitude:"4.517298933283200e+001",
longitude:"6.651891659585210e+000",
idHtml : "#bloc5736",
titre : "Résidence Le Thabor D - apt 132"
});
</script>
<div class="osw-badge__stroke">Annonce d'un particulier</div>
</div>
<div class="colprix col-md-4 col-lg-3 col-12">
<div class="InfoProduit col-12 px-0 pb-1 mb-auto">
<ul class="li-inline">
<li>Studio </li>
<li><strong>Capacité : </strong>4 pers.</li>
</ul>
</div>
<div class="block-prix col-12 px-0">
<div class="prefix">Prix indicatif</div>
<div class="prix"><span class="partie-entiere">800</span><span class="partie-decimale"></span> €</div>
</div>
<a href="/dp75-residence-le-thabor-d-apt-132-valfrejus/OSMB-132368-1?DateRecherche=2027-02-06|2027-02-13" title="Réserver Résidence Le Thabor D - apt 132" target="" class="btn btn-primary"><span>Réserver</span> </a>
</div>
</div>
</div>
<div
class="flex-wrap flex-md-nowrap col-sm-8 col-md-12 mx-auto item-produit">
<div class="vignette  col-12 col-md-4 col-lg-3  ">
<a href="/dp75-chalet-arolle-aussois/OSMB-123681-1?DateRecherche=2027-02-06|2027-02-13" title="Réserver Chalet Arolle">
<img src="https://img.for-system.com/grandes/push/OP/123681/Hebergement/1/OP_72C19FF0C5946ACF27D2EB5DE0318B2F.jpg" title="Chalet Arolle à AUSSOIS" alt="Chalet Arolle AUSSOIS">
</a>
</div>
<div class="contenu   col-12 col-md-8 col-lg-9">
<div class="texte col-md-8 col-lg-9 col-12">
<h3>Chalet Arolle
<a href="javascript:void(0);" id="item4896" class="js-toggle-carte-localisation" rel="mapid"><span class="NomCommune">AUSSOIS</span> </a></h3>
<div id="bloc4896" style="display:none;">
<div class="ItemCarto">
<div class="ItemCartoContenu">
<a href="/dp75-chalet-arolle-aussois/OSMB-123681-1?DateRecherche=2027-02-06|2027-02-13">
<div class="ItemCartoDescr">
<div class="colvignette">
<div class="vignette">
<img src="https://img.for-system.com/grandes/push/OP/123681/Hebergement/1/OP_72C19FF0C5946ACF27D2EB5DE0318B2F.jpg" title="Chalet Arolle à AUSSOIS" alt="Chalet Arolle AUSSOIS">
</div>
</div>
<div class="coldonnees">
<div class="ItemCartoDescrLibelle">Chalet Arolle</div>
<div class="ItemCartoDescrAdresse">		Camping la Buidonnière - n°72<br>
73500 AUSSOIS</div>
<div class="ItemCartoLien"><div class="btn btn-primary text-center">Réserver</div></div>
</div>
</div>
</a>
</div>
</div>
</div>
<script type="text/javascript" xml:space="preserve">
tabPointCarto.push({
cle:"item4896",
latitude:"4.522413788504990e+001",
longitude:"6.744562377007540e+000",
idHtml : "#bloc4896",
titre : "Chalet Arolle"
});
</script>
<div class="osw-badge__stroke">Annonce d'un particulier</div>
</div>
<div class="colprix col-md-4 col-lg-3 col-12">
<div class="InfoProduit col-12 px-0 pb-1 mb-auto">
<ul class="li-inline">
<li>Gîte 3 pièces </li>
<li><strong>Capacité : </strong>4 pers.</li>
</ul>
</div>
<div class="block-prix col-12 px-0">
<div class="prefix">Prix indicatif</div>
<div class="prix"><span class="partie-entiere">850</span><span class="partie-decimale"></span> €</div>
</div>
<a href="/dp75-chalet-arolle-aussois/OSMB-123681-1?DateRecherche=2027-02-06|2027-02-13" title="Réserver Chalet Arolle" target="" class="btn btn-primary"><span>Réserver</span> </a>
</div>
</div>
</div>
<div
class="flex-wrap flex-md-nowrap col-sm-8 col-md-12 mx-auto item-produit">
<div class="vignette  col-12 col-md-4 col-lg-3  ">
<a href="/dp7-camping-la-buidonniere-aussois/MARK-133812-HLL100*133812?DateRecherche=2027-02-06|2027-02-13" title="Réserver CAMPING LA BUIDONNIERE***">
<img src="https://img.for-system.com/grandes/push/MARK/133812/Hebergement/HLL100_133812/MARK_14BC98DC84FB4EC2B5DE366E5A1ECE69.jpg" title="CAMPING LA BUIDONNIERE*** à AUSSOIS" alt="CAMPING LA BUIDONNIERE*** AUSSOIS">
</a>
</div>
<div class="contenu   col-12 col-md-8 col-lg-9">
<div class="texte col-md-8 col-lg-9 col-12">
<h3>CAMPING LA BUIDONNIERE***
<div class="ClassementHebe IcoClassement classement-etoile3">
</div>
<div class="ClassementHebe IcoClassement label-cime 4cimes "><img src="/images/label-cime/4-cimes.png" alt="4 Cimes" title="4 Cimes" height="20px" align="absmiddle"></div>
<a href="javascript:void(0);" id="item7236" class="js-toggle-carte-localisation" rel="mapid"><span class="NomCommune">AUSSOIS</span> </a></h3>
<div id="bloc7236" style="display:none;">
<div class="ItemCarto">
<div class="ItemCartoContenu">
<a href="/dp7-camping-la-buidonniere-aussois/MARK-133812-HLL100*133812?DateRecherche=2027-02-06|2027-02-13">
<div class="ItemCartoDescr">
<div class="colvignette">
<div class="vignette">
<img src="https://img.for-system.com/grandes/push/MARK/133812/Hebergement/HLL100_133812/MARK_14BC98DC84FB4EC2B5DE366E5A1ECE69.jpg" title="CAMPING LA BUIDONNIERE*** à AUSSOIS" alt="CAMPING LA BUIDONNIERE*** AUSSOIS">
</div>
</div>
<div class="coldonnees">
<div class="ItemCartoDescrLibelle">CAMPING LA BUIDONNIERE***</div>
<div class="ItemCartoDescrAdresse">		Route de Cottériat<br>
73500 AUSSOIS</div>
<div class="ItemCartoLien"><div class="btn btn-primary text-center">Réserver</div></div>
</div>
</div>
</a>
</div>
</div>
</div>
<script type="text/javascript" xml:space="preserve">
tabPointCarto.push({
cle:"item7236",
latitude:"4.522446931669963e+001",
longitude:"6.745685746963437e+000",
idHtml : "#bloc7236",
titre : "CAMPING LA BUIDONNIERE***"
});
</script>
<div class="osw-badge__stroke">Annonce professionnelle</div>
</div>
<div class="colprix col-md-4 col-lg-3 col-12">
<div class="InfoProduit col-12 px-0 pb-1 mb-auto">
<ul class="li-inline">
<li>Chalet </li>
<li><strong>Capacité : </strong>4 pers.</li>
</ul>
</div>
<div class="block-prix col-12 px-0">
<div class="prefix">Prix indicatif</div>
<div class="prix"><span class="partie-entiere">1060</span><span class="partie-decimale"></span> €</div>
</div>
<a href="/dp7-camping-la-buidonniere-aussois/MARK-133812-HLL100*133812?DateRecherche=2027-02-06|2027-02-13" title="Réserver CAMPING LA BUIDONNIERE***" target="" class="btn btn-primary"><span>Réserver</span> </a>
</div>
</div>
</div>
<div
`;

/**
 * Même relevé, rubrique `/pr93-appartements-de-professionnels.htm` : « Les
 * Balcons de Val Cenis le Haut », une résidence sans bloc `InfoProduit`, réduite
 * de la même façon.
 */
const RESIDENCE_PR93 = `
<div
class="flex-wrap flex-md-nowrap col-sm-8 col-md-12 mx-auto item-produit">
<div class="vignette  col-12 col-md-4 col-lg-3  ">
<a href="/dp93-les-balcons-de-val-cenis-le-haut-val-cenis-lanslevillard/RESAX-132362?DateRecherche=2027-02-06|2027-02-13" title="Réserver Les Balcons de Val Cenis le Haut">
<img src="https://img.for-system.com/grandes/push/RESAX/LESBALCONS/5/Pro/RESAX_7B17687B2A6A6E201D446B71EF0F0D00.jpg" title="Les Balcons de Val Cenis le Haut à VAL CENIS LANSLEVILLARD" alt="Les Balcons de Val Cenis le Haut VAL CENIS LANSLEVILLARD">
</a>
</div>
<div class="contenu   col-12 col-md-8 col-lg-9">
<div class="texte col-md-8 col-lg-9 col-12">
<h3>Les Balcons de Val Cenis le Haut
<a href="javascript:void(0);" id="item6273" class="js-toggle-carte-localisation" rel="mapid"><span class="NomCommune">VAL CENIS LANSLEVILLARD</span> </a></h3>
<div id="bloc6273" style="display:none;">
<div class="ItemCarto">
<div class="ItemCartoContenu">
<a href="/dp93-les-balcons-de-val-cenis-le-haut-val-cenis-lanslevillard/RESAX-132362?DateRecherche=2027-02-06|2027-02-13">
<div class="ItemCartoDescr">
<div class="colvignette">
<div class="vignette">
<img src="https://img.for-system.com/grandes/push/RESAX/LESBALCONS/5/Pro/RESAX_7B17687B2A6A6E201D446B71EF0F0D00.jpg" title="Les Balcons de Val Cenis le Haut à VAL CENIS LANSLEVILLARD" alt="Les Balcons de Val Cenis le Haut VAL CENIS LANSLEVILLARD">
</div>
</div>
<div class="coldonnees">
<div class="ItemCartoDescrLibelle">Les Balcons de Val Cenis le Haut</div>
<div class="ItemCartoDescrAdresse">		188, Rue sur Léva LANSLEVILLARD<br>
73480 VAL CENIS LANSLEVILLARD</div>
<div class="ItemCartoLien"><div class="btn btn-primary text-center">Réserver</div></div>
</div>
</div>
</a>
</div>
</div>
</div>
<script type="text/javascript" xml:space="preserve">
tabPointCarto.push({
cle:"item6273",
latitude:"4.529058684120138e+001",
longitude:"6.922736883626600e+000",
idHtml : "#bloc6273",
titre : "Les Balcons de Val Cenis le Haut"
});
</script>
</div>
<div class="colprix col-md-4 col-lg-3 col-12">
<div class="block-prix col-12 px-0">
<div class="prefix">Prix indicatif</div>
<div class="prix"><span class="partie-entiere">1624</span><span class="partie-decimale"></span> €</div>
</div>
<a href="/dp93-les-balcons-de-val-cenis-le-haut-val-cenis-lanslevillard/RESAX-132362?DateRecherche=2027-02-06|2027-02-13" title="Réserver Les Balcons de Val Cenis le Haut" target="" class="btn btn-primary"><span>Réserver</span> </a>
</div>
</div>
</div>
<div
`;

describe("Open System : le type et la capacité que la liste publie déjà", () => {
  it("lit le type, la capacité et les pièces du bloc InfoProduit", () => {
    const fiches = lireOpenSystem(MEUBLES);
    assert.equal(fiches.length, 4);
    const bois = fiches.find((f) => f.chemin.includes("bois-joli"));
    assert.equal(bois?.type, "Appartement 4 pièces");
    assert.equal(bois?.capacite, 4);
    assert.equal(bois?.pieces, 4);
    const arolle = fiches.find((f) => f.chemin.includes("chalet-arolle"));
    assert.equal(arolle?.type, "Gîte 3 pièces");
    assert.equal(arolle?.pieces, 3);
  });

  it("un studio est un type publié, sans nombre de pièces écrit", () => {
    // « Studio » ne porte pas de chiffre : `pieces` reste vide ici, et c'est le
    // lecteur de texte du dépôt (`annoncer`) qui en fait une pièce et aucune
    // chambre, comme il le fait pour tout « studio » publié.
    const f = lireOpenSystem(MEUBLES).find((x) => x.chemin.includes("thabor-d"));
    assert.equal(f?.type, "Studio");
    assert.equal(f?.capacite, 4);
    assert.equal(f?.pieces, null);
  });

  it("les hôtels et l'insolite n'ont ni type ni capacité publiés", () => {
    // La page du premier gabarit : « Cabanes & Yourtes de Montagne » et
    // « Hôtel Valfréjus Vacances ». Pas de bloc InfoProduit, donc rien.
    for (const f of lireOpenSystem(PAGE)) {
      assert.equal(f.type, null);
      assert.equal(f.capacite, null);
      assert.equal(f.pieces, null);
    }
  });

  it("la capacité ne se lit ni dans le titre ni dans un commentaire", () => {
    // « Le Bois Joli 4 personnes » dit 4 dans son titre : le bloc ôté, la
    // capacité reste vide. Un bloc resté en commentaire ne compte pas non plus.
    const sansBloc = MEUBLES.replace(/<div class="InfoProduit[\s\S]*?<\/ul>/g, "");
    const bois = lireOpenSystem(sansBloc).find((f) => f.chemin.includes("bois-joli"));
    assert.equal(bois?.capacite, null);
    assert.equal(bois?.type, null);
    const commente = MEUBLES.replace(/(<div class="InfoProduit[\s\S]*?<\/ul>)/g, "<!--$1-->");
    assert.equal(
      lireOpenSystem(commente).find((f) => f.chemin.includes("bois-joli"))?.capacite,
      null,
    );
    assert.deepEqual(infoProduitOpenSystem("<div>rien</div>"), {
      type: null,
      capacite: null,
      pieces: null,
    });
  });

  it("garde un meublé, écarte le camping publié « Chalet » ; l'adresse n'est pas lue", () => {
    const fiches = lireOpenSystem(MEUBLES);
    const motif = (morceau: string) => {
      const f = fiches.find((x) => x.chemin.includes(morceau));
      assert.ok(f, morceau);
      return horsRegleOpenSystem(f);
    };
    assert.equal(motif("bois-joli"), null);
    assert.equal(motif("thabor-d"), null);
    // Publié « Chalet », mais c'est un chalet de camping (titre et chemin).
    assert.equal(motif("camping-la-buidonniere"), "camping");
    // Publié « Gîte 3 pièces » ; seule son adresse, « Camping la Buidonnière -
    // n°72 », parle de camping, et l'adresse n'est jamais lue.
    assert.equal(motif("chalet-arolle"), null);
  });

  it("un appartement de la rue du Camping est gardé", () => {
    const [thabor] = lireOpenSystem(MEUBLES).filter((x) => x.chemin.includes("thabor-d"));
    assert.ok(thabor);
    const rue: FicheOpenSystem = { ...thabor, adresse: "12 rue du Camping, 73500 VALFREJUS" };
    assert.equal(horsRegleOpenSystem(rue), null);
    // Dans le titre non plus, une rue du Camping n'est pas un camping.
    assert.equal(horsRegleOpenSystem({ ...rue, titre: "Studio 12 rue du Camping" }), null);
  });

  it("un type publié inconnu est gardé, et nommé", () => {
    const [thabor] = lireOpenSystem(MEUBLES).filter((x) => x.chemin.includes("thabor-d"));
    assert.ok(thabor);
    const mazot: FicheOpenSystem = { ...thabor, type: "Mazot" };
    assert.equal(horsRegleOpenSystem(mazot), null);
    const { gardees, ecartees, inconnus } = appliquerRegleOpenSystem([
      { chemin: "/pr7-tous-nos-hebergements.htm", fiches: [mazot] },
    ]);
    assert.equal(gardees.length, 1);
    assert.equal(ecartees.size, 0);
    assert.deepEqual([...(inconnus.get("Mazot") ?? [])], [mazot.identite]);
  });

  it("écarte une fiche sans type publié hors des rubriques de location : hôtel, insolite", () => {
    for (const f of lireOpenSystem(PAGE)) assert.equal(horsRegleOpenSystem(f), "type non publié");
  });

  it("garde une fiche sans type que la centrale range sous une rubrique de location", () => {
    // « Les Balcons de Val Cenis le Haut », sans bloc InfoProduit, paraît sous
    // « appartements de professionnels » : la rubrique dit le type.
    const [balcons] = lireOpenSystem(RESIDENCE_PR93);
    assert.ok(balcons);
    assert.equal(balcons.type, null);
    assert.equal(balcons.capacite, null);
    assert.equal(horsRegleOpenSystem(balcons), "type non publié");
    assert.equal(horsRegleOpenSystem(balcons, true), null);
    // Le camping, lui, reste écarté même rangé en location : la Buidonnière
    // paraît aussi sous « appartements de professionnels ».
    assert.equal(
      horsRegleOpenSystem({ ...balcons, titre: "CAMPING LA BUIDONNIERE***" }, true),
      "camping",
    );
    // Un type publié hors de la liste n'est pas repêché par la rubrique.
    assert.equal(horsRegleOpenSystem({ ...balcons, type: "Hôtel" }, true), "hôtel");
  });

  it("applique la règle à un relevé : la rubrique de location vaut pour toutes les pages", () => {
    const pages = [
      { chemin: "/pr7-tous-nos-hebergements.htm", fiches: lireOpenSystem(PAGE + MEUBLES) },
      {
        chemin: "/pr93-appartements-de-professionnels.htm",
        fiches: lireOpenSystem(RESIDENCE_PR93),
      },
    ];
    const location = [
      "/pr75-appartements-de-particuliers.htm",
      "/pr93-appartements-de-professionnels.htm",
    ];
    const { gardees, ecartees, inconnus } = appliquerRegleOpenSystem(pages, location);
    assert.deepEqual(gardees.map((f) => f.identite).sort(), [
      "chalet-arolle-aussois/OSMB-123681-1",
      "le-bois-joli-4-personnes-bonneval-sur-arc/OSMB-69279-3",
      "les-balcons-de-val-cenis-le-haut-val-cenis-lanslevillard/RESAX-132362",
      "residence-le-thabor-d-apt-132-valfrejus/OSMB-132368-1",
    ]);
    assert.deepEqual([...ecartees.keys()].sort(), ["camping", "type non publié"]);
    // Les cabanes et l'hôtel du premier gabarit, comptés une fois chacun.
    assert.equal(ecartees.get("type non publié")?.size, 2);
    // La Buidonnière seule : le Chalet Arolle n'a que son adresse au camping.
    assert.equal(ecartees.get("camping")?.size, 1);
    // Tous les types publiés du gabarit sont connus de la règle.
    assert.equal(inconnus.size, 0);
    // Sans rubrique de location déclarée, la résidence est écartée comme l'hôtel.
    const sans = appliquerRegleOpenSystem(pages);
    assert.equal(sans.ecartees.get("type non publié")?.size, 3);
  });

  it("ne cherche pas « refuge » dans le nom d'un appartement", () => {
    // « Le Refuge », à Bessans, est publié « Appartement 2 pièces » : ses
    // champs tels que `lireOpenSystem` les rend, relevé du 25 septembre 2026.
    assert.equal(
      horsRegleOpenSystem({
        type: "Appartement 2 pièces",
        titre: "Le Refuge",
        chemin: "/dp75-le-refuge-bessans/OSMB-401-5",
      }),
      null,
    );
  });
});
