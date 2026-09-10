/**
 * Relevé Skitrack live 2026-09-03 — Les 2 Alpes, 6–13 fév. 2027, 8 pers.
 * Totaux de séjour constatés uniquement. Pas d’invention, pas d’« à partir de ».
 * Booking : 16 offres relevées, aucun nom conservé dans le dump (page anti-bot).
 * Hôtel Airbnb 3 901 € écarté (tuile « Hôtel · Les Deux Alpes »).
 * Les Capucines (Hautes-Alpes) écarté : hors 2 Alpes.
 */

import { attachAccess } from "./access";
import type { DomainVerdict } from "./domainFit";
import { stationById } from "./stations";

export type Listing = {
  id: string;
  stationId: string;
  title: string;
  source: "Airbnb" | "Gîtes de France" | "Booking" | "Abritel" | "Centrale";
  total: number;
  currency: "EUR";
  guests: number | null;
  bedrooms: number | null;
  available: true;
  photo: string | null;
  url: string | null;
  lat: number | null;
  lon: number | null;
  distToSlopesM?: number | null;
  locality?: string | null;
  placeName?: string | null;
  distToPlaceM?: number | null;
  distToLiftM?: number | null;
  liftName?: string | null;
  liftKind?: string | null;
  liftLat?: number | null;
  liftLon?: number | null;
  liftOtherLat?: number | null;
  liftOtherLon?: number | null;
  domainFit?: DomainVerdict;
  nearestDomainId?: string | null;
  nearestDomainName?: string | null;
  distToNearestDomainM?: number | null;
  winterBarrier?: string | null;
  searchedLiftM?: number | null;
  searchedLiftName?: string | null;
  proven: string;
};

export const RELEVE_2A: Listing[] = [
  {
    id: "38G40102",
    stationId: "les-2-alpes",
    title: "La Citriere",
    source: "Gîtes de France",
    total: 727.44,
    currency: "EUR",
    guests: 9,
    bedrooms: 3,
    available: true,
    photo:
      "https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/375882/375882-0_40102_c109e38976ae7b07a7efd2a037248d58.jpg?itok=SCRM7eVw",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/la-citriere-38g40102?adults=8&children=0&infants=0&date-start=2027-02-06&date-end=2027-02-13",
    lat: null,
    lon: null,
    proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers.",
  },
  {
    id: "38G550149",
    stationId: "les-2-alpes",
    title: "magnimon 2",
    source: "Gîtes de France",
    total: 1551.44,
    currency: "EUR",
    guests: 8,
    bedrooms: 2,
    available: true,
    photo:
      "https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/376727/376727-0_550149_e6ee94947831b872f33cf22752775f79.jpg?itok=GIsFdEma",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/magnimon-2-38g550149?adults=8&children=0&infants=0&date-start=2027-02-06&date-end=2027-02-13",
    lat: null,
    lon: null,
    proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers.",
  },
  {
    id: "38G285102",
    stationId: "les-2-alpes",
    title: "de l'ours brun",
    source: "Gîtes de France",
    total: 1838.4,
    currency: "EUR",
    guests: 12,
    bedrooms: 3,
    available: true,
    photo:
      "https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/375470/375470-0_285102_8f9fecec9702c9bf0f69337e2ba99a5d.jpg?itok=5qs_sIzd",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/de-lours-brun-38g285102?adults=8&children=0&infants=0&date-start=2027-02-06&date-end=2027-02-13",
    lat: null,
    lon: null,
    proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers.",
  },
  {
    id: "38G52200",
    stationId: "les-2-alpes",
    title: "Les Feuillardiers",
    source: "Gîtes de France",
    total: 1898.4,
    currency: "EUR",
    guests: 8,
    bedrooms: 4,
    available: true,
    photo:
      "https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/383787/383787-0_52200_39196a00afcf5ba88d2816109d529488.jpg?itok=gf68L4Ge",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/les-feuillardiers-38g52200?adults=8&children=0&infants=0&date-start=2027-02-06&date-end=2027-02-13",
    lat: null,
    lon: null,
    proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers.",
  },
  {
    id: "38G52010",
    stationId: "les-2-alpes",
    title: "Le Louison et Charlotte",
    source: "Gîtes de France",
    total: 1938.4,
    currency: "EUR",
    guests: 10,
    bedrooms: 4,
    available: true,
    photo:
      "https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/451671/451671-0_52010_6995d0588db964b98.jpg?itok=uphgbXLD",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/le-louison-et-charlotte-38g52010?adults=8&children=0&infants=0&date-start=2027-02-06&date-end=2027-02-13",
    lat: null,
    lon: null,
    proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers.",
  },
  {
    id: "violettes-49",
    stationId: "les-2-alpes",
    title: "LES VIOLETTES N°49",
    source: "Centrale",
    total: 2215,
    currency: "EUR",
    guests: 8,
    bedrooms: null,
    available: true,
    photo:
      "https://reservation.les2alpes.com/medias/images/prestations/_clients_223886005_photos_50l_5115204.jpg",
    url: "https://reservation.les2alpes.com/les-violettes-n49-appartement-8-personnes-les-2-alpes.html",
    lat: null,
    lon: null,
    proven: "station-web Ingénie 2026-09-03, total fiche 8 pers. 6–13 fév. 2027.",
  },
  {
    id: "abnb-6-8-cosy",
    stationId: "les-2-alpes",
    title: "Les Deux-Alpes, appartement 6-8 pers, cosy, calme",
    source: "Airbnb",
    total: 2231,
    currency: "EUR",
    guests: null,
    bedrooms: 3,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/miso/Hosting-27623894/original/f09c2e09-9c61-4a8a-a3a2-d7481a14b78e.jpeg",
    url: null,
    lat: 45.022,
    lon: 6.1247,
    proven: "StaySearchResult live 2026-09-03, 2 231 € au total.",
  },
  {
    id: "p2115294",
    stationId: "les-2-alpes",
    title: "Duplex spacieux aux Deux Alpes, 3 pièces",
    source: "Abritel",
    total: 2334.49,
    currency: "EUR",
    guests: 8,
    bedrooms: 2,
    available: true,
    photo:
      "https://q-xx.bstatic.com/xdata/images/hotel/max600/884446831.jpg?k=ac60d86c05d4a0c0794d9eedf569f4efbbe842cc053efe87f54defc54399b5cc&o=&a=1311119",
    url: "https://www.abritel.fr/location-vacances/p2115294?startDate=2027-02-06&chkin=2027-02-06&endDate=2027-02-13&chkout=2027-02-13&adults=8&children=0",
    lat: null,
    lon: null,
    proven: "vrbo-web getResultList 2026-09-03, total 2 334,49 €.",
  },
  {
    id: "edelweiss-vacanceole",
    stationId: "les-2-alpes",
    title: "Vacancéole - l'Edelweiss-",
    source: "Centrale",
    total: 2430,
    currency: "EUR",
    guests: 8,
    bedrooms: null,
    available: true,
    photo:
      "https://reservation.les2alpes.com/medias/images/prestations/les-deux-alpes-l-edelweiss-exterieur-appartement-2pc8-sejour-03-0-2431913.jpg",
    url: "https://reservation.les2alpes.com/vacanceole-l-edelweiss-appartement-2-pieces-cabine-8-personnes-les-2-alpes.html",
    lat: null,
    lon: null,
    proven: "station-web Ingénie 2026-09-03, total fiche 8 pers. 6–13 fév. 2027.",
  },
  {
    id: "38G20200",
    stationId: "les-2-alpes",
    title: "CHALET MARADRI",
    source: "Gîtes de France",
    total: 2448.4,
    currency: "EUR",
    guests: 8,
    bedrooms: 3,
    available: true,
    photo:
      "https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/374813/374813-0_20200_44c30eaf3b432e66e8d5bab5dfbfda23.jpg?itok=YdhvFvHL",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/chalet-maradri-38g20200?adults=8&children=0&infants=0&date-start=2027-02-06&date-end=2027-02-13",
    lat: null,
    lon: null,
    proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers.",
  },
  {
    id: "jandri-2s05",
    stationId: "les-2-alpes",
    title: "LE JANDRI BELLE ETOILE N°2S05/2S06",
    source: "Centrale",
    total: 2479,
    currency: "EUR",
    guests: 9,
    bedrooms: null,
    available: true,
    photo:
      "https://reservation.les2alpes.com/medias/images/prestations/le-jandri-2s05-06-les-2-alpes-1800-appartement-9-personnes-4047762.jpg",
    url: "https://reservation.les2alpes.com/le-jandri-belle-etoile-n2s05-2s06-appartement-9-personnes-les-2-alpes.html",
    lat: null,
    lon: null,
    proven: "station-web Ingénie 2026-09-03, total fiche 9 pers. 6–13 fév. 2027.",
  },
  {
    id: "olympe-11",
    stationId: "les-2-alpes",
    title: "L'OLYMPE N°11",
    source: "Centrale",
    total: 2505,
    currency: "EUR",
    guests: 8,
    bedrooms: null,
    available: true,
    photo:
      "https://reservation.les2alpes.com/medias/images/prestations/2030906-l_olympe_n11_10.jpeg",
    url: "https://reservation.les2alpes.com/l-olympe-n11-appartement-8-personnes-les-2-alpes.html",
    lat: null,
    lon: null,
    proven: "station-web Ingénie 2026-09-03, total fiche 8 pers. 6–13 fév. 2027.",
  },
  {
    id: "abnb-8p-ski",
    stationId: "les-2-alpes",
    title: "Grand appartement chaleureux Ski aux pieds 8p 63m2",
    source: "Airbnb",
    total: 2694,
    currency: "EUR",
    guests: null,
    bedrooms: 3,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/hosting/Hosting-1757046953983158073/original/2f989533-ba5c-40ee-8701-eae2ab2a7052.jpeg",
    url: null,
    lat: 45.0162,
    lon: 6.1286,
    proven: "StaySearchResult live 2026-09-03, 2 694 € au total (2 967 € barré ignoré).",
  },
  {
    id: "abnb-venosc",
    stationId: "les-2-alpes",
    title: "Les 2 Alpes-Venosc / SPA / Piscine",
    source: "Airbnb",
    total: 3418,
    currency: "EUR",
    guests: null,
    bedrooms: 3,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/miso/Hosting-1025964351078151795/original/a0762556-9450-43d4-8e37-cebe2c3c0553.jpeg",
    url: null,
    lat: 44.98955,
    lon: 6.11537,
    proven: "StaySearchResult live 2026-09-03, 3 418 € au total.",
  },
  {
    id: "abnb-jardin-alpin",
    stationId: "les-2-alpes",
    title: "Le Jardin Alpin : Les 2 Alpes",
    source: "Airbnb",
    total: 3469,
    currency: "EUR",
    guests: null,
    bedrooms: 4,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/19655484-1232-4234-9f94-133a8df1a28d.jpg",
    url: null,
    lat: 45.0198,
    lon: 6.1273,
    proven: "StaySearchResult live 2026-09-03, 3 469 € au total.",
  },
  {
    id: "abnb-canopee",
    stationId: "les-2-alpes",
    title: "Appartement indépendant dans chalet Canopée",
    source: "Airbnb",
    total: 3619,
    currency: "EUR",
    guests: null,
    bedrooms: 3,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/hosting/Hosting-1617235481255915827/original/ed90f3e6-7cf4-40cf-8309-12ca3583e2da.jpeg",
    url: null,
    lat: 45.0098,
    lon: 6.1222,
    proven: "StaySearchResult live 2026-09-03, 3 619 € au total.",
  },
  {
    id: "38G253122",
    stationId: "les-2-alpes",
    title: "Gîte Copains comme Cochons",
    source: "Gîtes de France",
    total: 4261.52,
    currency: "EUR",
    guests: 14,
    bedrooms: 7,
    available: true,
    photo: "https://widget-fngf.itea.fr/photos/gites38/G/photo33/253122.jpg",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/copains-comme-cochons-38g253122",
    lat: null,
    lon: null,
    proven: "Devis ITEA 2026-09-03, dates 2027-02-06/13, 8 pers. Pas 1 330 €.",
  },
  {
    id: "abnb-mariande",
    stationId: "les-2-alpes",
    title: "Chalet Petite Mariande 4 CH 4 SDB",
    source: "Airbnb",
    total: 4897,
    currency: "EUR",
    guests: null,
    bedrooms: 4,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/hosting/Hosting-1528379097770376948/original/54ef41a2-9bd1-4d9c-accc-8dc46e6d88ac.jpeg",
    url: null,
    lat: 45.0032,
    lon: 6.1183,
    proven: "StaySearchResult live 2026-09-03, 4 897 € au total.",
  },
  {
    id: "abnb-10p",
    stationId: "les-2-alpes",
    title: "Appartement 10 P, 4 chambres, 4 SDB, pied de piste",
    source: "Airbnb",
    total: 5420,
    currency: "EUR",
    guests: null,
    bedrooms: 4,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/hosting/Hosting-1570401609160417521/original/85a6f301-7243-4fb7-8734-bb27c18e0e4c.jpeg",
    url: null,
    lat: 45.01711,
    lon: 6.13018,
    proven: "StaySearchResult live 2026-09-03, 5 420 € au total.",
  },
  {
    id: "abnb-standing-95",
    stationId: "les-2-alpes",
    title: "Appartement standing 95m2 au pied des pistes",
    source: "Airbnb",
    total: 5568,
    currency: "EUR",
    guests: null,
    bedrooms: 4,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6MTI3MDI5NzA3ODg4MjcxMTg2Nw%3D%3D/original/9f943686-ca09-4ef4-aa4c-8cdd21d1af19.jpeg",
    url: null,
    lat: 45.0223,
    lon: 6.1239,
    proven: "StaySearchResult live 2026-09-03, 5 568 € au total.",
  },
  {
    id: "abnb-13-15",
    stationId: "les-2-alpes",
    title: "Grand appartement pied des pistes 13-15 personnes",
    source: "Airbnb",
    total: 5805,
    currency: "EUR",
    guests: null,
    bedrooms: 5,
    available: true,
    photo:
      "https://a0.muscache.com/im/pictures/hosting/Hosting-1640421390683598929/original/ddcf2174-51c8-4ebe-b7ff-740129fe1907.jpeg",
    url: null,
    lat: 45.01649351471307,
    lon: 6.130100520955103,
    proven: "StaySearchResult live 2026-09-03, 5 805 € au total. Pas l’hôtel 3 901 €.",
  },
];

export function listingsForStay(stationId: string, guests: number, bedrooms: number): Listing[] {
  const station = stationById(stationId);
  return RELEVE_2A.filter((l) => {
    if (l.stationId !== stationId) return false;
    if (l.guests != null && l.guests < guests) return false;
    if (bedrooms > 0 && l.bedrooms != null && l.bedrooms < bedrooms) return false;
    return true;
  }).map((l) => (station ? attachAccess(l, station) : l));
}

export function listingById(id: string): Listing | undefined {
  const row = RELEVE_2A.find((l) => l.id === id);
  if (!row) return undefined;
  const station = stationById(row.stationId);
  return station ? attachAccess(row, station) : row;
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}
