import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agencesDe, lieuxDe, stationsDe } from "./couverture.ts";
import {
  adressePhoto,
  calendrierIllisible,
  defiAntiRobot,
  lectureDuPanneau,
  lireAutocompletion,
  lireCalendrier,
  lireFicheArchivee,
  lireLibelle,
  lireDescriptionLogement,
  lirePanneau,
  lirePhotosLogement,
  lireSuitePanneaux,
  logementGarde,
  nuitsEntre,
  ordonnerResidences,
  residencesDe,
  skiPlanetListings,
  slug,
  urlAutocompletion,
  urlCalendrier,
  urlInfosLogement,
  type PanneauALire,
  type PorteSuitePanneaux,
  type ResidenceSkiPlanet,
  type TableSkiPlanet,
} from "./skiPlanet.ts";
import type { LiveSearchInput } from "../types.ts";
import {
  aEquipement,
  descriptionDe,
  equipementsDe,
  equipementsLus,
  equipementsTus,
  ficheDepuisBrut,
} from "../../stay/ficheEnrichie.ts";

const dir = dirname(fileURLToPath(import.meta.url));
/**
 * Réponses réelles du 26 septembre 2026, blancs resserrés (elles se lisent
 * comme les réponses d'origine) : les calendriers de Snow à Avoriaz
 * (6→13/02/2027, hébergement seul puis forfaits compris, et 7→11/02/2027,
 * sans disponibilité), celui de l'hôtel Belambra (7→11/02/2027, épuisé),
 * l'autocomplétion de « snow » ; et la copie archivée de la fiche de Snow
 * (archive.org, 17 décembre 2025), réduite à ce que le module lit.
 */
const fx = (f: string) => readFileSync(join(dir, "fixtures", f), "utf8");
const SEUL = lireCalendrier(fx("sp-calendrier-33314-seul.html"));
const FORFAIT = lireCalendrier(fx("sp-calendrier-33314-forfait.html"));
const INDISPONIBLE = fx("sp-calendrier-33314-indisponible.html");
const EPUISE = lireCalendrier(fx("sp-calendrier-31811-epuise.html"));

const AVORIAZ: LiveSearchInput = {
  stationId: "avoriaz",
  stationName: "Avoriaz",
  lat: 46.1914,
  lon: 6.7728,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};
const SNOW: ResidenceSkiPlanet = {
  id: "33314",
  nom: "Snow",
  station: "Avoriaz",
  lat: 46.19047,
  lon: 6.77798,
  photo: "https://docs.ski-planet.com/photo/avoriaz/medium/snow-appartement-2-pieces-cabine-6-personnes-117-828-sejour-911893.jpg",
};

describe("Ski-Planet : requêtes", () => {
  it("le calendrier d'une résidence : arrivée, nuits, formule, sans le nombre de voyageurs", () => {
    const u = new URL(urlCalendrier("33314", AVORIAZ, false));
    assert.equal(u.origin + u.pathname, "https://www.ski-planet.com/fr/ajax/calendrier-residence.php");
    assert.deepEqual(Object.fromEntries(u.searchParams), {
      id_residence: "33314",
      nb_nuits: "7",
      id_formule: "0",
      date_debut: "2027-02-06",
      checkForfait: "0",
      checkMateriel: "0",
      checkCours: "0",
      afficher_menu: "1",
      afficher_infobulles: "0",
    });
    assert.equal(new URL(urlCalendrier(33314, AVORIAZ, true)).searchParams.get("checkForfait"), "1");
    assert.doesNotMatch(urlCalendrier(33314, AVORIAZ, true), /skitrack/i);
  });

  it("un identifiant, des dates ou une durée illisibles ne partent pas", () => {
    assert.throws(() => urlCalendrier("33314&x=1", AVORIAZ, false));
    assert.throws(() => urlCalendrier("33314", { ...AVORIAZ, checkIn: "06/02/2027" }, false));
    assert.throws(() => nuitsEntre("2027-02-06", "2027-02-06"), /0 nuits/);
    assert.throws(() => nuitsEntre("2027-02-06", "2027-03-20"), /42 nuits/);
    assert.equal(nuitsEntre("2027-02-07", "2027-02-11"), 4);
  });

  it("l'autocomplétion : trois lettres au moins, sans accents", () => {
    assert.equal(
      urlAutocompletion("Résidence"),
      "https://www.ski-planet.com/fr/ajax/recherche-destination.php?expression=residence&recuperer_recherche=false",
    );
    assert.throws(() => urlAutocompletion("e"));
  });
});

describe("Ski-Planet : autocomplétion et table des résidences", () => {
  it("les résidences et leur station, le mot cherché compris dans le nom", () => {
    const { entrees, compteurs } = lireAutocompletion(fx("sp-autocompletion-snow.html"));
    assert.deepEqual(compteurs, { Hébergement: 5 });
    assert.deepEqual(
      entrees.map((e) => [e.critere, e.id, e.nom, e.station]),
      [
        ["residences", "30966", "Chalet Snowy Breeze", "Val d'Isère"],
        ["residences", "31956", "Le Snowbaur", "Le Grand Bornand"],
        ["residences", "30117", "Résidence Le Snow", "Avoriaz"],
        ["residences", "24839", "Résidence le Sunny Snow", "Les Orres"],
        ["residences", "33314", "Snow", "Avoriaz"],
      ],
    );
    assert.equal(slug("Val d'Isère"), "val-d-isere");
  });

  it("les résidences d'une station : dans l'ordre, sans doublon, positions et photos vérifiées", () => {
    const table: TableSkiPlanet = {
      genere: "2026-09-26",
      stations: {
        avoriaz: {
          libelle: "Avoriaz",
          residences: [
            [33314, "Snow", 46.19047, 6.77798, "avoriaz/medium/snow-911893.jpg"],
            [30117, "Résidence Le Snow", 0, 0, "../../ailleurs.jpg"],
            [33314, "Snow", null, null, null],
          ],
        },
      },
    };
    const rs = residencesDe(table, ["avoriaz", "inconnue"]);
    assert.deepEqual(
      rs.map((r) => [r.id, r.nom, r.station, r.lat, r.lon, r.photo]),
      [
        ["33314", "Snow", "Avoriaz", 46.19047, 6.77798, "https://docs.ski-planet.com/photo/avoriaz/medium/snow-911893.jpg"],
        ["30117", "Résidence Le Snow", "Avoriaz", null, null, null],
      ],
    );
    assert.equal(adressePhoto("https://exemple.test/x.jpg"), null);
  });

  it("les résidences avec position passent d'abord, l'ordre de la table pour le reste", () => {
    const sans = (id: string): ResidenceSkiPlanet => ({ ...SNOW, id, lat: null, lon: null });
    const ordre = ordonnerResidences([sans("1"), { ...SNOW, id: "2" }, sans("3"), { ...SNOW, id: "4" }]).map((r) => r.id);
    assert.deepEqual(ordre, ["2", "4", "1", "3"]);
  });

  it("la table du dépôt : chaque station couverte a ses résidences, chaque résidence une seule station", () => {
    const table = JSON.parse(readFileSync(join(dir, "skiPlanet.residences.json"), "utf8")) as TableSkiPlanet;
    const lieux = new Set(stationsDe("Ski-Planet").flatMap((s) => [...lieuxDe("Ski-Planet", s)]));
    assert.deepEqual([...lieux].filter((l) => !table.stations[l]?.residences.length), [], "stations couvertes sans résidence");
    assert.deepEqual(Object.keys(table.stations).filter((l) => !lieux.has(l)), [], "résidences d'une station non couverte");
    const ids = Object.values(table.stations).flatMap((s) => s.residences.map((r) => r[0]));
    assert.equal(new Set(ids).size, ids.length);
    for (const s of Object.values(table.stations)) {
      for (const [id, nom, lat, lon, photo] of s.residences) {
        assert.ok(Number.isInteger(id) && id > 0 && nom.trim(), `résidence ${id}`);
        if (lat != null) assert.ok(lat > 41 && lat < 49 && lon != null && lon > -2 && lon < 8, `position de ${id} hors des massifs français`);
        if (photo != null) assert.ok(adressePhoto(photo), `photo de ${id}`);
      }
    }
  });
});

describe("Ski-Planet : fiche archivée", () => {
  it("l'identifiant de la résidence, sa station, le point de sa carte, sa première photo", () => {
    assert.deepEqual(lireFicheArchivee(fx("sp-fiche-archivee-snow.html")), {
      id: "33314",
      station: "Avoriaz",
      lat: 46.19047,
      lon: 6.77798,
      photo: "avoriaz/medium/snow-appartement-2-pieces-cabine-6-personnes-117-828-sejour-911893.jpg",
    });
  });

  it("sans carte, le point du JSON-LD ; sans rien, rien", () => {
    const sansCarte = fx("sp-fiche-archivee-snow.html").replace(/<div id="googlemap_carte"[^>]*><\/div>/, "");
    assert.deepEqual([lireFicheArchivee(sansCarte).lat, lireFicheArchivee(sansCarte).lon], [46.19047, 6.77798]);
    assert.deepEqual(lireFicheArchivee("<html>Just a moment...</html>"), { id: null, station: null, lat: null, lon: null, photo: null });
  });

  it("l'archive relevée ne publie ni description, ni équipements, ni note : pas de fiche, GPS et photo inchangés", () => {
    const f = lireFicheArchivee(fx("sp-fiche-archivee-snow.html"));
    assert.equal("fiche" in f, false);
    assert.deepEqual([f.lat, f.lon], [46.19047, 6.77798]);
    assert.match(f.photo ?? "", /medium\/snow-appartement/);
  });

  it("ce que le JSON-LD de l'archive écrit : description, équipements, note seulement avec son échelle", () => {
    const ld = (extra: string) =>
      fx("sp-fiche-archivee-snow.html").replace(
        '"name": "Snow",',
        `"name": "Snow", "description": "R\u00e9sidence au pied des pistes.", "amenityFeature": [{"@type": "LocationFeatureSpecification", "name": "Ascenseur", "value": true}], ${extra}`,
      );
    const avecEchelle = lireFicheArchivee(ld('"aggregateRating": {"ratingValue": "4.6", "bestRating": "5", "reviewCount": "12"},'));
    assert.equal(avecEchelle.lat, 46.19047);
    const fiche = ficheDepuisBrut(avecEchelle.fiche, "ski-planet")!;
    assert.equal(fiche.description, "Résidence au pied des pistes.");
    assert.deepEqual(
      fiche.equipements.map((e) => [e.id, e.present]),
      [["ascenseur", true]],
    );
    assert.deepEqual([fiche.avis!.noteSur5, fiche.avis!.nombre], [4.6, 12]);
    const sansEchelle = lireFicheArchivee(ld('"aggregateRating": {"ratingValue": "4.6", "reviewCount": "12"},'));
    assert.equal(ficheDepuisBrut(sansEchelle.fiche, "ski-planet")!.avis!.noteSur5, null);
  });
});

describe("Ski-Planet : les équipements d'un logement, depuis son panneau déjà lu", () => {
  it("pas de fiche : ceux que nomme la description, présents ; les autres « non indiqué », jamais absents", () => {
    const description = lireDescriptionLogement(fx("sp-infos-logement-76147.html"));
    const [l] = skiPlanetListings(SNOW, SEUL, AVORIAZ, null, undefined, () => description);
    // Le panneau ne publie ni liste ni note : une fiche sans liste déciderait
    // seule, et l'écran dirait « Équipements non publiés » sous un texte qui
    // nomme le balcon et le lave-vaisselle.
    assert.equal(l.fiche, undefined);
    assert.equal(descriptionDe(l), description);
    const lus = equipementsDe(l) ?? [];
    assert.deepEqual(
      lus.map((e) => [e.id, e.present]),
      [
        ["balcon", true],
        ["lave_vaisselle", true],
      ],
    );
    assert.equal(equipementsLus(l), true);
    assert.equal(equipementsTus(l).length, 10, "les dix autres clés : « non indiqué »");
    assert.deepEqual([aEquipement(l, "balcon"), aEquipement(l, "lave_vaisselle"), aEquipement(l, "parking")], [true, true, false]);
  });
});

describe("Ski-Planet : calendrier", () => {
  it("hébergement seul : le total du séjour, par logement", () => {
    assert.deepEqual([SEUL.disponible, SEUL.forfait, SEUL.forfaitPropose], [true, false, true]);
    assert.deepEqual(SEUL.logements, [
      {
        id: "69622",
        nom: "Appartement 3 pièces 5 personnes (742-618)",
        url: "https://www.ski-planet.com/fr/appartement-3-pieces-5-personnes-742-618,avoriaz_69622.html",
        texteSejour: "sam 06/02/27 - 7 nuits - 3429€",
        idSejour: "344898500",
        dateDebut: "2027-02-06",
        nuits: 7,
        formule: 1,
        capacite: 5,
        dispo: 1,
        prix: 3429,
        parPersonne: false,
        prixBarre: null,
        remise: null,
        baseAdultes: null,
        epuise: false,
      },
    ]);
  });

  it("forfaits compris : un prix par personne, sur la base de la capacité", () => {
    assert.equal(FORFAIT.forfait, true);
    const [l] = FORFAIT.logements;
    assert.deepEqual([l.idSejour, l.prix, l.parPersonne, l.prixBarre, l.remise, l.baseAdultes], ["348852629", 919.8, true, 945.8, "-2.7%", 5]);
  });

  it("sans disponibilité : aucun logement, et ce n'est pas une réponse illisible", () => {
    const c = lireCalendrier(INDISPONIBLE);
    assert.deepEqual([c.disponible, c.logements.length], [false, 0]);
    assert.equal(calendrierIllisible(INDISPONIBLE), false);
    assert.equal(calendrierIllisible(fx("sp-calendrier-33314-seul.html")), false);
    assert.equal(calendrierIllisible("<!DOCTYPE html><title>Just a moment...</title>"), true);
  });

  it("l'hôtel-club épuisé : aucune chambre gardée", () => {
    assert.equal(EPUISE.logements.length, 5);
    assert.ok(EPUISE.logements.every((l) => l.epuise && l.idSejour === null && l.prix === null));
    assert.ok(EPUISE.logements.every((l) => !logementGarde(l)));
  });
});

describe("Ski-Planet : libellés", () => {
  it("type, pièces et personnes lus dans le libellé du logement", () => {
    assert.deepEqual(lireLibelle("Appartement 2 pièces 2-4 personnes (210)"), {
      type: "Appartement",
      pieces: 2,
      personnes: 4,
      studio: false,
      chambre: false,
    });
    assert.deepEqual(lireLibelle("Studio coin montagne 4 personnes"), { type: "Studio coin montagne", pieces: 1, personnes: 4, studio: true, chambre: false });
    assert.equal(lireLibelle("Chambre avec vue imprenable (2 adultes)").chambre, true);
  });

  it("une chambre d'hôtel, même vendue, n'est pas un logement", () => {
    const [l] = SEUL.logements;
    assert.equal(logementGarde(l), true);
    assert.equal(logementGarde({ ...l, nom: "Chambre avec vue imprenable (2 adultes)" }), false);
    assert.equal(logementGarde({ ...l, formule: 6 }), false, "« all inclusive » d'un hôtel-club");
  });
});

describe("Ski-Planet : annonces", () => {
  it("hébergement seul : le total publié, la position et la photo de la résidence", () => {
    const [l] = skiPlanetListings(SNOW, SEUL, AVORIAZ);
    assert.deepEqual(l, {
      id: "sp-69622",
      stationId: "avoriaz",
      title: "Snow — Appartement 3 pièces 5 personnes (742-618)",
      source: "Ski-Planet",
      total: 3429,
      currency: "EUR",
      capacity: 5,
      capacityStandard: null,
      capacitySource: "structured",
      bedrooms: 2,
      bedroomsSource: "derived_from_type",
      isStudio: false,
      rooms: 3,
      propertyType: "Appartement",
      available: true,
      photo: SNOW.photo,
      photos: [SNOW.photo],
      url: "https://www.ski-planet.com/fr/appartement-3-pieces-5-personnes-742-618,avoriaz_69622.html",
      lat: 46.19047,
      lon: 6.77798,
      locality: "Avoriaz",
      placeName: "Avoriaz",
      priceLabel: "sam 06/02/27 - 7 nuits - 3429€",
      priceIndicative: false,
      skiPassIncluded: false,
      platformId: "69622",
      proven: "Ski-Planet live 2027-02-06→2027-02-13",
    });
  });

  it("forfaits compris, sans le logement seul : pas de total pour un groupe qui ne remplit pas le logement", () => {
    const [f] = skiPlanetListings(SNOW, FORFAIT, AVORIAZ);
    assert.deepEqual([f.id, f.total, f.priceIndicative, f.skiPassIncluded], ["sp-69622-forfait", 0, null, true]);
    assert.equal(f.priceLabel, "sam 06/02/27 - 7 nuits -2.7% - 919.8€ /pers., sur la base de 5 adultes, Hébergement + Forfait de ski");
  });

  it("forfaits compris, avec le logement seul : logement plus un forfait par voyageur, calcul annoncé", () => {
    // 919,80 × 5 = 4 599 € avec forfaits, 3 429 € le logement seul : 234 € par forfait.
    const [f] = skiPlanetListings(SNOW, FORFAIT, AVORIAZ, SEUL);
    assert.deepEqual([f.total, f.priceIndicative, f.skiPassIncluded], [3897, false, true]);
    assert.match(f.priceLabel ?? "", /^3 897 € calculé pour 2 adultes : logement 3 429 € et 2 forfaits à 234 €/);
  });

  it("forfaits compris, groupe qui remplit le logement : prix par personne × 5", () => {
    const [f] = skiPlanetListings(SNOW, FORFAIT, { ...AVORIAZ, guests: 5 });
    assert.deepEqual([f.total, f.priceIndicative], [4599, false]);
  });

  it("rien pour un groupe trop grand, d'autres dates, une résidence sans disponibilité ou épuisée", () => {
    assert.deepEqual(skiPlanetListings(SNOW, SEUL, { ...AVORIAZ, guests: 6 }), []);
    assert.deepEqual(skiPlanetListings(SNOW, SEUL, { ...AVORIAZ, checkIn: "2027-02-13", checkOut: "2027-02-20" }), []);
    assert.deepEqual(skiPlanetListings(SNOW, lireCalendrier(INDISPONIBLE), AVORIAZ), []);
    assert.deepEqual(skiPlanetListings(SNOW, EPUISE, { ...AVORIAZ, checkIn: "2027-02-07", checkOut: "2027-02-11" }), []);
  });

  it("une résidence sans fiche archivée : ni position ni photo", () => {
    const [l] = skiPlanetListings({ ...SNOW, lat: null, lon: null, photo: null }, SEUL, AVORIAZ);
    assert.deepEqual([l.lat, l.lon, l.photo, l.photos], [null, null, null, null]);
  });

  it("une position archivée à plus de 25 km de la station n'est pas reprise", () => {
    const [l] = skiPlanetListings({ ...SNOW, lat: 45.9, lon: 6.1 }, SEUL, AVORIAZ);
    assert.deepEqual([l.lat, l.lon], [null, null], "Annecy n'est pas Avoriaz");
  });
});

describe("Ski-Planet : couverture", () => {
  it("les stations, pas leurs sous-stations ; Orelle a ses propres résidences", () => {
    assert.deepEqual(lieuxDe("Ski-Planet", "avoriaz"), ["avoriaz"]);
    assert.ok(agencesDe("avoriaz").includes("Ski-Planet"));
    assert.deepEqual(lieuxDe("Ski-Planet", "tignes"), ["tignes"]);
    // Tignes Le Lac est un village de Tignes depuis le 5 octobre 2026
    // (`villages.ts`) : il se lit sous sa station.
    assert.deepEqual(lieuxDe("Ski-Planet", "tignes-le-lac"), ["tignes"]);
    assert.deepEqual(lieuxDe("Ski-Planet", "orelle"), ["orelle"]);
    // Le site range Mottaret, Montalbert ou La Joue du Loup à part : leurs
    // résidences s'ajoutent à celles de la station (`LIEUX_DISJOINTS`).
    assert.deepEqual(lieuxDe("Ski-Planet", "meribel"), ["meribel", "meribel-mottaret"]);
    assert.deepEqual(lieuxDe("Ski-Planet", "superdevoluy-la-joue-du-loup"), ["superdevoluy", "la-joue-du-loup"]);
  });
});

describe("Ski-Planet : le panneau d'un logement, pour une résidence sans photo", () => {
  // Réponse réelle du 3 octobre 2026 : logement 76147, Résidence le Cervin (La Plagne).
  const PANNEAU = fx("sp-infos-logement-76147.html");

  it("l'adresse du panneau (`afficheLogement`)", () => {
    assert.equal(urlInfosLogement("76147"), "https://www.ski-planet.com/fr/ajax/infos-logement.php?id_logement=76147");
  });

  it("ses photos au grand format, dans l'ordre, sans doublon ni vignette", () => {
    const photos = lirePhotosLogement(PANNEAU);
    assert.ok(photos.length >= 3, `${photos.length} photos`);
    assert.equal(
      photos[0],
      "https://docs.ski-planet.com/photo/la-plagne/large/residence-le-cervin-appartement-duplex-2-pieces-6-personnes-706-sejour-1018813.jpg",
    );
    assert.ok(photos.every((u) => u.includes("/large/")));
    assert.equal(new Set(photos).size, photos.length);
    assert.deepEqual(lirePhotosLogement("<p>rien</p>"), []);
  });

  it("la photo de la résidence d'abord ; sans elle, celles du logement", () => {
    const panneau = (id: string) => (id === "69622" ? ["https://docs.ski-planet.com/photo/avoriaz/large/a.jpg", "https://docs.ski-planet.com/photo/avoriaz/large/b.jpg"] : null);
    const [avec] = skiPlanetListings(SNOW, SEUL, AVORIAZ, null, panneau);
    assert.equal(avec.photo, SNOW.photo);
    const [sans] = skiPlanetListings({ ...SNOW, photo: null }, SEUL, AVORIAZ, null, panneau);
    assert.equal(sans.photo, "https://docs.ski-planet.com/photo/avoriaz/large/a.jpg");
    assert.equal(sans.photos?.length, 2);
    const [inconnu] = skiPlanetListings({ ...SNOW, photo: null }, SEUL, AVORIAZ);
    assert.deepEqual([inconnu.photo, inconnu.photos], [null, null]);
  });

  it("sa description, entre la croix et le diaporama", () => {
    const d = lireDescriptionLogement(PANNEAU);
    assert.ok(d?.startsWith("Superficie d'environ 33 m² . 7ème étage.") || d?.startsWith("Superficie d'environ 33 m²."), d ?? "");
    assert.match(d ?? "", /Kitchenette avec lave-vaisselle.*Balcon\. Niveau 1 : Chambre mezzanine avec lit simple\. Chambre avec lit double\.$/);
    assert.equal(lireDescriptionLogement("<p>rien</p>"), null);
  });

  it("la description et les équipements qu'elle nomme passent à l'annonce, les autres restent inconnus", () => {
    const desc = (id: string) => (id === "69622" ? lireDescriptionLogement(PANNEAU) : null);
    const [l] = skiPlanetListings(SNOW, SEUL, AVORIAZ, null, undefined, desc);
    assert.match(l.description ?? "", /^Superficie/);
    const oui = (l.amenities ?? []).filter((e) => e.valeur === "oui").map((e) => e.cle);
    assert.deepEqual(oui, ["balcon", "laveVaisselle"]);
    assert.equal(l.amenities?.some((e) => e.valeur === "non"), false);
    const [sans] = skiPlanetListings(SNOW, SEUL, AVORIAZ);
    assert.deepEqual([sans.description, sans.amenities], [undefined, undefined]);
  });
});

describe("Ski-Planet : le panneau des logements, lu en tâche de fond", () => {
  // Réponse réelle du 3 octobre 2026 : logement 76147, Résidence le Cervin (La Plagne).
  const PANNEAU = fx("sp-infos-logement-76147.html");
  // Une page de défi, aux marques que les autres collecteurs lisent (`hometogo.ts`, `gites.server.ts`).
  const DEFI = "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>challenges.cloudflare.com</body></html>";

  it("un panneau se reconnaît à sa croix de fermeture ; un défi, une page d'erreur n'en sont pas", () => {
    const p = lirePanneau(PANNEAU);
    assert.ok(p, "le panneau relevé");
    assert.deepEqual(p.photos, lirePhotosLogement(PANNEAU));
    assert.equal(p.description, lireDescriptionLogement(PANNEAU));
    assert.equal(lirePanneau(DEFI), null);
    assert.equal(lirePanneau("<html><title>Erreur</title><p>rien</p></html>"), null);
    assert.equal(defiAntiRobot(DEFI), true);
    assert.equal(defiAntiRobot("<title>Attention Required! | Cloudflare</title>"), true);
    // Turnstile seul, sans le titre du défi : son script vient de `challenges.cloudflare.com`.
    assert.equal(defiAntiRobot('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>'), true);
    assert.equal(defiAntiRobot(PANNEAU), false);
  });

  it("ce qui se garde trente jours est ce que l'annonce porte quand le panneau est lu : description, équipements, sans fiche ; et ses photos", () => {
    const p = lirePanneau(PANNEAU)!;
    const [l] = skiPlanetListings(SNOW, SEUL, AVORIAZ, null, undefined, () => p.description);
    const lu = lectureDuPanneau(p);
    assert.equal(lu.contenu.description, l.description);
    assert.deepEqual(lu.contenu.amenities, l.amenities);
    assert.deepEqual(lu.contenu.photos, p.photos);
    // Pas de fiche, ni gardée ni sur l'annonce : une fiche sans liste tairait
    // les équipements que la description nomme.
    assert.equal("fiche" in lu, false);
    assert.equal("fiche" in l, false);
    // Un panneau sans description ni photo ne laisse rien à garder.
    assert.deepEqual(lectureDuPanneau({ photos: [], description: null }), {
      contenu: { description: null, photos: null, amenities: null },
    });
  });

  const logements: PanneauALire[] = ["1", "2", "3", "4"].map((id) => ({ id }));
  /** Une porte qui répond `reponses` dans l'ordre (une `Error` lève) et note ce qui part et ce qui se garde. */
  function porte(reponses: (string | null | Error)[], p: Partial<PorteSuitePanneaux> = {}) {
    const partis: string[] = [];
    const gardes: string[] = [];
    const porte: PorteSuitePanneaux = {
      lire: async (l) => {
        partis.push(l.id);
        const r = reponses.length ? reponses.shift()! : PANNEAU;
        if (r instanceof Error) throw r;
        return r;
      },
      dejaLu: () => false,
      arret: () => null,
      garder: (l, lu) => {
        assert.match(lu.description ?? "", /^Superficie/);
        gardes.push(l.id);
      },
      ...p,
    };
    return { porte, partis, gardes };
  }

  it("un panneau à la fois, gardé, au plus `max` par recherche", async () => {
    const { porte: p, partis, gardes } = porte([]);
    const r = await lireSuitePanneaux(logements, p, 2);
    assert.deepEqual(partis, ["1", "2"]);
    assert.deepEqual(gardes, ["1", "2"]);
    assert.match(r.arret ?? "", /2 panneaux demandés/);
  });

  it("un refus (403 du défi, 429) arrête tout, sans nouvel essai, et se rend", async () => {
    const { porte: p, partis, gardes } = porte([PANNEAU, new Error("HTTP 403 (défi anti-robot) — pause 45 s")]);
    const r = await lireSuitePanneaux(logements, p, 50);
    assert.deepEqual(partis, ["1", "2"]);
    assert.deepEqual(gardes, ["1"]);
    assert.equal(r.erreur, "HTTP 403 (défi anti-robot) — pause 45 s");
    assert.equal(r.defi, false);
  });

  it("un défi servi en 200 est reconnu et arrête la passe, sans rien garder", async () => {
    const { porte: p, partis, gardes } = porte([DEFI]);
    const r = await lireSuitePanneaux(logements, p, 50);
    assert.deepEqual([partis, gardes], [["1"], []]);
    assert.equal(r.defi, true);
    assert.equal(r.arret, "panneau 1 : défi anti-robot");
  });

  it("une réponse qui n'est pas un panneau arrête aussi, sans se noter comme un panneau vide", async () => {
    const { porte: p, gardes } = porte(["<html><p>Maintenance</p></html>"]);
    const r = await lireSuitePanneaux(logements, p, 50);
    assert.deepEqual(gardes, []);
    assert.equal(r.defi, false);
    assert.match(r.arret ?? "", /n'est pas un panneau/);
  });

  it("cède à une nouvelle recherche, avant un panneau ou pendant l'attente de son tour", async () => {
    let tours = 0;
    const avant = porte([], { arret: () => (++tours > 1 ? "une nouvelle recherche est partie" : null) });
    assert.equal((await lireSuitePanneaux(logements, avant.porte, 50)).arret, "une nouvelle recherche est partie");
    assert.deepEqual(avant.partis, ["1"]);
    const pendant = porte([null]);
    const r = await lireSuitePanneaux(logements, pendant.porte, 50);
    assert.deepEqual([r.lus, r.demandes, r.arret], [0, 0, "la suite a cédé"]);
  });

  it("un panneau déjà lu ou gardé ne part pas", async () => {
    const { porte: p, partis } = porte([], { dejaLu: (l) => l.id !== "3" });
    const r = await lireSuitePanneaux(logements, p, 50);
    assert.deepEqual(partis, ["3"]);
    assert.deepEqual([r.lus, r.demandes, r.arret], [1, 1, null]);
  });
});
