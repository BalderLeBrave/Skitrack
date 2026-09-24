/**
 * Les adresses de photos répondent-elles vraiment ?
 *
 *     node --experimental-strip-types scripts/verifier-photos.ts
 *
 * Complète `src/lib/monde/data/sitesOfficiels.json` d'un champ `servi` par
 * fiche, et n'écrit rien d'autre.
 *
 * ## Pourquoi ce contrôle existe
 *
 * Cinquante-deux photos relevées chez Skiinfo pointaient vers
 * `img1` à `img5.onthesnow.com`, dont le chemin `/image/…` ne répond pas —
 * délai dépassé en HTTPS comme en HTTP, alors que la racine du même hôte rend
 * un 404 normal. Elles auraient donné cinquante-deux images cassées à
 * l'écran ; le contrôle les a écartées.
 *
 * Les photos des sites officiels viennent de **neuf cents hôtes différents**,
 * dont aucun n'a été mesuré. Les déclarer servies sans vérifier reviendrait à
 * refaire exactement l'erreur que le cas `onthesnow` a révélée, en neuf cents
 * exemplaires.
 *
 * ## Ce que le contrôle vérifie, et ce qu'il ne vérifie pas
 *
 * Il demande les **premiers octets** de l'image — `Range: bytes=0-0` — et
 * regarde le code et le type de contenu. Il vérifie donc que l'adresse rend
 * une image, pas que cette image montre la station : cela, seul un œil le
 * dirait, et le relevé ne le prétend pas.
 *
 * `HEAD` aurait suffi en théorie ; en pratique trop d'hébergeurs le refusent
 * ou le traitent mal, et un `GET` d'un octet coûte moins qu'un faux négatif.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const FICHIER = resolve(DATA, "sitesOfficiels.json");

const INTERVALLE_MS = 800;
const TIMEOUT_MS = 15_000;

// Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Trouve = {
  id: string;
  photo: string | null;
  servi?: boolean;
  typeImage?: string | null;
};

type Sortie = {
  fiches: Record<string, Trouve>;
  [k: string]: unknown;
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sortie = JSON.parse(readFileSync(FICHIER, "utf8")) as Sortie;
const aVerifier = Object.values(sortie.fiches).filter((f) => f.photo && f.servi === undefined);

console.log(`Photos à contrôler : ${aVerifier.length}`);
console.log(`Durée attendue     : ${Math.round((aVerifier.length * INTERVALLE_MS) / 60000)} minutes.\n`);

let servies = 0;
let faites = 0;

for (const f of aVerifier) {
  let ok = false;
  let type: string | null = null;
  try {
    const res = await fetch(f.photo!, {
      headers: { "user-agent": UA, range: "bytes=0-0", accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    type = res.headers.get("content-type");
    // 206 est la réponse attendue à une plage ; 200 convient aussi, l'hôte
    // ayant simplement ignoré l'en-tête `Range`.
    ok = (res.status === 200 || res.status === 206) && !!type && type.startsWith("image/");
    await res.body?.cancel();
  } catch {
    ok = false;
  }
  f.servi = ok;
  f.typeImage = type;
  if (ok) servies++;
  faites++;
  await dormir(INTERVALLE_MS);
  if (faites % 50 === 0) {
    writeFileSync(FICHIER, JSON.stringify(sortie, null, 1) + "\n", "utf8");
    console.log(`  ${faites}/${aVerifier.length} — ${servies} servies`);
  }
}

writeFileSync(FICHIER, JSON.stringify(sortie, null, 1) + "\n", "utf8");

const total = Object.values(sortie.fiches).filter((f) => f.photo).length;
const ok = Object.values(sortie.fiches).filter((f) => f.photo && f.servi).length;
console.log(`\nContrôlées : ${faites}`);
console.log(`Photos qui répondent : ${ok} sur ${total}`);
console.log(`Écartées             : ${total - ok}`);
