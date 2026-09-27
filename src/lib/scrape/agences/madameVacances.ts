/**
 * Madame Vacances : résidences de tourisme et chalets, publiés sur
 * madamevacances.com (Eurogroup, Chambéry ; réservation par Resalys).
 *
 * Partie pure : adresses des requêtes, lecture des réponses, annonces. Le
 * relevé est dans `madameVacances.server.ts`, la station du site pour chaque
 * station Skitrack dans `couverture.ts`.
 *
 * Étude du 26 septembre 2026 (Les Deux Alpes, 6→13/02/2027, 2 puis 6
 * personnes ; 57 requêtes, toutes en 200, sans défi ni cookie) :
 * - la recherche d'une station (`/recherche/`, HTML) liste les établissements
 *   vendus aux dates, avec leur point GPS, leur type et un prix « dès » par
 *   logement. Elle ne filtre pas sur le nombre de voyageurs. Ses dates
 *   s'écrivent jj/mm/aaaa : en ISO, le site renvoie sans erreur une recherche
 *   non datée, d'où le contrôle des dates renvoyées ;
 * - l'appel AJAX de la fiche (`?method=ajax`, JSON) donne chaque type de
 *   logement : total exact du séjour, capacité, chambres, pièces, photos, ou
 *   « Complet pour cette période ». Il filtre sur la capacité (`nbp`) ;
 * - le total est celui du logement, forfaits de ski jamais compris (ils sont
 *   vendus en option à la réservation). La formule `LOC` a frais de dossier et
 *   taxe de séjour en sus, `LOCT` frais de dossier en sus et taxe incluse ;
 * - en février, les résidences ne vendent que du samedi au samedi ;
 * - robots.txt n'interdit aucun chemin utile. Les mentions légales réservent
 *   le site à un usage personnel : la politique du dépôt (robots lu,
 *   journalisé, extraction quand même) est celle du propriétaire.
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";

export const MV_SITE = "https://www.madamevacances.com";

/* ---------- Dates et voyageurs ---------- */

/** « 2027-02-06 » → « 06/02/2027 », la seule forme que la recherche comprend. */
export function dateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`date illisible : ${iso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new Error(`date inexistante : ${iso}`);
  }
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** « 06/02/2027 » → « 2027-02-06 », ou `null`. */
function dateIso(fr: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((fr ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function nuits(input: Pick<LiveSearchInput, "checkIn" | "checkOut">): number {
  dateFr(input.checkIn);
  dateFr(input.checkOut);
  const n = Math.round((Date.parse(`${input.checkOut}T00:00:00Z`) - Date.parse(`${input.checkIn}T00:00:00Z`)) / 86_400_000);
  if (!(n > 0)) throw new Error("départ avant l'arrivée");
  return n;
}

/** Voyageurs, bornés comme le sélecteur du site : de 1 à 16. */
export function voyageurs(guests: number): number {
  return Number.isFinite(guests) ? Math.min(16, Math.max(1, Math.trunc(guests))) : 1;
}

/* ---------- Recherche ---------- */

/**
 * La recherche d'une station, avec les champs du formulaire de l'accueil, dans
 * l'ordre où le navigateur les envoie. Pas de pagination : tous les
 * établissements sont dans la page.
 */
export function urlRecherche(input: LiveSearchInput, site: string): string {
  if (!/^\d+$/.test(site)) throw new Error(`station du site illisible : ${site}`);
  nuits(input);
  const champs: Array<[string, string]> = [
    ["id_lieu", site],
    ["total_months", "24"],
    ["id", site],
    ["id2", ""],
    ["callcenter", ""],
    ["force_date", "1"],
    ["univers", ""],
    ["region", ""],
    ["station", site],
    ["date_debut", dateFr(input.checkIn)],
    ["date_fin", dateFr(input.checkOut)],
    ["nbp", String(voyageurs(input.guests))],
    ["id_desti", ""],
  ];
  return `${MV_SITE}/recherche/?${champs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

export type EtablissementMV = {
  /** `init_carte_<id>` ; c'est aussi le `id` de l'appel AJAX. */
  id: string;
  nom: string;
  /** « /locations/france/alpes-du-nord/les-deux-alpes/residence-l-alba/ », ou « /hotels/… ». */
  chemin: string;
  hotel: boolean;
  /** Dernier mot de la ligne « Alpes du Nord, Les Deux Alpes, Appartement » : Appartement, Chalet, Hotel. */
  type: string | null;
  /** La station écrite par le site : « Les Deux Alpes », « Peisey Nancroix ». */
  lieu: string | null;
  lat: number | null;
  lon: number | null;
  /** Dates que le site a vendues pour ce résultat, en ISO. */
  du: string | null;
  au: string | null;
  /** Photos 660x365, adresses absolues, dans l'ordre publié. */
  photos: string[];
};

export type RechercheMV = {
  etablissements: EtablissementMV[];
  /** Dates que la page dit avoir comprises (`#calendrier_debut`, `#calendrier_fin`), telles quelles. */
  debut: string | null;
  fin: string | null;
};

const ENTITES: Readonly<Record<string, string>> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", deg: "°", sup2: "²", euro: "€",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", icirc: "î",
  ocirc: "ô", ucirc: "û", ugrave: "ù", oelig: "œ", laquo: "«", raquo: "»", rsquo: "’",
};

function decoder(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n: string) => ENTITES[n.toLowerCase()] ?? m);
}

function texte(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = decoder(s).replace(/\s+/g, " ").trim();
  return t || null;
}

function nombre(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function coord(s: string | null | undefined): number | null {
  const n = nombre(s);
  return n != null && n !== 0 && Math.abs(n) <= 180 ? n : null;
}

function absolue(u: string): string {
  return /^https?:\/\//.test(u) ? u : `${MV_SITE}${u.startsWith("/") ? "" : "/"}${u}`;
}

/** Les établissements d'une page `/recherche/`, hôtels compris (ils sont marqués). */
export function lireRecherche(html: string): RechercheMV {
  const debut = /<input[^>]*id="calendrier_debut"[^>]*value="([^"]*)"/.exec(html)?.[1] ?? null;
  const fin = /<input[^>]*id="calendrier_fin"[^>]*value="([^"]*)"/.exec(html)?.[1] ?? null;
  const etablissements: EtablissementMV[] = [];
  for (const bloc of html.split('<div class="mix ').slice(1)) {
    const id = /init_carte_(\d+)\(/.exec(bloc)?.[1];
    const chemin = /href="(\/(?:locations|hotels)\/[^"?#]+)/.exec(bloc)?.[1];
    const nom = texte(/style="color: #672080;"[^>]*>([^<]+)/.exec(bloc)?.[1]);
    if (!id || !chemin || !nom) continue;
    const ligne = /<p class="arial font12 font-xs-18[^"]*"[^>]*>([^<]*)</.exec(bloc)?.[1] ?? "";
    const morceaux = ligne.split(",").map((x) => texte(x));
    const attr = (n: string) => new RegExp(`data-${n}="([^"]*)"`).exec(bloc.slice(0, bloc.indexOf(">")))?.[1] ?? null;
    const dates = /du <b>\s*\S+\s+(\d{2}\/\d{2}\/\d{4})\s*<br\s*\/?>\s*<\/b>\s*au <b>\s*\S+\s+(\d{2}\/\d{2}\/\d{4})/.exec(bloc);
    const photos: string[] = [];
    for (const m of bloc.matchAll(/background-image: url\('([^']*\/photos\/etab\/\d+\/660x365\/[^']+)'\)/g)) {
      const u = absolue(m[1]);
      if (!photos.includes(u)) photos.push(u);
    }
    etablissements.push({
      id,
      nom,
      chemin,
      hotel: chemin.startsWith("/hotels/"),
      type: morceaux.length >= 3 ? morceaux[morceaux.length - 1] : null,
      lieu: morceaux.length >= 3 ? morceaux[1] : null,
      lat: coord(attr("lat")),
      lon: coord(attr("lon")),
      du: dateIso(dates?.[1]),
      au: dateIso(dates?.[2]),
      photos,
    });
  }
  return { etablissements, debut, fin };
}

/** La page a compris les dates demandées : elle les renvoie dans son formulaire. */
export function rechercheComprise(r: Pick<RechercheMV, "debut" | "fin">, input: Pick<LiveSearchInput, "checkIn" | "checkOut">): boolean {
  return r.debut === input.checkIn && r.fin === input.checkOut;
}

/** Le résultat porte les dates demandées. Une autre semaine n'est pas une offre pour ce séjour. */
export function datesConformes(e: Pick<EtablissementMV, "du" | "au">, input: Pick<LiveSearchInput, "checkIn" | "checkOut">): boolean {
  return e.du === input.checkIn && e.au === input.checkOut;
}

/** Codes de région du site, pour `id_lieu`. La montagne seule. */
const REGIONS_MV: Readonly<Record<string, string>> = {
  "alpes-du-nord": "16",
  "alpes-du-sud": "18",
  pyrenees: "36",
  "massif-central": "320",
};

/**
 * Un établissement que Skitrack garde : une location de montagne. Ni hôtel
 * (chemin `/hotels/` : « Le Chalet Iona » est un hôtel de classe `chalet`), ni
 * Valjoly (le lac du Nord), ni Chambéry, ni rien hors des quatre régions.
 */
export function etablissementGarde(e: Pick<EtablissementMV, "chemin" | "hotel">): boolean {
  if (e.hotel) return false;
  const m = /^\/locations\/france\/([a-z-]+)\/([a-z0-9-]+)\/[a-z0-9-]+\/$/.exec(e.chemin);
  if (!m || !(m[1] in REGIONS_MV)) return false;
  return m[2] !== "valjoly" && m[2] !== "chambery";
}

/** Les établissements dont il faut lire la fiche : gardés, et vendus aux dates demandées. */
export function aDetailler(r: RechercheMV, input: LiveSearchInput): EtablissementMV[] {
  return r.etablissements.filter((e) => etablissementGarde(e) && datesConformes(e, input));
}

/* ---------- Fiche (appel AJAX) ---------- */

/** Le lien public de la fiche, comme la recherche l'écrit. */
export function lienFiche(chemin: string, input: LiveSearchInput): string {
  return `${MV_SITE}${chemin}?date_debut=${dateFr(input.checkIn)}&duree=${nuits(input)}&nbp=${voyageurs(input.guests)}`;
}

/**
 * L'appel que la fiche envoie elle-même pour recharger ses logements, dates en
 * ISO. Hors des quatre régions connues, la forme minimale, dont la réponse
 * était identique octet pour octet.
 */
export function urlFiche(e: Pick<EtablissementMV, "id" | "chemin">, input: LiveSearchInput, site: string): string {
  if (!/^\d+$/.test(e.id)) throw new Error(`établissement illisible : ${e.id}`);
  nuits(input);
  const region = REGIONS_MV[e.chemin.split("/")[3] ?? ""];
  const nbp = String(voyageurs(input.guests));
  const champs: Array<[string, string]> =
    region && /^\d+$/.test(site)
      ? [
          ["method", "ajax"],
          ["formule", ""],
          ["id", e.id],
          ["id_lieu", `${region},${site},${e.id}`],
          ["total_months_room", "24"],
          ["date_debut", input.checkIn],
          ["date_fin", input.checkOut],
          ["nbp", nbp],
          ["tri", "asc"],
        ]
      : [
          ["method", "ajax"],
          ["id", e.id],
          ["date_debut", input.checkIn],
          ["date_fin", input.checkOut],
          ["nbp", nbp],
        ];
  return `${MV_SITE}${e.chemin}?${champs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/** Les en-têtes que jQuery ajoute à cet appel (l'agent et la langue viennent du relevé). */
export function entetesFiche(e: Pick<EtablissementMV, "chemin">, input: LiveSearchInput): Record<string, string> {
  return { "x-requested-with": "XMLHttpRequest", accept: "*/*", referer: lienFiche(e.chemin, input) };
}

export type LogementMV = {
  /** Le type de logement (`#typo-chambre-<id>`) : c'est un type, pas un appartement désigné. */
  id: string;
  /** « Appartement 3 pièces, 6 personnes ». */
  libelle: string;
  capacite: number | null;
  /** « N Chambre(s) » et « N Chambre cabine » ; 0 pour un studio ou un « 1 pièce » sans chambre. */
  chambres: number | null;
  /** « N pièces » du libellé ; 1 pour un studio. */
  pieces: number | null;
  /** « N Salle de bain » et « N Salle de douche ». */
  sdb: number | null;
  /** Total du séjour, en euros entiers comme le tableau l'affiche ; `null` si complet. */
  total: number | null;
  prixBarre: number | null;
  complet: boolean;
  /** `data-base_product_code` : LOC, LOCT… */
  formule: string | null;
  /** « Conditions standards », « FLEXIBLE Annulation sans frais ». */
  conditions: string | null;
  /** Photos 1000x1000 du type, adresses absolues. */
  photos: string[];
};

export type FicheMV = {
  logements: LogementMV[];
  /** « N types de logements disponibles », le nombre publié. */
  disponibles: number | null;
  nuits: number | null;
  /** Dates que la réponse dit avoir servies, en ISO. */
  du: string | null;
  au: string | null;
};

const VIDE: FicheMV = { logements: [], disponibles: null, nuits: null, du: null, au: null };

function somme(detail: string, re: RegExp): number | null {
  let n: number | null = null;
  for (const m of detail.matchAll(re)) n = (n ?? 0) + Number(m[1]);
  return n;
}

function piecesDe(libelle: string): number | null {
  const p = /(\d+)\s*pi[eè]ces?\b/i.exec(libelle);
  if (p) return Number(p[1]);
  return /\bstudio\b/i.test(libelle) ? 1 : null;
}

function chambresDe(detail: string | null, libelle: string, pieces: number | null): number | null {
  const n = detail ? somme(detail, /(\d+)\s*Chambres?(?:\(s\))?(?:\s+cabines?)?/gi) : null;
  if (n != null) return n;
  // Un studio, un « 1 pièce » : pas de chambre séparée, et le détail n'en publie pas.
  if (detail && (/\bstudio\b/i.test(libelle) || pieces === 1)) return 0;
  return null;
}

/** Les fenêtres des types, par identifiant. */
function fenetres(modal: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of modal.split('<div class="modal fade modal-sticky" id="typo-chambre-').slice(1)) {
    const id = /^(\d+)"/.exec(m)?.[1];
    if (id) out.set(id, m);
  }
  return out;
}

/** La réponse de l'appel AJAX : objet déjà lu ou texte JSON. Une réponse illisible rend une fiche vide. */
export function lireFiche(reponse: unknown): FicheMV {
  let j: unknown = reponse;
  if (typeof reponse === "string") {
    try {
      j = JSON.parse(reponse);
    } catch {
      return { ...VIDE };
    }
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ...VIDE };
  const o = j as Record<string, unknown>;
  const resultat = typeof o.resultat === "string" ? o.resultat : "";
  const modal = typeof o.resultat_modal === "string" ? o.resultat_modal : "";
  if (!resultat) return { ...VIDE };
  const entete = /<b>(\d+) types? de logements? disponibles?<\/b>[^<]*<b>\((\d+) nuits?\)<\/b>/.exec(resultat);
  const arrivee = /\.date_arrivee_html'\)\.html\('([^']*)'\)/.exec(resultat)?.[1];
  const depart = /\.date_depart_html'\)\.html\('([^']*)'\)/.exec(resultat)?.[1];
  const parId = fenetres(modal);
  const logements: LogementMV[] = [];
  for (const ligne of resultat.split('<td class="bold text-uppercase violet border-left-0 max-width-type">').slice(1)) {
    const id = /data-target="#typo-chambre-(\d+)"/.exec(ligne)?.[1];
    const libelle = texte(/<img src="\/img\/assets\/bed\.svg"[^>]*>([^<]*)/.exec(ligne)?.[1]);
    if (!id || !libelle) continue;
    const f = parId.get(id) ?? "";
    const detail = texte(/data-target="#typo-chambre-\d+">\s*([^<]*)<br>/.exec(ligne)?.[1]);
    const complet = /Complet pour cette p[ée]riode/.test(ligne);
    const radio = new RegExp(`<input type="radio" class="option-input radio checkbox_resa_${id}"([^>]*)>`).exec(f)?.[1] ?? "";
    const photos: string[] = [];
    for (const m of f.matchAll(/(?:https:\/\/www\.madamevacances\.com)?\/photos\/etab_room\/\d+\/1000x1000\/[^"'\s)]+/g)) {
      const u = absolue(m[0]);
      if (!photos.includes(u)) photos.push(u);
    }
    const conditionsBrut = /<div class="mt-moins-10 text-right"[^>]*>([\s\S]*?)<\/td>/.exec(ligne)?.[1];
    const pieces = piecesDe(libelle);
    const total = complet ? null : nombre(/<span class="rose bold font26">([\d\s]+)&nbsp;&euro;<\/span>/.exec(ligne)?.[1]);
    logements.push({
      id,
      libelle,
      capacite:
        nombre(/<b class="text-black">(\d+)<\/b>&nbsp;Pers\./.exec(ligne)?.[1]) ??
        nombre(/<b class="text-black[^"]*">(\d+)<\/b>\s*Personnes max\./.exec(f)?.[1]),
      chambres: chambresDe(detail, libelle, pieces),
      pieces,
      sdb: detail ? somme(detail, /(\d+)\s*Salles?\s+de\s+(?:bains?|douches?)/gi) : null,
      total: total != null && total > 0 ? total : null,
      prixBarre: complet ? null : nombre(/<del class="text-gris">([\d\s]+)&nbsp;&euro;<\/del>/.exec(ligne)?.[1]),
      complet,
      formule: texte(/data-base_product_code="([^"]*)"/.exec(radio)?.[1]),
      conditions: conditionsBrut ? texte(conditionsBrut.replace(/<[^>]*>/g, " ")) : null,
      photos,
    });
  }
  return {
    logements,
    disponibles: entete ? Number(entete[1]) : null,
    nuits: entete ? Number(entete[2]) : null,
    du: dateIso(arrivee),
    au: dateIso(depart),
  };
}

/* ---------- Annonces ---------- */

/** Les formules d'hébergement seul relevées : LOC, et LOCT (taxe de séjour incluse). */
const FORMULES_LOCATION: ReadonlySet<string> = new Set(["LOC", "LOCT"]);

/** Les mots de type que le site écrit en tête du libellé. */
const TYPES_PUBLIES = ["Appartement", "Studio", "Chalet", "Maison", "Villa"];

/** Le type publié : le premier mot du libellé s'il en est un, sinon celui de l'établissement. */
export function typePublie(libelle: string, typeEtablissement: string | null): string | null {
  const premier = /^[\s-]*([A-Za-zÀ-ÿ]+)/.exec(libelle)?.[1] ?? "";
  const t = TYPES_PUBLIES.find((x) => x.toLowerCase() === premier.toLowerCase());
  if (t) return t;
  return typeEtablissement && !/^h[oô]tel/i.test(typeEtablissement) ? typeEtablissement : null;
}

/**
 * Le libellé de prix, avec les mots du site : « 4425 € / logt, 7 nuits », le
 * prix barré s'il y en a un, des conditions autres que « Conditions
 * standards », et les frais obligatoires en sus selon la formule.
 */
export function libellePrix(l: Pick<LogementMV, "total" | "prixBarre" | "conditions" | "formule">, n: number): string | null {
  if (l.total == null) return null;
  const parts = [`${l.total} € / logt, ${n} nuits`];
  if (l.prixBarre != null && l.prixBarre > l.total) parts.push(`prix barré ${l.prixBarre} €`);
  if (l.conditions && !/^conditions standards$/i.test(l.conditions)) parts.push(l.conditions);
  if (l.formule === "LOC") parts.push("frais obligatoires en sus : frais de dossier, taxe de séjour");
  else if (l.formule === "LOCT") parts.push("frais obligatoires en sus : frais de dossier (taxe de séjour incluse)");
  return parts.join(" — ");
}

/**
 * Les annonces d'un établissement : une par type de logement vendu aux dates
 * demandées (pas « Complet »), avec son total exact. Rien pour un hôtel, un
 * résultat daté d'une autre semaine, ou une fiche servie pour d'autres dates.
 */
export function madameVacancesListings(e: EtablissementMV, fiche: FicheMV, input: LiveSearchInput): Listing[] {
  if (!etablissementGarde(e) || !datesConformes(e, input)) return [];
  if ((fiche.du && fiche.du !== input.checkIn) || (fiche.au && fiche.au !== input.checkOut)) return [];
  const n = fiche.nuits ?? nuits(input);
  const url = lienFiche(e.chemin, input);
  return fiche.logements
    .filter((l) => !l.complet && l.total != null)
    .map((l) => {
      const photos = l.photos.length ? l.photos : e.photos;
      return {
        id: `mv-${e.id}-${l.id}`,
        stationId: input.stationId,
        title: `${e.nom} — ${l.libelle}`,
        source: "Madame Vacances" as const,
        total: l.total as number,
        currency: "EUR",
        guests: l.capacite,
        bedrooms: l.chambres,
        rooms: l.pieces,
        baths: l.sdb,
        propertyType: typePublie(l.libelle, e.type),
        available: true as const,
        photo: photos[0] ?? null,
        photos: photos.length ? photos : null,
        url,
        lat: e.lat,
        lon: e.lon,
        locality: e.lieu,
        placeName: e.nom,
        priceLabel: libellePrix(l, n),
        priceIndicative: false,
        // Hébergement seul : les forfaits sont une option de la réservation.
        // Une formule inconnue ne permet pas de le dire.
        skiPassIncluded: l.formule != null && FORMULES_LOCATION.has(l.formule) ? false : null,
        platformId: l.id,
        proven: `Madame Vacances live ${input.checkIn}→${input.checkOut}`,
      };
    });
}
