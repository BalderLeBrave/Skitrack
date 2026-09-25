/**
 * Le moteur Orchestra, partie pure : lire le catalogue, lire le calendrier.
 *
 * Orchestra Platform, de Travelsoft, équipe La Plagne et Chamonix. C'est le
 * moteur le plus coûteux du parc à interroger, et il faut dire pourquoi.
 *
 * **Sa page de résultats porte un Disallow `/*serp?`**, et le prix s'obtient un
 * logement à la fois. On lit la règle, on n'en fait pas un arrêt. Ce qui reste
 * le plus économique, ce sont les pages de destination, qui listent les
 * logements sans leur prix, et un point d'entrée de calendrier par logement.
 * Couvrir un village coûte donc une page plus sept à neuf appels ; couvrir La
 * Plagne entière, onze pages et quatre-vingt-quinze appels.
 *
 * **Ce qui rend cela tenable, c'est que rien de tout cela ne dépend des
 * dates.** La page de destination est un catalogue, et le calendrier d'un
 * logement porte d'un coup tous ses mois, toutes ses durées et toutes ses
 * bandes de capacité. Les deux se retiennent donc en mémoire, et une deuxième
 * recherche, à n'importe quelles dates, ne coûte plus rien. C'est
 * `orchestra.server.ts` qui tient ces caches.
 *
 * **Le prix se lit à quatre entrées.** `availabilities` est un dictionnaire
 * imbriqué : ville de départ, bande de capacité, durée, mois, jour. La ville
 * `XXX` est celle qui vend l'hébergement seul, sans transport — les autres,
 * `PAR`, `LON`, `LIL`, vendent un forfait avec le voyage, et leurs prix sont
 * sans rapport. La bande s'écrit « 1-8 », minimum et maximum de voyageurs ; la
 * durée « 8-7 », jours et nuits ; le jour sur deux chiffres. Se tromper d'une
 * seule de ces quatre entrées rend une liste vide sans rien signaler.
 *
 * **Ce que le jour publie autour du prix, et qui s'ignorait.** `byHousing` dit
 * que le montant porte sur le logement entier et non par personne ; `nightNb`
 * dit combien de nuits il couvre ; `minPax` et `maxPax` bornent la bande
 * tarifaire, et `categoryCode` donne le code commercial du produit. Les deux
 * premiers sont ce qui permet de ne pas comparer un prix par tête à un total,
 * et le troisième est ce qu'on prenait pour la capacité du logement.
 *
 * **Ce que le prix vaut.** Relevé du 13 septembre 2026. Sans dates, la fiche
 * d'un logement annonce « À partir de 2 280 € » et la grille d'une destination
 * un prix d'appel : ce sont bien des « à partir de ». Avec dates, le même
 * logement rend un total qui suit la durée — 3 300 € sur sept nuits, 6 500 €
 * sur quatorze, 9 700 € sur vingt et une — et qui suit la saison à durée
 * constante : 900 € le 19 septembre, 1 500 € le 5 décembre, 3 300 € le
 * 6 février. Un tarif qui double avec la durée et triple avec la saison n'est
 * pas une grille.
 *
 * **Où se lisent le type, la capacité et le lieu.** Relevé du 25 septembre
 * 2026 à Champagny-en-Vanoise. La carte du catalogue porte le type sur ses
 * sept logements : « Appartement ». Le calendrier n'en dit rien : son
 * objet `product` ne porte qu'un code, l'agence, une photo et un prix d'appel,
 * sans point, sans capacité, sans chambres. La fiche `/location/…` porte le
 * reste, en deux blocs : « Information » (village, référence, type de bien
 * « 2 pièces », capacité « 6 Personnes », confort) et « Localisation »
 * (adresse du logement, coordonnées, quartier). Aucune des trois pages ne
 * publie de nombre de chambres. Le bloc « Agence Immobilière » de la fiche
 * donne l'adresse de l'agence : il n'est pas lu.
 */

import { jugerLogement, plierType } from "../regleTypes.ts";

/** Un logement du catalogue, avant d'avoir son prix. */
export type CarteOrchestra = {
  /** Identifiant produit, celui qu'attend le calendrier. */
  id: string;
  titre: string;
  /** Chemin de la fiche, relatif à la centrale. */
  chemin: string | null;
  photo: string | null;
  /** Le type que la carte affiche, `<span class="tag">Appartement</span>`. */
  type: string | null;
};

/** Ce que les blocs « Information » et « Localisation » d'une fiche publient. */
export type FicheOrchestra = {
  /** « Capacité : 6 Personnes ». */
  capacite: number | null;
  /** « Type de bien : 2 pièces », tel quel. */
  typeDeBien: string | null;
  /** Les pièces que le type de bien écrit. */
  pieces: number | null;
  /** « Village : CHAMPAGNY », tel quel. */
  village: string | null;
  /** « Adresse », ses lignes jointes : « 160 Rue des Hauts du Crey, CHAMPAGNY, 73350 ». */
  adresse: string | null;
  /** « Coordonnées », bornées à la France métropolitaine. */
  lat: number | null;
  lon: number | null;
};

export type DemandeOrchestra = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Une offre datée, telle que le calendrier la porte. */
export type OffreOrchestra = {
  /** Total de la bande retenue. `0` veut dire « pas de prix publié ». */
  total: number;
  /**
   * Bornes de la **bande tarifaire** qui a répondu, `minPax` et `maxPax`.
   *
   * **Ce n'est pas la capacité du logement**, et ce l'a longtemps été : le
   * connecteur écrivait `maxPax` dans `guests`. Or `maxPax` est le haut de la
   * bande commerciale — la clé « 1-6 » du dictionnaire, que la catégorie
   * répète —, c'est-à-dire jusqu'à combien de personnes ce tarif se vend. Un
   * studio vendu « 1 à 6 personnes » n'en couche pas six. La charge ne publie
   * nulle part la capacité du bien ; elle reste donc vide, sauf si le nom du
   * logement l'annonce.
   */
  bandeMin: number | null;
  bandeMax: number | null;
  /** Libellé de la catégorie, quand le calendrier en donne un. */
  categorie: string | null;
  /** `categoryCode` : le code commercial du produit, celui que porte l'URL. */
  codeProduit: string | null;
  /**
   * `byHousing` : le prix porte sur le logement entier, et non par personne.
   *
   * C'est le drapeau qui interdit de comparer un prix par personne à un total.
   * `null` quand le calendrier ne l'écrit pas : on ne présume ni l'un ni l'autre.
   */
  parLogement: boolean | null;
  /** `nightNb` : les nuits que ce prix couvre, écrites par le calendrier. */
  nuits: number | null;
};

/** Nombre de nuits entre deux dates ISO. */
export function nuitsOrchestra(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Une date ISO en `jj-mm-aaaa`, la forme que le calendrier attend. */
export function dateOrchestra(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** L'URL d'une page de destination. Sans paramètre : le catalogue, pas le prix. */
export function urlCatalogueOrchestra(base: string, destination: string): string {
  return `${base.replace(/\/+$/, "")}/destinations/${encodeURIComponent(destination)}`;
}

/**
 * L'URL du calendrier d'un logement.
 *
 * `departureDate` ne restreint pas la réponse à cette date : elle oriente les
 * mois rendus. Le calendrier revient de toute façon avec plusieurs mois, ce qui
 * est précisément ce qui permet de le retenir.
 */
export function urlCalendrierOrchestra(base: string, id: string, d: DemandeOrchestra): string {
  const nuits = nuitsOrchestra(d.checkIn, d.checkOut);
  const p = new URLSearchParams();
  p.set("withCap", "true");
  p.set("minNight", String(nuits));
  p.set("minDay", String(nuits + 1));
  // La ville de départ `XXX` est celle qui vend l'hébergement seul.
  p.set("departureCity", "XXX");
  p.set("departureDate", dateOrchestra(d.checkIn));
  return `${base.replace(/\/+$/, "")}/ajax/bookingEngine/${encodeURIComponent(id)}?${p.toString()}`;
}

function desechapper(s: string): string {
  return s
    .replace(/&#0*(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, "\u00a0");
}

/**
 * Lit une page de destination.
 *
 * Le titre vient du texte de remplacement de la première image, qui porte le
 * nom du logement suivi du rang de la photo : « Studio - Résidence LICORNE -
 * ref LICO0314 - 1 ». Le rang est retiré.
 */
export function cartesOrchestra(page: string): CarteOrchestra[] {
  const debuts: number[] = [];
  const re = /class="[^"]*\bcpt-product-item\b[^"]*"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page)) !== null) debuts.push(m.index);
  const out: CarteOrchestra[] = [];
  for (const [i, s] of debuts.entries()) {
    const f = page.slice(s, i + 1 < debuts.length ? debuts[i + 1] : page.length);
    const id = /data-product-id="(\d+)"/.exec(f)?.[1];
    if (!id) continue;
    const alt = /<img[^>]+alt="([^"]{2,160})"/.exec(f)?.[1] ?? "";
    const titre = desechapper(alt)
      .replace(/\s*-\s*\d+\s*$/, "")
      .trim();
    if (!titre) continue;
    const lien = /data-link="(\/[^"#]+)/.exec(f)?.[1] ?? null;
    const photo = /<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+)"/.exec(f)?.[1] ?? null;
    const tag =
      /class="elem-product-tag\b[^"]*"[^>]*>\s*<span class="tag">([^<]{1,60})<\/span>/.exec(f)?.[1];
    const type = tag ? desechapper(tag).trim() || null : null;
    out.push({ id, titre, chemin: lien ? desechapper(lien) : null, photo, type });
  }
  return out;
}

/**
 * La règle du propriétaire (`regleTypes.ts`), sur le type de la carte et, pour
 * le seul camping, sur son titre et son chemin. Rend le motif d'écart, ou
 * `null` quand le logement est gardé, type inconnu compris.
 *
 * Une carte sans type n'est pas écartée : les sept cartes relevées en portent
 * un, et rien ne dit ce que vaudrait son absence. Écarter avant le calendrier
 * épargne un appel par logement refusé.
 */
export function horsRegleOrchestra(c: {
  type: string | null;
  titre?: string;
  chemin?: string | null;
}): string | null {
  return jugerLogement(c).motif;
}

/** Le bloc « Information » d'une fiche : son titre, puis son texte. */
const BLOC_INFORMATION =
  /<h3[^>]*>\s*Information\s*<\/h3>\s*<div class="txt-content">([\s\S]*?)<\/div>/;

/** Un entier publié, de 1 à 50. */
function entierPublie(s: string | undefined): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

/** « Coordonnées » en clair, dans le bloc « Localisation ». */
const COORDONNEES =
  /<h3[^>]*>\s*Coordonn(?:é|&eacute;|e)es\s*<\/h3>\s*<div class="txt-content">\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*<\/div>/;

/** Le point de la carte du même bloc, arrondi au millionième. */
const POINT_CARTE = /data-map-latlng='\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]'/;

/** Un point publié, s'il tombe en France métropolitaine ; sinon rien. */
function pointEnFrance(
  lat: string | undefined,
  lon: string | undefined,
): { lat: number; lon: number } | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return la >= 41 && la <= 52 && lo >= -6 && lo <= 10 ? { lat: la, lon: lo } : null;
}

/**
 * Le bloc « Localisation » d'une fiche : de son ancre à l'onglet suivant.
 *
 * Relevé du 25 septembre 2026, logement 86645 :
 *
 *     <div id="desc-localisation" class="tab-content …">
 *       …
 *       <h3 class="title-content secondary">Adresse</h3>
 *       <div class="txt-content">160 Rue des Hauts du Crey<br>CHAMPAGNY<br>73350</div>
 *       <h3 class="title-content secondary">Coordonnées</h3>
 *       <div class="txt-content">45.45672911614459, 6.694965362548828</div>
 *       <h3 class="title-content secondary">Quartier</h3>
 *       <div class="txt-content">Champagny - Les Hauts du Crey</div>
 *       …
 *       <div id="map_wrap" class="map-wrap" data-map-latlng='[45.456729,6.694965]' …></div>
 *     …
 *     <div id="desc-includes" …>
 *
 * L'adresse est celle du logement : 160 rue des Hauts du Crey pour le 86645,
 * 1103 rue de la Vanoise pour le 85914, quand l'agence des deux est au 598 rue
 * de la Vanoise.
 */
function lieuOrchestra(page: string): Pick<FicheOrchestra, "adresse" | "lat" | "lon"> {
  const debut = page.indexOf('id="desc-localisation"');
  if (debut < 0) return { adresse: null, lat: null, lon: null };
  const suite = page.indexOf('id="desc-', debut + 1);
  const bloc = page.slice(debut, suite < 0 ? undefined : suite);
  const ad = /<h3[^>]*>\s*Adresse\s*<\/h3>\s*<div class="txt-content">([\s\S]*?)<\/div>/.exec(bloc);
  const lignes = (ad?.[1] ?? "")
    .split(/<br\s*\/?>/i)
    .map((l) =>
      desechapper(l.replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  // Les coordonnées en clair d'abord, les plus précises ; la carte ensuite.
  const texte = COORDONNEES.exec(bloc);
  const carte = POINT_CARTE.exec(bloc);
  const point = pointEnFrance(texte?.[1], texte?.[2]) ?? pointEnFrance(carte?.[1], carte?.[2]);
  return {
    adresse: lignes.length > 0 ? lignes.join(", ") : null,
    lat: point?.lat ?? null,
    lon: point?.lon ?? null,
  };
}

/**
 * Lit les blocs « Information » et « Localisation » d'une fiche `/location/…`.
 *
 * Relevé du 25 septembre 2026, logement 86645 :
 *
 *     <h3 class="title-content secondary">Information</h3>
 *     <div class="txt-content">- <strong>Station :</strong> Champagny en Vanoise<br>
 *       - <strong>Village :</strong> CHAMPAGNY<br>- <strong>Référence du bien :</strong> CCDT052<br>
 *       - <strong>Type de bien :</strong> 2 pièces<br>- <strong>Capacité :</strong> 6 Personnes<br>
 *       - <strong>Confort :</strong> Premium</div>
 *
 * Seuls ces deux blocs sont lus (`lieuOrchestra` pour le second). La
 * description (« 2 pièces cabine 6 personnes »), le bloc de l'agence — son
 * adresse et son téléphone — et le moteur de réservation, qui répète les
 * bandes de capacité, ne le sont pas.
 *
 * **La capacité de la fiche égale le haut de la bande tarifaire** sur les deux
 * logements relevés : 6 pour la bande « 1-6 » du 86645, 12 pour la bande
 * « 1-12 » du 85914, dont la description dit « 10/12 personnes ». Elle est lue
 * parce que la centrale l'écrit sous le mot « Capacité », pas parce qu'elle
 * égale la bande.
 */
export function ficheOrchestra(page: string): FicheOrchestra {
  const lieu = lieuOrchestra(page);
  const bloc = BLOC_INFORMATION.exec(page);
  if (!bloc) return { capacite: null, typeDeBien: null, pieces: null, village: null, ...lieu };
  const champs = new Map<string, string>();
  for (const m of (bloc[1] ?? "").matchAll(/<strong>\s*([^<]+?)\s*:\s*<\/strong>\s*([^<]*)/g)) {
    // La clé est pliée : « Capacité » et « Capacit&eacute; » se valent.
    const cle = plierType(desechapper(m[1] ?? "").replace(/&([a-zA-Z])[a-z]+;/g, "$1"));
    const valeur = desechapper(m[2] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (valeur && !champs.has(cle)) champs.set(cle, valeur);
  }
  const cap = /^(\d{1,2})\s*personnes?$/i.exec(champs.get("capacite") ?? "");
  const typeDeBien = champs.get("type de bien") ?? null;
  const pi = typeDeBien ? /\b(\d{1,2})\s*pi(?:è|e|&egrave;)ces?\b/i.exec(typeDeBien) : null;
  return {
    capacite: cap ? entierPublie(cap[1]) : null,
    typeDeBien,
    pieces: pi ? entierPublie(pi[1]) : null,
    village: champs.get("village") ?? null,
    ...lieu,
  };
}

type Categorie = {
  categoryLabel?: unknown;
  categoryCode?: unknown;
};
type Jour = {
  price?: unknown;
  /** Bornes de la bande tarifaire, répétées ici par le calendrier. */
  maxPax?: unknown;
  minPax?: unknown;
  /** Le prix porte sur le logement entier. */
  byHousing?: unknown;
  /** Nuits couvertes par ce prix. */
  nightNb?: unknown;
  status?: unknown;
  categories?: Record<string, Categorie> | null;
};
type Calendrier = {
  availabilities?: Record<string, Record<string, Record<string, Record<string, Record<string, Jour>>>>> | null;
};

function nombre(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * La catégorie du jour, libellé et code commercial pris ensemble.
 *
 * La clé du dictionnaire n'est pas fixe : c'est « Housing » chez certains
 * logements et le code commercial du produit chez d'autres, « ccdt052 ». On
 * prend donc la première entrée qui porte un libellé, sans en présumer le nom,
 * et son `categoryCode` avec elle — c'est le code que l'URL de la fiche porte
 * aussi, et il était lu puis jeté.
 */
function categorieDuJour(e: Jour | undefined): { libelle: string | null; code: string | null } {
  const cat = Object.values(e?.categories ?? {}).find(
    (x) => typeof x?.categoryLabel === "string" && x.categoryLabel,
  );
  const libelle = typeof cat?.categoryLabel === "string" && cat.categoryLabel ? cat.categoryLabel : null;
  const code = typeof cat?.categoryCode === "string" && cat.categoryCode ? cat.categoryCode : null;
  return { libelle, code };
}

/**
 * Cherche, dans un calendrier, le prix de la demande.
 *
 * On retient le moins cher parmi les bandes de capacité qui couvrent le groupe :
 * un même logement paraît sous plusieurs bandes, et c'est ce qu'il en coûte d'y
 * dormir qui compte. Un jour dont l'état n'est pas « Available » est écarté.
 *
 * **La durée est vérifiée, plus seulement supposée.** La clé `8-7` est une
 * convention qu'on écrit ; `nightNb` est un nombre que le calendrier écrit. Une
 * entrée qui publie une autre durée que celle demandée est écartée, plutôt que
 * de faire passer pour un séjour de sept nuits le prix d'autre chose.
 *
 * **Un jour libre sans prix reste une réponse.** La bande est alors rendue avec
 * un total de zéro, qui se lit « listée sans prix » : c'est un renseignement,
 * et le supprimer n'en est pas un. Une bande tarifée l'emporte toujours.
 */
export function prixOrchestra(calendrier: unknown, d: DemandeOrchestra): OffreOrchestra | null {
  const c = (calendrier ?? {}) as Calendrier;
  const sansTransport = c.availabilities?.XXX;
  if (!sansTransport) return null;
  const nuits = nuitsOrchestra(d.checkIn, d.checkOut);
  if (nuits <= 0) return null;
  const duree = `${nuits + 1}-${nuits}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.checkIn);
  if (!m) return null;
  const mois = `${m[2]}-${m[1]}`;
  const jour = m[3] ?? "";
  const groupe = Math.max(1, Math.trunc(d.guests));

  let meilleure: OffreOrchestra | null = null;
  let sansPrix: OffreOrchestra | null = null;
  for (const [bande, durees] of Object.entries(sansTransport)) {
    const [lo, hi] = bande.split("-");
    const min = nombre(lo);
    const max = nombre(hi);
    if (min == null || max == null || groupe < min || groupe > max) continue;
    const e = durees?.[duree]?.[mois]?.[jour];
    if (!e) continue;
    if (typeof e.status === "string" && e.status !== "Available") continue;
    const couvre = nombre(e.nightNb);
    if (couvre != null && couvre !== nuits) continue;
    const total = nombre(e.price);
    const cat = categorieDuJour(e);
    const offre: OffreOrchestra = {
      total: total != null && total > 0 ? total : 0,
      // Les bornes sont écrites deux fois : dans la clé de la bande et dans le
      // jour lui-même. On lit le champ, et la clé sert de recours.
      bandeMin: nombre(e.minPax) ?? min,
      bandeMax: nombre(e.maxPax) ?? max,
      categorie: cat.libelle,
      codeProduit: cat.code,
      parLogement: typeof e.byHousing === "boolean" ? e.byHousing : null,
      nuits: couvre,
    };
    if (offre.total <= 0) {
      sansPrix ??= offre;
      continue;
    }
    if (meilleure && meilleure.total <= offre.total) continue;
    meilleure = offre;
  }
  return meilleure ?? sansPrix;
}
