/**
 * Ce que chaque domaine européen sait montrer : une photo, un forfait.
 *
 *     node --experimental-strip-types scripts/build-vues-monde.ts
 *
 * Écrit `src/lib/monde/data/vuesDomaines.json`, qui remplace
 * `photosDomaines.json` et `forfaitsDomaines.json`.
 *
 * ## Pourquoi un seul fichier
 *
 * Les deux précédents faisaient chacun leur appariement. Rien ne garantissait
 * qu'ils tombent sur la même fiche : un domaine pouvait prendre sa photo d'une
 * station et son prix d'une autre, à quatre kilomètres de là, et l'écran les
 * présentait ensemble sans que rien ne le dise.
 *
 * **Un appariement par source, et les deux sources dans le même fichier.** Ce
 * qu'un domaine montre vient donc de fiches nommées, et on peut lire d'un coup
 * d'où sort chaque chose.
 *
 * ## L'ordre des sources, et pourquoi il diffère selon la chose
 *
 * | | Rang 1 | Rang 2 | Rang 3 | Rang 4 |
 * | --- | --- | --- | --- | --- |
 * | Photo | Skiinfo | skiresort | bergfex | site officiel |
 * | Forfait | **bergfex à périodes** | Skiinfo | skiresort | page « Tarifs » du site officiel |
 *
 * Le forfait change d'ordre avec bergfex, et pour une raison de fond : **il
 * est le seul à dater ses tarifs.** Garmisch vaut 69 € du 20 décembre au
 * 6 janvier et du 14 au 22 février, 67 € entre les deux ; Skiinfo n'en publie
 * qu'un, sans dire lequel. Une grille datée l'emporte donc sur une grille
 * muette, qui l'emporte sur un nombre seul.
 *
 * Une fiche bergfex **sans** période ne passe pas devant : elle ne vaut alors
 * pas mieux qu'une grille Skiinfo, et celle-ci porte les bornes d'âge.
 *
 * Pour la **photo**, les deux premiers rangs sont ceux demandés par le
 * propriétaire ; le troisième est le dernier recours, et il ne sert qu'aux
 * domaines que les deux autres n'atteignent pas. L'image vient alors de
 * l'`og:image` du site — une balise publiée pour être lue par des machines —
 * et son adresse a été **contrôlée une par une** : neuf cents hôtes inconnus
 * ne se déclarent pas servants sans qu'on ait regardé.
 *
 * Pour le **forfait**, Skiinfo passe devant parce qu'il publie une grille —
 * journée, week-end, deux jours, semaine, saison, par classe d'âge avec ses
 * bornes — là où skiresort ne donne qu'un nombre, « Forfait journalier Haute
 * saison ». Un nombre seul ne se compare à rien.
 *
 * ## Ce qui n'est pas ici
 *
 * La météo. Elle est vivante : elle s'interroge à l'ouverture d'un domaine,
 * aux deux altitudes, et un fichier la figerait au jour du relevé.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { matriceDe, POSTES, vide, type Grille as GrilleTarif, type MatriceForfait } from "../src/lib/monde/matrice.ts";
import { apparier, resume, type Point } from "./appariement.ts";
const { paysByCode } = await import("../src/lib/geo/pays.ts");

/** Skiinfo nomme l'Écosse `SCT` ; `geo/pays.ts` la range sous `GB`. */
const ALIAS_PAYS: Record<string, string> = { SCT: "GB" };

/** La devise officielle du pays d'une fiche Skiinfo, ou `null`. */
function deviseAttendue(brut: string | null | undefined): string | null {
  const s = (brut ?? "").toUpperCase();
  if (!s) return null;
  return paysByCode(ALIAS_PAYS[s] ?? s.slice(0, 2))?.devise ?? null;
}

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const RAYON_KM = 5;

/** Les hôtes dont on a vérifié qu'ils servent l'image. */
const HOTES_SERVANTS = new Set(["cdn.bfldr.com", "www.skiresort.fr", "vcdn.bergfex.at"]);

function lire<T>(nom: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(DATA, nom), "utf8")) as T;
  } catch {
    return null;
  }
}

type Domaine = Point & { id: string; nom?: string; pays?: string[] };
const domaines: Domaine[] = [];
for (const f of readdirSync(DATA).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  domaines.push(...(lire<Domaine[]>(f) ?? []));
}

// ─── Les fiches de chaque source, avec leur point ────────────────────────────

type Montant = { brut: string; valeur: number | null; devise: string | null };
type LigneGrille = { libelle: string; prix: (number | null)[] };
type Categorie = { nom: string; ages: string | null };

const skiinfo = lire<{ fiches: Record<string, { nom?: string | null; lat: number | null; lon: number | null }> }>(
  "skiinfo.json",
);
const photosSkiinfo = lire<{ fiches: Record<string, { photo: string | null; pays: string | null }> }>(
  "photos.json",
);

/** Le code pays d'une fiche Skiinfo, tel que le relevé le porte. */
function paysDeLaFiche(cle: string): string | null {
  return photosSkiinfo?.fiches[cle]?.pays ?? null;
}
const grilles = lire<{
  fiches: Record<
    string,
    {
      devise: string | null;
      deviseSource: string | null;
      misAJour: string | null;
      categories: Categorie[];
      lignes: LigneGrille[];
      saison: { libelle: string; validite: string | null; categories: Categorie[]; prix: (number | null)[] } | null;
    }
  >;
}>("forfaitsSkiinfo.json");

const skiresort = lire<{
  fiches: Record<string, { nom?: string | null; continent?: string | null; lat: number | null; lon: number | null }>;
}>("skiresort.json");
const prixSkiresort = lire<{
  fiches: Record<
    string,
    { nom: string | null; libelle: string | null; prix: { adultes: Montant | null; jeunes: Montant | null; enfants: Montant | null } | null }
  >;
}>("forfaits.json");
const photosSkiresort = lire<{
  fiches: Record<string, { photo: { url: string; titre: string | null; largeur: number | null; hauteur: number | null } | null }>;
}>("photosSkiresort.json");

/** Le dernier recours : ce que le site officiel de la station publie, une fois
 *  son adresse contrôlée. `servi` non renseigné vaut « pas encore vérifié »,
 *  donc pas utilisable — l'absence de contrôle n'est pas un contrôle réussi. */
/** bergfex : photo, coordonnées, et les seules grilles datées. */
const bergfex = lire<{
  fiches: Record<
    string,
    {
      nom: string | null;
      lat: number | null;
      lon: number | null;
      photo: string | null;
      periodes:
        | { dates: string; categories: string[]; lignes: { libelle: string; prix: (number | null)[] }[] }[]
        | null;
    }
  >;
}>("bergfex.json");

/** La page « Tarifs » du site officiel : un tarif journée, avec la ligne de
 *  tableau qui le porte pour preuve. Dernier recours, et il le dit. */
const tarifsOfficiels = lire<{
  fiches: Record<
    string,
    {
      nom: string | null;
      pageTarifs: string | null;
      prix: { valeur: number; devise: string; deviseSource: "page" | "pays"; preuve: string } | null;
    }
  >;
}>("tarifsOfficiels.json");

const sitesOfficiels = lire<{
  fiches: Record<
    string,
    {
      nom: string | null;
      site: string;
      photo: string | null;
      /** `og:image`, `json-ld`, ou `img` — la plus grande image de l'accueil,
       *  faute de mieux, contrôlée en type et en poids. */
      photoSource?: string | null;
      /** L'`alt` de l'image quand le site en donne un : « Wandern mit Familie
       *  zur Speikskulptur ». C'est la seule légende qu'on ait, et elle dit
       *  souvent que la photo est d'été — ce qui vaut d'être lu. */
      photoLegende?: string | null;
      servi?: boolean;
    }
  >;
}>("sitesOfficiels.json");

type FicheSkiinfo = Point & { cle: string; nom: string | null };
const fichesSkiinfo: FicheSkiinfo[] = Object.entries(skiinfo?.fiches ?? {})
  .filter(([, f]) => f.lat != null && f.lon != null)
  .map(([cle, f]) => ({ cle, nom: f.nom ?? null, lat: f.lat as number, lon: f.lon as number }));

type FicheSkiresort = Point & { cle: string; nom: string | null };
// Toutes les fiches situées : c'est l'appariement à cinq kilomètres qui
// décide, non le continent que le site déclare. Le filtre « Europe » écartait
// les cinq pays du périmètre que skiresort range en Asie.
const fichesSkiresort: FicheSkiresort[] = Object.entries(skiresort?.fiches ?? {})
  .filter(([, f]) => f.lat != null && f.lon != null)
  .map(([cle, f]) => ({ cle, nom: f.nom ?? null, lat: f.lat as number, lon: f.lon as number }));

/**
 * Vingt kilomètres **quand le nom corrobore**, cinq sinon.
 *
 * Le point d'un domaine est son barycentre ; celui d'une fiche est souvent le
 * village. Hochkönig et `salzbourg/hochkoenig` sont séparés de sept
 * kilomètres et sont la même station. Un jeton de nom partagé est un second
 * signal, indépendant de la position, et c'est lui qui autorise l'écart.
 */
const RAYON_NOM_KM = 20;

type FicheBergfex = Point & { cle: string; nom: string | null };
const fichesBergfex: FicheBergfex[] = Object.entries(bergfex?.fiches ?? {})
  .filter(([, f]) => f.lat != null && f.lon != null)
  .map(([cle, f]) => ({ cle, nom: f.nom?.replace(/^BERGFEX:\s*/i, "") ?? null, lat: f.lat as number, lon: f.lon as number }));

const parBergfex = apparier(domaines, fichesBergfex, RAYON_KM, RAYON_NOM_KM);
const parSkiinfo = apparier(domaines, fichesSkiinfo, RAYON_KM, RAYON_NOM_KM);
const parSkiresort = apparier(domaines, fichesSkiresort, RAYON_KM, RAYON_NOM_KM);

// ─── Ce que chaque domaine en tire ───────────────────────────────────────────

type Photo = {
  source: "skiinfo" | "skiresort" | "bergfex" | "officiel" | "proprietaire" | "commons";
  cle: string;
  nom: string | null;
  km: number;
  url: string;
  titre: string | null;
  /** Le rattachement a-t-il été corroboré par le nom ? */
  parLeNom?: true;
  /** Pour une photo relevée à la main : ce qui a permis de la croire. */
  corroboration?: "hote-officiel" | "nom" | "office-du-pays" | "bergfex";
  /** L'hôte a-t-il répondu au dernier contrôle ? */
  servi: boolean;
  /** Photo libre : l'auteur, la licence et la page du fichier — obligatoires. */
  licence?: string;
  auteur?: string;
  page?: string;
  /** Ce qu'un regard a vu sur l'image. */
  vu?: string;
};

type Forfait = {
  source: "skiinfo" | "skiresort" | "bergfex" | "officiel" | "proprietaire";
  /** Les six tarifs demandés, quand les grilles les publient. */
  matrice?: MatriceForfait;
  cle: string;
  nom: string | null;
  km: number;
  /** Le rattachement a-t-il été corroboré par le nom ? */
  parLeNom?: true;
  devise: string | null;
  /** `page` ou `pays` pour Skiinfo ; toujours `page` pour skiresort. */
  deviseSource: string | null;
  /**
   * La devise du pays, **quand elle contredit celle de la page**.
   *
   * Neuf fiches sur 1 373 sont dans ce cas. Certaines sont plausibles — Mount
   * Jahorina affiche en euros en Bosnie, Sinaia en Roumanie, ce que font des
   * stations qui vendent à des visiteurs étrangers. D'autres le sont moins :
   * Valdesquí, en Espagne, affiche des dollars néo-zélandais, et Gautefall, en
   * Norvège, des couronnes suédoises.
   *
   * On ne tranche pas à la place du lecteur : la valeur publiée est gardée, la
   * contradiction est écrite à côté, et l'écran la dit. Choisir soi-même
   * reviendrait à corriger une source sans savoir laquelle des deux a tort.
   */
  deviseDuPays: string | null;
  misAJour: string | null;
  categories: Categorie[];
  lignes: LigneGrille[];
  saison: { libelle: string; validite: string | null; categories: Categorie[]; prix: (number | null)[] } | null;
  /** Les grilles datées de bergfex, quand il en publie. La seule source qui
   *  dise qu'un forfait de février ne coûte pas celui de décembre. */
  periodes:
    | { dates: string; categories: string[]; lignes: { libelle: string; prix: (number | null)[] }[] }[]
    | null;
  /** La ligne de tableau d'où sort un prix lu sur un site officiel. */
  preuve?: string;
  /** L'adresse de la page où la preuve se relit. */
  pageTarifs?: string;
  /** Pour un tarif relevé à la main : la période telle qu'écrite, et les
   *  autres prix du tableau, quand ils y sont. */
  releve?: {
    periode: string | null;
    note: string | null;
    jourEnfant: number | null;
    sixJoursAdulte: number | null;
    sixJoursEnfant: number | null;
    saisonAdulte: number | null;
    saisonEnfant: number | null;
  };
};

/**
 * Le tableau des manques, relu : ce que le propriétaire a rendu, passé au
 * crible d'`importer-manques.py` (photo corroborée et servie, forfait avec
 * prix, devise et source). Dernier recours après toutes les sources
 * moissonnées : une valeur relevée à la main ne prime jamais une valeur lue
 * chez une source qui la publie pour cela.
 */
const proprietaire = lire<{
  photos: Record<string, { url: string; hote: string; corroboration: Photo["corroboration"]; legende: string | null; servi: boolean }>;
  forfaits: Record<
    string,
    {
      jourAdulte: number;
      devise: string;
      periode: string | null;
      source: string;
      note: string | null;
      jourEnfant: number | null;
      sixJoursAdulte: number | null;
      sixJoursEnfant: number | null;
      saisonAdulte: number | null;
      saisonEnfant: number | null;
    }
  >;
}>("proprietaire.json");

function hote(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Les altitudes de repli pour la météo, quand le référentiel n'en a pas.
 *
 * Cent quarante-quatre domaines n'ont ni `minM` ni `maxM` — OpenSkiMap n'a pas
 * mesuré leurs pistes. Sans elles, pas de météo « bas et haut des pistes ».
 * Mais la fiche Skiinfo ou skiresort qui leur est **déjà appariée** publie
 * souvent un bas et un sommet : c'est une mesure, faite par la source, et elle
 * est reprise telle quelle avec son origine. Ce n'est pas une estimation.
 */
type Altitudes = { basM: number; sommetM: number; source: "skiinfo" | "skiresort"; cle: string };

type Domaine2 = Domaine & { minM?: number | null; maxM?: number | null };
const skiinfoAlt = lire<{ fiches: Record<string, { basM: number | null; sommetM: number | null }> }>("skiinfo.json");
const skiresortAlt = lire<{ fiches: Record<string, { basM: number | null; sommetM: number | null }> }>("skiresort.json");

function altitudesDeRepli(d: Domaine2, si: { fiche: { cle: string } } | undefined, sr: { fiche: { cle: string } } | undefined): Altitudes | null {
  if (d.minM != null && d.maxM != null) return null;
  for (const [source, ap, table] of [
    ["skiinfo", si, skiinfoAlt?.fiches],
    ["skiresort", sr, skiresortAlt?.fiches],
  ] as const) {
    if (!ap || !table) continue;
    const f = table[ap.fiche.cle];
    if (f && f.basM != null && f.sommetM != null && f.sommetM > f.basM) {
      return { basM: f.basM, sommetM: f.sommetM, source, cle: ap.fiche.cle };
    }
  }
  return null;
}

/**
 * Les pistes de repli : km et nombre, quand OpenSkiMap n'a rien cartographié.
 *
 * Cinq cent cinquante-neuf domaines portent des remontées et **zéro piste** :
 * un zéro mesuré — aucun tronçon n'est dessiné dans OpenStreetMap —, qui ne
 * dit rien de la station. La fiche Skiinfo ou skiresort déjà appariée publie
 * souvent ses kilomètres, et Skiinfo son nombre de pistes ; c'est une mesure
 * de la source, reprise avec son origine. Même règle que pour les altitudes.
 */
type Pistes = { km: number | null; n: number | null; source: "skiinfo" | "skiresort"; cle: string };
type Domaine3 = Domaine & { n?: number | null; km?: number | null };
const skiinfoPistes = lire<{ fiches: Record<string, { km: number | null; pistes: number | null }> }>("skiinfo.json");
const skiresortPistes = lire<{ fiches: Record<string, { kmTotal: number | null }> }>("skiresort.json");

/**
 * Les grilles bergfex **sans plage de dates**, que le relevé daté écartait.
 *
 * Mille deux cent quatre-vingt-cinq pages de prix avaient été visitées et
 * jetées parce qu'aucune date ne les précédait — or elles portent « 1 Jour »,
 * « 6 Jours » et « Passeport saisonnier » en lignes, « Adultes » et
 * « Enfants » en colonnes : exactement les six tarifs demandés.
 * `fetch-bergfex-grilles.ts` les relève à côté.
 */
/**
 * Ce qu'un regard a vu sur chaque photo retenue, et les photos libres
 * choisies pour les domaines qui n'en avaient pas.
 *
 * Le propriétaire demande une photo **unique, de la station ou des pistes,
 * sans filigrane, avec de la neige**. Aucune de ces quatre conditions ne se
 * vérifie sur une adresse : il a fallu ouvrir les images. `photosJugees`
 * porte le verdict de chacune — une photo écartée est traitée comme absente,
 * exactement comme un hôte muet —, et `photosCommons` porte celles que
 * Wikimedia Commons a fournies à la place, avec leur auteur et leur licence.
 */
const photosJugees = lire<{
  /** Les adresses qu'un regard a écartées, et pourquoi. */
  ecartees: Record<string, string>;
  verdicts: Record<string, { url: string | null; retenue: boolean; motif?: string; sujet: string; description?: string }>;
}>("photosJugees.json");
const photosCommons = lire<{
  photos: Record<string, { url: string; page: string; titre: string; licence: string; auteur: string; description?: string; sujet?: string }>;
}>("photosCommons.json");

/**
 * Les six tarifs lus sur la page du site officiel, chacun avec la ligne qui
 * le porte.
 *
 * Cent soixante-cinq pages de tarifs avaient été trouvées et dix-huit prix
 * seulement en étaient sortis : chaque station écrit sa grille autrement, et
 * une expression régulière qui prend « le premier montant d'une ligne qui
 * contient un mot de durée » se trompe de colonne dès qu'il y a un tarif de
 * groupe ou une promotion. Le texte des pages a donc été rapatrié
 * (`fetch-pages-tarifs.py`) et **lu**, puis chaque montant vérifié : sa
 * citation doit se retrouver dans le texte relevé, sinon il est écarté.
 */
const tarifsLus = lire<{
  fiches: Record<string, { page: string; devise: string | null; tarifs: Record<string, { prix: number; ligne: string }> }>;
}>("tarifsLus.json");

const bergfexGrilles = lire<{
  fiches: Record<string, { slug: string; nom: string; grilles: { categories: string[]; lignes: { libelle: string; prix: (number | null)[] }[] }[] }>;
}>("bergfexGrilles.json");

function pistesDeRepli(
  d: Domaine3,
  si: { fiche: { cle: string } } | undefined,
  sr: { fiche: { cle: string } } | undefined,
): Pistes | null {
  if ((d.n ?? 0) > 0 || (d.km ?? 0) > 0) return null;
  if (si && skiinfoPistes?.fiches[si.fiche.cle]) {
    const f = skiinfoPistes.fiches[si.fiche.cle]!;
    if ((f.km ?? 0) > 0 || (f.pistes ?? 0) > 0) {
      return {
        km: (f.km ?? 0) > 0 ? f.km : null,
        n: (f.pistes ?? 0) > 0 ? f.pistes : null,
        source: "skiinfo",
        cle: si.fiche.cle,
      };
    }
  }
  if (sr && skiresortPistes?.fiches[sr.fiche.cle]) {
    const f = skiresortPistes.fiches[sr.fiche.cle]!;
    if ((f.kmTotal ?? 0) > 0) return { km: f.kmTotal, n: null, source: "skiresort", cle: sr.fiche.cle };
  }
  return null;
}

const vues: Record<
  string,
  { photo: Photo | null; forfait: Forfait | null; altitudes?: Altitudes; pistes?: Pistes }
> = {};

for (const d of domaines) {
  const si = parSkiinfo.get(d.id);
  const sr = parSkiresort.get(d.id);

  // ── La photo : Skiinfo d'abord, skiresort ensuite ──
  //
  // Ce qu'un regard a écarté ne revient pas dans la chaîne : une photo jugée
  // sans neige, filigranée ou hors sujet est sautée, et la source suivante a
  // sa chance. C'est l'inverse d'un rejet en bout de course, qui laissait le
  // domaine sans rien alors qu'une autre source publiait peut-être mieux.
  //
  // Le verdict porte sur **l'image**, désignée par son adresse — pas sur le
  // domaine. « Pas de neige » ou « plan des pistes dessiné » restent vrais
  // quel que soit le domaine qui l'affiche, et un rejet prononcé lors d'un
  // tour précédent doit tenir au suivant.
  const ecartee = (url: string | null | undefined): boolean =>
    !!url && photosJugees?.ecartees[url] !== undefined;

  let photo: Photo | null = null;
  const urlSi = si ? photosSkiinfo?.fiches[si.fiche.cle]?.photo ?? null : null;
  if (urlSi && !ecartee(urlSi)) {
    photo = {
      source: "skiinfo",
      cle: si!.fiche.cle,
      nom: si!.fiche.nom,
      km: si!.km,
      ...(si!.parLeNom ? { parLeNom: true as const } : {}),
      url: urlSi,
      titre: null,
      servi: HOTES_SERVANTS.has(hote(urlSi)),
    };
  }
  if (!photo?.servi && sr) {
    const p = photosSkiresort?.fiches[sr.fiche.cle]?.photo ?? null;
    if (p && !ecartee(p.url)) {
      photo = {
        source: "skiresort",
        cle: sr.fiche.cle,
        nom: sr.fiche.nom,
        km: sr.km,
        ...(sr.parLeNom ? { parLeNom: true as const } : {}),
        url: p.url,
        titre: p.titre,
        servi: HOTES_SERVANTS.has(hote(p.url)),
      };
    }
  }

  // ── bergfex, avant le site officiel ──
  const bf = parBergfex.get(d.id);
  if (!photo?.servi && bf) {
    const b = bergfex?.fiches[bf.fiche.cle];
    if (b?.photo && !ecartee(b.photo)) {
      photo = {
        source: "bergfex",
        cle: bf.fiche.cle,
        nom: bf.fiche.nom,
        km: bf.km,
        ...(bf.parLeNom ? { parLeNom: true as const } : {}),
        url: b.photo,
        titre: null,
        servi: HOTES_SERVANTS.has(hote(b.photo)),
      };
    }
  }

  // ── Dernier recours : le site officiel de la station ──
  if (!photo?.servi) {
    const o = sitesOfficiels?.fiches[d.id];
    if (o?.photo && o.servi === true && !ecartee(o.photo)) {
      photo = {
        source: "officiel",
        cle: o.site,
        nom: o.nom,
        // Le site *est* celui du domaine : il n'y a pas de distance à mesurer,
        // et écrire zéro ici veut dire « c'est la même chose », non « à zéro
        // kilomètre ».
        km: 0,
        url: o.photo,
        titre: o.photoLegende ?? null,
        servi: true,
      };
    }
  }

  // ── Après tout le reste : la photo relevée à la main, corroborée ──
  if (!photo?.servi) {
    const p = proprietaire?.photos[d.id];
    if (p?.servi && !ecartee(p.url)) {
      photo = {
        source: "proprietaire",
        cle: p.hote,
        nom: null,
        km: 0,
        url: p.url,
        titre: p.legende,
        corroboration: p.corroboration,
        servi: true,
      };
    }
  }

  // ── À défaut : une photo libre de Wikimedia Commons, choisie à l'œil ──
  if (!photo?.servi) {
    const c = photosCommons?.photos[d.id];
    if (c) {
      photo = {
        source: "commons",
        cle: c.titre.replace(/^File:/, ""),
        nom: null,
        km: 0,
        url: c.url,
        titre: null,
        servi: true,
        licence: c.licence,
        auteur: c.auteur,
        page: c.page,
        ...(c.description ? { vu: c.description } : {}),
      };
    }
  }

  // ── Le forfait : bergfex daté d'abord, Skiinfo ensuite, skiresort enfin ──
  let forfait: Forfait | null = null;

  // Une grille **datée** l'emporte sur toutes les autres : elle seule dit
  // qu'un forfait de février ne coûte pas celui de décembre. Une fiche bergfex
  // sans période ne passe pas devant — elle ne vaudrait alors pas mieux qu'une
  // grille Skiinfo, qui porte en plus les bornes d'âge.
  const bfPrix = bf ? bergfex?.fiches[bf.fiche.cle] : undefined;

  /**
   * Une période est une **plage de dates**, pas un tableau.
   *
   * Ankogel publie quatre tableaux sous une seule plage — points, saison,
   * cartes diverses. Les compter comme quatre périodes faisait croire à une
   * variation saisonnière là où il n'y en a aucune, ce qui est précisément
   * l'inverse de ce qu'on cherche à montrer.
   *
   * On regroupe donc par plage, et on garde le premier tableau de chaque
   * groupe : c'est celui des forfaits par durée, que le site met en tête.
   */
  const parPlage = new Map<string, NonNullable<typeof bfPrix>["periodes"] extends (infer T)[] | null ? T : never>();
  for (const p of bfPrix?.periodes ?? []) if (!parPlage.has(p.dates)) parPlage.set(p.dates, p);
  const plages = [...parPlage.values()];

  if (plages.length) {
    const p0 = plages[0]!;
    forfait = {
      source: "bergfex",
      cle: bf!.fiche.cle,
      nom: bf!.fiche.nom,
      km: bf!.km,
      ...(bf!.parLeNom ? { parLeNom: true as const } : {}),
      // bergfex écrit ses montants avec le symbole de la devise du pays ; on
      // prend celle du pays, qui est sourcée, plutôt que de lire un symbole.
      // **Le pays se lit sur l'identifiant, pas sur le champ `pays`.**
      //
      // Le référentiel omet `pays` quand il n'y en a qu'un — six domaines
      // autrichiens sur 317 le portent, ceux qui touchent une frontière. Lire
      // `d.pays[0]` rendait donc `undefined` presque partout, et la devise
      // sortait nulle : des prix sans devise, que `vues.ts` refuse d'afficher.
      //
      // `identifiant()` de `build-monde.py` préfixe chaque clé du code pays —
      // « at-11er-neustift-neder ». C'est une source sûre, et elle ne dépend
      // pas d'un champ facultatif.
      devise: deviseAttendue(d.pays?.[0] ?? d.id.slice(0, 2).toUpperCase()),
      deviseSource: "pays",
      deviseDuPays: null,
      misAJour: null,
      // Les colonnes de la première période font les classes d'âge : elles
      // sont les mêmes d'une période à l'autre chez cette source.
      categories: p0.categories.map((nom) => ({ nom, ages: null })),
      lignes: p0.lignes,
      saison: null,
      periodes: plages,
    };
  }

  const g = si ? grilles?.fiches[si.fiche.cle] : undefined;
  if (!forfait && g && g.lignes.length) {
    forfait = {
      source: "skiinfo",
      cle: si!.fiche.cle,
      nom: si!.fiche.nom,
      km: si!.km,
      ...(si!.parLeNom ? { parLeNom: true as const } : {}),
      devise: g.devise,
      deviseSource: g.deviseSource,
      deviseDuPays: (() => {
        const p = deviseAttendue(skiinfo?.fiches[si!.fiche.cle] ? paysDeLaFiche(si!.fiche.cle) : null);
        return p && g.devise && p !== g.devise ? p : null;
      })(),
      misAJour: g.misAJour,
      categories: g.categories,
      lignes: g.lignes,
      saison: g.saison,
      periodes: null,
    };
  }
  // ── La grille bergfex non datée, après Skiinfo et avant skiresort ──
  //
  // Elle ne passe pas devant Skiinfo : la règle posée plus haut vaut toujours,
  // une grille sans dates ne vaut pas mieux qu'une grille qui porte en plus
  // les bornes d'âge. Mais elle vaut mieux qu'un nombre unique : elle donne la
  // journée, la semaine et la saison, pour l'adulte et pour l'enfant.
  const bgrilles = bf ? bergfexGrilles?.fiches[bf.fiche.cle]?.grilles ?? [] : [];
  const bgPrincipale = bgrilles.find((x) => x.lignes.length >= 2) ?? bgrilles[0];
  if (!forfait && bgPrincipale) {
    forfait = {
      source: "bergfex",
      cle: bf!.fiche.cle,
      nom: bf!.fiche.nom,
      km: bf!.km,
      ...(bf!.parLeNom ? { parLeNom: true as const } : {}),
      devise: deviseAttendue(d.pays?.[0] ?? d.id.slice(0, 2).toUpperCase()),
      deviseSource: "pays",
      deviseDuPays: null,
      misAJour: null,
      categories: bgPrincipale.categories.map((nom) => ({ nom, ages: null })),
      lignes: bgPrincipale.lignes,
      saison: null,
      periodes: null,
    };
  }

  if (!forfait && sr) {
    const p = prixSkiresort?.fiches[sr.fiche.cle];
    if (p?.prix) {
      // Le nombre unique de skiresort est présenté dans la même forme que la
      // grille : une ligne, trois colonnes. Un écran n'a alors qu'une forme à
      // lire, et `source` dit laquelle des deux il regarde.
      forfait = {
        source: "skiresort",
        cle: sr.fiche.cle,
        nom: p.nom ?? sr.fiche.nom,
        km: sr.km,
        ...(sr.parLeNom ? { parLeNom: true as const } : {}),
        devise: p.prix.adultes?.devise ?? null,
        deviseSource: "page",
        deviseDuPays: null,
        misAJour: null,
        categories: [
          { nom: "Enfant", ages: null },
          { nom: "Jeune", ages: null },
          { nom: "Adulte", ages: null },
        ],
        lignes: [
          {
            libelle: p.libelle ?? "Forfait journée",
            prix: [
              p.prix.enfants?.valeur ?? null,
              p.prix.jeunes?.valeur ?? null,
              p.prix.adultes?.valeur ?? null,
            ],
          },
        ],
        saison: null,
        periodes: null,
      };
    }
  }

  // ── La page « Tarifs » du site officiel, lue ligne à ligne ──
  //
  // Elle passe devant la lecture par expression régulière de la même page :
  // c'est la même source, mieux lue, et chaque montant porte sa ligne.
  const tlF = tarifsLus?.fiches[d.id];
  const tlJour = tlF?.tarifs.jourAdulte;
  if (!forfait && tlF && tlJour && tlF.devise) {
    forfait = {
      source: "officiel",
      cle: tlF.page,
      nom: null,
      km: 0,
      devise: tlF.devise,
      deviseSource: "page",
      // La page fait foi pour sa devise — c'est elle qui vend. Quand elle
      // contredit celle du pays, on le dit plutôt que de trancher : une
      // station bosnienne qui affiche en euros n'a rien d'invraisemblable.
      deviseDuPays: (() => {
        const p = deviseAttendue(d.pays?.[0] ?? d.id.slice(0, 2).toUpperCase());
        return p && tlF.devise && p !== tlF.devise ? p : null;
      })(),
      misAJour: null,
      categories: [{ nom: "Adulte", ages: null }],
      lignes: [{ libelle: "Forfait journée", prix: [tlJour.prix] }],
      saison: null,
      periodes: null,
      preuve: tlJour.ligne,
      pageTarifs: tlF.page,
    };
  }

  // ── Dernier recours : la page « Tarifs » du site officiel ──
  //
  // Un tarif lu en texte libre, dans une ligne de tableau qui porte un montant
  // avec devise et un mot de durée. La ligne est conservée et affichée : c'est
  // la preuve, et c'est elle qui permet de juger le prix sans relancer quoi
  // que ce soit. Le site *est* celui du domaine : pas de distance.
  const to = tarifsOfficiels?.fiches[d.id];
  if (!forfait && to?.prix) {
    forfait = {
      source: "officiel",
      cle: to.pageTarifs ?? "",
      nom: to.nom,
      km: 0,
      devise: to.prix.devise,
      deviseSource: to.prix.deviseSource,
      deviseDuPays: null,
      misAJour: null,
      categories: [{ nom: "Adulte", ages: null }],
      lignes: [{ libelle: "Forfait journée", prix: [to.prix.valeur] }],
      saison: null,
      periodes: null,
      preuve: to.prix.preuve,
      ...(to.pageTarifs ? { pageTarifs: to.pageTarifs } : {}),
    };
  }

  // ── Après tout le reste : le tarif relevé à la main, avec sa source ──
  const pr = proprietaire?.forfaits[d.id];
  if (!forfait && pr) {
    forfait = {
      source: "proprietaire",
      cle: pr.source,
      nom: null,
      km: 0,
      devise: pr.devise,
      deviseSource: "tableau",
      deviseDuPays: null,
      misAJour: null,
      categories: [{ nom: "Adulte", ages: null }],
      lignes: [{ libelle: "Forfait journée", prix: [pr.jourAdulte] }],
      saison: null,
      periodes: null,
      pageTarifs: pr.source,
      releve: {
        periode: pr.periode,
        note: pr.note,
        jourEnfant: pr.jourEnfant,
        sixJoursAdulte: pr.sixJoursAdulte,
        sixJoursEnfant: pr.sixJoursEnfant,
        saisonAdulte: pr.saisonAdulte,
        saisonEnfant: pr.saisonEnfant,
      },
    };
  }

  // ── Les six tarifs : journée, six jours et saison, adulte et enfant ──
  //
  // Chaque case est prise à la **première source qui la publie**, dans
  // l'ordre où les forfaits eux-mêmes sont choisis, et seulement parmi les
  // grilles de la devise retenue : mettre une couronne à côté d'un euro dans
  // un même tableau ferait lire un prix pour un autre. Une case sans source
  // reste vide ; rien n'est déduit d'un autre montant.
  if (forfait) {
    const grillesTarifs: GrilleTarif[] = [];

    // bergfex date ses tarifs. Pour une case unique, on prend la plage la plus
    // chère à la journée adulte — la haute saison, ce que les autres sources
    // publient aussi. Le tableau des périodes reste affiché en entier à côté.
    if (plages.length) {
      const prixJour = (p: (typeof plages)[number]): number => {
        const i = p.categories.findIndex((c) => /^adulte/i.test(c.normalize("NFD").replace(/[̀-ͯ]/g, "")));
        const l = p.lignes.find((x) => /^1 jours?$/i.test(x.libelle.trim()));
        return i >= 0 && l ? (l.prix[i] ?? 0) : 0;
      };
      const haute = [...plages].sort((a, b) => prixJour(b) - prixJour(a))[0]!;
      grillesTarifs.push({
        source: "bergfex",
        devise: forfait.source === "bergfex" ? forfait.devise : deviseAttendue(d.pays?.[0] ?? d.id.slice(0, 2).toUpperCase()),
        categories: haute.categories,
        lignes: haute.lignes,
        dates: haute.dates,
      });
    }
    if (g && g.lignes.length) {
      grillesTarifs.push({
        source: "skiinfo",
        devise: g.devise,
        categories: g.categories.map((c) => c.nom),
        lignes: g.lignes,
        saison: g.saison ? { categories: g.saison.categories.map((c) => c.nom), prix: g.saison.prix } : null,
      });
    }
    for (const bg of bgrilles) {
      grillesTarifs.push({
        source: "bergfex",
        devise: deviseAttendue(d.pays?.[0] ?? d.id.slice(0, 2).toUpperCase()),
        categories: bg.categories,
        lignes: bg.lignes,
      });
    }
    const psr = sr ? prixSkiresort?.fiches[sr.fiche.cle] : undefined;
    if (psr?.prix) {
      grillesTarifs.push({
        source: "skiresort",
        devise: psr.prix.adultes?.devise ?? null,
        categories: ["Enfant", "Jeune", "Adulte"],
        lignes: [
          {
            libelle: psr.libelle ?? "Forfait journée",
            prix: [psr.prix.enfants?.valeur ?? null, psr.prix.jeunes?.valeur ?? null, psr.prix.adultes?.valeur ?? null],
          },
        ],
      });
    }
    const tl = tarifsLus?.fiches[d.id];
    if (tl && Object.keys(tl.tarifs).length) {
      grillesTarifs.push({
        source: "officiel",
        devise: tl.devise,
        categories: [],
        lignes: [],
        nommes: Object.fromEntries(
          Object.entries(tl.tarifs).map(([poste, t]) => [poste, { prix: t.prix, libelle: t.ligne }]),
        ) as GrilleTarif["nommes"],
      });
    }
    if (to?.prix) {
      grillesTarifs.push({
        source: "officiel",
        devise: to.prix.devise,
        categories: ["Adulte"],
        lignes: [{ libelle: to.prix.preuve ?? "Forfait journée", prix: [to.prix.valeur] }],
      });
    }
    if (pr) {
      grillesTarifs.push({
        source: "proprietaire",
        devise: pr.devise,
        categories: [],
        lignes: [],
        nommes: {
          ...(pr.jourAdulte ? { jourAdulte: { prix: pr.jourAdulte, libelle: "Forfait journée" } } : {}),
          ...(pr.jourEnfant ? { jourEnfant: { prix: pr.jourEnfant, libelle: "Forfait journée" } } : {}),
          ...(pr.sixJoursAdulte ? { sixJoursAdulte: { prix: pr.sixJoursAdulte, libelle: "Forfait 6 jours" } } : {}),
          ...(pr.sixJoursEnfant ? { sixJoursEnfant: { prix: pr.sixJoursEnfant, libelle: "Forfait 6 jours" } } : {}),
          ...(pr.saisonAdulte ? { saisonAdulte: { prix: pr.saisonAdulte, libelle: "Forfait saison" } } : {}),
          ...(pr.saisonEnfant ? { saisonEnfant: { prix: pr.saisonEnfant, libelle: "Forfait saison" } } : {}),
        },
      });
    }
    const m = matriceDe(grillesTarifs, forfait.devise);
    if (!vide(m)) forfait.matrice = m;
  }

  const altitudes = altitudesDeRepli(d as Domaine2, si, sr);
  const pistes = pistesDeRepli(d as Domaine3, si, sr);
  if (photo || forfait || altitudes || pistes) {
    vues[d.id] = {
      photo: photo?.servi ? photo : null,
      forfait,
      ...(altitudes ? { altitudes } : {}),
      ...(pistes ? { pistes } : {}),
    };
  }
}

/**
 * « Une photo unique » : une adresse servie à deux domaines n'illustre ni l'un
 * ni l'autre.
 *
 * Le jugement écarte déjà les images partagées qu'il a vues, mais un doublon
 * peut naître **après** : quand la photo d'un domaine est écartée, la chaîne
 * reprend à la source suivante, et celle-ci sert parfois la même image que
 * chez le voisin. San Martino di Castrozza et son Passo Rolle en sont un cas.
 *
 * On retire alors les deux. Garder l'un des deux demanderait de savoir lequel
 * la photo montre, ce que précisément rien ne dit.
 */
const parUrl = new Map<string, string[]>();
for (const [id, v] of Object.entries(vues)) {
  if (v.photo) parUrl.set(v.photo.url, [...(parUrl.get(v.photo.url) ?? []), id]);
}
let partagees = 0;
for (const [, ids] of parUrl) {
  if (ids.length < 2) continue;
  for (const id of ids) {
    vues[id]!.photo = null;
    partagees++;
  }
}
if (partagees) console.log(`  photos partagées      : ${partagees} retirées (aucun domaine ne garde une image servie à un autre)`);

const avecAltitudes = Object.values(vues).filter((v) => v.altitudes).length;
const avecPistes = Object.values(vues).filter((v) => v.pistes).length;
const avecPhoto = Object.values(vues).filter((v) => v.photo).length;
const avecForfait = Object.values(vues).filter((v) => v.forfait).length;
const parSource = (quoi: "photo" | "forfait", s: string) =>
  Object.values(vues).filter((v) => v[quoi]?.source === s).length;

writeFileSync(
  resolve(DATA, "vuesDomaines.json"),
  JSON.stringify(
    {
      calcule: new Date().toISOString().slice(0, 10),
      quoi: "ce que chaque domaine sait montrer : une photo et un forfait, rattachés par la position",
      regle: `la fiche la plus proche à ${RAYON_KM} km au plus, une fiche ne sert qu'un domaine ; un appariement par source, partagé par la photo et le forfait`,
      rayonKm: RAYON_KM,
      ordrePhoto: ["skiinfo", "skiresort", "bergfex", "site officiel de la station", "tableau des manques (corroboré)"],
      ordreForfait: ["bergfex (grille datée)", "skiinfo (grille)", "skiresort (un seul nombre)", "site officiel (tarif journée, avec preuve)", "tableau des manques (avec source)"],
      avertissement:
        "les montants sont dans la devise du pays et ne doivent pas être convertis ; aucune source ne publie de prix par période dans la saison, seule la distinction semaine / week-end est relevée",
      domaines: domaines.length,
      avecPhoto,
      avecForfait,
      vues,
    },
    null,
    1,
  ) + "\n",
  "utf8",
);

const pct = (n: number) => `${((n / domaines.length) * 100).toFixed(1)} %`;
console.log(`Domaines du référentiel : ${domaines.length}`);
console.log(`  avec une photo        : ${avecPhoto}   ${pct(avecPhoto)}`);
console.log(`      dont Skiinfo      : ${parSource("photo", "skiinfo")}`);
console.log(`      dont skiresort    : ${parSource("photo", "skiresort")}`);
console.log(`      dont bergfex      : ${parSource("photo", "bergfex")}`);
console.log(`      dont site officiel: ${parSource("photo", "officiel")}`);
console.log(`      dont tableau des manques: ${parSource("photo", "proprietaire")}`);
console.log(`      dont Wikimedia Commons  : ${parSource("photo", "commons")}`);
if (photosJugees) {
  const v = Object.values(photosJugees.verdicts);
  console.log(`  photos regardées      : ${v.length}   dont écartées ${v.filter((x) => !x.retenue).length}`);
}
console.log(`  avec un forfait       : ${avecForfait}   ${pct(avecForfait)}`);
const matrices = Object.values(vues).map((v) => v.forfait?.matrice).filter(Boolean) as MatriceForfait[];
const parPoste = (p: keyof MatriceForfait) => matrices.filter((m) => m[p]).length;
console.log(
  `  avec une matrice      : ${matrices.length}   (jour A ${parPoste("jourAdulte")} / E ${parPoste("jourEnfant")}` +
    ` · 6 j A ${parPoste("sixJoursAdulte")} / E ${parPoste("sixJoursEnfant")}` +
    ` · saison A ${parPoste("saisonAdulte")} / E ${parPoste("saisonEnfant")})`,
);
console.log(`      les six tarifs    : ${matrices.filter((m) => POSTES.every((p) => m[p])).length}`);
console.log(`      dont bergfex daté : ${parSource("forfait", "bergfex")}`);
console.log(`      dont grille       : ${parSource("forfait", "skiinfo")}`);
console.log(`      dont un nombre    : ${parSource("forfait", "skiresort")}`);
console.log(`      dont site officiel: ${parSource("forfait", "officiel")}`);
console.log(`  altitudes de repli    : ${avecAltitudes}   (bas et sommet d'une fiche appariée, pour la météo)`);
console.log(`  pistes de repli       : ${avecPistes}   (km ou nombre d'une fiche appariée, faute de cartographie)`);
console.log(`\nAppariement Skiinfo :`);
for (const l of resume(parSkiinfo, domaines.length)) console.log(`  ${l}`);
console.log(`Appariement skiresort :`);
for (const l of resume(parSkiresort, domaines.length)) console.log(`  ${l}`);
