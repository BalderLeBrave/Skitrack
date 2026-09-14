/**
 * Connecteur forfaits. **Seule voie de récupération des tarifs.**
 *
 * Ce qu'il ne fait plus :
 *
 * - il ne se fait plus passer pour Chrome 131 sous Windows. L'en-tête
 *   d'identification est honnête (`politesse.ts`) ;
 * - il ne lit plus robots.txt pour l'ignorer : un `Disallow` ferme la voie
 *   automatique et bascule le domaine en saisie assistée ;
 * - il n'enchaîne plus huit chemins candidats après un 403. Un refus est un
 *   refus : la source est marquée non accessible automatiquement, et le lien
 *   officiel est conservé pour la saisie ;
 * - il ne martèle plus un domaine : un appel à la fois, deux secondes entre
 *   deux, et trois échecs consécutifs désactivent la source jusqu'à
 *   réactivation manuelle.
 *
 * Ce qu'il continue de garantir : **un tarif déjà relevé n'est jamais effacé
 * par un échec**. Il reste affiché avec sa date.
 */

import { demander, verdictPoli } from "@/lib/scrape/politesse";
import { domainBySlug, estimateForfait, FORFAIT_CATALOG } from "./catalog";
import { extractForfaits } from "./extract";
import { applyExtracted, DEFAULT_TTL_MS, emptyRow, isStale, markFailure, markStaleIfNeeded } from "./store";
import {
  echec as noterEchec,
  noter,
  refuse as noterRefus,
  reactiver as reactiverSource,
  sourceNeuve,
  succes as noterSucces,
  tentable,
  type EtatSource,
} from "./sources";
import type { ForfaitRow } from "./types";

const CANDIDATE_PATHS = [
  "",
  "/forfaits",
  "/forfaits-ski",
  "/skipass",
  "/tarifs",
  "/tickets",
  "/billetterie",
  "/fr/forfaits",
];

const memory = new Map<string, ForfaitRow>();
const sources = new Map<string, EtatSource>();
let ttlMs = DEFAULT_TTL_MS;

export function forfaitTtlMs(): number {
  return ttlMs;
}

export function setForfaitTtlMs(ms: number): void {
  if (Number.isFinite(ms) && ms >= 30 * 60 * 1000) ttlMs = ms;
}

function seedRow(slug: string): ForfaitRow {
  const domain = domainBySlug(slug);
  if (!domain) return emptyRow(slug, { lastError: "Domaine inconnu." });
  const seed = domain.seed;
  if (seed && (seed.j1 != null || seed.j6 != null)) {
    const fetchedAt = seed.maj ? `${seed.maj}T12:00:00.000Z` : null;
    return markStaleIfNeeded(
      emptyRow(slug, {
        j1: seed.j1,
        j6: seed.j6,
        enf6: seed.enf6,
        kind: seed.j6 != null ? "6 jours" : "journée",
        sourceUrl: domain.website,
        fetchedAt,
        // `lastAttemptAt` dit une tentative réseau. Une graine de catalogue
        // n'en est pas une : la laisser ici faisait passer la date d'édition du
        // catalogue pour une « dernière synchro ».
        lastAttemptAt: null,
        status: "ok",
        parseKind: "referentiel",
      }),
      ttlMs,
    );
  }
  const est = estimateForfait(domain.km, domain.maxM);
  return emptyRow(slug, {
    ...est,
    status: "estimé",
    kind: "6 jours",
    lastError: "Aucun relevé — estimation km + altitude, hors coût officiel.",
  });
}

export function getStored(slug: string): ForfaitRow {
  const hit = memory.get(slug);
  if (hit) return markStaleIfNeeded(hit, ttlMs);
  const row = seedRow(slug);
  memory.set(slug, row);
  return row;
}

export function getSource(slug: string): EtatSource {
  const hit = sources.get(slug);
  if (hit) return hit;
  const neuf = sourceNeuve(slug, domainBySlug(slug)?.website ?? null);
  sources.set(slug, neuf);
  return neuf;
}

/** Réactive une source désactivée par trois échecs, ou fermée par un refus. */
export function reactiverForfait(slug: string): EtatSource {
  const next = reactiverSource(getSource(slug));
  sources.set(slug, next);
  return next;
}

/** Les pages à essayer, **la voie qui a marché en premier**. Elle était
 *  mémorisée dans `sourceUrl` et jamais relue : chaque relevé repartait du
 *  premier chemin de la liste. */
function candidates(website: string, retenue: string | null): string[] {
  const raw = website.trim().startsWith("http") ? website.trim() : `https://${website.trim()}`;
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    return [];
  }
  const seen: string[] = [];
  if (retenue) seen.push(retenue);
  for (const path of CANDIDATE_PATHS) {
    const url = path === "" ? raw : `${origin}${path}`;
    if (!seen.includes(url)) seen.push(url);
  }
  return seen;
}

export type Resultat = {
  row: ForfaitRow;
  source: EtatSource;
  /** Ce qui est arrivé à ce domaine, pour le récapitulatif par station. */
  issue: "maj" | "inchange" | "manuel" | "refus" | "echec" | "desactivee" | "ignore";
};

export async function refreshOne(slug: string, force = false, signal?: AbortSignal): Promise<Resultat> {
  const quand = new Date().toISOString();
  const domain = domainBySlug(slug);
  const row = getStored(slug);
  let source = getSource(slug);

  if (row.locked) {
    return { row: { ...row, lastAttemptAt: quand }, source, issue: "manuel" };
  }
  if (!force && !isStale(row, ttlMs) && row.status === "ok") {
    return { row, source, issue: "inchange" };
  }
  if (!tentable(source)) {
    // Ni reprise en boucle, ni relance silencieuse : la source est fermée ou
    // désactivée, et l'écran le dit.
    return { row, source, issue: source.desactivee ? "desactivee" : "ignore" };
  }
  if (!domain?.website) {
    source = noterEchec(source, "URL source absente.", quand);
    sources.set(slug, source);
    const next = markFailure(row, "URL source absente.", quand);
    memory.set(slug, next);
    return { row: next, source, issue: "echec" };
  }

  let cause = "Aucun tarif lisible.";
  let interdites = 0;
  const essais = candidates(domain.website, source.url);
  for (const url of essais) {
    if (signal?.aborted) throw new DOMException("Relevé interrompu.", "AbortError");
    // robots.txt est lu **et respecté**, pour ce chemin-ci et non pour la
    // racine : il était lu puis jeté.
    const robots = await verdictPoli(url);
    if (robots.autorise === false) {
      interdites += 1;
      source = noter(source, { at: quand, url, issue: "robots", statut: null, message: robots.regle });
      continue;
    }
    try {
      const page = await demander(url, signal);
      if (page.status === 401 || page.status === 403 || page.status === 429) {
        // Un refus ne se contourne pas et ne se réessaie pas sur sept autres
        // chemins du même hôte : la voie automatique se ferme ici.
        source = noter(noterRefus(source, url, `HTTP ${page.status}`, quand), {
          at: quand,
          url,
          issue: "refus",
          statut: page.status,
          message: `HTTP ${page.status}`,
        });
        sources.set(slug, source);
        console.warn(`[forfaits] ${slug} : HTTP ${page.status} — source passée en saisie assistée`);
        return { row, source, issue: "refus" };
      }
      if (!page.ok) {
        // Un 404 dit que cette page n'existe pas, pas que l'hôte refuse : on
        // essaie la suivante.
        cause = `HTTP ${page.status}`;
        source = noter(source, { at: quand, url, issue: "panne", statut: page.status, message: cause });
        continue;
      }
      const extracted = extractForfaits(page.text);
      if (!extracted) {
        cause = "Page lue, aucun tarif reconnu.";
        source = noter(source, { at: quand, url, issue: "illisible", statut: page.status, message: cause });
        continue;
      }
      const applied = applyExtracted(row, extracted, url, quand);
      memory.set(slug, applied.row);
      source = noter(noterSucces(source, url, quand), {
        at: quand,
        url,
        issue: "ok",
        statut: page.status,
        message: `tarif lu (${extracted.kind})`,
      });
      sources.set(slug, source);
      return {
        row: applied.row,
        source,
        issue: applied.outcome === "updated" ? "maj" : applied.outcome === "skipped_manual" ? "manuel" : "inchange",
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      cause = err instanceof Error ? err.message : String(err);
      source = noter(source, { at: quand, url, issue: "panne", statut: null, message: cause });
    }
  }
  // Toutes les voies interdites par robots.txt : la source est fermée, pas en
  // panne. Elle bascule en saisie assistée et cesse d'être réessayée.
  if (interdites === essais.length && essais.length) {
    source = noterRefus(source, domain.website, "robots.txt interdit toutes les pages tarifs", quand);
    sources.set(slug, source);
    console.warn(`[forfaits] ${slug} : robots.txt interdit le relevé automatique`);
    return { row, source, issue: "refus" };
  }
  source = noterEchec(source, cause, quand);
  sources.set(slug, source);
  console.warn(`[forfaits] ${slug} : ${cause} (${source.echecs} échec(s) consécutif(s))`);
  // `markFailure` garde le tarif précédent : un échec n'efface rien.
  const failed = markFailure(row, cause, quand);
  memory.set(slug, failed);
  return { row: failed, source, issue: "echec" };
}

export async function refreshMany(
  slugs: string[],
  force = false,
  signal?: AbortSignal,
): Promise<Resultat[]> {
  const out: Resultat[] = [];
  for (const slug of slugs) {
    if (signal?.aborted) break;
    try {
      out.push(await refreshOne(slug, force, signal));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") break;
      throw err;
    }
  }
  return out;
}

export function listStored(): ForfaitRow[] {
  return FORFAIT_CATALOG.filter((d) => d.country === "FR").map((d) => getStored(d.slug));
}

export function listSources(): EtatSource[] {
  return FORFAIT_CATALOG.filter((d) => d.country === "FR").map((d) => getSource(d.slug));
}

/** La dernière **tentative réseau**. Les graines du catalogue n'en sont pas. */
export function lastSyncAt(): string | null {
  let latest: string | null = null;
  for (const e of sources.values()) {
    if (e.tenteA && (!latest || e.tenteA > latest)) latest = e.tenteA;
  }
  return latest;
}

export { FORFAIT_CATALOG };
