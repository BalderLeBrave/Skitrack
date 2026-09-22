/**
 * Ce que les photos et les prix doivent tenir à l'affichage.
 *
 * Quatre règles, et chacune protège contre une invention précise :
 *
 * 1. **Un prix reste dans sa devise.** skiresort publie une conversion en
 *    euros qu'il marque « env. », sans taux ni date ; la recopier comme un
 *    prix serait la valeur estimée que le dépôt s'interdit.
 * 2. **Une transformation d'image ne s'invente pas.** Elle n'est appliquée
 *    qu'aux hôtes dont on l'a vérifiée.
 * 3. **Une photo vers un hôte muet est une absence**, pas une image cassée.
 * 4. **La photo et le forfait d'un domaine viennent de la même fiche.** Deux
 *    appariements séparés laisseraient un domaine afficher la photo d'une
 *    station et le prix d'une autre.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  altitudesDuDomaine,
  colonneAdulte,
  pistesDuDomaine,
  fourchetteJournee,
  journeeParPeriode,
  forfaitDuDomaine,
  ligneJournee,
  mentionForfait,
  mentionPhoto,
  photoDuDomaine,
  prix,
  releveVues,
  vignette,
  type ForfaitVue,
  type PhotoVue,
  type ReleveVues,
} from "./vues.ts";

const GRILLE: ForfaitVue = {
  source: "skiinfo",
  cle: "alpes-du-nord/tignes",
  nom: "Tignes",
  km: 0.4,
  devise: "EUR",
  deviseSource: "page",
  deviseDuPays: null,
  misAJour: "1 mai 2026",
  categories: [
    { nom: "Enfant", ages: "8-18" },
    { nom: "Adulte", ages: null },
    { nom: "Sénior", ages: "65-74" },
  ],
  lignes: [
    { libelle: "Forfait journée", prix: [48, 57, 48] },
    { libelle: "Forfait journée (le week-end)", prix: [55, 66, 55] },
    { libelle: "Forfait semaine", prix: [306, 366, 306] },
  ],
  saison: null,
  periodes: null,
};

describe("un prix reste dans sa devise", () => {
  it("le franc suisse s'écrit en francs", () => {
    const s = prix(94, "CHF");
    assert.ok(s?.includes("94"), s ?? "");
    assert.ok(/CHF|Fr/.test(s ?? ""), `la devise doit paraître : ${s}`);
    assert.ok(!s?.includes("€"), "aucun euro ne doit apparaître");
  });

  it("une valeur sans devise ne s'écrit pas", () => {
    assert.equal(prix(300, null), null);
  });

  it("une devise sans valeur ne s'écrit pas non plus", () => {
    assert.equal(prix(null, "CHF"), null);
    assert.equal(prix(undefined, "CHF"), null);
  });
});

describe("la grille se lit sans se tromper de case", () => {
  it("« journée » n'est pas « journée (le week-end) »", () => {
    assert.equal(ligneJournee(GRILLE)?.libelle, "Forfait journée");
  });

  it("la colonne adulte est trouvée par son nom, pas par sa position", () => {
    assert.equal(colonneAdulte(GRILLE), 1);
    // Le prix adulte de la journée est 57, pas 48 : se tromper de colonne
    // afficherait le tarif enfant sous le mot « adulte ».
    assert.equal(ligneJournee(GRILLE)?.prix[colonneAdulte(GRILLE)], 57);
  });

  it("sans colonne « adulte », on prend la dernière plutôt que la première", () => {
    const f: ForfaitVue = { ...GRILLE, categories: [{ nom: "Enfant", ages: null }, { nom: "Jeune", ages: null }] };
    assert.equal(colonneAdulte(f), 1);
  });

  it("une grille vide ne rend pas de ligne", () => {
    assert.equal(ligneJournee({ ...GRILLE, lignes: [] }), null);
  });
});

describe("la mention dit d'où vient le prix", () => {
  it("elle distingue une grille d'un tarif unique", () => {
    assert.match(mentionForfait(GRILLE), /grille de 3 forfaits/);
    const seul: ForfaitVue = {
      ...GRILLE,
      source: "skiresort",
      lignes: [{ libelle: "Forfait journalier Haute saison", prix: [30, 40, 50] }],
      misAJour: null,
    };
    assert.match(mentionForfait(seul), /un seul tarif publié/);
  });

  it("une devise déduite du pays se dit telle quelle", () => {
    const f: ForfaitVue = { ...GRILLE, deviseSource: "pays" };
    assert.match(mentionForfait(f), /devise déduite du pays/);
  });

  it("un rattachement au même point ne s'annonce pas « à 0 km »", () => {
    assert.match(mentionForfait({ ...GRILLE, km: 0.03 }), /au même point/);
  });

  it("un rattachement corroboré par le nom le dit", () => {
    // Sept kilomètres sans le nom seraient douteux ; sept kilomètres avec le
    // nom ne le sont pas. Le lecteur doit pouvoir faire la différence.
    const f: ForfaitVue = { ...GRILLE, km: 7.0, parLeNom: true };
    assert.match(mentionForfait(f), /rapprochée par le nom/);
    assert.doesNotMatch(mentionForfait({ ...GRILLE, km: 7.0 }), /rapprochée par le nom/);
  });

  it("une devise qui contredit celle du pays se dit, elle ne se corrige pas", () => {
    // Valdesquí, en Espagne, publie des dollars néo-zélandais. On ne sait pas
    // laquelle des deux sources a tort : on montre les deux.
    const f: ForfaitVue = { ...GRILLE, devise: "NZD", deviseDuPays: "EUR" };
    const m = mentionForfait(f);
    assert.match(m, /publie en NZD/);
    assert.match(m, /pays est en EUR/);
  });
});

describe("les périodes datées, que seule bergfex publie", () => {
  const DATE: ForfaitVue = {
    ...GRILLE,
    source: "bergfex",
    periodes: [
      {
        dates: "19.12.26 - 12.03.27",
        categories: ["Adultes", "Enfants", "Jeunes"],
        lignes: [
          { libelle: "1 Jour", prix: [82, 41, 61.5] },
          { libelle: "1 Jour à partir de 12:30", prix: [61, 30.5, 46] },
        ],
      },
      {
        dates: "27.11.26 - 18.12.26",
        categories: ["Adultes", "Enfants", "Jeunes"],
        lignes: [{ libelle: "1 Jour", prix: [74, 37, 55.5] }],
      },
    ],
  };

  it("chaque période rend son tarif journée adulte", () => {
    assert.deepEqual(journeeParPeriode(DATE), [
      { dates: "19.12.26 - 12.03.27", prix: 82 },
      { dates: "27.11.26 - 18.12.26", prix: 74 },
    ]);
  });

  it("« 1 Jour » n'est pas « 1 Jour à partir de 12:30 »", () => {
    // Prendre la seconde ligne afficherait 61 € au lieu de 82 : un demi-tarif
    // présenté comme le prix de la journée.
    assert.equal(journeeParPeriode(DATE)[0]?.prix, 82);
  });

  it("la fourchette dit que le prix dépend de la date", () => {
    assert.deepEqual(fourchetteJournee(DATE), { bas: 74, haut: 82 });
  });

  it("un prix unique n'a pas de fourchette", () => {
    // « 74 à 74 € » n'apprendrait rien : le but est de signaler la variation.
    const un: ForfaitVue = { ...DATE, periodes: [DATE.periodes![1]!] };
    assert.equal(fourchetteJournee(un), null);
    assert.equal(fourchetteJournee(GRILLE), null);
  });

  it("la mention compte les périodes", () => {
    assert.match(mentionForfait(DATE), /2 périodes tarifaires datées/);
  });
});

describe("une valeur relevée à la main dit d'où elle vient et pourquoi on l'a crue", () => {
  it("la photo nomme son hôte et sa corroboration, et avoue qu'elle n'a pas été vue", () => {
    const m = mentionPhoto({
      source: "proprietaire",
      cle: "www.weissensee.com",
      nom: null,
      km: 0,
      url: "https://www.weissensee.com/x.jpg",
      titre: null,
      corroboration: "hote-officiel",
      servi: true,
    });
    assert.match(m, /relevée à la main/);
    assert.match(m, /www\.weissensee\.com/);
    assert.match(m, /site officiel/);
    assert.match(m, /non vérifiée/);
  });

  it("le tarif nomme sa source et sa période telle qu'écrite", () => {
    const m = mentionForfait({
      source: "proprietaire",
      cle: "https://www.damuels-mellau.at/",
      nom: null,
      km: 0,
      devise: "EUR",
      deviseSource: "tableau",
      deviseDuPays: null,
      misAJour: null,
      categories: [{ nom: "Adulte", ages: null }],
      lignes: [{ libelle: "Forfait journée", prix: [72.5] }],
      saison: null,
      periodes: null,
      pageTarifs: "https://www.damuels-mellau.at/",
      releve: { periode: "2025/26", note: null, jourEnfant: 41, sixJoursAdulte: 339, sixJoursEnfant: null, saisonAdulte: 576, saisonEnfant: null },
    });
    assert.match(m, /Relevé à la main depuis https:\/\/www\.damuels-mellau\.at\//);
    assert.match(m, /période « 2025\/26 »/);
  });

  it("dans le relevé réel, chaque photo relevée à la main est corroborée et chaque tarif a une source", async () => {
    // Une recherche large ramène ce qu'elle trouve ; ce qui entre ici a
    // passé un crible, et le crible doit se voir dans les données.
    const r = await releveVues();
    let photos = 0;
    let forfaits = 0;
    for (const [id, v] of Object.entries(r.vues)) {
      if (v.photo?.source === "proprietaire") {
        photos++;
        assert.ok(v.photo.corroboration, `${id} : photo relevée sans corroboration`);
        assert.ok(v.photo.servi, `${id} : photo relevée non servie`);
      }
      if (v.forfait?.source === "proprietaire") {
        forfaits++;
        assert.match(v.forfait.pageTarifs ?? "", /^https?:/, `${id} : tarif relevé sans source`);
        assert.ok(v.forfait.devise && /^[A-Z]{3}$/.test(v.forfait.devise), `${id} : devise ${v.forfait.devise}`);
      }
    }
    assert.ok(photos >= 0 && forfaits >= 0);
  });
});

describe("un tarif lu sur un site officiel se présente avec sa preuve", () => {
  const LU: ForfaitVue = {
    ...GRILLE,
    source: "officiel",
    cle: "https://www.brandnertal.at/tarifs",
    pageTarifs: "https://www.brandnertal.at/tarifs",
    km: 0,
    devise: "EUR",
    deviseSource: "page",
    categories: [{ nom: "Adulte", ages: null }],
    lignes: [{ libelle: "Forfait journée", prix: [33.5] }],
    preuve: "Day Ticket 33,50 € 32,00 € 20,00 €",
  };

  it("la mention cite la ligne du tableau telle qu'écrite", () => {
    // Un « 33,50 € » lu en texte libre ne se juge pas seul : la ligne qui le
    // porte dit ce qu'il est, et elle doit paraître.
    const m = mentionForfait(LU);
    assert.match(m, /site officiel/);
    assert.match(m, /Day Ticket 33,50 €/);
    assert.match(m, /brandnertal\.at\/tarifs/);
  });

  it("la mention ne parle ni de fiche ni de distance : le site est celui du domaine", () => {
    assert.doesNotMatch(mentionForfait(LU), /fiche «/);
    assert.doesNotMatch(mentionForfait(LU), /km/);
  });
});

describe("une transformation d'image ne s'invente pas", () => {
  it("l'hôte vérifié reçoit le WebP et la largeur", () => {
    const u = new URL(vignette("https://cdn.bfldr.com/W/as/abc/Aprica?auto=webp&format=png", 400));
    assert.equal(u.searchParams.get("format"), "webp");
    assert.equal(u.searchParams.get("width"), "400");
  });

  it("un hôte non vérifié ressort inchangé", () => {
    // skiresort sert déjà des images de 933 px : rien à demander.
    const brut = "https://www.skiresort.fr/fileadmin/_processed_/c5/5c/c2/2d/6745897e9e.jpg";
    assert.equal(vignette(brut, 400), brut);
  });

  it("une adresse illisible ressort telle quelle plutôt que de lever", () => {
    assert.equal(vignette("pas une adresse", 400), "pas une adresse");
  });
});

describe("ce que le propriétaire a demandé d'une photo", () => {
  it("aucune photo affichée n'est celle qu'un regard a écartée", async () => {
    // Le verdict est comparé à **l'adresse**, jamais au domaine seul : si la
    // photo retenue a changé depuis, le verdict ne la concerne plus.
    const r = await releveVues();
    const juges = (await import("./data/photosJugees.json", { with: { type: "json" } })).default as {
      verdicts: Record<string, { url: string | null; retenue: boolean; motif?: string }>;
    };
    let verifiees = 0;
    for (const [id, v] of Object.entries(r.vues)) {
      const j = juges.verdicts[id];
      if (!v.photo || !j || j.url !== v.photo.url) continue;
      verifiees++;
      assert.ok(j.retenue, `${id} : photo affichée alors qu'elle est écartée (${j.motif})`);
    }
    assert.ok(verifiees > 500, `${verifiees} photos confrontées à leur verdict`);
  });

  it("deux domaines ne montrent jamais la même photo", async () => {
    // « Une photo unique » : une adresse servie à deux domaines n'illustre ni
    // l'un ni l'autre. Le contrôle porte aussi sur l'empreinte du fichier à
    // l'étape du jugement ; ici, sur ce qui est réellement affiché.
    const r = await releveVues();
    const par = new Map<string, string[]>();
    for (const [id, v] of Object.entries(r.vues)) {
      if (!v.photo) continue;
      par.set(v.photo.url, [...(par.get(v.photo.url) ?? []), id]);
    }
    const partagees = [...par.entries()].filter(([, ids]) => ids.length > 1);
    assert.deepEqual(partagees, [], `photos partagées : ${partagees.slice(0, 3).map(([u, ids]) => `${ids.join("/")} → ${u}`).join(" ; ")}`);
  });

  it("une photo libre porte son auteur, sa licence et sa page", async () => {
    // CC BY et CC BY-SA n'autorisent l'affichage qu'à cette condition.
    const r = await releveVues();
    let n = 0;
    for (const [id, v] of Object.entries(r.vues)) {
      if (v.photo?.source !== "commons") continue;
      n++;
      assert.ok(v.photo.licence, `${id} : photo Commons sans licence`);
      assert.ok(v.photo.page?.startsWith("https://"), `${id} : photo Commons sans page`);
      assert.ok(v.photo.auteur !== undefined, `${id} : photo Commons sans champ auteur`);
    }
    assert.ok(n >= 0);
  });
});

describe("ce que le propriétaire a demandé des forfaits", () => {
  it("chaque tarif lu sur un site officiel porte une ligne qui nomme un produit", async () => {
    const lus = (await import("./data/tarifsLus.json", { with: { type: "json" } })).default as {
      fiches: Record<string, { page: string; devise: string | null; tarifs: Record<string, { prix: number; ligne: string }> }>;
    };
    let cases = 0;
    for (const [id, f] of Object.entries(lus.fiches)) {
      assert.ok(f.page?.startsWith("http"), `${id} : tarif sans page`);
      for (const [poste, t] of Object.entries(f.tarifs)) {
        cases++;
        assert.ok(t.prix > 0, `${id}/${poste} : prix ${t.prix}`);
        // Un montant seul ne prouve rien : la ligne doit nommer le produit.
        assert.match(t.ligne, /[A-Za-zÀ-ÿ]{3}/, `${id}/${poste} : ligne sans nom de produit — « ${t.ligne} »`);
      }
    }
    assert.ok(cases >= 0);
  });
});

describe("une photo vers un hôte muet est une absence", () => {
  const bonne: PhotoVue = {
    source: "skiinfo",
    cle: "valais/zermatt",
    nom: "Zermatt",
    km: 0.4,
    url: "https://cdn.bfldr.com/X/as/y/Zermatt?auto=webp&format=png",
    titre: null,
    servi: true,
  };
  const muette: PhotoVue = {
    ...bonne,
    cle: "autre/fiche",
    url: "https://img5.onthesnow.com/image/xl/95/95394.jpg",
    servi: false,
  };
  const releve = {
    vues: {
      "ch-bon": { photo: bonne, forfait: null },
      "ch-muet": { photo: muette, forfait: null },
      "ch-rien": { photo: null, forfait: GRILLE },
    },
  } as unknown as ReleveVues;

  it("l'hôte qui répond rend une vignette", () => {
    const v = photoDuDomaine(releve, "ch-bon", 400);
    assert.ok(v?.src.includes("format=webp"));
  });

  it("l'hôte muet rend null, et non une image cassée", () => {
    assert.equal(photoDuDomaine(releve, "ch-muet", 400), null);
  });

  it("un domaine sans photo rend null, même s'il a un forfait", () => {
    assert.equal(photoDuDomaine(releve, "ch-rien", 400), null);
    assert.ok(forfaitDuDomaine(releve, "ch-rien"));
  });

  it("un domaine inconnu rend null des deux côtés", () => {
    assert.equal(photoDuDomaine(releve, "ch-inconnu", 400), null);
    assert.equal(forfaitDuDomaine(releve, "ch-inconnu"), null);
  });

  it("la légende de skiresort paraît dans la mention", () => {
    const p: PhotoVue = { ...bonne, source: "skiresort", titre: "Vue sur Verbier" };
    const m = mentionPhoto(p);
    assert.match(m, /skiresort\.fr/);
    assert.match(m, /Vue sur Verbier/);
  });
});

describe("sur le relevé réel", () => {
  it("photo et forfait d'un même domaine viennent de la même fiche", async () => {
    // C'est la raison d'être du fichier unique : deux appariements séparés
    // laissaient un domaine afficher la photo d'une station et le prix d'une
    // autre. Quand les deux viennent de la même source, la fiche doit être la
    // même — et la distance aussi.
    const r = await releveVues();
    let verifies = 0;
    for (const [id, v] of Object.entries(r.vues)) {
      if (!v.photo || !v.forfait) continue;
      if (v.photo.source !== v.forfait.source) continue;
      if (v.photo.source === "officiel" || v.photo.source === "proprietaire") {
        // Le relevé à la main n'a pas de fiche non plus : une adresse d'image
        // et une page de tarifs, chacune avec sa source.
        // Le site officiel n'a pas de « fiche » à apparier : la photo vient
        // de l'accueil, le tarif de la page « Tarifs » atteinte depuis cet
        // accueil. La cohérence est **structurelle** — les deux pages sont du
        // même site par construction —, et la re-tester par l'hôte échoue sur
        // une simple redirection (`kasurila.fi` → un autre hôte). On ne
        // vérifie donc ici que ce qui vaut d'être vérifié : les fiches.
        continue;
      }
      assert.equal(v.photo.cle, v.forfait.cle, `${id} : photo et forfait de fiches différentes`);
      assert.equal(v.photo.km, v.forfait.km, `${id} : deux distances pour une fiche`);
      verifies++;
    }
    assert.ok(verifies > 100, `trop peu de cas vérifiés : ${verifies}`);
  });

  it("au-delà du rayon de base, le nom a toujours corroboré", async () => {
    // Le rayon de base affirme une proximité. Au-delà, il faut un second
    // signal : un rattachement lointain **sans** `parLeNom` serait une
    // supposition muette, et c'est exactement ce qu'on s'interdit.
    const r = await releveVues();
    for (const [id, v] of Object.entries(r.vues)) {
      for (const [quoi, e] of [["photo", v.photo], ["forfait", v.forfait]] as const) {
        if (!e) continue;
        if (e.km > r.rayonKm) {
          assert.equal(e.parLeNom, true, `${id} : ${quoi} à ${e.km} km sans accord de nom`);
        }
      }
    }
  });

  it("aucune photo retenue ne pointe vers un hôte muet", async () => {
    const r = await releveVues();
    const muettes = Object.entries(r.vues).filter(([, v]) => v.photo && !v.photo.servi);
    assert.deepEqual(muettes.map(([id]) => id), []);
  });

  it("aucun forfait ne porte de prix sans devise", async () => {
    const r = await releveVues();
    for (const [id, v] of Object.entries(r.vues)) {
      const f = v.forfait;
      if (!f) continue;
      const aUnPrix = f.lignes.some((l) => l.prix.some((p) => p != null));
      if (aUnPrix) assert.ok(f.devise, `${id} : des prix sans devise`);
    }
  });

  it("une altitude de repli vient d'une fiche appariée, et tient debout", async () => {
    // Le référentiel n'a pas mesuré 144 domaines. Pour ceux qu'une fiche
    // Skiinfo ou skiresort décrit, on reprend son bas et son sommet — une
    // mesure de la source, avec son origine. Elle doit venir de la fiche déjà
    // appariée pour la photo ou le forfait (jamais d'une autre), et un sommet
    // sous le bas serait une donnée fausse, pas une mesure.
    const r = await releveVues();
    let n = 0;
    for (const [id, v] of Object.entries(r.vues)) {
      const a = altitudesDuDomaine(r, id);
      if (!a) continue;
      n++;
      assert.ok(a.sommetM > a.basM, `${id} : sommet ${a.sommetM} sous le bas ${a.basM}`);
      // « Appariée » veut dire : la fiche que l'appariement de cette source a
      // donnée au domaine — pas forcément celle affichée en photo ou en
      // forfait, qui peut venir d'une autre source mieux classée (bergfex, site
      // officiel), ou avoir été appariée sans photo ni grille. `be-dousberg`
      // est dans ce cas. On vérifie donc l'origine, pas la coïncidence.
      assert.ok(a.cle, `${id} : altitudes sans fiche d'origine`);
      assert.ok(["skiinfo", "skiresort"].includes(a.source), `${id} : source inconnue ${a.source}`);
      void v;
    }
    assert.ok(n >= 0);
  });

  it("des pistes de repli portent une valeur positive et leur origine", async () => {
    // Un zéro cartographié n'est pas zéro piste. La fiche appariée qui publie
    // des kilomètres les donne avec sa source ; un repli à zéro ou sans
    // origine serait pire que le zéro d'OpenSkiMap, qui au moins est mesuré.
    const r = await releveVues();
    let n = 0;
    for (const id of Object.keys(r.vues)) {
      const p = pistesDuDomaine(r, id);
      if (!p) continue;
      n++;
      assert.ok((p.km ?? 0) > 0 || (p.n ?? 0) > 0, `${id} : repli sans valeur`);
      assert.ok(p.cle && ["skiinfo", "skiresort"].includes(p.source), `${id} : repli sans origine`);
    }
    assert.ok(n >= 0);
  });

  it("la Russie n'a laissé ni photo ni forfait", async () => {
    const r = await releveVues();
    assert.deepEqual(Object.keys(r.vues).filter((id) => id.startsWith("ru-")), []);
  });
});
