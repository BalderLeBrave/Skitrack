import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  devisItea,
  estDevisGitesLive,
  eurosItea,
  eurosPublie,
  ficheItea,
  horsFraisSejour,
  moteurIngenie,
  poserDevis,
  poserRecap,
  prestationIngenie,
  purgerTarifFigé,
  tarifRecap,
  taxeSejourSomme,
  conserverDevisGites,
} from "./tarif.ts";

describe("tarif : loyer, frais, devis live", () => {
  it("un relevé Gîtes figé n'est pas un devis publié", () => {
    const figé = purgerTarifFigé({
      source: "Gîtes de France" as const,
      total: 727.44,
      proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers.",
    });
    assert.equal(figé.total, 0);
    assert.equal(estDevisGitesLive("ITEA gites-web 2026-09-03"), false);
  });

  it("un devis ITEA live reste", () => {
    const live = purgerTarifFigé({
      source: "Gîtes de France" as const,
      total: 1551.44,
      proven: "Devis ITEA live 2027-02-06→2027-02-13, 8 pers.",
    });
    assert.equal(live.total, 1551.44);
  });

  it("un loyer de centrale n'inclut pas les frais de séjour", () => {
    assert.equal(horsFraisSejour({ source: "Centrale", total: 3500 }), true);
    assert.equal(horsFraisSejour({ source: "Airbnb", total: 3500 }), false);
    assert.equal(horsFraisSejour({ source: "Centrale", total: 0 }), false);
    assert.equal(
      horsFraisSejour({ source: "Centrale", total: 3660.16, proven: "loyer · taxe de séjour 160.16 €" }),
      false,
    );
  });

  it("lit une taxe de séjour en somme, refuse un tarif à la nuit", () => {
    assert.equal(taxeSejourSomme("Taxe de séjour : 160,16 €"), 160.16);
    assert.equal(taxeSejourSomme("taxe de séjour 2,60 € par personne par nuit"), null);
    assert.equal(taxeSejourSomme("pas de taxe ici"), null);
  });

  it("additionne le loyer et la taxe publiés au panier", () => {
    const html = `
      <tr class="ligne_tarif_formule ligne_tarif_formule_FB">
        <td class="libelle_formule">Location 7 nuits</td>
        <td class="prix_formule">3\u202f500\u00a0€</td>
      </tr>
      <tr class="ligne_tarif_formule ligne_tarif_formule_QU">
        <td class="libelle_formule">Taxe de séjour: Indiquez le nombre de personnes de + 18 ans</td>
        <td class="prix_formule">160,16\u00a0€</td>
      </tr>`;
    const recap = tarifRecap(html);
    assert.deepEqual(recap, { loyer: 3500, taxeSejour: 160.16, total: 3660.16 });
    const pose = poserRecap(
      { source: "Centrale" as const, total: 3500, proven: "Ingénie", priceLabel: "loyer, hors frais de séjour" },
      recap!,
    );
    assert.equal(pose.total, 3660.16);
    assert.equal(horsFraisSejour(pose), false);
    assert.equal(pose.priceLabel, "loyer et taxe de séjour");
  });

  it("lit 3 900 € + 160,16 € du panier Neve", () => {
    const html = `
      <tr class="ligne_tarif_formule ligne_tarif_formule_1 ligne_tarif_formule_FB">
        <td class="libelle_formule">Location 7 nuits</td>
        <td class="prix_formule">3\u202f900\u00a0€</td>
      </tr>
      <tr class="ligne_tarif_formule ligne_tarif_formule_2 ligne_tarif_formule_QU">
        <td class="libelle_formule">Taxe de séjour: Indiquez le nombre de personnes de + 18 ans</td>
        <td class="prix_formule">160,16\u00a0€</td>
      </tr>`;
    assert.equal(tarifRecap(html)?.total, 4060.16);
    assert.equal(eurosPublie("4\u202f060,16\u00a0€"), 4060.16);
  });

  it("reconnaît la prestation Ingénie sous ses trois écritures", () => {
    assert.equal(prestationIngenie("ing-reservat-PRESTATION-G-6140719-5660394"), "G-6140719-5660394");
    assert.equal(prestationIngenie('{"code":"G|6140719|5660394"}'), "G-6140719-5660394");
    assert.equal(prestationIngenie("G-6140719-5660394"), "G-6140719-5660394");
    const mot = moteurIngenie(
      `var params = {"object":{"code":"G|6140719|5660394"},"cid":"5","site":{"url":"https://reservation.les2alpes.com"}};`,
    );
    assert.deepEqual(mot, { prestation: "G-6140719-5660394", cid: "5" });
  });
});

const CITRIERE_TAB = `<div class="blocResa_choixFormule"><div class="uneFormule" data-prixtotal="727,44&euro;"></div><div class="div_prixLocation"><span class="sp_lblAvantMontantLocation">7 nuits</span><span class="sp_montantLocation">672&euro;</span></div><div class="div_prixLocation"><span class="sp_lblAvantTaxeSejour">Taxe de séjour</span><span class="sp_montantTaxeSejour">55,44&euro;</span></div><div class="div_prixLocation div_prixLocationTotal" style="display:none;"><span class="sp_lblAvantPrixTotal">Total</span><span class="sp_montantPrixTotal" data-prix="727.44">727,44 &euro;</span></div></div>`;

const COPAINS_NON_VENDABLE =
  '{"contactSiNonVendable":"centrale","lienAncienScript":"/resa/etape1.php","prixLoc":"4070 &euro;","lblPrixLoc":"Location pour 1 semaine"}';

describe("devis ITEA : total publié aux dates", () => {
  it("lit loyer, taxe et total de La Citrière", () => {
    const d = devisItea(CITRIERE_TAB);
    assert.equal(d?.loyer, 672);
    assert.equal(d?.taxeSejour, 55.44);
    assert.equal(d?.total, 727.44);
    assert.equal(d?.label, "loyer et taxe de séjour");
  });

  it("additionne loyer et taxe si le total n'est pas marqué", () => {
    const html =
      '<span class="sp_montantLocation">1496&euro;</span><span class="sp_montantTaxeSejour">55,44&euro;</span>';
    assert.equal(devisItea(html)?.total, 1551.44);
  });

  it("refuse un JSON contactSiNonVendable : prixLoc n'est pas le total", () => {
    assert.equal(devisItea(COPAINS_NON_VENDABLE), null);
  });

  it("refuse le tarif d'appel du widget, ce n'est pas un devis daté", () => {
    const widget = `<meta property="product:price:amount" content="443"/><div data-ident="gites38_b2026.1.40102.G"></div>`;
    assert.equal(devisItea(widget), null);
  });

  it("ne prend pas un ménage pour un total", () => {
    assert.equal(devisItea('<span class="sp_prixOption">200.00&euro;</span>'), null);
  });

  it("pose le devis live : le purgeur le conserve", () => {
    const pose = poserDevis(
      {
        source: "Gîtes de France" as const,
        total: 0,
        proven: "ITEA gites-web 2026-09-03",
        pricedCheckIn: null as string | null,
        pricedCheckOut: null as string | null,
        scannedAt: null as number | null,
      },
      { loyer: 672, taxeSejour: 55.44, total: 727.44, label: "loyer et taxe de séjour" },
      { checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 },
      1_700_000_000_000,
    );
    assert.equal(pose.total, 727.44);
    assert.equal(pose.pricedCheckIn, "2027-02-06");
    assert.equal(pose.pricedCheckOut, "2027-02-13");
    assert.equal(pose.scannedAt, 1_700_000_000_000);
    assert.match(pose.proven, /Devis ITEA live/);
    assert.match(pose.proven, /taxe de séjour 55\.44 €/);
    assert.equal(purgerTarifFigé(pose).total, 727.44);
    assert.equal(estDevisGitesLive(pose.proven), true);
  });

  it("lit ident, instance, exercice d'un gîte, refuse une chambre", () => {
    assert.deepEqual(
      ficheItea('data-ident="gites38_b2026.1.40102.G" data-instance="gites38" data-exercice="2026"'),
      { ident: "gites38_b2026.1.40102.G", instance: "gites38", exercice: "2026" },
    );
    assert.equal(
      ficheItea('data-ident="gites38_b2026.1.40102.C" data-instance="gites38" data-exercice="2026"'),
      null,
    );
  });

  it("lit un montant ITEA écrit avec &euro;", () => {
    assert.equal(eurosItea("672&euro;"), 672);
    assert.equal(eurosItea("55,44&euro;"), 55.44);
    assert.equal(eurosItea("727,44 &euro;"), 727.44);
  });

  it("un live sans devis ne chasse pas le total ITEA déjà posé", () => {
    const dump = [
      {
        source: "Gîtes de France" as const,
        id: "38G40102",
        url: null as string | null,
        total: 727.44,
        proven: "Devis ITEA live 2027-02-06→2027-02-13, 8 pers.",
      },
    ];
    const live = [
      {
        source: "Gîtes de France" as const,
        id: "38G40102",
        url: null as string | null,
        total: 0,
        proven: "Fiche ITEA live — aucun prix publié à ces dates.",
      },
      {
        source: "Gîtes de France" as const,
        id: "38G99999",
        url: null as string | null,
        total: 0,
        proven: "Fiche ITEA live",
      },
      { source: "Airbnb" as const, id: "ab", url: null as string | null, total: 2000, proven: "live" },
    ];
    const out = conserverDevisGites(dump, live);
    const cit = out.find((l) => l.id === "38G40102");
    assert.equal(cit?.total, 727.44);
    assert.equal(out.some((l) => l.id === "38G99999"), true);
    assert.equal(out.some((l) => l.id === "ab"), true);
  });
});
