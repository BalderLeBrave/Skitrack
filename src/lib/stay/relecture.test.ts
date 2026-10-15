/**
 * La relecture des fiches de l'écran Logements (`relecture.ts`), hors ligne :
 * l'écran, le serveur et la minuterie sont simulés, l'heure aussi.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { equipements } from "./equipements.ts";
import {
  aCombler,
  aRelire,
  aRelireEnFile,
  boucleRelecture,
  contenuAPoser,
  RELECTURE_MAX_MS,
  RELECTURE_MS,
  RELECTURE_SANS_PROGRES_MS,
  RELECTURES_DUREE_MS,
  RELECTURES_PLAFOND_MS,
  type PorteRelecture,
} from "./relecture.ts";

function annonce(extra: Partial<Listing> = {}): Listing {
  return {
    id: "x",
    stationId: "val-thorens",
    title: "Chalet",
    source: "Cimalpes",
    total: 9000,
    currency: "EUR",
    capacity: 12,
    bedrooms: 6,
    available: true,
    photo: null,
    url: "https://cimalpes.com/fr/location-val-thorens/chalet-x/?date_debut=06/02/2027",
    lat: null,
    lon: null,
    proven: "test",
    ...extra,
  };
}

const FICHE = { equipements: [], avis: null, conditions: null, sourceFiche: "airbnb" as const };

function airbnb(n: number, extra: Partial<Listing> = {}): Listing {
  return annonce({
    id: `abnb-${n}`,
    source: "Airbnb",
    url: `https://www.airbnb.fr/rooms/${n}`,
    capacity: 4,
    bedrooms: 1,
    lat: 45.29,
    lon: 6.58,
    ...extra,
  });
}

describe("ce que l'écran relit", () => {
  it("une annonce Airbnb complète sans fiche enrichie : pas trouée, mais à relire", () => {
    const sans = airbnb(10_673_653);
    assert.deepEqual([aCombler(sans), aRelire(sans)], [false, true]);
    assert.equal(aRelire(airbnb(10_673_653, { fiche: FICHE })), false);
    assert.deepEqual(
      [
        aCombler(airbnb(1_067_365, { bedrooms: null })),
        aRelire(airbnb(1_067_365, { bedrooms: null, fiche: FICHE })),
      ],
      [true, true],
    );
  });

  it("Cimalpes : capacité et chambres publiées, sans point ni contenu, à relire jusqu'à ce que son contenu soit posé", () => {
    const carte = annonce();
    // Elle ne manque que du point : rien à combler, avant comme après.
    assert.equal(aCombler(carte), false);
    assert.deepEqual([contenuAPoser(carte), aRelire(carte)], [true, true]);
    // La boucle d'avant ne la relisait pas : elle ne garde pas la file ouverte.
    assert.equal(aRelireEnFile(carte), false);
    assert.equal(aRelire(annonce({ amenities: equipements({ wifi: "oui" }) })), false);
    assert.equal(aRelire(annonce({ description: "Chalet de prestige." })), false);
    // Son point posé, le serveur n'ouvre plus sa page (`raisonDeLaisser`) : rien n'arrivera plus.
    assert.equal(aRelire(annonce({ lat: 45.29, lon: 6.58 })), false);
  });

  it("Abritel aussi ; pas un hôte sans lecteur de contenu, ni Booking, ni Gîtes de France", () => {
    const abritel = annonce({
      source: "Abritel",
      url: "https://www.abritel.fr/location-vacances/p5392632vb",
    });
    assert.equal(contenuAPoser(abritel), true);
    assert.equal(
      contenuAPoser(annonce({ source: "Centrale", url: "https://resa.exemple.fr/fiche/1" })),
      false,
    );
    assert.equal(
      contenuAPoser(
        annonce({ source: "Booking", url: "https://www.booking.com/hotel/fr/les-tilleuls.html" }),
      ),
      false,
    );
    assert.equal(
      contenuAPoser(annonce({ source: "Gîtes de France", url: "https://widget.itea.fr/x" })),
      false,
    );
    assert.equal(contenuAPoser(annonce({ url: null })), false);
  });
});

/* ---------- La boucle, sur un écran simulé ---------- */

type Appel = { t: number; ids: string[]; poseSeule: boolean; finir: (ok?: boolean) => void };

/**
 * Un écran qui tient `rows`, un serveur qui répond par `servir` (les annonces
 * relues, comblées ou non), une minuterie et une heure à soi. `auto` : le
 * serveur répond tout de suite ; sinon, l'essai répond (`finir`).
 */
function ecran(
  rows: Listing[],
  servir: (rows: Listing[], t: number) => Listing[] = (r) => r,
  auto = true,
) {
  const etat = { rows, t: 0 };
  const minuteries: Array<{ a: number; f: () => void; annulee: boolean }> = [];
  const appels: Appel[] = [];
  let enVol = 0;
  let enVolMax = 0;
  const porte: PorteRelecture = {
    annonces: () => etat.rows,
    relire: (listings, { poseSeule }) =>
      new Promise<void>((ok, ko) => {
        enVol += 1;
        enVolMax = Math.max(enVolMax, enVol);
        const finir = (reussi = true) => {
          enVol -= 1;
          if (!reussi) return ko(new Error("réseau"));
          const parId = new Map(servir(listings, etat.t).map((l) => [l.id, l]));
          etat.rows = etat.rows.map((l) => parId.get(l.id) ?? l);
          ok();
        };
        appels.push({ t: etat.t, ids: listings.map((l) => l.id), poseSeule, finir });
        if (auto) finir();
      }),
    attendre: (f, ms) => {
      const m = { a: etat.t + ms, f, annulee: false };
      minuteries.push(m);
      return () => {
        m.annulee = true;
      };
    },
    maintenant: () => etat.t,
  };
  /** Fait passer `ms`, minuterie par minuterie, réponses comprises. */
  const avancer = async (ms: number) => {
    const fin = etat.t + ms;
    for (;;) {
      await new Promise((r) => setImmediate(r));
      const prochaine = minuteries
        .filter((m) => !m.annulee && m.a <= fin)
        .sort((a, b) => a.a - b.a)[0];
      if (!prochaine) break;
      prochaine.annulee = true;
      etat.t = prochaine.a;
      prochaine.f();
    }
    etat.t = fin;
    await new Promise((r) => setImmediate(r));
  };
  const boucle = boucleRelecture(porte);
  return { etat, appels, boucle, avancer, enVolMax: () => enVolMax };
}

/** Pose la fiche enrichie de chaque annonce relue : la mémoire l'avait. */
const avecFiche = (rows: Listing[]) => rows.map((l) => ({ ...l, fiche: FICHE }));

describe("la boucle de relecture", () => {
  it("la réponse Airbnb la lance, comme avant ; ce qu'elle relit se pose, et elle s'arrête", async () => {
    const e = ecran([airbnb(10_000_001), airbnb(10_000_002, { fiche: FICHE })], avecFiche);
    e.boucle.releveAirbnb(e.etat.rows);
    await e.avancer(RELECTURE_MS - 1);
    assert.equal(e.appels.length, 0);
    await e.avancer(1);
    assert.deepEqual(
      e.appels.map((a) => [a.t, a.ids, a.poseSeule]),
      [[RELECTURE_MS, ["abnb-10000001"], false]],
    );
    assert.equal(e.etat.rows[0].fiche, FICHE);
    await e.avancer(RELECTURES_PLAFOND_MS);
    assert.equal(e.appels.length, 1, "plus rien à relire : la boucle s'arrête");
  });

  it("lancée par une autre part, en pose seule ; la réponse Airbnb lui rend la file", async () => {
    const e = ecran([annonce({ id: "cimalpes-1" })]);
    e.boucle.relancer();
    await e.avancer(RELECTURE_MS);
    assert.deepEqual(
      e.appels.map((a) => a.poseSeule),
      [true],
    );
    e.etat.rows = [...e.etat.rows, airbnb(10_000_003)];
    e.boucle.releveAirbnb([airbnb(10_000_003)]);
    await e.avancer(RELECTURE_MAX_MS);
    assert.deepEqual(
      e.appels.slice(0, 2).map((a) => a.poseSeule),
      [true, false],
    );
    assert.equal(e.enVolMax(), 1);
  });

  it("une seule boucle : une suite de pages arrivée pendant la réponse n'en lance pas une seconde", async () => {
    const e = ecran([airbnb(10_000_004)], (r) => r, false);
    e.boucle.releveAirbnb(e.etat.rows);
    await e.avancer(RELECTURE_MS);
    assert.equal(e.appels.length, 1);
    // La réponse se fait attendre ; la suite ajoute des annonces, deux fois.
    e.etat.rows = [...e.etat.rows, airbnb(10_000_005)];
    e.boucle.relancer();
    await e.avancer(RELECTURE_MS);
    e.boucle.relancer();
    await e.avancer(RELECTURE_MS);
    assert.equal(e.appels.length, 1);
    e.appels[0].finir();
    await e.avancer(RELECTURE_MAX_MS);
    assert.equal(e.appels.length, 2);
    assert.equal(e.enVolMax(), 1);
    assert.deepEqual(e.appels[1].ids, ["abnb-10000004", "abnb-10000005"]);
  });

  it("arrêtée faute d'annonce à relire, elle reprend quand la suite en ajoute, en pose seule", async () => {
    const e = ecran([airbnb(10_000_006, { fiche: FICHE })], avecFiche);
    // Revisite : toutes les annonces de la première réponse ont leur fiche.
    e.boucle.releveAirbnb(e.etat.rows);
    await e.avancer(10 * 60_000);
    assert.equal(e.appels.length, 0);
    e.etat.rows = [...e.etat.rows, airbnb(10_000_007)];
    e.boucle.relancer();
    await e.avancer(RELECTURE_MS);
    assert.deepEqual(
      e.appels.map((a) => [a.ids, a.poseSeule]),
      [[["abnb-10000007"], true]],
    );
    assert.equal(e.etat.rows[1].fiche, FICHE);
  });

  it("ne vivant plus que d'un contenu à poser, elle passe en pose seule : une annonce trouée arrivée ensuite ne part pas en file", async () => {
    // Une Cimalpes dont la page reste en 404 : son contenu n'arrive jamais.
    const cimalpes = annonce({ id: "cim-404" });
    const e = ecran([airbnb(10_000_011), cimalpes], (r) =>
      r.map((l) => (l.source === "Airbnb" && l.bedrooms != null ? { ...l, fiche: FICHE } : l)),
    );
    e.boucle.releveAirbnb([airbnb(10_000_011)]);
    await e.avancer(RELECTURE_MS);
    assert.deepEqual(
      e.appels.map((a) => [a.ids, a.poseSeule]),
      [[["abnb-10000011", "cim-404"], false]],
    );
    // Plus rien de ce que relisait la boucle d'avant, qui s'arrêtait là.
    assert.deepEqual(e.etat.rows.filter(aRelireEnFile), []);
    // 5 min plus tard, la suite de pages ajoute une annonce Airbnb sans chambres.
    await e.avancer(5 * 60_000 - RELECTURE_MS);
    e.etat.rows = [...e.etat.rows, airbnb(10_000_012, { bedrooms: null })];
    e.boucle.relancer();
    await e.avancer(10 * 60_000);
    const suivants = e.appels.slice(1);
    assert.ok(suivants.length > 0, "le contenu Cimalpes se relit encore");
    assert.ok(
      suivants.every((a) => a.poseSeule),
      suivants.map((a) => `${a.t / 1000} s ${a.poseSeule}`).join(", "),
    );
    assert.ok(
      suivants.some((a) => a.ids.includes("abnb-10000012")),
      "relue, en pose seule",
    );
    assert.ok(suivants.every((a) => a.t < RELECTURES_DUREE_MS));
  });

  it("sans progrès : 15 s, puis le double à chaque fois, deux minutes au plus ; fin à 45 min", async () => {
    const e = ecran([airbnb(10_000_008)]);
    e.boucle.releveAirbnb(e.etat.rows);
    await e.avancer(RELECTURES_PLAFOND_MS);
    const ecarts = e.appels.slice(1).map((a, i) => a.t - e.appels[i].t);
    assert.deepEqual(ecarts.slice(0, 5), [30_000, 60_000, 120_000, 120_000, 120_000]);
    // La dernière, planifiée avant 45 min, part au plus un intervalle après.
    assert.ok(e.appels.at(-1)!.t < RELECTURES_DUREE_MS + RELECTURE_MAX_MS);
    assert.ok(e.appels.at(-2)!.t < RELECTURES_DUREE_MS);
    assert.ok(e.appels.filter((a) => a.t < RELECTURES_DUREE_MS).every((a) => !a.poseSeule));
    // Une erreur du serveur double aussi l'intervalle, et la boucle continue.
    const ko = ecran([airbnb(10_000_009)], (r) => r, false);
    ko.boucle.releveAirbnb(ko.etat.rows);
    await ko.avancer(RELECTURE_MS);
    ko.appels[0].finir(false);
    await ko.avancer(2 * RELECTURE_MS);
    assert.deepEqual(
      ko.appels.map((a) => a.t),
      [RELECTURE_MS, 3 * RELECTURE_MS],
    );
  });

  it("les fiches lentes : chaque relecture qui comble repousse la fin, en pose seule passé 45 min, jamais au-delà de 2 h", async () => {
    // 400 annonces sans fiche ; la mémoire en reçoit une de plus à chaque relecture.
    const rows = Array.from({ length: 400 }, (_, i) => airbnb(20_000_000 + i));
    let lues = 0;
    const e = ecran(rows, (r) => {
      lues += 1;
      return r.slice(0, 1).map((l) => ({ ...l, fiche: FICHE }));
    });
    e.boucle.releveAirbnb(e.etat.rows);
    await e.avancer(3 * 60 * 60_000);
    const apres = e.appels.filter((a) => a.t >= RELECTURES_DUREE_MS);
    assert.ok(apres.length > 0, "la relecture continue après 45 min");
    assert.ok(
      apres.every((a) => a.poseSeule),
      "en pose seule",
    );
    assert.ok(e.appels.filter((a) => a.t < RELECTURES_DUREE_MS).every((a) => !a.poseSeule));
    assert.ok(e.appels.at(-1)!.t < RELECTURES_PLAFOND_MS + RELECTURE_MS, "jamais au-delà de 2 h");
    assert.equal(lues, e.appels.length);
  });

  it("plus rien ne se comble : la fin reste à 15 min du dernier progrès", async () => {
    // La mémoire reçoit des fiches pendant 40 min, puis plus rien.
    const rows = Array.from({ length: 400 }, (_, i) => airbnb(30_000_000 + i));
    const progres = 40 * 60_000;
    const e = ecran(rows, (r, t) =>
      t < progres ? r.slice(0, 1).map((l) => ({ ...l, fiche: FICHE })) : r,
    );
    e.boucle.releveAirbnb(e.etat.rows);
    await e.avancer(3 * 60 * 60_000);
    const derniere = e.appels.at(-1)!.t;
    assert.ok(derniere > RELECTURES_DUREE_MS, "repoussée au-delà de 45 min");
    assert.ok(
      derniere <= progres + RELECTURE_SANS_PROGRES_MS + RELECTURE_MAX_MS,
      `${derniere / 60_000} min`,
    );
  });

  it("arrêtée par l'écran, plus rien ne part, même la réponse arrivée", async () => {
    const e = ecran([airbnb(10_000_010)], (r) => r, false);
    e.boucle.releveAirbnb(e.etat.rows);
    await e.avancer(RELECTURE_MS);
    e.boucle.arreter();
    e.appels[0].finir();
    e.boucle.relancer();
    await e.avancer(RELECTURES_PLAFOND_MS);
    assert.equal(e.appels.length, 1);
  });
});
