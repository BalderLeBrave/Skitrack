import { describe, it } from "node:test";
import assert from "node:assert/strict";
import data from "./centrales.data.json" with { type: "json" };

type Fichier = {
  stations: Record<string, { nom: string; url: string; host: string }>;
  domaines: Record<string, { url: string; host: string }>;
  nonRattachees: string[];
};
const f = data as Fichier;

describe("table des centrales", () => {
  it("chaque entrée porte une URL absolue et son hôte", () => {
    for (const [id, row] of Object.entries(f.stations)) {
      assert.match(row.url, /^https:\/\//, `${id} : URL non absolue`);
      assert.equal(new URL(row.url).hostname, row.host, `${id} : hôte incohérent`);
      assert.ok(row.nom.length > 0);
    }
    for (const [nom, row] of Object.entries(f.domaines)) {
      assert.match(row.url, /^https:\/\//, `${nom} : URL non absolue`);
      assert.equal(new URL(row.url).hostname, row.host);
    }
  });

  it("aucune plateforme globale ne s'est glissée parmi les centrales", () => {
    const hosts = Object.values(f.stations).map((r) => r.host);
    assert.ok(!hosts.some((h) => /airbnb|booking\.com|abritel|vrbo/.test(h)));
  });

  it("les relevés non rattachés sont conservés, pas effacés", () => {
    assert.ok(Array.isArray(f.nonRattachees));
    assert.ok(f.nonRattachees.length > 0);
  });
});
