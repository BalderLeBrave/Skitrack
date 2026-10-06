import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contenuDeFiche } from "./contenuFiche.ts";

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
});

describe("contenuDeFiche : Abritel, extrait réel", () => {
  it("les équipements populaires seuls, sans description", () => {
    const c = contenuDeFiche("https://www.abritel.fr/location-vacances/p5392632vb?startDate=2027-02-06", fx("abritel-fiche-p5392632vb.html"));
    assert.equal(c?.description, null);
    // Cuisine, Barbecue, Mobilier d'extérieur, Accès Internet, Réfrigérateur.
    assert.deepEqual(valeurs(c), { wifi: "oui" });
  });

  it("une page sans la rubrique : rien", () => {
    assert.equal(contenuDeFiche("https://www.abritel.fr/location-vacances/p1", "<html><body>JavaScript</body></html>"), null);
  });
});

describe("contenuDeFiche : autres hôtes", () => {
  it("un hôte qu'on ne sait pas lire ne rend rien", () => {
    assert.equal(contenuDeFiche("https://www.alpissime.com/location/1", fx("cimalpes-fiche-chalet-delta-36.html")), null);
    assert.equal(contenuDeFiche("pas une adresse", "<p>x</p>"), null);
  });
});
