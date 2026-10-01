import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  adresseProduit,
  calendrierTarifaire,
  lireProduit,
  periodeDesProduits,
  periodesAuMemePrix,
  tarifDuProduit,
  type ProduitLu,
  type SegmentCalendrier,
} from "./boutique.ts";
import { releverGrilles, type Acces } from "./releve.ts";
import type { SourceTarifs } from "./sourcesTarifs.ts";
import { lignesDepuisHtml, lignesDepuisMarkdown } from "./texteStructure.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "tarifs");
const S = "2026-27";

describe("boutique : le calendrier tarifaire publié", () => {
  const lignes = lignesDepuisMarkdown(readFileSync(join(dir, "chatel.md"), "utf8"));
  const { segments, problemes } = calendrierTarifaire(lignes, S);

  it("Châtel 2026-27 : cinq segments sans chevauchement, dans l'ordre des dates", () => {
    assert.deepEqual(
      segments.map((s) => [s.debut, s.fin, s.libelle, s.promotion]),
      [
        ["2026-12-19", "2027-01-08", "Plein tarif", false],
        ["2027-01-09", "2027-02-05", "–10 % sur les forfaits ≥ 5 jours", true],
        ["2027-02-06", "2027-03-05", "Plein tarif", false],
        ["2027-03-06", "2027-03-19", "–15 % sur les forfaits ≥ 5 jours", true],
        // Couvert par « –15 % » et par « Tarif basse saison » : le tarif
        // l'emporte sur la promotion.
        ["2027-03-20", "2027-04-18", "Tarif basse saison", false],
      ],
    );
  });

  it("« fin de saison » ramenée à la dernière date écrite ; « Avant le 19 décembre » sans début : non relevée, et dit", () => {
    assert.equal(segments[segments.length - 1].fin, "2027-04-18");
    assert.equal(problemes.length, 1);
    assert.match(problemes[0], /Avant le 19 décembre 2026/);
  });

  it("une page sans calendrier : aucun segment, et dit", () => {
    const r = calendrierTarifaire(["| 1 jour | 69 € |", "Du texte"], S);
    assert.equal(r.segments.length, 0);
    assert.deepEqual(r.problemes, ["aucun calendrier tarifaire lu"]);
  });
});

describe("boutique : la page d'un produit", () => {
  it("Châtel, 6 jours Portes du Soleil adulte, 13 février 2027 : 373 € en caisse, 352 € en ligne", () => {
    const l = lignesDepuisHtml(readFileSync(join(dir, "chatel-produit.html"), "utf8"));
    assert.deepEqual(lireProduit(l), {
      produit: "6 Jours-Portes Du Soleil - Portes Du Soleil",
      libelleDuree: "6 Jours",
      nomCategorie: "Adulte",
      agesTexte: "26 - 64",
      premierJour: "2027-02-13",
      prixPublic: 373,
      prixEnLigne: 352,
      devise: "EUR",
    });
  });

  it("titre et catégorie sur une ligne ; sans remise, un seul prix", () => {
    const p = lireProduit([
      "Le samedi 20 mars 2027",
      "1 Jour-Portes Du Soleil - Portes Du Soleil Senior 15 (65 - 74)",
      "59,00 €",
      "Sous-total panier 59,00 €",
    ])!;
    assert.equal(p.libelleDuree, "1 Jour");
    assert.equal(p.nomCategorie, "Senior");
    assert.equal(p.premierJour, "2027-03-20");
    assert.equal(p.prixPublic, 59);
    assert.equal(p.prixEnLigne, 59);
  });

  it("une page sans panier (catégorie inconnue de la boutique) : null", () => {
    assert.equal(
      lireProduit(["Détail des prix", "Votre sélection", "Skiez l'esprit tranquille", "24€"]),
      null,
    );
  });

  it("le tarif d'un produit : prix caisse, catégorie et âges lus sur la page", () => {
    const t = tarifDuProduit({
      produit: "6 Jours-Portes Du Soleil",
      libelleDuree: "6 Jours",
      nomCategorie: "Senior",
      agesTexte: "65 - 74",
      premierJour: "2027-02-13",
      prixPublic: 336,
      prixEnLigne: 317,
      devise: "EUR",
    });
    assert.deepEqual(t.duree, { type: "jours", jours: 6 });
    assert.equal(t.categorie, "senior");
    assert.equal(t.libelleCategorie, "Senior 65-74");
    assert.deepEqual(t.ages, { min: 65, max: 74 });
    assert.equal(t.canal, "caisse");
    assert.equal(t.prix, 336);
  });

  it("l'adresse d'un produit : date et code remplacés", () => {
    assert.equal(
      adresseProduit(
        "https://b.test/6-jours/?s={date}&sk%5B0%5D%5Bcc%5D={categorie}",
        "2027-02-13",
        "ADULT",
      ),
      "https://b.test/6-jours/?s=2027-02-13&sk%5B0%5D%5Bcc%5D=ADULT",
    );
  });
});

describe("boutique : les périodes au même prix", () => {
  const seg = (
    debut: string,
    fin: string,
    libelle: string,
    promotion = false,
  ): SegmentCalendrier => ({
    debut,
    fin,
    libelle,
    promotion,
  });
  const SEGMENTS = [
    seg("2026-12-19", "2027-01-08", "Plein tarif"),
    seg("2027-01-09", "2027-02-05", "–10 %", true),
    seg("2027-02-06", "2027-03-05", "Plein tarif"),
    seg("2027-03-06", "2027-03-19", "–15 %", true),
    seg("2027-03-20", "2027-04-18", "Tarif basse saison"),
  ];

  it("les segments qui se suivent au même prix caisse sont réunis, sous le nom de leur tarif", () => {
    assert.deepEqual(periodesAuMemePrix(SEGMENTS, [373, 373, 373, 373, 317]), [
      { libelle: "Plein tarif", debut: "2026-12-19", fin: "2027-03-19" },
      { libelle: "Tarif basse saison", debut: "2027-03-20", fin: "2027-04-18" },
    ]);
  });

  it("une remise qui s'applique aussi en caisse garde son nom ; un segment sans prix lu est écarté", () => {
    assert.deepEqual(periodesAuMemePrix(SEGMENTS, [373, 336, 373, null, 317]), [
      { libelle: "Plein tarif", debut: "2026-12-19", fin: "2027-01-08" },
      { libelle: "–10 %", debut: "2027-01-09", fin: "2027-02-05" },
      { libelle: "Plein tarif", debut: "2027-02-06", fin: "2027-03-05" },
      { libelle: "Tarif basse saison", debut: "2027-03-20", fin: "2027-04-18" },
    ]);
  });

  it("une catégorie servie pour deux codes n'est comptée qu'une fois ; deux prix différents sont signalés", () => {
    const p = (prix: number, nom = "Enfant"): ProduitLu => ({
      produit: "6 Jours-PdS",
      libelleDuree: "6 Jours",
      nomCategorie: nom,
      agesTexte: "5 - 15",
      premierJour: "2026-12-19",
      prixPublic: prix,
      prixEnLigne: prix,
      devise: "EUR",
    });
    const per = { libelle: "Plein tarif", debut: "2026-12-19", fin: "2027-03-19" };
    const r = periodeDesProduits(per, [p(280), p(280)]);
    assert.equal(r.periode.tarifs.length, 1);
    assert.equal(r.problemes.length, 0);
    const r2 = periodeDesProduits(per, [p(280), p(290)]);
    assert.equal(r2.periode.tarifs.length, 1);
    assert.equal(r2.problemes.length, 1);
  });
});

/* ---------- Le relevé d'une boutique ---------- */

const CALENDRIER = `<h2>Calendrier tarifaire</h2><table>
<tr><th>Période</th><th>Tarif applicable</th><th>Informations</th></tr>
<tr><td>Avant le 19 décembre 2026</td><td>Tarif pré-ouverture</td><td>Sous réserve</td></tr>
<tr><td>19 déc. 2026 – 08 janv. 2027</td><td>Plein tarif</td><td>Haute saison</td></tr>
<tr><td>09 janv. – 05 févr. 2027</td><td>–10 % sur les forfaits ≥ 5 jours</td><td>Jusqu'au 30 novembre</td></tr>
<tr><td>06 févr. – 05 mars 2027</td><td>Plein tarif</td><td>Haute saison</td></tr>
<tr><td>06 mars – 18 avr. 2027</td><td>–15 % sur les forfaits ≥ 5 jours</td><td>Jusqu'au 30 novembre</td></tr>
<tr><td>20 mars – fin de saison</td><td>Tarif basse saison</td><td>Internet et guichet</td></tr>
</table>`;

const CATEGORIES: Record<string, [string, number]> = {
  ADULT: ["Adulte web (26 - 64)", 1],
  CHILD: ["Enfant web (5 - 15)", 0.75],
  JUNIOR: ["Enfant web (5 - 15)", 0.75],
  SENIOR: ["Senior web (65 - 74)", 0.9],
};

/** La page d'un produit, telle que la boutique la sert : 373 € les 6 jours
 *  adulte jusqu'au 19 mars, 317 € ensuite. */
function pageProduit(url: string): string {
  const u = new URL(url);
  const date = u.searchParams.get("s")!;
  const [libelle, coef] = CATEGORIES[u.searchParams.get("sk[0][cc]")!] ?? [null, 0];
  if (!libelle) return "<p>Votre sélection</p>";
  const jours = u.pathname.includes("6-jours") ? 6 : 1;
  const base = jours === 6 ? (date >= "2027-03-20" ? 317 : 373) : date >= "2027-03-20" ? 59 : 69;
  const prix = Math.round(base * coef);
  const [a, m, j] = date.split("-");
  const mois = { "12": "décembre", "01": "janvier", "02": "février", "03": "mars" }[m];
  return `<p>Du samedi ${Number(j)} ${mois} ${a}</p>
    <span class="priceRecap_promo"><strike>${prix},00&nbsp;€</strike></span><span>${prix - 5},00&nbsp;€</span>
    <div>Votre panier</div><span>${jours} Jour${jours > 1 ? "s" : ""}-Portes Du Soleil - Portes Du Soleil<br>${libelle}</span>
    <div>${prix},00&nbsp;€</div><div>-5,00&nbsp;€</div><div>${prix - 5},00&nbsp;€</div>
    <span>Sous-total panier</span><span>${prix - 5},00&nbsp;€</span>`;
}

const TARIFS = "https://boutique.test/fr/tarifs-hiver";
const modele = (slug: string) =>
  `https://boutique.test/fr/forfait-ski/${slug}-portes-du-soleil/?s={date}&sk%5B0%5D%5Bcc%5D={categorie}`;

const SOURCE: SourceTarifs = {
  id: "chatel",
  pages: [{ url: TARIFS, lecteur: "html" }],
  perimetres: [
    { type: "domaine", nom: "Portes du Soleil", motif: "portes du soleil", catalogue: ["chatel"] },
  ],
  boutique: {
    calendrier: { url: TARIFS, lecteur: "html" },
    perimetre: "Portes du Soleil",
    lecteur: "navigateur",
    produits: [modele("6-jours"), modele("1-jour-f")],
    categories: ["ADULT", "CHILD", "JUNIOR", "SENIOR"],
  },
};

function acces(interdit = false) {
  const appels: string[] = [];
  const a: Acces = {
    async robots(url) {
      return interdit && url.includes("forfait-ski")
        ? { autorise: false, regle: "Disallow: /fr/forfait-ski/", delaiMs: 2000 }
        : { autorise: true, regle: "", delaiMs: 2000 };
    },
    async html(url) {
      appels.push(url);
      return { status: 200, html: CALENDRIER };
    },
    async navigateur(url) {
      appels.push(url);
      return { status: 200, html: pageProduit(url), blocage: null };
    },
    async pdf() {
      return { status: 404, pages: [] };
    },
  };
  return { a, appels };
}

const ctx = {
  saison: S,
  maintenant: "2026-09-30T12:00:00.000Z",
  stationsDe: (p: { catalogue?: string[] }) => p.catalogue ?? [],
  precedentes: [],
};

describe("boutique : le relevé", () => {
  it("deux périodes au prix caisse, toutes durées et catégories, confiance haute", async () => {
    const { a, appels } = acces();
    const { grilles, rapport } = await releverGrilles([SOURCE], a, ctx);
    const g = grilles.find((x) => x.id.includes(":boutique:"))!;
    assert.ok(g, JSON.stringify(rapport));
    assert.equal(g.confiance, "haute");
    assert.deepEqual(g.stationIds, ["chatel"]);
    assert.deepEqual(
      g.periodes.map((p) => [p.libelle, p.debut, p.fin]),
      [
        ["Plein tarif", "2026-12-19", "2027-03-19"],
        ["Tarif basse saison", "2027-03-20", "2027-04-18"],
      ],
    );
    const six = g.periodes.map((p) =>
      p.tarifs
        .filter((t) => t.duree.type === "jours" && t.duree.jours === 6)
        .map((t) => `${t.libelleCategorie} ${t.prix}`),
    );
    // JUNIOR sert l'enfant : compté une fois.
    assert.deepEqual(six, [
      ["Adulte 26-64 373", "Enfant 5-15 280", "Senior 65-74 336"],
      ["Adulte 26-64 317", "Enfant 5-15 238", "Senior 65-74 285"],
    ]);
    assert.ok(g.periodes.every((p) => p.tarifs.every((t) => t.canal === "caisse")));
    // La page des tarifs, qui porte le calendrier, n'est demandée qu'une fois.
    assert.equal(appels.filter((u) => u === TARIFS).length, 1);
    // 5 repères, puis 2 × 2 × 4 produits, moins les 2 repères déjà lus.
    assert.equal(appels.length - 1, 5 + 16 - 2);
    assert.equal(rapport.pages, 1 + 19);
  });

  it("robots.txt interdit les pages produit : arrêt à la première, rien d'autre demandé", async () => {
    const { a, appels } = acces(true);
    const { grilles, rapport } = await releverGrilles([SOURCE], a, ctx);
    assert.equal(grilles.filter((g) => g.id.includes(":boutique:")).length, 0);
    assert.equal(appels.filter((u) => u.includes("forfait-ski")).length, 0);
    assert.equal(rapport.echecs.robots?.length, 1);
  });
});
