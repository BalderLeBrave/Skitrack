import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Listing } from "../listings.ts";
import type { LectureAGarder } from "../stay/contenuFiches.server.ts";
import {
  demanderFichesCozy,
  lectureCozyEnCours,
  lireFicheCozy,
  lireFichesCozyMaintenant,
  noterRefsCozy,
  oublierFichesCozy,
  refCozy,
  REFS_DUREE_MS,
  type PorteCozy,
  type ReponseApi,
} from "./cozyFiches.server.ts";

const FX = JSON.parse(
  readFileSync(new URL("./fixtures/cozy-fiche-2alpes-2026-10-16.json", import.meta.url), "utf8"),
) as Record<"abritel" | "booking", { uid: string; getDetails: unknown; getPhotos: unknown; getReviews: unknown }>;

function annonce(id: string, source: Listing["source"], platformId: string): Listing {
  return {
    id,
    stationId: "les-2-alpes",
    title: "Appartement",
    source,
    total: 600,
    currency: "EUR",
    capacity: 2,
    bedrooms: 1,
    available: true,
    photo: "https://v/1.jpg",
    photos: ["https://v/1.jpg", "https://v/2.jpg", "https://v/3.jpg"],
    platformId,
    url: `https://example.test/${platformId}`,
    lat: 45,
    lon: 6.1,
    proven: "CozyCozy live",
  };
}

/** Une page de liste Cozy, avec la recherche qui l'a rendue. */
function page(searchId: string, entrees: { acc: number; uid: string; n?: number }[]) {
  return {
    searchId,
    entries: entrees.map((e) => ({ type: "result", accommodationId: e.acc, uid: e.uid, lightThumbnails: { count: e.n ?? 9 } })),
  };
}

type Appel = { methode: string; corps: Record<string, unknown> };

function porteEssai(reponses: (a: Appel) => ReponseApi, deja: Set<string> = new Set()) {
  const appels: Appel[] = [];
  const gardees: LectureAGarder[] = [];
  let ferme: string | null = null;
  const porte: PorteCozy = {
    api: async (methode, corps) => {
      const a = { methode, corps };
      appels.push(a);
      return reponses(a);
    },
    garder: (l) => {
      gardees.push(...l);
      return l.length;
    },
    dejaGardee: (cle) => deja.has(cle),
    fermee: () => ferme,
    dormir: async () => {},
  };
  return { porte, appels, gardees, fermer: (r: string) => (ferme = r) };
}

const reel = ({ methode, corps }: Appel): ReponseApi => {
  const fx = corps.uid === FX.booking.uid ? FX.booking : FX.abritel;
  const json = methode === "getDetails" ? fx.getDetails : methode === "getPhotos" ? fx.getPhotos : fx.getReviews;
  return { statut: 200, json };
};

afterEach(() => oublierFichesCozy());

describe("refs", () => {
  it("une heure au plus : au-delà, la recherche Cozy ne sert plus", () => {
    noterRefsCozy([page("S1", [{ acc: 100293015, uid: FX.abritel.uid }])], 1_000);
    const l = annonce("abr-100293015", "Abritel", "112915552");
    assert.deepEqual(refCozy(l, 2_000), { accommodationId: "100293015", uid: FX.abritel.uid, searchId: "S1", photos: 9 });
    assert.equal(refCozy(l, 1_000 + REFS_DUREE_MS + 1), null);
    assert.equal(refCozy(annonce("abr-1", "Abritel", "1"), 2_000), null);
  });
});

describe("lireFicheCozy", () => {
  it("Abritel : détails et galerie entière, pas d'avis (Cozy n'en rend pas), le tout gardé", async () => {
    const { porte, appels, gardees } = porteEssai(reel);
    const l = annonce("abr-100293015", "Abritel", "112915552");
    const issue = await lireFicheCozy(l, { accommodationId: "100293015", uid: FX.abritel.uid, searchId: "S1", photos: 9 }, porte);
    assert.equal(issue, "gardee");
    assert.deepEqual(
      appels.map((a) => a.methode),
      ["getDetails", "getPhotos"],
    );
    assert.deepEqual(appels[0].corps, { uid: FX.abritel.uid, searchId: "S1" });
    assert.equal(gardees.length, 1);
    assert.equal(gardees[0].cle, "Abritel:112915552");
    assert.equal(gardees[0].fiche?.sourceFiche, "cozy");
    assert.equal(gardees[0].contenu?.photos?.length, 9);
    assert.equal(gardees[0].contenu?.baths, 1);
    assert.equal(gardees[0].contenu?.origine, "cozy");
  });

  it("Booking : les avis aussi ; pas de galerie quand la liste n'annonce pas plus de photos", async () => {
    const { porte, appels, gardees } = porteEssai(reel);
    const l = annonce("bk-52576209", "Booking", "7236901");
    const issue = await lireFicheCozy(l, { accommodationId: "52576209", uid: FX.booking.uid, searchId: "S1", photos: 3 }, porte);
    assert.equal(issue, "gardee");
    assert.deepEqual(
      appels.map((a) => a.methode),
      ["getDetails", "getReviews"],
    );
    assert.equal(gardees[0].fiche?.avis?.extraits.length, 2);
    assert.equal(gardees[0].contenu, null);
  });

  it("réponse vide : la recherche n'existe plus chez Cozy, rien n'est gardé", async () => {
    const { porte, gardees } = porteEssai(() => ({ statut: 200, json: {} }));
    const issue = await lireFicheCozy(annonce("abr-1", "Abritel", "1"), { accommodationId: "1", uid: "1-2", searchId: "S", photos: 9 }, porte);
    assert.equal(issue, "perdue");
    assert.equal(gardees.length, 0);
  });

  it("un refus s'arrête là, sans autre requête", async () => {
    const { porte, appels } = porteEssai(() => ({ statut: 429, json: null }));
    const issue = await lireFicheCozy(annonce("abr-1", "Abritel", "1"), { accommodationId: "1", uid: "1-2", searchId: "S", photos: 9 }, porte);
    assert.equal(issue, "refus");
    assert.equal(appels.length, 1);
  });
});

describe("la file", () => {
  it("lit les fiches des annonces Cozy, saute celles déjà gardées ou d'autres sources", async () => {
    noterRefsCozy([
      page("S1", [
        { acc: 100293015, uid: FX.abritel.uid },
        { acc: 52576209, uid: FX.booking.uid },
        { acc: 7, uid: "7-1" },
      ]),
    ]);
    const { porte, gardees } = porteEssai(reel, new Set(["Abritel:777"]));
    const rows = [
      annonce("abr-100293015", "Abritel", "112915552"),
      annonce("bk-52576209", "Booking", "7236901"),
      annonce("abr-7", "Abritel", "777"),
      annonce("gdf-1", "Gîtes de France", "1"),
    ];
    assert.equal(demanderFichesCozy(rows, { porte }), 2);
    await lectureCozyEnCours();
    assert.deepEqual(
      gardees.map((g) => g.cle),
      ["Abritel:112915552", "Booking:7236901"],
    );
    // Tentées : une nouvelle demande ne les relit pas.
    assert.equal(demanderFichesCozy(rows, { porte }), 0);
  });

  it("au premier refus, la file se vide", async () => {
    noterRefsCozy([
      page("S1", [
        { acc: 1, uid: "1-1" },
        { acc: 2, uid: "2-1" },
        { acc: 3, uid: "3-1" },
      ]),
    ]);
    const { porte, appels } = porteEssai(() => ({ statut: 403, json: null }));
    demanderFichesCozy(
      [annonce("abr-1", "Abritel", "1"), annonce("abr-2", "Abritel", "2"), annonce("abr-3", "Abritel", "3")],
      { porte },
    );
    await lectureCozyEnCours();
    assert.equal(appels.length, 1);
  });

  it("une recherche expirée retire ses autres fiches, pas celles d'une autre recherche", async () => {
    noterRefsCozy([page("VIEILLE", [{ acc: 1, uid: "1-1" }, { acc: 2, uid: "2-1" }]), page("S1", [{ acc: 100293015, uid: FX.abritel.uid }])]);
    const { porte, appels, gardees } = porteEssai((a) => (a.corps.searchId === "VIEILLE" ? { statut: 200, json: {} } : reel(a)));
    demanderFichesCozy(
      [annonce("abr-1", "Abritel", "1"), annonce("abr-2", "Abritel", "2"), annonce("abr-100293015", "Abritel", "112915552")],
      { porte },
    );
    await lectureCozyEnCours();
    assert.equal(appels.filter((a) => a.corps.searchId === "VIEILLE").length, 1);
    assert.deepEqual(
      gardees.map((g) => g.cle),
      ["Abritel:112915552"],
    );
  });

  it("l'annonce qu'on ouvre passe en tête, et l'attente rend dès qu'elle est lue", async () => {
    noterRefsCozy([
      page("S1", [
        { acc: 1, uid: "1-1" },
        { acc: 2, uid: "2-1" },
        { acc: 100293015, uid: FX.abritel.uid },
      ]),
    ]);
    const ordre: string[] = [];
    const { porte } = porteEssai((a) => {
      if (a.methode === "getDetails") ordre.push(String(a.corps.uid));
      return reel(a);
    });
    demanderFichesCozy([annonce("abr-1", "Abritel", "1"), annonce("abr-2", "Abritel", "2")], { porte });
    await lireFichesCozyMaintenant([annonce("abr-100293015", "Abritel", "112915552")], 5_000, { porte });
    // La première de la file était déjà partie ; l'ouverte passe juste après.
    assert.ok(ordre.indexOf(FX.abritel.uid) <= 1, ordre.join(","));
    await lectureCozyEnCours();
  });

  it("l'attente ne dépasse pas son échéance", async () => {
    noterRefsCozy([page("S1", [{ acc: 9, uid: "9-1" }])]);
    const porte: PorteCozy = {
      ...porteEssai(reel).porte,
      api: () => new Promise<ReponseApi>(() => {}),
    };
    const t0 = Date.now();
    await lireFichesCozyMaintenant([annonce("abr-9", "Abritel", "9")], 50, { porte });
    assert.ok(Date.now() - t0 < 1_000);
  });
});

describe("ficheCozyAPoser (relecture de l'écran)", () => {
  it("une annonce Cozy sans fiche lue est à relire ; lue, ou d'une autre source, non", async () => {
    const { aRelire, ficheCozyAPoser } = await import("../stay/relecture.ts");
    const cozy = annonce("abr-100293015", "Abritel", "112915552");
    assert.equal(ficheCozyAPoser(cozy), true);
    assert.equal(aRelire(cozy), true);
    const lue = { ...cozy, fiche: { equipements: [], avis: null, conditions: null, sourceFiche: "cozy" as const } };
    assert.equal(ficheCozyAPoser(lue), false);
    assert.equal(ficheCozyAPoser({ ...lue, fiche: { ...lue.fiche, indisponible: true } }), true);
    assert.equal(ficheCozyAPoser(annonce("gdf-1", "Gîtes de France", "1")), false);
  });
});

describe("la file, après relecture", () => {
  it("un refus ou une recherche expirée ne condamne pas la fiche : elle se redemande ensuite", async () => {
    noterRefsCozy([page("S1", [{ acc: 1, uid: "1-1" }])]);
    const refus = porteEssai(() => ({ statut: 429, json: null }));
    demanderFichesCozy([annonce("abr-1", "Abritel", "1")], { porte: refus.porte });
    await lectureCozyEnCours();
    noterRefsCozy([page("S2", [{ acc: 100293015, uid: FX.abritel.uid }, { acc: 1, uid: "1-1" }])]);
    const ok = porteEssai(reel);
    assert.equal(demanderFichesCozy([annonce("abr-1", "Abritel", "1")], { porte: ok.porte }), 1);
    await lectureCozyEnCours();
  });

  it("un refus sur la galerie garde les détails déjà lus", async () => {
    const { porte, gardees } = porteEssai((a) => (a.methode === "getPhotos" ? { statut: 429, json: null } : reel(a)));
    const issue = await lireFicheCozy(
      annonce("abr-100293015", "Abritel", "112915552"),
      { accommodationId: "100293015", uid: FX.abritel.uid, searchId: "S1", photos: 9 },
      porte,
    );
    assert.equal(issue, "refus");
    assert.equal(gardees.length, 1);
    assert.equal(gardees[0].fiche?.sourceFiche, "cozy");
  });

  it("la dernière recherche passe devant les précédentes ; la référence la plus récente sert", async () => {
    noterRefsCozy([page("ANCIENNE", [{ acc: 1, uid: "1-1" }, { acc: 2, uid: "2-1" }])]);
    noterRefsCozy([page("RECENTE", [{ acc: 3, uid: "3-1" }, { acc: 1, uid: "1-9" }])]);
    const ordre: string[] = [];
    let bloque: (() => void) | null = null;
    const debut = new Promise<void>((r) => (bloque = r));
    const { porte } = porteEssai((a) => {
      if (a.methode === "getDetails") ordre.push(`${a.corps.uid}@${a.corps.searchId}`);
      return { statut: 200, json: { name: "x", description: "Un logement.", amenities: [] } };
    });
    const lente: PorteCozy = { ...porte, api: async (m, c) => (ordre.length === 0 ? (await debut, porte.api(m, c)) : porte.api(m, c)) };
    demanderFichesCozy([annonce("abr-2", "Abritel", "2")], { porte: lente });
    demanderFichesCozy([annonce("abr-1", "Abritel", "1"), annonce("abr-3", "Abritel", "3")], { porte: lente });
    bloque!();
    await lectureCozyEnCours();
    await lectureCozyEnCours();
    // abr-2 était déjà partie ; ensuite la recherche récente, avant rien d'autre.
    assert.deepEqual(ordre, ["2-1@ANCIENNE", "1-9@RECENTE", "3-1@RECENTE"]);
  });

  it("une fiche gardée entre la demande et la lecture n'est pas relue", async () => {
    noterRefsCozy([page("S1", [{ acc: 1, uid: "1-1" }, { acc: 2, uid: "2-1" }])]);
    const deja = new Set<string>();
    const essai = porteEssai(reel, deja);
    const porte: PorteCozy = {
      ...essai.porte,
      api: async (m, c) => {
        deja.add("Abritel:2");
        return reel({ methode: m, corps: c });
      },
    };
    demanderFichesCozy([annonce("abr-1", "Abritel", "1"), annonce("abr-2", "Abritel", "2")], { porte });
    await lectureCozyEnCours();
    assert.equal(essai.appels.length, 0);
    assert.deepEqual(
      essai.gardees.map((g) => g.cle),
      ["Abritel:1"],
    );
  });
});
