/**
 * La fiche d'un établissement Booking, lue dans le HTML de sa page **déjà
 * chargée** pour le GPS (`bookingGps.server.ts`, `booking.server.ts`) : aucune
 * requête de plus. Module pur, testé sur une page réduite.
 *
 * Ce qu'elle lit, et seulement là où la page le publie :
 *
 * - le JSON-LD de la page : `description`, `aggregateRating` (`ratingValue`,
 *   `reviewCount`, et l'échelle par `bestRating` — sans `bestRating`, pas
 *   d'échelle, donc pas de note), `amenityFeature`, `review` ;
 * - la description (`data-testid="property-description"`) ;
 * - les équipements les plus demandés (`data-testid="property-most-popular-facilities-wrapper"`),
 *   puis ceux de chaque groupe (`data-testid="facility-group-container"`, ou
 *   l'ancien `class="hotel-facilities-group"`), avec l'intitulé du groupe ;
 * - la note affichée (`data-testid="review-score-component"`), seulement
 *   quand son échelle y est écrite (« 9,2 sur 10 », « 9.2 out of 10 ») ;
 * - cinq extraits d'avis au plus, ceux que la page porte déjà : `review` du
 *   JSON-LD, cartes `data-testid="review-card"` (titre, « + » aimé, « − » moins
 *   aimé), avis mis en avant (`data-testid="featuredreview"`). Les avis que
 *   Booking ne charge qu'au clic ne sont pas demandés ;
 * - les conditions (`id="hotelPoliciesInc"` ou `data-testid="HouseRules-wrapper"`),
 *   rangées par leurs intitulés (Arrivée, Départ, Annulation, Caution,
 *   Animaux domestiques, Fêtes, Fumeurs, Moyens de paiement ; Enfants et lits,
 *   Restrictions d'âge, Horaires de silence, Groupes forment le règlement),
 *   dans le texte de la page. « Fumeurs » absent des conditions se lit sur un
 *   équipement qui le dit de tout l'établissement (« Établissement
 *   non-fumeur ») ; « Logements non-fumeurs » ne suffit pas.
 *
 * La note brute et son échelle passent par `ficheDepuisBrut` (`noterSur5`) :
 * rien n'est converti ici. Le prix n'est pas lu : il reste celui du relevé.
 */

import type { Listing } from "../listings.ts";
import { ficheDepuisBrut, type FicheBrute, type FicheEnrichie } from "../stay/ficheEnrichie.ts";

const TEXTE_MAX = 6000;
const EXTRAIT_MAX = 1200;
const EXTRAITS_MAX = 5;

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
 * Le contenu de chaque élément qui porte cet attribut **dans une balise
 * ouvrante**, balises équilibrées, dans l'ordre de la page. Le même texte dans
 * un commentaire ou un script ne compte pas ; un élément pris dans un autre
 * déjà rendu ne revient pas.
 */
export function* blocsAvec(html: string, attribut: RegExp): Generator<string> {
  const cherche = new RegExp(
    attribut.source,
    attribut.flags.includes("g") ? attribut.flags : `${attribut.flags}g`,
  );
  let fin = 0;
  for (const m of html.matchAll(cherche)) {
    if (m.index < fin) continue;
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
      if (profondeur === 0) {
        fin = t.index + t[0].length;
        yield html.slice(debut, fin);
        break;
      }
    }
  }
}

/** Le premier de ces éléments (`blocsAvec`), ou `null`. */
export function blocAvec(html: string, attribut: RegExp): string | null {
  for (const b of blocsAvec(html, attribut)) return b;
  return null;
}

/** Le texte du premier élément de `html` qui porte ce `data-testid`, ou `null`. */
function texteTestid(html: string, testid: string): string | null {
  const b = blocAvec(html, new RegExp(`\\bdata-testid=["']${testid}["']`, "i"));
  return b ? texteDeHtml(b) || null : null;
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
  { k: "animaux", re: /^(animaux( domestiques| de compagnie)?|pets)$/i },
  { k: "fetes", re: /^(f[êe]tes|parties)$/i },
  { k: "fumeurs", re: /^(fumeurs|smoking)$/i },
  {
    k: "paiement",
    re: /^(moyens de paiement accept[ée]s|paiement|cartes accept[ée]es dans cet [ée]tablissement|accepted payment methods|payment|cards accepted at this property)$/i,
  },
  // Les autres intitulés publiés : ils forment le règlement, et leur texte ne
  // se mêle plus à celui de l'intitulé d'avant.
  {
    k: "reglement",
    re: /^(enfants et lits|politique relative aux enfants|restrictions? d['’][âa]ge|horaires? de silence|heures de silence|groupes|children (and|&) beds|child policies|age restrictions?|quiet hours|groups)$/i,
  },
];

const NON_RE =
  /(\bne\s+sont\s+pas\b|\bn['’](?:est|sont)\s+pas\b|\bpas\s+(?:admis|autoris|accept|permis)|\bnon[\s-](?:admis|autoris|accept|fumeur)|\binterdit|\bnot\s+(?:allowed|permitted|accepted)\b|\b(?:aren|isn)['’]t\s+(?:allowed|permitted|accepted)\b|\bno\s+(?:pets|smoking|parties|events)\b|\bsmoke-free\b)/i;
const OUI_RE = /\b(admis|accept\w*|autoris\w*|allowed|permitted|bienvenus?|welcome)\b/i;

/**
 * Oui, non ou sur demande, quand la phrase le dit. Un « no » ou un « pas »
 * qui ne porte pas sur l'admission (« No extra charges », « pas de frais »)
 * ne fait pas un non.
 */
export function ouiNon(t: string, demande = false): "oui" | "non" | "sur_demande" | null {
  if (demande && /\b(sur demande|on request|upon request)\b/i.test(t)) return "sur_demande";
  if (NON_RE.test(t)) return "non";
  if (OUI_RE.test(t)) return "oui";
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
      // Le règlement garde ses intitulés : il en rassemble plusieurs.
      if (courant === "reglement") brut[courant].push(`${brut[courant].length ? "\n" : ""}${l} :`);
      continue;
    }
    if (courant) brut[courant].push(l);
  }
  const out: Record<string, string> = {};
  for (const [k, xs] of Object.entries(brut)) {
    if (k === "reglement" && !xs.some((x) => !x.endsWith(" :"))) continue;
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

/**
 * Un équipement qui dit l'établissement entier non-fumeur. « Logements
 * non-fumeurs » (« Non-smoking rooms ») ne dit que certains logements : il ne
 * compte pas.
 */
const ETABLISSEMENT_NON_FUMEUR =
  /^((l['’])?([ée]tablissement|h[ée]bergement) (enti[èe]rement )?non[- ]fumeurs?|smoke-free property|non-smoking throughout)$/i;

/** La fiche brute d'une page établissement, ou `null` quand elle ne publie rien. */
export function ficheBookingDepuisHtml(html: string | null | undefined): FicheBrute | null {
  if (!html) return null;
  const ld = jsonLd(html);
  let description: string | null = null;
  const desc = blocAvec(html, /\bdata-testid=["']property-description["']/i);
  if (desc) description = texteDeHtml(desc).slice(0, TEXTE_MAX) || null;

  const equipements: { libelle: string; present: boolean; groupe?: string }[] = [];
  const index = new Map<string, number>();
  const ajouter = (libelle: string | null, present = true, groupe?: string | null) => {
    if (!libelle) return;
    const cle = libelle.toLowerCase();
    const deja = index.get(cle);
    if (deja != null) {
      // Déjà parmi les plus demandés : il prend l'intitulé de son groupe.
      if (groupe && !equipements[deja].groupe) equipements[deja].groupe = groupe;
      return;
    }
    index.set(cle, equipements.length);
    equipements.push({ libelle, present, ...(groupe ? { groupe } : {}) });
  };
  const premiereLigne = (h: string) => texteDeHtml(h).split("\n")[0] || null;
  const populaires = blocAvec(
    html,
    /\bdata-testid=["']property-most-popular-facilities-wrapper["']/i,
  );
  if (populaires) {
    for (const li of populaires.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
      ajouter(premiereLigne(li[1]));
  }
  for (const g of groupesEquipements(html)) for (const l of g.libelles) ajouter(l, true, g.titre);

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

  const extraits = extraitsBooking(html, ld, avis ? (avis.echelleSource as number | null) : null);
  if (extraits.length) {
    avis ??= { noteSource: null, echelleSource: null, nombre: null, extraits: [] };
    avis.extraits = extraits;
  }

  let conditions = conditionsBooking(html);
  if (!conditions?.fumeurs && equipements.some((e) => ETABLISSEMENT_NON_FUMEUR.test(e.libelle)))
    conditions = { ...conditions, fumeurs: "non" };
  if (!description && !equipements.length && !avis && !conditions) return null;
  return { description, equipements, avis, conditions };
}

/**
 * Les groupes d'équipements de la page : leur intitulé (le premier titre du
 * groupe) et le libellé de chaque élément de liste (sa première ligne : la
 * suite précise, « Gratuit », « Payant », n'est pas un équipement).
 */
export function groupesEquipements(html: string): { titre: string | null; libelles: string[] }[] {
  const out: { titre: string | null; libelles: string[] }[] = [];
  for (const re of [
    /\bdata-testid=["']facility-group-container["']/i,
    /\bclass=["'](?:[^"']*\s)?hotel-facilities-group(?:\s[^"']*)?["']/i,
  ]) {
    for (const g of blocsAvec(html, re)) {
      const h =
        /<h[2-5]\b[^>]*>([\s\S]*?)<\/h[2-5]>/i.exec(g)?.[1] ??
        blocAvec(g, /\bclass=["'][^"']*hotel-facilities-group__title-text/i);
      const titre = h ? texteDeHtml(h).split("\n")[0] || null : null;
      const libelles: string[] = [];
      for (const li of g.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
        const l = texteDeHtml(li[1]).split("\n")[0];
        if (l && l !== titre) libelles.push(l);
      }
      if (libelles.length) out.push({ titre, libelles });
    }
    if (out.length) break;
  }
  return out;
}

type ExtraitBrut = { auteur?: string; date?: string; noteSource?: number; texte: string };

function sansGuillemets(t: string): string {
  return t.replace(/^[«“"„\s]+|[»”"\s]+$/g, "").trim();
}

/** La première ligne d'un avatar d'avis : le prénom affiché, sans le pays. */
function auteurDe(t: string | null): string | undefined {
  return t?.split("\n")[0]?.trim() || undefined;
}

/**
 * Les extraits d'avis que la page porte déjà, cinq au plus, sans doublon :
 * `review` du JSON-LD, cartes d'avis, avis mis en avant. Une note d'extrait
 * n'est gardée que sur l'échelle de la note globale (`echelleGlobale`) ;
 * sans elle, l'extrait reste sans note.
 */
export function extraitsBooking(
  html: string,
  ld: JsonLd[] = jsonLd(html),
  echelleGlobale: number | null = null,
): ExtraitBrut[] {
  const out: ExtraitBrut[] = [];
  const vus = new Set<string>();
  const garder = (x: ExtraitBrut | null) => {
    if (!x || out.length >= EXTRAITS_MAX) return;
    const texte = x.texte.slice(0, EXTRAIT_MAX).trim();
    const cle = texte.toLowerCase().replace(/\s+/g, " ");
    if (!texte || vus.has(cle)) return;
    vus.add(cle);
    const note =
      x.noteSource != null &&
      echelleGlobale != null &&
      x.noteSource > 0 &&
      x.noteSource <= echelleGlobale
        ? x.noteSource
        : undefined;
    out.push({
      ...(x.auteur ? { auteur: x.auteur } : {}),
      ...(x.date ? { date: x.date } : {}),
      ...(note != null ? { noteSource: note } : {}),
      texte,
    });
  };

  // 1. Le JSON-LD : `review`, un avis ou une liste.
  for (const o of ld) {
    for (const r of Array.isArray(o.review) ? o.review : o.review ? [o.review] : []) {
      if (!r || typeof r !== "object") continue;
      const x = r as Record<string, unknown>;
      const texte = chaine(x.reviewBody) ?? chaine(x.description);
      if (!texte) continue;
      const a = x.author;
      const auteur =
        chaine(a) ??
        (a && typeof a === "object" ? chaine((a as Record<string, unknown>).name) : null);
      const rr =
        x.reviewRating && typeof x.reviewRating === "object"
          ? (x.reviewRating as Record<string, unknown>)
          : null;
      // Une note d'extrait sur une autre échelle que la note globale ne se garde pas.
      const best = rr ? echelle(rr.bestRating) : null;
      const n = rr && (best == null || best === echelleGlobale) ? nombre(rr.ratingValue) : null;
      garder({
        auteur: auteurDe(auteur),
        date: chaine(x.datePublished)?.replace(/^(\d{4}-\d{2}-\d{2})T.*$/, "$1") ?? undefined,
        noteSource: n ?? undefined,
        texte: texteDeHtml(texte),
      });
    }
  }

  // 2. Les cartes d'avis : titre, ce qui a plu (« + »), ce qui a moins plu (« − »).
  for (const c of blocsAvec(html, /\bdata-testid=["']review-card["']/i)) {
    const titre = texteTestid(c, "review-title");
    const plus = texteTestid(c, "review-positive-text");
    const moins = texteTestid(c, "review-negative-text");
    const corps = plus || moins ? null : texteTestid(c, "review-text");
    const texte = [
      titre ? sansGuillemets(titre) : null,
      plus ? `+ ${plus}` : null,
      moins ? `− ${moins}` : null,
      corps,
    ]
      .filter(Boolean)
      .join("\n");
    if (!plus && !moins && !corps) continue;
    const score = texteTestid(c, "review-score");
    const n = score ? /(\d+(?:[.,]\d+)?)/.exec(score) : null;
    const date = texteTestid(c, "review-date")
      ?.replace(/^(commentaire (envoy|publi)é le|avis (envoy|publi)é le|reviewed)\s*:?\s*/i, "")
      .trim();
    garder({
      auteur: auteurDe(texteTestid(c, "review-avatar")),
      date: date || undefined,
      noteSource: n ? (nombre(n[1]) ?? undefined) : undefined,
      texte,
    });
  }

  // 3. Les avis mis en avant (« Les clients ont adoré ») : prénom et texte seuls.
  for (const f of blocsAvec(html, /\bdata-testid=["']featuredreview["']/i)) {
    const texte = texteTestid(f, "featuredreview-text");
    if (!texte) continue;
    garder({
      auteur: auteurDe(texteTestid(f, "featuredreview-avatar")),
      texte: sansGuillemets(texte),
    });
  }
  return out;
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
