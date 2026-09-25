/**
 * La règle du propriétaire sur les types de logement, pour toutes les centrales.
 *
 * Skitrack ne garde que des maisons, des appartements, des chalets, des gîtes
 * meublés et des résidences de location. Sont écartés : le camping ;
 * l'hébergement insolite (tente, yourte, bulle, tipi, roulotte, cabane dans les
 * arbres, mobil-home, caravane, bateau ou péniche, igloo) ; le refuge ; la
 * chambre d'hôtes ; la chambre seule ; le gîte d'étape ; le gîte de groupe ou
 * de séjour ; l'auberge de jeunesse et le dortoir ; l'hôtel, l'appart'hôtel, la
 * résidence hôtelière et le village club.
 *
 * **On juge le type publié, pas le nom.** Le type, c'est ce que la centrale
 * écrit dans un champ fait pour cela : « Appartement 4 pièces », « Studio »,
 * « Gîte 2 pièces », « Maison individuelle », « Chalet » (Open System, relevé
 * du 25 septembre 2026), « Appartement » (Orchestra), « Appartments, studios »
 * (iResa), « Chalet individuel » ou « Hôtel » (catégories Feratel), « 3 pièces »
 * ou « Chambre » (type commercial Arkiane). Un nom ne dit pas de type :
 * « Chalet Les Bulles » n'est pas une bulle, « Le Refuge », à Bessans, est un
 * appartement de deux pièces. Seul le camping se cherche aussi dans le titre et
 * le chemin (`motifNomHorsRegle`), jamais dans l'adresse : Open System publie
 * « Chalet » pour les chalets d'un camping, et une rue du Camping n'en est pas un.
 *
 * **Un type inconnu est gardé, et nommé au journal.** « Loft », « T2 »,
 * « Mazot », « Penthouse », « Logement », « Location » ou « Ferme rénovée »
 * ne sont dans aucune des deux listes : rien ne dit qu'ils sortent de la règle,
 * et écarter ce qu'on ne connaît pas ferait perdre des logements sans le dire.
 * `typeInconnu` les signale, et chaque moteur en écrit la liste.
 *
 * **Un type absent n'est pas jugé ici.** Ce qu'il vaut dépend du moteur : chez
 * Open System, c'est la marque des hôtels, des résidences et de l'insolite ;
 * ailleurs, il n'a pas été observé. Chaque moteur décide, et le dit.
 *
 * **Les mots se lisent entiers.** « Multipièces » ne contient pas de tipi, ni
 * « Appartement 2 chambres » de chambre seule : un mot de la liste ne compte
 * que borné, et certains seulement en tête du type (`TETES_ECARTEES`).
 */

/** Minuscules, sans accents : « Gîte d'étape » et « GITE D ETAPE » se valent. */
export function plierType(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Les noms d'hébergement insolite qui servent aussi de noms propres. */
const INSOLITES = String.raw`(?:tentes?|yourtes?|bulles?|tipis?|roulottes?|cabanes?|caravanes?|bateaux?|peniches?|igloos?)`;

/**
 * Les types écartés où qu'ils paraissent dans le type publié, avec le mot qui
 * le dit au journal. Aucun ne sert de nom de logement.
 *
 * L'ordre compte : « Appart'hôtel » et « Résidence hôtelière » doivent être
 * nommés avant de tomber comme hôtels, et « Hôtels et résidences de tourisme »
 * tombe comme hôtel avant d'être reconnu comme une résidence.
 */
const ECARTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcampings?\b|\bhotellerie\s+de\s+plein\s+air\b/, "camping"],
  [/\b(?:hebergements?\s+)?insolites?\b/, "hébergement insolite"],
  [/\bmobil(?:e)?[\s-]?homes?\b/, "hébergement insolite"],
  [/\bcabanes?\s+(?:dans\s+les\s+arbres|perchees?)\b/, "hébergement insolite"],
  // « Nuit en yourte », « séjour sous tente », « logement dans une bulle ».
  [
    new RegExp(
      String.raw`\b(?:en|dans|sous)\s+(?:(?:un|une|des|les|la|le|l)\W*\s*)?${INSOLITES}\b`,
    ),
    "hébergement insolite",
  ],
  // « Chambre d'hôtes », « maison d'hôtes », « table d'hôtes ».
  [/\bd\W*\s*hotes?\b/, "chambre d'hôtes"],
  [/\bgites?\s+d\W*\s*etapes?\b/, "gîte d'étape"],
  // La convention du dépôt pour Gîtes de France (`isDroppedGitesOffer`).
  [/\bgites?\s+de\s+(?:groupes?|sejours?)\b/, "gîte de groupe ou de séjour"],
  [/\bauberges?\s+de\s+(?:la\s+)?jeunesse\b|\bdortoirs?\b/, "auberge de jeunesse ou dortoir"],
  [/\bappart(?:ement)?s?\s*[-'’]?\s*hotel(?:s|iers?)?\b/, "appart'hôtel"],
  [/\bresidences?\s+hotelieres?\b/, "résidence hôtelière"],
  [/\bvillages?[\s-]+clubs?\b/, "village club"],
  [/\bhotels?\b/, "hôtel"],
  [/\brefuges?\b/, "refuge"],
];

/**
 * Les types écartés seulement quand ils ouvrent le type publié. En tête, le mot
 * dit ce qu'on loue : « Chambre », « Chambre double », « Yourte », « Bulle ».
 * Plus loin, c'est un complément ou un nom : « Appartement 2 chambres »,
 * « Chalet Les Bulles », « Chalet de la cabane ».
 */
const TETES_ECARTEES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\W*chambres?\b/, "chambre seule"],
  [new RegExp(String.raw`^\W*${INSOLITES}\b`), "hébergement insolite"],
];

/**
 * Les types connus et gardés. « Appartments » : iResa l'écrit ainsi. « Villa »,
 * « duplex », « meublé » et « multipièces » n'ont été relevés sur aucune
 * centrale ; ce sont des maisons, des appartements et des meublés.
 */
const GARDES =
  /\b(?:appart\w*|studios?|studettes?|duplex|triplex|chalets?|maisons?|villas?|gites?|meubles?|residences?|multi-?pieces?|\d{1,2}\s*pieces?|pieces?)\b/;

/** Le type plié, espaces repliées ; vide quand il n'y a rien à juger. */
function plie(type: string | null | undefined): string {
  return plierType(type ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Le motif d'écart d'un type publié, ou `null` quand le type est gardé, qu'il
 * soit connu ou non (`typeInconnu`). Un type vide rend `null` : ce n'est pas un
 * type, et le moteur en décide (voir l'en-tête).
 */
export function motifTypeHorsRegle(type: string | null | undefined): string | null {
  const t = plie(type);
  if (!t) return null;
  for (const [motif, mot] of ECARTES) if (motif.test(t)) return mot;
  for (const [motif, mot] of TETES_ECARTEES) if (motif.test(t)) return mot;
  return null;
}

/**
 * Vrai quand un type publié est gardé sans être dans la liste des types
 * connus : « Loft », « T2 », « Mazot », « Logement ». Il n'est pas écarté ; le
 * moteur le nomme au journal, pour qu'on sache ce qu'il a laissé passer.
 */
export function typeInconnu(type: string | null | undefined): boolean {
  const t = plie(type);
  return t !== "" && motifTypeHorsRegle(type) == null && !GARDES.test(t);
}

/**
 * Une voie qui porte le nom d'un camping n'est pas un camping : « 12 rue du
 * Camping ». Elle est ôtée avant de chercher le mot.
 */
const VOIE_DU_CAMPING =
  /\b(?:rue|route|chemin|allee|avenue|impasse|place|montee|sentier|quai|boulevard|square)\s+(?:du|de\s+la|des|de)\s+campings?\b/g;

/**
 * Le camping dans le titre ou le chemin d'une fiche, ou `null`. C'est le seul
 * motif qu'on cherche ailleurs que dans le type : « CAMPING LA BUIDONNIERE*** »
 * est publié « Chalet » chez Open System. Les autres mots de la règle ne sont
 * jamais cherchés dans un nom. L'adresse n'est jamais passée ici.
 */
export function motifNomHorsRegle(
  ...noms: ReadonlyArray<string | null | undefined>
): string | null {
  const t = plierType(noms.filter(Boolean).join(" "))
    .replace(/[^a-z0-9]+/g, " ")
    .replace(VOIE_DU_CAMPING, " ");
  return /\bcampings?\b/.test(t) ? "camping" : null;
}

/** Le verdict de la règle sur ce qu'une centrale publie d'un logement. */
export type VerdictRegle = {
  /** Le motif d'écart, ou `null` quand le logement est gardé. */
  motif: string | null;
  /** Le type publié, tel quel, quand il est gardé sans être connu. */
  inconnu: string | null;
};

/**
 * La règle entière : le type publié d'abord, puis le camping dans le titre et
 * le chemin. Un type vide n'écarte rien ici (voir l'en-tête).
 */
export function jugerLogement(p: {
  type: string | null | undefined;
  titre?: string | null;
  chemin?: string | null;
}): VerdictRegle {
  const motif = motifTypeHorsRegle(p.type) ?? motifNomHorsRegle(p.titre, p.chemin);
  if (motif) return { motif, inconnu: null };
  return { motif: null, inconnu: typeInconnu(p.type) ? (p.type ?? "").trim() : null };
}

/** Ajoute un à ce que compte `cle`. */
export function compter(compte: Map<string, number>, cle: string): void {
  compte.set(cle, (compte.get(cle) ?? 0) + 1);
}

/**
 * Les phrases du journal : « écartés hors règle — hôtel (5), camping (1) » et
 * « types inconnus gardés — Loft (2), T2 (1) ». Rien quand il n'y a rien.
 */
export function phrasesRegle(
  ecartes: ReadonlyMap<string, number>,
  inconnus: ReadonlyMap<string, number>,
): string[] {
  const liste = (m: ReadonlyMap<string, number>) =>
    [...m].map(([cle, n]) => `${cle} (${n})`).join(", ");
  const out: string[] = [];
  if (ecartes.size > 0) out.push(`écartés hors règle — ${liste(ecartes)}`);
  if (inconnus.size > 0) out.push(`types inconnus gardés — ${liste(inconnus)}`);
  return out;
}
