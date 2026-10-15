import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Listing } from "../listings.ts";
import { contenuDeFiche } from "./contenuFiche.ts";
import { aEquipement, equipementsDe } from "./ficheEnrichie.ts";

const fx = (p: string) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), "utf8");
const valeurs = (c: ReturnType<typeof contenuDeFiche>) =>
  Object.fromEntries((c?.amenities ?? []).filter((e) => e.valeur !== "inconnu").map((e) => [e.cle, e.valeur]));

describe("contenuDeFiche : Cimalpes, extraits réels", () => {
  const c = contenuDeFiche(
    "https://cimalpes.com/fr/location-alpe-d-huez/chalet-delta-36/?date_debut=06/02/2027",
    fx("cimalpes-fiche-chalet-delta-36.html"),
  );

  it("le descriptif, sans le paragraphe de la station qui le suit", () => {
    assert.match(c?.description ?? "", /^Niché dans un environnement exceptionnel, au cœur des sapins/);
    assert.match(c?.description ?? "", /belle terrasse ainsi que d'une vue imprenable sur les massifs environnants\.$/);
    assert.doesNotMatch(c?.description ?? "", /Alpe d.Huez/);
  });

  it("les équipements, les services inclus et les points forts ; jamais une absence", () => {
    assert.deepEqual(valeurs(c), { balcon: "oui", wifi: "oui", laveVaisselle: "oui", linge: "oui", casierSkis: "oui" });
  });

  it("l'agencement et les distances ne sont pas des équipements (« Sèche-serviettes » n'est pas du linge)", () => {
    const seul = fx("cimalpes-fiche-chalet-delta-36.html").replace(/<p>Linge de[^<]*<\/p>/g, "");
    assert.equal(valeurs(contenuDeFiche("https://cimalpes.com/fr/x/", seul)).linge, undefined);
  });

  it("chaque libellé des listes, tel quel et une fois, sous sa rubrique : les douze clés n'en gardaient que cinq", () => {
    assert.deepEqual(c?.equipementsPublies, [
      { libelle: "Casier à ski", groupe: "Généraux" },
      { libelle: "Lit bébé", groupe: "Généraux" },
      { libelle: "TV", groupe: "Multimédia" },
      { libelle: "Wifi", groupe: "Multimédia" },
      { libelle: "Appareil à fondue", groupe: "Electroménager" },
      { libelle: "Appareil à raclette", groupe: "Electroménager" },
      { libelle: "Aspirateur", groupe: "Electroménager" },
      { libelle: "Bouilloire", groupe: "Electroménager" },
      { libelle: "Combinaison four & micro-onde", groupe: "Electroménager" },
      { libelle: "Lave-vaisselle", groupe: "Electroménager" },
      { libelle: "Machine à café Nespresso", groupe: "Electroménager" },
      { libelle: "Plaques de cuisson à induction", groupe: "Electroménager" },
      { libelle: "Réfrigérateur", groupe: "Electroménager" },
      { libelle: "Accueil en agence", groupe: "Accueil" },
      { libelle: "Produits de salle de bains", groupe: "Accueil" },
      { libelle: "Linge de bain supplémentaire durant le séjour sur demande", groupe: "Ménage & Linge" },
      { libelle: "Linge de lit supplémentaire durant le séjour sur demande", groupe: "Ménage & Linge" },
      { libelle: "Linge de maison et de bain", groupe: "Ménage & Linge" },
      { libelle: "Lits faits à l'arrivée", groupe: "Ménage & Linge" },
      { libelle: "Ménage de fin de séjour (hors cuisine)", groupe: "Ménage & Linge" },
      { libelle: "Ménage supplémentaire durant le séjour sur demande", groupe: "Ménage & Linge" },
      // Les points forts : « Terrasse » n'est que là ; « Casier à skis »
      // n'est pas « Casier à ski », il reste.
      { libelle: "Terrasse" },
      { libelle: "Balcon" },
      { libelle: "Casier à skis" },
    ]);
    // Posés sur une annonce Cimalpes (jamais de fiche enrichie) : les cinq
    // clés, sous le libellé de la source, et tout le reste.
    const l = { id: "cim-1", source: "Cimalpes", amenities: c?.amenities, equipementsPublies: c?.equipementsPublies } as Listing;
    assert.deepEqual(
      equipementsDe(l)?.map((e) => [e.id, e.libelle]),
      [
        ["balcon", "Terrasse"],
        ["wifi", "Wifi"],
        ["lave_vaisselle", "Lave-vaisselle"],
        ["linge_fourni", "Linge de lit supplémentaire durant le séjour sur demande"],
        ["casier_skis", "Casier à ski"],
        ["autre:lit bebe", "Lit bébé"],
        ["television", "TV"],
        ["autre:appareil a fondue", "Appareil à fondue"],
        ["autre:appareil a raclette", "Appareil à raclette"],
        ["autre:aspirateur", "Aspirateur"],
        ["autre:bouilloire", "Bouilloire"],
        ["autre:combinaison four & micro-onde", "Combinaison four & micro-onde"],
        ["autre:machine a cafe nespresso", "Machine à café Nespresso"],
        ["autre:plaques de cuisson a induction", "Plaques de cuisson à induction"],
        ["autre:refrigerateur", "Réfrigérateur"],
        ["autre:accueil en agence", "Accueil en agence"],
        ["autre:produits de salle de bains", "Produits de salle de bains"],
        ["autre:linge de bain supplementaire durant le sejour sur demande", "Linge de bain supplémentaire durant le séjour sur demande"],
        ["autre:lits faits a l'arrivee", "Lits faits à l'arrivée"],
        ["autre:menage de fin de sejour (hors cuisine)", "Ménage de fin de séjour (hors cuisine)"],
        ["autre:menage supplementaire durant le sejour sur demande", "Ménage supplémentaire durant le séjour sur demande"],
      ],
    );
    assert.ok(equipementsDe(l)?.every((e) => e.present));
    assert.equal(aEquipement(l, "television"), true);
    // Sans la liste, la télévision n'était qu'un « TV » perdu.
    assert.equal(aEquipement({ ...l, equipementsPublies: undefined }, "television"), false);
  });

  it("ni les distances qui suivent le panneau, ni un service à la carte ; sans titre « Services Inclus », aucun service", () => {
    const tous = (h: string) => contenuDeFiche("https://cimalpes.com/fr/x/", h)?.equipementsPublies?.map((e) => e.libelle) ?? [];
    const page = fx("cimalpes-fiche-chalet-delta-36.html");
    assert.ok(page.includes("<p>Distance du centre : 700 m</p>"));
    assert.deepEqual(tous(page).filter((t) => /Distance|Piste|Remontée/.test(t)), []);
    // Un service sous « Personnels », avant les services inclus : pas publié.
    const personnel = page.replace(
      /(>Personnels<\/p>)/,
      '$1<h3 class="font15"><b>Chef</b></h3><p>Chef à domicile</p>',
    );
    assert.notEqual(personnel, page);
    assert.equal(tous(personnel).includes("Chef à domicile"), false);
    assert.equal(tous(personnel).includes("Lits faits à l'arrivée"), true);
    const sansTitre = page.replace(">Services Inclus</p>", ">Nos services</p>");
    assert.notEqual(sansTitre, page);
    assert.equal(tous(sansTitre).includes("Lits faits à l'arrivée"), false);
    assert.equal(tous(sansTitre).includes("Réfrigérateur"), true);
    // Les douze clés lisent toujours tout le panneau des services.
    assert.equal(valeurs(contenuDeFiche("https://cimalpes.com/fr/x/", sansTitre)).linge, "oui");
  });
});

describe("contenuDeFiche : Abritel, extrait réel", () => {
  it("les équipements populaires seuls, sans description", () => {
    const c = contenuDeFiche("https://www.abritel.fr/location-vacances/p5392632vb?startDate=2027-02-06", fx("abritel-fiche-p5392632vb.html"));
    assert.equal(c?.description, null);
    // Cuisine, Barbecue, Mobilier d'extérieur, Accès Internet, Réfrigérateur.
    assert.deepEqual(valeurs(c), { wifi: "oui" });
  });

  it("chaque libellé de la liste, tel quel et une fois : les douze clés n'en gardaient que le Wi-Fi", () => {
    const c = contenuDeFiche("https://www.abritel.fr/location-vacances/p5392632vb?startDate=2027-02-06", fx("abritel-fiche-p5392632vb.html"));
    // « Barbecue » revient en sixième élément ; rien n'y dit une absence.
    assert.deepEqual(c?.equipementsPublies, [
      { libelle: "Cuisine" },
      { libelle: "Barbecue" },
      { libelle: "Mobilier d’extérieur" },
      { libelle: "Accès Internet" },
      { libelle: "Réfrigérateur" },
    ]);
    // Posés sur une annonce Abritel (jamais de fiche enrichie) : tous à l'écran.
    const l = { id: "abr-1", source: "Abritel", amenities: c?.amenities, equipementsPublies: c?.equipementsPublies } as Listing;
    assert.deepEqual(
      equipementsDe(l)?.map((e) => [e.id, e.libelle, e.present]),
      [
        ["wifi", "Accès Internet", true],
        ["autre:cuisine", "Cuisine", true],
        ["barbecue", "Barbecue", true],
        ["autre:mobilier d'exterieur", "Mobilier d’extérieur", true],
        ["autre:refrigerateur", "Réfrigérateur", true],
      ],
    );
    assert.equal(aEquipement(l, "barbecue"), true);
  });

  it("une page sans la rubrique : rien", () => {
    assert.equal(contenuDeFiche("https://www.abritel.fr/location-vacances/p1", "<html><body>JavaScript</body></html>"), null);
  });
});

describe("contenuDeFiche : Ingénie, extraits réels", () => {
  it("lit le descriptif du pavé `pave1`, pas l'encart « BONS PLANS » de la centrale (Les Saisies, 73G211126)", () => {
    // Extrait de reservation.lessaisies.com/chalet-d-elise-8-personnes-73g211126.html, 1er octobre 2026.
    const html = `<h2 class="titre_bloc_fiche" id="description"><span>Présentation</span></h2><div class="presentation"><div class="description">
      <div class="pave2 pave-containText"><span class="contenu_descriptif"><table><tr><td><h2><span><strong>BONS PLANS AVEC LES SAISIES RÉSERVATION</strong></span></h2></td></tr></table>
</span></div><div class="pave1 pave-containText"><span class="contenu_descriptif">Maison indépendante. Rez-de-chaussée : séjour-cuisine, salon (2 lits gigognes 1 personne.), 3 chambres (1 lit 1 personne / 1 lit 2 personnes., 1 lit 1 personne / 1 lit 2 personnes), 2 salle d'eau (douche / douche + wc).</span></div></div></div>
      <h1>Chalet D'elise <span class="code_prest"><span>(</span>73G211126<span>)</span></span> </h1>`;
    const c = contenuDeFiche("https://reservation.lessaisies.com/chalet-d-elise-8-personnes-73g211126.html", html);
    assert.equal(
      c?.description,
      "Maison indépendante. Rez-de-chaussée : séjour-cuisine, salon (2 lits gigognes 1 personne.), 3 chambres (1 lit 1 personne / 1 lit 2 personnes., 1 lit 1 personne / 1 lit 2 personnes), 2 salle d'eau (douche / douche + wc).",
    );
    // Le descriptif ne dit pas l'équipement : rien n'en est tiré.
    assert.equal(c?.amenities, null);
    assert.equal(c?.equipementsPublies, undefined);
  });

  it("lit le descriptif d'une autre centrale Ingénie, quel que soit son hôte (Arêches, Tervetuloa)", () => {
    // Extrait de reservation.areches-beaufort.com/tervetuloa-1.html, 1er octobre 2026.
    const html = `<div class="presentation"><div class="description"><div class="pave1 pave-containText"><span class="contenu_descriptif">Gîte dans la maison du propriétaire. Rez-de-chaussée : séjour-cuisine coin salon (1 canapé gigogne 2 lits 1 personne avec remise à niveau), 1 chambre (1 lit 2 personnes 140x190 cm), salle d'eau (douche), WC séparé.</span></div></div></div>
      <h1>Tervetuloa</h1>`;
    const c = contenuDeFiche("https://reservation.areches-beaufort.com/tervetuloa-1.html", html);
    assert.match(c?.description ?? "", /^Gîte dans la maison du propriétaire\. .* WC séparé\.$/);
  });

  it("sans pavé `pave1`, tous les blocs ; un descriptif vide ne rend rien", () => {
    const cadre = `<div class="cadre"><span class="contenu_descriptif">"Asters 18 Bâtiment C1" studio 18 m2 au 2ème étage.</span></div>`;
    assert.equal(contenuDeFiche("https://reservation.les2alpes.com/x.html", cadre)?.description, '"Asters 18 Bâtiment C1" studio 18 m2 au 2ème étage.');
    const vide = `<div class="pave1 pave-containText"><span class="contenu_descriptif"> </span></div>`;
    assert.equal(contenuDeFiche("https://reservation.les2alpes.com/x.html", vide), null);
  });
});

describe("contenuDeFiche : autres hôtes", () => {
  it("un hôte qu'on ne sait pas lire ne rend rien", () => {
    assert.equal(contenuDeFiche("https://www.alpissime.com/location/1", fx("cimalpes-fiche-chalet-delta-36.html")), null);
    assert.equal(contenuDeFiche("pas une adresse", "<p>x</p>"), null);
  });
});
