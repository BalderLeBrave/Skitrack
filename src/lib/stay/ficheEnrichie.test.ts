import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Listing } from "../listings.ts";
import { lireDetailArkiane } from "../scrape/centrales/moteurs/arkiane.ts";
import { ficheOrchestra } from "../scrape/centrales/moteurs/orchestra.ts";
import {
  depuisAmenities,
  depuisListe,
  equipements,
  EQUIPEMENTS_FICHE,
  idEquipement,
  normaliserEquipements,
  type EquipementPublie,
} from "./equipements.ts";
import {
  aEquipement,
  aEquipementDemande,
  animauxDe,
  avisDe,
  avisRelu,
  conditionsDe,
  descriptionDe,
  equipementsDe,
  equipementsLus,
  equipementsTus,
  EXTRAITS_MAX,
  ficheDecideEquipements,
  noteAuMoins,
  noteSur5De,
  tronquer,
  type FicheEnrichie,
} from "./ficheEnrichie.ts";
import { decoderEntites } from "./texteHtml.ts";

function annonce(over: Partial<Listing> = {}): Listing {
  return {
    id: "a1",
    stationId: "les-2-alpes",
    title: "Appartement 6 personnes",
    source: "Airbnb",
    total: 1800,
    currency: "EUR",
    capacity: 6,
    bedrooms: 2,
    available: true,
    photo: null,
    url: "https://www.airbnb.fr/rooms/12345678",
    lat: null,
    lon: null,
    proven: "test",
    ...over,
  };
}

function fiche(over: Partial<FicheEnrichie> = {}): FicheEnrichie {
  return { equipements: [], avis: null, conditions: null, sourceFiche: "airbnb", ...over };
}

describe("équipements : une table, des clés stables", () => {
  it("français, anglais, accents, casse et synonymes vont à la même clé", () => {
    const cas: [string, string][] = [
      ["Hair dryer", "seche_cheveux"],
      ["Sèche-cheveux", "seche_cheveux"],
      ["SECHE CHEVEUX", "seche_cheveux"],
      ["TV", "television"],
      ["Télévision", "television"],
      ["HDTV with Netflix", "television"],
      ["Wifi", "wifi"],
      ["Wi-Fi – 50 Mbps", "wifi"],
      ["Connexion Wi-Fi gratuite", "wifi"],
      ["Washer", "lave_linge"],
      ["Dryer", "seche_linge"],
      ["Dishwasher", "lave_vaisselle"],
      ["Iron", "fer"],
      ["Elevator", "ascenseur"],
      ["Lift", "ascenseur"],
      ["Free parking on premises", "parking"],
      ["Pool", "piscine"],
      ["Hot tub", "jacuzzi"],
      ["Jacuzzi", "jacuzzi"],
      ["Air conditioning", "climatisation"],
      ["Heating", "chauffage"],
      ["Indoor fireplace", "cheminee"],
      ["Ski-in/Ski-out", "ski_aux_pieds"],
      ["Ski aux pieds", "ski_aux_pieds"],
      ["Pets allowed", "animaux"],
    ];
    for (const [libelle, id] of cas) assert.equal(idEquipement(libelle), id, libelle);
  });

  it("libellés Booking, MSEM, GreenGo : animaux qualifiés, placards à skis, télé à écran plat, bien-être", () => {
    const cas: [string, string][] = [
      ["Animaux domestiques admis", "animaux"],
      ["Animaux de compagnie admis", "animaux"],
      ["Animaux de compagnie autorisés", "animaux"],
      ["Chiens admis", "animaux"],
      ["Placards à Skis", "casier_skis"],
      ["Cave à skis", "casier_skis"],
      ["Locaux à skis", "casier_skis"],
      ["Local à vélos et skis", "casier_skis"],
      ["Flat-screen TV", "television"],
      ["Télévision à écran plat", "television"],
      ["Spa", "spa"],
      ["Spa privé", "spa"],
      ["Hammam", "hammam"],
      ["Steam room", "hammam"],
      ["Nordic bath", "bain_nordique"],
      ["Bain nordique", "bain_nordique"],
      ["Spa bath", "jacuzzi"],
    ];
    for (const [libelle, id] of cas) assert.equal(idEquipement(libelle), id, libelle);
    // Hors table : « chiens » sans verbe, une gamelle, un spa du voisinage.
    assert.equal(idEquipement("Chiens non admis"), "autre:chiens");
    assert.equal(idEquipement("Pet bowls"), "autre:pet bowls");
    assert.equal(idEquipement("Gamelles pour animaux"), "autre:gamelles pour animaux");
    assert.equal(idEquipement("Spa nearby"), "autre:spa nearby");
    assert.deepEqual(
      normaliserEquipements([
        { libelle: "Pas d'animaux de compagnie" },
        { libelle: "No spa" },
        { libelle: "Hammam", present: true },
      ]).map((e) => [e.id, e.present]),
      [
        ["animaux", false],
        ["spa", false],
        ["hammam", true],
      ],
    );
  });

  it("un libellé hors table garde son texte, sous « autre: », sans clé inventée", () => {
    assert.equal(idEquipement("Coffee maker"), "autre:coffee maker");
    assert.equal(
      idEquipement("Pool table"),
      "autre:pool table",
      "un billard n'est pas une piscine",
    );
    assert.equal(
      idEquipement("Ski lift nearby"),
      "autre:ski lift nearby",
      "une remontée n'est pas un ascenseur",
    );
    const [e] = normaliserEquipements([{ libelle: "Coffee maker" }]);
    assert.deepEqual(e, { id: "autre:coffee maker", libelle: "Coffee maker", present: true });
  });

  it("dédoublonnés par clé : le premier libellé reste, un présent l'emporte sur un absent", () => {
    const es = normaliserEquipements([
      { libelle: "Hair dryer" },
      { libelle: "Sèche-cheveux" },
      { libelle: "No pets" },
      { libelle: "Pets allowed" },
    ]);
    assert.deepEqual(
      es.map((e) => [e.id, e.libelle, e.present]),
      [
        ["seche_cheveux", "Hair dryer", true],
        ["animaux", "No pets", true],
      ],
    );
  });

  it("absent seulement quand la source le dit ; le libellé source est gardé tel quel", () => {
    const es = normaliserEquipements([
      { libelle: "Pets not allowed" },
      { libelle: "Unavailable: TV" },
      { libelle: "Pas de wifi" },
      { libelle: "Hair dryer", present: false },
      { libelle: "Washer", present: true },
    ]);
    assert.deepEqual(
      es.map((e) => [e.id, e.libelle, e.present]),
      [
        ["animaux", "Pets not allowed", false],
        ["television", "Unavailable: TV", false],
        ["wifi", "Pas de wifi", false],
        ["seche_cheveux", "Hair dryer", false],
        ["lave_linge", "Washer", true],
      ],
    );
  });

  it("un équipement non mentionné n'est pas absent : il n'est pas dans la liste", () => {
    const l = annonce({
      fiche: fiche({ equipements: normaliserEquipements([{ libelle: "Wifi" }]) }),
    });
    assert.equal(
      equipementsDe(l)!.some((e) => e.id === "seche_cheveux"),
      false,
    );
    assert.equal(aEquipement(l, "seche_cheveux"), false);
    assert.equal(aEquipement(l, "wifi"), true);
  });

  it("les douze clés des collecteurs existants passent sur la table ; « inconnu » ne donne rien", () => {
    const es = depuisAmenities(equipements({ wifi: "oui", parking: "non", laveLinge: "oui" }));
    assert.deepEqual(
      es!.map((e) => [e.id, e.present]),
      [
        ["wifi", true],
        ["lave_linge", true],
        ["parking", false],
      ],
    );
    assert.equal(depuisAmenities(null), null);
  });

  it("chaque clé de la table a son pictogramme dans la fiche, pas la coche générique", () => {
    // `PictoFiche.tsx` (JSX, hors de portée de ce lanceur) : ses clés, lues dans le source.
    const src = readFileSync(
      new URL("../../components/v7/fiche/PictoFiche.tsx", import.meta.url),
      "utf8",
    );
    const debut = src.indexOf("const EQUIPEMENT");
    const bloc = src.slice(debut, src.indexOf("\n};", debut));
    const traces = new Set([...bloc.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
    assert.deepEqual(
      Object.keys(EQUIPEMENTS_FICHE).filter((id) => !traces.has(id)),
      [],
    );
    assert.ok(["spa", "hammam", "bain_nordique"].every((id) => traces.has(id)));
  });
});

describe("filtres : jamais l'inconnu pour un oui", () => {
  const avecSecheCheveux = annonce({
    id: "a",
    fiche: fiche({ equipements: normaliserEquipements([{ libelle: "Hair dryer" }]) }),
  });
  const nonEnrichie = annonce({ id: "b" });
  const sansLeDire = annonce({
    id: "c",
    fiche: fiche({ equipements: normaliserEquipements([{ libelle: "TV" }]) }),
  });
  const ditAbsent = annonce({
    id: "d",
    fiche: fiche({
      equipements: normaliserEquipements([{ libelle: "Hair dryer", present: false }]),
    }),
  });

  it("« sèche-cheveux » ne retient ni les annonces non enrichies, ni celles qui le taisent ou le disent absent", () => {
    const retenues = [avecSecheCheveux, nonEnrichie, sansLeDire, ditAbsent].filter((l) =>
      aEquipement(l, "seche_cheveux"),
    );
    assert.deepEqual(
      retenues.map((l) => l.id),
      ["a"],
    );
  });

  it("« Sauna » couvre « Sauna ou spa » des collecteurs, sans toucher la clé seule (`aEquipement`)", () => {
    // Une centrale (MSEM « Espace SPA », iResa rub_sauna_hbgt) : la clé fermée saunaSpa.
    const centrale = annonce({
      id: "centrale",
      source: "Centrale",
      amenities: equipements({ saunaSpa: "oui" }),
    });
    assert.equal(aEquipement(centrale, "sauna"), false);
    assert.equal(aEquipementDemande(centrale, "sauna"), true);
    assert.equal(aEquipementDemande(centrale, "sauna_spa"), true);
    assert.equal(
      aEquipementDemande(centrale, "spa"),
      false,
      "un « Spa » demandé reste la clé seule",
    );
    const listant = (libelle: string) =>
      annonce({ id: libelle, fiche: fiche({ equipements: normaliserEquipements([{ libelle }]) }) });
    // « Sauna ou spa » couvre tout ce que la clé fermée recouvre, nommé à part par une fiche.
    for (const libelle of ["Sauna", "Spa", "Hammam", "Nordic bath", "Hot tub"])
      assert.equal(aEquipementDemande(listant(libelle), "sauna_spa"), true, libelle);
    assert.equal(aEquipementDemande(listant("Sauna"), "sauna"), true);
    for (const libelle of ["Spa", "Hammam", "Hot tub"])
      assert.equal(
        aEquipementDemande(listant(libelle), "sauna"),
        false,
        `${libelle} n'est pas un sauna`,
      );
    assert.equal(aEquipementDemande(listant("Spa"), "spa"), true);
    assert.equal(aEquipementDemande(listant("Wifi"), "wifi"), true, "les autres : la clé seule");
    assert.equal(aEquipementDemande(annonce(), "sauna"), false, "rien de lu, rien ne passe");
  });

  it("« Animaux acceptés » : la liste d'abord, sinon le règlement lu ; « sur demande » ne passe pas", () => {
    const avec = (
      equipements: string[],
      animaux: "oui" | "non" | "sur_demande" | null,
      indisponible = false,
    ) =>
      annonce({
        fiche: fiche({
          equipements: normaliserEquipements(equipements.map((libelle) => ({ libelle }))),
          conditions: animaux ? { animaux } : null,
          ...(indisponible ? { indisponible } : {}),
        }),
      });
    const regleOui = avec(["Wifi"], "oui");
    assert.equal(animauxDe(regleOui), "oui");
    assert.equal(aEquipement(regleOui, "animaux"), false, "la clé seule n'a pas changé");
    assert.equal(aEquipementDemande(regleOui, "animaux"), true);
    assert.equal(aEquipementDemande(avec(["Wifi"], "sur_demande"), "animaux"), false);
    assert.equal(aEquipementDemande(avec(["Wifi"], "non"), "animaux"), false);
    assert.equal(aEquipementDemande(avec(["Wifi"], null), "animaux"), false);
    // La liste l'emporte sur le règlement, dans les deux sens.
    assert.equal(animauxDe(avec(["Pets not allowed"], "oui")), "non");
    assert.equal(aEquipementDemande(avec(["Pets not allowed"], "oui"), "animaux"), false);
    assert.equal(aEquipementDemande(avec(["Animaux domestiques admis"], "non"), "animaux"), true);
    // Une fiche indisponible ne dit rien, règlement compris.
    assert.equal(aEquipementDemande(avec([], "oui", true), "animaux"), false);
    // Sans fiche : les douze clés des collecteurs.
    assert.equal(
      aEquipementDemande(annonce({ amenities: equipements({ animaux: "oui" }) }), "animaux"),
      true,
    );
    assert.equal(animauxDe(annonce()), null);
  });

  it("« note ≥ 4,5 » écarte les annonces sans note et garde un 9,0 / 10 ramené à 4,5", () => {
    const neufSurDix = annonce({
      id: "booking",
      source: "Booking",
      fiche: fiche({
        sourceFiche: "booking",
        avis: { noteSur5: null, noteSource: 9, echelleSource: 10, nombre: 40, extraits: [] },
      }),
    });
    const sansNote = annonce({ id: "sans" });
    const quatreDeux = annonce({ id: "42", rating: 4.2, reviewCount: 10 });
    const retenues = [neufSurDix, sansNote, quatreDeux].filter((l) => noteAuMoins(l, 4.5));
    assert.deepEqual(
      retenues.map((l) => l.id),
      ["booking"],
    );
    assert.equal(noteSur5De(neufSurDix), 4.5);
    assert.equal(noteSur5De(sansNote), null, "pas un zéro");
  });
});

describe("avis : tout sur 5, rien d'inventé", () => {
  it("une note Booking 9,2 / 10 est stockée brute et lue 4,6 / 5", () => {
    const a = avisRelu({
      noteSur5: 4.6,
      noteSource: 9.2,
      echelleSource: 10,
      nombre: 87,
      extraits: [],
    })!;
    assert.equal(a.noteSur5, 4.6);
    assert.equal(a.noteSource, 9.2);
    assert.equal(a.echelleSource, 10);
  });

  it("une note brute dont l'échelle n'est pas enregistrée ne se lit pas", () => {
    const a = avisRelu({
      noteSur5: 9.2,
      noteSource: 9.2,
      echelleSource: null,
      nombre: 87,
      extraits: [],
    })!;
    assert.equal(a.noteSur5, null);
    assert.equal(a.nombre, 87);
  });

  it("cinq extraits au plus, chacun avec sa note sur 5 ou aucune, le prénom seul", () => {
    const extraits = Array.from({ length: 8 }, (_, i) => ({
      auteur: "Marie Dupont",
      date: `2026-0${(i % 9) + 1}-01`,
      noteSur5: null,
      noteSource: i === 0 ? 10 : null,
      texte: `Séjour ${i}`,
    }));
    const a = avisRelu({
      noteSur5: null,
      noteSource: 9.6,
      echelleSource: 10,
      nombre: 120,
      extraits,
    })!;
    assert.equal(a.extraits.length, EXTRAITS_MAX);
    assert.equal(a.extraits[0].noteSur5, 5);
    assert.equal(a.extraits[1].noteSur5, null);
    assert.equal(a.extraits[0].auteur, "Marie");
    assert.equal(a.noteSur5, 4.8);
  });

  it("0 avis et pas de note : pas d'avis du tout, pas de 0 / 5", () => {
    assert.equal(
      avisRelu({ noteSur5: null, noteSource: null, echelleSource: 5, nombre: 0, extraits: [] }),
      null,
    );
    assert.equal(avisDe(annonce({ rating: null, reviewCount: 0 })), null);
    assert.equal(
      avisDe(annonce({ rating: 4.9, reviewCount: 0 })),
      null,
      "une note sans avis n'est pas publiée",
    );
  });

  it("les notes d'avant la fiche : sur 5 quand le collecteur l'établit, sinon rien", () => {
    assert.equal(noteSur5De(annonce({ rating: 4.86, reviewCount: 120 })), 4.9, "Airbnb, sur 5");
    assert.equal(noteSur5De(annonce({ source: "Travelski", rating: 4.84, reviewCount: 3 })), 4.8);
    // GreenGo et Maeva recopient une note sans borne : son échelle n'est pas établie.
    assert.equal(noteSur5De(annonce({ source: "GreenGo", rating: 4.5, reviewCount: 3 })), null);
    assert.equal(noteSur5De(annonce({ source: "Maeva", rating: 8.4, reviewCount: 30 })), null);
  });
});

describe("description et conditions : le texte de la source, sinon rien", () => {
  it("la description de la fiche, sinon celle de l'annonce", () => {
    assert.equal(
      descriptionDe(annonce({ description: "  Au pied des pistes.  " })),
      "Au pied des pistes.",
    );
    assert.equal(
      descriptionDe(
        annonce({ description: "ancienne", fiche: fiche({ description: "Lue sur la fiche." }) }),
      ),
      "Lue sur la fiche.",
    );
    assert.equal(descriptionDe(annonce()), null);
  });

  it("une longue description se coupe à un mot entier, ou à la fin d'une phrase", () => {
    const t =
      "Bel appartement rénové. Vue sur les pistes et le village, balcon plein sud, parking couvert.";
    const court = tronquer(t, 40);
    assert.ok(court.length <= 41, court);
    assert.ok(!/\s…$/.test(court) && !/\w…\w/.test(court), court);
    assert.equal(tronquer("Court.", 40), "Court.");
    assert.equal(
      tronquer("Une phrase complète ici. Puis une suite qui déborde largement.", 30),
      "Une phrase complète ici.",
    );
  });

  it("les conditions publiées seulement, sans valeur par défaut", () => {
    const l = annonce({
      fiche: fiche({
        conditions: {
          arrivee: "Après 16:00",
          depart: " ",
          animaux: "non",
          fetes: null,
          texteSource: "Pas de fêtes ni d'événements",
        },
      }),
    });
    assert.deepEqual(conditionsDe(l), {
      arrivee: "Après 16:00",
      texteSource: "Pas de fêtes ni d'événements",
      animaux: "non",
    });
    assert.equal(conditionsDe(annonce()), null);
    assert.equal(conditionsDe(annonce({ fiche: fiche({ conditions: { depart: "" } }) })), null);
  });

  it("une fiche indisponible (403, 429) ne dit rien : les équipements de l'annonce restent", () => {
    const l = annonce({
      amenities: equipements({ wifi: "oui" }),
      fiche: fiche({ indisponible: true }),
    });
    assert.deepEqual(
      equipementsDe(l)!.map((e) => e.id),
      ["wifi"],
    );
  });
});

describe("équipements à l'écran : lus, tus, non lus", () => {
  // Gîtes, Ski-Planet : une fiche lue sans liste, et des douze clés tirées de la description.
  const amenities = equipements({ balcon: "oui", wifi: "oui" });

  it("une fiche lue décide seule : ni les oui ni les « non indiqué » des collecteurs", () => {
    const l = annonce({ amenities, fiche: fiche({ description: "Chalet." }) });
    assert.equal(ficheDecideEquipements(l), true);
    assert.equal(equipementsDe(l), null, "la règle reste : rien de déduit d'un texte");
    assert.deepEqual(equipementsTus(l), []);
    assert.equal(equipementsLus(l), true, "lue, sans liste publiée");
  });

  it("sans fiche, ou fiche indisponible : les clés que les collecteurs taisent", () => {
    for (const l of [
      annonce({ amenities }),
      annonce({ amenities, fiche: fiche({ indisponible: true }) }),
    ]) {
      assert.equal(ficheDecideEquipements(l), false);
      const tus = equipementsTus(l);
      assert.equal(tus.length, 10);
      assert.ok(tus.includes("parking") && !tus.includes("wifi"));
      assert.equal(equipementsLus(l), true);
    }
  });

  it("ni fiche ni douze clés : non lus, ce qui n'est pas « non publié »", () => {
    assert.equal(equipementsLus(annonce()), false);
    assert.equal(equipementsLus(annonce({ fiche: fiche({ indisponible: true }) })), false);
    assert.deepEqual(equipementsTus(annonce()), []);
  });
});

/* ---------- Les libellés publiés sans fiche (`equipementsPublies`) ---------- */

const CENTRALES = new URL("../scrape/centrales/moteurs/fixtures/", import.meta.url);
const ORCHESTRA = readFileSync(new URL("orchestra-laplagne-fiche-chardonnet.html", CENTRALES), "utf8");
const ARKIANE = readFileSync(new URL("arkiane-pralognan-detail-colliouroe.html", CENTRALES), "utf8");

/** Les lignes « Caractéristiques » de la fiche Orchestra, telles que la centrale les publie. */
function caracteristiquesOrchestra(page: string): EquipementPublie[] {
  const bloc = /Caract(?:é|&eacute;)ristiques\s*<\/h3>\s*<div class="txt-content">([\s\S]*?)<\/div>/.exec(page)![1];
  return bloc
    .split(/<br\s*\/?>/)
    .map((l) => decoderEntites(l.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim().replace(/^-\s*/, ""))
    .filter(Boolean)
    .map((libelle) => ({ libelle }));
}

/** Les pictos de la zone « Equipements » du détail Arkiane : leur `alt`. */
function pictosArkiane(page: string): EquipementPublie[] {
  const zone = /Equipements\s*:\s*<\/div>([\s\S]*?)<\/div>/.exec(page)![1];
  return [...zone.matchAll(/<img[^>]+class="picto[^"]*"[^>]+alt="([^"]+)"/g)].map((m) => ({
    libelle: decoderEntites(m[1]),
  }));
}

describe("équipements publiés sans fiche : réunis aux douze clés, par clé", () => {
  const ids = (l: Listing) => equipementsDe(l)!.map((e) => (e.present ? e.id : `${e.id}(non)`));
  const orchestra = annonce({
    source: "Centrale",
    amenities: equipements(ficheOrchestra(ORCHESTRA).equipements),
    equipementsPublies: caracteristiquesOrchestra(ORCHESTRA),
  });

  it("Orchestra (La Plagne) : la Télévision et ce que la table ignore arrivent, les douze clés restent", () => {
    assert.deepEqual(ids(orchestra), [
      "balcon",
      "wifi",
      "lave_vaisselle",
      "linge_fourni",
      "casier_skis",
      "animaux(non)",
      "ascenseur",
      "autre:oriente sud",
      "autre:oriente ouest",
      "television",
      "autre:proche des pistes",
    ]);
    assert.equal(aEquipement(orchestra, "television"), true);
    // Les clés tirées de la description ne dérivent pas (« Linge fourni »
    // relu par la table serait `autre:linge fourni`).
    for (const id of ["casier_skis", "linge_fourni", "wifi"]) assert.equal(aEquipement(orchestra, id), true, id);
    assert.equal(animauxDe(orchestra), "non");
    // Sans doublon : une clé, une ligne.
    const vus = ids(orchestra).map((x) => x.replace("(non)", ""));
    assert.equal(new Set(vus).size, vus.length);
    // Le libellé de la source reste, sous le nom de la table.
    const libelle = (id: string) => equipementsDe(orchestra)!.find((e) => e.id === id)?.libelle;
    assert.deepEqual(
      [libelle("wifi"), libelle("balcon"), libelle("television"), libelle("linge_fourni")],
      ["Connexion WIFI", "Balcon / Terrasse", "Télévision", "Linge fourni"],
    );
  });

  it("Arkiane (Pralognan) : le picto Télévision s'ajoute aux douze clés des pictos", () => {
    const l = annonce({
      source: "Centrale",
      amenities: equipements(lireDetailArkiane(ARKIANE).equipements),
      equipementsPublies: pictosArkiane(ARKIANE),
    });
    assert.deepEqual(ids(l), [
      "balcon",
      "wifi",
      "lave_vaisselle",
      "lave_linge",
      "linge_fourni",
      "parking",
      "animaux(non)",
      "television",
    ]);
    assert.equal(equipementsDe(l)!.find((e) => e.id === "parking")?.libelle, "Garage / Parking");
    assert.equal(aEquipement(annonce({ source: "Centrale", amenities: l.amenities }), "television"), false, "avant : perdue");
  });

  it("une liste publiée sans les douze clés : la liste fermée la lit comme le collecteur, refus compris", () => {
    const l = annonce({ source: "Centrale", equipementsPublies: caracteristiquesOrchestra(ORCHESTRA) });
    assert.deepEqual(ids(l), [
      "balcon",
      "wifi",
      "lave_vaisselle",
      "animaux(non)",
      "ascenseur",
      "autre:oriente sud",
      "autre:oriente ouest",
      "television",
      "autre:proche des pistes",
    ]);
    assert.equal(equipementsLus(l), true, "lus : pas « Équipements non lus »");
    assert.deepEqual(equipementsTus(l), []);
  });

  it("les douze clés relevées décident de ce que la liste fermée lit ; les clés qu'elles taisent ne sont plus « non indiqué »", () => {
    // MSEM : « Espace SPA », « Hammam » sont la clé fermée « Sauna ou spa » ;
    // elle ne se double pas d'une ligne « Hammam ».
    const catalogue = JSON.parse(
      readFileSync(new URL("msem-alpedhuez-3-hebergements.json", CENTRALES), "utf8"),
    ) as { catalogue: { options: { code: string; label: string }[] } };
    const option = (code: string) => ({ libelle: catalogue.catalogue.options.find((o) => o.code === code)!.label });
    const l = annonce({
      source: "Centrale",
      amenities: equipements({ saunaSpa: "oui" }),
      equipementsPublies: [option("6"), option("9"), option("4")],
    });
    assert.deepEqual(ids(l), ["sauna_spa", "autre:pied des pistes"]);
    assert.equal(equipementsDe(l)![0].libelle, "Espace SPA", "le premier libellé de la source reste");
    assert.equal(aEquipementDemande(l, "sauna"), true);
    // Une clé « inconnu » que la liste publiée dit : comblée, plus tue.
    const comblee = annonce({
      source: "Centrale",
      amenities: equipements({ balcon: "oui" }),
      equipementsPublies: [option("8")],
    });
    assert.equal(aEquipement(comblee, "parking"), true);
    assert.ok(!equipementsTus(comblee).includes("parking"));
    assert.ok(equipementsTus(comblee).includes("wifi"));
  });

  it("hors liste fermée, sur une clé déjà là : un présent l'emporte, le libellé de la source reste", () => {
    // « Bed sheets » échappe aux douze motifs, pas à la table : `linge_fourni`.
    const l = annonce({
      amenities: equipements({ linge: "non", casierSkis: "oui" }),
      equipementsPublies: [{ libelle: "Bed sheets" }, { libelle: "Télévision", present: false }],
    });
    const linge = equipementsDe(l)!.find((e) => e.id === "linge_fourni")!;
    assert.deepEqual([linge.present, linge.libelle], [true, "Bed sheets"]);
    assert.deepEqual(ids(l), ["linge_fourni", "casier_skis", "television(non)"]);
    assert.equal(aEquipement(l, "television"), false, "absent quand la source le dit");
    // Les lectures gardées par libellé ne se partagent pas avec l'appelant.
    equipementsDe(l)!.find((e) => e.id === "television")!.present = true;
    assert.equal(aEquipement(l, "television"), false);
  });

  it("une fiche lue décide seule : la liste publiée ne s'y ajoute pas", () => {
    const l = annonce({
      amenities: equipements({ casierSkis: "oui" }),
      equipementsPublies: [{ libelle: "Télévision" }, { libelle: "Local à ski" }],
    });
    assert.deepEqual(ids(l), ["casier_skis", "television"]);
    assert.equal(aEquipement(l, "casier_skis"), true);
    const lue = { ...l, fiche: fiche({ equipements: normaliserEquipements([{ libelle: "Wifi" }]) }) };
    assert.deepEqual(ids(lue), ["wifi"]);
    assert.equal(aEquipement(lue, "television"), false);
    assert.equal(equipementsDe({ ...l, fiche: fiche({ description: "Chalet." }) }), null);
    // Une fiche indisponible ne dit rien : la liste publiée revient.
    assert.deepEqual(ids({ ...l, fiche: fiche({ indisponible: true }) }), ["casier_skis", "television"]);
  });

  it("Airbnb : des titres de tuile gardés aussi tels quels ajoutent TV, sèche-cheveux, ski aux pieds", () => {
    // Les titres que `equipements_tuile` (scrape/airbnb/map.py) garderait de
    // ces groupes : ni « Non inclus », ni `available: false`. Seule capture du
    // dépôt qui en porte : la réponse PDP ; aucune tuile StaysSearch figée.
    const pdp = JSON.parse(
      readFileSync(new URL("../../../scrape/airbnb/fixtures/pdp_fiche_enrichie.json", import.meta.url), "utf8"),
    );
    const groupes = pdp.data.presentation.stayProductDetailPage.sections.sections[1].section.seeAllAmenitiesGroups as {
      title: string;
      amenities: { title: string; available?: boolean }[];
    }[];
    const titres = groupes
      .filter((g) => !/^non inclus$/i.test(g.title))
      .flatMap((g) => g.amenities.filter((a) => a.available !== false).map((a) => a.title));
    assert.deepEqual(titres, ["Sèche-cheveux", "TV", "Wifi", "Parking gratuit sur place", "Ski-in/Ski-out"]);
    // Les douze clés comme `amenitiesDeTitres` (airbnb.server.ts) les tire des titres.
    const amenities = equipements(depuisListe(titres.map((texte) => ({ texte }))));
    const avant = annonce({ amenities });
    assert.deepEqual(ids(avant), ["wifi", "parking"]);
    const l = annonce({ amenities, equipementsPublies: titres.map((libelle) => ({ libelle })) });
    assert.deepEqual(ids(l), ["wifi", "parking", "seche_cheveux", "television", "ski_aux_pieds"]);
    for (const id of ["television", "seche_cheveux", "ski_aux_pieds"]) {
      assert.equal(aEquipement(avant, id), false, `${id} : avant, perdu`);
      assert.equal(aEquipement(l, id), true, id);
    }
    assert.equal(equipementsDe(l)!.find((e) => e.id === "parking")?.libelle, "Parking gratuit sur place");
    // Sa fiche PDP lue décide seule ensuite, « Non inclus » compris.
    const lue = { ...l, fiche: fiche({ equipements: normaliserEquipements([{ libelle: "Lave-linge", present: false }]) }) };
    assert.deepEqual(ids(lue), ["lave_linge(non)"]);
  });

  it("sans liste publiée, rien ne change ; une liste vide ou illisible ne dit rien", () => {
    const amenities = equipements({ wifi: "oui", parking: "non" });
    for (const equipementsPublies of [undefined, null, [], [{ libelle: "  " }], [{ libelle: 3 }] as never])
      assert.deepEqual(equipementsDe(annonce({ amenities, equipementsPublies })), depuisAmenities(amenities));
    assert.equal(equipementsDe(annonce({ equipementsPublies: [] })), null);
    assert.equal(equipementsLus(annonce({ equipementsPublies: [] })), false);
  });
});
