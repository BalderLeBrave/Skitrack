/**
 * Des totaux datés pour les fiches du catalogue, jamais un « à partir de ».
 *
 * Une page d'office ne publie pas de total : elle publie une grille. Le
 * total d'un séjour vit chez le moteur vers lequel la fiche envoie
 * (`FicheCatalogue.reservation`). Ce module interroge le seul dont le dépôt
 * sait déjà lire un devis daté par logement : le widget Gîtes de France
 * (ITEA), lu par `devisItea` (`stay/tarif.ts`), le même lecteur que la seconde
 * passe de l'écran Logements (`stay/completerDevis.server.ts`).
 *
 * Trois requêtes par gîte : la fiche du widget (identifiants), l'exercice des
 * dates, puis la grille de ces dates. Chacune passe par :
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

import { dateIngenie, nuitsEntre } from "./centrales/moteurs/ingenie.ts";
import { gitesCodeOf, gitesWidgetUrl } from "./gitesGps.server.ts";
import { dansLaFile, demander, UA_RELEVE, verdictPoli } from "./politesse.ts";
import { devisItea, ficheItea } from "../stay/tarif.ts";
import type { FicheCatalogue } from "./catalogue.ts";

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

/**
 * Pose sur chaque fiche Gîtes de France le total daté de `s`. Les fiches
 * sont modifiées en place ; le bilan dit ce qui a été demandé et obtenu.
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
  for (const f of fiches) {
    if (signal?.aborted) break;
    const code = f.reservation?.moteur === "Gîtes de France" ? gitesCodeOf(f.reservation.url) : null;
    if (!code) continue;
    b.eligibles += 1;
    if (memesDates(f, s)) {
      b.repris += 1;
      continue;
    }
    if (b.refus) continue;
    // Le devis d'un gîte plus petit que le groupe n'est pas un séjour possible.
    const personnes = f.capacite != null ? Math.min(s.personnes, f.capacite) : s.personnes;
    b.demandes += 1;
    try {
      const d = await devisGites(code, { ...s, personnes }, signal);
      if (!d) {
        b.sansTotal += 1;
        continue;
      }
      f.totalSejour = {
        montant: d.total,
        arrivee: s.arrivee,
        depart: s.depart,
        nuits,
        source: `Gîtes de France (ITEA), ${d.label ?? "total"}, ${personnes} pers.`,
      };
      b.obtenus += 1;
    } catch (e) {
      if (e instanceof Interdit) b.interditsRobots += 1;
      else if (e instanceof Refus) {
        b.refus = e.status;
        b.erreurs.push(`${code} : refus ${e.status}, devis suivants non demandés`);
      } else b.erreurs.push(`${code} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return b;
}
