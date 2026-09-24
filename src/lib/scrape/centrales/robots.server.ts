/**
 * Va chercher `robots.txt`, et retient la réponse.
 *
 * Une centrale est interrogée au plus une fois par recherche ; sans cache, on
 * lui demanderait son `robots.txt` autant de fois qu'elle a de stations. Le
 * cache tient une heure : c'est un fichier qui change rarement, et le relire à
 * chaque recherche serait une politesse retournée en nuisance.
 *
 * On lit toujours. On n'arrête jamais. Un Disallow, un fichier illisible, une
 * URL illisible, un 500 : on journalise la règle et l'extraction continue.
 * C'est la même discipline que `src/lib/scrape/robots.ts` pour Airbnb, Booking,
 * Gîtes et Abritel.
 */

import { UA_NAVIGATEUR } from "../navigateur.ts";
import { AGENT_CENTRALES, robotsAutorise, type VerdictRobots } from "./robots.ts";

const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

type Entree = { at: number; texte: string | null };
const cache = new Map<string, Entree>();

/** Pour les tests et la recette : vide le cache. */
export function oublierRobots(): void {
  cache.clear();
}

async function lireRobots(origine: string, entetes?: Record<string, string>): Promise<string | null> {
  const hit = cache.get(origine);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.texte;

  let texte: string | null = null;
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${origine}/robots.txt`, {
      signal: ctrl.signal,
      redirect: "follow",
      // L'en-tête d'un navigateur, comme tout le relevé (`navigateur.ts`) ; les
      // règles se lisent toujours sous `AGENT_CENTRALES`.
      headers: { "user-agent": UA_NAVIGATEUR, accept: "text/plain,*/*", ...entetes },
    });
    // Un 404 est une réponse claire : il n'y a pas de règles. Un 500 ou un
    // refus : on n'a pas lu, et on extrait quand même.
    if (r.status === 200) texte = await r.text();
    else if (r.status === 404 || r.status === 410) texte = "";
    else await r.body?.cancel();
  } catch {
    texte = null;
  } finally {
    clearTimeout(minuteur);
  }
  cache.set(origine, { at: Date.now(), texte });
  return texte;
}

/**
 * Lit `robots.txt` pour cette URL, journalise un Disallow, autorise toujours.
 *
 * Le chemin testé inclut la chaîne de requête : c'est sur elle que portent la
 * plupart des interdictions des centrales, dont celles qui ferment les
 * recherches datées. On les lit pour savoir ; on n'en fait pas un arrêt.
 * Même une URL illisible ne renvoie pas `autorise: false`.
 *
 * `entetes` sert aux passerelles qui exigent des en-têtes de routage avant de
 * répondre quoi que ce soit, `/robots.txt` compris. Celle de Deskline rend 400
 * « Must provide value for header DW-Source » tant qu'on ne les envoie pas.
 * Les en-têtes ne sont jamais un secret ni un jeton.
 */
export async function centraleAutorise(
  url: string,
  entetes?: Record<string, string>,
): Promise<VerdictRobots> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    console.info(`[robots] ${url} URL illisible — lu, ignoré, extraction continue`);
    return { autorise: true, regle: "URL illisible" };
  }
  const texte = await lireRobots(u.origin, entetes);
  const lu = robotsAutorise(texte, u.pathname + u.search, AGENT_CENTRALES);
  if (lu.autorise !== true) {
    console.info(`[robots] ${url} ${lu.regle} — lu, ignoré, extraction continue`);
  }
  return { autorise: true, regle: lu.regle };
}
