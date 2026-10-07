/**
 * Les équipements d'une annonce, sur une liste fermée de douze clés.
 *
 * Deux lectures, et une seule règle : ce que l'annonce ne dit pas vaut
 * `inconnu`, jamais `non`.
 *
 * - Une liste structurée (les équipements d'une fiche Airbnb, les
 *   pictogrammes d'une centrale) : un équipement listé vaut `oui`, un
 *   équipement que la plateforme marque comme absent vaut `non`.
 * - Un texte libre (une description) : un équipement nommé vaut `oui` ; `non`
 *   seulement quand le texte le dit en toutes lettres (« sans ascenseur »,
 *   « animaux non admis »).
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import { aTraduire } from "../i18n/tr.ts";

export const CLES_EQUIPEMENT = [
  "balcon",
  "cheminee",
  "wifi",
  "laveVaisselle",
  "laveLinge",
  "linge",
  "parking",
  "casierSkis",
  "saunaSpa",
  "piscine",
  "animaux",
  "ascenseur",
] as const;
export type CleEquipement = (typeof CLES_EQUIPEMENT)[number];
export type ValeurEquipement = "oui" | "non" | "inconnu";
export type Equipement = { cle: CleEquipement; libelle: string; valeur: ValeurEquipement };

/** Les libellés, en français ; à traduire au rendu : `tr(LIBELLE_EQUIPEMENT[c])`. */
export const LIBELLE_EQUIPEMENT: Record<CleEquipement, string> = {
  balcon: aTraduire("Balcon ou terrasse"),
  cheminee: aTraduire("Cheminée"),
  wifi: aTraduire("Wi-Fi"),
  laveVaisselle: aTraduire("Lave-vaisselle"),
  laveLinge: aTraduire("Lave-linge"),
  linge: aTraduire("Linge fourni"),
  parking: aTraduire("Parking"),
  casierSkis: aTraduire("Local ou casier à skis"),
  saunaSpa: aTraduire("Sauna ou spa"),
  piscine: aTraduire("Piscine"),
  animaux: aTraduire("Animaux acceptés"),
  ascenseur: aTraduire("Ascenseur"),
};

/** Minuscules, sans accents, apostrophes droites, espaces repliées. */
export function plierEquipement(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ce qui désigne chaque équipement, en français et en anglais, sur un texte
 * plié. « Lift » n'est pas un ascenseur : c'est une remontée.
 */
const OUI: Record<CleEquipement, RegExp> = {
  balcon: /\b(balcons?|terrasses?|balcony|balconies|terrace|patio)\b/,
  cheminee: /\b(cheminee|poele a bois|insert|fireplace|wood ?(burning )?stove)\b/,
  wifi: /\b(wi[- ]?fi|wireless|internet)\b/,
  laveVaisselle: /\b(lave[- ]?vaisselle|dishwasher)\b/,
  laveLinge: /\b(lave[- ]?linge|machine a laver|washing machine|washer)\b/,
  linge: /\b(linge (de maison|de lit|fourni|inclus|de toilette)|draps|serviettes|bed linens?|linens|towels|essentials)\b/,
  parking: /\b(parking|garage|stationnement|place de parc|car park)\b/,
  casierSkis: /\b(casiers? a skis?|locals? a skis?|local skis?|casiers? skis?|ski ?rooms?|skiroom|ski lockers?|ski storage)\b/,
  saunaSpa: /\b(sauna|spa|hammam|jacuzzi|bain a remous|bain nordique|hot tub)\b/,
  piscine: /\b(piscine|swimming pool|pool)\b/,
  animaux: /\b(animaux (acceptes|admis|bienvenus|autorises|avec supplement)|animal (accepte|admis)|pets? (allowed|welcome)|pet friendly)\b/,
  ascenseur: /\b(ascenseur|elevator)\b/,
};

/** Ce qui dit l'absence en toutes lettres. */
const NON: Partial<Record<CleEquipement, RegExp>> = {
  wifi: /\b(pas de wi[- ]?fi|sans wi[- ]?fi|no wi[- ]?fi)\b/,
  parking: /\b(pas de parking|sans parking|no parking)\b/,
  animaux: /\b(animaux[^.]{0,30}\b(ne sont pas|non|pas) (toleres|acceptes|admis|autorises)|animaux (interdits|refuses)|pas d'animaux|no pets|pets not allowed)\b/,
  ascenseur: /\b(sans ascenseur|pas d'ascenseur|no elevator)\b/,
  piscine: /\b(pas de piscine|sans piscine)\b/,
  // Le linge de lit ou de maison. Le linge de toilette seul n'en décide pas :
  // ses mentions sont ôtées avant (`SANS_TOILETTE`).
  // « La location de linge de maison est incluse » (Morzine, GreenGo) dit le
  // contraire : une location suivie de « inclus » ou « compris » n'est pas une absence.
  linge: /\b((linge|draps)[^.\n]{0,60}\bnon (fourni|fournis|inclus|compris)|linge (de lit )?en option|location de linge(?![^.\n]{0,40}\b(inclus|incluse|compris|comprise|offert|offerte)\b)|linge a louer)\b/,
};

/** « Linge de toilette non fourni », « serviettes non incluses » : rien ne s'en
 *  déduit pour le linge de lit (« draps fournis, linge de toilette non
 *  fourni », Pralognan). */
const SANS_TOILETTE = /\b(linge de toilette|serviettes)( de toilette)? non (fourni|fournis|fournies|inclus|incluses|compris)\b/g;

export type EquipementsLus = Partial<Record<CleEquipement, "oui" | "non">>;

/** Lit un texte libre : `oui` pour un équipement nommé, `non` pour une
 *  absence écrite. Le silence ne donne rien. */
export function depuisTexte(texte: string | null | undefined): EquipementsLus {
  const t = plierEquipement(texte ?? "");
  const out: EquipementsLus = {};
  if (!t) return out;
  for (const c of CLES_EQUIPEMENT) {
    if (NON[c]?.test(c === "linge" ? t.replace(SANS_TOILETTE, " ") : t)) out[c] = "non";
    else if (OUI[c].test(t)) out[c] = "oui";
  }
  return out;
}

/**
 * Lit une liste structurée : chaque élément nomme un équipement et dit, quand
 * la plateforme le précise, s'il est présent (`disponible`). Un élément
 * présent l'emporte sur un absent du même nom.
 */
export function depuisListe(items: readonly { texte: string; disponible?: boolean | null }[]): EquipementsLus {
  const out: EquipementsLus = {};
  for (const it of items) {
    const lu = depuisTexte(it.texte);
    for (const c of Object.keys(lu) as CleEquipement[]) {
      const v = it.disponible === false ? "non" : lu[c];
      if (v === "oui" || out[c] !== "oui") out[c] = v;
    }
  }
  return out;
}

/** Réunit plusieurs lectures, la première l'emportant : la liste structurée
 *  avant le texte libre. */
export function fusionner(...parts: readonly (EquipementsLus | null | undefined)[]): EquipementsLus {
  const out: EquipementsLus = {};
  for (const p of parts) {
    if (!p) continue;
    for (const c of Object.keys(p) as CleEquipement[]) if (out[c] == null && p[c]) out[c] = p[c];
  }
  return out;
}

/** Les douze équipements, dans l'ordre de la liste ; `inconnu` pour ce que
 *  l'annonce ne dit pas. `null` quand aucune source n'a été lue : une annonce
 *  sans équipements relevés n'est pas une annonce « sans rien ». */
export function equipements(lus: EquipementsLus | null | undefined): Equipement[] | null {
  if (!lus) return null;
  return CLES_EQUIPEMENT.map((cle) => ({ cle, libelle: LIBELLE_EQUIPEMENT[cle], valeur: lus[cle] ?? "inconnu" }));
}

/* ---------- Les équipements d'une fiche lue, sur une table ouverte ---------- */

/**
 * Un équipement tel qu'une fiche le publie (`FicheEnrichie.equipements`) :
 *
 * - `id` : la clé normalisée de la table (`seche_cheveux`, `television`…), ou
 *   `autre:<libellé plié>` quand le libellé n'y figure pas — on ne lui
 *   invente pas de clé ;
 * - `libelle` : le texte de la source, tel quel (souvent en anglais) ;
 * - `present` : `true` s'il est listé comme inclus, `false` seulement quand la
 *   source dit qu'il manque (élément barré, « non inclus », « not allowed »).
 *   Un équipement que la fiche ne mentionne pas n'y est pas du tout : il
 *   n'est pas absent, il est inconnu.
 *
 * Distinct de `Equipement` ci-dessus, la liste fermée de douze clés que
 * remplissent les collecteurs existants ; `depuisAmenities` la ramène ici.
 */
export type EquipementFiche = { id: string; libelle: string; present: boolean; groupe?: string };

type DefEquipement = { libelle: string; groupe: string; motif: RegExp };

/**
 * La table, dans l'ordre où elle se lit : le premier motif qui reconnaît le
 * libellé plié l'emporte. D'où « sèche-cheveux » avant « sèche-linge »,
 * « lave-vaisselle » avant « lave-linge » (dishwasher avant washer). Un
 * libellé qui ne fait que mentionner un équipement plus loin dans la phrase
 * (« Accès au parking de la piscine ») se lit sur son début : les motifs sont
 * ancrés au premier mot utile.
 */
const TABLE: readonly [string, DefEquipement][] = [
  ["seche_cheveux", { libelle: aTraduire("Sèche-cheveux"), groupe: aTraduire("Salle de bain"), motif: /^(hair ?dryer|seche[- ]?cheveux)\b/ }],
  ["television", { libelle: aTraduire("Télévision"), groupe: aTraduire("Divertissement"), motif: /^((\d+\s*(?:"|''|pouces|inch(?:es)?)\s+)?(hd ?tv|smart ?tv|tv|television|televiseur))\b/ }],
  ["wifi", { libelle: aTraduire("Wi-Fi"), groupe: aTraduire("Internet"), motif: /^((connexion|acces) )?((free|fast|gratuit|rapide) )?(wi[- ]?fi|wireless internet|internet)\b/ }],
  ["lave_vaisselle", { libelle: aTraduire("Lave-vaisselle"), groupe: aTraduire("Cuisine"), motif: /^(dishwasher|lave[- ]?vaisselle)\b/ }],
  ["seche_linge", { libelle: aTraduire("Sèche-linge"), groupe: aTraduire("Buanderie"), motif: /^((free |paid )?(tumble )?dryer|seche[- ]?linge)\b/ }],
  ["lave_linge", { libelle: aTraduire("Lave-linge"), groupe: aTraduire("Buanderie"), motif: /^((free |paid )?(washer|washing machine)|lave[- ]?linge|machine a laver)\b/ }],
  ["fer", { libelle: aTraduire("Fer à repasser"), groupe: aTraduire("Buanderie"), motif: /^(iron|fer a repasser|fer)\b/ }],
  ["ascenseur", { libelle: aTraduire("Ascenseur"), groupe: aTraduire("Accès"), motif: /^(elevator|ascenseur|lifts?$)/ }],
  ["parking", { libelle: aTraduire("Parking"), groupe: aTraduire("Parking"), motif: /^((free|paid|toll|private|gratuit|payant|prive) )?(parking|garage|car park|stationnement)\b|^parking\b/ }],
  ["piscine", { libelle: aTraduire("Piscine"), groupe: aTraduire("Bien-être"), motif: /^((private|shared|indoor|outdoor|heated|privee?|partagee?|interieure?|exterieure?|chauffee?) )?(swimming )?(pool|piscine)\b(?! table)/ }],
  ["jacuzzi", { libelle: aTraduire("Jacuzzi"), groupe: aTraduire("Bien-être"), motif: /^((private|shared|prive|partage) )?(hot tub|jacuzzi|bain a remous|spa bath)\b/ }],
  ["sauna", { libelle: aTraduire("Sauna"), groupe: aTraduire("Bien-être"), motif: /^((private|shared|prive|partage) )?sauna\b/ }],
  ["climatisation", { libelle: aTraduire("Climatisation"), groupe: aTraduire("Chauffage et climatisation"), motif: /^((central |portable )?(air conditioning|ac unit|a\/c)|climatisation|clim)\b/ }],
  ["chauffage", { libelle: aTraduire("Chauffage"), groupe: aTraduire("Chauffage et climatisation"), motif: /^((central |radiant |electric |gas )?heating|chauffage)\b/ }],
  ["cheminee", { libelle: aTraduire("Cheminée"), groupe: aTraduire("Chauffage et climatisation"), motif: /^((indoor )?fireplace|chimney|cheminee|poele a bois|wood ?(burning )?stove)\b/ }],
  ["ski_aux_pieds", { libelle: aTraduire("Ski aux pieds"), groupe: aTraduire("Ski"), motif: /^(ski[- ]?in ?\/? ?ski[- ]?out|ski[- ]?in|skis? aux pieds|acces (direct )?aux pistes skis? aux pieds)\b/ }],
  ["casier_skis", { libelle: aTraduire("Local ou casier à skis"), groupe: aTraduire("Ski"), motif: /^(ski (storage|room|lockers?)|skiroom|casiers? a skis?|locals? a skis?)\b/ }],
  ["animaux", { libelle: aTraduire("Animaux acceptés"), groupe: aTraduire("Règles"), motif: /^(pets?|animaux)( (allowed|welcome|acceptes|admis|autorises|bienvenus))?$/ }],
  ["barbecue", { libelle: aTraduire("Barbecue"), groupe: aTraduire("Extérieur"), motif: /^(bbq( grill)?|barbecue)\b/ }],
  ["balcon", { libelle: aTraduire("Balcon ou terrasse"), groupe: aTraduire("Extérieur"), motif: /^((private |prive )?(patio or balcony|balcony|balcon|terrace|terrasse|patio))\b/ }],
  ["vue", { libelle: aTraduire("Vue"), groupe: aTraduire("Extérieur"), motif: /^((mountains?|ski slopes?|valley|lake|lac|montagne)\s+view|vue\b)/ }],
  ["linge_fourni", { libelle: aTraduire("Linge fourni"), groupe: aTraduire("Chambre"), motif: /^(bed linens?|(bed )?sheets|linge de (lit|maison)( fourni| inclus)?|draps( fournis)?)\b/ }],
  ["sauna_spa", { libelle: aTraduire("Sauna ou spa"), groupe: aTraduire("Bien-être"), motif: /^sauna ou spa$/ }],
];

/** Les libellés français et les groupes de la table, par clé. */
export const EQUIPEMENTS_FICHE: Readonly<Record<string, { libelle: string; groupe: string }>> = Object.fromEntries(
  TABLE.map(([id, d]) => [id, { libelle: d.libelle, groupe: d.groupe }]),
);

/** Ce que l'écran met en avant quand la fiche les liste. */
export const EQUIPEMENTS_EN_AVANT: readonly string[] = ["television", "seche_cheveux", "wifi", "lave_linge", "parking", "ski_aux_pieds"];

/**
 * Ce qui dit qu'un équipement manque, en tête ou en fin de libellé : « No
 * pets », « Pas de wifi », « Unavailable: TV », « Animaux non admis »,
 * « Pets not allowed », « Sèche-cheveux non inclus ».
 */
const ABSENT_DEBUT = /^(unavailable ?: ?|not included ?: ?|non disponible ?: ?|no |pas de |pas d'|sans )/;
const ABSENT_FIN = /\b(not (allowed|included|available)|unavailable|non (inclus|incluse|compris|comprise|admis|acceptes?|autorises?|disponible|fourni)|interdits?|refuses?)$/;

function plierLibelle(libelle: string): string {
  return plierEquipement(libelle).replace(/[’']/g, "'");
}

/** La clé d'un libellé de la source, ou `autre:<libellé plié>`. */
export function idEquipement(libelle: string): string {
  const plie = plierLibelle(libelle);
  // « Pets not allowed », « No pets » se lisent « pets » : la marque d'absence
  // ôtée, le nom reste à reconnaître.
  const nu = plie.replace(ABSENT_DEBUT, "").replace(ABSENT_FIN, "").replace(/[\s:.,;-]+$/, "").trim();
  for (const t of [nu, plie]) for (const [id, d] of TABLE) if (d.motif.test(t)) return id;
  return `autre:${nu || plie}`;
}

/** La source dit-elle, dans le libellé même, que l'équipement manque ? */
function absentDansLibelle(libelle: string): boolean {
  const plie = plierLibelle(libelle);
  return ABSENT_DEBUT.test(plie) || ABSENT_FIN.test(plie);
}

/**
 * Les équipements d'une fiche, normalisés et dédoublonnés par clé. Chaque
 * élément dit, quand la source le précise (`present`), s'il est inclus ; à
 * défaut, son libellé seul en décide (« No pets » : absent ; « Wifi » :
 * présent). Un équipement présent l'emporte sur un absent de même clé ; le
 * premier libellé reste. Le groupe est celui de la table, à défaut celui de
 * la source.
 */
export function normaliserEquipements(
  items: readonly { libelle: string; present?: boolean | null; groupe?: string | null }[],
): EquipementFiche[] {
  const out = new Map<string, EquipementFiche>();
  for (const it of items) {
    const libelle = it.libelle?.trim();
    if (!libelle) continue;
    const id = idEquipement(libelle);
    const present = it.present == null ? !absentDansLibelle(libelle) : it.present;
    const groupe = EQUIPEMENTS_FICHE[id]?.groupe ?? (it.groupe?.trim() || undefined);
    const deja = out.get(id);
    if (!deja) out.set(id, { id, libelle, present, ...(groupe ? { groupe } : {}) });
    else if (present && !deja.present) out.set(id, { ...deja, present: true });
  }
  return [...out.values()];
}

/** Les douze clés des collecteurs existants, vers la table ouverte. */
const DEPUIS_CLE: Record<CleEquipement, string> = {
  balcon: "balcon",
  cheminee: "cheminee",
  wifi: "wifi",
  laveVaisselle: "lave_vaisselle",
  laveLinge: "lave_linge",
  linge: "linge_fourni",
  parking: "parking",
  casierSkis: "casier_skis",
  saunaSpa: "sauna_spa",
  piscine: "piscine",
  animaux: "animaux",
  ascenseur: "ascenseur",
};

/**
 * Les équipements des collecteurs existants (`Listing.amenities`, douze clés)
 * sur la table ouverte. `inconnu` ne donne rien : ce que l'annonce tait n'est
 * ni présent ni absent. `null` quand aucune liste n'a été relevée.
 */
export function depuisAmenities(amenities: readonly Equipement[] | null | undefined): EquipementFiche[] | null {
  if (!amenities?.some((e) => e.valeur !== "inconnu")) return null;
  const out: EquipementFiche[] = [];
  for (const e of amenities) {
    if (e.valeur === "inconnu") continue;
    const id = DEPUIS_CLE[e.cle];
    out.push({ id, libelle: LIBELLE_EQUIPEMENT[e.cle], present: e.valeur === "oui", groupe: EQUIPEMENTS_FICHE[id]?.groupe });
  }
  return out;
}
