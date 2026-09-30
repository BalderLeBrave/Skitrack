import { emptyBulletin, idMassif, parseBulletin, type BraBulletin } from "./parse";
import {
  ARCHIVE_BRA,
  cheminJour,
  dernierDuMassif,
  jourLisible,
  lireIndexJour,
  lireSousDossiers,
  type FichierBra,
} from "./archive";
import { assurerCles } from "../cles/store.server";
import { cleParId } from "../cles/registre";
import { UA_NAVIGATEUR } from "../scrape/navigateur";

const ENDPOINT = "https://public-api.meteofrance.fr/public/DPBRA/v1/massif/BRA";
const TIMEOUT_MS = 15_000;
/** Un à deux bulletins par jour : douze heures suffisent. */
const TTL_MS = 12 * 60 * 60 * 1000;
/** L'archive publique reçoit le bulletin du jour l'après-midi : on y revient
 *  plus souvent, un index de jour ne coûte qu'une requête pour tous les
 *  massifs. */
const TTL_OUVERT_MS = 3 * 60 * 60 * 1000;
/** Un échec ne condamne pas le massif pour la journée : cinq minutes, le temps
 *  d'absorber une rafale sans réessayer à chaque affichage. */
const TTL_ECHEC_MS = 5 * 60 * 1000;
/** Un index de l'archive sert à tous les massifs du jour. */
const TTL_INDEX_MS = 20 * 60 * 1000;
/** Aujourd'hui, hier, avant-hier : un bulletin plus vieux n'est plus en
 *  vigueur, et le chercher plus loin ne servirait qu'à dater le dernier. */
const JOURS_CHERCHES = 3;

const cache = new Map<number, { at: number; ttl: number; value: BraBulletin }>();
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
 * Elle est facultative : sans elle, les bulletins viennent de l'archive
 * publique de data.gouv.fr (`lireArchive`).
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
 * sans cela, le cache d'échec faisait répondre l'ancienne cause pendant cinq
 * minutes après la saisie, et l'écran des clés paraissait sans effet.
 */
export function oublierCacheBra(): void {
  cache.clear();
  enVol.clear();
  index.clear();
  indexEnVol.clear();
}

export async function fetchBra(massifCode: number, force = false): Promise<BraBulletin> {
  if (!Number.isInteger(massifCode) || massifCode <= 0) {
    return emptyBulletin(massifCode, { error: "Massif inconnu." });
  }
  const hit = cache.get(massifCode);
  if (!force && hit && Date.now() - hit.at < hit.ttl) return hit.value;
  // Un seul appel à la fois par massif ; les autres attendent le même, y
  // compris un appel forcé : le cache a déjà été court-circuité plus haut, la
  // requête en vol est donc bien un relevé neuf. L'exclusion de `force`
  // ouvrait un second appel réseau qui écrasait l'entrée du premier, et le
  // `finally` du premier retirait ensuite celle du second — un troisième appel
  // repartait alors sur le réseau pendant que le second était encore en vol.
  // On ne retire que sa propre entrée.
  const vol = enVol.get(massifCode);
  if (vol) return vol;
  const p = fetchBraDirect(massifCode, force).finally(() => {
    if (enVol.get(massifCode) === p) enVol.delete(massifCode);
  });
  enVol.set(massifCode, p);
  return p;
}

/**
 * L'API quand une clé est posée, l'archive publique sinon, ou quand l'API
 * échoue : une clé refusée ou un abonnement manquant ne privent plus la fiche
 * de son bulletin. L'échec de l'API reste journalisé, et c'est lui qui est
 * rendu si l'archive n'a rien non plus.
 */
async function fetchBraDirect(massifCode: number, force: boolean): Promise<BraBulletin> {
  const key = loadMeteofranceKey();
  let viaApi: BraBulletin | null = null;
  if (key) {
    viaApi = await fetchBraApi(massifCode, key);
    if (viaApi.ok) return retenir(massifCode, viaApi, TTL_MS);
  }
  const ouvert = await lireArchive(massifCode, force);
  if (ouvert.ok || !viaApi) return retenir(massifCode, ouvert, ouvert.ok ? TTL_OUVERT_MS : TTL_ECHEC_MS);
  return retenir(massifCode, viaApi, TTL_ECHEC_MS);
}

function retenir(massifCode: number, value: BraBulletin, ttl: number): BraBulletin {
  cache.set(massifCode, { at: Date.now(), ttl, value });
  return value;
}

async function lireTexte(url: string, accept: string): Promise<{ status: number; texte: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept, "user-agent": UA_NAVIGATEUR },
      signal: controller.signal,
    });
    return { status: res.status, texte: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

function raisonReseau(err: unknown): string {
  return err instanceof Error && err.name === "AbortError" ? "délai dépassé" : String(err);
}

/**
 * Un appel à l'API « Données Publiques BRA », sans cache ni repli : c'est ce
 * que l'écran des clés essaie, et ce que `fetchBraDirect` tente en premier.
 */
export async function fetchBraApi(massifCode: number, key: string): Promise<BraBulletin> {
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
          ? "Clé refusée par Météo-France (401) : vérifiez la clé enregistrée."
          : res.status === 403
            ? "Accès refusé par Météo-France (403) : l’abonnement « Données Publiques BRA » manque à cette clé, ou le service est fermé hors saison."
            : `Météo-France a renvoyé l’erreur ${res.status}.`;
      // Chaque échec est journalisé, massif par massif : les trous étaient
      // invisibles en exploitation.
      console.warn(`[bra] massif ${massifCode} : API HTTP ${res.status}`);
      return emptyBulletin(massifCode, { error: msg, acces: "api" });
    }
    const value = { ...parseBulletin(massifCode, body), acces: "api" as const };
    if (!value.ok) console.warn(`[bra] massif ${massifCode} : ${value.error ?? "bulletin illisible"}`);
    return value;
  } catch (err) {
    const reason = raisonReseau(err);
    console.warn(`[bra] massif ${massifCode} : API ${reason}`);
    return emptyBulletin(massifCode, { error: `Météo-France injoignable : ${reason}.`, acces: "api" });
  } finally {
    clearTimeout(timer);
  }
}

/* ── Archive publique ─────────────────────────────────────────────────── */

const index = new Map<string, { at: number; value: string }>();
const indexEnVol = new Map<string, Promise<string>>();

/** Un index de l'archive, partagé entre massifs et gardé vingt minutes. Un
 *  dossier absent (404) rend un index vide : c'est un jour sans bulletin. */
async function lireIndex(chemin: string, force: boolean): Promise<string> {
  const hit = index.get(chemin);
  if (!force && hit && Date.now() - hit.at < TTL_INDEX_MS) return hit.value;
  const vol = indexEnVol.get(chemin);
  if (vol) return vol;
  const p = (async () => {
    const { status, texte } = await lireTexte(`${ARCHIVE_BRA}/${chemin}${chemin ? "/" : ""}`, "text/html");
    if (status === 404) return "";
    if (status !== 200) throw new Error(`data.gouv.fr a renvoyé l’erreur ${status}`);
    index.set(chemin, { at: Date.now(), value: texte });
    return texte;
  })().finally(() => {
    if (indexEnVol.get(chemin) === p) indexEnVol.delete(chemin);
  });
  indexEnVol.set(chemin, p);
  return p;
}

/** Le jour du dernier bulletin déposé, tous massifs confondus : trois index,
 *  année, mois, jour. `null` si l'archive ne se laisse pas lire. */
async function dernierJourPublie(force: boolean): Promise<string | null> {
  try {
    const annee = lireSousDossiers(await lireIndex("", force)).filter((d) => d.length === 4).at(-1);
    if (!annee) return null;
    const mois = lireSousDossiers(await lireIndex(annee, force)).filter((d) => d.length === 2).at(-1);
    if (!mois) return null;
    const jour = lireSousDossiers(await lireIndex(`${annee}/${mois}`, force)).filter((d) => d.length === 2).at(-1);
    return jour ? `${annee}/${mois}/${jour}` : null;
  } catch {
    return null;
  }
}

/**
 * Le dernier bulletin d'un massif dans l'archive publique de data.gouv.fr.
 *
 * On lit l'index d'aujourd'hui, puis d'hier et d'avant-hier, et l'on prend le
 * fichier le plus récent du massif. Rien sur trois jours : hors saison, ou
 * archive en retard. On le dit avec la date du dernier dépôt, sans niveau de
 * risque : un bulletin échu depuis des semaines ne se montre pas comme celui
 * du jour.
 */
export async function lireArchive(massifCode: number, force = false, maintenant = new Date()): Promise<BraBulletin> {
  // `maintenant` se passe en essai, pour relire un jour de saison.
  let fichier: FichierBra | null = null;
  try {
    for (let j = 0; j < JOURS_CHERCHES && !fichier; j++) {
      const html = await lireIndex(`${cheminJour(maintenant, j)}/xml`, force);
      fichier = dernierDuMassif(lireIndexJour(html), massifCode);
    }
  } catch (err) {
    const reason = raisonReseau(err);
    console.warn(`[bra] massif ${massifCode} : archive ${reason}`);
    return emptyBulletin(massifCode, {
      error: `Archive publique de Météo-France injoignable (data.gouv.fr) : ${reason}.`,
      acces: "donnees-ouvertes",
    });
  }

  if (!fichier) {
    const dernier = await dernierJourPublie(force);
    const date = dernier ? jourLisible(dernier) : null;
    return emptyBulletin(massifCode, {
      ok: true,
      source: "meteofrance",
      acces: "donnees-ouvertes",
      message: date
        ? `Dernier bulletin publié en accès libre : ${date}. Météo-France émet le bulletin de début novembre à début juin.`
        : "Aucun bulletin publié en accès libre ces trois derniers jours. Météo-France émet le bulletin de début novembre à début juin.",
    });
  }

  try {
    const { status, texte } = await lireTexte(fichier.url, "application/xml");
    if (status !== 200) throw new Error(`HTTP ${status}`);
    // Le nom de fichier a désigné le massif ; l'attribut `ID` le confirme.
    const id = idMassif(texte);
    if (id !== massifCode) {
      console.warn(`[bra] massif ${massifCode} : ${fichier.url} porte l'identifiant ${id ?? "absent"}`);
      return emptyBulletin(massifCode, {
        error: `Le fichier de l’archive retenu pour ce massif en désigne un autre (${id ?? "sans identifiant"}).`,
        acces: "donnees-ouvertes",
      });
    }
    const value = { ...parseBulletin(massifCode, texte), acces: "donnees-ouvertes" as const };
    if (!value.ok) console.warn(`[bra] massif ${massifCode} : ${value.error ?? "bulletin illisible"} (${fichier.url})`);
    return value;
  } catch (err) {
    const reason = raisonReseau(err);
    console.warn(`[bra] massif ${massifCode} : ${fichier.url} ${reason}`);
    return emptyBulletin(massifCode, {
      error: `Bulletin de l’archive publique illisible : ${reason}.`,
      acces: "donnees-ouvertes",
    });
  }
}
