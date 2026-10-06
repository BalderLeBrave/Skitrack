import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decoderEntites, texteDeHtml } from "./texteHtml.ts";

describe("decoderEntites", () => {
  it("les accents nommés, minuscules et capitales (fiche ITEA réelle, Chalet les Copains)", () => {
    assert.equal(
      decoderEntites("grand G&icirc;te am&eacute;nag&eacute; pour 14 personnes, acc&egrave;s &agrave; 500m, terrasse de 40m&sup2;"),
      "grand Gîte aménagé pour 14 personnes, accès à 500m, terrasse de 40m²",
    );
    assert.equal(decoderEntites("&Eacute;t&eacute; &ccedil;a &oelig;uvre"), "Été ça œuvre");
  });
  it("une seule passe : &amp;eacute; reste &eacute;", () => {
    assert.equal(decoderEntites("&amp;eacute;"), "&eacute;");
  });
  it("les numériques, et l'inconnue gardée telle quelle", () => {
    assert.equal(decoderEntites("caf&#233; &#x2019; &zzz;"), "café ’ &zzz;");
  });
});

describe("texteDeHtml", () => {
  it("une ligne par <br>, sans balise", () => {
    assert.equal(texteDeHtml("VOTRE APPARTEMENT <br />R&eacute;servez ce studio<br /><br /><br />Les couchages"), "VOTRE APPARTEMENT\nRéservez ce studio\n\nLes couchages");
  });
  it("le balisage Deskline (Feratel, La Clusaz), préfixe et commentaire compris", () => {
    // Début réel d'une description du 6 octobre 2026.
    const brut =
      "<!-- xmlns:d='http://deskline.net/deskline/markup/' -->\r<br /><d:h2>Bel appartement au calme pour 6 personnes. </d:h2>\r<br /><d:p>Ses petits +:<d:br>-proche des pistes<d:br>-au calme </d:p>";
    assert.equal(texteDeHtml(brut), "Bel appartement au calme pour 6 personnes.\n\nSes petits +:\n-proche des pistes\n-au calme");
  });
  it("rien de vide", () => {
    assert.equal(texteDeHtml("<p> </p>"), null);
    assert.equal(texteDeHtml(null), null);
  });
});
