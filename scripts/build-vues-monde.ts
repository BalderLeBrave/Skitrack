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
 * | | Rang 1 | Rang 2 | Rang 3 |
 * | --- | --- | --- | --- |
 * | Photo | Skiinfo | skiresort | site officiel de la station |
 * | Forfait | Skiinfo | skiresort | — |
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
const HOTES_SERVANTS = new Set(["cdn.bfldr.com", "www.skiresort.fr"]);

function lire<T>(nom: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(DATA, nom), "utf8")) as T;
  } catch {
    return null;
  }
}

type Domaine = Point & { id: string; nom?: string };
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
const sitesOfficiels = lire<{
  fiches: Record<string, { nom: string | null; site: string; photo: string | null; servi?: boolean }>;
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

const parSkiinfo = apparier(domaines, fichesSkiinfo, RAYON_KM);
const parSkiresort = apparier(domaines, fichesSkiresort, RAYON_KM);

// ─── Ce que chaque domaine en tire ───────────────────────────────────────────

type Photo = {
  source: "skiinfo" | "skiresort" | "officiel";
  cle: string;
  nom: string | null;
  km: number;
  url: string;
  titre: string | null;
  /** L'hôte a-t-il répondu au dernier contrôle ? */
  servi: boolean;
};

type Forfait = {
  source: "skiinfo" | "skiresort";
  cle: string;
  nom: string | null;
  km: number;
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
};

function hote(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

const vues: Record<string, { photo: Photo | null; forfait: Forfait | null }> = {};

for (const d of domaines) {
  const si = parSkiinfo.get(d.id);
  const sr = parSkiresort.get(d.id);

  // ── La photo : Skiinfo d'abord, skiresort ensuite ──
  let photo: Photo | null = null;
  const urlSi = si ? photosSkiinfo?.fiches[si.fiche.cle]?.photo ?? null : null;
  if (urlSi) {
    photo = {
      source: "skiinfo",
      cle: si!.fiche.cle,
      nom: si!.fiche.nom,
      km: si!.km,
      url: urlSi,
      titre: null,
      servi: HOTES_SERVANTS.has(hote(urlSi)),
    };
  }
  if (!photo?.servi && sr) {
    const p = photosSkiresort?.fiches[sr.fiche.cle]?.photo ?? null;
    if (p) {
      photo = {
        source: "skiresort",
        cle: sr.fiche.cle,
        nom: sr.fiche.nom,
        km: sr.km,
        url: p.url,
        titre: p.titre,
        servi: HOTES_SERVANTS.has(hote(p.url)),
      };
    }
  }

  // ── Dernier recours : le site officiel de la station ──
  if (!photo?.servi) {
    const o = sitesOfficiels?.fiches[d.id];
    if (o?.photo && o.servi === true) {
      photo = {
        source: "officiel",
        cle: o.site,
        nom: o.nom,
        // Le site *est* celui du domaine : il n'y a pas de distance à mesurer,
        // et écrire zéro ici veut dire « c'est la même chose », non « à zéro
        // kilomètre ».
        km: 0,
        url: o.photo,
        titre: null,
        servi: true,
      };
    }
  }

  // ── Le forfait : la grille Skiinfo d'abord, le nombre skiresort ensuite ──
  let forfait: Forfait | null = null;
  const g = si ? grilles?.fiches[si.fiche.cle] : undefined;
  if (g && g.lignes.length) {
    forfait = {
      source: "skiinfo",
      cle: si!.fiche.cle,
      nom: si!.fiche.nom,
      km: si!.km,
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
      };
    }
  }

  if (photo || forfait) vues[d.id] = { photo: photo?.servi ? photo : null, forfait };
}

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
      ordrePhoto: ["skiinfo", "skiresort", "site officiel de la station"],
      ordreForfait: ["skiinfo (grille)", "skiresort (un seul nombre)"],
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
console.log(`      dont site officiel: ${parSource("photo", "officiel")}`);
console.log(`  avec un forfait       : ${avecForfait}   ${pct(avecForfait)}`);
console.log(`      dont grille       : ${parSource("forfait", "skiinfo")}`);
console.log(`      dont un nombre    : ${parSource("forfait", "skiresort")}`);
console.log(`\nAppariement Skiinfo :`);
for (const l of resume(parSkiinfo, domaines.length)) console.log(`  ${l}`);
console.log(`Appariement skiresort :`);
for (const l of resume(parSkiresort, domaines.length)) console.log(`  ${l}`);
