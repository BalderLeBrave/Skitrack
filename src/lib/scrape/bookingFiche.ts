/**
 * La fiche d'un établissement Booking, lue dans le HTML de sa page **déjà
 * chargée** pour le GPS (`bookingGps.server.ts`, `booking.server.ts`) : aucune
 * requête de plus. Module pur, testé sur une page réduite.
 *
 * Ce qu'elle lit, et seulement là où la page le publie :
 *
 * - le JSON-LD de la page : `description`, `aggregateRating` (`ratingValue`,
 *   `reviewCount`, et l'échelle par `bestRating` — sans `bestRating`, pas
 *   d'échelle, donc pas de note), `amenityFeature` ;
 * - la description (`data-testid="property-description"`) ;
 * - les équipements les plus demandés (`data-testid="property-most-popular-facilities-wrapper"`) ;
 * - la note affichée (`data-testid="review-score-component"`), seulement
 *   quand son échelle y est écrite (« 9,2 sur 10 », « 9.2 out of 10 ») ;
 * - les conditions (`id="hotelPoliciesInc"` ou `data-testid="HouseRules-wrapper"`),
 *   rangées par leurs intitulés (Arrivée, Départ, Annulation, Caution,
 *   Animaux domestiques, Fêtes, Fumeurs, Moyens de paiement), dans le texte
 *   de la page.
 *
 * La note brute et son échelle passent par `ficheDepuisBrut` (`noterSur5`) :
 * rien n'est converti ici. Le prix n'est pas lu : il reste celui du relevé.
 */

import type { Listing } from "../listings.ts";
import { ficheDepuisBrut, type FicheBrute, type FicheEnrichie } from "../stay/ficheEnrichie.ts";

const TEXTE_MAX = 6000;

function decoder(t: string): string {
  return t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/** Le texte d'un fragment HTML : balises ôtées, lignes gardées. */
export function texteDeHtml(html: string): string {
  const t = decoder(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\s*(br|\/p|\/li|\/div|\/h\d|\/dt|\/dd|\/tr)\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Le contenu du premier élément qui porte cet attribut **dans une balise
 * ouvrante**, balises équilibrées. Le même texte dans un commentaire ou un
 * script ne compte pas.
 */
export function blocAvec(html: string, attribut: RegExp): string | null {
  const cherche = new RegExp(
    attribut.source,
    attribut.flags.includes("g") ? attribut.flags : `${attribut.flags}g`,
  );
  for (const m of html.matchAll(cherche)) {
    const debut = html.lastIndexOf("<", m.index);
    if (debut < 0 || html.slice(debut, m.index).includes(">")) continue;
    const nom = /^<([a-z][a-z0-9]*)\b/i.exec(html.slice(debut))?.[1];
    if (!nom) continue;
    const re = new RegExp(`<\\s*(/?)${nom}\\b[^>]*?(/?)>`, "gi");
    re.lastIndex = debut;
    let profondeur = 0;
    for (let t = re.exec(html); t; t = re.exec(html)) {
      if (t[2] === "/") continue;
      profondeur += t[1] === "/" ? -1 : 1;
      if (profondeur === 0) return html.slice(debut, t.index + t[0].length);
    }
  }
  return null;
}

type JsonLd = Record<string, unknown>;

function jsonLd(html: string): JsonLd[] {
  const out: JsonLd[] = [];
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const v: unknown = JSON.parse(m[1].trim());
      for (const x of Array.isArray(v) ? v : [v])
        if (x && typeof x === "object") out.push(x as JsonLd);
    } catch {
      /* un bloc illisible ne dit rien */
    }
  }
  return out;
}

function nombre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\s*\d+([.,]\d+)?\s*$/.test(v)) return Number(v.replace(",", "."));
  return null;
}

function chaine(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? decoder(v.trim()) : null;
}

/** Une échelle écrite par la source, ou `null`. */
function echelle(v: unknown): 5 | 10 | 100 | null {
  const n = nombre(v);
  return n === 5 || n === 10 || n === 100 ? n : null;
}

const INTITULES: readonly { k: string; re: RegExp }[] = [
  { k: "arrivee", re: /^(arriv[ée]e|check-?in)$/i },
  { k: "depart", re: /^(d[ée]part|check-?out)$/i },
  {
    k: "annulation",
    re: /^(annulation(\s*\/\s*pr[ée]paiement)?|cancellation(\s*\/\s*prepayment)?)$/i,
  },
  {
    k: "caution",
    re: /^(caution( remboursable)?|d[ée]p[ôo]t de garantie|(refundable )?damage deposit)$/i,
  },
  { k: "animaux", re: /^(animaux( domestiques)?|pets)$/i },
  { k: "fetes", re: /^(f[êe]tes|parties)$/i },
  { k: "fumeurs", re: /^(fumeurs|smoking)$/i },
  {
    k: "paiement",
    re: /^(moyens de paiement accept[ée]s|paiement|accepted payment methods|payment)$/i,
  },
];

function ouiNon(t: string, demande = false): "oui" | "non" | "sur_demande" | null {
  if (demande && /\b(sur demande|on request|upon request)\b/i.test(t)) return "sur_demande";
  if (/\b(ne sont pas|non|pas|interdit\w*|not|no)\b/i.test(t)) return "non";
  if (/\b(admis|accept\w*|autoris\w*|allowed|permitted)\b/i.test(t)) return "oui";
  return null;
}

/** Les conditions publiées, rangées par leurs intitulés. */
export function conditionsBooking(html: string): Record<string, string> | null {
  const bloc =
    blocAvec(html, /\bid=["']hotelPoliciesInc["']/i) ??
    blocAvec(html, /\bdata-testid=["']HouseRules-wrapper["']/i);
  if (!bloc) return null;
  const lignes = texteDeHtml(bloc).split("\n");
  const brut: Record<string, string[]> = {};
  let courant: string | null = null;
  for (const l of lignes) {
    const intitule = INTITULES.find((x) => x.re.test(l));
    if (intitule) {
      courant = intitule.k;
      brut[courant] ??= [];
      continue;
    }
    if (courant) brut[courant].push(l);
  }
  const out: Record<string, string> = {};
  for (const [k, xs] of Object.entries(brut)) {
    const t = xs.join("\n").trim();
    if (!t) continue;
    if (k === "animaux" || k === "fetes" || k === "fumeurs") {
      const v = ouiNon(t, k === "animaux");
      if (v) out[k] = v;
    } else out[k] = t.slice(0, TEXTE_MAX);
  }
  // Rien de rangé : le texte de la section, tel quel.
  const texte = texteDeHtml(bloc).slice(0, TEXTE_MAX);
  if (!Object.keys(out).length && texte) out.texteSource = texte;
  return Object.keys(out).length ? out : null;
}

/** La fiche brute d'une page établissement, ou `null` quand elle ne publie rien. */
export function ficheBookingDepuisHtml(html: string | null | undefined): FicheBrute | null {
  if (!html) return null;
  const ld = jsonLd(html);
  let description: string | null = null;
  const desc = blocAvec(html, /\bdata-testid=["']property-description["']/i);
  if (desc) description = texteDeHtml(desc).slice(0, TEXTE_MAX) || null;

  const equipements: { libelle: string; present: boolean }[] = [];
  const vus = new Set<string>();
  const ajouter = (libelle: string | null, present = true) => {
    if (!libelle || vus.has(libelle.toLowerCase())) return;
    vus.add(libelle.toLowerCase());
    equipements.push({ libelle, present });
  };
  const populaires = blocAvec(
    html,
    /\bdata-testid=["']property-most-popular-facilities-wrapper["']/i,
  );
  if (populaires) {
    for (const li of populaires.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
      ajouter(texteDeHtml(li[1]).split("\n")[0] || null);
  }

  let avis: Record<string, unknown> | null = null;
  for (const x of ld) {
    description ??= chaine(x.description)?.slice(0, TEXTE_MAX) ?? null;
    for (const f of Array.isArray(x.amenityFeature) ? x.amenityFeature : []) {
      if (f && typeof f === "object") {
        const o = f as Record<string, unknown>;
        ajouter(chaine(o.name), o.value === false ? false : true);
      }
    }
    const r = x.aggregateRating;
    if (!avis && r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      avis = {
        noteSource: nombre(o.ratingValue),
        echelleSource: echelle(o.bestRating),
        nombre: nombre(o.reviewCount) ?? nombre(o.ratingCount),
        extraits: [],
      };
    }
  }
  if (!avis) {
    // La note affichée, seulement quand son échelle y est écrite.
    const score = blocAvec(html, /\bdata-testid=["']review-score-component["']/i);
    const t = score ? texteDeHtml(score) : "";
    const m = /(\d+(?:[.,]\d+)?)\s*(?:\/|sur|out of)\s*(5|10|100)\b/i.exec(t);
    const n = /(\d[\d\s\u202f\u00a0]*)\s*(?:expériences vécues|commentaires|avis|reviews)/i.exec(t);
    if (m || n) {
      avis = {
        noteSource: m ? nombre(m[1]) : null,
        echelleSource: m ? echelle(m[2]) : null,
        nombre: n ? Number(n[1].replace(/\D/g, "")) : null,
        extraits: [],
      };
    }
  }

  const conditions = conditionsBooking(html);
  if (!description && !equipements.length && !avis && !conditions) return null;
  return { description, equipements, avis, conditions };
}

/**
 * La fiche que la page déjà chargée donne à cette annonce, ou `undefined`
 * quand elle n'en donne pas. Un hôtel ou une chambre ne s'enrichit pas : seul
 * un logement entier retenu par le relevé passe. Une page refusée (403, 429)
 * marque la fiche indisponible, sans rien en tirer.
 */
export function ficheDepuisPageBooking(
  row: Pick<Listing, "lodgingType" | "url">,
  html: string | null | undefined,
  statut: number | null | undefined,
  maintenant = new Date(),
): FicheEnrichie | undefined {
  if (row.lodgingType === "hotel" || row.lodgingType === "chambre") return undefined;
  const recupereLe = maintenant.toISOString();
  if (statut === 403 || statut === 429) {
    return {
      equipements: [],
      avis: null,
      conditions: null,
      sourceFiche: "booking",
      recupereLe,
      indisponible: true,
    };
  }
  return (
    ficheDepuisBrut(ficheBookingDepuisHtml(html), "booking", { url: row.url, recupereLe }) ??
    undefined
  );
}
