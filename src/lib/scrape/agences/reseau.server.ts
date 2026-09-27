/**
 * Le réseau des agences (voir `couverture.ts`) : une requête à la fois par
 * site, au rythme du journal de taux partagé (`stay/taux.server.ts` : 2 s
 * d'écart, 20 par minute), avec l'en-tête d'un navigateur (`navigateur.ts`),
 * comme tout le relevé.
 *
 * Un refus (429, 503 ou 403, défi anti-robot compris) arrête le relevé de ce
 * site et pose une pause de 45 s au moins, que tous les relevés lisent : rien
 * n'est repris, et ce qui est déjà lu reste. Une requête qui ne peut pas finir
 * avant l'échéance de la part ne part pas.
 */

import type { Listing } from "@/lib/listings";
import { CIRCUIT_COOLDOWN_MS, PAUSE_MAX_MS, estStatutRalenti, retryAfterMs } from "@/lib/stay/http429";
import { noterBlocage, paceTaux, pauseTauxMs } from "@/lib/stay/taux.server";
import { UA_NAVIGATEUR } from "../navigateur";

/** Ce qu'un collecteur d'agence rend à la part. */
export type ReleveAgence = {
  listings: Listing[];
  /** Ce que la source dit avoir pour cette recherche, quand elle le publie. */
  annoncees?: number | null;
  /** Le détail, pour le journal : d'où viennent les annonces, ce qui est écarté. */
  note?: string;
  /** Pourquoi le relevé s'est arrêté avant la fin, s'il l'a fait. */
  raison?: string;
};

export type OptionsReleve = { echeance: number };

/** Un arrêt du relevé d'un site : refus, échéance, limiteur. Jamais repris. */
export class ArretAgence extends Error {}

const DELAI_REQUETE_MS = 12_000;
/** Une requête qui ne peut pas finir avant l'échéance ne part pas. */
const MARGE_MS = 2_500;

export type Demande = {
  /** La clé du site dans le journal de taux (« ovo », « alpissime »…). */
  hote: string;
  url: string;
  echeance: number;
  methode?: "GET" | "POST";
  corps?: string;
  entetes?: Record<string, string>;
};

export async function demander(d: Demande): Promise<{ status: number; texte: string }> {
  const reste = d.echeance - Date.now();
  if (reste < MARGE_MS) throw new ArretAgence("échéance");
  // On attend son créneau tant que l'échéance le permet.
  const attente = await paceTaux(d.hote, reste - MARGE_MS);
  if (attente > 0) {
    const pourquoi = pauseTauxMs(d.hote) > 0 ? "pause après un refus" : "limiteur local";
    throw new ArretAgence(`${pourquoi} (${Math.round(attente / 1000)} s à attendre)`);
  }
  let res: Response;
  try {
    res = await fetch(d.url, {
      method: d.methode ?? "GET",
      headers: { "user-agent": UA_NAVIGATEUR, "accept-language": "fr-FR,fr;q=0.9", ...d.entetes },
      body: d.corps,
      redirect: "follow",
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(DELAI_REQUETE_MS, d.echeance - Date.now()))),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw new Error("délai dépassé");
    throw err;
  }
  // Un 403 est un refus, comme un 429 ou un 503 : pause partagée, jamais de reprise.
  if (estStatutRalenti(res.status) || res.status === 403) {
    const pause = Math.max(CIRCUIT_COOLDOWN_MS, retryAfterMs(res.headers, 0, PAUSE_MAX_MS));
    noterBlocage(d.hote, pause);
    await res.body?.cancel().catch(() => undefined);
    const defi = res.headers.get("cf-mitigated")?.toLowerCase() === "challenge";
    throw new ArretAgence(`HTTP ${res.status}${defi ? " (défi anti-robot)" : ""} — pause ${Math.round(pause / 1000)} s`);
  }
  const texte = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { status: res.status, texte };
}

export function raisonDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
