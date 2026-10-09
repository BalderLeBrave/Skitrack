import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleHote, estMessageRefus, porteFermee, poserRefus } from "./gardeHote.ts";

describe("garde d'hôte", () => {
  const precedent = process.env.SKITRACK_TAUX;
  const dossier = mkdtempSync(join(tmpdir(), "skitrack-garde-"));

  after(() => {
    if (precedent == null) delete process.env.SKITRACK_TAUX;
    else process.env.SKITRACK_TAUX = precedent;
    rmSync(dossier, { recursive: true, force: true });
  });

  it("range les hôtes d'une même source sous la même clé", () => {
    assert.equal(cleHote("https://www.airbnb.fr/s/"), "airbnb");
    assert.equal(cleHote("https://www.booking.com/searchresults.html"), "booking");
    assert.equal(cleHote("https://www.gites-de-france.com/fr/search"), "gites");
    assert.equal(cleHote("https://widget-fngf.itea.fr/fiche.html"), "gites");
    assert.equal(cleHote("https://www.hometogo.fr/search/x"), "hometogo");
    assert.equal(cleHote("https://www.cozycozy.com/"), "cozy");
    assert.equal(cleHote("https://services.msem.tech/catalogue"), "msem");
    assert.equal(cleHote("https://webapi.deskline.net/x"), "feratel");
    assert.equal(cleHote("https://reservation.exemple.fr/"), "reservation.exemple.fr");
  });

  it("un 403, un 429 ou un 503 ferme l'hôte, sans second envoi", () => {
    process.env.SKITRACK_TAUX = join(dossier, "taux.json");
    const url = "https://widget-fngf.itea.fr/fiche.html";
    assert.equal(porteFermee(url), null);
    assert.equal(poserRefus(url, 200), false);
    assert.equal(porteFermee(url), null);
    assert.equal(poserRefus(url, 429, { "retry-after": "1" }), true);
    assert.match(porteFermee(url) ?? "", /pause après un refus/);
    assert.equal(poserRefus("https://www.gites-de-france.com/fr/search", 503), true);
    assert.equal(porteFermee("https://www.booking.com/x"), null);
  });

  it("ne prend pas un délai ou un compte pour un refus", () => {
    assert.equal(estMessageRefus("ITEA HTTP 429"), true);
    assert.equal(estMessageRefus("la centrale a répondu 403"), true);
    assert.equal(estMessageRefus("bloqué (503)"), true);
    assert.equal(estMessageRefus("pause après un refus (encore 40 s)"), true);
    assert.equal(estMessageRefus("timed out after 503 ms"), false);
    assert.equal(estMessageRefus("la source en publie 429"), false);
    assert.equal(estMessageRefus("limiteur local (12 s)"), false);
  });
});
