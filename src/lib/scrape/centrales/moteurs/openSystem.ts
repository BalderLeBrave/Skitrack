/**
 * Le moteur Open System, partie pure : construire l'URL, lire la réponse.
 *
 * Open System équipe sept des centrales du parc, soit seize stations. Il en
 * existe deux générations ; celle-ci est la moderne, reconnaissable à ses pages
 * `pr<N>-....htm` et à son script `js/moteurrecherche.js`.
 *
 * **Le paramètre de dates ne s'invente pas.** Le formulaire porte des champs
 * `datearrivee` et `datedepart`, et les passer en requête rend une erreur 500 :
 * ce sont des noms de champs de saisie, pas des noms de paramètres. La fonction
 * `calculeReq()` de `js/moteurrecherche.js` montre la vraie syntaxe, qui est
 * `DateRecherche=aaaa-mm-jj|aaaa-mm-jj`. C'est la seule qui réponde.
 *
 * **Ce que le prix vaut.** Relevé du 13 septembre 2026 sur
 * `reservation.haute-maurienne-vanoise.com`, du 6 au 13 février 2027 :
 *
 * - sans dates, aucune fiche ne porte de prix — le gabarit du tarif est même
 *   commenté dans la page ;
 * - avec dates, cinquante fiches en portent un ;
 * - sur trois nuits au lieu de sept, « La clé des champs » passe de 840 € à
 *   360 € et « Le chalet d'Isis » de 1 295 € à 555 €. Cent vingt et cent
 *   quatre-vingt-cinq euros la nuit dans les deux cas.
 *
 * C'est donc un total de séjour pour les dates demandées, et non un « à partir
 * de ». L'étiquette de la centrale dit « Prix indicatif » ; elle est reprise
 * telle quelle dans `proven`, sans être ni gonflée ni tue.
 *
 * **Deux limites, qui ne se cachent pas.** La centrale rend cinquante fiches au
 * plus par page, et sa pagination ne répond pas en requête simple : les quatre
 * premiers index rendent tous la même page. Le relevé est donc un plancher, pas
 * un inventaire. Et aucune fiche n'annonce sa capacité ni son nombre de
 * chambres : `guests` et `bedrooms` restent vides, ce que l'écran sait dire.
 */

/** Une fiche telle que la centrale l'écrit, avant traduction en `Listing`. */
export type FicheOpenSystem = {
  /** Chemin de la fiche, sans chaîne de requête, tel que la centrale l'écrit. */
  chemin: string;
  /**
   * Le logement, débarrassé de la rubrique par laquelle on l'a trouvé.
   *
   * Le chemin porte le numéro de rubrique : « La clé des champs » se lit
   * `/dp7-la-cle-des-champs-.../OSHO-38735` dans « tous nos hébergements » et
   * `/dp8-la-cle-des-champs-.../OSHO-38735` dans « hôtels et résidences ». Le
   * même logement, deux chemins. Prendre le chemin pour identité le compterait
   * deux fois, et gonflerait le relevé d'autant.
   */
  identite: string;
  /**
   * Référence portée par l'URL.
   *
   * Elle n'identifie **pas** le logement : `MARK-101602` désigne huit biens
   * différents dans un même relevé. C'est un code de mandataire, gardé pour la
   * trace, jamais comme clé.
   */
  reference: string | null;
  titre: string;
  /** Total du séjour, en euros. */
  total: number;
  /** L'étiquette de la centrale au-dessus du prix, par exemple « Prix indicatif ». */
  etiquette: string | null;
  photo: string | null;
  lat: number | null;
  lon: number | null;
  adresse: string | null;
  /** Commune telle que l'adresse la porte, code postal retiré. */
  commune: string | null;
};

export type DemandeOpenSystem = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Nombre de fiches par page accepté par le moteur. Au-delà, il retombe à 50. */
export const OPEN_SYSTEM_PAR_PAGE = 50;

/**
 * L'URL d'une recherche datée.
 *
 * La barre verticale est encodée : les liens de pagination que la centrale
 * fabrique elle-même l'encodent, et un `|` nu n'est pas un caractère d'URL.
 */
export function urlOpenSystem(base: string, chemin: string, d: DemandeOpenSystem): string {
  const p = new URLSearchParams();
  p.set("DateRecherche", `${d.checkIn}|${d.checkOut}`);
  p.set("nbpers", String(Math.max(1, Math.trunc(d.guests))));
  p.set("NbParPage", String(OPEN_SYSTEM_PAR_PAGE));
  return `${base.replace(/\/+$/, "")}${chemin}?${p.toString()}`;
}

const ENTITES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // Espace insécable, écrite en échappement : un caractère invisible dans le
  // source se relit mal et se recopie encore plus mal.
  nbsp: "\u00a0",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ugrave: "ù",
  ucirc: "û",
  icirc: "î",
  iuml: "ï",
  euml: "ë",
};

function desechapper(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n: string) => ENTITES[n.toLowerCase()] ?? m);
}

/** Texte visible d'un fragment : commentaires retirés, balises retirées, espaces repliés. */
export function texteOpenSystem(fragment: string): string {
  const sansScript = fragment.replace(/<script\b[\s\S]*?<\/script>/gi, " ");
  const sansCommentaire = sansScript.replace(/<!--[\s\S]*?-->/g, " ");
  return desechapper(sansCommentaire.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Découpe la page en fiches.
 *
 * Chaque fiche s'ouvre sur une classe `item-produit` et court jusqu'à la
 * suivante. Le gabarit ne referme pas ses conteneurs de façon exploitable, et
 * compter les `<div>` sur du HTML d'IIS non validé est plus fragile que cette
 * découpe-là.
 */
export function fragmentsOpenSystem(page: string): string[] {
  const debuts: number[] = [];
  const re = /class="[^"]*\bitem-produit\b[^"]*"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page)) !== null) debuts.push(m.index);
  return debuts.map((d, i) => page.slice(d, i + 1 < debuts.length ? debuts[i + 1] : page.length));
}

/**
 * Les coordonnées, écrites en notation scientifique par `tabPointCarto.push`.
 *
 * `latitude:"4.526054274308790e+001"` vaut 45,26. `Number()` lit cette notation
 * sans aide. Un point hors de France métropolitaine et de ses marges est rejeté
 * plutôt que placé de travers sur la carte.
 */
function coordonnees(fragment: string): { lat: number | null; lon: number | null } {
  const m = /latitude\s*:\s*"([^"]+)"\s*,\s*longitude\s*:\s*"([^"]+)"/.exec(fragment);
  if (!m) return { lat: null, lon: null };
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: null, lon: null };
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) return { lat: null, lon: null };
  return { lat, lon };
}

/**
 * Le total, tel que le gabarit le coupe.
 *
 * Le moteur écrit la partie entière et la partie décimale dans deux `<span>`
 * distincts, et glisse des espaces de groupement dans la première. La partie
 * décimale est souvent vide : c'est un montant rond, pas un montant manquant.
 */
function total(fragment: string): number | null {
  const m = /class="prix"\s*>\s*<span class="partie-entiere">([^<]*)<\/span>\s*<span class="partie-decimale">([^<]*)<\/span>/.exec(
    fragment,
  );
  if (!m) return null;
  const entiere = (m[1] ?? "").replace(/\D/g, "");
  if (!entiere) return null;
  const decimale = (m[2] ?? "").replace(/\D/g, "").slice(0, 2).padEnd(2, "0");
  const v = Number(entiere) + Number(decimale) / 100;
  return Number.isFinite(v) && v > 0 ? v : null;
}

function titre(fragment: string): string {
  const h3 = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(fragment);
  if (h3) {
    // Le `<h3>` porte le nom, puis un lien « voir sur la carte » et le nom de
    // la commune. On s'arrête au premier de ces deux-là.
    const avant = (h3[1] ?? "").split(/<(?:a|span)\b/)[0] ?? "";
    const t = texteOpenSystem(avant);
    if (t) return t;
  }
  const libelle = /class="ItemCartoDescrLibelle"[^>]*>([\s\S]*?)<\/div>/.exec(fragment);
  if (libelle) return texteOpenSystem(libelle[1] ?? "");
  const alt = /<img[^>]+alt="([^"]+)"/.exec(fragment);
  return alt ? desechapper(alt[1] ?? "").trim() : "";
}

function adresseEtCommune(fragment: string): { adresse: string | null; commune: string | null } {
  const m = /class="ItemCartoDescrAdresse"[^>]*>([\s\S]*?)<\/div>/.exec(fragment);
  if (!m) return { adresse: null, commune: null };
  const brut = texteOpenSystem((m[1] ?? "").replace(/<br\s*\/?>/gi, " | "));
  const adresse = brut.replace(/\s*\|\s*/g, ", ").trim() || null;
  const cp = /\b(\d{5})\s+(.+)$/.exec(brut.replace(/\s*\|\s*/g, " "));
  const commune = cp ? (cp[2] ?? "").trim() || null : null;
  return { adresse, commune };
}

function photo(fragment: string): string | null {
  const m = /class="vignette[^"]*"[^>]*>\s*<a[^>]*>\s*<img[^>]+src="([^"]+)"/.exec(fragment);
  const src = m?.[1] ?? /<img[^>]+src="(https?:\/\/[^"]+)"/.exec(fragment)?.[1] ?? null;
  if (!src) return null;
  return src.startsWith("//") ? `https:${src}` : src;
}

/**
 * L'identité d'un logement, la rubrique ôtée.
 *
 * Exportée parce qu'elle est la clé du dédoublonnage entre rubriques, et que
 * c'est le genre de détail qu'on n'a pas envie de redécouvrir deux fois.
 */
export function identiteOpenSystem(chemin: string): string {
  return chemin.replace(/^\/dp\d+-/, "");
}

/**
 * Lit une page de résultats.
 *
 * Une fiche sans total n'est pas rendue : la centrale la connaît, mais elle ne
 * la vend pas à ces dates-là, et une annonce sans prix n'a rien à faire dans
 * une comparaison de prix.
 *
 * Le même logement peut apparaître plusieurs fois, une ligne par lot dans une
 * page et une fois par rubrique où il figure. On garde le moins cher, sous son
 * identité sans rubrique : c'est ce qu'il en coûte d'y dormir, compté une fois.
 */
export function lireOpenSystem(page: string): FicheOpenSystem[] {
  const par = new Map<string, FicheOpenSystem>();
  for (const fragment of fragmentsOpenSystem(page)) {
    const lien = /href="(\/dp\d+-[^"?#]+)/.exec(fragment);
    const somme = total(fragment);
    if (!lien || somme == null) continue;
    const chemin = lien[1] ?? "";
    const nom = titre(fragment);
    if (!chemin || !nom) continue;
    const identite = identiteOpenSystem(chemin);
    const dejaLa = par.get(identite);
    if (dejaLa && dejaLa.total <= somme) continue;
    const { lat, lon } = coordonnees(fragment);
    const { adresse, commune } = adresseEtCommune(fragment);
    const etiq = /class="prefix"[^>]*>([\s\S]*?)<\/div>/.exec(fragment);
    par.set(identite, {
      chemin,
      identite,
      reference: /\/([A-Za-z]+-[\d-]+)$/.exec(chemin)?.[1] ?? null,
      titre: nom,
      total: somme,
      etiquette: etiq ? texteOpenSystem(etiq[1] ?? "") || null : null,
      photo: photo(fragment),
      lat,
      lon,
      adresse,
      commune,
    });
  }
  return [...par.values()];
}
