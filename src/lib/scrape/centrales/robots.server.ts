/**
 * Va chercher `robots.txt`, et retient la réponse.
 *
 * Une centrale est interrogée au plus une fois par recherche ; sans cache, on
 * lui demanderait son `robots.txt` autant de fois qu'elle a de stations. Le
 * cache tient une heure : c'est un fichier qui change rarement, et le relire à
 * chaque recherche serait une politesse retournée en nuisance.
 *
 * Un `robots.txt` illisible — absent, en erreur, injoignable — ne vaut pas
 * autorisation. L'appelant reçoit `null` et décide ; ici, la décision par
 * défaut des centrales est de s'abstenir et de le dire.
 */

import { AGENT_CENTRALES, robotsAutorise, type VerdictRobots } from "./robots.ts";

const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

type Entree = { at: number; texte: string | null };
const cache = new Map<string, Entree>();

/** Pour les tests et la recette : vide le cache. */
export function oublierRobots(): void {
  cache.clear();
}

async function lireRobots(origine: string): Promise<string | null> {
  const hit = cache.get(origine);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.texte;

  let texte: string | null = null;
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${origine}/robots.txt`, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": AGENT_CENTRALES, accept: "text/plain,*/*" },
    });
    // Un 404 est une réponse claire : il n'y a pas de règles, donc tout est
    // permis. Un 500 ou un refus, non : on ne sait pas, et on ne suppose pas.
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
 * Cette URL est-elle autorisée pour nous ?
 *
 * Le chemin testé inclut la chaîne de requête : c'est sur elle que portent la
 * plupart des interdictions des centrales, dont celles qui ferment les
 * recherches datées.
 */
export async function centraleAutorise(url: string): Promise<VerdictRobots> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { autorise: false, regle: "URL illisible" };
  }
  const texte = await lireRobots(u.origin);
  return robotsAutorise(texte, u.pathname + u.search, AGENT_CENTRALES);
}
