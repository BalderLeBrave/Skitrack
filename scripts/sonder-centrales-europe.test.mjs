/**
 * `sonder-centrales-europe.mjs` de bout en bout, contre un faux site local :
 * aucune requête ne sort de la machine, les données du dépôt ne sont pas lues.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "sonder-centrales-europe.mjs");

const PAGES = {
  "/robots.txt": "User-agent: *\nDisallow: /prive\n",
  "/a/": `<a href="/a/unterkunft-buchen">Unterkünfte</a>`,
  "/a/unterkunft-buchen": `<iframe src="https://webclient4.deskline.net/ISC/de/accommodation"></iframe>`,
  "/b/": `<a href="/prive/unterkunft">Unterkünfte</a>`,
  "/c/": `<p>Willkommen</p>`,
};

test("un domaine, sa centrale et son moteur ; robots.txt respecté ; rien sans lien", async () => {
  const demandes = [];
  const serveur = createServer((req, res) => {
    demandes.push(req.url);
    const page = PAGES[req.url];
    res.writeHead(page == null ? 404 : 200, { "content-type": "text/html" });
    res.end(page ?? "");
  });
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "sondage-"));
  writeFileSync(
    join(dir, "AT.json"),
    JSON.stringify([
      { id: "at-a", nom: "A", km: 30, sites: [`${base}/a/`] },
      { id: "at-b", nom: "B", km: 20, sites: [`${base}/b/`] },
      { id: "at-c", nom: "C", km: 10, sites: [`${base}/c/`] },
      { id: "at-d", nom: "D", km: 5 },
    ]),
  );
  const sortie = join(dir, "sondage.json");
  try {
    await promisify(execFile)(process.execPath, [SCRIPT, "--donnees", dir, "--sortie", sortie], {
      env: { ...process.env, SONDAGE_PAUSE_MS: "0" },
    });
  } finally {
    serveur.close();
  }
  const r = JSON.parse(readFileSync(sortie, "utf8")).domaines;
  assert.equal(r["at-a"].centrale.moteur, "Deskline / Feratel");
  assert.match(r["at-a"].centrale.preuve, /deskline/);
  assert.equal(r["at-b"].centrale, null);
  assert.deepEqual(r["at-b"].pages, [{ url: `${base}/prive/unterkunft`, interdit: true }]);
  assert.ok(
    !demandes.includes("/prive/unterkunft"),
    "une page interdite par robots.txt n'est jamais demandée",
  );
  assert.match(r["at-c"].motif, /aucun lien/);
  assert.match(r["at-d"].motif, /site officiel inconnu/);
});
