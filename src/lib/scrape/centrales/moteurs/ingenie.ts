/**
 * Le moteur Ingénie, partie pure : construire l'URL, lire la réponse.
 *
 * Ingénie est le plus gros moteur du parc : vingt-huit centrales,
 * cinquante-quatre stations. Il est aussi le plus fermé, et c'est pour cela
 * qu'il arrive tard.
 *
 * **Sur vingt-huit centrales, cinq seulement s'interrogent.** Les vingt-deux
 * autres ferment la recherche datée par `Disallow: /*booking?*`. Une
 * vingt-troisième, Chamrousse, porte des règles qui visent nommément les
 * paramètres de son propre formulaire sans les atteindre à la lettre : elle est
 * tenue pour fermée, parce que réordonner une URL pour qu'une règle cesse de
 * s'y appliquer serait une exception déguisée.
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
 * **Aucune coordonnée, et aucune capacité.** La page de résultats ne porte ni
 * `data-lat`, ni `latitude`, ni bloc de géolocalisation : ces annonces ne
 * paraissent donc pas sur la carte, et l'écran les compte comme « sans
 * localisation ». C'est exact, et mieux qu'un point posé au hasard.
 *
 * La capacité a été lue dans le titre, puis retirée. Beaucoup de titres
 * l'annoncent — « Demi chalet de gauche 8 personnes » — mais pas tous de la
 * même chose. « 2 appartements de 6 personnes face à face » vaut douze places,
 * et la centrale le rend bien pour une recherche à huit : en lire « 6 », c'est
 * faire écarter par le filtre un logement que la centrale vient de proposer.
 * Un nombre juste neuf fois sur dix est un nombre faux. `guests` reste vide, et
 * l'écran dit « capacité non annoncée », ce qui est la vérité.
 */

/** Une fiche telle que la centrale l'écrit, avant traduction en `Listing`. */
export type FicheIngenie = {
  /** Identifiant de prestation, stable d'une requête à l'autre. */
  id: string;
  titre: string;
  /** Total du séjour, en euros. */
  total: number;
  /** L'étiquette au-dessus du prix, par exemple « à partir de ». */
  etiquette: string | null;
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
 * se lit sur sa page d'accueil et vit dans son fichier de connecteur.
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

function totalDe(fragment: string): number | null {
  const m = /class="prix_en_cours"[^>]*>([\s\S]{0,80}?)<\/div>/.exec(fragment);
  if (!m) return null;
  // « 1 300 € », avec une espace insécable de groupement.
  const chiffres = (m[1] ?? "").split("€")[0]?.replace(/\D/g, "") ?? "";
  if (!chiffres) return null;
  const v = Number(chiffres);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Lit une page de résultats.
 *
 * Une fiche sans prix n'est pas rendue : la centrale la connaît, mais elle ne
 * la vend pas à ces dates-là. Sans dates, la page n'en porte aucune, et c'est
 * ainsi qu'on sait que ces prix sont datés.
 */
export function lireIngenie(page: string): FicheIngenie[] {
  const par = new Map<string, FicheIngenie>();
  for (const fragment of fragmentsIngenie(page)) {
    const total = totalDe(fragment);
    if (total == null) continue;
    const ident =
      /id="(PRESTATION-[^"]+)"/.exec(fragment)?.[1] ??
      /data-ga-item-id="([^"]+)"/.exec(fragment)?.[1] ??
      null;
    if (!ident) continue;
    const titre = titreDe(fragment);
    if (!titre) continue;
    const deja = par.get(ident);
    if (deja && deja.total <= total) continue;
    const etiq = /class="libelle_a_partir_de"[^>]*>([\s\S]{0,80}?)<\/div>/.exec(fragment);
    const lien = /class="lien_plus_info_resa[^"]*"\s*>\s*<a[^>]+href="([^"]+)"/.exec(fragment);
    par.set(ident, {
      id: ident,
      titre,
      total,
      etiquette: etiq ? texteIngenie(etiq[1] ?? "") || null : null,
      photo: photoDe(fragment),
      chemin: lien ? desechapper(lien[1] ?? "") : null,
    });
  }
  return [...par.values()];
}
