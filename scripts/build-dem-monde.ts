/**
 * L'altitude du point de référence de chaque domaine mondial.
 *
 *     node --experimental-strip-types scripts/build-dem-monde.ts
 *     node --experimental-strip-types scripts/build-dem-monde.ts --essai 200
 *
 * Écrit `src/lib/monde/data/dem.json`, **fichier distinct** du référentiel :
 * une altitude de modèle de terrain et les `minElevation`/`maxElevation`
 * d'OpenSkiMap ne mesurent pas la même chose, et les ranger dans le même
 * enregistrement les ferait passer pour deux valeurs du même relevé. C'est la
 * règle que l'audit pose pour `alt.ign.json`, tenue ici à l'identique.
 *
 * ## Ce que le point vaut, et ne vaut pas
 *
 * Le point relevé est `viewportHint.center` d'OpenSkiMap, celui sur lequel la
 * carte cadre. **Ce n'est ni le village, ni le sommet, ni le départ des
 * pistes** : c'est le centre d'une emprise. Son altitude est donc une
 * troisième chose, et `altBandsDomaine()` la range sous `pointM`, à part des
 * bornes du domaine.
 *
 * ## La politesse, et pourquoi elle n'est pas celle du dépôt
 *
 * `src/lib/scrape/politesse.ts` existe et sait faire la queue par hôte. Il
 * n'est pas réutilisé ici : il demande du `text/html` à des pages, et ce
 * relevé interroge une API d'altitudes ; le fichier est par ailleurs
 * verrouillé. L'en-tête ci-dessous est celui d'un navigateur, comme tout le
 * relevé (consigne du propriétaire, 24 septembre 2026).
 *
 * La cadence — une requête par seconde, cent points par requête — tient les
 * 5 720 domaines en moins d'une minute et reste très en deçà des limites
 * publiées par Open-Meteo pour son offre gratuite.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");

/** Cent est le maximum documenté par Open-Meteo pour ce point d'entrée. */
const PAR_REQUETE = 100;
const INTERVALLE_MS = 1_000;
const TIMEOUT_MS = 20_000;
const REESSAIS = 3;

/**
 * Un quota d'Open-Meteo, quel qu'il soit.
 *
 * Il y en a trois — à la minute, à l'heure, au jour — et aucun ne se réessaie
 * utilement : quinze secondes plus tard, ni l'heure ni le jour n'ont tourné.
 * Insister reviendrait à marteler un service qui vient de dire non.
 *
 * Le relevé s'arrête donc net, garde ce qu'il a, et laisse la reprise à
 * `--completer`, à qui elle ne coûte rien.
 *
 * **Cette classe n'a d'abord attrapé que « hourly », et c'était un piège.** Un
 * `429` journalier retombait alors dans la boucle de réessais, épuisait ses
 * trois tours et rendait des `null` **sans un mot** : cinq cents domaines sont
 * ressortis « interrogés sans réponse » alors que le service avait répondu, et
 * très clairement. Un refus qui ne se voit pas est pire qu'un refus.
 */
class QuotaAtteint extends Error {}

// Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Le service dit lui-même quand revenir — dans l'heure, ou demain. Le
 *  message ne le devine donc pas à sa place. */
function reprendre(): void {
  console.log("Quand le service le permettra de nouveau :");
  console.log("  node --experimental-strip-types scripts/build-dem-monde.ts --completer");
}

type Point = { id: string; lat: number; lon: number };

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function points(): Point[] {
  const out: Point[] = [];
  for (const f of readdirSync(DATA)) {
    if (!f.endsWith(".json") || f === "index.json" || f === "dem.json") continue;
    const fiches = JSON.parse(readFileSync(resolve(DATA, f), "utf8")) as Point[];
    for (const d of fiches) out.push({ id: d.id, lat: d.lat, lon: d.lon });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Un lot, avec réessais espacés.
 *
 * Un lot perdu rend un tableau de `null` plutôt que de faire tomber le
 * relevé : une altitude absente est une absence, qui se compte et se dit, et
 * non une raison de jeter les 5 700 autres.
 */
async function lot(pts: Point[]): Promise<(number | null)[]> {
  const lats = pts.map((p) => p.lat.toFixed(5)).join(",");
  const lons = pts.map((p) => p.lon.toFixed(5)).join(",");
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
  for (let essai = 1; essai <= REESSAIS; essai++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) {
        const raison = await res.text();
        throw new QuotaAtteint(raison.replace(/\s+/g, " ").slice(0, 160));
      }
      if (res.status >= 500) {
        await dormir(5_000 * essai);
        continue;
      }
      if (!res.ok) {
        console.error(`  HTTP ${res.status} sur un lot de ${pts.length}`);
        return pts.map(() => null);
      }
      const data = (await res.json()) as { elevation?: number[] };
      const els = data.elevation ?? [];
      return pts.map((_, i) => {
        const n = els[i];
        return n != null && Number.isFinite(n) ? Math.round(n) : null;
      });
    } catch (err) {
      if (err instanceof QuotaAtteint) throw err;
      const quoi = err instanceof Error ? err.message : String(err);
      console.error(`  essai ${essai}/${REESSAIS} : ${quoi}`);
      await dormir(5_000 * essai);
    }
  }
  console.error(`  lot de ${pts.length} abandonné après ${REESSAIS} essais`);
  return pts.map(() => null);
}

/** Ce qui a déjà été relevé, pour ne pas le redemander. */
function deja(): Record<string, number> {
  try {
    const d = JSON.parse(readFileSync(resolve(DATA, "dem.json"), "utf8")) as {
      points?: Record<string, number>;
    };
    return d.points ?? {};
  } catch {
    return {};
  }
}

async function main(): Promise<number> {
  const arg = process.argv.indexOf("--essai");
  // `--completer` ne redemande que ce qui manque, par lots plus petits et plus
  // espacés. Un passage complet en perd environ un sur six : le service bride
  // au-delà d'une certaine cadence, et insister au même rythme reperdrait les
  // mêmes. Relancé jusqu'à ce qu'il ne reste rien, il finit le travail sans
  // jamais redemander une altitude déjà obtenue.
  const completer = process.argv.includes("--completer");
  const tous = points();
  const acquis = completer ? deja() : {};
  const restants = completer ? tous.filter((p) => acquis[p.id] == null) : tous;
  const pts = arg > 0 ? restants.slice(0, Number(process.argv[arg + 1] ?? 200)) : restants;
  const taille = completer ? 50 : PAR_REQUETE;
  const pause = completer ? 3_000 : INTERVALLE_MS;
  if (completer) console.log(`${Object.keys(acquis).length} déjà là, non redemandés.`);
  console.log(`${pts.length} domaines à relever, par lots de ${taille}.`);

  const releves: Record<string, number> = { ...acquis };
  let manquants = 0;
  let quota = false;
  const debut = Date.now();

  for (let i = 0; i < pts.length; i += taille) {
    const tranche = pts.slice(i, i + taille);
    if (i > 0) await dormir(pause);
    let valeurs: (number | null)[];
    try {
      valeurs = await lot(tranche);
    } catch (err) {
      if (!(err instanceof QuotaAtteint)) throw err;
      console.log("");
      console.log(`  arrêté par le service : ${err.message}`);
      quota = true;
      break;
    }
    tranche.forEach((p, k) => {
      const m = valeurs[k];
      if (m == null) manquants++;
      else releves[p.id] = m;
    });
    const fait = Math.min(i + taille, pts.length);
    process.stdout.write(`\r  ${fait}/${pts.length}`);
  }
  console.log();

  const secondes = Math.round((Date.now() - debut) / 1000);
  const gagnes = Object.keys(releves).length - Object.keys(acquis).length;
  if (completer && gagnes === 0) {
    // Réécrire le fichier daterait d'aujourd'hui un relevé qui n'a rien
    // rapporté. La date dit quand les altitudes ont été prises, pas quand on a
    // essayé.
    console.log("Aucune altitude nouvelle : le fichier n'est pas réécrit.");
    if (quota) reprendre();
    return 0;
  }

  const sortie = {
    releve: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    source: "https://api.open-meteo.com/v1/elevation",
    // Open-Meteo sert Copernicus DEM GLO-90. Le nom est écrit ici pour que
    // l'écran puisse dire d'où vient le chiffre, comme il dit « IGN au pin ».
    modele: "Copernicus DEM GLO-90",
    point: "viewportHint.center d'OpenSkiMap — ni village, ni sommet",
    domaines: Object.keys(releves).length,
    manquants,
    points: releves,
  };
  writeFileSync(
    resolve(DATA, "dem.json"),
    JSON.stringify(sortie, null, 1).replace(/\n\s+(-?\d+)/g, " $1") + "\n",
    "utf8",
  );

  console.log(`${Object.keys(releves).length} altitudes relevées en ${secondes} s.`);
  if (quota) {
    const reste = tous.length - Object.keys(releves).length;
    console.log(`${reste} domaines non relevés.`);
    reprendre();
  }
  if (manquants) console.log(`${manquants} domaines interrogés sans réponse : absence, et non zéro.`);
  const vals = Object.values(releves);
  vals.sort((a, b) => a - b);
  console.log(`De ${vals[0]} m à ${vals[vals.length - 1]} m, médiane ${vals[vals.length >> 1]} m.`);
  return 0;
}

// Pas de `process.exit()` : sous Windows, il fait tomber libuv sur une
// assertion quand des poignées réseau se ferment encore. Le code de sortie
// suffit, et le processus s'arrête de lui-même.
main().then((c) => {
  process.exitCode = c;
});
