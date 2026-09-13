/**
 * Le moteur Deskline / Feratel, partie pure : bâtir la recherche, lire le JSON.
 *
 * C'est le mieux servi de tous les moteurs du parc. Deux appels suffisent,
 * contre huit pour Open System, et la réponse porte ce qu'aucun autre ne donne
 * en même temps : le prix daté, les coordonnées et une photo.
 *
 * **Il a fallu descendre jusqu'au service.** La page de la centrale ne contient
 * pas un seul prix : son moteur est une application JavaScript qui se peint
 * dans un Shadow DOM, et le HTML servi n'a que deux conteneurs vides. Le
 * service qu'elle interroge, lui, est ouvert — `webapi.deskline.net` n'a pas de
 * `robots.txt`, et la page de la centrale n'interdit que `/reserver/`, qui
 * n'est pas le chemin du moteur.
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
 * **Ce qui manque en champ structuré.** `maxPersons` est refusé par le type de
 * la réponse, et l'occupation ne voyage que dans la question. La capacité n'est
 * donc lue que si le nom du logement ou du service la portent en clair.
 */

/** Ce que la projection demande au service. Un champ inconnu rend un 400. */
const FERATEL_CHAMPS =
  "id,name,images{id,urls},location{coordinate{lat,long}}," +
  "services{id,name,products{id,name,price{value}}}";

/** Nombre de résultats par page. Soixante est ce que le composant demande. */
const FERATEL_PAR_PAGE = 60;

export type DemandeFeratel = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

export type FicheFeratel = {
  id: string;
  titre: string;
  /** Total du séjour, en euros : le moins cher des produits de l'hébergement. */
  total: number;
  /** Nom du service qui porte ce prix, par exemple « Chalet » ou « Appartement ». */
  service: string | null;
  lat: number | null;
  lon: number | null;
  photo: string | null;
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
type Produit = { price?: Prix | null };
type Service = { name?: string | null; products?: readonly Produit[] | null };
type Image = { urls?: readonly string[] | null };
type Hebergement = {
  id?: string | null;
  name?: string | null;
  images?: readonly Image[] | null;
  location?: { coordinate?: { lat?: unknown; long?: unknown } | null } | null;
  services?: readonly Service[] | null;
};

/** Réponse du service. `204 No Content` se lit comme une page vide. */
export type ReponseFeratel = { data?: readonly Hebergement[] | null } | null;

function nombre(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
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

function photo(h: Hebergement): string | null {
  for (const i of h.images ?? []) {
    const u = i?.urls?.find((x) => typeof x === "string" && x.length > 4);
    // Les adresses sont relatives au protocole : « //resc.deskline.net/… ».
    if (u) return u.startsWith("//") ? `https:${u}` : u;
  }
  return null;
}

/**
 * Lit une page de résultats.
 *
 * Un hébergement porte plusieurs services, et chaque service plusieurs
 * produits. On garde le moins cher : c'est ce qu'il en coûte d'y dormir à ces
 * dates. Un hébergement sans le moindre prix n'est pas rendu.
 */
export function lireFeratel(reponse: ReponseFeratel): FicheFeratel[] {
  const out: FicheFeratel[] = [];
  for (const h of reponse?.data ?? []) {
    const id = typeof h?.id === "string" ? h.id : null;
    const titre = typeof h?.name === "string" ? h.name.trim() : "";
    if (!id || !titre) continue;
    let total: number | null = null;
    let service: string | null = null;
    for (const s of h.services ?? []) {
      for (const p of s?.products ?? []) {
        const v = nombre(p?.price?.value);
        if (v == null || v <= 0) continue;
        if (total == null || v < total) {
          total = v;
          service = typeof s?.name === "string" && s.name ? s.name : null;
        }
      }
    }
    if (total == null) continue;
    const { lat, lon } = point(h);
    out.push({ id, titre, total, service, lat, lon, photo: photo(h) });
  }
  return out;
}
