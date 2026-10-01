import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decoderEntites, lignesDepuisHtml, lignesDepuisMarkdown } from "./texteStructure.ts";

describe("page de tarifs en lignes structurées", () => {
  it("titres, paragraphes, tableaux ; scripts et styles retirés", () => {
    const l = lignesDepuisHtml(`<html><head><title>x</title><style>.a{}</style></head><body>
      <script>var prix = "99 €";</script>
      <h2>Hiver <span>2026-2027</span></h2>
      <p><strong>Du 12 décembre 2026</strong> au 23 avril 2027</p>
      <table><thead><tr><th>Durée</th><th>Adulte<br>19 – 64 ans</th></tr></thead>
      <tbody><tr><td>1 jour</td><td>78,00&nbsp;&euro;</td></tr></tbody></table>
      <!-- 12 € en commentaire -->
    </body></html>`);
    assert.deepEqual(l, [
      "## Hiver 2026-2027",
      "Du 12 décembre 2026 au 23 avril 2027",
      "| Durée | Adulte 19 – 64 ans |",
      "| 1 jour | 78,00 € |",
    ]);
  });

  it("une cellule fusionnée est répétée pour garder les colonnes alignées", () => {
    const l = lignesDepuisHtml(
      `<table><tr><td></td><th colspan="2">HAUTE SAISON</th><th colspan=2>BASSE SAISON</th></tr>
       <tr><td></td><td>Adulte</td><td>Enfant</td><td>Adulte</td><td>Enfant</td></tr></table>`,
    );
    assert.deepEqual(l, [
      "|  | HAUTE SAISON | HAUTE SAISON | BASSE SAISON | BASSE SAISON |",
      "|  | Adulte | Enfant | Adulte | Enfant |",
    ]);
  });

  it("un prix barré est marqué, la promotion reste en clair", () => {
    assert.deepEqual(
      lignesDepuisHtml("<table><tr><td>6 jours</td><td>260 € <del>312 €</del></td></tr></table>"),
      ["| 6 jours | 260 € ~~312 €~~ |"],
    );
  });

  it("entités nommées et numériques", () => {
    assert.equal(
      decoderEntites("Val d&rsquo;Is&egrave;re &#8211; 45&#x20AC; &amp; plus"),
      "Val d'Isère – 45€ & plus",
    );
  });

  it("Markdown : liens, images, gras, italiques et séparateurs de tableau", () => {
    const l = lignesDepuisMarkdown(
      [
        "![photo](https://x/img.jpg)",
        "## **LES TARIFS**hiver2026-2027",
        "| Durée | **Adulte**<br>13 à 64 ans |",
        "| --- | --- |",
        "| **Journée** | 59,70€ | [Acheter](https://x/achat) |",
        "_\\*Simulation effectuée le dimanche._",
      ].join("\n"),
    );
    assert.deepEqual(l, [
      "## LES TARIFShiver2026-2027",
      "| Durée | Adulte 13 à 64 ans |",
      "| Journée | 59,70€ | Acheter |",
      "*Simulation effectuée le dimanche.",
    ]);
  });
});
