import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AVAILABILITY_TTL_MS, MANUAL_SOURCE, availabilityLabel, availabilityOf, isBookable, isDoorway, type AvailabilitySubject, type Stay } from "./availability.ts";
import {
  applyFilter,
  clampRayonKm,
  droppedLabel,
  dropReasonFor,
  fitsParty,
  geoReasonFor,
  isDroppedGitesOffer,
  isStudioListing,
  minRoomsFor,
  normalizedBedrooms,
  partyVerdict,
  RAYON_DEFAUT_KM,
  RAYON_MAX_KM,
  RAYON_MIN_KM,
  type FilterSubject,
} from "./lodgingFilter.ts";
import { attachAccess } from "../access.ts";
import { stationById } from "../stations.ts";
import type { Listing } from "../listings.ts";

const STAY: Stay = { checkIn: "2027-02-06", checkOut: "2027-02-13" };
const NOW = Date.parse("2027-01-10T12:00:00Z");

function annonce(over: Partial<AvailabilitySubject> = {}): AvailabilitySubject {
  return {
    url: "https://www.airbnb.fr/rooms/123",
    total: 2231,
    source: "Airbnb",
    ...over,
  };
}

function bien(over: Partial<FilterSubject> = {}): FilterSubject {
  return {
    id: "x",
    title: "Appartement",
    source: "Airbnb",
    url: "https://www.airbnb.fr/rooms/123",
    total: 2231,
    guests: 8,
    bedrooms: 3,
    ...over,
  };
}

describe("disponibilité : un prix daté est la seule preuve", () => {
  it("prix relevé pour exactement ces dates : confirmé", () => {
    const v = availabilityOf(
      annonce({ pricedCheckIn: STAY.checkIn, pricedCheckOut: STAY.checkOut, scannedAt: NOW }),
      STAY,
      NOW,
    );
    assert.deepEqual(v, { status: "confirmed", reason: null });
    assert.ok(
      isBookable(
        annonce({ pricedCheckIn: STAY.checkIn, pricedCheckOut: STAY.checkOut, scannedAt: NOW }),
        STAY,
        NOW,
      ),
    );
  });

  it("un prix aux bonnes dates sans instant de mesure n'est pas confirmé", () => {
    // C'est exactement ce que `searchStay.dater` pose sur le repli vers le
    // relevé figé : les dates, oui ; l'heure, non, pour ne pas le rajeunir.
    // Le sauter revenait à confirmer sans âge, et sans péremption possible.
    const sansHeure = annonce({
      pricedCheckIn: STAY.checkIn,
      pricedCheckOut: STAY.checkOut,
      scannedAt: null,
    });
    assert.deepEqual(availabilityOf(sansHeure, STAY, NOW), {
      status: "unconfirmed",
      reason: "undated",
    });
    assert.ok(!isBookable(sansHeure, STAY, NOW));
    assert.equal(
      availabilityLabel(availabilityOf(sansHeure, STAY, NOW)),
      "Prix de relevé, date de mesure inconnue",
    );
  });

  it("listée sans prix : non confirmée, et le motif le dit", () => {
    // C'est la forme sous laquelle Airbnb annonce qu'il ne peut pas vendre.
    assert.deepEqual(availabilityOf(annonce({ total: 0 }), STAY, NOW), {
      status: "unconfirmed",
      reason: "unpriced",
    });
    assert.deepEqual(availabilityOf(annonce({ total: null }), STAY, NOW), {
      status: "unconfirmed",
      reason: "unpriced",
    });
  });

  it("tarifée pour d'autres dates : non confirmée", () => {
    const v = availabilityOf(
      annonce({ pricedCheckIn: "2027-01-09", pricedCheckOut: "2027-01-16" }),
      STAY,
      NOW,
    );
    assert.deepEqual(v, { status: "unconfirmed", reason: "other_dates" });
  });

  it("relevé périmé au-delà de six heures : non confirmé", () => {
    const vieux = NOW - AVAILABILITY_TTL_MS - 1;
    const v = availabilityOf(
      annonce({ pricedCheckIn: STAY.checkIn, pricedCheckOut: STAY.checkOut, scannedAt: vieux }),
      STAY,
      NOW,
    );
    assert.equal(v.status, "unconfirmed");
    assert.equal(v.reason, "stale");
    // Cinq heures : toujours bon.
    const frais = NOW - 5 * 60 * 60 * 1000;
    assert.equal(
      availabilityOf(
        annonce({ pricedCheckIn: STAY.checkIn, pricedCheckOut: STAY.checkOut, scannedAt: frais }),
        STAY,
        NOW,
      ).status,
      "confirmed",
    );
  });

  it("absente du dernier relevé : « gone », et ce motif passe avant le prix", () => {
    // Un tarif relevé la semaine dernière ne prouve rien contre une absence
    // constatée aujourd'hui, aux mêmes dates.
    const v = availabilityOf(
      annonce({
        pricedCheckIn: STAY.checkIn,
        pricedCheckOut: STAY.checkOut,
        scannedAt: NOW,
        missingSince: { checkIn: STAY.checkIn, checkOut: STAY.checkOut },
      }),
      STAY,
      NOW,
    );
    assert.deepEqual(v, { status: "gone", reason: "gone" });
    // Une absence constatée pour d'autres dates ne dit rien de ce séjour-ci.
    assert.equal(
      availabilityOf(
        annonce({
          pricedCheckIn: STAY.checkIn,
          pricedCheckOut: STAY.checkOut,
          scannedAt: NOW,
          missingSince: { checkIn: "2027-03-06", checkOut: "2027-03-13" },
        }),
        STAY,
        NOW,
      ).status,
      "confirmed",
    );
  });

  it("porte d'entrée : jamais jugée", () => {
    assert.ok(isDoorway({ url: null }));
    assert.ok(isDoorway({ url: "https://www.airbnb.fr/s/Les-2-Alpes/homes?adults=8" }));
    assert.ok(!isDoorway({ url: "https://www.airbnb.fr/rooms/123" }));
    assert.deepEqual(availabilityOf(annonce({ url: null, total: 0 }), STAY, NOW), {
      status: "unrated",
      reason: null,
    });
    assert.ok(isBookable(annonce({ url: null }), STAY, NOW));
  });

  it("saisie manuelle : jamais jugée non plus", () => {
    // Masquer sa propre saisie sous un filtre qu'il n'a pas relié à elle est le
    // défaut que cette exception existe pour éviter.
    const v = availabilityOf(annonce({ source: MANUAL_SOURCE, total: 0 }), STAY, NOW);
    assert.deepEqual(v, { status: "unrated", reason: null });
  });

  it("le relevé figé, sans champ de date, ressort non confirmé", () => {
    // Aucun défaut optimiste : `listings.ts` ne renseigne pas ces champs.
    assert.deepEqual(availabilityOf(annonce(), STAY, NOW), {
      status: "unconfirmed",
      reason: "other_dates",
    });
  });
});

describe("filtre : « non annoncé » n'est pas « ne convient pas »", () => {
  it("la convention des pièces traduit la demande, pas la donnée", () => {
    // Demander 4 chambres, c'est demander au moins un 5 pièces.
    assert.equal(minRoomsFor(4), 5);
    assert.equal(minRoomsFor(0), 1);
    assert.equal(normalizedBedrooms(bien({ bedrooms: null, rooms: 3 })), 2);
    assert.equal(normalizedBedrooms(bien({ bedrooms: null, rooms: 1 })), 0);
    assert.equal(normalizedBedrooms(bien({ bedrooms: 0, rooms: 4 })), 0); // publié bat déduit
    assert.equal(normalizedBedrooms(bien({ bedrooms: null, rooms: null })), null);
  });

  it("une annonce en pièces est jugée en pièces", () => {
    // 4 pièces = 3 chambres : sous le seuil de 4 chambres demandées.
    assert.equal(
      partyVerdict(bien({ bedrooms: null, rooms: 4 }), { travelers: 8, rooms: 4 }),
      "trop-petit",
    );
    assert.equal(
      partyVerdict(bien({ bedrooms: null, rooms: 5 }), { travelers: 8, rooms: 4 }),
      "convient",
    );
  });

  it("un studio se reconnaît au titre comme au compte", () => {
    assert.ok(
      isStudioListing(bien({ title: "STUDIO CABINE 4 pers.", bedrooms: null, rooms: null })),
    );
    assert.ok(isStudioListing(bien({ bedrooms: null, rooms: 1 })));
    assert.ok(isStudioListing(bien({ bedrooms: 0 })));
    assert.ok(!isStudioListing(bien({ bedrooms: 3 })));
  });

  it("« non annoncé » passe quand on le demande, et sort par défaut", () => {
    const muet = bien({ guests: null, bedrooms: null, rooms: null });
    assert.equal(partyVerdict(muet, { travelers: 8, rooms: 4 }), "non-annonce");
    assert.ok(!fitsParty(muet, { travelers: 8, rooms: 4 }));
    assert.ok(fitsParty(muet, { travelers: 8, rooms: 4 }, true));
    // Aucun critère posé : rien à juger, l'annonce passe.
    assert.ok(fitsParty(muet, { travelers: 0, rooms: 0 }));
  });

  it("« annoncé trop petit » sort, même en réaffichant les non-annoncées", () => {
    // Un refus l'emporte sur une absence : 1 chambre publiée quand on en
    // demande quatre est démontrablement trop petit, capacité publiée ou non.
    const petit = bien({ guests: null, bedrooms: 1 });
    assert.equal(partyVerdict(petit, { travelers: 8, rooms: 4 }), "trop-petit");
    assert.ok(!fitsParty(petit, { travelers: 8, rooms: 4 }, true));
  });

  it("un gîte de groupe sort, et un libellé « Gîte » ne sauve pas une URL de groupe", () => {
    assert.ok(
      isDroppedGitesOffer({
        source: "Gîtes de France",
        title: "Gîte du Haut",
        url: "https://www.gites-de-france.com/fr/gite-de-groupe-la-grange-38g1",
      }),
    );
    assert.ok(
      isDroppedGitesOffer({ source: "Centrale", title: "Gîte de séjour des Ecrins", url: null }),
    );
    assert.ok(
      isDroppedGitesOffer({
        source: "Gîtes de France",
        title: "Chambre d'hôtes du Col",
        url: "https://www.gites-de-france.com/fr/chambre-d-hotes-du-col",
      }),
    );
    // « Chalet les Copains », 14 personnes, reste un gîte ordinaire.
    assert.ok(
      !isDroppedGitesOffer({
        source: "Gîtes de France",
        title: "Chalet les Copains",
        url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/chalet-les-copains-38g253122",
      }),
    );
    assert.ok(
      !isDroppedGitesOffer({
        source: "Gîtes de France",
        title: "Gîte Copains comme Cochons",
        url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/copains-comme-cochons-38g253122",
      }),
    );
  });

  it("une chambre d'hôtes hors Gîtes de France ne tombe pas sous la règle", () => {
    // La preuve par chambre d'hôtes est liée à la source : ailleurs, le mot
    // apparaît dans des titres qui ne désignent pas l'offre écartée.
    assert.ok(
      !isDroppedGitesOffer({
        source: "Airbnb",
        title: "Ancienne chambre d hotes rénovée",
        url: "https://www.airbnb.fr/rooms/999",
      }),
    );
  });
});

describe("filtre : ce qui sort, et pourquoi", () => {
  const criteres = { travelers: 8, rooms: 4, stay: STAY, now: NOW };

  it("une annonce sans tarif échappe au prix, pas au reste", () => {
    const sansPrix = bien({ id: "sp", total: 0, guests: 8, bedrooms: 4 });
    assert.equal(
      dropReasonFor(sansPrix, { ...criteres, budgetMin: 0, budgetMax: 500, budgetCeiling: 6000 }),
      null,
    );
    // Mais la capacité, elle, l'engage toujours.
    const petitSansPrix = bien({ id: "sp2", total: 0, guests: 8, bedrooms: 1 });
    assert.equal(dropReasonFor(petitSansPrix, criteres), "capacite");
  });

  it("le prix écarte quand la fourchette est posée, jamais quand elle est ouverte", () => {
    const cher = bien({ id: "c", total: 5420, guests: 10, bedrooms: 4 });
    assert.equal(
      dropReasonFor(cher, { ...criteres, budgetMin: 0, budgetMax: 3000, budgetCeiling: 6000 }),
      "prix",
    );
    assert.equal(
      dropReasonFor(cher, { ...criteres, budgetMin: 0, budgetMax: 6000, budgetCeiling: 6000 }),
      null,
    );
  });

  it("la source décochée et la disponibilité ont leur propre motif", () => {
    const abnb = bien({ id: "a", guests: 8, bedrooms: 4 });
    assert.equal(dropReasonFor(abnb, { ...criteres, srcOff: ["Airbnb"] }), "source");
    // Sans champ de relevé daté, l'annonce n'est pas prouvée disponible.
    assert.equal(dropReasonFor(abnb, { ...criteres, onlyAvailable: true }), "disponibilite");
    // Une porte d'entrée n'est pas jugée là-dessus.
    assert.equal(
      dropReasonFor(bien({ id: "d", url: null, guests: 8, bedrooms: 4 }), {
        ...criteres,
        onlyAvailable: true,
      }),
      null,
    );
  });

  it("les écarts sont comptés par motif, pour que l'écran puisse les nommer", () => {
    const rows: FilterSubject[] = [
      bien({ id: "ok1", guests: 8, bedrooms: 4, total: 2000 }),
      bien({ id: "ok2", guests: 12, bedrooms: 5, total: 2500 }),
      bien({ id: "petit1", guests: 4, bedrooms: 4, total: 1000 }),
      bien({ id: "petit2", guests: 8, bedrooms: 2, total: 1200 }),
      bien({ id: "cher1", guests: 8, bedrooms: 4, total: 5000 }),
      bien({ id: "cher2", guests: 9, bedrooms: 4, total: 5800 }),
      bien({
        id: "groupe1",
        guests: 20,
        bedrooms: 7,
        total: 4000,
        source: "Gîtes de France",
        title: "Gîte de groupe des Cimes",
        url: "https://www.gites-de-france.com/fr/gite-de-groupe-des-cimes",
      }),
      bien({ id: "src1", guests: 8, bedrooms: 4, total: 2100, source: "Booking" }),
    ];
    const out = applyFilter(rows, {
      ...criteres,
      budgetMin: 0,
      budgetMax: 3000,
      budgetCeiling: 6000,
      srcOff: ["Booking"],
    });
    assert.deepEqual(
      out.kept.map((r) => r.id),
      ["ok1", "ok2"],
    );
    assert.equal(out.dropped.total, 6);
    assert.deepEqual(out.dropped.byReason, {
      groupe: 1,
      "autre-domaine": 0,
      "hors-zone": 0,
      capacite: 2,
      "capacite-muette": 0,
      prix: 2,
      source: 1,
      disponibilite: 0,
    });
    assert.equal(
      droppedLabel(out.dropped),
      "6 biens masqués : 1 gîte de groupe, 2 trop petits, 2 hors budget, 1 source décochée",
    );
    // Un motif unique ne répète pas son nombre.
    const unSeul = applyFilter([bien({ id: "c", total: 9000, guests: 8, bedrooms: 4 })], {
      ...criteres,
      budgetMin: 0,
      budgetMax: 3000,
      budgetCeiling: 6000,
    });
    assert.equal(droppedLabel(unSeul.dropped), "1 bien masqué : hors budget");
    // Un motif venu d'ailleurs que du filtre s'additionne au total.
    assert.equal(
      droppedLabel(out.dropped, [{ singulier: "hors des 500 m", pluriel: "hors des 500 m", n: 2 }]),
      "8 biens masqués : 1 gîte de groupe, 2 trop petits, 2 hors budget, 1 source décochée, 2 hors des 500 m",
    );
  });

  it("rien de masqué : rien à écrire", () => {
    const out = applyFilter([bien({ id: "ok", guests: 8, bedrooms: 4 })], criteres);
    assert.equal(out.dropped.total, 0);
    assert.equal(droppedLabel(out.dropped), "");
  });
});

describe("filtre : la zone de recherche", () => {
  const criteres = { travelers: 8, rooms: 4, stay: STAY, now: NOW };
  // Un sujet qui satisfait déjà capacité et chambres : seule la géographie
  // doit pouvoir l'écarter, sans quoi le test mesurerait autre chose.
  const zone = (over: Partial<FilterSubject> = {}) => bien({ guests: 8, bedrooms: 4, ...over });

  it("un logement à 300 km sort, et le motif le nomme", () => {
    // Le critère de fin, à la lettre : 300 km du repère de la station, aucun
    // rattachement de domaine établi, donc c'est la distance qui tranche.
    const lointain = zone({ id: "loin", distToSlopesM: 300_000 });
    assert.equal(dropReasonFor(lointain, criteres), "hors-zone");
    assert.equal(geoReasonFor(lointain), "hors-zone");

    const out = applyFilter([lointain], criteres);
    assert.deepEqual(out.kept, []);
    assert.equal(out.dropped.byReason["hors-zone"], 1);
    assert.equal(droppedLabel(out.dropped), "1 bien masqué : hors de la zone");
  });

  it("un logement sans coordonnées reste : il n'est pas lointain, il est non mesurable", () => {
    const sansGps = zone({ id: "sans-gps", distToSlopesM: null });
    assert.equal(geoReasonFor(sansGps), null);
    assert.equal(dropReasonFor(sansGps, criteres), null);

    // Le champ entièrement absent se lit comme le champ nul : rien à mesurer.
    const champAbsent = zone({ id: "absent" });
    assert.equal(geoReasonFor(champAbsent), null);
    assert.equal(dropReasonFor(champAbsent, criteres), null);

    const out = applyFilter([sansGps, champAbsent], criteres);
    assert.equal(out.kept.length, 2);
    assert.equal(out.dropped.total, 0);
  });

  it("le domaine prime sur la distance, dans les deux sens", () => {
    // Un autre domaine sort même tout près : l'Iseran fermé l'hiver en est la
    // raison, le vol d'oiseau n'est pas un accès.
    const voisinAutreDomaine = zone({ id: "voisin", distToSlopesM: 3_000, domainFit: "other" });
    assert.equal(geoReasonFor(voisinAutreDomaine), "autre-domaine");
    assert.equal(dropReasonFor(voisinAutreDomaine, criteres), "autre-domaine");

    // Le bon domaine reste, même au-delà du rayon.
    const loinMemeDomaine = zone({ id: "loin-in", distToSlopesM: 18_000, domainFit: "in" });
    assert.equal(geoReasonFor(loinMemeDomaine), null);
    assert.equal(dropReasonFor(loinMemeDomaine, criteres), null);

    // Un domaine relié aussi.
    const relie = zone({ id: "relie", distToSlopesM: 25_000, domainFit: "linked" });
    assert.equal(geoReasonFor(relie), null);
  });

  it("le rayon se règle, et se borne à ce qui a un sens", () => {
    const a20 = zone({ id: "a20", distToSlopesM: 20_000 });
    assert.equal(geoReasonFor(a20, RAYON_DEFAUT_KM), "hors-zone");
    assert.equal(geoReasonFor(a20, 25), null);
    assert.equal(dropReasonFor(a20, { ...criteres, rayonKm: 25 }), null);
    assert.equal(dropReasonFor(a20, { ...criteres, rayonKm: 10 }), "hors-zone");

    // La borne est inclusive : à 15 000 m tout rond, on est dans les 15 km.
    assert.equal(geoReasonFor(zone({ id: "pile", distToSlopesM: 15_000 })), null);
    assert.equal(geoReasonFor(zone({ id: "juste", distToSlopesM: 15_001 })), "hors-zone");

    // Hors bornes, on ramène dans les bornes plutôt que d'inventer une zone.
    assert.equal(clampRayonKm(0), RAYON_MIN_KM);
    assert.equal(clampRayonKm(-5), RAYON_MIN_KM);
    assert.equal(clampRayonKm(900), RAYON_MAX_KM);
    assert.equal(clampRayonKm(null), RAYON_DEFAUT_KM);
    assert.equal(clampRayonKm(Number.NaN), RAYON_DEFAUT_KM);
    assert.equal(clampRayonKm(12.4), 12);
  });

  it("sur le référentiel réel : Marseille ne remonte pas dans une recherche La Plagne", () => {
    // Le symptôme rapporté, reproduit sur les vraies données. Le logement passe
    // par `attachAccess`, exactement comme le fait la recherche en direct.
    const plagne = stationById("la-plagne");
    assert.ok(plagne, "la-plagne doit exister au référentiel");
    const brut = {
      id: "marseille",
      stationId: "la-plagne",
      title: "Appartement vue Vieux-Port",
      source: "Airbnb",
      total: 2100,
      currency: "EUR",
      guests: 8,
      bedrooms: 4,
      available: true,
      photo: null,
      url: "https://www.airbnb.fr/rooms/999",
      lat: 43.2965,
      lon: 5.3698,
      proven: "test",
    } as Listing;
    const situe = attachAccess(brut, plagne!);

    // La distance est mesurée, et elle est énorme.
    assert.ok((situe.distToSlopesM ?? 0) > 250_000);
    // Le rattachement tranche avant elle, et il est plus précis : ce logement
    // n'est pas « trop loin », il est sur un autre domaine.
    assert.equal(situe.domainFit, "other");
    assert.equal(dropReasonFor(situe, criteres), "autre-domaine");

    // Dans la même vallée, à sept kilomètres, le logement reste.
    const proche = attachAccess({ ...brut, id: "aime", lat: 45.5547, lon: 6.6486 }, plagne!);
    assert.equal(proche.domainFit, "in");
    assert.equal(dropReasonFor(proche, criteres), null);
  });

  it("« trop petit » et « sans capacité annoncée » ne se comptent pas ensemble", () => {
    // Le cas réel : sur un relevé de station, la plupart des annonces ne
    // publient aucune capacité. Les compter « trop petites » accusait la
    // source d'un refus qu'elle n'a jamais prononcé.
    const rows: FilterSubject[] = [
      bien({ id: "ok", guests: 8, bedrooms: 4, total: 2000 }),
      bien({ id: "petit", guests: 4, bedrooms: 4, total: 1000 }),
      bien({ id: "muet1", guests: null, bedrooms: null, rooms: null, total: 1500 }),
      bien({ id: "muet2", guests: null, bedrooms: null, rooms: null, total: 1600 }),
    ];
    const out = applyFilter(rows, { travelers: 8, rooms: 4, stay: STAY, now: NOW });
    assert.deepEqual(
      out.kept.map((r) => r.id),
      ["ok"],
    );
    assert.equal(out.dropped.byReason.capacite, 1);
    assert.equal(out.dropped.byReason["capacite-muette"], 2);
    assert.equal(
      droppedLabel(out.dropped),
      "3 biens masqués : 1 trop petit, 2 sans capacité annoncée",
    );
    // Réaffichées sur demande, elles ne sont plus comptées nulle part.
    const avec = applyFilter(rows, {
      travelers: 8,
      rooms: 4,
      stay: STAY,
      now: NOW,
      includeUnannounced: true,
    });
    assert.deepEqual(
      avec.kept.map((r) => r.id),
      ["ok", "muet1", "muet2"],
    );
    assert.equal(avec.dropped.byReason["capacite-muette"], 0);
    // Un refus publié reste un refus, même en réaffichant les muettes.
    assert.equal(avec.dropped.byReason.capacite, 1);
  });
});

