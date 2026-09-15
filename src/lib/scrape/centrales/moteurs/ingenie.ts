/**
 * Le moteur Ingénie, partie pure : construire l'URL, lire la réponse.
 *
 * Ingénie est le plus gros moteur du parc : vingt-huit centrales,
 * cinquante-quatre stations. Vingt-deux ferment la recherche datée par
 * `Disallow: /*booking?*`. On lit cette règle, on interroge quand même.
 *
 * **La première tentative échouait par notre faute.** Le formulaire porte
 * `action=searchAjax`, et c'est ce qu'on envoyait : le moteur répondait
 * « Une erreur s'est produite ». Le bouton « Afficher » n'envoie pas cette
 * action-là mais `action=result`, et celle-ci rend la liste complète en HTML.
 * Deux valeurs pour un même champ, et tout le moteur tenait à celle qu'on avait
 * lue en premier.
 *
 * **La requête la plus courte qui marche.** Elle a été réduite paramètre par
 * paramètre : `type_date` est inert — samedi, dimanche, dates libres ou vide
 * rendent la même page —, `redirectionUrl`, `target` et `reload` ne changent
 * rien, et aucune session n'est nécessaire. `type_prestataire=G`, en revanche,
 * est indispensable : sans lui la page revient vide.
 *
 * **Ce que le prix vaut.** L'étiquette de la centrale dit « à partir de », et
 * elle est reprise telle quelle : une fiche couvre parfois plusieurs lots, et
 * le nombre est celui du moins cher. Mais ce nombre est daté, et il suit la
 * durée — relevé du 13 septembre 2026, sur quatorze nuits au lieu de sept :
 * « Deneb 25 » passe de 1 980 € à 3 960 € et « Chalet Les Oursons » de 4 959 €
 * à 9 918 €, soit exactement le double ; aux Contamines les cinq logements
 * doublent aussi. Sans dates, la page ne porte aucune fiche. Ce n'est donc pas
 * un tarif d'affichage, c'est le total d'un séjour réservable à ces dates-là.
 *
 * **Aucune coordonnée.** La page de résultats ne porte ni `data-lat`, ni
 * `latitude`, ni bloc de géolocalisation : ces annonces ne paraissent donc pas
 * sur la carte, et l'écran les compte comme « sans localisation ». C'est exact,
 * et mieux qu'un point posé au hasard.
 *
 * **La capacité, quand le titre la dit clairement.** « Demi chalet de gauche
 * 8 personnes » est une annonce. « 2 appartements de 6 personnes face à face »
 * n'en est pas une : six ou douze, choisir c'est inventer, et le filtre
 * écarterait un logement que la centrale vient de proposer. Dans ce cas
 * `guests` reste vide, et l'écran dit « capacité non annoncée ».
 */

/** Une fiche telle que la centrale l'écrit, avant traduction en `Listing`. */
export type FicheIngenie = {
  /** Identifiant de prestation, stable d'une requête à l'autre. */
  id: string;
  titre: string;
  /**
   * Total du séjour, en euros.
   *
   * **`0` veut dire « la centrale n'a pas de tarif à ces dates »** — elle
   * l'écrit « à partir de 0 € » —, jamais « gratuit ». La fiche sort quand
   * même : c'est l'écran qui dira « listée sans prix ».
   */
  total: number;
  /** L'étiquette au-dessus du prix, par exemple « à partir de ». */
  etiquette: string | null;
  /**
   * Le bloc de prix tel qu'il se lit, ses trois morceaux dans l'ordre :
   * « À partir de 2 090 € pour la location ».
   *
   * Le troisième, `nature_prix_en_cours`, dit ce que le prix couvre et n'était
   * pas lu — or c'est la seule chose qui distingue « pour la location » d'un
   * prix par personne ou par nuit.
   */
  libelle: string | null;
  photo: string | null;
  /** Chemin de la fiche, relatif à la centrale. */
  chemin: string | null;
};

export type DemandeIngenie = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Nombre de nuits entre deux dates ISO. Zéro ou moins n'a pas de sens. */
export function nuitsEntre(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Une date ISO en `jj/mm/aaaa`, la seule forme que le moteur accepte. */
export function dateIngenie(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * L'URL d'une recherche datée.
 *
 * `cid` est le numéro de configuration du moteur, propre à chaque centrale ; il
 * se lit sur sa page d'accueil.
 */
export function urlIngenie(base: string, cid: number | string, d: DemandeIngenie): string {
  const p = new URLSearchParams();
  p.set("action", "result");
  p.set("cid", String(cid));
  p.set("MOTEUR_TYPES_PRESTATAIRE", "MOTEUR_HEBERGEMENT");
  p.set("type_prestataire", "G");
  p.set("datedeb", dateIngenie(d.checkIn));
  p.set("duree", String(nuitsEntre(d.checkIn, d.checkOut)));
  p.set("personnes", String(Math.max(1, Math.trunc(d.guests))));
  return `${base.replace(/\/+$/, "")}/booking?${p.toString()}`;
}

/**
 * Le `cid` publié par une page d'accueil Ingénie.
 *
 * Trois formes vues le 13 septembre 2026 : l'appel
 * `new IngenieMenuEngine.Client({ cid: N })`, un champ caché `name="cid"`,
 * un paramètre d'URL `cid=`. Sans lui la recherche revient vide.
 */
export function cidDepuisPage(html: string): string | null {
  const client = /IngenieMenuEngine\.Client\(\s*\{[^}]*\bcid\s*:\s*['"]?(\d+)/i.exec(html);
  if (client?.[1]) return client[1];
  const champ =
    /name=["']cid["'][^>]*value=["'](\d+)["']/i.exec(html) ??
    /value=["'](\d+)["'][^>]*name=["']cid["']/i.exec(html);
  if (champ?.[1]) return champ[1];
  const url = /\bcid=(\d+)/i.exec(html);
  return url?.[1] ?? null;
}

const ENTITES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // Espace insécable, écrite en échappement : un caractère invisible dans le
  // source se relit mal. C'est elle qui groupe les milliers, « 1 300 € ».
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
  sup2: "²",
  euro: "\u20ac",
};

function desechapper(s: string): string {
  return s
    .replace(/&#0*(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n: string) => ENTITES[n.toLowerCase()] ?? m);
}

/** Texte visible d'un fragment : scripts et balises retirés, espaces repliés. */
export function texteIngenie(fragment: string): string {
  const sans = fragment
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return desechapper(sans.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Découpe la page en fiches.
 *
 * Le nom de la classe change d'une centrale à l'autre —
 * `fiche_liste_immobilier_agen_loueur_resid_prestation_RESA_v3` à Risoul,
 * `fiche_liste_appartements_chalets_prestation_v2` aux Contamines. Seul le
 * préfixe `fiche_liste` leur est commun, et c'est donc lui qu'on suit.
 */
export function fragmentsIngenie(page: string): string[] {
  const debuts: number[] = [];
  const re = /class="[^"]*\bfiche_liste[^"]*"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page)) !== null) debuts.push(m.index);
  return debuts.map((d, i) => page.slice(d, i + 1 < debuts.length ? debuts[i + 1] : page.length));
}

function titreDe(fragment: string): string {
  // `itemprop="name"` est le plus fiable : les deux gabarits connus le portent.
  const nom = /itemprop="name"[^>]*>([\s\S]{0,220}?)</.exec(fragment);
  const t1 = nom ? texteIngenie(nom[1] ?? "") : "";
  if (t1) return t1;
  const lien = /class="[^"]*ga4-fiche-link[^"]*"[^>]*>([\s\S]{0,220}?)<\/a>/.exec(fragment);
  const t2 = lien ? texteIngenie(lien[1] ?? "") : "";
  if (t2) return t2;
  const alt = /<img[^>]+alt="([^"]{2,120})"/.exec(fragment);
  return alt ? desechapper(alt[1] ?? "").trim() : "";
}

function photoDe(fragment: string): string | null {
  const m = /<img[^>]+(?:src|data-src)="(https?:\/\/[^"]+)"/.exec(fragment);
  return m?.[1] ?? null;
}

/** Le bloc de tarif : le montant lu, et le montant tel qu'il est écrit. */
type TarifIngenie = { total: number; montant: string | null };

/**
 * Lit le bloc de tarif.
 *
 * `null` quand il n'y en a pas : sans dates la page n'en porte aucun, et c'est
 * ainsi que la centrale dit qu'elle ne vend pas cette fiche à ces dates-là.
 *
 * Un zéro n'est pas un prix — plusieurs centrales affichent « à partir de 0 € »
 * pour un logement dont elles n'ont pas le tarif — mais ce n'est pas non plus
 * une raison de supprimer l'annonce : le total vaut alors zéro, ce qui se lit
 * « listée sans prix » partout ailleurs dans le dépôt, et l'écran sait le dire.
 */
function tarifDe(fragment: string): TarifIngenie | null {
  const m = /class="prix_en_cours"[^>]*>([\s\S]{0,160}?)<\/div>/.exec(fragment);
  if (!m) return null;
  // Le texte est décodé d'abord : certaines centrales écrivent la monnaie en
  // entité, « 700 &euro; », et couper sur le signe littéral les manquerait.
  // Le montant peut porter une virgule décimale et des espaces de groupement,
  // ici écrites en échappement pour rester visibles dans le source.
  const texte = texteIngenie(m[1] ?? "");
  const montant = texte || null;
  const p = /([0-9][0-9\u00a0\u202f .]*)(?:,(\d{1,2}))?\s*\u20ac/.exec(texte);
  if (!p) return { total: 0, montant };
  const entiere = (p[1] ?? "").replace(/\D/g, "");
  if (!entiere) return { total: 0, montant };
  const v = Number(`${entiere}.${(p[2] ?? "0").padEnd(2, "0")}`);
  return { total: Number.isFinite(v) && v > 0 ? v : 0, montant };
}

/**
 * Lit une page de résultats.
 *
 * Une fiche **sans bloc de tarif** n'est pas rendue : la centrale la connaît,
 * mais elle ne la vend pas à ces dates-là. Sans dates, la page n'en porte
 * aucun, et c'est ainsi qu'on sait que ces prix sont datés. Une fiche dont le
 * bloc est là mais dit « à partir de 0 € » sort, elle, avec un total de zéro :
 * la centrale la liste sans en publier le tarif, et c'est un renseignement.
 */
export function lireIngenie(page: string): FicheIngenie[] {
  const par = new Map<string, FicheIngenie>();
  for (const fragment of fragmentsIngenie(page)) {
    const tarif = tarifDe(fragment);
    if (tarif == null) continue;
    const ident =
      /id="(PRESTATION-[^"]+)"/.exec(fragment)?.[1] ??
      /data-ga-item-id="([^"]+)"/.exec(fragment)?.[1] ??
      null;
    if (!ident) continue;
    const titre = titreDe(fragment);
    if (!titre) continue;
    // Une fiche paraît parfois deux fois dans la même page : le moins cher
    // l'emporte. Zéro n'est pas moins cher, c'est l'absence de prix.
    const deja = par.get(ident);
    if (deja && !(tarif.total > 0 && (deja.total <= 0 || tarif.total < deja.total))) continue;
    const etiq = /class="libelle_a_partir_de"[^>]*>([\s\S]{0,80}?)<\/div>/.exec(fragment);
    // Ce que le prix couvre, écrit à sa droite : « pour la location ». Publié
    // par les deux gabarits connus, et lu par aucun des deux jusqu'ici.
    const nat = /class="nature_prix_en_cours"[^>]*>([\s\S]{0,80}?)<\/div>/.exec(fragment);
    const lien = /class="lien_plus_info_resa[^"]*"\s*>\s*<a[^>]+href="([^"]+)"/.exec(fragment);
    const etiquette = etiq ? texteIngenie(etiq[1] ?? "") || null : null;
    const nature = nat ? texteIngenie(nat[1] ?? "") || null : null;
    par.set(ident, {
      id: ident,
      titre,
      total: tarif.total,
      etiquette,
      // Les trois morceaux du bloc, dans l'ordre où la centrale les écrit :
      // c'est sa phrase, pas la nôtre.
      libelle: [etiquette, tarif.montant, nature].filter(Boolean).join(" ") || null,
      photo: photoDe(fragment),
      chemin: lien ? desechapper(lien[1] ?? "") : null,
    });
  }
  return [...par.values()];
}
