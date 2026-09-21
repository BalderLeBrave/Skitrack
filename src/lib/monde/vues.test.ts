/**
 * Ce que les photos et les prix doivent tenir à l'affichage.
 *
 * Trois règles, et chacune protège contre une invention précise :
 *
 * 1. **Un prix reste dans sa devise.** Le site publie une conversion en euros
 *    qu'il marque « env. », sans taux ni date ; la recopier comme un prix
 *    serait la valeur estimée que le dépôt s'interdit.
 * 2. **Une transformation d'image ne s'invente pas.** Elle n'est appliquée
 *    qu'aux hôtes dont on l'a vérifiée.
 * 3. **Une photo vers un hôte muet est une absence**, pas une image cassée.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mentionForfait,
  prix,
  releveForfaits,
  type ForfaitDomaine,
} from "./forfaits.ts";
import {
  mentionPhoto,
  photoDuDomaine,
  relevePhotos,
  vignette,
  type PhotoDomaine,
  type RelevePhotos,
} from "./photos.ts";

describe("un prix reste dans sa devise", () => {
  it("le franc suisse s'écrit en francs", () => {
    const s = prix({ brut: "SFr. 94,-", valeur: 94, devise: "CHF" });
    assert.ok(s?.includes("94"), s ?? "");
    assert.ok(/CHF|Fr/.test(s ?? ""), `la devise doit paraître : ${s}`);
    assert.ok(!s?.includes("€"), "aucun euro ne doit apparaître");
  });

  it("une valeur sans devise ne s'écrit pas", () => {
    // « 300 » tout seul, le lecteur y met la sienne.
    assert.equal(prix({ brut: "Skr 300,-", valeur: 300, devise: null }), null);
  });

  it("une devise sans valeur ne s'écrit pas non plus", () => {
    assert.equal(prix({ brut: "SFr. —", valeur: null, devise: "CHF" }), null);
  });

  it("l'absence de montant se dit par null, jamais par zéro", () => {
    assert.equal(prix(null), null);
    assert.equal(prix(undefined), null);
  });
});

describe("la mention dit d'où vient le prix", () => {
  const f: ForfaitDomaine = {
    slug: "ischgl-samnaun",
    nom: "Ischgl/Samnaun",
    km: 4.9,
    libelle: "Forfait journalier Haute saison",
    adultes: { brut: "€ 83,-", valeur: 83, devise: "EUR" },
    jeunes: null,
    enfants: null,
  };

  it("elle nomme la fiche, le libellé et la distance", () => {
    const m = mentionForfait(f);
    assert.ok(m.includes("Ischgl/Samnaun"));
    assert.ok(m.includes("Haute saison"));
    assert.ok(m.includes("4,9 km"), m);
  });

  it("un rattachement au même point ne s'annonce pas « à 0 km »", () => {
    assert.ok(mentionForfait({ ...f, km: 0.03 }).includes("au même point"));
  });
});

describe("une transformation d'image ne s'invente pas", () => {
  it("l'hôte vérifié reçoit le WebP et la largeur", () => {
    const u = new URL(
      vignette("https://cdn.bfldr.com/WIENNW6Q/as/abc/Aprica?auto=webp&format=png", 400),
    );
    assert.equal(u.searchParams.get("format"), "webp");
    assert.equal(u.searchParams.get("width"), "400");
  });

  it("un hôte non vérifié ressort inchangé", () => {
    // `img*.onthesnow.com` : on ne sait pas s'il accepte des paramètres, et au
    // contrôle du 21 septembre 2026 il ne répondait pas du tout.
    const brut = "https://img5.onthesnow.com/image/xl/95/95394.jpg";
    assert.equal(vignette(brut, 400), brut);
  });

  it("une adresse illisible ressort telle quelle plutôt que de lever", () => {
    assert.equal(vignette("pas une adresse", 400), "pas une adresse");
  });
});

describe("une photo vers un hôte muet est une absence", () => {
  const releve = {
    photos: {
      "ch-bon": {
        cle: "valais/zermatt",
        nom: "Zermatt",
        km: 0.4,
        url: "https://cdn.bfldr.com/X/as/y/Zermatt?auto=webp&format=png",
        servi: true,
      } satisfies PhotoDomaine,
      "ch-muet": {
        cle: "autre/fiche",
        nom: "Autre",
        km: 0.4,
        url: "https://img5.onthesnow.com/image/xl/95/95394.jpg",
        servi: false,
      } satisfies PhotoDomaine,
    },
  } as unknown as RelevePhotos;

  it("l'hôte qui répond rend une vignette", () => {
    const v = photoDuDomaine(releve, "ch-bon", 400);
    assert.ok(v);
    assert.ok(v.src.includes("format=webp"));
  });

  it("l'hôte muet rend null, et non une image cassée", () => {
    assert.equal(photoDuDomaine(releve, "ch-muet", 400), null);
  });

  it("un domaine sans rattachement rend null", () => {
    assert.equal(photoDuDomaine(releve, "ch-inconnu", 400), null);
  });

  it("la mention dit la fiche et la distance", () => {
    const m = mentionPhoto(releve.photos["ch-bon"]!);
    assert.ok(m.includes("Zermatt"));
    assert.ok(m.includes("Skiinfo"));
  });
});

describe("sur les relevés réels", () => {
  it("aucun prix rattaché ne porte de devise inconnue", async () => {
    const r = await releveForfaits();
    const sansDevise = Object.entries(r.forfaits).filter(
      ([, f]) => f.adultes && f.adultes.valeur != null && !f.adultes.devise,
    );
    assert.deepEqual(sansDevise.map(([id]) => id), []);
  });

  it("aucun rattachement au-delà du rayon annoncé", async () => {
    for (const [source, entrees] of [
      ["forfaits", Object.entries((await releveForfaits()).forfaits)],
      ["photos", Object.entries((await relevePhotos()).photos)],
    ] as const) {
      for (const [id, e] of entrees) {
        assert.ok(e.km <= 5, `${source} : ${id} rattaché à ${e.km} km`);
      }
    }
  });

  it("une fiche ne sert qu'un domaine", async () => {
    // L'appariement est glouton : deux domaines voisins ne se partagent pas un
    // forfait, sans quoi on inventerait un prix pour l'un des deux.
    const r = await releveForfaits();
    const cles = Object.values(r.forfaits).map((f) => f.slug);
    assert.equal(new Set(cles).size, cles.length);
    const p = await relevePhotos();
    const vues = Object.values(p.photos).map((x) => x.cle);
    assert.equal(new Set(vues).size, vues.length);
  });

  it("la Russie n'a laissé ni prix ni photo", async () => {
    const r = await releveForfaits();
    const p = await relevePhotos();
    assert.deepEqual(Object.keys(r.forfaits).filter((id) => id.startsWith("ru-")), []);
    assert.deepEqual(Object.keys(p.photos).filter((id) => id.startsWith("ru-")), []);
  });
});
