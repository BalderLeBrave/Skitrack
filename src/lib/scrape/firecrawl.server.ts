/**
 * Firecrawl, en trois usages : lire une page (`/v2/scrape`, avec extraction
 * JSON selon un schéma), dresser la carte d'un site (`/v2/map`, sitemap
 * compris) et le parcourir (`/v2/crawl`).
 *
 * Firecrawl va chercher la page lui-même ; la politesse reste la nôtre :
 * - chaque URL passe par `verdictPoli` avant d'être envoyée : une règle
 *   `Disallow` l'écarte, sans appel ;
 * - les lectures d'un même site attendent leur tour dans la file de l'hôte
 *   visé (`dansLaFile`), au `Crawl-delay` publié s'il est plus long ;
 * - un 401, 403 ou 429 rendu par le site ferme l'hôte pour la suite du
 *   relevé : on ne réessaie pas, on ne demande pas de proxy « renforcé ».
 * - un parcours est lancé avec `maxConcurrency: 1` et le délai de robots.txt,
 *   et ses pages interdites sont écartées à l'arrivée.
 *
 * Clé : `FIRECRAWL_API_KEY` (registre des clés, écran Réglages).
 */

import { valeurCle } from "../cles/store.server.ts";
import { dansLaFile, verdictPoli } from "./politesse.ts";

const API = "https://api.firecrawl.dev/v2";

export class FirecrawlIndisponible extends Error {}

export function cleFirecrawl(): string | null {
  return valeurCle("firecrawl");
}

async function appeler<T>(chemin: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const cle = cleFirecrawl();
  if (!cle) throw new FirecrawlIndisponible("FIRECRAWL_API_KEY absente");
  const res = await fetch(`${API}${chemin}`, {
    ...init,
    headers: { authorization: `Bearer ${cle}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal,
  });
  const texte = await res.text();
  let corps: unknown = null;
  try {
    corps = JSON.parse(texte);
  } catch {
    /* réponse non JSON : rapportée telle quelle */
  }
  if (res.status === 401 || res.status === 403) throw new FirecrawlIndisponible(`clé refusée (${res.status})`);
  if (res.status === 402) throw new FirecrawlIndisponible("crédits Firecrawl épuisés (402)");
  if (!res.ok) {
    const msg = (corps as { error?: string } | null)?.error ?? texte.slice(0, 200);
    throw new Error(`Firecrawl ${chemin} : HTTP ${res.status} ${msg}`);
  }
  return corps as T;
}

/* ---------- Lecture d'une page ---------- */

export type PageFirecrawl = {
  url: string;
  statut: number | null;
  json: Record<string, unknown> | null;
  markdown: string | null;
  html: string | null;
};

export type ResultatLecture =
  | { ok: true; page: PageFirecrawl }
  | { ok: false; raison: "robots" | "refus" | "erreur"; detail: string };

type DonneesScrape = {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  json?: Record<string, unknown>;
  metadata?: { statusCode?: number; sourceURL?: string; url?: string; error?: string };
};

const hotesFermes = new Map<string, number>();

function hote(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Pour les tests et entre deux relevés. */
export function rouvrirHotesFirecrawl(): void {
  hotesFermes.clear();
}

export type OptionsLecture = {
  schema?: object;
  prompt?: string;
  markdown?: boolean;
  html?: boolean;
  /** Attente après chargement, pour les pages qui remplissent leur fiche en JavaScript. */
  attenteMs?: number;
  signal?: AbortSignal;
};

function formats(o: OptionsLecture): unknown[] {
  const f: unknown[] = [];
  if (o.schema || o.prompt) f.push({ type: "json", ...(o.schema ? { schema: o.schema } : {}), ...(o.prompt ? { prompt: o.prompt } : {}) });
  if (o.markdown) f.push("markdown");
  if (o.html) f.push("html");
  if (f.length === 0) f.push("markdown");
  return f;
}

function versPage(url: string, d: DonneesScrape | undefined): PageFirecrawl {
  return {
    url: d?.metadata?.sourceURL ?? d?.metadata?.url ?? url,
    statut: d?.metadata?.statusCode ?? null,
    json: d?.json ?? null,
    markdown: d?.markdown ?? null,
    html: d?.html ?? d?.rawHtml ?? null,
  };
}

export async function lireAvecFirecrawl(url: string, o: OptionsLecture = {}): Promise<ResultatLecture> {
  const h = hote(url);
  const ferme = hotesFermes.get(h);
  if (ferme) return { ok: false, raison: "refus", detail: `hôte fermé après un ${ferme}` };
  const v = await verdictPoli(url);
  if (!v.autorise) return { ok: false, raison: "robots", detail: v.regle ?? "Disallow" };
  try {
    const r = await dansLaFile(
      url,
      (signal) =>
        appeler<{ success: boolean; data?: DonneesScrape }>(
          "/scrape",
          {
            method: "POST",
            body: JSON.stringify({
              url,
              formats: formats(o),
              onlyMainContent: false,
              ...(o.attenteMs ? { waitFor: o.attenteMs } : {}),
              timeout: 60_000,
              blockAds: true,
            }),
          },
          signal,
        ),
      { signal: o.signal, delaiMs: v.delaiMs, timeoutMs: 90_000 },
    );
    const page = versPage(url, r.data);
    if (page.statut === 401 || page.statut === 403 || page.statut === 429) {
      hotesFermes.set(h, page.statut);
      return { ok: false, raison: "refus", detail: `le site a répondu ${page.statut}` };
    }
    if (page.statut != null && page.statut >= 400) return { ok: false, raison: "erreur", detail: `HTTP ${page.statut}` };
    return { ok: true, page };
  } catch (e) {
    if (e instanceof FirecrawlIndisponible) throw e;
    return { ok: false, raison: "erreur", detail: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------- Carte d'un site ---------- */

export type Lien = { url: string; titre: string | null };

/**
 * Les URL d'un site selon Firecrawl : sitemap et liens de pages réunis.
 * `recherche` les classe par pertinence (« hébergement », « forfait »).
 * Chaque URL rendue est jugée par robots.txt avant d'être gardée.
 */
export async function carteFirecrawl(
  url: string,
  o: { recherche?: string; limite?: number; signal?: AbortSignal } = {},
): Promise<{ liens: Lien[]; interdits: number }> {
  const v = await verdictPoli(url);
  if (!v.autorise) return { liens: [], interdits: 1 };
  const r = await appeler<{ success: boolean; links?: Array<{ url: string; title?: string }> }>(
    "/map",
    {
      method: "POST",
      body: JSON.stringify({
        url,
        ...(o.recherche ? { search: o.recherche } : {}),
        sitemap: "include",
        includeSubdomains: false,
        ignoreQueryParameters: true,
        limit: o.limite ?? 5_000,
      }),
    },
    o.signal,
  );
  const liens: Lien[] = [];
  let interdits = 0;
  for (const l of r.links ?? []) {
    if (!l?.url) continue;
    const vv = await verdictPoli(l.url);
    if (vv.autorise) liens.push({ url: l.url, titre: l.title ?? null });
    else interdits += 1;
  }
  return { liens, interdits };
}

/* ---------- Parcours ---------- */

export type OptionsParcours = OptionsLecture & {
  /** Expressions régulières de chemins à suivre (`^/fr/fiche/hebergement`). */
  chemins?: string[];
  exclure?: string[];
  limite?: number;
  /** Intervalle entre deux sondages de l'état du parcours. */
  sondageMs?: number;
  /** Abandon du parcours au-delà de cette durée. */
  maxMs?: number;
};

type EtatParcours = {
  status: "scraping" | "completed" | "failed" | "cancelled";
  total?: number;
  completed?: number;
  next?: string | null;
  data?: DonneesScrape[];
};

/**
 * Parcourt un site, une page à la fois, au délai de robots.txt (au moins
 * `INTERVALLE_MS`). Les pages interdites par robots.txt, ou rendues en 401,
 * 403 ou 429, sont écartées des résultats.
 */
export async function parcourirAvecFirecrawl(
  url: string,
  o: OptionsParcours = {},
): Promise<{ pages: PageFirecrawl[]; interdits: number; refus: number; etat: EtatParcours["status"] }> {
  const v = await verdictPoli(url);
  if (!v.autorise) return { pages: [], interdits: 1, refus: 0, etat: "cancelled" };
  const delaiS = Math.max(2, Math.ceil(v.delaiMs / 1000));
  const lance = await appeler<{ success: boolean; id: string }>(
    "/crawl",
    {
      method: "POST",
      body: JSON.stringify({
        url,
        limit: o.limite ?? 500,
        ...(o.chemins?.length ? { includePaths: o.chemins } : {}),
        ...(o.exclure?.length ? { excludePaths: o.exclure } : {}),
        sitemap: "include",
        crawlEntireDomain: false,
        allowExternalLinks: false,
        allowSubdomains: false,
        ignoreQueryParameters: true,
        delay: delaiS,
        maxConcurrency: 1,
        scrapeOptions: {
          formats: formats(o),
          onlyMainContent: false,
          ...(o.attenteMs ? { waitFor: o.attenteMs } : {}),
          blockAds: true,
        },
      }),
    },
    o.signal,
  );
  const debut = Date.now();
  const sondage = o.sondageMs ?? 10_000;
  const maxMs = o.maxMs ?? 60 * 60 * 1000;
  let etat: EtatParcours = { status: "scraping" };
  while (etat.status === "scraping") {
    if (o.signal?.aborted || Date.now() - debut > maxMs) {
      await appeler(`/crawl/${lance.id}`, { method: "DELETE" }).catch(() => undefined);
      etat = { status: "cancelled" };
      break;
    }
    await new Promise((r) => setTimeout(r, sondage));
    etat = await appeler<EtatParcours>(`/crawl/${lance.id}`, { method: "GET" }, o.signal);
  }
  // Les résultats arrivent par pages de 10 Mo : `next` mène à la suivante.
  const donnees: DonneesScrape[] = [...(etat.data ?? [])];
  let suite = etat.next ?? null;
  while (suite) {
    const chemin = suite.startsWith(API) ? suite.slice(API.length) : new URL(suite).pathname.replace(/^\/v2/, "") + new URL(suite).search;
    const p = await appeler<EtatParcours>(chemin, { method: "GET" }, o.signal);
    donnees.push(...(p.data ?? []));
    suite = p.next ?? null;
  }
  const pages: PageFirecrawl[] = [];
  let interdits = 0;
  let refus = 0;
  for (const d of donnees) {
    const page = versPage(url, d);
    if (page.statut === 401 || page.statut === 403 || page.statut === 429) {
      refus += 1;
      continue;
    }
    const vv = await verdictPoli(page.url);
    if (!vv.autorise) {
      interdits += 1;
      continue;
    }
    pages.push(page);
  }
  return { pages, interdits, refus, etat: etat.status };
}
