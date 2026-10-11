/**
 * Des totaux datés pour les fiches du catalogue, jamais un « à partir de ».
 *
 * Une page d'office ne publie pas de total : elle publie une grille. Le
 * total d'un séjour vit chez le moteur vers lequel la fiche envoie
 * (`FicheCatalogue.reservation`). Ce module interroge les deux dont le dépôt
 * sait déjà lire un devis daté par logement, avec les lecteurs de la seconde
 * passe de l'écran Logements :
 * - le widget Gîtes de France (ITEA), lu par `devisItea`
 *   (`stay/completerDevis.server.ts`) : la fiche du widget, l'exercice des
 *   dates, la grille de ces dates ;
 * - le panier Ingénie, lu par `totalPanierJson`
 *   (`stay/completerTarif.server.ts`) : une session sur la recherche datée,
 *   le détail des tarifs de la prestation, puis le total que le panier
 *   calcule (`calculerTotalPrestationAjax`). Seul ce total est retenu : le
 *   loyer d'une ligne de détail n'est pas le prix du séjour.
 *
 * Chaque requête passe par :
 * - `verdictPoli` : une règle `Disallow` de robots.txt arrête la fiche, sans
 *   requête ;
 * - `dansLaFile` : une requête à la fois vers l'hôte, au `Crawl-delay` publié
 *   s'il est plus long que nos deux secondes ;
 * - un refus 401, 403 ou 429 arrête tous les devis de l'hôte, sans second
 *   essai.
 *
 * Un devis sans total (gîte occupé, « contactez le propriétaire ») laisse la
 * fiche sans total : rien n'est inventé à sa place.
 */

import { cidDepuisPage, dateIngenie, nuitsEntre, urlIngenie } from "./centrales/moteurs/ingenie.ts";
import { gitesCodeOf, gitesWidgetUrl } from "./gitesGps.server.ts";
import { dansLaFile, demander, UA_RELEVE, verdictPoli } from "./politesse.ts";
import { champsRecap, cidDepuisUrl, devisItea, ficheItea, moteurIngenie, prestationIngenie, totalPanierJson } from "../stay/tarif.ts";
import type { FicheCatalogue, Reservation } from "./catalogue.ts";

export type Sejour = { arrivee: string; depart: string; personnes: number };

/** Une semaine de vacances d'hiver, du samedi au samedi. */
export const SEJOUR_PAR_DEFAUT: Sejour = { arrivee: "2027-02-13", depart: "2027-02-20", personnes: 4 };

export type BilanTotaux = {
  sejour: Sejour;
  /** Fiches dont le moteur sait donner un devis daté. */
  eligibles: number;
  /** Devis demandés, et totaux obtenus. */
  demandes: number;
  obtenus: number;
  /** Total déjà relevé pour ces dates, repris sans requête. */
  repris: number;
  /** Devis sans total : occupé, à demander au propriétaire, page vide. */
  sansTotal: number;
  interditsRobots: number;
  /** Le moteur a refusé (401, 403, 429) : les devis suivants n'ont pas été demandés. */
  refus: number | null;
  erreurs: string[];
};

const GERE_RESA = "https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php";

export function sejourValide(s: Sejour): boolean {
  return nuitsEntre(s.arrivee, s.depart) > 0 && Number.isInteger(s.personnes) && s.personnes >= 1 && s.personnes <= 30;
}

function memesDates(f: FicheCatalogue, s: Sejour): boolean {
  return f.totalSejour?.arrivee === s.arrivee && f.totalSejour?.depart === s.depart;
}

class Interdit extends Error {}

class Refus extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`refus ${status}`);
    this.status = status;
  }
}

async function poster(corps: URLSearchParams, referer: string, signal?: AbortSignal): Promise<string> {
  const v = await verdictPoli(GERE_RESA);
  if (!v.autorise) throw new Interdit(v.regle ?? "Disallow");
  return dansLaFile(
    GERE_RESA,
    async (s) => {
      const res = await fetch(GERE_RESA, {
        method: "POST",
        headers: {
          "user-agent": UA_RELEVE,
          accept: "text/html,application/json,*/*",
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://widget-fngf.itea.fr",
          referer,
        },
        body: corps,
        signal: s,
      });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        await res.body?.cancel().catch(() => undefined);
        throw new Refus(res.status);
      }
      return res.ok ? res.text() : "";
    },
    { signal, delaiMs: v.delaiMs },
  );
}


/** Le devis ITEA d'un gîte pour ce séjour, ou `null` sans total. */
async function devisGites(code: string, s: Sejour, signal?: AbortSignal): Promise<{ total: number; label: string | null } | null> {
  const widget = gitesWidgetUrl(code);
  const v = await verdictPoli(widget);
  if (!v.autorise) throw new Interdit(v.regle ?? "Disallow");
  const page = await demander(widget, signal, v.delaiMs);
  if (page.status === 401 || page.status === 403 || page.status === 429) throw new Refus(page.status);
  const fiche = page.ok ? ficheItea(page.text) : null;
  if (!fiche) return null;
  const base = {
    nbAdultes: String(s.personnes),
    dateDeb: dateIngenie(s.arrivee),
    dateFin: dateIngenie(s.depart),
    instance: fiche.instance,
    ident: fiche.ident,
    exercice: fiche.exercice,
    estpresentsurfiche: "true",
  };
  let exercice = fiche.exercice;
  try {
    const exo = JSON.parse(await poster(new URLSearchParams({ ...base, type: "getExerciceByDateFin" }), widget, signal)) as {
      exercice?: unknown;
    };
    if (exo.exercice) exercice = String(exo.exercice);
  } catch (e) {
    if (e instanceof Refus || e instanceof Interdit) throw e;
    /* réponse HTML : l'exercice de la fiche vaut */
  }
  const tab = await poster(new URLSearchParams({ ...base, exercice, type: "getHTMLTabPrixFormulesSejour" }), widget, signal);
  const devis = devisItea(tab);
  return devis ? { total: devis.total, label: devis.label } : null;
}

/* ---------- Ingénie ---------- */

type SessionIngenie = { cookie: string; cid: string };

function melerCookies(actuel: string, poses: string[]): string {
  const m = new Map<string, string>();
  for (const part of [...actuel.split(";"), ...poses.map((p) => p.split(";")[0] ?? "")]) {
    const t = part.trim();
    const i = t.indexOf("=");
    if (i > 0) m.set(t.slice(0, i), t.slice(i + 1));
  }
  return [...m].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Un GET poli qui garde la session : verdict robots.txt, file de l'hôte, cookies. */
async function lireAvecSession(url: string, cookie: string, signal?: AbortSignal): Promise<{ texte: string; cookie: string }> {
  const v = await verdictPoli(url);
  if (!v.autorise) throw new Interdit(v.regle ?? "Disallow");
  return dansLaFile(
    url,
    async (sig) => {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA_RELEVE,
          accept: "text/html,application/json,*/*",
          "accept-language": "fr-FR,fr;q=0.9",
          ...(cookie ? { cookie } : {}),
        },
        redirect: "follow",
        signal: sig,
      });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        await res.body?.cancel().catch(() => undefined);
        throw new Refus(res.status);
      }
      const poses = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      const suite = melerCookies(cookie, poses);
      return { texte: res.ok ? await res.text() : "", cookie: suite };
    },
    { signal, delaiMs: v.delaiMs },
  );
}

/**
 * Le total du panier Ingénie pour ce logement et ce séjour, ou `null`.
 * `sessions` garde une session par origine et par séjour : la recherche
 * datée n'est demandée qu'une fois pour toutes les fiches d'une centrale.
 */
async function devisIngenie(
  r: Reservation,
  s: Sejour,
  sessions: Map<string, SessionIngenie | null>,
  signal?: AbortSignal,
): Promise<{ total: number } | null> {
  const origine = new URL(r.url).origin;
  let prestation = prestationIngenie(r.url);
  let cid = cidDepuisUrl(r.url);
  if (!prestation) {
    const fiche = await lireAvecSession(r.url, "", signal);
    const mot = moteurIngenie(fiche.texte);
    if (!mot) return null;
    prestation = mot.prestation;
    cid ??= mot.cid;
  }
  const cle = `${origine}|${s.arrivee}|${s.depart}|${s.personnes}`;
  let sess = sessions.get(cle);
  if (sess === undefined) {
    cid ??= cidDepuisPage((await lireAvecSession(`${origine}/`, "", signal)).texte);
    sess = null;
    if (cid) {
      const recherche = await lireAvecSession(urlIngenie(origine, cid, { checkIn: s.arrivee, checkOut: s.depart, guests: s.personnes }), "", signal);
      if (recherche.texte.length >= 400) sess = { cookie: recherche.cookie, cid };
    }
    sessions.set(cle, sess);
  }
  if (!sess) return null;

  const detail = new URL(`${origine}/booking`);
  detail.searchParams.set("action", "detailTarifsPrestationAjax");
  detail.searchParams.set("cid", sess.cid);
  detail.searchParams.set("prestation", prestation);
  detail.searchParams.set("new_dateDebut", s.arrivee.replace(/-/g, ""));
  detail.searchParams.set("new_dateFin", s.depart.replace(/-/g, ""));
  const recap = await lireAvecSession(detail.toString(), sess.cookie, signal);
  sess.cookie = recap.cookie || sess.cookie;
  if (recap.texte.length < 200) return null;

  const total = new URL(`${origine}/booking`);
  total.searchParams.set("action", "calculerTotalPrestationAjax");
  total.searchParams.set("cid", sess.cid);
  for (const [k, v] of champsRecap(recap.texte, s.personnes)) {
    if (k !== "action" && k !== "cid") total.searchParams.append(k, v);
  }
  const panier = totalPanierJson((await lireAvecSession(total.toString(), sess.cookie, signal)).texte);
  return panier != null && panier > 0 ? { total: panier } : null;
}

/**
 * Pose sur chaque fiche Gîtes de France ou Ingénie le total daté de `s`.
 * Les fiches sont modifiées en place ; le bilan dit ce qui a été demandé et
 * obtenu. Un refus arrête les devis du moteur qui a refusé, pas des autres.
 */
export async function totauxDates(fiches: FicheCatalogue[], s: Sejour, signal?: AbortSignal): Promise<BilanTotaux> {
  const b: BilanTotaux = {
    sejour: s,
    eligibles: 0,
    demandes: 0,
    obtenus: 0,
    repris: 0,
    sansTotal: 0,
    interditsRobots: 0,
    refus: null,
    erreurs: [],
  };
  if (!sejourValide(s)) {
    b.erreurs.push(`séjour invalide : ${s.arrivee} → ${s.depart}, ${s.personnes} pers.`);
    return b;
  }
  const nuits = nuitsEntre(s.arrivee, s.depart);
  const sessions = new Map<string, SessionIngenie | null>();
  // Un refus ferme l'hôte qui a refusé : le widget ITEA, ou une centrale Ingénie.
  const fermes = new Set<string>();
  for (const f of fiches) {
    if (signal?.aborted) break;
    const r = f.reservation;
    if (!r) continue;
    const code = r.moteur === "Gîtes de France" ? gitesCodeOf(r.url) : null;
    const ingenie = r.moteur === "Ingénie";
    if (!code && !ingenie) continue;
    b.eligibles += 1;
    if (memesDates(f, s)) {
      b.repris += 1;
      continue;
    }
    const hote = code ? "widget-fngf.itea.fr" : new URL(r.url).host;
    if (fermes.has(hote)) continue;
    // Le devis d'un logement plus petit que le groupe n'est pas un séjour possible.
    const personnes = f.capacite != null ? Math.min(s.personnes, f.capacite) : s.personnes;
    const sejour = { ...s, personnes };
    b.demandes += 1;
    try {
      const d = code ? await devisGites(code, sejour, signal) : await devisIngenie(r, sejour, sessions, signal);
      if (!d) {
        b.sansTotal += 1;
        continue;
      }
      const libelle = "label" in d ? `Gîtes de France (ITEA), ${d.label ?? "total"}` : "Ingénie, total du panier";
      f.totalSejour = { montant: d.total, arrivee: s.arrivee, depart: s.depart, nuits, source: `${libelle}, ${personnes} pers.` };
      b.obtenus += 1;
    } catch (e) {
      if (e instanceof Interdit) b.interditsRobots += 1;
      else if (e instanceof Refus) {
        b.refus = e.status;
        fermes.add(hote);
        b.erreurs.push(`${hote} : refus ${e.status}, devis suivants de cet hôte non demandés`);
      } else b.erreurs.push(`${code ?? r.url} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return b;
}
