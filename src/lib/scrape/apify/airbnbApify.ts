/**
 * Airbnb par Apify : ce que l'acteur `tri_angle/airbnb-rooms-urls-scraper`
 * rend d'une page `rooms/`, pour les annonces que nos propres lectures
 * laissent incomplètes. Module pur ; le réseau est dans
 * `airbnbApify.server.ts`.
 *
 * Décision du propriétaire du 3 octobre 2026 : Apify pour Airbnb, sur les
 * annonces incomplètes seulement (capacité, chambres, prix, photo ou GPS
 * manquant), proxys d'Apify acceptés, **5 $ au plus par recherche**.
 *
 * Rien n'est deviné : un champ que la sortie ne donne pas sous une forme
 * reconnue reste vide. Les chambres se lisent dans le résumé de la page
 * (« 2 chambres · 3 lits »), comme sur la page elle-même.
 */

/** L'acteur, sous la forme que l'API attend (`~` à la place de `/`). */
export const ACTEUR_APIFY = "tri_angle~airbnb-rooms-urls-scraper";
/**
 * Le prix d'une annonce au palier gratuit, le plus cher (relevé le 3 octobre
 * 2026 : 0,005 $, plus 0,0001 $ par lancement). Un palier supérieur coûte
 * moins : le plafond n'en est que plus sûr.
 */
export const PRIX_ANNONCE_USD = 0.005;
export const PRIX_LANCEMENT_USD = 0.0001;
/** Le plafond de dépense d'une recherche (station, dates, voyageurs). */
export const PLAFOND_RECHERCHE_USD = 5;

export type SejourApify = { checkIn: string; checkOut: string; guests: number };

/** Ce qu'Apify a lu d'une annonce. `null` : la sortie ne le donne pas. */
export type FicheApify = {
  id: string;
  capacity: number | null;
  bedrooms: number | null;
  beds: number | null;
  lat: number | null;
  lon: number | null;
  photo: string | null;
  photos: string[];
  /** Le total du séjour pour les dates et voyageurs demandés, en euros. */
  total: number | null;
  /** Le libellé de prix tel que la sortie l'écrit. */
  priceLabel: string | null;
};

/** Le nombre d'annonces qu'il reste de quoi lire dans le plafond. */
export function annoncesDansLeBudget(depenseUsd: number, plafondUsd = PLAFOND_RECHERCHE_USD): number {
  const reste = plafondUsd - depenseUsd - PRIX_LANCEMENT_USD;
  return reste <= 0 ? 0 : Math.floor(reste / PRIX_ANNONCE_USD + 1e-9);
}

/** L'entrée de l'acteur : les pages `rooms/`, les dates et le groupe, en euros et en français. */
export function entreeApify(ids: readonly string[], sejour: SejourApify): Record<string, unknown> {
  return {
    startUrls: ids.map((id) => ({ url: `https://www.airbnb.fr/rooms/${id}` })),
    checkIn: sejour.checkIn,
    checkOut: sejour.checkOut,
    adults: Math.max(1, Math.trunc(sejour.guests)),
    currency: "EUR",
    locale: "fr-FR",
  };
}

type Objet = Record<string, unknown>;
const objet = (v: unknown): Objet | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Objet) : null);

function entier(v: unknown, min: number, max = 99): number | null {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function coordonnee(v: unknown, borne: number): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= borne && n !== 0 ? n : null;
}

/** Les textes courts de la sortie où Airbnb résume le logement (« 6 voyageurs · 2 chambres · 3 lits »). */
function textesResume(item: Objet): string[] {
  const out: string[] = [];
  const pousser = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const x of v) pousser(objet(x)?.title ?? x);
    else {
      const o = objet(v);
      if (o) for (const k of ["items", "title", "subtitle"]) if (k in o) pousser(o[k]);
    }
  };
  for (const k of ["subDescription", "overview", "roomInfo", "listingOverview", "sharingConfigTitle"]) pousser(item[k]);
  return out;
}

const CHAMBRES = /(\d{1,2})\s*(?:chambres?|bedrooms?)\b/i;
const LITS = /(\d{1,2})\s*(?:lits?|beds?)\b/i;
const STUDIO = /\bstudio\b/i;

/** Le premier entier d'un texte de prix (« 1 234 € », « €1,234 », « 1 234,56 € ») en euros, ou `null`. */
export function montantEuros(texte: unknown): number | null {
  if (typeof texte === "number") return Number.isFinite(texte) && texte > 0 ? texte : null;
  if (typeof texte !== "string" || !/€|eur/i.test(texte)) return null;
  const m = /(\d{1,3}(?:[\s\u00a0\u202f.,]\d{3})*(?:[.,]\d{1,2})?)/.exec(texte);
  if (!m) return null;
  let s = m[1].replace(/[\s\u00a0\u202f]/g, "");
  // « 1.234,56 » ou « 1,234.56 » : le dernier séparateur suivi de 1 ou 2 chiffres est la décimale.
  const dec = /[.,](\d{1,2})$/.exec(s);
  const decimales = dec ? dec[1] : "";
  if (dec) s = s.slice(0, -dec[0].length);
  const n = Number(`${s.replace(/[.,]/g, "")}${decimales ? `.${decimales}` : ""}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Le total du séjour. Seul un montant que la sortie dit total (le total de
 * la ventilation, ou un prix qualifié « au total » / « total ») : un prix à
 * la nuit n'est pas un total de séjour.
 */
function totalSejour(item: Objet): { total: number; label: string } | null {
  const prix = objet(item.price);
  if (!prix) return null;
  const ventilation = objet(prix.breakDown) ?? objet(prix.breakdown);
  const total = objet(ventilation?.total);
  const deTotal = montantEuros(total?.price);
  if (deTotal != null) return { total: deTotal, label: `${String(total?.price)} au total` };
  const qualif = [prix.qualifier, prix.label, prix.priceQualifier].filter((x): x is string => typeof x === "string").join(" ");
  if (/\btotal\b/i.test(qualif)) {
    const n = montantEuros(prix.price ?? prix.discountedPrice ?? prix.label);
    if (n != null) return { total: n, label: [prix.price, qualif].filter(Boolean).join(" ") };
  }
  return null;
}

/** L'identifiant Airbnb d'un élément de la sortie : son `id`, sinon celui de son URL. */
export function idDeSortie(item: Objet): string | null {
  const id = item.id;
  if (typeof id === "string" && /^\d{3,25}$/.test(id)) return id;
  if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
  const url = typeof item.url === "string" ? item.url : "";
  return /\/rooms\/(?:plus\/)?(\d{3,25})/.exec(url)?.[1] ?? null;
}

/** Lit un élément de la sortie de l'acteur ; `null` s'il ne nomme pas son annonce. */
export function lireSortieApify(brut: unknown): FicheApify | null {
  const item = objet(brut);
  if (!item) return null;
  const id = idDeSortie(item);
  if (!id) return null;
  const resume = textesResume(item);
  const enTexte = (re: RegExp) => {
    for (const t of resume) {
      const n = Number(re.exec(t)?.[1]);
      if (Number.isInteger(n)) return n;
    }
    return null;
  };
  const bedrooms =
    entier(item.bedrooms, 0) ??
    entier(enTexte(CHAMBRES), 0) ??
    (resume.some((t) => STUDIO.test(t)) ? 0 : null);
  const coords = objet(item.coordinates) ?? objet(item.location);
  const lat = coordonnee(coords?.latitude ?? coords?.lat, 90);
  const lon = coordonnee(coords?.longitude ?? coords?.lng ?? coords?.lon, 180);
  const images = Array.isArray(item.images) ? item.images : [];
  const photos = images
    .map((x) => (typeof x === "string" ? x : (objet(x)?.imageUrl ?? objet(x)?.url)))
    .filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u));
  const vignette = typeof item.thumbnail === "string" && /^https:\/\//.test(item.thumbnail) ? item.thumbnail : null;
  const prix = totalSejour(item);
  return {
    id,
    capacity: entier(item.personCapacity, 1),
    bedrooms,
    beds: entier(item.beds, 1) ?? entier(enTexte(LITS), 1),
    lat: lat != null && lon != null ? lat : null,
    lon: lat != null && lon != null ? lon : null,
    photo: photos[0] ?? vignette,
    photos: photos.length > 0 ? photos : vignette ? [vignette] : [],
    total: prix?.total ?? null,
    priceLabel: prix?.label ?? null,
  };
}
