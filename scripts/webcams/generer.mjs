// Étape 7 du relevé des webcams (docs/WEBCAMS.md) : la table de l'application.
//
//   node scripts/webcams/generer.mjs [dossier] [sortie] [date AAAA-MM-JJ]
//
// Écrit `src/lib/webcams.data.ts` depuis `choix.json` et les corrections à la
// main ci-dessous. Sans argument, depuis le relevé versionné
// (`scripts/webcams/releve`), qu'il reproduit à l'octet près : le test
// `generer.test.mjs` le vérifie.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEVE = fileURLToPath(new URL("./releve", import.meta.url));

// Fin d'adresse -> correction. `label` remplace le libellé ; `retirer` écarte
// l'adresse ; `station` la rend à la station qu'elle regarde.
const C = {
  "cauterets/cirque-du-lys/panorama": { label: "Terrasse du Lys, 1 850 m" },
  "chabanon/chabanon": { label: "Chabanon, 1 610 m" },
  "chamonix/les-houches": { label: "Les Houches" },
  "www.skaping.com/chamonix-mont-blanc": { label: "Panorama" },
  "chastreix-sancy/chastreix": { label: "Chastreix" },
  "correncon-en-vercors/rambins": { label: "Hameau des Rambins" },
  "correncon-en-vercors/plateau": { label: "Site nordique, Porte des Hauts Plateaux" },
  "flaine/desert-blanc": { label: "Désert Blanc" },
  "gresse-en-vercors/grand-veymont": { label: "Grand Veymont" },
  "la-bresse/hohneck": { label: "Hohneck, Chitelet" },
  "valdisere/la-daille": { label: "La Daille" },
  "la-giettaz/sommet": { label: "Sommet Tête du Torraz, 1 930 m" },
  "lagrave/1500m": { label: "Village, 1 500 m" },
  "grandtourmalet/liaison": { label: "La Mongie, 2 100 m" },
  "grandtourmalet/baregestourmalet": { label: "Barèges Tourmalet, 1 750 m" },
  "la-rosiere/mont-valaisan": { label: "Mont Valaisan, 2 800 m" },
  "collet-d-allevard/sommet": { label: "Les Plagnes" },
  "le-schnepfenried/panoramique": { label: "Schnepfenriedkopf" },
  "les7laux/prapoutel/sommetdesbouquetins": { label: "Sommet des Bouquetins", station: "prapoutel" },
  "les7laux/pipay/grand-cerf": { label: "Grand Cerf", station: "pipay" },
  "les7laux/pleynet/oursiere": { label: "Oursière", station: "le-pleynet" },
  "les7laux/pleynet/les-loups": { station: "le-pleynet" },
  "valdallos/observatoire": { label: "Départ TS Observatoire, 2 140 m" },
  "valdallos/front-de-neige": { label: "Départ TSD Marin Pascal, 1 840 m" },
  "grandtourmalet/laquette": { label: "Barèges Laquette, 1 700 m" },
  "vars/les-claux/video": { label: "Les Claux" },
  "cauterets/puntas/video": { label: "Puntas" },
  "val-d-isere/club-des-sports-1": { label: "Club des sports 1" },
  "val-d-isere/club-des-sports-2": { label: "Club des sports 2" },
  "les-estables-video": { retirer: true },
  "les-karellis/vinouve": { label: "Vinouve, 2 130 m" },
  "les-orres/pousterle": { label: "Sommet Pousterle, 2 530 m" },
  "les-saisies/le-manant": { label: "Le Manant" },
  "montriond/ardent": { label: "Ardent" },
  "morzine/chamossiere": { label: "Chamossière, 2 002 m" },
  "portes-du-soleil/morzine": { label: "Plateau de Nyon, 1 421 m" },
  "morzine/pleney": { label: "Pleney, 1 505 m" },
  "pra-loup/peguieou": { label: "Sommet de Péguiéou" },
  "live/player/pelvoux30.php": { label: "Pelvoux-Vallouise" },
  rocdenfer: { label: "Roc d'Enfer" },
  "saint-lary/pic-d-aret": { label: "Pic d'Aret" },
  "saintmartindebelleville/village": { label: "Village" },
  "valdallos/seignus-bas": { label: "Départ du télésiège Clos Bertrand, 1 530 m" },
  "valdallos/seignus-haut": { label: "Sommet du télésiège Clos Bertrand, 1 915 m" },
  "val-de-morteau/val-de-morteau_meix-musy": { label: "Meix-Musy" },
  "valfrejus/arrondaz": { label: "Arrondaz, 2 222 m" },
  "valfrejus/tc-arrondaz": { label: "Front de neige" },
  "valloire/galibier": { label: "Col du Galibier" },
  "vaujany/sommet-2800": { label: "Dôme des Rousses, 2 800 m" },
  "fr/webcam/isola-2000": { retirer: true },
  "avoriaz/station/meteo": { retirer: true },
  "campan/payolle/pic-du-midi": { label: "Pic du Midi" },
  "campan/lac-de-payolle": { label: "Lac de Payolle" },
  "auron/cime-chavalet": { label: "Cime de Chavalet" },
  "autrans-meaudre/tsf-la-quoi": { label: "Sommet du domaine alpin" },
  "autrans-meaudre/chatelard": { label: "Front de neige" },
  "tignes.roundshot.com/grande-motte": { label: "Grande Motte" },
  "Bonneval-Andagne?i=NTk3ODp1bmRlZmluZWQ": { label: "Andagne" },
};
const correction = (url) => {
  const u = url.replace(/\/+$/, "");
  const k = Object.keys(C).find((k) => u.endsWith(k));
  return k ? C[k] : null;
};
const TIRET_ALT = /(\S)\s*(\d)\s?(\d{3})\s?m\.?$/;
function propre(l) {
  // « Arrondaz 2222m » devient « Arrondaz, 2 222 m » ; ce qui a déjà sa
  // virgule, ou commence par « Vue à », reste tel quel.
  const f = /^Vue à |, \d/.test(l) ? l : l.replace(TIRET_ALT, (m, a, b, c) => `${a}, ${b}\u202f${c} m`);
  return f.replace(/\s+,/g, ",").replace(/ +/g, " ").trim();
}

/** Le texte de `webcams.data.ts` pour un relevé. */
export function genererTable(dir = RELEVE, jour = null) {
  const lire = (f) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const { choix } = lire("choix.json");
  const ordre = lire("stations.json").map((s) => s.id);
  jour ??= lire("releve.json").le;
  const table = new Map();
  for (const [id, cs] of Object.entries(choix))
    for (const c of cs) {
      const k = correction(c.url);
      if (k?.retirer) continue;
      const cible = k?.station ?? id;
      const label = propre(k?.label ?? c.label).replace(/(\d) (\d{3}) m/g, "$1 $2 m");
      if (!table.has(cible)) table.set(cible, []);
      if (!table.get(cible).some((x) => x.url === c.url)) table.get(cible).push({ label, url: c.url, fournisseur: c.fournisseur });
    }

  const echap = (s) => JSON.stringify(s);
  const lignes = [];
  for (const id of ordre) {
    const cs = table.get(id);
    if (!cs?.length) continue;
    lignes.push(`  ${echap(id)}: [`);
    for (const c of cs) lignes.push(`    { label: ${echap(c.label)}, url: ${echap(c.url)}, fournisseur: ${echap(c.fournisseur)} },`);
    lignes.push(`  ],`);
  }
  const n = [...table.values()].flat().length;
  const src = `/**
 * Caméras vérifiées, par identifiant de station.
 *
 * Relevé du ${jour} : chaque adresse a été affichée dans le cadre de
 * l'application (\`iframe\`, \`sandbox="allow-scripts allow-same-origin"\`,
 * \`referrerpolicy="no-referrer"\`) depuis une page locale, sa capture regardée,
 * et la date de sa dernière image relevée. Toutes les caméras vérifiées d'une
 * station, dans cet ordre :
 * la vue la plus large du domaine d'abord, puis le sommet ou le front de neige,
 * puis le village ; une caméra coupée pour l'intersaison passe derrière celles
 * qui tournent, son lecteur affiche la date de sa dernière image.
 *
 * Sources : le plan du site de Skaping (\`sitemap.players.xml\`), les groupes de
 * Webcam-HD (\`smr/json/webcam_display_group/<groupe>.json\`, le fichier que
 * son lecteur lit), et les caméras de l'ancienne table. ${table.size} stations,
 * ${n} caméras.
 */

export type Camera = {
  label: string;
  url: string;
  fournisseur: string;
  /** Une image fixe plutôt qu'un lecteur. */
  kind?: "image";
};

export const CAMERAS: Readonly<Record<string, readonly Camera[]>> = {
${lignes.join("\n")}
};
`;
  return src;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, sortie, jour] = process.argv.slice(2);
  const cible = sortie ?? fileURLToPath(new URL("../../src/lib/webcams.data.ts", import.meta.url));
  const texte = genererTable(dir ? path.resolve(dir) : RELEVE, jour ?? null);
  writeFileSync(cible, texte);
  const cams = (texte.match(/^ {4}\{ label:/gm) ?? []).length;
  console.log(`écrit : ${cible} (${cams} caméras)`);
}

