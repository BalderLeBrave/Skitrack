/**
 * Maeva (maeva.com, groupe Pierre & Vacances) : résidences de tourisme
 * (Pierre & Vacances, « maeva sélection », Belambra, Odalys, Lagrange…),
 * appartements de particuliers gérés par les agences « maeva Home », et
 * locations de particuliers d'autres fournisseurs, anonymes sur le site.
 *
 * Partie pure : requêtes et lecture des réponses, sans réseau. Le relevé est
 * dans `maeva.server.ts`, les destinations du site pour chaque station
 * Skitrack dans `couverture.ts`.
 *
 * Étude du 26 septembre 2026 (Avoriaz, 6→13/02/2027, 2 puis 6 adultes ; Val
 * Thorens pour la pagination) :
 * - la recherche est la requête que la page de résultats fait elle-même :
 *   `POST /fr-fr/assets/dm.php?AJAX_NEW_DM=1&ACTION=recherche_resultats`,
 *   formulaire urlencodé, réponse JSON. HTTP simple : ni cookie, ni jeton, ni
 *   défi ; Cloudflare devant, sans blocage en 65 requêtes. robots.txt exclut
 *   ces adresses : la politique du dépôt (robots lu, journalisé, extraction
 *   quand même) est celle du propriétaire ;
 * - par résidence : position publiée, type, note ; par logement : total du
 *   séjour aux dates (le tarif le moins cher), capacité, typologie, photos,
 *   lien daté, dates publiées. Le serveur ne rend que les logements d'au moins
 *   autant de places que de voyageurs, 30 résidences par page. Le total ne
 *   comprend ni la taxe de séjour, ni les frais de dossier ;
 * - catalogue FRANCE : tous les logements, « Logement seul ». Catalogue SKI :
 *   un logement par résidence, avec ses formules ski (« Hébergement +
 *   forfait »), dont le site ne publie qu'un prix par personne ;
 * - peu ou pas de résultats dans la station : le site étend la recherche aux
 *   stations voisines sans le dire. Seules les résidences des destinations
 *   maeva de la station Skitrack sont gardées.
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";

export const MAEVA_SITE = "https://www.maeva.com";
export const MAEVA_RECHERCHE = `${MAEVA_SITE}/fr-fr/assets/dm.php`;
/** Résidences par page, publié par le site (`nb_result.defaut`). */
export const PAR_PAGE = 30;
/** Borne de sûreté : Val Thorens, la plus grande mesurée, en a sept. */
export const PAGES_MAX = 10;

export type Catalogue = "FRANCE" | "SKI";

/* ---------- Requêtes ---------- */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function adultes(input: LiveSearchInput): number {
  return Math.max(1, Math.min(40, Math.trunc(input.guests) || 1));
}

/** Aplatit un objet comme `toQueryString` du site : `params[nbPaxDetail][adultes]=2`. */
function aplatir(o: Record<string, unknown>, chemin: string[] = [], out: Array<[string, string]> = []): Array<[string, string]> {
  for (const [k, v] of Object.entries(o)) {
    const c = [...chemin, k];
    if (v && typeof v === "object") aplatir(v as Record<string, unknown>, c, out);
    else out.push([c.length === 1 ? c[0] : `${c[0]}[${c.slice(1).join("][")}]`, String(v)]);
  }
  return out;
}

/**
 * La recherche d'une destination maeva (`station_cle`) aux dates, pour
 * `guests` adultes, page `page`, dans un catalogue. Les dates partent dans
 * `params[var_calendarDateDebut|Fin]` (arrivée, départ), comme le moteur du
 * site : le `date_fin` d'une adresse ne dit pas la même chose selon le
 * catalogue.
 */
export function requeteRecherche(
  input: LiveSearchInput,
  stationCle: number,
  opts: { page?: number; catalogue?: Catalogue } = {},
): { url: string; corps: string; entetes: Record<string, string> } {
  if (!DATE.test(input.checkIn) || !DATE.test(input.checkOut)) throw new Error("dates illisibles");
  if (!Number.isInteger(stationCle) || stationCle <= 0) throw new Error("station_cle illisible");
  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const ski = opts.catalogue === "SKI";
  const pax = adultes(input);
  const q = ["acces_direct=1"];
  if (ski) q.push("station_activite_cle=225");
  q.push(`date_debut=${input.checkIn}`, `date_fin=${input.checkOut}`, `nb_adults=${pax}`, "trier_par=zerank", `station_cle=${stationCle}`, `page=${page}`);
  const oqs = `${q.join("&")}&MB=MAEVA&noSession=1${ski ? "" : "&station_activite_cle=0"}&CATALOGUE=${ski ? "SKI" : "FRANCE"}&FORCE_CATALOGUE=`;
  const url = `${MAEVA_RECHERCHE}?AJAX_NEW_DM=1&ACTION=recherche_resultats&initiator=btn_rechercher&${oqs}&opeMkt=0&mapFull=false&clusterInit=false${ski ? "&station_activite_cle=225" : ""}&force_catalogue=`;
  const corps = {
    descente_seo: false,
    url_directe: `/fr-fr/searchlist.php?&${q.join("&")}`,
    search_only: false,
    params: {
      max_pax: 40,
      opeMkt: 0,
      mode_oboo: "destination",
      os_var_obooformule: -1,
      search_launched: true,
      trier_par: "zerank",
      var_oboobounds: false,
      var_etendre_mode: "",
      var_obookm: -1,
      var_oboomin: -1,
      var_oboosearch: `${stationCle}|station`,
      var_oboosearchtxt: input.stationName,
      var_calendarDateFin: input.checkOut,
      var_calendarDateDebut: input.checkIn,
      var_date_flex: 0,
      var_sch_personnes: pax,
      nbPaxDetail: { adultes: pax, enfants: 0, babies: 0 },
      var_pet_pax: false,
      var_fournisseur_responsable_cle: 0,
      var_fournisseur_cle: 0,
      station_libelle: "",
      customParams: "",
      num_page: page,
      saperlipopette: 0,
    },
    // Le site redemande les filtres à la première page, pas en changeant de page.
    get_filtres: page === 1 ? 1 : 0,
    is_init: page === 1,
    fromMap: false,
  };
  return {
    url,
    corps: aplatir(corps).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&"),
    entetes: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      accept: "application/json, text/javascript, */*; q=0.01",
      origin: MAEVA_SITE,
      referer: `${MAEVA_SITE}/fr-fr/searchlist.php`,
      "x-requested-with": "XMLHttpRequest",
    },
  };
}

/** Les pages à lire pour un total publié (`total` compte les résidences), bornées. */
export function pagesAParcourir(total: number | null, parPage = PAR_PAGE): number {
  if (total == null || !Number.isFinite(total) || total <= 0) return 1;
  return Math.min(PAGES_MAX, Math.max(1, Math.ceil(total / parPage)));
}

/* ---------- Lecture ---------- */

export type FormuleMaeva = { formule: string; nom: string; prixParPersonne: number };

export type ProduitMaeva = {
  produitCle: string;
  libelle: string;
  /** Typologie publiée : « Studio », « 2 Pièces », « Chambres d'Hôtel »… */
  typeProduit: string | null;
  places: number | null;
  chambres: number | null;
  /** Prix publié : total du séjour, ou prix par personne si `forfaitImpose`. */
  prix: number | null;
  /** « Logement seul », « Hébergement + Forfait »… */
  pension: string | null;
  /** Ce que le site écrit après le prix : « Logement seul », « pers. / 7 nuits ». */
  pensionComplete: string | null;
  /** Vendu seulement en formule ski (`forcePaki`) : `prix` est alors par personne. */
  forfaitImpose: boolean;
  formule: string | null;
  /** Formules ski proposées en plus (catalogue SKI) : prix par personne. */
  formules: FormuleMaeva[];
  debut: string | null;
  fin: string | null;
  nuits: number | null;
  dispo: boolean;
  photos: string[];
  lien: string | null;
};

export type ResidenceMaeva = {
  grpResCle: string;
  nom: string;
  /** Type publié de l'établissement : « Résidence de Tourisme », « Location de particulier »… */
  type: string | null;
  typeCle: string | null;
  lat: number | null;
  lon: number | null;
  stationCle: number | null;
  lieu: string | null;
  note: number | null;
  avis: number | null;
  lien: string | null;
  photos: string[];
  produits: ProduitMaeva[];
};

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function decoder(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&euro;/g, "€")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function texte(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = decoder(String(v).replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]*>/g, " "))
    .replace(/★+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Le site écrit parfois la chaîne « null ».
  return s && s !== "null" && s !== "undefined" ? s : null;
}

function nombre(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function entier(v: unknown, max = 50): number | null {
  const n = nombre(v);
  return n != null && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

function coord(v: unknown): number | null {
  const n = nombre(v);
  return n != null && n !== 0 && Math.abs(n) <= 180 ? n : null;
}

function positif(v: unknown): number | null {
  const n = nombre(v);
  return n != null && n > 0 ? n : null;
}

function urls(v: unknown): string[] {
  if (typeof v === "string") return v.startsWith("http") ? [v] : [];
  if (!Array.isArray(v)) return [];
  return v.filter((u): u is string => typeof u === "string" && u.startsWith("http"));
}

function lireProduit(p: Record<string, unknown>): ProduitMaeva | null {
  const cle = texte(p.produit_cle);
  if (!cle || !/^\d+$/.test(cle)) return null;
  const d = obj(p.dates);
  const formules: FormuleMaeva[] = [];
  // `pakis` vaut ["missing"] quand la recherche n'a pas calculé les formules.
  for (const k of Array.isArray(p.pakis) ? p.pakis : []) {
    const f = obj(k);
    const prix = positif(f?.prix);
    const formule = texte(f?.formule);
    if (f && prix != null && formule) formules.push({ formule, nom: texte(f.nom) ?? "", prixParPersonne: prix });
  }
  return {
    produitCle: cle,
    libelle: texte(p.produit_libelle) ?? "",
    typeProduit: texte(p.produit_type_libelle),
    places: entier(p.produit_nb_places),
    chambres: entier(p.produit_nb_chambres),
    prix: positif(p.prix),
    pension: texte(p.pension_libelle),
    pensionComplete: texte(p.pension_libelle_complete),
    forfaitImpose: Number(p.forcePaki) === 1,
    formule: texte(p.formule),
    formules,
    debut: texte(d?.mysql_debut),
    fin: texte(d?.mysql_fin),
    nuits: entier(d?.nuits, 400),
    dispo: d != null && d.is_dispo !== false,
    photos: urls(p.produit_photo),
    lien: typeof d?.seo === "string" && d.seo.startsWith("https://www.maeva.com/") ? d.seo : null,
  };
}

/** Une page de résultats : résidences, total de résidences publié, résultats reçus. */
export function lireRecherche(json: unknown): { residences: ResidenceMaeva[]; total: number | null; recus: number } {
  const j = obj(json);
  const bruts = Array.isArray(j?.resultats) ? j.resultats : [];
  const residences: ResidenceMaeva[] = [];
  for (const b of bruts) {
    const r = obj(b);
    const cle = texte(r?.grp_res_cle);
    const nom = texte(r?.groupe_res_libelle_text) ?? texte(r?.groupe_res_libelle);
    if (!r || !cle || !nom) continue;
    const produits: ProduitMaeva[] = [];
    for (const p of Array.isArray(r.produits) ? r.produits : []) {
      const o = obj(p);
      const lu = o ? lireProduit(o) : null;
      if (lu) produits.push(lu);
    }
    const lien = texte(r.groupe_res_libelle_lien);
    residences.push({
      grpResCle: cle,
      nom,
      type: texte(r.residence_type_libelle),
      typeCle: texte(r.residence_type_cle),
      lat: coord(r.yr),
      lon: coord(r.xr),
      stationCle: entier(r.station_cle, 100_000_000),
      lieu: texte(r.station_name) ?? texte(String(r.residence_region_libelle ?? "").split(" - ")[0]),
      note: positif(r.note),
      avis: entier(r.note_nb, 10_000_000),
      lien: lien?.startsWith("https://www.maeva.com/") ? lien : null,
      photos: urls(r.residence_photo),
      produits,
    });
  }
  return { residences, total: nombre(j?.total), recus: bruts.length };
}

/* ---------- Ce que Skitrack garde ---------- */

/** Établissements écartés : Hôtel (258), Camping (409). */
const TYPES_ECARTES: ReadonlySet<string> = new Set(["258", "409"]);
/** Typologies écartées : chambres d'hôtel (Belambra « Tout Compris »), chambres d'hôtes, emplacements, mobil-homes. */
const TYPOLOGIE_ECARTEE = /chambres?\s+d\W*h[oô]t(?:el|es)|emplacement|mobil[\s-]?home/i;

export function logementGarde(r: Pick<ResidenceMaeva, "typeCle" | "type">, p: Pick<ProduitMaeva, "typeProduit" | "libelle">): boolean {
  if (r.typeCle && TYPES_ECARTES.has(r.typeCle)) return false;
  if (r.type && /^h[oô]tel\b|camping|chambres? d\W*h[oô]tes/i.test(r.type)) return false;
  return !TYPOLOGIE_ECARTEE.test(p.typeProduit ?? "") && !/mobil[\s-]?home|chambres? d\W*h[oô]tes/i.test(p.libelle);
}

/** Pièces publiées par la typologie : « Studio » = 1, « 3 Pièces » = 3 ; autrement rien. */
export function pieces(typeProduit: string | null): number | null {
  if (!typeProduit) return null;
  if (/^studio$/i.test(typeProduit.trim())) return 1;
  const m = typeProduit.trim().match(/^(\d{1,2})\s*pi[eè]ces?$/i);
  return m ? Number(m[1]) : null;
}

/**
 * Chambres : un studio n'en a pas (la recherche y écrit pourtant 1, et 3 pour
 * « Studio 3 Personnes - Confort », quand la fiche publie « Nombre de
 * chambres : 0 ») ; autrement, le nombre publié.
 */
export function chambres(p: Pick<ProduitMaeva, "typeProduit" | "chambres">): number | null {
  return p.typeProduit && /^studio$/i.test(p.typeProduit.trim()) ? 0 : p.chambres;
}

/** « 1 214 » : le montant en euros entiers, espace pour les milliers. */
function euros(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Les annonces d'une résidence. Écartés : une résidence d'une autre
 * destination que `cles` (recherche étendue par le site), un logement publié
 * à d'autres dates ou indisponible, de moins de `guests` places, un hôtel, un
 * camping, des chambres d'hôtel ou d'hôtes.
 *
 * Hébergement seul : `mae-<produit>`, total exact publié. Formule
 * « Hébergement + forfait » (logement vendu seulement ainsi, ou formule
 * proposée en plus au catalogue SKI, `forfaits`) : `mae-<produit>-forfait`,
 * `skiPassIncluded: true`. Le site en publie un prix par personne, calculé
 * pour le nombre d'adultes demandé, qui est celui du groupe : le total du
 * séjour est ce prix fois les adultes (la fiche le confirme : sa remise de
 * dossier vaut 988 = 2 × 494 pour 2 personnes). Il était laissé à 0.
 */
export function maevaListings(
  r: ResidenceMaeva,
  input: LiveSearchInput,
  opts: { cles: readonly number[]; forfaits?: boolean },
): Listing[] {
  if (r.stationCle == null || !opts.cles.includes(r.stationCle)) return [];
  const pax = adultes(input);
  const out: Listing[] = [];
  for (const p of r.produits) {
    if (!logementGarde(r, p)) continue;
    if (p.debut !== input.checkIn || p.fin !== input.checkOut || !p.dispo) continue;
    if (p.places != null && p.places < pax) continue;
    const photos = p.photos.length ? p.photos : r.photos;
    const commun = {
      stationId: input.stationId,
      source: "Maeva" as const,
      title: `${r.nom} — ${p.libelle}`,
      currency: "EUR",
      guests: p.places,
      bedrooms: chambres(p),
      rooms: pieces(p.typeProduit),
      propertyType: r.type ?? p.typeProduit,
      available: true as const,
      photo: photos[0] ?? null,
      photos: photos.length ? photos : null,
      url: p.lien ?? (r.lien ? `${r.lien}?date_debut=${input.checkIn}&date_fin=${input.checkOut}` : null),
      lat: r.lat,
      lon: r.lon,
      locality: r.lieu,
      placeName: r.nom,
      platformId: p.produitCle,
      rating: r.note,
      reviewCount: r.avis,
      proven: `Maeva live ${input.checkIn}→${input.checkOut}`,
    };
    const seul = !p.forfaitImpose && p.pension != null && /logement seul/i.test(p.pension);
    if (seul && p.prix != null) {
      out.push({
        ...commun,
        id: `mae-${p.produitCle}`,
        total: Math.round(p.prix),
        priceLabel: `${euros(p.prix)} € ${(p.pensionComplete ?? p.pension ?? "").toLowerCase()}`.trim(),
        priceIndicative: false,
        skiPassIncluded: false,
      });
    }
    const f2 =
      p.forfaitImpose && p.formule === "2" && p.prix != null
        ? { nom: p.pension ?? "Hébergement + Forfait", prixParPersonne: p.prix }
        : opts.forfaits
          ? p.formules.find((f) => f.formule === "2")
          : undefined;
    if (f2) {
      out.push({
        ...commun,
        id: `mae-${p.produitCle}-forfait`,
        total: Math.round(f2.prixParPersonne * pax),
        priceLabel: `${f2.nom} : ${euros(f2.prixParPersonne)} € / pers.${p.nuits ? ` / ${p.nuits} nuits` : ""} × ${pax} adulte${pax > 1 ? "s" : ""}`,
        priceIndicative: false,
        skiPassIncluded: true,
      });
    }
  }
  return out;
}
