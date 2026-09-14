import { emptyBulletin, parseBulletin, type BraBulletin } from "./parse";
import { assurerCles } from "../cles/store.server";
import { cleParId } from "../cles/registre";

const ENDPOINT = "https://public-api.meteofrance.fr/public/DPBRA/v1/massif/BRA";
const TIMEOUT_MS = 15_000;
/** Un à deux bulletins par jour : douze heures suffisent. */
const TTL_MS = 12 * 60 * 60 * 1000;
/** Un échec ne condamne pas le massif pour la journée : cinq minutes, le temps
 *  d'absorber une rafale sans réessayer à chaque affichage. */
const TTL_ECHEC_MS = 5 * 60 * 1000;

const cache = new Map<number, { at: number; value: BraBulletin }>();
/** Les appels en vol, par massif : deux fiches ouvertes sur le même massif
 *  déclenchaient deux requêtes Météo-France. */
const enVol = new Map<number, Promise<BraBulletin>>();

/**
 * La clé Météo-France vient de l'environnement, et de nulle part ailleurs.
 *
 * Elle était écrite en clair dans `secrets.server.ts`, suivi par git et
 * recopié dans le bundle du serveur. Ce fichier est supprimé ; la clé doit être
 * révoquée, recréée, et posée en `METEOFRANCE_API_KEY` — ou saisie dans
 * Plus › Clés, que `assurerCles` verse dans l'environnement avant cette
 * lecture. Il n'y a toujours qu'un chemin de lecture.
 *
 * Les noms sont ceux du registre, dans son ordre, et la première valeur **non
 * vide** gagne : `??` laissait une variable principale posée à la chaîne vide
 * masquer l'alias, alors que partout ailleurs le vide vaut l'absence.
 */
export function loadMeteofranceKey(): string | null {
  assurerCles();
  const noms = cleParId("meteofrance")?.env ?? ["METEOFRANCE_API_KEY"];
  return noms.map((n) => process.env[n]?.trim()).find(Boolean) ?? null;
}

/**
 * Oublier ce qui a été relevé, bulletins et échecs.
 *
 * Poser ou retirer la clé change la réponse de Météo-France sur-le-champ ;
 * sans cela, le cache d'échec faisait répondre « Aucune clé » pendant cinq
 * minutes après la saisie, et l'écran des clés paraissait sans effet.
 */
export function oublierCacheBra(): void {
  cache.clear();
  enVol.clear();
}

export async function fetchBra(massifCode: number, force = false): Promise<BraBulletin> {
  if (!Number.isInteger(massifCode) || massifCode <= 0) {
    return emptyBulletin(massifCode, { error: "Massif inconnu." });
  }
  const hit = cache.get(massifCode);
  const ttl = hit?.value.ok ? TTL_MS : TTL_ECHEC_MS;
  if (!force && hit && Date.now() - hit.at < ttl) return hit.value;
  // Un seul appel à la fois par massif ; les autres attendent le même, y
  // compris un appel forcé : le cache a déjà été court-circuité plus haut, la
  // requête en vol est donc bien un relevé neuf. L'exclusion de `force`
  // ouvrait un second appel réseau qui écrasait l'entrée du premier, et le
  // `finally` du premier retirait ensuite celle du second — un troisième appel
  // repartait alors sur le réseau pendant que le second était encore en vol.
  // On ne retire que sa propre entrée.
  const vol = enVol.get(massifCode);
  if (vol) return vol;
  const p = fetchBraDirect(massifCode).finally(() => {
    if (enVol.get(massifCode) === p) enVol.delete(massifCode);
  });
  enVol.set(massifCode, p);
  return p;
}

async function fetchBraDirect(massifCode: number): Promise<BraBulletin> {
  const key = loadMeteofranceKey();
  if (!key) {
    // Non mis en cache : ce n'est pas une panne réseau mais un état de
    // configuration, qui change dès que la clé est saisie dans Plus › Clés.
    return emptyBulletin(massifCode, {
      error: "Aucune clé Météo-France : renseignez-la dans Plus › Clés, ou posez METEOFRANCE_API_KEY.",
    });
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
      // 401 et 403 ne disent pas la même chose, et l'écran des clés a besoin
      // de les distinguer : l'un met en cause la clé, l'autre ses droits.
      const msg =
        res.status === 401
          ? "Clé refusée par Météo-France (401) : vérifiez la clé posée."
          : res.status === 403
            ? "Accès refusé par Météo-France (403) : l'abonnement « Données Publiques BRA » manque à cette clé, ou le service est fermé hors saison."
            : `Météo-France a répondu ${res.status}.`;
      // Chaque échec est journalisé, massif par massif : les trous étaient
      // invisibles en exploitation.
      console.warn(`[bra] massif ${massifCode} : HTTP ${res.status}`);
      const vide = emptyBulletin(massifCode, { error: msg });
      cache.set(massifCode, { at: Date.now(), value: vide });
      return vide;
    }
    const value = parseBulletin(massifCode, body);
    if (!value.ok) console.warn(`[bra] massif ${massifCode} : ${value.error ?? "bulletin illisible"}`);
    cache.set(massifCode, { at: Date.now(), value });
    return value;
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "délai dépassé" : String(err);
    console.warn(`[bra] massif ${massifCode} : ${reason}`);
    const vide = emptyBulletin(massifCode, { error: `Bulletin injoignable — ${reason}.` });
    cache.set(massifCode, { at: Date.now(), value: vide });
    return vide;
  } finally {
    clearTimeout(timer);
  }
}
