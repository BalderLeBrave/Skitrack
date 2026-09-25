/**
 * Le moteur Deskline / Feratel, partie pure : bâtir la recherche, lire le JSON.
 *
 * C'est le mieux servi de tous les moteurs du parc. Une recherche à ouvrir puis
 * ses pages de résultats, contre plusieurs rubriques pour Open System, et la réponse
 * porte ce qu'aucun autre ne donne en même temps : le prix daté, les
 * coordonnées et une galerie de photos.
 *
 * **Il a fallu descendre jusqu'au service.** La page de la centrale ne contient
 * pas un seul prix : son moteur est une application JavaScript qui se peint
 * dans un Shadow DOM, et le HTML servi n'a que deux conteneurs vides. Le
 * service qu'elle interroge, lui, n'a pas de `robots.txt` (`webapi.deskline.net`).
 * Celui de la centrale porte `Disallow: /reserver/`, lu, ignoré : ce n'est pas
 * le chemin du moteur.
 *
 * **Deux en-têtes obligatoires, et ce qu'ils sont.** La passerelle refuse tout
 * chemin sans `DW-Source` ni `DW-SessionId`, `/robots.txt` compris. Ce ne sont
 * ni des secrets ni une protection anti-robot : `DW-Source` vaut la constante
 * « desklineweb », écrite en clair dans le paquet public du composant, et
 * `DW-SessionId` est un identifiant de corrélation que le navigateur fabrique
 * lui-même, sans rien demander à personne. On les envoie donc comme on envoie
 * un `Content-Type` : parce que le service ne répond pas sans. L'agent, lui,
 * reste le nôtre.
 *
 * **Ce que le prix vaut.** Une recherche sans dates n'existe pas : le service
 * refuse de la créer — 404 sans le bloc de dates, 400 avec des dates nulles.
 * Relevé du 13 septembre 2026 à La Clusaz, huit personnes : soixante
 * hébergements sur sept nuits, trente-six sur quatorze, et sur les trente-six
 * communs le rapport va de 1,952 à 2,220. **Aucun prix ne reste identique d'une
 * durée à l'autre** — c'est la vérification qui distingue un total de séjour
 * d'un tarif d'appel, et elle passe sur trente-six logements sur trente-six.
 *
 * **Pièces, chambres et type sont dans la liste ; la capacité n'y est pas.**
 * La projection est du GraphQL : un champ inconnu rend 400 et le message nomme
 * chaque champ refusé. Relevé du 25 septembre 2026 à La Clusaz, quatre
 * personnes : le service (`ServiceType`) accepte `rooms` et `bedrooms`, et
 * refuse `minPersons`, `maxPersons`, `size`, `occupancy`, `capacity`, `beds`
 * et `criterias` ; le produit (`ProductType`) refuse `occupancy`, `subType`,
 * `persons` et `units`. L'hébergement porte ses catégories (« Location »,
 * « Appartement », « Chalet individuel », « Hôtel »…), sa commune et son
 * quartier.
 *
 * **La capacité est dans le détail des services, une requête par
 * hébergement** (`urlServicesFeratel`). Chaque produit y publie `occupancy`.
 * Relevé du 25 septembre 2026 : sur les sept produits dont le nom annonce une
 * capacité (« 2 pièces 4 personnes », « 3 pièces 6 personnes », « 4 pièces 8
 * personnes », « T3 4/6 » de la Résidence Les Grandes Alpes…), `maxAdults` et
 * `maxBed` la valent tous les deux, sept fois sur sept. `maxPersons`, lui, vaut
 * `maxAdults + maxChildren` : 7, 11 et 15 pour 4, 6 et 8 personnes. Il n'est
 * pas lu. La capacité retenue est `maxAdults` du produit vendu. `maxBed` est
 * rendu aussi (`lits`), mais le connecteur ne le pose pas dans `beds` : l'écran
 * l'afficherait en « lits », et rien ne dit s'il compte des lits ou des places.
 */

import { motifNomHorsRegle, motifTypeHorsRegle, typeInconnu } from "../regleTypes.ts";

/** Ce que la projection demande au service. Un champ inconnu rend un 400. */
const FERATEL_CHAMPS =
  "id,name,dbCode,categories{id,name},images{id,urls}," +
  "location{coordinate{lat,long},town,district}," +
  "services{id,name,rooms,bedrooms,products{id,name,price{value}}}";

/**
 * Nombre de résultats par page : deux cents, et non les soixante du composant.
 *
 * **Le service ne tourne pas les pages.** Relevé du 25 septembre 2026 à La
 * Clusaz, quatre personnes : la réponse annonce `totalRecordCount: 183` sur
 * quatre pages de soixante, mais la page 1 rend les soixante hébergements de
 * la page 0, dans le même ordre, qu'on la demande par `pageNo=1`, par `page=1`
 * ou par le lien `links.next` qu'il publie lui-même. Le connecteur s'arrêtait
 * donc à soixante (page sans rien de neuf), et 123 logements n'arrivaient
 * jamais. Avec `pageSize=200`, la page 0 porte les 183, une seule fois chacun.
 *
 * Exporté parce que c'est lui qui dit quand une page est pleine, et donc quand
 * il faut en demander une suivante.
 */
export const FERATEL_PAR_PAGE = 200;

export type DemandeFeratel = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

export type FicheFeratel = {
  id: string;
  titre: string;
  /**
   * Total du séjour, en euros : le moins cher des produits de l'hébergement.
   *
   * **`0` veut dire « aucun produit n'a de prix à ces dates »**, jamais
   * « gratuit ». L'hébergement est rendu quand même : le service l'a mis dans
   * les résultats d'une recherche datée, et ce n'est pas au collecteur de
   * décider qu'il n'a rien à y faire.
   */
  total: number;
  /** Nom du service qui porte ce prix, par exemple « Chalet » ou « Appartement ». */
  service: string | null;
  /**
   * Nom du **produit** vendu, celui que la projection demande et que personne
   * ne lisait. Il porte souvent le nom du lot — « Les Aigles 1 » — quand
   * l'hébergement porte celui de la résidence.
   */
  produit: string | null;
  /** Identifiant du produit chez Feratel : ce qui est vendu, quand l'identifiant
   *  de l'annonce est celui de l'hébergement qui le contient. */
  produitId: string | null;
  lat: number | null;
  lon: number | null;
  photo: string | null;
  /** Toute la galerie, une adresse par image, dans l'ordre publié. */
  photos: string[];
  /**
   * Pièces du service retenu, `rooms`. **`0` vaut « non renseigné »** : un
   * logement a au moins une pièce, et les trois services de l'hôtel du relevé
   * écrivent tous `rooms: 0, bedrooms: 0`.
   */
  pieces: number | null;
  /**
   * Chambres du service retenu, `bedrooms`. `0` n'est gardé que si les pièces
   * sont connues : un studio publie `rooms: 1, bedrooms: 0`, et c'est vrai ;
   * l'hôtel publie `0` partout, et ce n'est rien.
   */
  chambres: number | null;
  /** Catégories de l'hébergement, telles que publiées : « Location »,
   *  « Studio », « Chalet individuel », « Hôtel »… */
  categories: string[];
  /** Commune (`location.town`). */
  commune: string | null;
  /** Quartier (`location.district`), par exemple « Vallée des Confins ». */
  quartier: string | null;
  /**
   * Base de l'hébergement chez Feratel (`dbCode`, « FRA » pour les 183 du
   * relevé), qui entre dans l'adresse du détail de ses services.
   */
  base: string | null;
};

/**
 * Le corps du `POST` qui crée une recherche.
 *
 * `units: 1` demande un seul logement pour tout le groupe, et non plusieurs
 * chambres : c'est ce que veut dire « huit voyageurs » dans Skitrack. Les
 * enfants restent à zéro — la demande compte des voyageurs, et leur inventer
 * des âges changerait le prix sans qu'on sache dans quel sens.
 */
export function corpsRechercheFeratel(d: DemandeFeratel): Record<string, unknown> {
  return {
    searchObject: {
      searchGeneral: {
        dateFrom: `${d.checkIn}T00:00:00`,
        dateTo: `${d.checkOut}T00:00:00`,
      },
      searchAccommodation: {
        isToleranceSearch: false,
        toleranceNights: 0,
        searchLines: [
          { units: 1, adults: Math.max(1, Math.trunc(d.guests)), children: 0, childrenAges: [] },
        ],
        bookableOnly: false,
        meal: "",
        searchSPRCriteria: [],
        searchSRCriteria: [],
      },
    },
  };
}

/** L'URL de création d'une recherche. */
export function urlRechercheFeratel(api: string): string {
  return `${api.replace(/\/+$/, "")}/searches`;
}

/**
 * L'URL des résultats d'une recherche.
 *
 * `cle` est la clé de la centrale chez Feratel — « laclusaz » —, lue dans la
 * configuration que son composant imprime en clair.
 */
export function urlResultatsFeratel(api: string, cle: string, recherche: string, page = 0): string {
  const p = new URLSearchParams();
  p.set("filterId", "");
  p.set("fields", FERATEL_CHAMPS);
  p.set("sortingFields", "");
  p.set("currency", "EUR");
  p.set("pageNo", String(page));
  p.set("pageSize", String(FERATEL_PAR_PAGE));
  return `${api.replace(/\/+$/, "")}/${encodeURIComponent(cle)}/fr/accommodations/searchresults/${encodeURIComponent(
    recherche,
  )}?${p.toString()}`;
}

/** Ce que le détail des services demande : l'occupation de chaque produit. */
const FERATEL_CHAMPS_SERVICES = "id,products{id,occupancy{maxAdults,maxBed}}";

/**
 * L'adresse du détail des services d'un hébergement, pour une recherche.
 *
 * C'est celle que le composant appelle à l'ouverture d'une fiche ; la
 * projection est réduite à ce que le collecteur lit.
 */
export function urlServicesFeratel(
  api: string,
  cle: string,
  base: string,
  hebergement: string,
  recherche: string,
): string {
  const p = new URLSearchParams();
  p.set("fields", FERATEL_CHAMPS_SERVICES);
  p.set("currency", "EUR");
  p.set("pageNo", "0");
  const racine = `${api.replace(/\/+$/, "")}/${encodeURIComponent(cle)}/fr/accommodations`;
  return `${racine}/${encodeURIComponent(base)}/${encodeURIComponent(hebergement)}/services/searchresults/${encodeURIComponent(
    recherche,
  )}?${p.toString()}`;
}

/** L'occupation publiée d'un produit : adultes au plus, couchages au plus. */
export type CapaciteFeratel = { adultes: number | null; lits: number | null };

type ProduitDetail = {
  id?: string | null;
  occupancy?: { maxAdults?: unknown; maxBed?: unknown } | null;
};
type ServiceDetail = { products?: readonly ProduitDetail[] | null };
/** Réponse du détail des services, telle que la projection la demande. */
export type ReponseServicesFeratel = { data?: readonly ServiceDetail[] | null } | null;

/**
 * L'occupation de chaque produit du détail, par identifiant de produit.
 *
 * Zéro ou une valeur hors de 1 à 50 ne dit rien, et reste vide. Un produit
 * sans rien de lisible n'est pas rendu.
 */
export function capacitesFeratel(reponse: ReponseServicesFeratel): Map<string, CapaciteFeratel> {
  const out = new Map<string, CapaciteFeratel>();
  for (const s of reponse?.data ?? []) {
    for (const p of s?.products ?? []) {
      const id = texte(p?.id);
      if (!id) continue;
      const adultes = entier(p?.occupancy?.maxAdults);
      const lits = entier(p?.occupancy?.maxBed);
      const c = {
        adultes: adultes != null && adultes > 0 ? adultes : null,
        lits: lits != null && lits > 0 ? lits : null,
      };
      if (c.adultes != null || c.lits != null) out.set(id, c);
    }
  }
  return out;
}

/** Une occupation gardée en mémoire, avec l'heure du détail qui l'a publiée. */
export type CapaciteDatee = CapaciteFeratel & { lueA: number };

/**
 * Les occupations d'une mémoire qui ont moins de `ttlMs`, chacune jugée à sa
 * propre date.
 */
export function capacitesFraiches(
  memoire: ReadonlyMap<string, CapaciteDatee> | undefined,
  maintenant: number,
  ttlMs: number,
): Map<string, CapaciteDatee> {
  const out = new Map<string, CapaciteDatee>();
  for (const [id, c] of memoire ?? []) if (maintenant - c.lueA < ttlMs) out.set(id, c);
  return out;
}

/**
 * Verse une lecture du détail dans la mémoire d'un hébergement.
 *
 * **Chaque produit garde sa propre date.** Le détail d'une recherche ne liste
 * que les produits qu'elle vend (autre groupe, autres dates, autre liste). Un
 * produit que la lecture publie prend la date de la lecture ; un produit
 * qu'elle ne publie pas garde la sienne, et s'efface quand elle a `ttlMs`. Lire
 * un produit ne rajeunit donc jamais la valeur d'un autre.
 */
export function verserCapacites(
  memoire: ReadonlyMap<string, CapaciteDatee> | undefined,
  lecture: ReadonlyMap<string, CapaciteFeratel>,
  maintenant: number,
  ttlMs: number,
): Map<string, CapaciteDatee> {
  const out = capacitesFraiches(memoire, maintenant, ttlMs);
  for (const [id, c] of lecture) out.set(id, { ...c, lueA: maintenant });
  return out;
}

/**
 * Le type publié par la centrale, tel qu'elle l'écrit : ses catégories, sans
 * « Location », qui dit qu'on loue et pas ce qu'on loue. Seule, elle reste.
 */
export function typeFeratel(categories: readonly string[]): string | null {
  const precises = categories.filter((c) => c.toLowerCase() !== "location");
  if (precises.length) return precises.join(", ");
  return categories[0] ?? null;
}

/**
 * Ce que Skitrack ne garde pas, par la règle du propriétaire (`regleTypes.ts`)
 * appliquée à chaque catégorie publiée : rend le motif de la première qui
 * écarte, ou `null`.
 *
 * Seules les **catégories** de l'hébergement sont jugées, jamais le nom du
 * service ou du produit, qui décrit ce qu'on vend et non ce qu'est
 * l'hébergement.
 *
 * Relevé du 25 septembre 2026, 183 hébergements à quatre personnes : huit
 * catégories (Location, Appartement, Studio, Chalet individuel, Appartement
 * dans chalet, Résidence de tourisme, Demi-Chalet, Hôtel). Seule « Hôtel »
 * écarte, et elle porte cinq hôtels.
 */
export function typeEcarteFeratel(categories: readonly string[]): string | null {
  for (const c of categories) {
    const motif = motifTypeHorsRegle(c);
    if (motif) return motif;
  }
  return null;
}

/**
 * La règle entière pour un hébergement : ses catégories, puis le camping dans
 * son nom (`motifNomHorsRegle`). Rend le motif d'écart, ou `null`.
 */
export function horsRegleFeratel(f: Pick<FicheFeratel, "categories" | "titre">): string | null {
  return typeEcarteFeratel(f.categories) ?? motifNomHorsRegle(f.titre);
}

/**
 * Les catégories d'un hébergement gardé que la règle ne connaît pas, pour le
 * journal. « Location » n'en est une que seule : à côté d'une autre, elle dit
 * qu'on loue, pas ce qu'on loue (`typeFeratel`).
 */
export function categoriesInconnuesFeratel(categories: readonly string[]): string[] {
  const precises = categories.filter((c) => c.toLowerCase() !== "location");
  return (precises.length ? precises : categories).filter((c) => typeInconnu(c));
}

/**
 * Un identifiant de corrélation, comme le composant en fabrique un.
 *
 * Une lettre majuscule suivie d'un horodatage. Il ne prouve rien et n'ouvre
 * rien : il sert au service à rattacher entre eux les appels d'une même
 * recherche, et c'est tout.
 */
export function sessionFeratel(maintenant: number): string {
  return `S${Math.trunc(maintenant)}`;
}

type Prix = { value?: unknown };
type Produit = { id?: string | null; name?: string | null; price?: Prix | null };
type Service = {
  id?: string | null;
  name?: string | null;
  rooms?: unknown;
  bedrooms?: unknown;
  products?: readonly Produit[] | null;
};
/** `urls` porte les rendus d'**une** image : on n'en garde donc qu'une par entrée,
 *  sans quoi la galerie compterait plusieurs fois la même photo. */
type Image = { urls?: readonly string[] | null };
type Hebergement = {
  id?: string | null;
  name?: string | null;
  dbCode?: string | null;
  categories?: readonly { name?: string | null }[] | null;
  images?: readonly Image[] | null;
  location?: {
    coordinate?: { lat?: unknown; long?: unknown } | null;
    town?: string | null;
    district?: string | null;
  } | null;
  services?: readonly Service[] | null;
};

/** Réponse du service. `204 No Content` se lit comme une page vide. */
export type ReponseFeratel = {
  data?: readonly Hebergement[] | null;
  paging?: { totalRecordCount?: unknown } | null;
} | null;

function nombre(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Le nombre de résultats que le service annonce pour la recherche,
 * `paging.totalRecordCount` (183 à La Clusaz, quatre personnes, le
 * 25 septembre 2026). Il sert à dire qu'un relevé est incomplet, jamais à
 * inventer une page. Rend `null` quand le compte manque.
 */
export function compteFeratel(reponse: ReponseFeratel): number | null {
  const n = nombre(reponse?.paging?.totalRecordCount);
  return n != null && Number.isInteger(n) && n >= 0 ? n : null;
}

function point(h: Hebergement): { lat: number | null; lon: number | null } {
  const c = h.location?.coordinate ?? null;
  const lat = nombre(c?.lat);
  // Le champ s'appelle `long` et non `lng` : c'est le nom du service, pas le
  // nôtre, et se tromper de nom rend une carte vide sans rien casser d'autre.
  const lon = nombre(c?.long);
  if (lat == null || lon == null) return { lat: null, lon: null };
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) return { lat: null, lon: null };
  return { lat, lon };
}

/**
 * La galerie : une adresse par image publiée.
 *
 * Seule la première image était rendue, les autres étaient lues puis jetées.
 * `urls` est en revanche la liste des rendus d'une même image : on n'en prend
 * qu'un, sinon la galerie répéterait la même photo.
 */
function photos(h: Hebergement): string[] {
  const out: string[] = [];
  for (const i of h.images ?? []) {
    const u = i?.urls?.find((x) => typeof x === "string" && x.length > 4);
    if (!u) continue;
    // Les adresses sont relatives au protocole : « //resc.deskline.net/… ».
    const abs = u.startsWith("//") ? `https:${u}` : u;
    if (!out.includes(abs)) out.push(abs);
  }
  return out;
}

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Un entier publié de 0 à 50, sinon rien. */
function entier(v: unknown): number | null {
  const n = nombre(v);
  return n != null && Number.isInteger(n) && n >= 0 && n <= 50 ? n : null;
}

/**
 * Pièces et chambres d'un service, telles que publiées.
 *
 * `rooms: 0` ne veut rien dire — un logement a au moins une pièce — et vaut
 * « non renseigné ». `bedrooms: 0` n'est cru que si les pièces sont connues :
 * c'est alors un studio (`rooms: 1, bedrooms: 0`, « Verte Vallée 11 »). Des
 * chambres sans pièces restent lues (« Résidence MGM », `rooms: 0,
 * bedrooms: 3`).
 */
function occupationService(
  s: Service | null | undefined,
): Pick<FicheFeratel, "pieces" | "chambres"> {
  const r = entier(s?.rooms);
  const b = entier(s?.bedrooms);
  const pieces = r != null && r > 0 ? r : null;
  const chambres = b == null ? null : b > 0 || pieces != null ? b : null;
  return { pieces, chambres };
}

/**
 * Lit une page de résultats.
 *
 * Un hébergement porte plusieurs services, et chaque service plusieurs
 * produits. On garde le moins cher : c'est ce qu'il en coûte d'y dormir à ces
 * dates.
 *
 * **Un hébergement sans prix est rendu quand même**, à zéro. Il était supprimé.
 * Or la recherche est datée par construction et demande `bookableOnly: false` :
 * ce que le service met dans ses résultats, il le connaît à ces dates-là. « Pas
 * de prix publié » est une information ; l'annonce disparue n'en est pas une.
 *
 * Le nom et l'identifiant du produit sont lus au passage : la projection les
 * demande depuis toujours, et personne ne s'en servait.
 *
 * Pièces et chambres sont celles **du service qui porte le produit retenu** :
 * un hébergement peut vendre plusieurs services, et le prix montré est celui
 * de l'un d'eux.
 */
export function lireFeratel(reponse: ReponseFeratel): FicheFeratel[] {
  const out: FicheFeratel[] = [];
  for (const h of reponse?.data ?? []) {
    const id = typeof h?.id === "string" ? h.id : null;
    const titre = typeof h?.name === "string" ? h.name.trim() : "";
    if (!id || !titre) continue;
    let total: number | null = null;
    let service: string | null = null;
    let produit: string | null = null;
    let produitId: string | null = null;
    let retenu: Service | null = null;
    // À défaut de produit tarifé, on nomme quand même ce que la centrale
    // propose : le premier service et le premier produit qu'elle publie.
    let servicePremier: string | null = null;
    let produitPremier: string | null = null;
    let produitIdPremier: string | null = null;
    let premier: Service | null = null;
    for (const s of h.services ?? []) {
      for (const p of s?.products ?? []) {
        premier ??= s ?? null;
        servicePremier ??= texte(s?.name);
        produitPremier ??= texte(p?.name);
        produitIdPremier ??= texte(p?.id);
        const v = nombre(p?.price?.value);
        if (v == null || v <= 0) continue;
        if (total == null || v < total) {
          total = v;
          service = texte(s?.name);
          produit = texte(p?.name);
          produitId = texte(p?.id);
          retenu = s ?? null;
        }
      }
    }
    const serviceRetenu = retenu ?? premier;
    const { lat, lon } = point(h);
    const galerie = photos(h);
    const categories: string[] = [];
    for (const c of h.categories ?? []) {
      const nom = texte(c?.name);
      if (nom && !categories.includes(nom)) categories.push(nom);
    }
    out.push({
      id,
      titre,
      total: total ?? 0,
      service: service ?? servicePremier,
      produit: produit ?? produitPremier,
      produitId: produitId ?? produitIdPremier,
      lat,
      lon,
      photo: galerie[0] ?? null,
      photos: galerie,
      ...occupationService(serviceRetenu),
      categories,
      commune: texte(h.location?.town),
      quartier: texte(h.location?.district),
      base: texte(h.dbCode),
    });
  }
  return out;
}
