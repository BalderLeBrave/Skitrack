/**
 * Massifs Météo-France, et le rattachement d'une station à l'un d'eux.
 *
 * Le rattachement se faisait par recherche de sous-chaîne sur le seul nom de la
 * station. Une station sur deux, dans les Alpes, n'obtenait aucun massif — donc
 * aucun bulletin, sans que rien ne le dise — et la recherche sans frontière de
 * mot produisait des faux rattachements : « Le Chinaillon » contient « aillon »
 * et recevait le bulletin des Bauges, « Megevette » contient « megeve » et
 * recevait celui du Mont-Blanc.
 *
 * Trois voies, de la plus sûre à la moins sûre, et la voie retenue est toujours
 * rendue avec le résultat pour que l'écran puisse la dire :
 *
 * 1. `nom` — le nom de la station porte un mot-clé de massif, aux frontières de
 *    mot près ;
 * 2. `domaine` — le domaine de rattachement, lui, en porte un. « Arc 1600 » ne
 *    dit rien, « Les Arcs » dit Haute-Tarentaise ;
 * 3. `proximite` — la station est rattachée au massif de la station reconnue la
 *    plus proche, dans un rayon borné. C'est une déduction géographique, et
 *    elle est annoncée comme telle.
 *
 * Hors des Alpes, des Pyrénées et de la Corse, Météo-France ne publie aucun
 * bulletin : l'absence y est légitime, et se dit en toutes lettres plutôt que
 * de se confondre avec un échec.
 */

/**
 * Les mots-clés par massif. Exporté pour que le test puisse vérifier
 * l'invariant qui manquait : **tout code de `MF_CODES` a sa ligne ici**. Un
 * code sans mot-clé ne peut être produit par aucun nom, et l'ajouter à la
 * table ne change donc rien — c'était le cas du Thabor et de l'Orlu.
 */
export const BRA_KEYWORDS: [string, string[]][] = [
  ["Haute-Tarentaise", ["tignes", "val d isere", "espace killy", "les arcs", "la rosiere", "sainte foy", "peisey", "vallandry", "villaroger", "bourg saint maurice", "paradiski"]],
  ["Vanoise", ["la plagne", "courchevel", "meribel", "les menuires", "val thorens", "3 vallees", "trois vallees", "valmorel", "champagny", "pralognan", "brides", "la tania", "saint martin de belleville"]],
  ["Haute-Maurienne", ["val cenis", "bessans", "bonneval", "haute maurienne", "termignon"]],
  ["Maurienne", ["valloire", "valmeinier", "karellis", "la toussuire", "le corbier", "saint sorlin", "sybelles"]],
  ["Thabor", ["valfrejus", "nevache", "thabor"]],
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
  ["Aspe-Ossau", ["gourette", "artouste", "pierre saint martin", "pierre st martin", "la pierre st martin"]],
  ["Luchonnais", ["superbagneres", "luchon"]],
  ["Haute-Ariege", ["ax 3 domaines", "ax les thermes", "ariege"]],
  ["Orlu-Saint_Barthelemy", ["ascou", "pailheres", "ascou pailheres", "monts d olmes", "olmes", "orlu"]],
  ["Capcir-Puymorens", ["formigueres", "les angles", "porte puymorens"]],
  ["Cerdagne-Canigou", ["font romeu", "pyrenees 2000", "canigou"]],
  ["Couserans", ["guzet", "couserans"]],
  ["Pays-Basque", ["iraty", "pays basque"]],
  ["Renoso-Incudine", ["ghisoni", "val d ese", "bastelica", "renoso"]],
  ["Cinto-Rotondo", ["asco", "haut asco", "vergio", "cinto"]],
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
  // Identifiants qui manquaient à la table. Un code sans mot-clé reste
  // inatteignable : chacun de ces quatre massifs a sa ligne dans
  // `BRA_KEYWORDS` ci-dessus, sans quoi l'ajout ne changeait rien.
  Thabor: 13,
  "Cinto-Rotondo": 40,
  "Renoso-Incudine": 41,
  "Orlu-Saint_Barthelemy": 72,
};

/** Les massifs du référentiel où Météo-France publie un bulletin. Ailleurs —
 *  Vosges, Jura, Massif Central — il n'y en a pas, et c'est normal. */
const ZONE_BRA = new Set(["Alpes du Nord", "Alpes du Sud", "Pyrénées", "Corse"]);

export function publieUnBra(massifReferentiel: string | null | undefined): boolean {
  return !!massifReferentiel && ZONE_BRA.has(massifReferentiel);
}

function camKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le mot-clé doit être un mot, ou une suite de mots, du texte : `includes`
 *  rattachait « Le Chinaillon » aux Bauges par le fragment « aillon ». */
function contientMot(texte: string, cle: string): boolean {
  let depuis = 0;
  for (;;) {
    const i = texte.indexOf(cle, depuis);
    if (i < 0) return false;
    const avant = i === 0 || texte[i - 1] === " ";
    const apres = i + cle.length === texte.length || texte[i + cle.length] === " ";
    if (avant && apres) return true;
    depuis = i + 1;
  }
}

function longestMatch(haystack: string): string | null {
  let best: string | null = null;
  let length = 0;
  for (const [massif, keys] of BRA_KEYWORDS) {
    for (const key of keys) {
      if (key.length > length && contientMot(haystack, key)) {
        best = massif;
        length = key.length;
      }
    }
  }
  return best;
}

/** Comment le massif a été trouvé. Rendu avec le résultat : un rattachement
 *  déduit ne se présente pas comme un rattachement relevé. */
export type VoieBra = "nom" | "domaine" | "proximite";

export type RattachementBra = {
  massif: string | null;
  code: number | null;
  voie: VoieBra | null;
  /** Météo-France ne publie pas de bulletin pour ce massif du référentiel. */
  horsZone: boolean;
};

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

/** Le massif d'un point, par la station reconnue la plus proche. */
export type Repere = { lat: number; lon: number; massif: string };

const RAYON_MAX_KM = 30;

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const m = ((aLat + bLat) / 2) * (Math.PI / 180);
  const x = dLon * Math.cos(m);
  return Math.sqrt(dLat * dLat + x * x) * R;
}

export function massifLePlusProche(
  lat: number,
  lon: number,
  reperes: readonly Repere[],
  rayonKm = RAYON_MAX_KM,
): string | null {
  let best: { massif: string; d: number } | null = null;
  for (const r of reperes) {
    const d = distKm(lat, lon, r.lat, r.lon);
    if (d <= rayonKm && (!best || d < best.d)) best = { massif: r.massif, d };
  }
  return best?.massif ?? null;
}

/**
 * Le rattachement complet d'une station, avec la voie retenue.
 *
 * `reperes` porte les stations déjà rattachées par leur nom ou leur domaine ;
 * l'appelant le construit une fois (`reperesBra`).
 */
export function rattachementBra(
  station: { name: string; massif?: string | null; domain?: string | null; lat?: number; lon?: number },
  reperes: readonly Repere[] = [],
): RattachementBra {
  const horsZone = !publieUnBra(station.massif);
  const parNom = longestMatch(camKey(station.name));
  if (parNom) return { massif: parNom, code: MF_CODES[parNom] ?? null, voie: "nom", horsZone };
  const parDomaine = station.domain ? longestMatch(camKey(station.domain)) : null;
  if (parDomaine)
    return { massif: parDomaine, code: MF_CODES[parDomaine] ?? null, voie: "domaine", horsZone };
  if (!horsZone && station.lat != null && station.lon != null && reperes.length) {
    const proche = massifLePlusProche(station.lat, station.lon, reperes);
    if (proche) return { massif: proche, code: MF_CODES[proche] ?? null, voie: "proximite", horsZone };
  }
  return { massif: null, code: null, voie: null, horsZone };
}

/** Les stations rattachées par leur nom ou leur domaine : les repères qui
 *  servent au rattachement par proximité des autres. */
export function reperesBra(
  stations: readonly {
    name: string;
    massif?: string | null;
    domain?: string | null;
    lat: number;
    lon: number;
  }[],
): Repere[] {
  const out: Repere[] = [];
  for (const s of stations) {
    if (!publieUnBra(s.massif)) continue;
    const m = longestMatch(camKey(s.name)) ?? (s.domain ? longestMatch(camKey(s.domain)) : null);
    if (m && Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
      out.push({ lat: s.lat, lon: s.lon, massif: m });
    }
  }
  return out;
}
