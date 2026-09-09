/** Massifs Météo-France (France uniquement) et rattachement par nom de station. */

const BRA_KEYWORDS: [string, string[]][] = [
  ["Haute-Tarentaise", ["tignes", "val d isere", "espace killy", "les arcs", "la rosiere", "sainte foy", "peisey", "vallandry", "villaroger", "bourg saint maurice", "paradiski"]],
  ["Vanoise", ["la plagne", "courchevel", "meribel", "les menuires", "val thorens", "3 vallees", "trois vallees", "valmorel", "champagny", "pralognan", "brides", "la tania", "saint martin de belleville"]],
  ["Haute-Maurienne", ["val cenis", "bessans", "bonneval", "haute maurienne", "termignon"]],
  ["Maurienne", ["valloire", "valmeinier", "karellis", "la toussuire", "le corbier", "saint sorlin", "sybelles", "valfrejus"]],
  ["Grandes-Rousses", ["alpe d huez", "huez", "vaujany", "oz en oisans", "auris"]],
  ["Oisans", ["les 2 alpes", "les deux alpes", "la grave", "venosc", "mont de lans"]],
  ["Belledonne", ["chamrousse", "7 laux", "sept laux"]],
  ["Chartreuse", ["saint pierre de chartreuse", "le sappey", "chartreuse"]],
  ["Vercors", ["villard de lans", "correncon", "autrans", "meaudre", "vercors"]],
  ["Bauges", ["la feclaz", "savoie grand revard", "aillon", "bauges"]],
  ["Beaufortain", ["areches", "beaufort", "les saisies", "espace diamant"]],
  ["Mont-Blanc", ["chamonix", "les houches", "argentiere", "saint gervais", "les contamines", "megeve", "combloux", "vallorcine"]],
  ["Aravis", ["la clusaz", "grand bornand", "manigod", "flaine", "samoens", "morillon", "les carroz", "grand massif", "aravis"]],
  ["Chablais", ["avoriaz", "morzine", "les gets", "chatel", "portes du soleil", "chablais"]],
  ["Pelvoux", ["serre chevalier", "puy saint vincent", "pelvoux", "briancon"]],
  ["Queyras", ["ceillac", "abries", "molines", "saint veran", "queyras", "risoul"]],
  ["Embrunais-Parpaillon", ["les orres", "vars", "foret blanche"]],
  ["Devoluy", ["superdevoluy", "super devoluy", "devoluy"]],
  ["Champsaur", ["orcieres", "merlette", "champsaur"]],
  ["Ubaye", ["pra loup", "praloup", "sauze", "ubaye"]],
  ["Haut_Var-Haut_Verdon", ["val d allos", "allos", "haut verdon"]],
  ["Mercantour", ["isola 2000", "auron", "valberg", "mercantour"]],
  ["Aure-Louron", ["saint lary", "peyragudes", "piau engaly"]],
  ["Haute-Bigorre", ["la mongie", "bareges", "grand tourmalet", "cauterets", "luz ardiden"]],
  ["Aspe-Ossau", ["gourette", "artouste", "pierre saint martin"]],
  ["Luchonnais", ["superbagneres", "luchon"]],
  ["Haute-Ariege", ["ax 3 domaines", "ax les thermes", "ariege"]],
  ["Capcir-Puymorens", ["formigueres", "les angles", "porte puymorens"]],
  ["Cerdagne-Canigou", ["font romeu", "pyrenees 2000", "canigou"]],
  ["Couserans", ["guzet", "couserans"]],
  ["Pays-Basque", ["iraty", "pays basque"]],
];

export const MF_CODES: Record<string, number> = {
  Chablais: 1,
  Aravis: 2,
  "Mont-Blanc": 3,
  Bauges: 4,
  Beaufortain: 5,
  "Haute-Tarentaise": 6,
  Chartreuse: 7,
  Belledonne: 8,
  Maurienne: 9,
  Vanoise: 10,
  "Haute-Maurienne": 11,
  "Grandes-Rousses": 12,
  Vercors: 14,
  Oisans: 15,
  Pelvoux: 16,
  Queyras: 17,
  Devoluy: 18,
  Champsaur: 19,
  "Embrunais-Parpaillon": 20,
  Ubaye: 21,
  "Haut_Var-Haut_Verdon": 22,
  Mercantour: 23,
  "Pays-Basque": 64,
  "Aspe-Ossau": 65,
  "Haute-Bigorre": 66,
  "Aure-Louron": 67,
  Luchonnais: 68,
  Couserans: 69,
  "Haute-Ariege": 70,
  "Capcir-Puymorens": 73,
  "Cerdagne-Canigou": 74,
};

function camKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function longestMatch(haystack: string): string | null {
  let best: string | null = null;
  let length = 0;
  for (const [massif, keys] of BRA_KEYWORDS) {
    for (const key of keys) {
      if (key.length > length && haystack.includes(key)) {
        best = massif;
        length = key.length;
      }
    }
  }
  return best;
}

export function braMassifOf(name: string, massif?: string | null): string | null {
  const own = longestMatch(camKey(name));
  if (own) return own;
  if (massif) {
    const alias = BRA_KEYWORDS.find(([m]) => camKey(m) === camKey(massif));
    if (alias) return alias[0];
    return longestMatch(camKey(massif));
  }
  return null;
}

export function braCodeOf(name: string, massif?: string | null): number | null {
  const m = braMassifOf(name, massif);
  return m ? (MF_CODES[m] ?? null) : null;
}
