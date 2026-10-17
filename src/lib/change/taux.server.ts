/**
 * Les taux de référence de la BCE, lus une fois par demi-journée. La BCE les
 * publie chaque jour ouvré vers 16 h, heure de Francfort.
 */

import { lireTauxBce, type TauxBce } from "./affichage.ts";

const URL_BCE = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const GARDE_MS = 6 * 60 * 60_000;
let garde: { at: number; taux: TauxBce } | null = null;

export async function tauxBce(): Promise<TauxBce | null> {
  if (garde && Date.now() - garde.at < GARDE_MS) return garde.taux;
  try {
    const r = await fetch(URL_BCE, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return garde?.taux ?? null;
    const t = lireTauxBce(await r.text());
    if (t) garde = { at: Date.now(), taux: t };
    return t ?? garde?.taux ?? null;
  } catch {
    // Hors ligne : le dernier relevé, ou rien — les prix restent alors dans leur devise.
    return garde?.taux ?? null;
  }
}
