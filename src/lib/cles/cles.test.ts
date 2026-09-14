import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

/** Une réévaluation du module, telle que le rechargement à chaud en produit.
 *  La chaîne de requête force Node à réexécuter le module ; le type, lui, est
 *  celui du module réel. */
async function reevaluer(marque: string): Promise<typeof import("./store.server.ts")> {
  return (await import(`./store.server.ts?rejeu=${marque}`)) as typeof import("./store.server.ts");
}

describe("réévaluation du module (développement)", () => {
  it("une clé que nous avons posée n'est pas prise pour la configuration du déploiement", async () => {
    const m = await import("./store.server.ts");
    m.poserCle("meteofrance", "posée-par-nous");
    assert.equal(process.env.METEOFRANCE_API_KEY, "posée-par-nous");

    // Le rechargement à chaud réévalue le module : le relevé « d'où vient
    // cette valeur » se refait, alors que `process.env` porte déjà notre
    // écriture. Sans mémoire partagée, il conclurait « environnement ».
    const rejoue = await reevaluer("1");
    const etat = rejoue.etatCles().find((e) => e.id === "meteofrance")!;
    assert.equal(etat.origine, "saisie", "notre propre écriture a été prise pour l'environnement");
    rejoue.retirerCle("meteofrance");
    assert.equal(process.env.METEOFRANCE_API_KEY, undefined, "« Retirer » n'a rien retiré");
  });

  it("une clé réellement posée par l'environnement l'emporte et ne se retire pas", async () => {
    process.env.METEOFRANCE_API_KEY = "posée-au-lancement";
    const m = await reevaluer("2");
    m.poserCle("meteofrance", "saisie-ici");
    const etat = m.etatCles().find((e) => e.id === "meteofrance")!;
    assert.equal(etat.origine, "environnement");
    assert.equal(process.env.METEOFRANCE_API_KEY, "posée-au-lancement", "l'environnement a été écrasé");
    delete process.env.METEOFRANCE_API_KEY;
  });
});

describe("robustesse du fichier de clés", () => {
  it("un fichier illisible n'est jamais écrasé : l'erreur remonte", async () => {
    const coin = mkdtempSync(join(tmpdir(), "skitrack-cles-ko-"));
    const avant = process.env.SKITRACK_CONFIG_DIR;
    try {
      process.env.SKITRACK_CONFIG_DIR = coin;
      const { poserCle, cheminFichier } = await import("./store.server.ts");
      // Deux clés valides, puis le fichier est tronqué en dehors de nous.
      poserCle("pyairbnb", "/usr/bin/python3");
      const chemin = cheminFichier();
      const entier = readFileSync(chemin, "utf8");
      assert.ok(entier.includes("pyairbnb"));
      writeFileSync(chemin, entier.slice(0, 12), "utf8");
      // Repartir d'un fichier vide effacerait la clé pyairbnb sans le dire.
      assert.throws(() => poserCle("meteofrance", "x"), /illisible|JSON|forme attendue/i);
      assert.equal(readFileSync(chemin, "utf8"), entier.slice(0, 12));
    } finally {
      if (avant == null) delete process.env.SKITRACK_CONFIG_DIR;
      else process.env.SKITRACK_CONFIG_DIR = avant;
      rmSync(coin, { recursive: true, force: true });
    }
  });

  it("un fichier absent est l'état normal du premier lancement", async () => {
    const coin = mkdtempSync(join(tmpdir(), "skitrack-cles-neuf-"));
    const avant = process.env.SKITRACK_CONFIG_DIR;
    try {
      process.env.SKITRACK_CONFIG_DIR = coin;
      const { etatCles } = await import("./store.server.ts");
      assert.equal(
        etatCles().every((e) => !e.posee),
        true,
      );
    } finally {
      if (avant == null) delete process.env.SKITRACK_CONFIG_DIR;
      else process.env.SKITRACK_CONFIG_DIR = avant;
      rmSync(coin, { recursive: true, force: true });
    }
  });
});

