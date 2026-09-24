/**
 * La politesse réseau du relevé de tarifs : un appel à la fois par domaine,
 * et un intervalle minimal entre deux requêtes.
 *
 * L'en-tête est celui d'un navigateur, comme tout le relevé : consigne du
 * propriétaire du 24 septembre 2026 (`navigateur.ts`). Il s'annonçait avant
 * en robot applicatif « Skitrack ». Face à un refus, on ne force pas : on
 * bascule sur une voie autorisée.
 *
 * Aucune reprise en boucle : un appel refusé est un appel refusé, et c'est le
 * registre des sources (`sources.server.ts`) qui décide de la suite.
 */

import { robotsAutorise, type VerdictRobots } from "./centrales/robots.ts";
import { UA_NAVIGATEUR } from "./navigateur.ts";

/** Le nom sous lequel on lit les règles de `robots.txt` (groupes, Crawl-delay). Il ne part pas dans les requêtes. */
export const UA_AGENT = "Skitrack";
/** L'en-tête des requêtes : celui d'un navigateur. */
export const UA_RELEVE = UA_NAVIGATEUR;

/** Intervalle minimal entre deux requêtes vers le même domaine. */
export const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 12_000;

type File = { dernier: number; queue: Promise<unknown>; delaiMs: number };
const files = new Map<string, File>();

function hote(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function dormir(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Relevé interrompu.", "AbortError"));
      },
      { once: true },
    );
  });
}

export type Reponse = { ok: boolean; status: number; text: string; url: string };

/**
 * Une requête polie vers `url`.
 *
 * Les appels au même hôte se suivent : jamais deux en parallèle, jamais moins
 * de `INTERVALLE_MS` entre deux. La file est par hôte, donc deux domaines
 * différents avancent en même temps.
 *
 * `delaiMs` est la cadence annoncée par le site — `verdictPoli().delaiMs`, qui
 * lit le `Crawl-delay` de son robots.txt. Elle était calculée puis jetée : la
 * file restait à deux secondes quoi qu'annonçât le domaine. Elle ne peut
 * qu'**allonger** l'attente, jamais la raccourcir, et l'hôte la retient pour
 * les requêtes suivantes.
 */
export function demander(url: string, signal?: AbortSignal, delaiMs?: number): Promise<Reponse> {
  const h = hote(url);
  const file = files.get(h) ?? { dernier: 0, queue: Promise.resolve(), delaiMs: INTERVALLE_MS };
  if (delaiMs != null && Number.isFinite(delaiMs)) file.delaiMs = Math.max(file.delaiMs, delaiMs);
  files.set(h, file);
  const suite = file.queue.then(async () => {
    const attente = file.dernier + file.delaiMs - Date.now();
    await dormir(attente, signal);
    file.dernier = Date.now();
    const ctrl = new AbortController();
    // Le délai dépassé et l'interruption demandée par l'appelant passent tous
    // deux par `abort` : sans ce drapeau, l'appelant recevait un `AbortError`
    // dans les deux cas, prenait un site lent pour un arrêt volontaire, sautait
    // le reste du lot en silence et ne comptait jamais la panne.
    let expire = false;
    const timer = setTimeout(() => {
      expire = true;
      ctrl.abort();
    }, TIMEOUT_MS);
    const relais = () => ctrl.abort();
    signal?.addEventListener("abort", relais, { once: true });
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA_RELEVE, accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: ctrl.signal,
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, url };
    } catch (err) {
      if (expire && !signal?.aborted) throw new Error(`Délai dépassé (${TIMEOUT_MS / 1000} s).`);
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relais);
    }
  });
  // La file continue même quand un appel échoue : sinon un refus bloquerait
  // le domaine pour la suite de la session.
  file.queue = suite.catch(() => undefined);
  return suite;
}

/** Pour les tests : remet les files à zéro. */
export function oublierFiles(): void {
  files.clear();
  robots.clear();
}

/* ---------- robots.txt, lu et respecté ---------- */

const ROBOTS_TTL_MS = 60 * 60 * 1000;
const ROBOTS_TTL_ILLISIBLE_MS = 5 * 60 * 1000;
const robots = new Map<string, { at: number; texte: string | null }>();

/**
 * Le `Crawl-delay` publié pour notre agent, en millisecondes.
 *
 * Aucun des deux parseurs du dépôt ne le lisait. Quand un site publie une
 * cadence, c'est elle qui vaut, pas la nôtre.
 */
export function crawlDelayMs(texte: string | null, agent = UA_AGENT): number | null {
  if (!texte) return null;
  const cible = agent.toLowerCase();
  let courant: string[] = [];
  let pertinent = false;
  let valeur: number | null = null;
  for (const brut of texte.split(/\r?\n/)) {
    const ligne = brut.replace(/#.*$/, "").trim();
    if (!ligne) continue;
    const ua = /^user-agent:\s*(.+)$/i.exec(ligne);
    if (ua) {
      const nom = ua[1].trim().toLowerCase();
      if (pertinent) courant = [];
      courant.push(nom);
      pertinent = courant.includes(cible) || courant.includes("*");
      continue;
    }
    const cd = /^crawl-delay:\s*([0-9.]+)/i.exec(ligne);
    if (cd && pertinent) {
      const n = Number(cd[1]);
      if (Number.isFinite(n) && n > 0) valeur = Math.max(valeur ?? 0, n * 1000);
    }
    pertinent = pertinent && !/^user-agent:/i.test(ligne);
  }
  return valeur;
}

async function lireRobots(origine: string): Promise<string | null> {
  const hit = robots.get(origine);
  const ttl = hit?.texte == null ? ROBOTS_TTL_ILLISIBLE_MS : ROBOTS_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.texte;
  let texte: string | null = null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const r = await fetch(`${origine.replace(/\/$/, "")}/robots.txt`, {
      headers: { "user-agent": UA_RELEVE, accept: "text/plain,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    // 404 / 410 : réponse claire, aucune règle. Toute autre non-réponse :
    // illisible, et gardée moins longtemps pour ne pas figer un incident.
    if (r.status === 200) texte = await r.text();
    else if (r.status === 404 || r.status === 410) texte = "";
    else await r.body?.cancel();
  } catch {
    texte = null;
  } finally {
    clearTimeout(t);
  }
  robots.set(origine, { at: Date.now(), texte });
  return texte;
}

export type VerdictPoli = VerdictRobots & { delaiMs: number };

/**
 * Le verdict pour **cette** URL, chemin et requête compris — et non pour « / ».
 *
 * Le relevé tarifaire lisait robots.txt pour la racine, puis jetait le
 * résultat. Ici le verdict compte : `autorise === false` arrête la requête.
 * `null` — fichier illisible — reste permissif, et se journalise.
 */
export async function verdictPoli(url: string): Promise<VerdictPoli> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { autorise: false, regle: "URL illisible", delaiMs: INTERVALLE_MS };
  }
  const texte = await lireRobots(u.origin);
  // Le parseur retenu est celui des centrales : il gère la marque d'ordre
  // d'octets, l'ancre `$`, et fait gagner `Allow` à longueur égale. Le second
  // parseur du dépôt (`scrape/robots.ts`) tranche l'inverse ; le relevé
  // tarifaire n'en dépend plus.
  const lu = robotsAutorise(texte, u.pathname + u.search, UA_AGENT);
  const publie = crawlDelayMs(texte);
  return { ...lu, delaiMs: Math.max(INTERVALLE_MS, publie ?? 0) };
}
