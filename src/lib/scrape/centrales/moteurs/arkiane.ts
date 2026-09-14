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
 * **Ce qu'elle donne et ce qu'elle ne donne pas.** La capacité est un champ
 * structuré, `lot_pax`, et la station aussi, `lib_imme_station`. Il n'y a en
 * revanche aucune coordonnée, et aucune adresse de fiche atteignable en `GET` :
 * le détail d'un lot est lui aussi un `POST`. Le lien mène donc à la centrale.
 */

/** Une carte telle que la centrale l'écrit, avant traduction en `Listing`. */
export type FicheArkiane = {
  /** Numéro de lot, stable d'une requête à l'autre. */
  lot: string;
  /** Référence commerciale affichée, par exemple « BCT1 ». */
  reference: string | null;
  titre: string;
  /** Total du séjour, en euros. */
  total: number;
  /** Prix barré, quand la centrale en affiche un. */
  avantRemise: number | null;
  capacite: number | null;
  commune: string | null;
  photo: string | null;
};

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
 * `selectedCriteria` porte les filtres sous la forme `nom|valeur` ; `lot_pax`
 * est la capacité. `take` et `skip` sont la pagination, et cinquante est ce que
 * la centrale demande elle-même.
 */
export function corpsArkiane(d: DemandeArkiane): Record<string, string> {
  return {
    selectedCriteria: `lot_pax|${Math.max(1, Math.trunc(d.guests))}`,
    startDate: dateArkiane(d.checkIn),
    endDate: dateArkiane(d.checkOut),
    take: "50",
    skip: "1",
    orderBy: "",
    comm_no: "0",
    comm_type: "DEFAUT",
    filtre: "",
    budget: "",
    package_qte: "",
  };
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
 * Une carte qui porte encore `price_from_to` est écartée : c'est le libellé
 * que la centrale affiche quand elle n'a pas de dates, et le nombre qui
 * l'accompagne est un tarif hebdomadaire d'appel, pas un total de séjour.
 */
export function lireArkiane(page: string): FicheArkiane[] {
  const out: FicheArkiane[] = [];
  for (const f of fragmentsArkiane(page)) {
    if (f.includes("price_from_to")) continue;
    const lot = /id="form-availability-(\d+)"/.exec(f)?.[1];
    if (!lot) continue;
    const tarif = bloc(f, "rate");
    const total = tarif ? euros(texteArkiane(tarif)) : null;
    if (total == null) continue;
    const catcher = bloc(f, "availability-catcher");
    const titre = titreArkiane(catcher ? texteArkiane(catcher) : "");
    if (!titre) continue;
    const barre = bloc(f, "before", "</del>");
    const pax = critere(f, "lot_pax");
    const n = pax ? Number((/\d+/.exec(pax) ?? [""])[0]) : NaN;
    // La photo est prise sur le lien pleine taille, pas sur les pictogrammes
    // d'équipement, qui vivent sous `/Images/` (Disallow dans le robots.txt).
    const photo = /<a[^>]+href="(https?:\/\/[^"]*\/lv\/images\/lot\/[^"]+)"/.exec(f)?.[1] ?? null;
    out.push({
      lot,
      reference: /name="compare"[^>]+value="([^"]+)"/.exec(f)?.[1] ?? null,
      titre,
      total,
      avantRemise: barre ? euros(texteArkiane(barre)) : null,
      capacite: Number.isFinite(n) && n > 0 ? n : null,
      commune: critere(f, "lib_imme_station"),
      photo,
    });
  }
  return out;
}
