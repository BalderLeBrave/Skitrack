import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cheminPermis,
  interditsRobots,
  liensHebergement,
  moteurDe,
} from "./centrales-empreintes.mjs";

test("une empreinte de moteur se cite avec le passage qui la prouve", () => {
  const html = `<html><body><iframe src="https://webclient4.deskline.net/ISC/de/accommodation/list?x=1"></iframe></body></html>`;
  const m = moteurDe(html);
  assert.equal(m?.moteur, "Deskline / Feratel");
  assert.match(m.preuve, /deskline\.net\/ISC/);
  assert.equal(moteurDe("<p>Réservez votre séjour</p>"), null);
  assert.equal(
    moteurDe(`<a href="https://tportal.tomas.travel/Scuol/ukv/result?tt=1">x</a>`)?.moteur,
    "TOMAS",
  );
  assert.equal(
    moteurDe(`<footer>Citybreak™ Information &amp; Reservation System</footer>`)?.moteur,
    "Citybreak",
  );
});

test("les liens d'hébergement, absolus, sans doublon, l'adresse parlante d'abord", () => {
  const html = `
    <a href="/de/unterkunft-buchen">Unterkünfte</a>
    <a href="/de/unterkunft-buchen#top">encore</a>
    <a href="/de/winter">Winter</a>
    <a href="https://booking.example.at/">Jetzt buchen</a>
    <a href="mailto:info@x.at">Kontakt</a>`;
  const l = liensHebergement(html, "https://www.example.at/de/");
  assert.deepEqual(
    l.map((x) => x.url),
    ["https://www.example.at/de/unterkunft-buchen", "https://booking.example.at/"],
  );
});

test("robots.txt : seules les règles de « * » comptent, un préfixe interdit ce qui le suit", () => {
  const txt =
    "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nDisallow: /*serp?\n";
  const d = interditsRobots(txt);
  assert.deepEqual(d, ["/admin", "/*serp?"]);
  assert.equal(cheminPermis("/de/unterkunft", d), true);
  assert.equal(cheminPermis("/admin/login", d), false);
  assert.equal(cheminPermis("/fr/serp?a=1", d), false);
});
