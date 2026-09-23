import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attendreRecherche,
  cozyAnnonces,
  cozyListings,
  idsFiches,
  paginerFournisseur,
  rangPrix,
  type Horloge,
  type Tirage,
} from "./cozy.server.ts";
import type { LiveSearchInput } from "./types.ts";

/**
 * Le dépôt ne contient aucune charge CozyCozy enregistrée : les fiches
 * ci-dessous sont **construites à partir des clés que le collecteur lit**
 * (`highlightedResults`, `totalPrice`, `lightThumbnails.firstUrls`,
 * `subTitleDetails`, `accommodationId`), et d'elles seules. Aucun champ n'y est
 * inventé pour faire passer un test : ce qui n'est pas lu ailleurs dans le
 * fichier n'est pas écrit ici.
 *
 * Ce qui est éprouvé tient en une phrase : **le collecteur relève, il ne trie
 * pas**. Un prix « à partir de », un prix absent, une capacité absente ou plus
 * petite que la demande étaient quatre façons de faire disparaître une annonce
 * sans que personne ne puisse le savoir. Le filtre de l'écran
 * (`stay/lodgingFilter.ts`) sait désormais les nommer et les compter.
 */

const INPUT: LiveSearchInput = {
  stationId: "les-2-alpes",
  stationName: "Les 2 Alpes",
  lat: 45.0106,
  lon: 6.1226,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 8,
  bedrooms: 4,
};

type Hit = Record<string, unknown>;

function entree(name: string, hit: Hit, reste: Record<string, unknown> = {}) {
  return { name, highlightedResults: [hit], ...reste };
}

function booking(extra: Hit = {}): Hit {
  return {
    providerCode: "booking",
    providerName: "Booking.com",
    deeplinkUrl: "https://www.booking.com/hotel/fr/le-jandri.fr.html?label=xx",
    ...extra,
  };
}

function airbnb(extra: Hit = {}): Hit {
  return {
    providerCode: "airbnb",
    providerName: "Airbnb",
    externalId: "12345678",
    deeplinkUrl: "https://www.airbnb.fr/associates/click?dest=" + encodeURIComponent("https://www.airbnb.fr/rooms/12345678"),
    ...extra,
  };
}

function abritel(extra: Hit = {}): Hit {
  return {
    providerCode: "abritel",
    providerName: "Abritel",
    deeplinkUrl: "https://www.abritel.fr/location-vacances/p2115294?mpd=1",
    ...extra,
  };
}

function charge(...entries: unknown[]) {
  return [{ entries, processedResultCount: entries.length }];
}

describe("relevé CozyCozy", () => {
  it("garde un prix « à partir de », à zéro et drapeau levé", () => {
    const rows = cozyListings(
      charge(
        entree("Chalet des Vans", booking({ totalPrice: { value: 2400, indicative: true } })),
      ),
      INPUT,
      "Booking",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].total, 0, "un « à partir de » n'est pas un total de séjour");
    assert.equal(rows[0].priceIndicative, true);
  });

  it("garde une annonce que la source n'a pas tarifée", () => {
    const rows = cozyListings(charge(entree("Le Jandri 2S05", booking())), INPUT, "Booking");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].total, 0);
    assert.equal(rows[0].priceIndicative, null, "rien n'a été annoncé, rien n'est affirmé");
  });

  it("garde une annonce sans capacité annoncée, et une trop petite", () => {
    const rows = cozyListings(
      charge(
        entree("Résidence sans détail", booking({ totalPrice: { value: 1800 } })),
        entree(
          "Studio 4 personnes",
          booking({
            deeplinkUrl: "https://www.booking.com/hotel/fr/studio-quatre.fr.html",
            totalPrice: { value: 900 },
          }),
        ),
      ),
      INPUT,
      "Booking",
    );
    assert.deepEqual(
      Object.fromEntries(rows.map((r) => [r.title, r.guests])),
      { "Résidence sans détail": null, "Studio 4 personnes": 4 },
      "le collecteur relève la capacité publiée, il n'écarte personne avec",
    );
  });

  it("lit la devise publiée, et garde EUR par défaut", () => {
    const [suisse] = cozyListings(
      charge(entree("Chalet Verbier", abritel({ totalPrice: { value: 3100, currency: "CHF" } }))),
      INPUT,
      "Abritel",
    );
    assert.equal(suisse.currency, "CHF");
    const [defaut] = cozyListings(
      charge(entree("Chalet Venosc", abritel({ totalPrice: { value: 3100 } }))),
      INPUT,
      "Abritel",
    );
    assert.equal(defaut.currency, "EUR");
  });

  it("rend toutes les vignettes publiées, la première en tête", () => {
    const [row] = cozyListings(
      charge(
        entree("Duplex des Alpes", abritel({ totalPrice: { value: 2334 } }), {
          lightThumbnails: {
            firstUrls: ["https://q.bstatic.com/1.jpg", "https://q.bstatic.com/2.jpg", 42],
          },
        }),
      ),
      INPUT,
      "Abritel",
    );
    assert.deepEqual(row.photos, ["https://q.bstatic.com/1.jpg", "https://q.bstatic.com/2.jpg"]);
    assert.equal(row.photo, "https://q.bstatic.com/1.jpg");
  });

  it("garde l'identifiant du bien chez la plateforme, à côté de celui de Cozy", () => {
    const [row] = cozyListings(
      charge(
        entree("Duplex des Alpes", abritel({ externalId: "p2115294", totalPrice: { value: 2334 } }), {
          accommodationId: 776_655,
        }),
      ),
      INPUT,
      "Abritel",
    );
    assert.equal(row.id, "abr-776655", "l'identifiant Cozy dédoublonne, il ne bouge pas");
    assert.equal(row.platformId, "p2115294");
  });

  it("lit les salles de bain et les pièces, sans convertir les pièces en chambres", () => {
    const [row] = cozyListings(
      charge(
        entree("Appartement 3 pièces", abritel({ totalPrice: { value: 2334 } }), {
          subTitleDetails: { bathRoomCount: 2 },
        }),
      ),
      INPUT,
      "Abritel",
    );
    assert.equal(row.baths, 2);
    assert.equal(row.rooms, 3);
    assert.equal(row.bedrooms, null, "« 3 pièces » n'est pas « 2 chambres » sur la fiche");
  });

  it("écarte toujours ce que la source met hors périmètre, et les doublons", () => {
    const rows = cozyListings(
      charge(
        entree("Hôtel des Deux Alpes", booking({ totalPrice: { value: 3901 } })),
        entree("Le Jandri 2S05", booking({ totalPrice: { value: 2479 } }), { accommodationId: 1 }),
        entree("Le Jandri 2S05", booking({ totalPrice: { value: 2479 } }), { accommodationId: 1 }),
      ),
      INPUT,
      "Booking",
    );
    assert.deepEqual(
      rows.map((r) => r.title),
      ["Le Jandri 2S05"],
    );
  });

  it("range les annonces sans prix après les prix, jamais devant", () => {
    const rows = cozyListings(
      charge(
        entree("Sans prix", booking(), { accommodationId: 1 }),
        entree("Deux mille", booking({ totalPrice: { value: 2000 } }), { accommodationId: 2 }),
      ),
      INPUT,
      "Booking",
    );
    assert.deepEqual(
      rows.map((r) => r.title),
      ["Deux mille", "Sans prix"],
      "un zéro dit « prix non publié », il ne vaut pas zéro euro",
    );
    assert.equal(rangPrix({ total: 0 }), Number.MAX_SAFE_INTEGER);
  });

  it("lit Airbnb comme Booking : lien rooms/, pas la page d'accueil affiliée", () => {
    const rows = cozyListings(
      charge(
        entree("Chalet Edelweiss", airbnb({ totalPrice: { value: 2140 } }), {
          accommodationId: 9,
          coordinates: { latitude: 45.01, longitude: 6.12 },
        }),
      ),
      INPUT,
      "Airbnb",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "Airbnb");
    assert.equal(rows[0].total, 2140);
    assert.equal(rows[0].platformId, "12345678");
    assert.equal(
      rows[0].url,
      "https://www.airbnb.fr/rooms/12345678?check_in=2027-02-06&check_out=2027-02-13&adults=8",
    );
    assert.equal(rows[0].lat, 45.01);
    assert.match(rows[0].proven ?? "", /CozyCozy Airbnb/);
  });

  it("écarte un hôtel Airbnb, et une tuile sans fiche rooms/", () => {
    const rows = cozyListings(
      charge(
        entree("Hôtel des Deux Alpes", airbnb({ totalPrice: { value: 3901 }, externalId: "1" })),
        entree("Sans fiche", airbnb({ deeplinkUrl: "https://www.airbnb.fr/s/Les-2-Alpes/homes", externalId: "abc" })),
        entree("Le Vans", airbnb({ totalPrice: { value: 1800 } }), { accommodationId: 3 }),
      ),
      INPUT,
      "Airbnb",
    );
    assert.deepEqual(
      rows.map((r) => r.title),
      ["Le Vans"],
    );
  });

  it("relève la charge Airbnb telle que CozyCozy la publie : prix, chambres, pers., GPS, photos, lieu", () => {
    const rows = cozyListings(
      charge(
        {
          type: "result",
          accommodationId: 45881004,
          title: "châlet",
          name: "Chalet Aux 2 Alpes - Skis Aux Pieds",
          subTitle: "4 chambres • 10 personnes",
          subTitleDetails: { bedRoomCount: 4, bedCount: 11, guestCapacity: 10 },
          locationText: "Les Deux Alpes",
          cityName: "Les Deux Alpes",
          coordinates: { latitude: 45.02220153808594, longitude: 6.125500202178955 },
          lightThumbnails: {
            firstUrls: [
              "https://a0.muscache.com/im/pictures/a.jpg?im_w=720",
              "https://a0.muscache.com/im/pictures/b.jpg?im_w=720",
            ],
            lastUrl: "https://a0.muscache.com/im/pictures/c.jpg?im_w=720",
            count: 14,
          },
          highlightedResults: [
            {
              providerCode: "airbnb",
              providerName: "Airbnb",
              externalId: "22782241",
              deeplinkUrl:
                "https://www.airbnb.fr/rooms/22782241?check_in=2026-12-05&check_out=2026-12-12&adults=8",
              totalPrice: { value: 1903, currencyCode: "EUR", indicative: false },
              eurPriceValue: 1903,
              bedRoomCount: 4,
              text: "Hébergement entier",
            },
          ],
        },
      ),
      INPUT,
      "Airbnb",
    );
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.total, 1903);
    assert.equal(row.currency, "EUR");
    assert.equal(row.guests, 10);
    assert.equal(row.bedrooms, 4);
    assert.equal(row.beds, 11);
    assert.equal(row.propertyType, "châlet");
    assert.equal(row.locality, "Les Deux Alpes");
    assert.equal(row.placeName, "Les Deux Alpes");
    assert.ok(Math.abs((row.lat ?? 0) - 45.0222) < 0.001);
    assert.ok(Math.abs((row.lon ?? 0) - 6.1255) < 0.001);
    assert.equal(row.photos?.length, 3);
    assert.equal(row.photo, "https://a0.muscache.com/im/pictures/a.jpg?im_w=720");
    assert.equal(row.platformId, "22782241");
    assert.match(row.url ?? "", /airbnb\.fr\/rooms\/22782241/);
  });
});

/**
 * La pagination, sans réseau ni vraies pauses.
 *
 * Les entrées reprennent la forme des charges relevées le 23 septembre 2026
 * (1 504 `result`, 187 `sponsoredResult` sans `accommodationId`, un
 * `resultStrip` à `groups`) ; les nombres sont réduits pour le test.
 */
function horlogeFactice(): Horloge & { t: number } {
  const h = {
    t: 0,
    maintenant: () => h.t,
    attendre: async (ms: number) => {
      h.t += ms;
    },
  };
  return h;
}

/**
 * Une source Cozy simulée : `n` fiches, une publicité toutes les `pub`
 * entrées, un bandeau en tête dont un groupe n'existe pas au premier niveau.
 * La recherche n'est complète qu'à partir de `completeA` ms ; avant, le
 * compteur publié est `avant`.
 */
function sourceFactice(opts: { n: number; pub?: number; completeA?: number; avant?: number; horloge: { t: number } }) {
  const entries: unknown[] = [
    { type: "resultStrip", code: "HOSTELROOM", groups: [{ accommodationId: "strip-1" }] },
  ];
  for (let i = 0; i < opts.n; i += 1) {
    if (opts.pub && i > 0 && i % opts.pub === 0) entries.push({ type: "sponsoredResult" });
    entries.push({ type: "result", accommodationId: `f${i}` });
  }
  const demandes: [number, number][] = [];
  const tirer: Tirage = async (offset, count) => {
    demandes.push([offset, count]);
    const complete = opts.horloge.t >= (opts.completeA ?? 0);
    return {
      entries: entries.slice(offset, offset + count),
      allProcessed: complete,
      filteredCount: complete ? opts.n + 1 : (opts.avant ?? 0),
    };
  };
  return { tirer, demandes };
}

describe("pagination CozyCozy", () => {
  it("compte les fiches et les groupes des bandeaux, jamais les publicités", () => {
    assert.deepEqual(
      idsFiches([
        { type: "result", accommodationId: 12 },
        { type: "sponsoredResult" },
        { type: "resultStrip", groups: [{ accommodationId: "g1" }, { accommodationId: "g2" }] },
      ]),
      ["12", "g1", "g2"],
    );
  });

  it("va au-delà de 400 fiches, jusqu'au compteur publié", async () => {
    const h = horlogeFactice();
    const src = sourceFactice({ n: 1504, pub: 8, horloge: h });
    const res = await paginerFournisseur(src.tirer, Number.MAX_SAFE_INTEGER, h);
    assert.equal(res.releves, 1505, "1 504 fiches et le groupe exclusif du bandeau");
    assert.equal(res.annonces, 1505);
    assert.equal(res.arret, "compteur atteint");
    assert.ok(src.demandes.every(([, c]) => c === 200), "des pages de 200");
    // Le rang suivant avance des entrées reçues, publicités comprises.
    assert.deepEqual(
      src.demandes.slice(0, 3).map(([o]) => o),
      [0, 200, 400],
    );
  });

  it("n'arrête pas sur un compteur tant que la recherche n'est pas complète", async () => {
    const h = horlogeFactice();
    // Compteur à 0 (comme Airbnb avant 4 s) : s'y fier couperait après une page.
    const src = sourceFactice({ n: 450, completeA: 10_000, avant: 0, horloge: h });
    const res = await paginerFournisseur(src.tirer, Number.MAX_SAFE_INTEGER, h);
    assert.equal(res.releves, 451);
    assert.equal(res.arret, "page incomplète");
  });

  it("attend la fin de la recherche, puis la reconnaît", async () => {
    const h = horlogeFactice();
    const src = sourceFactice({ n: 40, completeA: 5_000, horloge: h });
    assert.equal(await attendreRecherche(src.tirer, Number.MAX_SAFE_INTEGER, h), true);
    assert.ok(h.t >= 5_000 && h.t < 5_700, "au rythme de la politesse, sans attendre plus");
    assert.ok(src.demandes.every(([o, c]) => o === 0 && c <= 10), "par une petite page");
  });

  it("n'attend pas au-delà de dix secondes une recherche qui ne finit pas", async () => {
    const h = horlogeFactice();
    const src = sourceFactice({ n: 40, completeA: Number.MAX_SAFE_INTEGER, horloge: h });
    assert.equal(await attendreRecherche(src.tirer, Number.MAX_SAFE_INTEGER, h), false);
    assert.ok(h.t <= 10_300);
  });

  it("compte une fiche vue sur deux pages une seule fois, et s'arrête si une page n'apporte rien", async () => {
    const h = horlogeFactice();
    const page = { entries: Array.from({ length: 200 }, (_, i) => ({ accommodationId: `x${i}` })), allProcessed: true, filteredCount: 900 };
    const tirer: Tirage = async () => page;
    const res = await paginerFournisseur(tirer, Number.MAX_SAFE_INTEGER, h);
    assert.equal(res.releves, 200);
    assert.equal(res.pages.length, 2);
    assert.equal(res.arret, "page sans fiche nouvelle");
  });

  it("s'arrête sur une page vide", async () => {
    const h = horlogeFactice();
    const res = await paginerFournisseur(async () => ({ entries: [], allProcessed: true, filteredCount: 0 }), Number.MAX_SAFE_INTEGER, h);
    assert.equal(res.pages.length, 0);
    assert.equal(res.arret, "page vide");
  });

  it("rend ce qui est lu quand l'échéance tombe", async () => {
    const h = horlogeFactice();
    const src = sourceFactice({ n: 1504, horloge: h });
    const res = await paginerFournisseur(src.tirer, 700, h);
    assert.equal(res.arret, "échéance");
    assert.ok(res.pages.length >= 1 && res.pages.length < 8);
  });

  it("rapporte le compteur du fournisseur demandé, jamais un zéro inventé", () => {
    const payloads = [
      { fournisseur: "abritel", filteredCount: 1200, allProcessed: true },
      { fournisseur: "abritel", filteredCount: 1504, allProcessed: true },
      { fournisseur: "booking", filteredCount: 423, allProcessed: true },
      { fournisseur: "airbnb", allProcessed: true },
    ];
    assert.equal(cozyAnnonces(payloads, "abritel"), 1504);
    assert.equal(cozyAnnonces(payloads, "booking"), 423);
    assert.equal(cozyAnnonces(payloads, "airbnb"), null);
    assert.equal(cozyAnnonces([], "airbnb"), null);
  });

  it("ne rapporte pas un compteur lu avant la fin de la recherche", () => {
    assert.equal(cozyAnnonces([{ fournisseur: "airbnb", filteredCount: 0, allProcessed: false }], "airbnb"), null);
  });

  it("rapporte le zéro que publie une recherche complète sans rien pour ce fournisseur", async () => {
    const h = horlogeFactice();
    const res = await paginerFournisseur(
      async () => ({ entries: [], allProcessed: true, filteredCount: 0 }),
      Number.MAX_SAFE_INTEGER,
      h,
    );
    assert.equal(res.annonces, 0);
    assert.equal(res.arret, "page vide");
  });
});
