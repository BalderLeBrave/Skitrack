import { emptyBulletin, parseBulletin, type BraBulletin } from "./parse";
import { METEOFRANCE_API_KEY } from "./secrets.server";

const ENDPOINT = "https://public-api.meteofrance.fr/public/DPBRA/v1/massif/BRA";
const TIMEOUT_MS = 15_000;
/** Un à deux bulletins par jour : douze heures suffisent. */
const TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map<number, { at: number; value: BraBulletin }>();

export function loadMeteofranceKey(): string | null {
  const env = process.env.METEOFRANCE_API_KEY ?? process.env.SKITRACK_METEOFRANCE_API_KEY;
  if (env && env.trim()) return env.trim();
  return METEOFRANCE_API_KEY.trim() || null;
}

export async function fetchBra(massifCode: number, force = false): Promise<BraBulletin> {
  if (!Number.isInteger(massifCode) || massifCode <= 0) {
    return emptyBulletin(massifCode, { error: "Massif inconnu." });
  }
  const hit = cache.get(massifCode);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const key = loadMeteofranceKey();
  if (!key) {
    return emptyBulletin(massifCode, { error: "Aucune clé Météo-France." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?id-massif=${massifCode}&format=xml`;
    const res = await fetch(url, {
      headers: { apikey: key, accept: "application/xml" },
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      const msg =
        res.status === 401 || res.status === 403
          ? "Bulletin Météo-France indisponible (hors saison ou accès refusé)."
          : `Météo-France a répondu ${res.status}.`;
      return emptyBulletin(massifCode, { error: msg });
    }
    const value = parseBulletin(massifCode, body);
    cache.set(massifCode, { at: Date.now(), value });
    return value;
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "délai dépassé" : String(err);
    return emptyBulletin(massifCode, { error: `Bulletin injoignable — ${reason}.` });
  } finally {
    clearTimeout(timer);
  }
}
