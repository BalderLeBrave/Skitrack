import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysIso,
  isSaturdayIso,
  monthGrid,
  monthLabel,
  monthOfIso,
  formatDayIso,
  nightsBetween,
  parseIso,
  saturdayWeekFrom,
  shiftMonth,
  stayRangeLabel,
  todayIso,
  weekdayIso,
} from "./calendar.ts";
import { clampRooms, clampTravelers, PARTY_LIMITS, roomsLabel, travelersLabel } from "./party.ts";
import { inRange, inRangeOrNull, rangeOpen } from "./range.ts";
import { accessTimeOf, formatAccessTime } from "../accessTime.ts";

describe("calendrier du séjour", () => {
  it("refuse une date qui n'existe pas", () => {
    // Le mois fait foi : le 30 février n'est pas un 2 mars, c'est une erreur.
    assert.equal(parseIso("2027-02-30"), null);
    assert.equal(parseIso("2027-13-01"), null);
    assert.equal(parseIso("2027-00-10"), null);
    assert.equal(parseIso("06/02/2027"), null);
    assert.deepEqual(parseIso("2027-02-06"), { year: 2027, month0: 1, day: 6 });
  });

  it("le 29 février n'existe que les années bissextiles", () => {
    assert.deepEqual(parseIso("2028-02-29"), { year: 2028, month0: 1, day: 29 });
    assert.equal(parseIso("2027-02-29"), null);
  });

  it("passe l'année sans dériver", () => {
    assert.equal(addDaysIso("2026-12-28", 7), "2027-01-04");
    assert.equal(addDaysIso("2027-01-03", -7), "2026-12-27");
    assert.equal(shiftMonth({ year: 2026, month0: 11 }, 1).year, 2027);
    assert.equal(shiftMonth({ year: 2026, month0: 11 }, 1).month0, 0);
    assert.equal(shiftMonth({ year: 2027, month0: 0 }, -1).year, 2026);
  });

  it("compte les nuits, et dit quand la plage est à l'envers", () => {
    assert.equal(nightsBetween("2027-02-06", "2027-02-13"), 7);
    assert.equal(nightsBetween("2026-12-28", "2027-01-04"), 7);
    assert.equal(nightsBetween("2027-02-06", "2027-02-06"), 0);
    // Négatif plutôt que zéro : l'écran doit pouvoir le signaler.
    assert.equal(nightsBetween("2027-02-13", "2027-02-06"), -7);
    assert.equal(nightsBetween("2027-02-30", "2027-03-06"), null);
  });

  it("samedi vaut 5 dans l'ordre des colonnes, lundi en tête", () => {
    assert.equal(weekdayIso("2027-02-08"), 0); // lundi
    assert.equal(weekdayIso("2027-02-13"), 5); // samedi
    assert.equal(weekdayIso("2027-02-14"), 6); // dimanche
    assert.ok(isSaturdayIso("2027-02-13"));
    assert.ok(!isSaturdayIso("2027-02-10"));
    assert.ok(!isSaturdayIso("2027-02-31"));
  });

  it("un samedi est sa propre arrivée", () => {
    // La suggestion pour un samedi est la semaine qui commence ce jour-là,
    // jamais celle qui s'y termine.
    assert.deepEqual(saturdayWeekFrom("2027-02-06"), {
      arr: "2027-02-06",
      dep: "2027-02-13",
    });
  });

  it("un jour de semaine remonte au samedi précédent", () => {
    assert.deepEqual(saturdayWeekFrom("2027-02-10"), {
      arr: "2027-02-06",
      dep: "2027-02-13",
    });
    assert.deepEqual(saturdayWeekFrom("2027-02-12"), {
      arr: "2027-02-06",
      dep: "2027-02-13",
    });
    assert.equal(saturdayWeekFrom("2027-02-30"), null);
  });

  it("la grille du mois ne rend que des semaines pleines", () => {
    const weeks = monthGrid({ year: 2027, month0: 1 });
    assert.ok(weeks.every((w) => w.length === 7));
    const jours = weeks.flat().filter((c): c is string => c != null);
    assert.equal(jours.length, 28); // février 2027
    assert.equal(jours[0], "2027-02-01");
    assert.equal(jours[jours.length - 1], "2027-02-28");
    // Le 1er février 2027 est un lundi : aucune case vide en tête.
    assert.equal(weeks[0][0], "2027-02-01");
  });

  it("la grille cale les cases vides du bon côté", () => {
    // Le 1er mars 2027 est un lundi ; le 1er avril 2027 un jeudi.
    assert.equal(monthGrid({ year: 2027, month0: 2 })[0][0], "2027-03-01");
    const avril = monthGrid({ year: 2027, month0: 3 })[0];
    assert.deepEqual(avril.slice(0, 3), [null, null, null]);
    assert.equal(avril[3], "2027-04-01");
  });

  it("l'entête du mois se lit en français, sans dépendre de l'hôte", () => {
    assert.equal(monthLabel({ year: 2027, month0: 1 }), "février 2027");
    assert.equal(monthLabel({ year: 2026, month0: 11 }), "décembre 2026");
    assert.deepEqual(monthOfIso("2027-02-06"), { year: 2027, month0: 1 });
    assert.equal(monthOfIso("2027-02-30"), null);
  });

  it("la plage se lit en clair, et se plaint quand elle cloche", () => {
    assert.equal(formatDayIso("2027-02-06"), "6 févr. 2027");
    assert.equal(formatDayIso("2027-02-30"), "2027-02-30");
    assert.equal(
      stayRangeLabel("2027-02-06", "2027-02-13"),
      "6 févr. 2027 au 13 févr. 2027, 7 nuits",
    );
    assert.match(stayRangeLabel("2027-02-13", "2027-02-06"), /départ avant l’arrivée/);
    assert.match(stayRangeLabel("2027-02-30", "2027-03-06"), /dates illisibles/);
  });

  it("aujourd'hui est lu en UTC, pas dans le fuseau de la machine", () => {
    assert.equal(todayIso(new Date("2027-02-06T23:30:00Z")), "2027-02-06");
    assert.equal(todayIso(new Date("2027-01-01T00:00:00Z")), "2027-01-01");
  });
});

describe("bornes du groupe", () => {
  it("ramène entre les bornes plutôt que de refuser", () => {
    assert.equal(clampTravelers(50), PARTY_LIMITS.travelers.max);
    assert.equal(clampTravelers(0), PARTY_LIMITS.travelers.min);
    assert.equal(clampTravelers(14), 14);
    assert.equal(clampRooms(-3), 0);
    assert.equal(clampRooms(99), PARTY_LIMITS.rooms.max);
    assert.equal(clampRooms(8), 8);
    assert.equal(clampTravelers(Number.NaN), PARTY_LIMITS.travelers.min);
  });

  it("les bornes couvrent un groupe de quatorze et un chalet de huit chambres", () => {
    assert.equal(clampTravelers(14), 14);
    assert.equal(clampRooms(8), 8);
    assert.equal(PARTY_LIMITS.travelers.max, 20);
    assert.equal(PARTY_LIMITS.rooms.max, 9);
  });

  it("zéro chambre vaut « studio accepté », pas « aucune chambre »", () => {
    assert.equal(roomsLabel(0), "studio accepté");
    assert.equal(roomsLabel(1), "1 chambre");
    assert.equal(roomsLabel(4), "4 chambres");
    assert.equal(travelersLabel(1), "1 voyageur");
    assert.equal(travelersLabel(8), "8 voyageurs");
  });
});

describe("plages de filtre", () => {
  it("une plage grande ouverte n'écarte rien", () => {
    assert.ok(rangeOpen(0, 1200, 1200));
    assert.ok(rangeOpen(0, 5000, 1200)); // au-delà du plafond, toujours ouverte
    assert.ok(!rangeOpen(10, 1200, 1200));
    assert.ok(inRange(620, 0, 1200, 1200));
    assert.ok(inRangeOrNull(null, 0, 1200, 1200));
  });

  it("une plage posée écarte une valeur inconnue", () => {
    // Un domaine dont on ignore le temps de route ne peut pas prétendre entrer
    // dans une fourchette qu'on ne peut pas vérifier.
    assert.ok(!inRangeOrNull(null, 0, 300, 1200));
    assert.ok(inRangeOrNull(250, 0, 300, 1200));
    assert.ok(!inRangeOrNull(620, 0, 300, 1200));
    // Borne haute au plafond : seule la borne basse filtre encore.
    assert.ok(inRange(9000, 100, 1200, 1200));
    assert.ok(!inRange(50, 100, 1200, 1200));
  });
});

describe("temps d'accès aux pistes", () => {
  it("la classification de la source prime sur la distance", () => {
    // 200 m mais classé voiture : une falaise peut séparer les deux points.
    assert.deepEqual(accessTimeOf(200, "voiture"), { mode: "voiture", minutes: 6 });
    assert.deepEqual(accessTimeOf(3000, "skis_aux_pieds"), {
      mode: "skis_aux_pieds",
      minutes: null,
    });
    assert.equal(accessTimeOf(800, "navette")?.mode, "navette");
  });

  it("sans classification, la distance tranche aux seuils d'origine", () => {
    assert.equal(accessTimeOf(150, undefined)?.mode, "skis_aux_pieds");
    assert.deepEqual(accessTimeOf(400, undefined), { mode: "a_pied", minutes: 8 });
    assert.equal(accessTimeOf(1200, undefined)?.mode, "a_pied");
    assert.equal(accessTimeOf(1201, undefined)?.mode, "voiture");
    // Distance absente : on ne devine pas un trajet.
    assert.equal(accessTimeOf(Number.NaN, undefined), null);
    assert.equal(accessTimeOf(-1, undefined), null);
  });

  it("un temps s'écrit toujours avec son moyen", () => {
    assert.equal(formatAccessTime(accessTimeOf(400, undefined)), "8 min à pied");
    assert.equal(formatAccessTime(accessTimeOf(100, undefined)), "Skis aux pieds");
    assert.equal(formatAccessTime(accessTimeOf(2000, undefined)), "11 min en voiture");
    // Rien à dire plutôt qu'un tiret, qui se lirait comme un zéro.
    assert.equal(formatAccessTime(null), "");
  });
});
