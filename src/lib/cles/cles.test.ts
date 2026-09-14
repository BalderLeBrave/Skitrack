import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLES, cleParId } from "./registre.ts";

let dossier = "";
before(() => {
  dossier = mkdtempSync(join(tmpdir(), "skitrack-cles-"));
  process.env.SKITRACK_CONFIG_DIR = dossier;
  // Aucune clé ne doit venir de l'environnement pendant le test.
  for (const c of CLES) for (const n of c.env) delete process.env[n];
});
after(() => rmSync(dossier, { recursive: true, force: true }));

describe("registre des clés", () => {
  it("les identifiants et les variables d'environnement sont uniques", () => {
    const ids = CLES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    const env = CLES.flatMap((c) => c.env);
    assert.equal(new Set(env).size, env.length);
  });

  it("chaque clé dit ce qui ne marche pas sans elle", () => {
    for (const c of CLES) {
      assert.ok(c.sert.length > 10, `${c.id} : « sert » vide`);
      assert.ok(c.sans.length > 10, `${c.id} : « sans » vide`);
      assert.ok(c.env.length > 0);
    }
  });

  it("aucune valeur de clé n'est écrite dans le registre", () => {
    const texte = readFileSync(new URL("./registre.ts", import.meta.url), "utf8");
    // Une clé Météo-France est un JWT : trois blocs base64 séparés par des points.
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(texte), "un jeton est écrit en dur dans le registre");
  });

  it("cleParId ne rend que des clés connues", () => {
    assert.equal(cleParId("meteofrance")?.id, "meteofrance");
    assert.equal(cleParId("inconnue"), undefined);
  });
});

describe("magasin des clés", () => {
  it("une clé secrète ne ressort jamais du serveur", async () => {
    const m = await import("./store.server.ts");
    m.poserCle("meteofrance", "jeton-secret-de-test");
    const etat = m.etatCles().find((e) => e.id === "meteofrance")!;
    assert.equal(etat.posee, true);
    assert.equal(etat.origine, "saisie");
    // La valeur est nulle : c'est l'invariant de tout l'écran.
    assert.equal(etat.valeur, null);
    assert.ok(!JSON.stringify(m.etatCles()).includes("jeton-secret-de-test"));
    // Elle est bien posée côté serveur, en revanche.
    assert.equal(m.valeurCle("meteofrance"), "jeton-secret-de-test");
    assert.equal(process.env.METEOFRANCE_API_KEY, "jeton-secret-de-test");
  });

  it("un réglage non secret se relit", async () => {
    const m = await import("./store.server.ts");
    m.poserCle("pyairbnb", "/usr/bin/python3.12");
    const etat = m.etatCles().find((e) => e.id === "pyairbnb")!;
    assert.equal(etat.valeur, "/usr/bin/python3.12");
  });

  it("le fichier n'est lisible que par son propriétaire", async () => {
    const m = await import("./store.server.ts");
    m.poserCle("meteofrance", "x");
    if (process.platform !== "win32") {
      assert.equal(statSync(m.cheminFichier()).mode & 0o777, 0o600);
    }
  });

  it("retirer une clé la retire du fichier et de l'environnement", async () => {
    const m = await import("./store.server.ts");
    m.poserCle("meteofrance", "à-retirer");
    m.retirerCle("meteofrance");
    assert.equal(m.etatCles().find((e) => e.id === "meteofrance")!.posee, false);
    assert.equal(m.valeurCle("meteofrance"), null);
    assert.ok(!readFileSync(m.cheminFichier(), "utf8").includes("à-retirer"));
  });

  it("une clé inconnue est refusée", async () => {
    const m = await import("./store.server.ts");
    assert.throws(() => m.poserCle("inconnue", "x"), /inconnue/i);
  });

  it("une valeur vide vaut un retrait", async () => {
    const m = await import("./store.server.ts");
    m.poserCle("meteofrance", "quelque-chose");
    m.poserCle("meteofrance", "   ");
    assert.equal(m.etatCles().find((e) => e.id === "meteofrance")!.posee, false);
  });
});
