/**
 * Le moteur MSEM, partie pure : lire le catalogue, joindre les prix.
 *
 * **Le moteur ne s'appelle pas comme l'audit le croyait.** L'audit rangeait ces
 * centrales sous « Ublo ». Ublo est le gestionnaire de contenu (Valraiso) qui
 * fabrique le site ; il ne vend rien. La recherche d'hébergement est un
 * composant chargé à part, « Mon Séjour En Montagne », servi par
 * `services.msem.tech`, et c'est lui qui connaît les prix. Les six sites ne sont
 * donc pas six moteurs : c'est la même API, à deux identifiants près — un
 * numéro de station et un canal de vente, que chaque site publie lui-même.
 *
 * **Deux appels, et ils ne disent pas la même chose.**
 *
 * - Le catalogue, en `GET`, donne tout sauf le prix : nom, slug, capacité
 *   maximale, coordonnées, photo, adresse. Il ne varie pas avec les dates.
 * - Les offres, en `POST`, ne donnent que le prix, indexé par l'identifiant du
 *   catalogue. C'est là qu'entrent les dates et la taille du groupe.
 *
 * La jointure se fait sur cet identifiant. Un hébergement du catalogue sans
 * offre n'est pas rendu : la centrale le connaît, elle ne le vend pas à ces
 * dates-là. L'écart est large et il faut le savoir — 957 hébergements au
 * catalogue de l'Alpe d'Huez, 53 vendables pour huit personnes sur la semaine
 * du 6 février 2027.
 *
 * **Pourquoi un `POST` ne gêne pas.** C'est la requête de recherche elle-même,
 * en lecture seule : elle ne crée ni panier, ni compte, ni réservation, et rien
 * n'en subsiste. Il n'existe aucune variante en `GET` — `GET .../offers` répond
 * 500. `robots.txt` est lu quand même, pour le chemin comme pour la forme, et
 * n'arrête jamais : relevé du 13 septembre 2026, `services.msem.tech` n'en a
 * pas, et les quatre sites n'interdisent rien qui touche à l'hébergement.
 *
 * **Ce que le prix vaut.** Sans dates, la réponse est vide : zéro offre sur les
 * quatre centrales. Sur quatorze nuits au lieu de sept, le prix double —
 * Sainte-Foy 1,97, Saint-François de 1,98 à 2,00, Villard-de-Lans de 1,99 à
 * 2,06, l'Alpe d'Huez de 2,00 à 2,41. Et sur trois nuits à Sainte-Foy,
 * l'appartement Soldanelle tombe de 2 259,58 € à 865,82 €. Un « à partir de »
 * ne ferait rien de tout cela.
 */

/** Un hébergement du catalogue, réduit à ce dont on se sert. */
export type HebergementMsem = {
  id: number | string;
  name?: string;
  slug?: string | null;
  maxCapacity?: number | null;
  /**
   * Nombre de **pièces**, pas de chambres.
   *
   * Vérifié sur le catalogue de Saint-François-Longchamp : sur deux cent
   * trente-huit noms qui annoncent eux-mêmes « N PIECES », deux cent vingt et
   * un portent exactement ce N dans `nbRooms`. Un deux-pièces a une chambre ;
   * recopier ce nombre dans `bedrooms` surestimerait chaque logement d'une
   * chambre, et le filtre « chambres ≥ N » laisserait passer ce qu'il devrait
   * écarter. Le champ est donc lu, et volontairement pas utilisé comme tel.
   */
  nbRooms?: number | null;
  lat?: number | null;
  lng?: number | null;
  image?: string | null;
  images?: readonly { src?: string | null }[] | null;
  location?: {
    address1?: string | null;
    address2?: string | null;
    cp?: string | null;
    city?: string | null;
    /** La centrale répète les coordonnées ici. Recours quand le niveau du dessus est vide. */
    lat?: number | null;
    lng?: number | null;
  } | null;
};

// Les tableaux sont en lecture seule : le gabarit de test est figé par `as
// const`, et un relevé qu'on lit n'a aucune raison d'être modifiable.
export type CatalogueMsem = { accomodations?: readonly HebergementMsem[] | null };

/** Une offre datée. La centrale n'en rend que pour ce qu'elle peut vendre. */
export type OffreMsem = { price?: number | null; publicPrice?: number | null };

/** Réponse du `POST` : un objet plat, indexé par l'identifiant du catalogue. */
export type OffresMsem = Record<string, OffreMsem>;

export type DemandeMsem = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Une fiche prête à traduire en `Listing`, catalogue et prix déjà joints. */
export type FicheMsem = {
  id: string;
  titre: string;
  total: number;
  /** Capacité maximale annoncée par la centrale. */
  capacite: number | null;
  /** Pièces, pas chambres. Gardé pour la trace, pas pour le filtre. */
  pieces: number | null;
  slug: string | null;
  photo: string | null;
  lat: number | null;
  lon: number | null;
  adresse: string | null;
  commune: string | null;
};

/** L'URL du catalogue d'une centrale. Invariante : elle ne porte pas de dates. */
export function urlCatalogueMsem(base: string, resort: number | string, canal: string): string {
  return `${base.replace(/\/+$/, "")}/api/lodging/resort/${resort}/${encodeURIComponent(canal)}?language=fr`;
}

/** L'URL des offres. Les dates voyagent dans le corps, pas dans l'adresse. */
export function urlOffresMsem(base: string, resort: number | string): string {
  return `${base.replace(/\/+$/, "")}/api/lodging/resort/${resort}/offers`;
}

/**
 * Le corps du `POST` des offres.
 *
 * `children` reste à zéro et `agesChildren` vide : la demande de Skitrack
 * compte des voyageurs, pas des adultes et des enfants. Déclarer des enfants
 * qu'on ne connaît pas changerait le prix sans qu'on sache dans quel sens.
 */
export function corpsOffresMsem(canal: string, d: DemandeMsem): Record<string, unknown> {
  return {
    channel: canal,
    preview: false,
    adults: Math.max(1, Math.trunc(d.guests)),
    children: 0,
    agesChildren: [],
    start: d.checkIn,
    end: d.checkOut,
    prod: false,
  };
}

function nombre(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Un nombre déclaré, ou rien.
 *
 * La centrale écrit parfois `maxCapacity: 0` — vu sur « HORIZON, 3 pièces,
 * 8 pers. » à l'Alpe d'Huez, dont le nom même annonce huit personnes et pour
 * lequel elle rend pourtant un prix à huit. Zéro n'est pas une capacité, c'est
 * un champ vide. Le recopier ferait écarter le logement par le filtre
 * « capacité ≥ N » alors que la centrale vient de dire qu'elle le vend.
 */
function positifOuRien(v: unknown): number | null {
  const n = nombre(v);
  return n != null && n > 0 ? n : null;
}

/** Arrondi au centime : la centrale rend des flottants, et 3651,2 en vaut 3651,2000000000003. */
function euros(v: unknown): number | null {
  const n = nombre(v);
  return n == null ? null : Math.round(n * 100) / 100;
}

/** Coordonnées, rejetées si elles tombent hors de France métropolitaine. */
function point(h: HebergementMsem): { lat: number | null; lon: number | null } {
  const lat = nombre(h.lat ?? h.location?.lat);
  const lon = nombre(h.lng ?? h.location?.lng);
  if (lat == null || lon == null) return { lat: null, lon: null };
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) return { lat: null, lon: null };
  return { lat, lon };
}

function adresse(h: HebergementMsem): { adresse: string | null; commune: string | null } {
  const l = h.location ?? null;
  if (!l) return { adresse: null, commune: null };
  const morceaux = [l.address1, l.address2, l.cp, l.city]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  const ville = typeof l.city === "string" ? l.city.trim() : "";
  return { adresse: morceaux.length ? morceaux.join(", ") : null, commune: ville || null };
}

function photo(h: HebergementMsem): string | null {
  const direct = typeof h.image === "string" && h.image ? h.image : null;
  const premiere = h.images?.find((i) => typeof i?.src === "string" && i.src)?.src ?? null;
  const src = direct ?? premiere;
  if (!src) return null;
  return src.startsWith("//") ? `https:${src}` : src;
}

/**
 * Joint le catalogue et les offres.
 *
 * L'ordre de parcours est celui des offres : ce sont elles qui disent ce qui
 * est vendable. Une offre dont l'identifiant ne se retrouve pas au catalogue
 * est écartée — un prix sans nom, sans adresse et sans lien n'est pas une
 * annonce, c'est un nombre.
 */
export function joindreMsem(catalogue: CatalogueMsem | null, offres: OffresMsem | null): FicheMsem[] {
  const par = new Map<string, HebergementMsem>();
  for (const h of catalogue?.accomodations ?? []) {
    if (h?.id != null) par.set(String(h.id), h);
  }
  const out: FicheMsem[] = [];
  for (const [id, offre] of Object.entries(offres ?? {})) {
    const total = euros(offre?.price);
    if (total == null || total <= 0) continue;
    const h = par.get(id);
    if (!h) continue;
    const titre = typeof h.name === "string" ? h.name.trim() : "";
    if (!titre) continue;
    const { lat, lon } = point(h);
    const { adresse: rue, commune } = adresse(h);
    out.push({
      id,
      titre,
      total,
      capacite: positifOuRien(h.maxCapacity),
      pieces: positifOuRien(h.nbRooms),
      slug: typeof h.slug === "string" && h.slug ? h.slug : null,
      photo: photo(h),
      lat,
      lon,
      adresse: rue,
      commune,
    });
  }
  return out;
}
