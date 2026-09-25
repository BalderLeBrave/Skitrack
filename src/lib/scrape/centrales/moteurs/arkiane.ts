/**
 * Le moteur Arkiane, partie pure : bâtir la demande, lire la réponse.
 *
 * Arkiane est la plateforme LocVacances. Une seule centrale du parc l'emploie,
 * Pralognan-la-Vanoise, et les prix ne viennent pas de son site mais de l'hôte
 * marchand `reservationpralognan.locvacances.com`.
 *
 * **Les critères voyagent dans le corps, pas dans l'adresse.** La requête est un
 * `POST` en formulaire, sans la moindre chaîne de requête. Cela règle d'un coup
 * les motifs `robots.txt` en `/*?…` : il n'y a pas de chaîne de requête. Le
 * fichier de l'hôte marchand porte onze répertoires en Disallow : on le lit,
 * on extrait. Aucun ne contient ce chemin.
 *
 * **Le marqueur qui distingue un total d'un tarif d'appel est écrit dans la
 * page.** Sans dates, chaque carte porte `<span class="price_from_to">À partir
 * de … / sem.</span>` et aucun total. Avec dates, ce marqueur disparaît et le
 * bloc `.rate` porte un montant ferme. Le connecteur rejette toute carte qui
 * porte encore le marqueur : c'est la garantie, lisible dans le HTML lui-même,
 * que le prix rendu n'est pas un « à partir de ».
 *
 * Relevé du 13 septembre 2026, huit personnes : sans dates, quarante et une
 * cartes et zéro prix ferme ; sur sept nuits, sept cartes et sept prix fermes ;
 * sur quatorze nuits, trois cartes. Sur les trois logements communs aux deux
 * durées, le rapport va de 2,000 à 2,760 et aucun prix ne reste identique. Sur
 * trois nuits, la centrale répond en cent onze octets : « nous n'avons plus de
 * disponibilité sur cette période ».
 *
 * **Ce qu'elle donne et ce qu'elle ne donne pas.** La carte porte trois champs
 * structurés : la capacité, `lot_pax`, la station, `lib_imme_station`, et le
 * type commercial, `lib_lot_type_cial` (« 3 pièces », « Studio », « Chalet »).
 * Ni coordonnée ni chambres. Il n'y a pas non plus d'adresse de fiche
 * atteignable en `GET` : le détail d'un lot est un `POST`, et le lien mène donc
 * à la centrale.
 *
 * **Le détail d'un lot, lui, porte la position et les chambres.** Relevé du
 * 25 septembre 2026, trois lots de Pralognan : quatre pavés « pièces,
 * personnes, surface, chambres » repérés par leur icône (`fa-home`,
 * `fa-users`, `fa-ruler-triangle`, `fa-bed`), le quartier sous le titre, et
 * un lien « Localiser ce bien » vers Google Maps qui porte le point
 * (`query=45.383434,6.716356`). Un lot sur trois n'a pas de point, et la page
 * le dit : « Pas de localisation disponible pour cette offre ».
 *
 * **`lot_pax` est la capacité du lot, et le critère `lot_pax|N` la veut
 * égale à N.** Relevé du 25 septembre 2026, mêmes dates : sans critère, la
 * première page porte cinquante lots de 4 à 11 personnes ; avec `lot_pax|4`,
 * vingt-cinq lots, tous de 4. La valeur n'est donc pas l'écho de la demande.
 * Le lot 184, « 2 pièces mezz 6 personnes » au libellé, vaut 4 dans sa carte
 * comme dans son détail.
 *
 * **Seule la rubrique des locations est interrogée.** Le critère
 * `lot_type_to` sépare « Locations saisonnières » (801) et « Hôtels » (802) ;
 * la centrale vend aussi des chambres d'hôtel et liste des refuges parmi ses
 * immeubles. Le type commercial « Chambre » (95) est écarté à la lecture.
 */

import { jugerLogement, motifTypeHorsRegle } from "../regleTypes.ts";

/** Une carte telle que la centrale l'écrit, avant traduction en `Listing`. */
export type FicheArkiane = {
  /** Numéro de lot, stable d'une requête à l'autre. */
  lot: string;
  /** Référence commerciale affichée, par exemple « BCT1 ». */
  reference: string | null;
  titre: string;
  /**
   * Le libellé complet, tel que la carte le publie.
   *
   * `titre` en est la version nettoyée, et ce nettoyage coupe du texte publié :
   * la centrale tronque elle-même ses longs libellés — « … - 4* 57… » — et le
   * bout de nombre orphelin est retiré du titre parce qu'il s'y lit comme une
   * erreur d'affichage. Ce qu'elle a écrit est gardé ici, entier : c'est là que
   * vivent la surface et le classement, que le modèle n'a pas de champ pour
   * porter, et c'est aussi ce qu'on donne à lire à la lecture d'occupation.
   */
  libelle: string;
  /**
   * Total du séjour, en euros. **`0` veut dire « le bloc de tarif est là, mais
   * son montant ne se lit pas »**, jamais « gratuit ».
   */
  total: number;
  /** Prix barré, `<del class="before">`, quand la centrale en affiche un. */
  avantRemise: number | null;
  capacite: number | null;
  commune: string | null;
  photo: string | null;
  /**
   * Type commercial publié, `lib_lot_type_cial` : « 3 pièces », « Studio »,
   * « Chalet ».
   */
  typeCommercial: string | null;
  /** Pièces, quand le type commercial les compte (« 3 pièces »). */
  pieces: number | null;
  /**
   * Le formulaire de détail de la carte, tel qu'elle l'écrit : son adresse
   * (`/fr-FR/Lot/Detail`) et ses champs cachés (`lot_no`, `comm_no`,
   * `comm_type`, `startDate`, `endDate`). C'est ce qu'il faut renvoyer pour
   * lire la position et les chambres du lot.
   */
  detail: { action: string; champs: [string, string][] } | null;
};

/** Ce que le détail d'un lot publie, et que la carte ne porte pas. */
export type DetailArkiane = {
  lat: number | null;
  lon: number | null;
  chambres: number | null;
  pieces: number | null;
  capacite: number | null;
  /** Le quartier sous le titre : « Le Plan », « Centre - Pralognan La Vanoise ». */
  quartier: string | null;
};

/**
 * Cartes par page. Cinquante est ce que la centrale demande elle-même.
 *
 * Exporté parce que c'est lui qui dit si une page est pleine, et donc s'il faut
 * en demander une suivante.
 */
export const ARKIANE_PAR_PAGE = 50;

/**
 * La rubrique « Locations saisonnières » du critère `lot_type_to`. L'autre
 * rubrique publiée est « Hôtels » (802), jamais demandée.
 */
export const ARKIANE_LOCATIONS = "801";

export type DemandeArkiane = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Une date ISO en `jj/mm/aaaa`, la seule forme que le moteur accepte. */
export function dateArkiane(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Le corps du `POST` de recherche.
 *
 * `selectedCriteria` porte les filtres sous la forme `nom|valeur`, **un champ
 * par critère** : c'est ainsi que la page les envoie
 * (`$("#criteriaList input[name='selectedCriteria']").serialize()`), et la
 * centrale a accepté `lot_pax|4` avec `lot_type_to|801` le 25 septembre 2026.
 * `lot_pax` est la capacité ; `lot_type_to|801`, la rubrique « Locations
 * saisonnières », qui laisse les hôtels (802) hors de la demande. `take` et
 * `skip` sont la pagination, et cinquante est ce que la centrale demande
 * elle-même.
 *
 * **`skip` était figé à un, et rien ne le justifiait.** La centrale ne publie
 * aucun compteur de résultats dans son fragment. Le script de la page y met le
 * numéro de la page (`data-page`), mais aucune page 2 n'a encore été lue. Le
 * paramètre est donc incrémenté d'un en un, et le connecteur s'arrête dès
 * qu'une page n'apporte plus de lot inconnu : cette règle-là est juste quelle
 * que soit l'unité, puisque les lots sont dédoublonnés par leur numéro.
 */
export function corpsArkiane(d: DemandeArkiane, skip = 1): URLSearchParams {
  const p = new URLSearchParams();
  p.append("selectedCriteria", `lot_pax|${Math.max(1, Math.trunc(d.guests))}`);
  p.append("selectedCriteria", `lot_type_to|${ARKIANE_LOCATIONS}`);
  p.append("startDate", dateArkiane(d.checkIn));
  p.append("endDate", dateArkiane(d.checkOut));
  p.append("take", String(ARKIANE_PAR_PAGE));
  p.append("skip", String(Math.max(1, Math.trunc(skip))));
  p.append("orderBy", "");
  p.append("comm_no", "0");
  p.append("comm_type", "DEFAUT");
  p.append("filtre", "");
  p.append("budget", "");
  p.append("package_qte", "");
  return p;
}

/**
 * Le motif qui écarte une carte par son type commercial, ou `null` : la règle
 * du propriétaire (`regleTypes.ts`). « Chambre » est un type commercial de la
 * centrale (`lot_type_cial|95`) : une chambre, pas un logement entier.
 *
 * Seul `lib_lot_type_cial` est jugé comme type, jamais le libellé : « Studio »,
 * « N pièces », « Chalet » et « Maison » passent. Relevé du 25 septembre 2026 :
 * les soixante-deux lots vus (accueil, recherche à quatre personnes, recherche
 * sans critère) n'ont que Studio, 2 à 6 pièces et Chalet ; « Chambre » n'est
 * vu que dans la liste des critères.
 */
export function typeEcarteArkiane(typeCommercial: string | null): string | null {
  return motifTypeHorsRegle(typeCommercial);
}

/**
 * La règle entière pour une carte : son type commercial, puis le camping dans
 * son libellé (`motifNomHorsRegle`), seul mot qu'on y cherche.
 */
export function horsRegleArkiane(
  f: Pick<FicheArkiane, "typeCommercial" | "libelle">,
): string | null {
  return jugerLogement({ type: f.typeCommercial, titre: f.libelle }).motif;
}

const ENTITES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

function desechapper(s: string): string {
  return s
    .replace(/&#0*(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n: string) => ENTITES[n.toLowerCase()] ?? m);
}

/** Texte visible d'un fragment, entités rendues et espaces repliés. */
function texteArkiane(fragment: string): string {
  return desechapper(fragment.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Découpe la réponse en cartes.
 *
 * Le conteneur est `card availability`. Se caler sur le formulaire de détail,
 * qui est plus facile à trouver, serait une erreur : il vit à la fin de la
 * carte, et découper là donne le prix d'un logement avec le titre du suivant.
 */
export function fragmentsArkiane(page: string): string[] {
  const debuts: number[] = [];
  const re = /class="card availability"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page)) !== null) debuts.push(m.index);
  return debuts.map((d, i) => page.slice(d, i + 1 < debuts.length ? debuts[i + 1] : page.length));
}

/** Un montant français : espace insécable pour les milliers, virgule décimale. */
function euros(texte: string): number | null {
  // Les espaces de groupement sont écrites en échappement : insécable,
  // insécable étroite, et ordinaire. Un caractère invisible dans un source se
  // relit mal et se recopie encore plus mal, et eslint le refuse à raison.
  const m = /([0-9][0-9\u00a0\u202f .]*)(?:,(\d{1,2}))?\s*\u20ac/.exec(texte);
  if (!m) return null;
  const entiere = (m[1] ?? "").replace(/\D/g, "");
  if (!entiere) return null;
  const v = Number(`${entiere}.${(m[2] ?? "0").padEnd(2, "0")}`);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function bloc(fragment: string, classe: string, fin = "</div>"): string | null {
  const re = new RegExp(`class="[^"]*\\b${classe}\\b[^"]*"[^>]*>([\\s\\S]{0,600}?)${fin.replace("/", "\\/")}`);
  const m = re.exec(fragment);
  return m ? (m[1] ?? "") : null;
}

function critere(fragment: string, nom: string): string | null {
  const m = new RegExp(`data-name="${nom}"[^>]*>([\\s\\S]{0,200}?)</li>`).exec(fragment);
  return m ? texteArkiane(m[1] ?? "") || null : null;
}

/**
 * Le formulaire de détail de la carte : son adresse et ses champs cachés.
 *
 * Les valeurs sont renvoyées telles quelles, espace finale comprise : la carte
 * écrit `value="06/02/2027 "`, et c'est ainsi que la centrale les a reçues au
 * relevé du 25 septembre 2026.
 */
function formulaireDetail(fragment: string): { action: string; champs: [string, string][] } | null {
  const m = /<form[^>]+action="([^"]*\/Lot\/Detail)"[^>]*>([\s\S]*?)<\/form>/.exec(fragment);
  if (!m) return null;
  const champs: [string, string][] = [];
  for (const i of (m[2] ?? "").matchAll(/<input\b[^>]*>/g)) {
    const nom = /\bname="([^"]+)"/.exec(i[0])?.[1];
    if (!nom) continue;
    champs.push([nom, desechapper(/\bvalue="([^"]*)"/.exec(i[0])?.[1] ?? "")]);
  }
  return champs.length ? { action: m[1] ?? "", champs } : null;
}

/**
 * L'adresse où renvoyer le formulaire de détail, ou `null` quand son action
 * mène hors de l'origine du marchand : le formulaire et les cookies de la
 * session ne partent que vers l'hôte qui les a donnés, et par le même
 * protocole.
 */
export function adresseDetailArkiane(marchand: string, action: string): string | null {
  try {
    const origine = new URL(`${marchand.replace(/\/+$/, "")}/`);
    const u = new URL(desechapper(action), origine);
    return u.origin === origine.origin ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Le titre, débarrassé de ce qui n'en fait pas partie.
 *
 * Le bloc porte parfois une légende d'image, « Photos non contractuelles »,
 * collée devant le nom ; et la centrale tronque les longs libellés avec des
 * points de suspension, ce qui laisse un bout de nombre orphelin à la fin.
 * Les deux sont retirés : un titre qui finit par « 57… » se lit comme une
 * erreur d'affichage, parce que c'en est une.
 */
export function titreArkiane(brut: string): string {
  let t = brut.replace(/^\s*Photos? non contractuelles?\s*/i, "").trim();
  t = t.replace(/\s*\S*[…]\s*$/u, "").trim();
  return t.replace(/\s*[-–]\s*$/, "").trim();
}

/**
 * Lit une réponse de recherche.
 *
 * Une carte qui porte encore `price_from_to` est écartée, et c'est le seul
 * rejet de ce moteur. Ce n'est pas un champ vide qu'on punit : ce marqueur est
 * la seule preuve, lisible dans le HTML, que la réponse est bien datée. Sans
 * dates, la centrale rend quarante et une cartes qui le portent toutes, avec un
 * tarif hebdomadaire d'appel ; les rendre disponibles à des dates qu'elles ne
 * connaissent pas serait pire que de les taire.
 *
 * Une carte sans bloc `.rate` du tout n'est pas rendue non plus — rien ne dit
 * alors qu'elle soit vendue à ces dates. Mais un bloc présent dont le montant
 * ne se lit pas donne un total de zéro : la carte sort, sans prix.
 */
export function lireArkiane(page: string): FicheArkiane[] {
  const out: FicheArkiane[] = [];
  for (const f of fragmentsArkiane(page)) {
    if (f.includes("price_from_to")) continue;
    const lot = /id="form-availability-(\d+)"/.exec(f)?.[1];
    if (!lot) continue;
    const tarif = bloc(f, "rate");
    if (tarif == null) continue;
    const total = euros(texteArkiane(tarif)) ?? 0;
    const catcher = bloc(f, "availability-catcher");
    const libelle = catcher ? texteArkiane(catcher) : "";
    const titre = titreArkiane(libelle);
    if (!titre) continue;
    const barre = bloc(f, "before", "</del>");
    const pax = critere(f, "lot_pax");
    const n = pax ? Number((/\d+/.exec(pax) ?? [""])[0]) : NaN;
    // La photo est prise sur le lien pleine taille, pas sur les pictogrammes
    // d'équipement, qui vivent sous `/Images/` (Disallow dans le robots.txt).
    const photo = /<a[^>]+href="(https?:\/\/[^"]*\/lv\/images\/lot\/[^"]+)"/.exec(f)?.[1] ?? null;
    const typeCommercial = critere(f, "lib_lot_type_cial");
    const p = /^(\d{1,2})\s+pi[eè]ces?$/i.exec(typeCommercial ?? "");
    out.push({
      lot,
      reference: /name="compare"[^>]+value="([^"]+)"/.exec(f)?.[1] ?? null,
      titre,
      libelle,
      total,
      avantRemise: barre ? euros(texteArkiane(barre)) : null,
      capacite: Number.isFinite(n) && n > 0 ? n : null,
      commune: critere(f, "lib_imme_station"),
      photo,
      typeCommercial,
      pieces: p && Number(p[1]) > 0 ? Number(p[1]) : null,
      detail: formulaireDetail(f),
    });
  }
  return out;
}

/** Le lien « Localiser ce bien » du détail, qui porte le point. */
const LIEN_CARTE =
  /google\.com\/maps\/search\/\?api=1&(?:amp;)?query=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/;
/** Sous le titre du détail : « Pralognan La Vanoise / Le Plan ». */
const STATION_QUARTIER =
  /<h3[^>]*>\s*<em[^>]*>([^<]*)<\/em>\s*\/\s*<em[^>]*>([^<]*)<\/em>\s*<\/h3>/;

/** Une page de détail se reconnaît à son en-tête de résultat. */
export function estDetailArkiane(page: string): boolean {
  return page.includes('class="result-header-container"');
}

/**
 * Lit le détail d'un lot : la réponse du `POST /fr-FR/Lot/Detail`.
 *
 * Les pavés sont reconnus à leur icône, jamais à leur rang : `fa-home` porte
 * les pièces, `fa-users` les personnes, `fa-bed` les chambres. « 0 chambre »
 * est une valeur, celle d'un studio (lot 179, « 1 pièce »). Le point est celui
 * du lien « Localiser ce bien », et seulement lui ; hors de France il ne vaut
 * rien. La description libre n'est pas lue : elle peut contredire le libellé
 * (« 6 personnes » au titre, « Capacité 4 personnes » dans le texte).
 */
export function lireDetailArkiane(page: string): DetailArkiane {
  const paves = new Map<string, string>();
  for (const m of page.matchAll(
    /<div class="details[^"]*">\s*<div class="fal fa-([a-z-]+)[^"]*"[^>]*><\/div>[\s\S]{0,300}?<div class="font-weight-bold text-center mt-2">([^<]{1,40})<\/div>/g,
  )) {
    const icone = m[1] ?? "";
    if (!paves.has(icone)) paves.set(icone, texteArkiane(m[2] ?? ""));
  }
  const nombre = (icone: string, unite: RegExp): number | null => {
    const m = new RegExp(`^(\\d{1,2})\\s+${unite.source}$`, "i").exec(paves.get(icone) ?? "");
    return m ? Number(m[1]) : null;
  };
  const pieces = nombre("home", /pi[eè]ces?/);
  const capacite = nombre("users", /personnes?/);

  const lieu = /id="location"[^>]*>([\s\S]{0,800}?)<\/div>/.exec(page)?.[1] ?? "";
  const q = LIEN_CARTE.exec(lieu);
  let lat = q ? Number(q[1]) : null;
  let lon = q ? Number(q[2]) : null;
  if (lat == null || lon == null || lat < 41 || lat > 52 || lon < -6 || lon > 10) {
    lat = null;
    lon = null;
  }

  const ems = STATION_QUARTIER.exec(page);
  return {
    lat,
    lon,
    chambres: nombre("bed", /chambres?/),
    pieces: pieces != null && pieces > 0 ? pieces : null,
    capacite: capacite != null && capacite > 0 ? capacite : null,
    quartier: ems ? texteArkiane(ems[2] ?? "") || null : null,
  };
}
