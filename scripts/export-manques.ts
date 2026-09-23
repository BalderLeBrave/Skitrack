/**
 * Le tableau des domaines à qui il manque une photo ou un forfait, à remplir à
 * la main.
 *
 *     node --experimental-strip-types scripts/export-manques.ts [chemin.csv]
 *
 * Écrit un CSV — par défaut `docs/manques-photo-forfait.csv` —, encodé en
 * UTF-8 avec BOM pour qu'Excel lise les accents, séparateur point-virgule pour
 * qu'un Excel français l'ouvre en colonnes sans assistant.
 *
 * ## Ce que le tableau porte
 *
 * Une ligne par domaine nommé auquel il manque une photo, un forfait, **ou
 * l'un des six tarifs** — journée, six jours et saison, adulte et enfant. Les colonnes de gauche disent ce qu'on sait : nom, pays,
 * région, taille, site officiel connu, ce qui manque, et **pourquoi** aucune
 * source ne l'a rendu. Les colonnes de droite sont vides : c'est là qu'on
 * écrit ce qu'on trouve, avec sa source — parce qu'une valeur sans origine ne
 * vaut pas mieux qu'une absence.
 *
 * ## Ce que la saisie devra respecter, pour être relue par un script
 *
 * - `photo_url` : l'adresse de l'image, telle quelle.
 * - `forfait_jour_adulte` et les cinq autres montants : un nombre, virgule ou
 *   point pour les décimales. Les colonnes `releve_*` disent ce qu'une source
 *   publie déjà : une case vide en face d'un `tarifs_manquants` qui la nomme
 *   est ce qu'il reste à trouver.
 * - `devise` : le code ISO 4217 — EUR, CHF, CZK… —, jamais un symbole.
 * - `periode` : « 20.12.26 - 06.01.27 » si le tarif dépend de la date, vide
 *   sinon.
 * - `source` : l'adresse de la page où la valeur se relit.
 *
 * Une ligne remplie sans `source` sera ignorée à la relecture, et c'est voulu.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SORTIE = resolve(process.argv[2] ?? resolve(import.meta.dirname, "../docs/manques-photo-forfait.csv"));

const { paysByCode } = await import("../src/lib/geo/pays.ts");

type Domaine = {
  id: string;
  nom: string;
  pays?: string[];
  region?: string | null;
  localite?: string | null;
  lifts?: number | null;
  km?: number | null;
  minM?: number | null;
  maxM?: number | null;
  sites?: string[];
  lat: number;
  lon: number;
};

const domaines: Domaine[] = [];
for (const f of readdirSync(DATA).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  domaines.push(...(JSON.parse(readFileSync(resolve(DATA, f), "utf8")) as Domaine[]));
}
const POSTES = ["jourAdulte", "jourEnfant", "sixJoursAdulte", "sixJoursEnfant", "saisonAdulte", "saisonEnfant"] as const;
type Poste = (typeof POSTES)[number];
const LIBELLE: Record<Poste, string> = {
  jourAdulte: "jour adulte",
  jourEnfant: "jour enfant",
  sixJoursAdulte: "6 jours adulte",
  sixJoursEnfant: "6 jours enfant",
  saisonAdulte: "saison adulte",
  saisonEnfant: "saison enfant",
};

const vues = JSON.parse(readFileSync(resolve(DATA, "vuesDomaines.json"), "utf8")) as {
  vues: Record<
    string,
    {
      photo: unknown;
      forfait: { devise: string | null; matrice?: Partial<Record<Poste, { prix: number } | null>> } | null;
    }
  >;
};
const sites = JSON.parse(readFileSync(resolve(DATA, "sitesOfficiels.json"), "utf8")) as {
  fiches: Record<string, { statut: number | null; refuse: boolean; url: string | null; pageTarifs?: string | null }>;
};
const tarifs = JSON.parse(readFileSync(resolve(DATA, "tarifsOfficiels.json"), "utf8")) as {
  fiches: Record<string, { pageTarifs: string | null }>;
};

/** Pourquoi aucune source n'a rendu la donnée : la raison, en une phrase. */
function raison(d: Domaine): string {
  const s = sites.fiches[d.id];
  if (!d.sites?.length) return "aucun site web connu (OpenSkiMap n'en publie pas)";
  if (!s) return "site connu, non visité";
  if (s.refuse) return "site refusé (robots.txt ou 429)";
  if (s.statut !== 200) return `site injoignable (${s.statut ?? "pas de réponse"})`;
  return "site visité, rien d'exploitable dans ses métadonnées ni ses tableaux";
}

const csv = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const entetes = [
  "id",
  "nom",
  "pays",
  "region",
  "localite",
  "remontees",
  "km_pistes",
  "bas_m",
  "sommet_m",
  "lat",
  "lon",
  "site_officiel_connu",
  "page_tarifs_trouvee",
  "manque",
  "raison",
  "devise_relevee",
  ...POSTES.map((p) => `releve_${p}`),
  "tarifs_manquants",
  // ── à remplir ──
  "photo_url",
  "photo_legende",
  "forfait_jour_adulte",
  "forfait_jour_enfant",
  "forfait_6j_adulte",
  "forfait_6j_enfant",
  "forfait_saison_adulte",
  "forfait_saison_enfant",
  "devise",
  "periode",
  "source",
  "note",
];

const lignes: string[] = [entetes.join(";")];
let n = 0;
for (const d of domaines.sort((a, b) => a.id.localeCompare(b.id))) {
  const v = vues.vues[d.id];
  const sansPhoto = !v?.photo;
  const sansForfait = !v?.forfait;
  const m = v?.forfait?.matrice;
  // Les six tarifs demandés : ceux qu'aucune source ne publie sont nommés,
  // pour que la case à remplir se sache sans avoir à comparer deux fichiers.
  const manquants = POSTES.filter((p) => !m?.[p]);
  if (!sansPhoto && !sansForfait && manquants.length === 0) continue;
  n++;
  const cc = d.pays?.[0] ?? d.id.slice(0, 2).toUpperCase();
  lignes.push(
    [
      d.id,
      d.nom,
      paysByCode(cc)?.nomFr ?? cc,
      d.region ?? "",
      d.localite ?? "",
      d.lifts ?? "",
      d.km ?? "",
      d.minM ?? "",
      d.maxM ?? "",
      d.lat.toFixed(5),
      d.lon.toFixed(5),
      d.sites?.[0] ?? "",
      tarifs.fiches[d.id]?.pageTarifs ?? sites.fiches[d.id]?.pageTarifs ?? "",
      [sansPhoto ? "photo" : null, sansForfait ? "forfait" : manquants.length ? "tarifs" : null]
        .filter(Boolean)
        .join(" et "),
      raison(d),
      v?.forfait?.devise ?? "",
      ...POSTES.map((p) => m?.[p]?.prix ?? ""),
      manquants.map((p) => LIBELLE[p]).join(", "),
      // ── à remplir, une colonne par tarif demandé ──
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]
      .map(csv)
      .join(";"),
  );
}

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, "﻿" + lignes.join("\r\n") + "\r\n", "utf8");
console.log(`${n} domaines écrits dans ${SORTIE}`);
