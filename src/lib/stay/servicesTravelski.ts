/**
 * Les services d'une résidence Travelski, tels que sa fiche les publie : le
 * champ `services` de la ligne `window.lihe` (lue par
 * `scrape/agences/travelski.ts`), un HTML en sections sous un titre en gras,
 * une ligne par service, « Libellé : détail ».
 *
 * Relevé le 6 octobre 2026 sur Atria-Crozats, Avoriaz
 * (`travelski-fiche-8493-contenu.html`) : « <b>Services inclus</b> », dix
 * lignes (« Linge de lit », « Télévision », « Wi-Fi dans les hébergements »,
 * « Casiers à skis »…), puis « <b>Services payants</b> », dont plusieurs
 * hors du logement : restaurants partenaires « répartis dans la station »,
 * squash dans un autre immeuble, spa dans une autre résidence.
 *
 * Seuls les services inclus deviennent des équipements publiés
 * (`Listing.equipementsPublies`) : un service payant n'est pas un équipement
 * du logement, et l'écran ne dit pas qu'il se paie. Le libellé est ce qui
 * précède le premier « : », tel quel ; le détail ne se lit pas ici (les
 * services entiers et la description donnent déjà les douze clés,
 * `contenuTravelski`). Sans titre « Services inclus », rien : on ne devine
 * pas ce qui est inclus.
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import type { EquipementPublie } from "./equipements.ts";
import { texteDeHtml } from "./texteHtml.ts";

/** Le titre de la section retenue, plié. */
const INCLUS = "services inclus";

/** Plus long, c'est une phrase, pas le nom d'un service. */
const LIBELLE_MAX = 80;

function plier(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Le titre d'une ligne faite d'un seul `<b>…</b>`, ou `null`. */
function titreDe(ligne: string): string | null {
  const m = /^\s*<b\b[^>]*>([\s\S]*?)<\/b>\s*$/i.exec(ligne);
  return m ? (texteDeHtml(m[1]) ?? "") : null;
}

/**
 * Les services inclus d'une résidence, un équipement publié par ligne :
 * présent, avec le titre de la section pour groupe. Un libellé ne vient
 * qu'une fois. Rien sans section « Services inclus ».
 */
export function servicesInclus(html: string | null | undefined): EquipementPublie[] {
  if (typeof html !== "string" || !html) return [];
  const out: EquipementPublie[] = [];
  const vus = new Set<string>();
  /** Le titre de la section en cours ; `null` hors section. */
  let section: string | null = null;
  for (const brute of html.split(/<br\s*\/?>/i)) {
    const titre = titreDe(brute);
    if (titre != null) {
      section = titre;
      continue;
    }
    if (section == null || plier(section) !== INCLUS) continue;
    for (const ligne of (texteDeHtml(brute) ?? "").split("\n")) {
      // « Linge de lit : Linge de lit fourni : drap plat… » → « Linge de lit » ;
      // « Télévision », sans détail, tel quel. Un « : » d'heure (« 9:00 ») ne coupe pas.
      const libelle = ligne.split(/\s*:(?:\s|$)/)[0]!.trim();
      if (!libelle || libelle.length > LIBELLE_MAX || vus.has(plier(libelle))) continue;
      vus.add(plier(libelle));
      out.push({ libelle, present: true, groupe: section });
    }
  }
  return out;
}
