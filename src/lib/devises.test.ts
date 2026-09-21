/**
 * Ce que le dépôt écrit quand il écrit une somme.
 *
 * Deux choses à tenir, et elles tirent en sens inverse :
 *
 * 1. **Rien ne change pour l'euro.** Trente appels et cinq écrans en
 *    dépendent, et une espace de milliers qui se déplacerait se verrait
 *    partout.
 * 2. **L'euro n'est plus la règle.** Une somme en francs suisses doit pouvoir
 *    s'écrire, et un seuil en euros ne doit rien prétendre d'un forfait qui
 *    n'est pas en euros.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deviseDuPays,
  entier,
  memeDevise,
  montant,
  montantCents,
  montantN,
  symboleDevise,
} from "./devises.ts";
import { eur, eurCents, eurN, fmt } from "./parcours.ts";

describe("écrire une somme", () => {
  it("l'euro sort exactement comme avant", () => {
    assert.equal(eur(1234), "1 234 €");
    assert.equal(eur(359), "359 €");
    assert.equal(eur(null), "–");
    assert.equal(eurN(null), null);
    assert.equal(eurCents(12.5), "12,50 €");
    assert.equal(eurCents(12), "12 €");
    // L'espace des milliers est une espace simple, et non l'espace fine que
    // l'ICU insère : c'est ce que le dépôt écrit depuis l'origine.
    assert.equal(eur(12345).includes(String.fromCharCode(0x202f)), false);
    assert.equal(eur(12345), "12 345 €");
  });

  it("`fmt` et `montant` partagent une seule implémentation du nombre", () => {
    for (const n of [0, 7, 999, 1000, 12345, 1234567]) {
      assert.equal(fmt(n), entier(n));
      assert.equal(montant(n), `${fmt(n)} €`);
    }
  });

  it("une autre devise s'écrit, et son symbole vient de l'ICU", () => {
    assert.equal(montant(1234, "CHF"), "1 234 CHF");
    // L'ICU écrit la livre « £GB » en français, et le dollar américain « $US ».
    // C'est l'usage français, et c'est lui qui fait foi ici plutôt qu'un
    // symbole choisi de mémoire.
    assert.equal(montant(1234, "GBP"), "1 234 £GB");
    assert.equal(montant(1234, "USD"), "1 234 $US");
    assert.equal(montantN(null, "CHF"), null);
    assert.equal(montantCents(12.5, "CHF"), "12,50 CHF");
    // Le symbole n'est écrit nulle part à la main : le test le compare à ce que
    // l'ICU rend, comme `geo.test.ts` compare les noms de pays à CLDR.
    for (const code of ["EUR", "CHF", "NOK", "JPY", "USD"]) {
      const attendu = new Intl.NumberFormat("fr-FR", { style: "currency", currency: code })
        .formatToParts(0)
        .find((p) => p.type === "currency")!.value;
      assert.equal(symboleDevise(code), attendu);
    }
  });

  it("une devise inconnue rend son code plutôt qu'un prix nu", () => {
    assert.equal(symboleDevise("ZZZ"), "ZZZ");
    assert.equal(montant(10, "ZZZ"), "10 ZZZ");
  });

  it("la devise d'un pays vient de geo/pays.ts", () => {
    assert.equal(deviseDuPays("FR"), "EUR");
    assert.equal(deviseDuPays("CH"), "CHF");
    assert.equal(deviseDuPays("NO"), "NOK");
    // La Bulgarie est passée à l'euro le 1er janvier 2026.
    assert.equal(deviseDuPays("BG"), "EUR");
    // Hors du périmètre européen, `pays.ts` n'a plus de fiche : la devise est
    // donc absente, et non supposée. Le Japon était à « JPY » avant le
    // 21 septembre 2026 ; il reviendra avec le périmètre, pas par défaut.
    assert.equal(deviseDuPays("JP"), null);
    // Le Kosovo est dans le périmètre et n'a pas de fiche : ni l'ISO 4217 ni
    // `zone.tab` ne connaissent `XK`. L'absence est sourcée.
    assert.equal(deviseDuPays("XK"), null);
    assert.equal(deviseDuPays(null), null);
  });

  it("deux sommes ne s'additionnent qu'à devise égale", () => {
    assert.equal(memeDevise("EUR", "eur"), true);
    assert.equal(memeDevise("EUR", "CHF"), false);
    // Une devise absente ne vaut pas accord : sans savoir, on n'additionne pas.
    assert.equal(memeDevise("EUR", null), false);
    assert.equal(memeDevise(null, null), false);
  });
});
