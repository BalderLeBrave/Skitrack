/**
 * Territoire d'une annonce, comparé à la station cherchée.
 *
 * Gîtes de France encode le département dans l'URL
 * (`/fr/normandie/manche/…`) et dans le code (`50G…` = Manche). Sans GPS,
 * c'est la seule preuve qu'un gîte n'est pas à Flumet. Un logement à 700 km
 * n'est pas « non mesurable » : il est ailleurs.
 */

export const LIMITE_TERRITOIRE_M = 80_000;

type Dept = { code: string; slug: string; name: string };

const DEPTS: Dept[] = [
  { code: "01", slug: "ain", name: "Ain" },
  { code: "04", slug: "alpes-de-haute-provence", name: "Alpes-de-Haute-Provence" },
  { code: "05", slug: "hautes-alpes", name: "Hautes-Alpes" },
  { code: "06", slug: "alpes-maritimes", name: "Alpes-Maritimes" },
  { code: "09", slug: "ariege", name: "Ariège" },
  { code: "11", slug: "aude", name: "Aude" },
  { code: "15", slug: "cantal", name: "Cantal" },
  { code: "26", slug: "drome", name: "Drôme" },
  { code: "31", slug: "haute-garonne", name: "Haute-Garonne" },
  { code: "38", slug: "isere", name: "Isère" },
  { code: "39", slug: "jura", name: "Jura" },
  { code: "63", slug: "puy-de-dome", name: "Puy-de-Dôme" },
  { code: "64", slug: "pyrenees-atlantiques", name: "Pyrénées-Atlantiques" },
  { code: "65", slug: "hautes-pyrenees", name: "Hautes-Pyrénées" },
  { code: "66", slug: "pyrenees-orientales", name: "Pyrénées-Orientales" },
  { code: "68", slug: "haut-rhin", name: "Haut-Rhin" },
  { code: "73", slug: "savoie", name: "Savoie" },
  { code: "74", slug: "haute-savoie", name: "Haute-Savoie" },
  { code: "83", slug: "var", name: "Var" },
  { code: "88", slug: "vosges", name: "Vosges" },
  { code: "14", slug: "calvados", name: "Calvados" },
  { code: "22", slug: "cotes-d-armor", name: "Côtes-d'Armor" },
  { code: "23", slug: "creuse", name: "Creuse" },
  { code: "29", slug: "finistere", name: "Finistère" },
  { code: "35", slug: "ille-et-vilaine", name: "Ille-et-Vilaine" },
  { code: "44", slug: "loire-atlantique", name: "Loire-Atlantique" },
  { code: "50", slug: "manche", name: "Manche" },
  { code: "56", slug: "morbihan", name: "Morbihan" },
  { code: "69", slug: "rhone", name: "Rhône" },
  { code: "75", slug: "paris", name: "Paris" },
];

/** Départements limitrophes qui peuvent partager un domaine skiable. */
const VOISINS: Record<string, readonly string[]> = {
  "01": ["74", "39"],
  "04": ["05", "06", "83"],
  "05": ["04", "38", "73"],
  "06": ["04", "83"],
  "09": ["11", "31", "66"],
  "11": ["09", "66"],
  "26": ["38"],
  "31": ["09", "65"],
  "38": ["05", "26", "73"],
  "39": ["01", "88"],
  "64": ["65"],
  "65": ["31", "64"],
  "66": ["09", "11"],
  "73": ["05", "38", "74"],
  "74": ["01", "73"],
  "83": ["04", "06"],
};

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function codeDepartement(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const f = fold(raw);
  if (/^\d{2}$/.test(f)) return f;
  const hit = DEPTS.find((d) => d.slug === f || fold(d.name) === f);
  return hit?.code ?? null;
}

export function deptDepuisAnnonce(listing: {
  id?: string;
  url?: string | null;
  source?: string;
}): string | null {
  const blob = `${listing.id ?? ""} ${listing.url ?? ""}`;
  const code = blob.match(/\b(\d{2})g\d{3,}/i);
  if (code) return code[1];
  const slug = (listing.url ?? "").match(/gites-de-france\.com\/fr\/[^/]+\/([^/?#]+)/i);
  if (slug) return codeDepartement(slug[1]);
  return null;
}

export function deptCompatible(annonce: string | null, station: string | null): boolean {
  if (!annonce || !station) return false;
  if (annonce === station) return true;
  return (VOISINS[station] ?? []).includes(annonce);
}

/**
 * Preuve d'un autre territoire, sans GPS.
 *
 * Un gîte dont le code ou l'URL dit Manche n'est pas à Flumet. Sans cette
 * preuve, on ne tranche pas : l'absence de GPS n'est pas une distance.
 */
export function territoireReasonFor(
  listing: { id?: string; url?: string | null; source?: string },
  searchedDept: string | null | undefined,
): "autre-domaine" | null {
  const station = codeDepartement(searchedDept ?? null);
  const annonce = deptDepuisAnnonce(listing);
  if (!station || !annonce) return null;
  return deptCompatible(annonce, station) ? null : "autre-domaine";
}
