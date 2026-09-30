// Étape 2 bis du relevé des webcams (docs/WEBCAMS.md) : les groupes Webcam-HD.
//
//   node scripts/webcams/webcam-hd.mjs [dossier]
//
// Webcam-HD range ses caméras par groupe ; le fichier d'un groupe
// (`smr/json/webcam_display_group/<groupe>.json`) est celui que lit leur
// lecteur. Aucun index public : on essaie des noms de groupe tirés de chaque
// station, une requête toutes les 250 ms.
//
// 1. Identifiant, nom et commune de la station, avec ou sans tirets, et
//    `webcam-station-<nom>` : `whd-groupes.json`.
// 2. Pour les stations restées sans groupe, chaque suite de mots d'au moins
//    cinq lettres (« les-saisies » → « saisies ») : `whd-groupes-2.json`.

import path from "node:path";
import { UA, dossier, ecrireJson, lireJson, pause, slug } from "./commun.mjs";

const dir = dossier(process.argv[2]);
const st = lireJson(path.join(dir, "stations.json"));

async function sonder(essais) {
  const trouves = {};
  for (const [g, ids] of essais) {
    try {
      const r = await fetch(`https://app.webcam-hd.com/smr/json/webcam_display_group/${g}.json`, {
        headers: { "user-agent": UA },
      });
      if (r.status === 200) {
        const j = await r.json();
        if (Array.isArray(j) && j.length) {
          trouves[g] = {
            stations: [...ids],
            cams: j
              .filter((c) => c.public === "1" && c.webcam_display_in_group_web_page_show !== "0")
              .map((c) => ({
                url: `https://app.webcam-hd.com/${g}/${c.url_part_2}`,
                titre: c.webcam_display_in_group_web_page_title,
              })),
          };
          console.log(g, "->", [...ids].join(","), trouves[g].cams.length);
        }
      }
    } catch (e) {
      console.log("erreur", g, String(e).slice(0, 80));
    }
    await pause(250);
  }
  return trouves;
}

const ajouter = (essais, g, id) => {
  if (!essais.has(g)) essais.set(g, new Set());
  essais.get(g).add(id);
};

// Premier passage.
const essais1 = new Map();
for (const s of st) {
  const bases = new Set([s.id, slug(s.nom), slug(s.commune)].filter(Boolean));
  for (const b of [...bases]) bases.add(b.replace(/-/g, ""));
  for (const b of bases) for (const g of [b, `webcam-station-${b}`]) ajouter(essais1, g, s.id);
}
const groupes1 = await sonder(essais1);
ecrireJson(path.join(dir, "whd-groupes.json"), groupes1);

// Second passage, par noms courts.
const couverts = new Set(Object.values(groupes1).flatMap((g) => g.stations));
const essais2 = new Map();
for (const s of st) {
  if (couverts.has(s.id)) continue;
  const bases = new Set();
  for (const src of [s.id, slug(s.nom), slug(s.commune)]) {
    const p = src.split("-");
    for (let i = 1; i <= p.length; i++)
      for (let j = 0; j < i; j++) {
        const b = p.slice(j, i).join("-");
        if (b.replace(/-/g, "").length >= 5) {
          bases.add(b);
          bases.add(b.replace(/-/g, ""));
        }
      }
  }
  for (const b of bases) if (!essais1.has(b)) ajouter(essais2, b, s.id);
}
const groupes2 = await sonder(essais2);
ecrireJson(path.join(dir, "whd-groupes-2.json"), groupes2);
console.log(`groupes : ${Object.keys(groupes1).length} au premier passage, ${Object.keys(groupes2).length} au second`);
