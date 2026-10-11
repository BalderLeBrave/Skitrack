/**
 * Extraction complète d'une centrale sans connecteur : découverte des fiches
 * (sitemap, puis carte Firecrawl, puis parcours Firecrawl), lecture de chaque
 * fiche (Firecrawl si la clé est posée, lecture directe sinon).
 *
 * Les cibles sont les hôtes de `moteurs.data.json` qui n'ont pas de
 * connecteur dans `hotes/index.ts` et ne passent pas par le connecteur commun
 * Ingénie : relevé du 11 octobre 2026, neuf hôtes (sept offices sans moteur,
 * Sancy sur Diffusio, Gavarnie sur Tourinsoft), plus Praz-sur-Arly
 * (Orchestra), dont robots.txt interdit tout (`Disallow: /`) et qui reste
 * donc vide.
 */

import moteurs from "./centrales/moteurs.data.json" with { type: "json" };
import { connecteurPour } from "./centrales/hotes/index.ts";
import { demander, texteRobots, verdictPoli } from "./politesse.ts";
import { decouvrirParSitemap, type Decouverte } from "./sitemap.server.ts";
import { dedoublonner, interditToutSansGroupe, urlDuProfil } from "./sitemap.ts";
import {
  ficheDepuisHtml,
  ficheParlante,
  normaliserFiche,
  retirerPositionsDuSite,
  PROMPT_LOGEMENT,
  SCHEMA_LOGEMENT,
  type FicheCatalogue,
} from "./catalogue.ts";
import {
  carteFirecrawl,
  cleFirecrawl,
  FirecrawlIndisponible,
  lireAvecFirecrawl,
  parcourirAvecFirecrawl,
} from "./firecrawl.server.ts";

export type CibleCatalogue = { host: string; nom: string; moteur: string; stations: string[] };

type EntreeMoteur = { nom?: string; moteur?: string; stations?: string[] };

/** Moteurs servis par un connecteur commun, sans fichier d'hôte. */
const MOTEURS_COMMUNS = new Set(["Ingénie"]);

export function ciblesSansConnecteur(): CibleCatalogue[] {
  const hotes = (moteurs as { hotes: Record<string, EntreeMoteur> }).hotes;
  return Object.entries(hotes)
    .filter(([host, e]) => !connecteurPour(host) && !MOTEURS_COMMUNS.has(e.moteur ?? ""))
    .map(([host, e]) => ({ host, nom: e.nom ?? host, moteur: e.moteur ?? "inconnu", stations: e.stations ?? [] }))
    .sort((a, b) => a.host.localeCompare(b.host));
}

export type Lecteur = "auto" | "firecrawl" | "lecture";
export type Decouvreur = "sitemap" | "carte" | "parcours";

export type OptionsCatalogue = {
  lecteur?: Lecteur;
  /** Méthodes de découverte essayées dans l'ordre, jusqu'à la première qui trouve. */
  decouverte?: Decouvreur[];
  maxFiches?: number;
  signal?: AbortSignal;
  /** Appelé après chaque fiche, pour un journal de progression. */
  surFiche?: (n: number, total: number, url: string) => void;
};

export type ResultatCatalogue = {
  cible: CibleCatalogue;
  releveLe: string;
  methode: Decouvreur | null;
  lecteur: "firecrawl" | "lecture";
  sitemap: Pick<Decouverte, "sitemaps" | "vues" | "interditsRobots" | "racineInterdite" | "refus"> | null;
  urls: number;
  fiches: FicheCatalogue[];
  muettes: number;
  interditsRobots: number;
  refus: number;
  erreurs: string[];
};

export async function extraireCatalogue(cible: CibleCatalogue, o: OptionsCatalogue = {}): Promise<ResultatCatalogue> {
  const r = await extraireBrut(cible, o);
  const retirees = retirerPositionsDuSite(r.fiches);
  if (retirees) r.erreurs.push(`${retirees} position(s) commune(s) à tout le site retirée(s)`);
  return r;
}

async function extraireBrut(cible: CibleCatalogue, o: OptionsCatalogue): Promise<ResultatCatalogue> {
  const origine = `https://${cible.host}`;
  const avecCle = cleFirecrawl() != null;
  const lecteur: "firecrawl" | "lecture" =
    o.lecteur === "lecture" ? "lecture" : o.lecteur === "firecrawl" || avecCle ? "firecrawl" : "lecture";
  if (lecteur === "firecrawl" && !avecCle) throw new FirecrawlIndisponible("FIRECRAWL_API_KEY absente");
  const ordre = o.decouverte ?? (lecteur === "firecrawl" ? ["sitemap", "carte", "parcours"] : ["sitemap"]);
  const max = o.maxFiches ?? 5_000;
  const r: ResultatCatalogue = {
    cible,
    releveLe: new Date().toISOString(),
    methode: null,
    lecteur,
    sitemap: null,
    urls: 0,
    fiches: [],
    muettes: 0,
    interditsRobots: 0,
    refus: 0,
    erreurs: [],
  };

  const racine = await verdictPoli(`${origine}/`);
  if (!racine.autorise || interditToutSansGroupe(await texteRobots(origine))) {
    r.erreurs.push(`robots.txt interdit la racine (${racine.regle ?? "Disallow"}) : rien n'est lu`);
    r.interditsRobots = 1;
    return r;
  }

  let urls: string[] = [];
  for (const m of ordre) {
    if (o.signal?.aborted) break;
    if (m === "sitemap") {
      const d = await decouvrirParSitemap(origine, "hebergement", { maxUrls: max, signal: o.signal });
      r.sitemap = {
        sitemaps: d.sitemaps,
        vues: d.vues,
        interditsRobots: d.interditsRobots,
        racineInterdite: d.racineInterdite,
        refus: d.refus,
      };
      r.erreurs.push(...d.erreurs);
      r.interditsRobots += d.interditsRobots;
      if (d.refus) {
        r.refus += 1;
        break; // le serveur a refusé : on ne tente pas d'autre voie
      }
      urls = d.urls;
    } else if (m === "carte" && lecteur === "firecrawl") {
      const c = await carteFirecrawl(origine, { recherche: "hébergement location", signal: o.signal });
      r.interditsRobots += c.interdits;
      urls = c.liens.map((l) => l.url).filter((u) => urlDuProfil(u, "hebergement"));
    } else if (m === "parcours" && lecteur === "firecrawl") {
      const p = await parcourirAvecFirecrawl(origine, {
        schema: SCHEMA_LOGEMENT,
        prompt: PROMPT_LOGEMENT,
        chemins: ["heberg", "locati", "loueur", "gite", "chalet", "appartement", "residence", "logement"].map((x) => `.*${x}.*`),
        limite: max,
        signal: o.signal,
      });
      r.interditsRobots += p.interdits;
      r.refus += p.refus;
      for (const page of p.pages) {
        if (!urlDuProfil(page.url, "hebergement") || !page.json) continue;
        const f = normaliserFiche(page.json, page.url, "firecrawl", r.releveLe);
        if (ficheParlante(f)) r.fiches.push(f);
        else r.muettes += 1;
      }
      if (r.fiches.length) {
        r.methode = "parcours";
        r.urls = p.pages.length;
        return r;
      }
      continue;
    }
    if (urls.length) {
      r.methode = m;
      break;
    }
  }

  urls = dedoublonner(urls).slice(0, max);
  r.urls = urls.length;
  let n = 0;
  for (const url of urls) {
    if (o.signal?.aborted) break;
    n += 1;
    try {
      if (lecteur === "firecrawl") {
        const l = await lireAvecFirecrawl(url, { schema: SCHEMA_LOGEMENT, prompt: PROMPT_LOGEMENT, signal: o.signal });
        if (!l.ok) {
          if (l.raison === "robots") r.interditsRobots += 1;
          else if (l.raison === "refus") {
            r.refus += 1;
            r.erreurs.push(`${url} : ${l.detail}, extraction de l'hôte arrêtée`);
            break;
          } else r.erreurs.push(`${url} : ${l.detail}`);
          continue;
        }
        const f = normaliserFiche(l.page.json ?? {}, url, "firecrawl", r.releveLe);
        if (ficheParlante(f)) r.fiches.push(f);
        else r.muettes += 1;
      } else {
        const v = await verdictPoli(url);
        if (!v.autorise) {
          r.interditsRobots += 1;
          continue;
        }
        const p = await demander(url, o.signal, v.delaiMs);
        if (p.status === 401 || p.status === 403 || p.status === 429) {
          r.refus += 1;
          r.erreurs.push(`${url} : refus ${p.status}, extraction de l'hôte arrêtée`);
          break;
        }
        if (!p.ok) {
          r.erreurs.push(`${url} : HTTP ${p.status}`);
          continue;
        }
        const f = ficheDepuisHtml(p.text, url, r.releveLe);
        if (ficheParlante(f)) r.fiches.push(f);
        else r.muettes += 1;
      }
    } catch (e) {
      if (e instanceof FirecrawlIndisponible) throw e;
      r.erreurs.push(`${url} : ${e instanceof Error ? e.message : String(e)}`);
    }
    o.surFiche?.(n, urls.length, url);
  }
  return r;
}
